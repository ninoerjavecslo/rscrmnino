import { useEffect, useMemo, useState } from 'react'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { usePipelineStore } from '../stores/pipeline'
import { useClientsStore } from '../stores/clients'
import type { RevenuePlanner, PipelineItem } from '../lib/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtEuro(n?: number | null) {
  if (!n) return '—'
  return n.toLocaleString('en-EU') + ' €'
}

function fmtMonthLabel(m: string) {
  const dt = new Date(m + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function getNextMonths(count: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  }
  return months
}

function getPastAndFutureMonths(): string[] {
  const months: string[] = []
  const now = new Date()
  // 3 months back + 8 months forward = 11 months
  for (let i = -3; i <= 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  }
  return months
}

function pipelineDealTotal(item: PipelineItem): number {
  if (item.deal_type === 'fixed' && item.monthly_schedule?.length) {
    return item.monthly_schedule.reduce((s, r) => s + r.amount, 0)
  }
  const amt = item.estimated_amount ?? 0
  if (item.deal_type === 'monthly' && item.expected_month && item.expected_end_month) {
    const s = new Date(item.expected_month + 'T00:00:00')
    const e = new Date(item.expected_end_month + 'T00:00:00')
    const months = Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1)
    return amt * months
  }
  return amt
}

// ── component ─────────────────────────────────────────────────────────────────

export function ForecastView() {
  const rpStore = useRevenuePlannerStore()
  const plStore = usePipelineStore()
  const cStore = useClientsStore()

  const [showMonths] = useState(6)

  const months = useMemo(() => getNextMonths(showMonths), [showMonths])
  const loadMonths = useMemo(() => getPastAndFutureMonths(), [])

  useEffect(() => {
    rpStore.fetchByMonths(loadMonths)
    plStore.fetchAll()
    cStore.fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── confirmed rows (revenue_planner, future months) ─────────────────────
  const confirmedRows = useMemo(() =>
    rpStore.rows.filter(r =>
      months.includes(r.month) &&
      (r.status === 'planned' || r.status === 'issued' || r.status === 'paid' || r.status === 'retainer')
    ),
    [rpStore.rows, months]
  )

  // ── pipeline items (active: not won/lost) ─────────────────────────────────
  const activePipeline = useMemo(() =>
    plStore.items.filter(i => i.status !== 'won' && i.status !== 'lost'),
    [plStore.items]
  )

  // ── per-month aggregations ────────────────────────────────────────────────
  const confirmedByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of confirmedRows) {
      map.set(r.month, (map.get(r.month) ?? 0) + (r.planned_amount ?? 0))
    }
    return map
  }, [confirmedRows])

  const pipelineByMonth = useMemo(() => {
    const map = new Map<string, { items: PipelineItem[]; total: number; weighted: number }>()
    for (const item of activePipeline) {
      const prob = item.probability / 100
      if (item.deal_type === 'fixed' && item.monthly_schedule?.length) {
        for (const row of item.monthly_schedule) {
          const key = row.month.slice(0, 10)
          if (!map.has(key)) map.set(key, { items: [], total: 0, weighted: 0 })
          const g = map.get(key)!
          if (!g.items.includes(item)) g.items.push(item)
          g.total += row.amount
          g.weighted += row.amount * prob
        }
      } else if (item.deal_type === 'monthly' && item.expected_month && item.expected_end_month) {
        const amt = item.estimated_amount ?? 0
        const s = new Date(item.expected_month + 'T00:00:00')
        const e = new Date(item.expected_end_month + 'T00:00:00')
        const cur = new Date(s)
        while (cur <= e) {
          const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-01`
          if (!map.has(key)) map.set(key, { items: [], total: 0, weighted: 0 })
          const g = map.get(key)!
          if (!g.items.includes(item)) g.items.push(item)
          g.total += amt
          g.weighted += amt * prob
          cur.setMonth(cur.getMonth() + 1)
        }
      } else {
        const key = item.expected_month ?? 'unscheduled'
        if (!map.has(key)) map.set(key, { items: [], total: 0, weighted: 0 })
        const g = map.get(key)!
        g.items.push(item)
        const amt = item.estimated_amount ?? 0
        g.total += amt
        g.weighted += amt * prob
      }
    }
    return map
  }, [activePipeline])

  // ── totals ────────────────────────────────────────────────────────────────
  const totalConfirmed = months.reduce((s, m) => s + (confirmedByMonth.get(m) ?? 0), 0)
  const totalPipelineWeighted = activePipeline.reduce((s, i) => s + pipelineDealTotal(i) * i.probability / 100, 0)
  const totalPipelineFace = activePipeline.reduce((s, i) => s + pipelineDealTotal(i), 0)
  const wonThisYear = plStore.items.filter(i => i.status === 'won').reduce((s, i) => s + pipelineDealTotal(i), 0)

  // ── group confirmed rows by source ────────────────────────────────────────
  function getRowSource(r: RevenuePlanner): string {
    if (r.maintenance_id) return r.maintenance?.name ?? 'Maintenance'
    if (r.hosting_client_id) return r.hosting?.description ?? 'Hosting'
    if (r.domain_id) return r.domain?.domain_name ?? 'Domain'
    return r.project?.name ?? 'Project'
  }
  function getRowType(r: RevenuePlanner): string {
    if (r.maintenance_id) return 'Maintenance'
    if (r.hosting_client_id) return 'Hosting'
    if (r.domain_id) return 'Domain'
    return 'Project'
  }
  function getRowTypeBadge(r: RevenuePlanner) {
    if (r.maintenance_id) return <span className="badge badge-amber" style={{ fontSize: 10 }}>Maintenance</span>
    if (r.hosting_client_id) return <span className="badge badge-blue" style={{ fontSize: 10 }}>Hosting</span>
    if (r.domain_id) return <span className="badge" style={{ background: 'var(--navy)', color: '#fff', fontSize: 10 }}>Domain</span>
    return <span className="badge badge-gray" style={{ fontSize: 10 }}>Project</span>
  }
  function getPipelineClientName(item: PipelineItem): string {
    return item.client?.name ?? cStore.clients.find(c => c.id === item.client_id)?.name ?? item.company_name ?? '—'
  }

  // Unique confirmed sources
  type SourceKey = string
  const confirmedSources = useMemo(() => {
    const map = new Map<SourceKey, { rows: RevenuePlanner[]; type: string; label: string }>()
    for (const r of confirmedRows) {
      const key = r.maintenance_id ?? r.hosting_client_id ?? r.domain_id ?? r.project_id ?? r.id
      if (!map.has(key)) {
        map.set(key, { rows: [], type: getRowType(r), label: getRowSource(r) })
      }
      map.get(key)!.rows.push(r)
    }
    return [...map.entries()]
  }, [confirmedRows])

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Forecast</h1>
          <p>Revenue forecast combining confirmed plans with pipeline probability</p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card" style={{ '--left-color': 'var(--navy)' } as React.CSSProperties}>
          <div className="stat-card-label">CONFIRMED (NEXT {showMonths} MO)</div>
          <div className="stat-card-value" style={{ color: 'var(--navy)' }}>{totalConfirmed > 0 ? fmtEuro(totalConfirmed) : '—'}</div>
          <div className="stat-card-sub">planned + issued + retainer</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--amber, #d97706)' } as React.CSSProperties}>
          <div className="stat-card-label">PIPELINE WEIGHTED</div>
          <div className="stat-card-value" style={{ color: 'var(--amber, #d97706)' }}>{totalPipelineWeighted > 0 ? fmtEuro(Math.round(totalPipelineWeighted)) : '—'}</div>
          <div className="stat-card-sub">probability-adjusted</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--green)' } as React.CSSProperties}>
          <div className="stat-card-label">BEST CASE</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>{fmtEuro(Math.round(totalConfirmed + totalPipelineFace))}</div>
          <div className="stat-card-sub">confirmed + all pipeline</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--green)' } as React.CSSProperties}>
          <div className="stat-card-label">WON PIPELINE</div>
          <div className="stat-card-value">{wonThisYear > 0 ? fmtEuro(wonThisYear) : '—'}</div>
          <div className="stat-card-sub">deals closed</div>
        </div>
      </div>

      <div className="page-content">

        {/* Monthly summary bar */}
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Monthly Overview</h2>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 140 }}>MONTH</th>
                <th className="th-right">CONFIRMED</th>
                <th className="th-right">PIPELINE WEIGHTED</th>
                <th className="th-right">TOTAL FORECAST</th>
              </tr>
            </thead>
            <tbody>
              {months.map(m => {
                const confirmed = confirmedByMonth.get(m) ?? 0
                const pipe = pipelineByMonth.get(m)?.weighted ?? 0
                const total = confirmed + pipe
                return (
                  <tr key={m}>
                    <td style={{ fontWeight: 600 }}>{fmtMonthLabel(m)}</td>
                    <td className="td-right text-mono" style={{ color: 'var(--navy)', fontWeight: 600 }}>{confirmed > 0 ? fmtEuro(confirmed) : <span style={{ color: 'var(--c5)' }}>—</span>}</td>
                    <td className="td-right text-mono" style={{ color: 'var(--amber, #d97706)', fontWeight: 600 }}>{pipe > 0 ? fmtEuro(Math.round(pipe)) : <span style={{ color: 'var(--c5)' }}>—</span>}</td>
                    <td className="td-right text-mono" style={{ fontWeight: 800, fontSize: 15 }}>{total > 0 ? fmtEuro(Math.round(total)) : <span style={{ color: 'var(--c5)' }}>—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                <td style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</td>
                <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmtEuro(totalConfirmed)}</td>
                <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--amber, #d97706)' }}>{fmtEuro(Math.round(totalPipelineWeighted))}</td>
                <td className="td-right text-mono" style={{ fontWeight: 800, fontSize: 15 }}>{fmtEuro(Math.round(totalConfirmed + totalPipelineWeighted))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Confirmed section */}
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--navy)', display: 'inline-block' }} />
              Confirmed Revenue
            </span>
          </h2>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          {confirmedSources.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>No confirmed revenue planned in the next {showMonths} months.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>SOURCE</th>
                  <th style={{ width: 120 }}>TYPE</th>
                  {months.map(m => (
                    <th key={m} className="th-right" style={{ width: 110 }}>{fmtMonthLabel(m)}</th>
                  ))}
                  <th className="th-right" style={{ width: 120 }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {confirmedSources.map(([key, { rows, label }]) => {
                  const byMonth = new Map<string, number>()
                  for (const r of rows) {
                    byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + (r.planned_amount ?? 0))
                  }
                  const sourceTotal = rows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
                  return (
                    <tr key={key}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{label}</td>
                      <td>{getRowTypeBadge(rows[0])}</td>
                      {months.map(m => (
                        <td key={m} className="td-right text-mono" style={{ fontSize: 13, color: byMonth.has(m) ? 'var(--navy)' : 'var(--c5)' }}>
                          {byMonth.has(m) ? fmtEuro(byMonth.get(m)) : '—'}
                        </td>
                      ))}
                      <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmtEuro(sourceTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                  <td colSpan={2} style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Confirmed total</td>
                  {months.map(m => (
                    <td key={m} className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>
                      {(confirmedByMonth.get(m) ?? 0) > 0 ? fmtEuro(confirmedByMonth.get(m)) : '—'}
                    </td>
                  ))}
                  <td className="td-right text-mono" style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 14 }}>{fmtEuro(totalConfirmed)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Pipeline section */}
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--amber, #d97706)', display: 'inline-block' }} />
              Pipeline
            </span>
          </h2>
        </div>
        <div className="card">
          {activePipeline.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>No active pipeline items. Add prospects and proposals from the client page.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>CLIENT</th>
                  <th>TITLE</th>
                  <th style={{ width: 110 }}>STATUS</th>
                  <th style={{ width: 80 }}>PROB.</th>
                  <th className="th-right" style={{ width: 120 }}>AMOUNT</th>
                  <th className="th-right" style={{ width: 120 }}>WEIGHTED</th>
                  <th style={{ width: 120 }}>EXPECTED</th>
                </tr>
              </thead>
              <tbody>
                {activePipeline
                  .sort((a, b) => (a.expected_month ?? 'zzzz').localeCompare(b.expected_month ?? 'zzzz'))
                  .map((item: PipelineItem) => {
                    const faceVal = pipelineDealTotal(item)
                    const weighted = faceVal * item.probability / 100
                    return (
                      <tr key={item.id}>
                        <td style={{ fontSize: 13, fontWeight: 600 }}>{getPipelineClientName(item)}</td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                          {item.description && <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 2 }}>{item.description}</div>}
                        </td>
                        <td>
                          <span className={`badge ${
                            item.status === 'proposal' ? 'badge-amber'
                            : item.status === 'won' ? 'badge-green'
                            : item.status === 'lost' ? 'badge-red'
                            : 'badge-gray'
                          }`} style={{ fontSize: 11 }}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div style={{ flex: 1, height: 4, background: 'var(--c6)', borderRadius: 2, minWidth: 40 }}>
                              <div style={{ width: `${item.probability}%`, height: '100%', background: 'var(--amber, #d97706)', borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c2)' }}>{item.probability}%</span>
                          </div>
                        </td>
                        <td className="td-right text-mono" style={{ fontWeight: 600, fontSize: 13 }}>{fmtEuro(faceVal)}</td>
                        <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--amber, #d97706)', fontSize: 13 }}>{fmtEuro(Math.round(weighted))}</td>
                        <td style={{ fontSize: 13, color: 'var(--c2)' }}>
                          {item.expected_month ? fmtMonthLabel(item.expected_month) : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                  <td colSpan={4} style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pipeline total</td>
                  <td className="td-right text-mono" style={{ fontWeight: 700 }}>{fmtEuro(totalPipelineFace)}</td>
                  <td className="td-right text-mono" style={{ fontWeight: 800, color: 'var(--amber, #d97706)', fontSize: 14 }}>{fmtEuro(Math.round(totalPipelineWeighted))}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
