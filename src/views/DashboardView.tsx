import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useMaintenancesStore } from '../stores/maintenances'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { usePipelineStore } from '../stores/pipeline'
import { usePixelStore } from '../stores/pixel'
import type { RevenuePlanner } from '../lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function getPrevMonthStr(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function getMonthLabel(): string {
  return new Date().toLocaleString('en', { month: 'long', year: 'numeric' })
}

function getPrevMonthLabel(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return d.toLocaleString('en', { month: 'short', year: 'numeric' })
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function daysUntil(d: string): number {
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
}

function daysSince(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
}

function fmtEur(n: number): string {
  return n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

function probBadgeVariant(p: number): 'green' | 'navy' | 'amber' {
  if (p >= 75) return 'green'
  if (p >= 50) return 'navy'
  return 'amber'
}

function statusBadgeVariant(s: string): 'navy' | 'amber' {
  if (s === 'retainer') return 'navy'
  return 'amber'
}

function statusLabel(s: string): string {
  if (s === 'retainer') return 'Retainer'
  return 'Planned'
}

// ── Expiring item type ─────────────────────────────────────────────────────────

interface ExpiringItem {
  id: string
  name: string
  sub: string
  days: number
  to: string
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DashboardView() {
  const navigate = useNavigate()
  const pStore = useProjectsStore()
  const cStore = useClientsStore()
  const mStore = useMaintenancesStore()
  const infraStore = useInfraStore()
  const domainsStore = useDomainsStore()
  const rStore = useRevenuePlannerStore()
  const pipeStore = usePipelineStore()
  const pixelStore = usePixelStore()

  const [invoicePage, setInvoicePage] = useState(1)
  const [expirePage, setExpirePage] = useState(1)
  const currentMonth = getMonthStr()
  const prevMonth = getPrevMonthStr()

  useEffect(() => {
    pStore.fetchAll()
    cStore.fetchAll()
    mStore.fetchAll()
    infraStore.fetchAll()
    domainsStore.fetchAll()
    rStore.fetchByMonths([currentMonth, prevMonth])
    pipeStore.fetchAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Revenue planner derived ──────────────────────────────────────────────────

  const currentRows = rStore.rows.filter(r => r.month === currentMonth)
  const prevRows = rStore.rows.filter(r => r.month === prevMonth)

  const nonCostRows = currentRows.filter(r => r.status !== 'cost')
  const totalTarget = nonCostRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
  const issuedAmount = currentRows
    .filter(r => r.status === 'issued' || r.status === 'paid')
    .reduce((s, r) => s + (r.planned_amount ?? 0), 0)
  const pendingAmount = currentRows
    .filter(r => r.status === 'planned' || r.status === 'retainer')
    .reduce((s, r) => s + (r.planned_amount ?? 0), 0)
  const gapAmount = Math.max(0, totalTarget - issuedAmount - pendingAmount)
  const pctAchieved = totalTarget > 0 ? Math.round(issuedAmount / totalTarget * 100) : 0
  const pctPending = totalTarget > 0 ? Math.round(pendingAmount / totalTarget * 100) : 0

  const prevIssuedAmount = prevRows
    .filter(r => r.status === 'issued' || r.status === 'paid')
    .reduce((s, r) => s + (r.planned_amount ?? 0), 0)
  const revenueChange = prevIssuedAmount > 0
    ? Math.round(((issuedAmount - prevIssuedAmount) / prevIssuedAmount) * 100)
    : null

  const invoicesToIssue: RevenuePlanner[] = currentRows.filter(
    r => r.status === 'planned' || r.status === 'retainer'
  )

  // ── KPI derived ─────────────────────────────────────────────────────────────

  const activeProjects = pStore.projects.filter(p => p.status === 'active')
  const activeMaintenances = mStore.maintenances.filter(m => m.status === 'active')
  const expiringMaintenances = activeMaintenances.filter(m => {
    if (!m.contract_end) return false
    const d = daysUntil(m.contract_end)
    return d >= 0 && d <= 30
  })

  // ── Pipeline derived ─────────────────────────────────────────────────────────

  const proposalItems = pipeStore.items.filter(i => i.status === 'proposal')
  const pipelineValue = proposalItems.reduce((s, i) => s + (i.estimated_amount ?? 0), 0)
  const staleDeals = proposalItems.filter(i => daysSince(i.created_at) > 30)

  // ── Expiring soon (14 days) ──────────────────────────────────────────────────

  const expiringItems: ExpiringItem[] = []

  domainsStore.domains?.forEach(d => {
    if (!d.expiry_date) return
    const days = daysUntil(d.expiry_date)
    if (days >= 0 && days <= 14) {
      expiringItems.push({
        id: 'domain-' + d.id,
        name: d.domain_name,
        sub: d.client?.name ?? 'Domain',
        days,
        to: '/domains',
      })
    }
  })

  activeMaintenances.forEach(m => {
    if (!m.contract_end) return
    const days = daysUntil(m.contract_end)
    if (days >= 0 && days <= 14) {
      expiringItems.push({
        id: 'maint-' + m.id,
        name: m.name,
        sub: m.client?.name ?? 'Maintenance',
        days,
        to: '/maintenances',
      })
    }
  })

  infraStore.hostingClients.forEach(h => {
    if (h.status !== 'active' || !h.contract_expiry) return
    const days = daysUntil(h.contract_expiry)
    if (days >= 0 && days <= 14) {
      expiringItems.push({
        id: 'hosting-' + h.id,
        name: h.description ?? h.project_pn ?? '—',
        sub: h.client?.name ?? 'Hosting',
        days,
        to: '/infrastructure',
      })
    }
  })

  expiringItems.sort((a, b) => a.days - b.days)
  const expirePageCount = Math.ceil(expiringItems.length / 2)
  const expirePage2 = expiringItems.slice((expirePage - 1) * 2, expirePage * 2)

  // ── Row label helpers ────────────────────────────────────────────────────────

  function getRowLabel(row: RevenuePlanner): string {
    if (row.project?.name) return row.project.name
    if (row.maintenance?.name) return row.maintenance.name
    if (row.hosting?.description) return row.hosting.description ?? '—'
    if (row.domain?.domain_name) return row.domain.domain_name
    return '—'
  }

  function getRowClient(row: RevenuePlanner): string {
    if (row.project?.client_id) {
      const c = cStore.clients.find(c => c.id === row.project!.client_id)
      if (c) return c.name
    }
    if (row.maintenance?.client?.name) return row.maintenance.client.name
    if (row.hosting?.client?.name) return row.hosting.client.name
    if (row.domain?.client?.name) return row.domain.client.name
    return '—'
  }

  // ── Pixel suggestion handling ─────────────────────────────────────────────────

  function handlePixelSuggestion(text: string) {
    pixelStore.sendMessage(text)
    navigate('/pixel')
  }

  // ── Pixel summary text ────────────────────────────────────────────────────────

  function pixelSummary(): string {
    const parts: string[] = []
    if (invoicesToIssue.length > 0) {
      parts.push(`${invoicesToIssue.length} invoice${invoicesToIssue.length > 1 ? 's' : ''} ready to issue`)
    }
    if (staleDeals.length > 0) {
      parts.push(`${staleDeals.length} stalled deal${staleDeals.length > 1 ? 's' : ''}`)
    }
    if (expiringItems.length > 0) {
      parts.push(`${expiringItems.length} item${expiringItems.length > 1 ? 's' : ''} expiring soon`)
    }
    if (parts.length === 0) return "Everything's up to date. Have a great day."
    return parts.join(' · ') + '.'
  }

  const INVOICE_PAGE_SIZE = 8

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-auto p-6 pt-7 pb-16">

      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-[30px] font-extrabold text-primary leading-[1.15]">
          {greeting()}, Nino
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Here's what's happening with your projects today.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-5 items-start [grid-template-columns:1fr_360px]">

        {/* ── LEFT COLUMN ── */}
        <div className="flex flex-col gap-6">

          {/* KPI cards row */}
          <div className="flex gap-3">

            <Card className="flex-1 px-[22px] py-4">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Monthly Revenue</div>
              <div className="text-[32px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">
                {rStore.loading ? '—' : fmtEur(issuedAmount)}
              </div>
              <div className={`text-xs mt-1 flex items-center gap-1 ${revenueChange === null ? 'text-muted-foreground' : revenueChange >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                {revenueChange !== null ? (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {revenueChange >= 0
                        ? <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>
                        : <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></>
                      }
                    </svg>
                    {revenueChange >= 0 ? '+' : ''}{revenueChange}% vs {getPrevMonthLabel()}
                  </>
                ) : (
                  <>{getMonthLabel()}</>
                )}
              </div>
            </Card>

            <Card className="flex-1 px-[22px] py-4">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Clients</div>
              <div className="text-[32px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">
                {cStore.clients.length}
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Total active
              </div>
            </Card>

            <Card className="flex-1 px-[22px] py-4">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Active Projects</div>
              <div className="text-[32px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">
                {activeProjects.length}
              </div>
              <div className="h-1 bg-[#ede8ef] rounded-sm overflow-hidden mb-1.5 mt-auto">
                <div className="h-full bg-primary rounded-sm" style={{ width: `${activeProjects.length > 0 ? 80 : 0}%` }} />
              </div>
              <div className="text-xs mt-1 flex items-center gap-1 text-primary">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {pStore.projects.length} total
              </div>
            </Card>

            <Card className="flex-1 px-[22px] py-4">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Maintenances</div>
              <div className="text-[32px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">
                {activeMaintenances.length}
              </div>
              <div className={`text-xs mt-1 flex items-center gap-1 ${expiringMaintenances.length > 0 ? 'text-[#dc2626]' : 'text-muted-foreground'}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill={expiringMaintenances.length > 0 ? '#dc2626' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {expiringMaintenances.length > 0 ? `${expiringMaintenances.length} expiring soon` : 'All active'}
              </div>
            </Card>

          </div>

          {/* Revenue Progress */}
          <Card>
            <CardContent className="px-7 pt-[26px] pb-[22px]">
              <div className="flex justify-between items-start mb-[18px]">
                <div>
                  <p className="text-[10px] font-bold tracking-[.1em] uppercase text-[#64748b] mb-[5px]">Revenue Progress</p>
                  <h2 className="text-[20px] font-extrabold text-primary">
                    {getMonthLabel()} Target: {rStore.loading ? '—' : fmtEur(totalTarget)}
                  </h2>
                </div>
                <div className="text-right">
                  <p className="text-[40px] font-extrabold text-primary leading-none">{pctAchieved}%</p>
                  <p className="text-[9px] font-bold tracking-[.1em] uppercase text-[#64748b] mt-0.5">Achieved</p>
                </div>
              </div>

              <div className="h-[13px] bg-[#ede8ef] rounded-sm overflow-hidden flex gap-0.5 mb-[14px]">
                <div className="h-full bg-primary" style={{ width: `${pctAchieved}%` }} />
                <div className="h-full bg-[#64748b] opacity-45" style={{ width: `${pctPending}%` }} />
              </div>

              <div className="flex gap-9">
                <div className="flex items-center gap-2">
                  <div className="w-[11px] h-[11px] bg-primary rounded-sm shrink-0" />
                  <div>
                    <p className="text-[9px] font-bold tracking-[.09em] uppercase text-[#64748b]">Issued</p>
                    <p className="text-sm font-extrabold text-primary">{fmtEur(issuedAmount)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-[11px] h-[11px] bg-[#64748b] rounded-sm opacity-50 shrink-0" />
                  <div>
                    <p className="text-[9px] font-bold tracking-[.09em] uppercase text-[#64748b]">Pending</p>
                    <p className="text-sm font-extrabold text-primary">{fmtEur(pendingAmount)}</p>
                  </div>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[9px] font-bold tracking-[.09em] uppercase text-[#64748b]">Remaining Gap</p>
                  <p className="text-sm font-extrabold text-[#6b7280]">{fmtEur(gapAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Invoices table */}
          <Card>
            <div className="px-5 pt-[18px] pb-[14px] flex justify-between items-center border-b border-[#f0eef2]">
              <h3 className="text-base font-extrabold text-primary">Invoices to Issue</h3>
              <Link to="/this-month" className="text-[10px] font-bold tracking-[.09em] uppercase text-[#64748b] no-underline flex items-center gap-[3px]">
                View All
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </Link>
            </div>

            {rStore.loading ? (
              <div className="p-8 text-center text-muted-foreground text-[13px]">Loading…</div>
            ) : invoicesToIssue.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-xl mb-1 text-[#16a34a]">✓</div>
                <div className="font-bold text-[13px] text-primary mb-1">All caught up</div>
                <div className="text-xs text-muted-foreground">No pending invoices for this month.</div>
              </div>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Project</th>
                      <th className="text-right">Value</th>
                      <th className="text-right">Likelihood</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesToIssue
                      .slice((invoicePage - 1) * INVOICE_PAGE_SIZE, invoicePage * INVOICE_PAGE_SIZE)
                      .map(row => (
                        <tr key={row.id}>
                          <td>
                            <span className="font-semibold text-[13px] text-primary">{getRowClient(row)}</span>
                          </td>
                          <td>
                            <span className="text-[13px] text-foreground">{getRowLabel(row)}</span>
                          </td>
                          <td className="text-right font-bold text-primary text-[13px]">
                            {row.planned_amount != null ? fmtEur(row.planned_amount) : '—'}
                          </td>
                          <td className="text-right">
                            <Badge variant={probBadgeVariant(row.probability)}>{row.probability}%</Badge>
                          </td>
                          <td>
                            <Badge variant={statusBadgeVariant(row.status)}>{statusLabel(row.status)}</Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>

                {invoicesToIssue.length > INVOICE_PAGE_SIZE && (
                  <div className="px-5 py-[11px] border-t border-[#f0eef2] flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      Showing {Math.min(invoicePage * INVOICE_PAGE_SIZE, invoicesToIssue.length)} of {invoicesToIssue.length}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setInvoicePage(p => p - 1)}
                        disabled={invoicePage === 1}
                        className="w-[27px] h-[27px] border border-[#e8e3ea] bg-white rounded cursor-pointer text-[13px] disabled:opacity-40"
                      >‹</button>
                      {Array.from({ length: Math.ceil(invoicesToIssue.length / INVOICE_PAGE_SIZE) }, (_, i) => i + 1).map(p => (
                        <button
                          key={p}
                          onClick={() => setInvoicePage(p)}
                          className={`w-[27px] h-[27px] rounded cursor-pointer text-[11px] font-bold ${p === invoicePage ? 'bg-primary text-white border-0' : 'border border-[#e8e3ea] bg-white text-[#1b1b1d]'}`}
                        >{p}</button>
                      ))}
                      <button
                        onClick={() => setInvoicePage(p => p + 1)}
                        disabled={invoicePage >= Math.ceil(invoicesToIssue.length / INVOICE_PAGE_SIZE)}
                        className="w-[27px] h-[27px] border border-[#e8e3ea] bg-white rounded cursor-pointer text-[13px] disabled:opacity-40"
                      >›</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>

        </div>
        {/* /LEFT */}

        {/* ── RIGHT COLUMN ── */}
        <div className="flex flex-col gap-3">

          {/* Pixel Assistant dark card */}
          <div className="rounded-[10px] px-[22px] py-6 bg-primary">
            <div className="flex items-center gap-2 mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#89ceff" stroke="none">
                <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
                <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/>
              </svg>
              <p className="text-sm font-bold text-white">Pixel Assistant</p>
            </div>
            <p className="text-[13px] mb-4 text-white/60 leading-relaxed">
              {pixelSummary()}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate('/pixel')}
                className="w-full flex items-center justify-center gap-2 text-white border-none rounded cursor-pointer text-[11px] font-bold tracking-[.08em] uppercase transition-colors bg-white/[0.08] px-[18px] py-3 hover:bg-white/[0.14]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Open Pixel AI
              </button>
              {invoicesToIssue.length > 0 && (
                <button
                  onClick={() => handlePixelSuggestion(`I have ${invoicesToIssue.length} invoices to issue this month totaling ${fmtEur(invoicesToIssue.reduce((s, r) => s + (r.planned_amount ?? 0), 0))}. What should I prioritize?`)}
                  className="w-full flex items-center justify-center gap-2 border-none rounded cursor-pointer text-[11px] font-bold tracking-[.08em] uppercase transition-colors bg-white text-primary px-[18px] py-3 hover:bg-[#f4f2f6]"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Review Invoices
                </button>
              )}
            </div>
          </div>

          {/* Expiring Soon */}
          {expiringItems.length > 0 ? (
            <div className="rounded-[10px] px-5 py-[18px] bg-[#fff5f5] border-[1.5px] border-[#fecaca]">
              <div className="flex items-center gap-2 mb-3">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#dc2626" stroke="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
                <p className="text-[12px] font-extrabold tracking-[.07em] uppercase text-[#dc2626]">
                  Expiring Soon
                </p>
              </div>

              <div className="flex flex-col">
                {expirePage2.map((item, idx) => (
                  <Link
                    key={item.id}
                    to={item.to}
                    className={`flex justify-between items-center no-underline py-2 ${idx < expirePage2.length - 1 ? 'border-b border-[#fecaca]' : ''}`}
                  >
                    <div>
                      <p className="text-[13px] font-bold text-primary">{item.name}</p>
                      <p className={`flex items-center gap-1 mt-1 text-[11px] font-semibold ${item.days <= 3 ? 'text-[#dc2626]' : 'text-[#92400e]'}`}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Expires in {item.days === 0 ? 'today' : `${item.days} day${item.days !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div className="flex items-center justify-center shrink-0 ml-3 cursor-pointer w-[30px] h-[30px] rounded border-[1.5px] border-[#fecaca] bg-white">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </div>
                  </Link>
                ))}
              </div>

              {expirePageCount > 1 && (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#fecaca]">
                  <span className="text-[11px] text-[#dc2626] font-semibold">
                    {expirePage} / {expirePageCount}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setExpirePage(p => p - 1)}
                      disabled={expirePage === 1}
                      className="px-2 py-0.5 border-[1.5px] border-[#fecaca] bg-white rounded text-[12px] disabled:opacity-40 disabled:cursor-default"
                    >‹</button>
                    <button
                      onClick={() => setExpirePage(p => p + 1)}
                      disabled={expirePage >= expirePageCount}
                      className="px-2 py-0.5 border-[1.5px] border-[#fecaca] bg-white rounded text-[12px] disabled:opacity-40 disabled:cursor-default"
                    >›</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[10px] px-5 py-[18px] bg-[#f0fdf4] border-[1.5px] border-[#bbf7d0]">
              <div className="flex items-center gap-2">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <p className="text-[12px] font-extrabold tracking-[.07em] uppercase text-[#16a34a]">Nothing expiring</p>
              </div>
              <p className="text-[12px] text-[#166534] mt-1.5">All domains, contracts, and hosting are up to date.</p>
            </div>
          )}

          {/* Sales Pipeline */}
          <Card>
            <CardContent className="px-5 py-[18px]">
              <div className="flex justify-between items-center mb-3">
                <p className="text-[10px] font-bold tracking-[.1em] uppercase text-[#64748b]">Sales Pipeline</p>
                <Link to="/sales" className="flex items-center gap-1 no-underline text-[11px] font-bold text-primary">
                  View
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </Link>
              </div>

              <div className="flex flex-col gap-3">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] font-semibold text-[#6b7280]">Proposals Sent</span>
                    <span className="text-[13px] font-extrabold text-primary">{proposalItems.length}</span>
                  </div>
                  <div className="h-[5px] bg-[#ede8ef] rounded-sm overflow-hidden">
                    <div className="h-full bg-primary rounded-sm" style={{ width: `${Math.min(100, proposalItems.length * 10)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[11px] font-semibold text-[#6b7280]">Pipeline Value</span>
                    <span className="text-[13px] font-extrabold text-primary">{fmtEur(pipelineValue)}</span>
                  </div>
                  <div className="h-[5px] bg-[#ede8ef] rounded-sm overflow-hidden">
                    <div className="h-full bg-primary rounded-sm" style={{ width: `${pipelineValue > 0 ? 65 : 0}%` }} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
        {/* /RIGHT */}

      </div>
    </div>
  )
}
