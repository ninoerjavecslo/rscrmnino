import React, { useEffect, useMemo, useState } from 'react'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { usePipelineStore } from '../stores/pipeline'
import { useClientsStore } from '../stores/clients'
import { useInfraStore } from '../stores/infrastructure'
import type { PipelineItem } from '../lib/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtEuro(n?: number | null) {
  if (!n) return '—'
  return n.toLocaleString('en-EU') + ' €'
}

function fmtMonthLabel(m: string) {
  const dt = new Date(m + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function getYearMonths(year: number): string[] {
  const months: string[] = []
  for (let m = 1; m <= 12; m++) {
    months.push(`${year}-${String(m).padStart(2, '0')}-01`)
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
    const count = Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1)
    return amt * count
  }
  return amt
}

function pipelineAmountInMonth(item: PipelineItem, month: string): number {
  if (item.deal_type === 'fixed' && item.monthly_schedule?.length) {
    return item.monthly_schedule.find(r => r.month.slice(0, 10) === month)?.amount ?? 0
  }
  if (item.deal_type === 'monthly' && item.expected_month && item.expected_end_month) {
    const s = new Date(item.expected_month + 'T00:00:00')
    const e = new Date(item.expected_end_month + 'T00:00:00')
    const cur = new Date(month + 'T00:00:00')
    return cur >= s && cur <= e ? (item.estimated_amount ?? 0) : 0
  }
  return item.expected_month === month ? (item.estimated_amount ?? 0) : 0
}

function probColor(p: number) {
  return p >= 100 ? 'var(--green)' : p >= 50 ? '#d97706' : '#ea580c'
}

// ── component ─────────────────────────────────────────────────────────────────

export function ForecastView() {
  const rpStore = useRevenuePlannerStore()
  const plStore = usePipelineStore()
  const cStore = useClientsStore()
  const infraStore = useInfraStore()

  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const months = useMemo(() => getYearMonths(year), [year])
  const loadMonths = useMemo(() => getYearMonths(year), [year])

  useEffect(() => {
    rpStore.fetchByMonths(loadMonths)
    plStore.fetchAll()
    cStore.fetchAll()
    infraStore.fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── confirmed rows ─────────────────────────────────────────────────────────
  const confirmedRows = useMemo(() =>
    rpStore.rows.filter(r =>
      months.includes(r.month) &&
      (r.status === 'planned' || r.status === 'issued' || r.status === 'paid' || r.status === 'retainer')
    ),
    [rpStore.rows, months]
  )

  // Amount to use for a revenue_planner row in forecast:
  // - issued/paid → actual_amount (or planned as fallback)
  // - planned/retainer in past month → 0 (not yet invoiced)
  // - planned/retainer in current or future month → planned_amount (forecast)
  const today = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  function rowForecastAmount(r: { status: string; month: string; planned_amount?: number | null; actual_amount?: number | null }): number {
    if (r.status === 'issued' || r.status === 'paid') return r.actual_amount ?? r.planned_amount ?? 0
    if (r.status === 'deferred') return 0
    if (r.month <= currentMonth) return 0
    return r.planned_amount ?? 0
  }

  // ── group by client (project + maintenance rows) ───────────────────────────
  const clientRows = useMemo(() => {
    const map = new Map<string, { name: string; byMonth: Map<string, number> }>()
    for (const r of confirmedRows) {
      if (r.hosting_client_id || r.domain_id) continue
      let clientId: string | undefined
      let clientName: string | undefined
      if (r.maintenance_id) {
        clientId = r.maintenance?.client?.id
        clientName = r.maintenance?.client?.name
      } else if (r.project_id) {
        clientId = r.project?.client_id ?? undefined
        clientName = clientId ? cStore.clients.find(c => c.id === clientId)?.name : undefined
      }
      if (!clientId) continue
      if (!map.has(clientId)) map.set(clientId, { name: clientName ?? '—', byMonth: new Map() })
      const entry = map.get(clientId)!
      entry.byMonth.set(r.month, (entry.byMonth.get(r.month) ?? 0) + rowForecastAmount(r))
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))
  }, [confirmedRows, cStore.clients])

  // ── hosting aggregate — from infraStore (authoritative) ───────────────────
  // Monthly hosting: same amount every month
  // Yearly hosting: show in the month of next_invoice_date (if within range)
  const hostingByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of months) {
      let amt = 0
      for (const h of infraStore.hostingClients) {
        if (h.status !== 'active') continue
        // Stop at contract expiry
        if (h.contract_expiry && m > h.contract_expiry) continue
        if (h.cycle === 'monthly') {
          amt += h.amount
        }
        // yearly handled via revenue_planner rows below
      }
      if (amt > 0) map.set(m, amt)
    }
    return map
  }, [months, infraStore.hostingClients])

  // ── domains aggregate ──────────────────────────────────────────────────────
  const domainsByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of confirmedRows.filter(r => r.domain_id)) {
      map.set(r.month, (map.get(r.month) ?? 0) + rowForecastAmount(r))
    }
    return map
  }, [confirmedRows])

  // ── confirmed total per month (project + maintenance + domains; monthly hosting from infra; yearly hosting from revenue_planner) ──
  const confirmedByMonth = useMemo(() => {
    const map = new Map<string, number>()
    // project + maintenance + domain rows + yearly hosting rows from revenue_planner
    for (const r of confirmedRows) {
      if (r.hosting_client_id) {
        const h = infraStore.hostingClients.find(h => h.id === r.hosting_client_id)
        if (h?.cycle !== 'yearly') continue  // monthly hosting handled via hostingByMonth
      }
      map.set(r.month, (map.get(r.month) ?? 0) + rowForecastAmount(r))
    }
    // monthly hosting from infra
    for (const [m, amt] of hostingByMonth) {
      map.set(m, (map.get(m) ?? 0) + amt)
    }
    return map
  }, [confirmedRows, hostingByMonth, infraStore.hostingClients])

  // ── pipeline ───────────────────────────────────────────────────────────────
  const activePipeline = useMemo(() =>
    plStore.items
      .filter(i => i.status !== 'won' && i.status !== 'lost')
      .sort((a, b) => (a.expected_month ?? 'zzzz').localeCompare(b.expected_month ?? 'zzzz')),
    [plStore.items]
  )

  const pipelineFaceByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of activePipeline) {
      for (const m of months) {
        const amt = pipelineAmountInMonth(item, m)
        if (amt > 0) map.set(m, (map.get(m) ?? 0) + amt)
      }
    }
    return map
  }, [activePipeline, months])

  function getPipelineClientName(item: PipelineItem): string {
    return item.client?.name ?? cStore.clients.find(c => c.id === item.client_id)?.name ?? item.company_name ?? '—'
  }

  // ── stats ──────────────────────────────────────────────────────────────────
  const totalConfirmed = months.reduce((s, m) => s + (confirmedByMonth.get(m) ?? 0), 0)
  const totalPipelineFace = activePipeline.reduce((s, i) => s + pipelineDealTotal(i), 0)
  const totalBestCase = totalConfirmed + totalPipelineFace
  const totalLikely = totalConfirmed + activePipeline.filter(i => i.probability >= 50).reduce((s, i) => s + pipelineDealTotal(i), 0)

  const sectionHeaderStyle: React.CSSProperties = {
    fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '6px 12px'
  }
  const subTotalRowStyle: React.CSSProperties = {
    background: 'var(--c7)', borderTop: '2px solid var(--c6)'
  }
  const subTotalLabelStyle: React.CSSProperties = {
    fontWeight: 700, fontSize: 12, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.5px'
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Forecast</h1>
          <p>Confirmed plans + sales pipeline — {year}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y - 1)}>← {year - 1}</button>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', minWidth: 40, textAlign: 'center' }}>{year}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y + 1)}>{year + 1} →</button>
        </div>
      </div>

      <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card" style={{ '--left-color': 'var(--navy)' } as React.CSSProperties}>
          <div className="stat-card-label">CONFIRMED {year}</div>
          <div className="stat-card-value" style={{ color: 'var(--navy)' }}>{totalConfirmed > 0 ? fmtEuro(totalConfirmed) : '—'}</div>
          <div className="stat-card-sub">planned + issued + retainer</div>
        </div>
        <div className="stat-card" style={{ '--left-color': '#d97706' } as React.CSSProperties}>
          <div className="stat-card-label">PIPELINE</div>
          <div className="stat-card-value" style={{ color: '#d97706' }}>{totalPipelineFace > 0 ? fmtEuro(totalPipelineFace) : '—'}</div>
          <div className="stat-card-sub">{activePipeline.length} active deals, face value</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--green)' } as React.CSSProperties}>
          <div className="stat-card-label">BEST CASE</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>{fmtEuro(totalBestCase)}</div>
          <div className="stat-card-sub">confirmed + all sales</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--blue)' } as React.CSSProperties}>
          <div className="stat-card-label">LIKELY</div>
          <div className="stat-card-value" style={{ color: 'var(--blue)' }}>{fmtEuro(totalLikely)}</div>
          <div className="stat-card-sub">confirmed + ≥50% chance sales</div>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <table className="no-row-hover">
            <thead>
              <tr>
                <th style={{ width: 200 }}>CLIENT / SOURCE</th>
                {months.map(m => (
                  <th key={m} className="th-right" style={{ width: 110 }}>{fmtMonthLabel(m)}</th>
                ))}
                <th className="th-right" style={{ width: 120 }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>

              {/* ── Confirmed section header ── */}
              <tr style={{ background: 'var(--navy)' }}>
                <td colSpan={months.length + 2} style={{ ...sectionHeaderStyle, color: '#fff' }}>
                  Confirmed Revenue
                </td>
              </tr>

              {/* Per-client rows */}
              {clientRows.length === 0 && hostingByMonth.size === 0 && domainsByMonth.size === 0 && (
                <tr>
                  <td colSpan={months.length + 2} style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
                    No confirmed revenue planned for {year}.
                  </td>
                </tr>
              )}

              {clientRows.map(([clientId, { name, byMonth }]) => {
                const rowTotal = [...byMonth.values()].reduce((s, v) => s + v, 0)
                return (
                  <tr key={clientId}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{name}</td>
                    {months.map(m => (
                      <td key={m} className="td-right text-mono" style={{ fontSize: 13, color: byMonth.has(m) ? 'var(--navy)' : 'var(--c5)' }}>
                        {byMonth.has(m) ? fmtEuro(byMonth.get(m)) : '—'}
                      </td>
                    ))}
                    <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmtEuro(rowTotal)}</td>
                  </tr>
                )
              })}

              {/* Hosting aggregate row */}
              {hostingByMonth.size > 0 && (
                <tr>
                  <td style={{ fontSize: 13 }}>
                    <span className="badge badge-blue" style={{ fontSize: 10 }}>Hosting</span>
                    <span style={{ marginLeft: 6, color: 'var(--c2)' }}>All clients</span>
                  </td>
                  {months.map(m => (
                    <td key={m} className="td-right text-mono" style={{ fontSize: 13, color: hostingByMonth.has(m) ? 'var(--navy)' : 'var(--c5)' }}>
                      {hostingByMonth.has(m) ? fmtEuro(hostingByMonth.get(m)) : '—'}
                    </td>
                  ))}
                  <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>
                    {fmtEuro([...hostingByMonth.values()].reduce((s, v) => s + v, 0))}
                  </td>
                </tr>
              )}

              {/* Domains aggregate row */}
              {domainsByMonth.size > 0 && (
                <tr>
                  <td style={{ fontSize: 13 }}>
                    <span className="badge" style={{ background: 'var(--navy)', color: '#fff', fontSize: 10 }}>Domain</span>
                    <span style={{ marginLeft: 6, color: 'var(--c2)' }}>All renewals</span>
                  </td>
                  {months.map(m => (
                    <td key={m} className="td-right text-mono" style={{ fontSize: 13, color: domainsByMonth.has(m) ? 'var(--navy)' : 'var(--c5)' }}>
                      {domainsByMonth.has(m) ? fmtEuro(domainsByMonth.get(m)) : '—'}
                    </td>
                  ))}
                  <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>
                    {fmtEuro([...domainsByMonth.values()].reduce((s, v) => s + v, 0))}
                  </td>
                </tr>
              )}

              {/* Confirmed sub-total */}
              <tr style={subTotalRowStyle}>
                <td style={subTotalLabelStyle}>Confirmed Total</td>
                {months.map(m => (
                  <td key={m} className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>
                    {(confirmedByMonth.get(m) ?? 0) > 0 ? fmtEuro(confirmedByMonth.get(m)) : '—'}
                  </td>
                ))}
                <td className="td-right text-mono" style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 14 }}>{fmtEuro(totalConfirmed)}</td>
              </tr>

              {/* ── Pipeline section header ── */}
              <tr style={{ background: '#92400e' }}>
                <td colSpan={months.length + 2} style={{ ...sectionHeaderStyle, color: '#fff' }}>
                  Pipeline
                </td>
              </tr>

              {activePipeline.length === 0 && (
                <tr>
                  <td colSpan={months.length + 2} style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
                    No active pipeline items. Add prospects from the client page.
                  </td>
                </tr>
              )}

              {activePipeline.map(item => {
                const faceTotal = pipelineDealTotal(item)
                const clientName = getPipelineClientName(item)
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{clientName}</div>
                      <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 1 }}>{item.title}</div>
                    </td>
                    {months.map(m => {
                      const amt = pipelineAmountInMonth(item, m)
                      return (
                        <td key={m} className="td-right" style={{ fontSize: 13 }}>
                          {amt > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                              <span className="text-mono" style={{ fontWeight: 600, color: '#d97706' }}>{fmtEuro(amt)}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: probColor(item.probability) }}>{item.probability}%</span>
                            </div>
                          ) : <span style={{ color: 'var(--c5)' }}>—</span>}
                        </td>
                      )
                    })}
                    <td className="td-right text-mono" style={{ fontWeight: 700, color: '#d97706' }}>{fmtEuro(faceTotal)}</td>
                  </tr>
                )
              })}

              {/* Pipeline sub-total (face value) */}
              {activePipeline.length > 0 && (
                <tr style={subTotalRowStyle}>
                  <td style={{ ...subTotalLabelStyle, color: '#d97706' }}>Pipeline Total</td>
                  {months.map(m => (
                    <td key={m} className="td-right text-mono" style={{ fontWeight: 700, color: '#d97706' }}>
                      {(pipelineFaceByMonth.get(m) ?? 0) > 0 ? fmtEuro(pipelineFaceByMonth.get(m)!) : '—'}
                    </td>
                  ))}
                  <td className="td-right text-mono" style={{ fontWeight: 800, color: '#d97706', fontSize: 14 }}>
                    {fmtEuro(totalPipelineFace)}
                  </td>
                </tr>
              )}

              {/* Grand total */}
              <tr style={{ background: 'var(--navy)', borderTop: '2px solid var(--navy)' }}>
                <td style={{ ...sectionHeaderStyle, color: '#fff', fontSize: 12 }}>Grand Total</td>
                {months.map(m => {
                  const total = (confirmedByMonth.get(m) ?? 0) + (pipelineFaceByMonth.get(m) ?? 0)
                  return (
                    <td key={m} className="td-right text-mono" style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>
                      {total > 0 ? fmtEuro(total) : '—'}
                    </td>
                  )
                })}
                <td className="td-right text-mono" style={{ fontWeight: 800, color: '#fff', fontSize: 14 }}>
                  {fmtEuro(totalBestCase)}
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
