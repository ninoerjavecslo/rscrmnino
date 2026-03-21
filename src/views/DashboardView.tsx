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

function probBadge(p: number): string {
  if (p >= 75) return 'badge badge-green'
  if (p >= 50) return 'badge badge-navy'
  return 'badge badge-amber'
}

function statusBadge(s: string): string {
  if (s === 'retainer') return 'badge badge-navy'
  return 'badge badge-amber'
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
    <div className="page-content" style={{ paddingTop: 28, paddingBottom: 60 }}>

      {/* Greeting */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Manrope, sans-serif', lineHeight: 1.15 }}>
          {greeting()}, Nino
        </h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
          Here's what's happening with your projects today.
        </p>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* KPI cards row */}
          <div style={{ display: 'flex', gap: 12 }}>

            <div className="stat-card card" style={{ flex: 1, padding: '20px 22px 18px' }}>
              <div className="stat-card-label">Monthly Revenue</div>
              <div className="stat-card-value" style={{ fontSize: 32 }}>
                {rStore.loading ? '—' : fmtEur(issuedAmount)}
              </div>
              <div className="stat-card-sub" style={{
                color: revenueChange === null ? '#6b7280' : revenueChange >= 0 ? '#16a34a' : '#dc2626',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
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
            </div>

            <div className="stat-card card" style={{ flex: 1, padding: '20px 22px 18px' }}>
              <div className="stat-card-label">Clients</div>
              <div className="stat-card-value" style={{ fontSize: 32 }}>
                {cStore.clients.length}
              </div>
              <div className="stat-card-sub" style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                Total active
              </div>
            </div>

            <div className="stat-card card" style={{ flex: 1, padding: '20px 22px 18px' }}>
              <div className="stat-card-label">Active Projects</div>
              <div className="stat-card-value" style={{ fontSize: 32 }}>
                {activeProjects.length}
              </div>
              <div style={{ height: 4, background: '#ede8ef', borderRadius: 2, overflow: 'hidden', marginBottom: 6, marginTop: 'auto' }}>
                <div style={{ height: '100%', width: `${activeProjects.length > 0 ? 80 : 0}%`, background: 'var(--navy)', borderRadius: 2 }} />
              </div>
              <div className="stat-card-sub" style={{ color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {pStore.projects.length} total
              </div>
            </div>

            <div className="stat-card card" style={{ flex: 1, padding: '20px 22px 18px' }}>
              <div className="stat-card-label">Maintenances</div>
              <div className="stat-card-value" style={{ fontSize: 32 }}>
                {activeMaintenances.length}
              </div>
              <div className="stat-card-sub" style={{ color: expiringMaintenances.length > 0 ? '#dc2626' : '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill={expiringMaintenances.length > 0 ? '#dc2626' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {expiringMaintenances.length > 0 ? `${expiringMaintenances.length} expiring soon` : 'All active'}
              </div>
            </div>

          </div>

          {/* Revenue Progress */}
          <div className="card" style={{ padding: '26px 28px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#64748b', fontFamily: 'Manrope, sans-serif', marginBottom: 5 }}>Revenue Progress</p>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Manrope, sans-serif' }}>
                  {getMonthLabel()} Target: {rStore.loading ? '—' : fmtEur(totalTarget)}
                </h2>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 40, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Manrope, sans-serif', lineHeight: 1 }}>{pctAchieved}%</p>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#64748b', fontFamily: 'Manrope, sans-serif', marginTop: 2 }}>Achieved</p>
              </div>
            </div>

            <div style={{ height: 13, background: '#ede8ef', borderRadius: 2, overflow: 'hidden', display: 'flex', gap: 2, marginBottom: 14 }}>
              <div style={{ height: '100%', width: `${pctAchieved}%`, background: 'var(--navy)' }} />
              <div style={{ height: '100%', width: `${pctPending}%`, background: '#64748b', opacity: 0.45 }} />
            </div>

            <div style={{ display: 'flex', gap: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 11, height: 11, background: 'var(--navy)', borderRadius: 2, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: '#64748b', fontFamily: 'Manrope, sans-serif' }}>Issued</p>
                  <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Manrope, sans-serif' }}>{fmtEur(issuedAmount)}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 11, height: 11, background: '#64748b', borderRadius: 2, opacity: 0.5, flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: '#64748b', fontFamily: 'Manrope, sans-serif' }}>Pending</p>
                  <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Manrope, sans-serif' }}>{fmtEur(pendingAmount)}</p>
                </div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: '#64748b', fontFamily: 'Manrope, sans-serif' }}>Remaining Gap</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#6b7280', fontFamily: 'Manrope, sans-serif' }}>{fmtEur(gapAmount)}</p>
              </div>
            </div>
          </div>

          {/* Invoices table */}
          <div className="card">
            <div style={{ padding: '18px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0eef2' }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Manrope, sans-serif' }}>Invoices to Issue</h3>
              <Link to="/this-month" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: '#64748b', textDecoration: 'none', fontFamily: 'Manrope, sans-serif', display: 'flex', alignItems: 'center', gap: 3 }}>
                View All
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </Link>
            </div>

            {rStore.loading ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>Loading…</div>
            ) : invoicesToIssue.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 6, color: '#16a34a' }}>✓</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)', marginBottom: 4, fontFamily: 'Manrope, sans-serif' }}>All caught up</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>No pending invoices for this month.</div>
              </div>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Project</th>
                      <th className="th-right">Value</th>
                      <th className="th-right">Likelihood</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesToIssue
                      .slice((invoicePage - 1) * INVOICE_PAGE_SIZE, invoicePage * INVOICE_PAGE_SIZE)
                      .map(row => (
                        <tr key={row.id}>
                          <td>
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)', fontFamily: 'Manrope, sans-serif' }}>{getRowClient(row)}</span>
                          </td>
                          <td>
                            <span style={{ fontSize: 13, color: '#1b1b1d' }}>{getRowLabel(row)}</span>
                          </td>
                          <td className="td-right text-mono" style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 13, fontFamily: 'Manrope, sans-serif' }}>
                            {row.planned_amount != null ? fmtEur(row.planned_amount) : '—'}
                          </td>
                          <td className="td-right">
                            <span className={probBadge(row.probability)}>{row.probability}%</span>
                          </td>
                          <td>
                            <span className={statusBadge(row.status)}>{statusLabel(row.status)}</span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>

                {invoicesToIssue.length > INVOICE_PAGE_SIZE && (
                  <div style={{ padding: '11px 20px', borderTop: '1px solid #f0eef2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'Manrope, sans-serif' }}>
                      Showing {Math.min(invoicePage * INVOICE_PAGE_SIZE, invoicesToIssue.length)} of {invoicesToIssue.length}
                    </span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <button
                        onClick={() => setInvoicePage(p => p - 1)}
                        disabled={invoicePage === 1}
                        style={{ width: 27, height: 27, border: '1px solid #e8e3ea', background: '#fff', borderRadius: 3, cursor: invoicePage === 1 ? 'default' : 'pointer', fontSize: 13, opacity: invoicePage === 1 ? 0.4 : 1 }}
                      >‹</button>
                      {Array.from({ length: Math.ceil(invoicesToIssue.length / INVOICE_PAGE_SIZE) }, (_, i) => i + 1).map(p => (
                        <button
                          key={p}
                          onClick={() => setInvoicePage(p)}
                          style={{
                            width: 27, height: 27, borderRadius: 3, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'Manrope, sans-serif',
                            border: p === invoicePage ? 'none' : '1px solid #e8e3ea',
                            background: p === invoicePage ? 'var(--navy)' : '#fff',
                            color: p === invoicePage ? '#fff' : '#1b1b1d',
                          }}
                        >{p}</button>
                      ))}
                      <button
                        onClick={() => setInvoicePage(p => p + 1)}
                        disabled={invoicePage >= Math.ceil(invoicesToIssue.length / INVOICE_PAGE_SIZE)}
                        style={{ width: 27, height: 27, border: '1px solid #e8e3ea', background: '#fff', borderRadius: 3, cursor: invoicePage >= Math.ceil(invoicesToIssue.length / INVOICE_PAGE_SIZE) ? 'default' : 'pointer', fontSize: 13, opacity: invoicePage >= Math.ceil(invoicesToIssue.length / INVOICE_PAGE_SIZE) ? 0.4 : 1 }}
                      >›</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
        {/* /LEFT */}

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Pixel Assistant dark card */}
          <div style={{ background: 'var(--navy)', borderRadius: 10, padding: '24px 22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#89ceff" stroke="none">
                <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
                <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/>
              </svg>
              <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', fontFamily: 'Manrope, sans-serif' }}>Pixel Assistant</p>
            </div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: 18 }}>
              {pixelSummary()}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => navigate('/pixel')}
                style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', borderRadius: 3, padding: '12px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Manrope, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', transition: 'background .15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.14)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Open Pixel AI
              </button>
              {invoicesToIssue.length > 0 && (
                <button
                  onClick={() => handlePixelSuggestion(`I have ${invoicesToIssue.length} invoices to issue this month totaling ${fmtEur(invoicesToIssue.reduce((s, r) => s + (r.planned_amount ?? 0), 0))}. What should I prioritize?`)}
                  style={{ background: '#fff', color: 'var(--navy)', border: 'none', borderRadius: 3, padding: '12px 18px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'Manrope, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', transition: 'background .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f4f2f6' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Review Invoices
                </button>
              )}
            </div>
          </div>

          {/* Expiring Soon */}
          {expiringItems.length > 0 ? (
            <div style={{ background: '#fff5f5', border: '1.5px solid #fecaca', borderRadius: 10, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="#dc2626" stroke="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13" stroke="#fff" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
                <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: '#dc2626', fontFamily: 'Manrope, sans-serif' }}>
                  Expiring Soon
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {expirePage2.map((item, idx) => (
                  <Link
                    key={item.id}
                    to={item.to}
                    style={{ textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: idx < expirePage2.length - 1 ? '1px solid #fecaca' : 'none' }}
                  >
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', fontFamily: 'Manrope, sans-serif' }}>{item.name}</p>
                      <p style={{ fontSize: 11, color: item.days <= 3 ? '#dc2626' : '#92400e', fontWeight: 600, marginTop: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        Expires in {item.days === 0 ? 'today' : `${item.days} day${item.days !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <div style={{ width: 30, height: 30, borderRadius: 4, border: '1.5px solid #fecaca', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 12 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </div>
                  </Link>
                ))}
              </div>

              {expirePageCount > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid #fecaca' }}>
                  <span style={{ fontSize: 11, color: '#dc2626', fontFamily: 'Manrope, sans-serif', fontWeight: 600 }}>
                    {expirePage} / {expirePageCount}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      onClick={() => setExpirePage(p => p - 1)}
                      disabled={expirePage === 1}
                      style={{ padding: '3px 8px', border: '1.5px solid #fecaca', background: '#fff', borderRadius: 3, cursor: expirePage === 1 ? 'default' : 'pointer', fontSize: 12, opacity: expirePage === 1 ? 0.4 : 1 }}
                    >‹</button>
                    <button
                      onClick={() => setExpirePage(p => p + 1)}
                      disabled={expirePage >= expirePageCount}
                      style={{ padding: '3px 8px', border: '1.5px solid #fecaca', background: '#fff', borderRadius: 3, cursor: expirePage >= expirePageCount ? 'default' : 'pointer', fontSize: 12, opacity: expirePage >= expirePageCount ? 0.4 : 1 }}
                    >›</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.07em', textTransform: 'uppercase', color: '#16a34a', fontFamily: 'Manrope, sans-serif' }}>Nothing expiring</p>
              </div>
              <p style={{ fontSize: 12, color: '#166534', marginTop: 6 }}>All domains, contracts, and hosting are up to date.</p>
            </div>
          )}

          {/* Sales Pipeline */}
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#64748b', fontFamily: 'Manrope, sans-serif' }}>Sales Pipeline</p>
              <Link to="/sales" style={{ fontSize: 11, fontWeight: 700, color: 'var(--navy)', textDecoration: 'none', fontFamily: 'Manrope, sans-serif', display: 'flex', alignItems: 'center', gap: 2 }}>
                View
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', fontFamily: 'Manrope, sans-serif' }}>Proposals Sent</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Manrope, sans-serif' }}>{proposalItems.length}</span>
                </div>
                <div style={{ height: 5, background: '#ede8ef', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--navy)', width: `${Math.min(100, proposalItems.length * 10)}%`, borderRadius: 2 }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', fontFamily: 'Manrope, sans-serif' }}>Pipeline Value</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: 'Manrope, sans-serif' }}>{fmtEur(pipelineValue)}</span>
                </div>
                <div style={{ height: 5, background: '#ede8ef', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'var(--navy)', width: `${pipelineValue > 0 ? 65 : 0}%`, borderRadius: 2 }} />
                </div>
              </div>
            </div>
          </div>

        </div>
        {/* /RIGHT */}

      </div>
    </div>
  )
}
