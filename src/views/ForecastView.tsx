import { useEffect, useMemo, useState } from 'react'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { usePipelineStore } from '../stores/pipeline'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { useClientsStore } from '../stores/clients'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import type { PipelineItem } from '../lib/types'
import { hostingActiveInMonth } from '../lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

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

function probColorClass(p: number) {
  return p >= 100 ? 'text-[#16a34a]' : p >= 50 ? 'text-[#d97706]' : 'text-[#ea580c]'
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
      (r.status === 'planned' || r.status === 'issued' || r.status === 'paid' || r.status === 'retainer') &&
      r.project?.type !== 'internal'
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

  const sectionHeaderCls = 'font-bold text-[11px] uppercase tracking-[0.5px] px-3 py-1.5'
  const subTotalRowCls = 'bg-[#f9fafb] border-t-2 border-[#e5e7eb]'

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Forecast</h1>
          <p>Confirmed plans + sales pipeline — {year}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setYear(y => y - 1)} disabled={year <= 2025}>← {year - 1}</Button>
          <span className="font-bold text-sm text-primary text-center min-w-[40px]">{year}</span>
          <Button variant="ghost" size="sm" onClick={() => setYear(y => y + 1)}>{year + 1} →</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4 px-6 pt-4">
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">CONFIRMED {year}</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-primary">{totalConfirmed > 0 ? fmtEuro(totalConfirmed) : '—'}</div>
          <div className="text-xs text-muted-foreground mt-1">planned + issued + retainer</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">PIPELINE</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#d97706]">{totalPipelineFace > 0 ? fmtEuro(totalPipelineFace) : '—'}</div>
          <div className="text-xs text-muted-foreground mt-1">{activePipeline.length + pendingCRPipeline.length} active deals, face value</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">BEST CASE</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#16a34a]">{fmtEuro(totalBestCase)}</div>
          <div className="text-xs text-muted-foreground mt-1">confirmed + all sales</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">LIKELY</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#2563eb]">{fmtEuro(totalLikely)}</div>
          <div className="text-xs text-muted-foreground mt-1">confirmed + ≥50% chance sales</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Card className="overflow-x-auto">
          <table className="no-row-hover min-w-max">
            <thead>
              <tr>
                <th className="w-[200px]">CLIENT / SOURCE</th>
                {months.map(m => (
                  <th key={m} className="text-right w-[110px]">{fmtMonthLabel(m)}</th>
                ))}
                <th className="text-right w-[120px]">TOTAL</th>
              </tr>
            </thead>
            <tbody>

              {/* ── Confirmed section header ── */}
              <tr className="bg-primary">
                <td colSpan={months.length + 2} className={`${sectionHeaderCls} text-white`}>
                  Confirmed Revenue
                </td>
              </tr>

              {/* Per-client rows */}
              {clientRows.length === 0 && hostingByMonth.size === 0 && domainsByMonth.size === 0 && (
                <tr>
                  <td colSpan={months.length + 2} className="text-center text-muted-foreground text-[13px] px-3 py-4">
                    No confirmed revenue planned for {year}.
                  </td>
                </tr>
              )}

              {clientRows.map(([clientId, { name, byMonth }]) => {
                const rowTotal = [...byMonth.values()].reduce((s, v) => s + v, 0)
                return (
                  <tr key={clientId}>
                    <td className="font-semibold text-[13px]">{name}</td>
                    {months.map(m => (
                      <td key={m} className={`text-right text-[13px] ${byMonth.has(m) ? 'text-primary' : 'text-muted-foreground'}`}>
                        {byMonth.has(m) ? fmtEuro(byMonth.get(m)) : '—'}
                      </td>
                    ))}
                    <td className="text-right font-bold text-primary">{fmtEuro(rowTotal)}</td>
                  </tr>
                )
              })}

              {/* Hosting aggregate row */}
              {hostingByMonth.size > 0 && (
                <tr>
                  <td className="text-[13px]">
                    <Badge variant="blue" className="text-[10px]">Hosting</Badge>
                    <span className="ml-1.5 text-[#374151]">All clients</span>
                  </td>
                  {months.map(m => (
                    <td key={m} className={`text-right text-[13px] ${hostingByMonth.has(m) ? 'text-primary' : 'text-muted-foreground'}`}>
                      {hostingByMonth.has(m) ? fmtEuro(hostingByMonth.get(m)) : '—'}
                    </td>
                  ))}
                  <td className="text-right font-bold text-primary">
                    {fmtEuro([...hostingByMonth.values()].reduce((s, v) => s + v, 0))}
                  </td>
                </tr>
              )}

              {/* Domains aggregate row */}
              {domainsByMonth.size > 0 && (
                <tr>
                  <td className="text-[13px]">
                    <Badge variant="navy" className="text-[10px]">Domain</Badge>
                    <span className="ml-1.5 text-[#374151]">All renewals</span>
                  </td>
                  {months.map(m => (
                    <td key={m} className={`text-right text-[13px] ${domainsByMonth.has(m) ? 'text-primary' : 'text-muted-foreground'}`}>
                      {domainsByMonth.has(m) ? fmtEuro(domainsByMonth.get(m)) : '—'}
                    </td>
                  ))}
                  <td className="text-right font-bold text-primary">
                    {fmtEuro([...domainsByMonth.values()].reduce((s, v) => s + v, 0))}
                  </td>
                </tr>
              )}

              {/* Confirmed sub-total */}
              <tr className={subTotalRowCls}>
                <td className="font-bold text-[12px] text-[#374151] uppercase tracking-[0.5px]">Confirmed Total</td>
                {months.map(m => (
                  <td key={m} className="text-right font-bold text-primary">
                    {(confirmedByMonth.get(m) ?? 0) > 0 ? fmtEuro(confirmedByMonth.get(m)) : '—'}
                  </td>
                ))}
                <td className="text-right font-extrabold text-primary text-sm">{fmtEuro(totalConfirmed)}</td>
              </tr>

              {/* ── Pipeline section header ── */}
              <tr className="bg-[#92400e]">
                <td colSpan={months.length + 2} className={`${sectionHeaderCls} text-white`}>
                  Pipeline
                </td>
              </tr>

              {activePipeline.length === 0 && pendingCRPipeline.length === 0 && (
                <tr>
                  <td colSpan={months.length + 2} className="text-center text-muted-foreground text-[13px] px-3 py-4">
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
                      <div className="font-semibold text-[13px]">{clientName}</div>
                      <div className="text-[11px] text-muted-foreground mt-px">{item.title}</div>
                    </td>
                    {months.map(m => {
                      const amt = pipelineAmountInMonth(item, m)
                      return (
                        <td key={m} className="text-right text-[13px]">
                          {amt > 0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold text-[#d97706]">{fmtEuro(amt)}</span>
                              <span className={`text-[10px] font-bold ${probColorClass(item.probability)}`}>{item.probability}%</span>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      )
                    })}
                    <td className="text-right font-bold text-[#d97706]">{fmtEuro(faceTotal)}</td>
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
                      <div className="flex items-center gap-[5px]">
                        <span className="font-semibold text-[13px]">{clientName}</span>
                        <Badge variant="navy" className="text-[9px]">CR</Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-px">{cr.title}</div>
                      <div className="text-[10px] text-muted-foreground">{source}</div>
                    </td>
                    {months.map(m => {
                      const amt = cr.expected_month === m ? (cr.amount ?? 0) : 0
                      return (
                        <td key={m} className="text-right text-[13px]">
                          {amt > 0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-semibold text-[#d97706]">{fmtEuro(amt)}</span>
                              <span className={`text-[10px] font-bold ${probColorClass(prob)}`}>{prob}%</span>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      )
                    })}
                    <td className="text-right font-bold text-[#d97706]">{fmtEuro(cr.amount)}</td>
                  </tr>
                )
              })}

              {/* Pipeline sub-total (face value) */}
              {(activePipeline.length > 0 || pendingCRPipeline.length > 0) && (
                <tr className={subTotalRowCls}>
                  <td className="font-bold text-[12px] uppercase tracking-[0.5px] text-[#d97706]">Pipeline Total</td>
                  {months.map(m => (
                    <td key={m} className="text-right font-bold text-[#d97706]">
                      {(pipelineFaceByMonth.get(m) ?? 0) > 0 ? fmtEuro(pipelineFaceByMonth.get(m)!) : '—'}
                    </td>
                  ))}
                  <td className="text-right font-extrabold text-sm text-[#d97706]">
                    {fmtEuro(totalPipelineFace)}
                  </td>
                </tr>
              )}

              {/* ── Costs section header ── */}
              {(costRows.length > 0 || maintCostRows.length > 0) && (
                <tr className="bg-[#7f1d1d]">
                  <td colSpan={months.length + 2} className={`${sectionHeaderCls} text-white`}>
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
                  <tr key={c.id} className={isCancelled ? 'opacity-70' : undefined}>
                    <td className="text-[13px]">
                      <div className="font-semibold text-[#dc2626]">{c.provider}</div>
                      {c.description && <div className="text-[11px] text-muted-foreground mt-px">{c.description}</div>}
                    </td>
                    {months.map(m => {
                      const active = c.status === 'active' || (isCancelled && !!c.cancelled_from && m < c.cancelled_from)
                      return (
                        <td key={m} className={`text-right text-[13px] ${active ? 'text-[#dc2626]' : 'text-muted-foreground'}`}>
                          {active ? fmtEuro(c.monthly_cost) : '—'}
                        </td>
                      )
                    })}
                    <td className="text-right font-bold text-[#dc2626]">{fmtEuro(rowTotal)}</td>
                  </tr>
                )
              })}

              {/* Maintenance cost rows */}
              {maintCostRows.map((mc, i) => {
                const rowTotal = months.reduce((s, m) => s + (mc.amountByMonth.get(m) ?? 0), 0)
                return (
                  <tr key={i}>
                    <td className="text-[13px]">
                      <div className="font-semibold text-[#dc2626]">{mc.name}</div>
                      {mc.clientName && <div className="text-[11px] text-muted-foreground mt-px">{mc.clientName}</div>}
                    </td>
                    {months.map(m => {
                      const amt = mc.amountByMonth.get(m) ?? 0
                      return (
                        <td key={m} className={`text-right text-[13px] ${amt ? 'text-[#dc2626]' : 'text-muted-foreground'}`}>
                          {amt ? fmtEuro(amt) : '—'}
                        </td>
                      )
                    })}
                    <td className="text-right font-bold text-[#dc2626]">{fmtEuro(rowTotal)}</td>
                  </tr>
                )
              })}

              {/* Costs subtotal */}
              {(costRows.length > 0 || maintCostRows.length > 0) && (
                <tr className="bg-[#f9fafb] border-t-2 border-[#fca5a5]">
                  <td className="font-bold text-[12px] uppercase tracking-[0.5px] text-[#dc2626]">Costs Total</td>
                  {months.map(m => (
                    <td key={m} className="text-right font-bold text-[#dc2626]">
                      {(costsByMonth.get(m) ?? 0) > 0 ? fmtEuro(costsByMonth.get(m)) : '—'}
                    </td>
                  ))}
                  <td className="text-right font-extrabold text-sm text-[#dc2626]">
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
                  <tr className="bg-primary border-t-2 border-primary">
                    <td className={`${sectionHeaderCls} text-white text-[12px]`}>Grand Total</td>
                    {monthlyNets.map((net, i) => (
                      <td key={months[i]} className={`text-right font-bold text-[13px] ${net < 0 ? 'text-[#fca5a5]' : 'text-white'}`}>
                        {net !== 0 ? fmtEuro(net) : '—'}
                      </td>
                    ))}
                    <td className={`text-right font-extrabold text-sm ${grandTotal < 0 ? 'text-[#fca5a5]' : 'text-white'}`}>
                      {fmtEuro(grandTotal)}
                    </td>
                  </tr>
                )
              })()}

            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
