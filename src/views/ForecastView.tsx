import React, { useEffect, useMemo, useState } from 'react'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { usePipelineStore } from '../stores/pipeline'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { useClientsStore } from '../stores/clients'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import type { PipelineItem } from '../lib/types'
import { hostingActiveInMonth } from '../lib/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtEuro(n?: number | null) {
  if (!n) return '—'
  return n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
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
  const crStore = useChangeRequestsStore()
  const cStore = useClientsStore()
  const infraStore = useInfraStore()
  const domainsStore = useDomainsStore()

  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const months = useMemo(() => getYearMonths(year), [year])
  const loadMonths = useMemo(() => getYearMonths(year), [year])

  useEffect(() => {
    rpStore.fetchByMonths(loadMonths)
    plStore.fetchAll()
    crStore.fetchAllPending()
    cStore.fetchAll()
    infraStore.fetchAll()
    domainsStore.fetchAll()
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
  // - deferred → 0
  // - all other planned rows → planned_amount (confirmed contracted revenue regardless of month)
  const today = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  function rowForecastAmount(r: { status: string; month: string; planned_amount?: number | null; actual_amount?: number | null; maintenance_id?: string | null }): number {
    if (r.status === 'issued' || r.status === 'paid') return r.actual_amount ?? r.planned_amount ?? 0
    if (r.status === 'deferred') return 0
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
      let amt = rowForecastAmount(r)
      // For issued maintenance retainer rows: subtract linked monthly hosting (tracked separately in hosting row)
      // CR rows are extra work — hosting does NOT apply
      const isCRRow = r.notes?.startsWith('CR:')
      if (!isCRRow && r.maintenance_id && (r.status === 'issued' || r.status === 'paid')) {
        const linkedHosting = infraStore.hostingClients.find(
          h => h.maintenance_id === r.maintenance_id && h.cycle === 'monthly'
        )
        if (linkedHosting) amt = Math.max(0, amt - linkedHosting.amount)
      }
      entry.byMonth.set(r.month, (entry.byMonth.get(r.month) ?? 0) + amt)
    }
    return [...map.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))
  }, [confirmedRows, cStore.clients, infraStore.hostingClients])

  // ── hosting aggregate — from infraStore (matches Hosting Revenue view) ──────
  // Monthly: all active hosting clients (standalone + maintenance-linked)
  // Yearly: add in the anniversary month (same month as billing_since) each year
  const hostingByMonth = useMemo(() => {
    // Build set of (maintenance_id, month) pairs where maintenance was explicitly deferred
    const maintDeferredSet = new Set<string>()
    for (const r of rpStore.rows) {
      if (r.maintenance_id && (r.status === 'deferred' || r.status === 'retainer')) {
        maintDeferredSet.add(`${r.maintenance_id}:${r.month}`)
      }
    }
    const map = new Map<string, number>()
    for (const h of infraStore.hostingClients) {
      if (h.status === 'paused') continue
      if (h.cycle === 'monthly') {
        for (const m of months) {
          if (!hostingActiveInMonth(h, m)) continue
          if (h.contract_expiry && m > h.contract_expiry.slice(0, 7) + '-01') continue
          // For maintenance-linked hosting: skip months where maintenance was explicitly deferred
          if (h.maintenance_id && maintDeferredSet.has(`${h.maintenance_id}:${m}`)) continue
          map.set(m, (map.get(m) ?? 0) + h.amount)
        }
      } else if (h.cycle === 'yearly' && h.billing_month) {
        // Show in billing_month every year
        for (const m of months) {
          if (parseInt(m.slice(5, 7)) !== h.billing_month) continue
          if (!hostingActiveInMonth(h, m)) continue
          if (h.contract_expiry && m > h.contract_expiry.slice(0, 7) + '-01') continue
          map.set(m, (map.get(m) ?? 0) + h.amount)
        }
      }
    }
    return map
  }, [months, infraStore.hostingClients, rpStore.rows, currentMonth])

  // ── domains aggregate (from domains store, not revenue_planner) ────────────
  const domainsByMonth = useMemo(() => {
    const map = new Map<string, number>()
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const thisYear = now.getFullYear()
    for (const d of domainsStore.domains) {
      if (!d.yearly_amount) continue
      const billingMonth = `${year}-${(d.registered_date ?? d.expiry_date).slice(5, 7)}-01`
      if (!months.includes(billingMonth)) continue
      if (d.archived) {
        // Archived domain: only count in current year if billing month already passed
        if (year !== thisYear) continue
        if (billingMonth > todayStr) continue
      }
      map.set(billingMonth, (map.get(billingMonth) ?? 0) + d.yearly_amount)
    }
    return map
  }, [domainsStore.domains, months, year])

  // ── confirmed total per month (projects + maintenance + domains + hosting from infra) ──
  const confirmedByMonth = useMemo(() => {
    const map = new Map<string, number>()
    // sum exactly what's shown: client rows (projects + maintenance with resolvable client)
    for (const [, { byMonth }] of clientRows) {
      for (const [m, amt] of byMonth) {
        map.set(m, (map.get(m) ?? 0) + amt)
      }
    }
    // hosting from infra
    for (const [m, amt] of hostingByMonth) {
      map.set(m, (map.get(m) ?? 0) + amt)
    }
    // domains from domains store
    for (const [m, amt] of domainsByMonth) {
      map.set(m, (map.get(m) ?? 0) + amt)
    }
    return map
  }, [clientRows, hostingByMonth, domainsByMonth])

  // ── pipeline ───────────────────────────────────────────────────────────────
  const activePipeline = useMemo(() =>
    plStore.items
      .filter(i => i.status !== 'won' && i.status !== 'lost')
      .filter(i => months.some(m => pipelineAmountInMonth(i, m) > 0))
      .sort((a, b) => (a.expected_month ?? 'zzzz').localeCompare(b.expected_month ?? 'zzzz')),
    [plStore.items, months]
  )

  // Pending change requests shown as pipeline (proposals not yet approved, and not yet planned in revenue planner)
  const pendingCRPipeline = useMemo(() =>
    crStore.pendingCRs
      .filter(cr => {
        if (!cr.amount || !cr.expected_month || !months.includes(cr.expected_month)) return false
        // Hide if already has a planned revenue_planner row (confirmed)
        const alreadyPlanned = rpStore.rows.some(r =>
          r.notes === `CR: ${cr.title}` && r.maintenance_id === cr.maintenance_id && r.status !== 'deferred'
        )
        return !alreadyPlanned
      })
      .sort((a, b) => (a.expected_month ?? 'zzzz').localeCompare(b.expected_month ?? 'zzzz')),
    [crStore.pendingCRs, months, rpStore.rows]
  )

  const pipelineFaceByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of activePipeline) {
      for (const m of months) {
        const amt = pipelineAmountInMonth(item, m)
        if (amt > 0) map.set(m, (map.get(m) ?? 0) + amt)
      }
    }
    for (const cr of pendingCRPipeline) {
      if (cr.expected_month && cr.amount) {
        map.set(cr.expected_month, (map.get(cr.expected_month) ?? 0) + cr.amount)
      }
    }
    return map
  }, [activePipeline, pendingCRPipeline, months])

  function getPipelineClientName(item: PipelineItem): string {
    return item.client?.name ?? cStore.clients.find(c => c.id === item.client_id)?.name ?? item.company_name ?? '—'
  }

  function getCRClientName(cr: typeof crStore.pendingCRs[0]): string {
    if (cr.maintenance?.client?.name) return cr.maintenance.client.name
    if (cr.project?.client_id) return cStore.clients.find(c => c.id === cr.project!.client_id)?.name ?? '—'
    return '—'
  }

  // ── maintenance cost rows (status='cost' in revenue_planner) ─────────────
  const maintCostRows = useMemo(() => {
    const byMaint = new Map<string, { name: string; clientName: string; amountByMonth: Map<string, number> }>()
    for (const r of rpStore.rows) {
      if (r.status !== 'cost' || !r.maintenance_id || !months.includes(r.month)) continue
      if (!byMaint.has(r.maintenance_id)) {
        byMaint.set(r.maintenance_id, {
          name: r.maintenance?.name ?? 'Maintenance cost',
          clientName: r.maintenance?.client?.name ?? '',
          amountByMonth: new Map(),
        })
      }
      const entry = byMaint.get(r.maintenance_id)!
      entry.amountByMonth.set(r.month, (entry.amountByMonth.get(r.month) ?? 0) + (r.planned_amount ?? 0))
    }
    return [...byMaint.values()]
  }, [rpStore.rows, months])

  // ── infrastructure costs by month ─────────────────────────────────────────
  const costsByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of infraStore.infraCosts) {
      for (const m of months) {
        if (c.status === 'active') {
          map.set(m, (map.get(m) ?? 0) + c.monthly_cost)
        } else if (c.status === 'inactive' && c.cancelled_from && m < c.cancelled_from) {
          map.set(m, (map.get(m) ?? 0) + c.monthly_cost)
        }
      }
    }
    for (const mc of maintCostRows) {
      for (const [m, amt] of mc.amountByMonth) {
        map.set(m, (map.get(m) ?? 0) + amt)
      }
    }
    return map
  }, [months, infraStore.infraCosts, maintCostRows])

  const costRows = useMemo(() =>
    infraStore.infraCosts.filter(c => {
      // Show if active, or if cancelled within or after first month of this year
      if (c.status === 'active') return true
      if (c.status === 'inactive' && c.cancelled_from) return c.cancelled_from > months[0]
      return false
    }),
    [infraStore.infraCosts, months]
  )

  // ── stats ──────────────────────────────────────────────────────────────────
  const totalConfirmed = months.reduce((s, m) => s + (confirmedByMonth.get(m) ?? 0), 0)
  const totalPipelineFace = months.reduce((s, m) => s + (pipelineFaceByMonth.get(m) ?? 0), 0)
  const totalBestCase = totalConfirmed + totalPipelineFace
  const crPipelineLikely = pendingCRPipeline.filter(cr => (cr.probability ?? 0) >= 50).reduce((s, cr) => s + (cr.amount ?? 0), 0)
  const totalLikely = totalConfirmed + activePipeline.filter(i => i.probability >= 50).reduce((s, i) => s + pipelineDealTotal(i), 0) + crPipelineLikely
  const totalCosts = months.reduce((s, m) => s + (costsByMonth.get(m) ?? 0), 0)

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
          <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y - 1)} disabled={year <= 2025}>← {year - 1}</button>
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
          <div className="stat-card-sub">{activePipeline.length + pendingCRPipeline.length} active deals, face value</div>
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
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="no-row-hover" style={{ minWidth: 'max-content' }}>
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

              {activePipeline.length === 0 && pendingCRPipeline.length === 0 && (
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

              {/* Pending Change Requests as pipeline */}
              {pendingCRPipeline.map(cr => {
                const clientName = getCRClientName(cr)
                const prob = cr.probability ?? 50
                const source = cr.maintenance?.name ?? cr.project?.name ?? '—'
                return (
                  <tr key={cr.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{clientName}</span>
                        <span className="badge badge-navy" style={{ fontSize: 9 }}>CR</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 1 }}>{cr.title}</div>
                      <div style={{ fontSize: 10, color: 'var(--c4)' }}>{source}</div>
                    </td>
                    {months.map(m => {
                      const amt = cr.expected_month === m ? (cr.amount ?? 0) : 0
                      return (
                        <td key={m} className="td-right" style={{ fontSize: 13 }}>
                          {amt > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                              <span className="text-mono" style={{ fontWeight: 600, color: '#d97706' }}>{fmtEuro(amt)}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: probColor(prob) }}>{prob}%</span>
                            </div>
                          ) : <span style={{ color: 'var(--c5)' }}>—</span>}
                        </td>
                      )
                    })}
                    <td className="td-right text-mono" style={{ fontWeight: 700, color: '#d97706' }}>{fmtEuro(cr.amount)}</td>
                  </tr>
                )
              })}

              {/* Pipeline sub-total (face value) */}
              {(activePipeline.length > 0 || pendingCRPipeline.length > 0) && (
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

              {/* ── Costs section header ── */}
              {(costRows.length > 0 || maintCostRows.length > 0) && (
                <tr style={{ background: '#7f1d1d' }}>
                  <td colSpan={months.length + 2} style={{ ...sectionHeaderStyle, color: '#fff' }}>
                    Costs
                  </td>
                </tr>
              )}

              {/* Per-cost rows */}
              {costRows.map(c => {
                const isCancelled = c.status === 'inactive'
                const rowTotal = months.reduce((s, m) => {
                  if (c.status === 'active') return s + c.monthly_cost
                  if (isCancelled && c.cancelled_from && m < c.cancelled_from) return s + c.monthly_cost
                  return s
                }, 0)
                return (
                  <tr key={c.id} style={isCancelled ? { opacity: 0.7 } : undefined}>
                    <td style={{ fontSize: 13 }}>
                      <div style={{ fontWeight: 600, color: 'var(--red)' }}>{c.provider}</div>
                      {c.description && <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 1 }}>{c.description}</div>}
                    </td>
                    {months.map(m => {
                      const active = c.status === 'active' || (isCancelled && !!c.cancelled_from && m < c.cancelled_from)
                      return (
                        <td key={m} className="td-right text-mono" style={{ fontSize: 13, color: active ? 'var(--red)' : 'var(--c5)' }}>
                          {active ? fmtEuro(c.monthly_cost) : '—'}
                        </td>
                      )
                    })}
                    <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--red)' }}>{fmtEuro(rowTotal)}</td>
                  </tr>
                )
              })}

              {/* Maintenance cost rows */}
              {maintCostRows.map((mc, i) => {
                const rowTotal = months.reduce((s, m) => s + (mc.amountByMonth.get(m) ?? 0), 0)
                return (
                  <tr key={i}>
                    <td style={{ fontSize: 13 }}>
                      <div style={{ fontWeight: 600, color: 'var(--red)' }}>{mc.name}</div>
                      {mc.clientName && <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 1 }}>{mc.clientName}</div>}
                    </td>
                    {months.map(m => {
                      const amt = mc.amountByMonth.get(m) ?? 0
                      return (
                        <td key={m} className="td-right text-mono" style={{ fontSize: 13, color: amt ? 'var(--red)' : 'var(--c5)' }}>
                          {amt ? fmtEuro(amt) : '—'}
                        </td>
                      )
                    })}
                    <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--red)' }}>{fmtEuro(rowTotal)}</td>
                  </tr>
                )
              })}

              {/* Costs subtotal */}
              {(costRows.length > 0 || maintCostRows.length > 0) && (
                <tr style={{ ...subTotalRowStyle, borderTop: '2px solid #fca5a5' }}>
                  <td style={{ ...subTotalLabelStyle, color: 'var(--red)' }}>Costs Total</td>
                  {months.map(m => (
                    <td key={m} className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--red)' }}>
                      {(costsByMonth.get(m) ?? 0) > 0 ? fmtEuro(costsByMonth.get(m)) : '—'}
                    </td>
                  ))}
                  <td className="td-right text-mono" style={{ fontWeight: 800, color: 'var(--red)', fontSize: 14 }}>
                    {fmtEuro(totalCosts)}
                  </td>
                </tr>
              )}

              {/* Grand total (revenue - costs) */}
              {(() => {
                const monthlyNets = months.map(m =>
                  Math.round((confirmedByMonth.get(m) ?? 0) + (pipelineFaceByMonth.get(m) ?? 0) - (costsByMonth.get(m) ?? 0))
                )
                const grandTotal = monthlyNets.reduce((s, v) => s + v, 0)
                return (
                  <tr style={{ background: 'var(--navy)', borderTop: '2px solid var(--navy)' }}>
                    <td style={{ ...sectionHeaderStyle, color: '#fff', fontSize: 12 }}>Grand Total</td>
                    {monthlyNets.map((net, i) => (
                      <td key={months[i]} className="td-right text-mono" style={{ fontWeight: 700, color: net < 0 ? '#fca5a5' : '#fff', fontSize: 13 }}>
                        {net !== 0 ? fmtEuro(net) : '—'}
                      </td>
                    ))}
                    <td className="td-right text-mono" style={{ fontWeight: 800, color: grandTotal < 0 ? '#fca5a5' : '#fff', fontSize: 14 }}>
                      {fmtEuro(grandTotal)}
                    </td>
                  </tr>
                )
              })()}

            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
