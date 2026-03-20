import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useMaintenancesStore } from '../stores/maintenances'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { usePipelineStore } from '../stores/pipeline'
import { usePixelStore } from '../stores/pixel'
import type { RevenuePlanner, Domain, Maintenance, HostingClient } from '../lib/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function fmtTodayLabel(): string {
  return new Date().toLocaleString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function daysUntil(d: string): number {
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
}

function daysSince(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000)
}

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
}

function fmtEur(n: number): string {
  return n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

function probBadge(p: number): string {
  if (p >= 100) return 'badge badge-green'
  if (p >= 75) return 'badge badge-blue'
  if (p >= 50) return 'badge badge-navy'
  return 'badge badge-amber'
}

// ── Quick link icons ──────────────────────────────────────────────────────────

function IconCalendar() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
}
function IconUsers() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
function IconFolder() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
}
function IconTrendingUp() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
}
function IconTool() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
}

const QUICK_LINKS = [
  { label: 'This Month', sub: 'issue invoices', to: '/this-month', Icon: IconCalendar, color: 'var(--navy)' },
  { label: 'Clients', sub: 'manage clients', to: '/clients', Icon: IconUsers, color: 'var(--green)' },
  { label: 'Projects', sub: 'all projects', to: '/projects', Icon: IconFolder, color: 'var(--amber)' },
  { label: 'Forecast', sub: 'pipeline & revenue', to: '/forecast', Icon: IconTrendingUp, color: 'var(--red)' },
  { label: 'Maintenances', sub: 'contracts & retainers', to: '/maintenances', Icon: IconTool, color: 'var(--blue)' },
]

function QuickLinkCard({ label, sub, to, Icon, color }: typeof QUICK_LINKS[0]) {
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div className="card card-body" style={{
        textAlign: 'center', cursor: 'pointer', padding: '16px 12px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        transition: 'box-shadow 0.15s, transform 0.15s',
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = ''; (e.currentTarget as HTMLDivElement).style.transform = '' }}
      >
        <div style={{ color }}><Icon /></div>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c1)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--c4)' }}>{sub}</div>
      </div>
    </Link>
  )
}

// ── Pixel avatar ──────────────────────────────────────────────────────────────

function PixelAvatar({ size = 32 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 800, fontSize: size * 0.38,
      boxShadow: '0 2px 8px rgba(99,102,241,0.28)',
    }}>P</div>
  )
}

// ── Expiration row ────────────────────────────────────────────────────────────

function ExpirationRow({ name, sub, days, date, isCritical }: { name: string; sub?: string; days: number; date: string; isCritical: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--c7)' }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--c0)' }}>{name}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--c4)' }}>{sub}</div>}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
        <span className={isCritical ? 'badge badge-red' : 'badge badge-amber'} style={{ fontSize: 11 }}>
          {days <= 0 ? 'Expired' : `${days}d`}
        </span>
        <div style={{ fontSize: 10, color: 'var(--c4)', marginTop: 2 }}>{fmtDate(date)}</div>
      </div>
    </div>
  )
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

  const currentMonth = getMonthStr()

  useEffect(() => {
    pStore.fetchAll()
    cStore.fetchAll()
    mStore.fetchAll()
    infraStore.fetchAll()
    domainsStore.fetchAll()
    rStore.fetchByMonths([currentMonth])
    pipeStore.fetchAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derived ─────────────────────────────────────────────────────────────────

  const activeMaintenances = mStore.maintenances.filter(m => m.status === 'active')

  const invoicesToIssue: RevenuePlanner[] = rStore.rows.filter(r => r.status === 'planned' || r.status === 'retainer')
  const invoiceTotal = invoicesToIssue.reduce((s, r) => s + (r.planned_amount ?? 0), 0)

  const activeDeals = pipeStore.items.filter(i => i.status === 'proposal')
  const pipelineValue = activeDeals.reduce((s, i) => s + (i.estimated_amount ?? 0), 0)
  const staleDeals = activeDeals.filter(i => daysSince(i.created_at) > 30)

  const criticalDomains: Domain[] = domainsStore.critical()
  const warningSoonDomains: Domain[] = domainsStore.warningSoon()
  const expiringDomains: Domain[] = [...criticalDomains, ...warningSoonDomains]

  const expiringMaintenances: Maintenance[] = activeMaintenances.filter(m => {
    if (!m.contract_end) return false
    const d = daysUntil(m.contract_end)
    return d >= 0 && d <= 30
  })

  const expiringHosting: HostingClient[] = infraStore.hostingClients.filter(h => {
    if (h.status !== 'active' || !h.contract_expiry) return false
    const d = daysUntil(h.contract_expiry)
    return d >= 0 && d <= 30
  })

  const totalExpirations = expiringDomains.length + expiringMaintenances.length + expiringHosting.length

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

  // ── Pixel suggestions ────────────────────────────────────────────────────────

  function buildSuggestions(): string[] {
    const s: string[] = []
    if (invoicesToIssue.length > 0) {
      const label = getRowLabel(invoicesToIssue[0])
      s.push(`Should I issue the "${label}" invoice this month?`)
    }
    if (staleDeals.length > 0) {
      s.push(`I have ${staleDeals.length} stale deal${staleDeals.length > 1 ? 's' : ''} — what should I follow up on?`)
    }
    if (expiringDomains.length > 0) {
      s.push(`${expiringDomains[0].domain_name} expires soon — what do I need to do?`)
    }
    s.push("What's my revenue outlook for this month?")
    s.push('Give me a summary of the active pipeline.')
    return s.slice(0, 4)
  }

  function handleSuggestion(text: string) {
    pixelStore.sendMessage(text)
    navigate('/pixel')
  }

  // ── Welcome summary text ─────────────────────────────────────────────────────

  function summaryText(): string {
    const parts: string[] = []
    if (invoicesToIssue.length > 0) {
      parts.push(`${invoicesToIssue.length} invoice${invoicesToIssue.length > 1 ? 's' : ''} to issue (${fmtEur(invoiceTotal)})`)
    }
    if (staleDeals.length > 0) {
      parts.push(`${staleDeals.length} stalled deal${staleDeals.length > 1 ? 's' : ''}`)
    }
    if (totalExpirations > 0) {
      parts.push(`${totalExpirations} expiration${totalExpirations > 1 ? 's' : ''} coming up`)
    }
    if (parts.length === 0) return "Everything's up to date. Have a great day."
    return parts.join(' · ') + '.'
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted">{fmtTodayLabel()}</p>
        </div>
      </div>

      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* ── Welcome ─────────────────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--c0)', marginBottom: 5, letterSpacing: '-0.4px' }}>
            {greeting()}, Nino.
          </div>
          <div style={{ fontSize: 13, color: 'var(--c3)', lineHeight: 1.5 }}>
            {summaryText()}
          </div>
        </div>

        {/* ── Quick links ─────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {QUICK_LINKS.map(link => <QuickLinkCard key={link.to} {...link} />)}
        </div>

        {/* ── Row 2: Pixel AI + Invoices ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

          {/* Pixel AI */}
          <div className="card card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <PixelAvatar size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)' }}>Pixel AI</div>
                <div style={{ fontSize: 11, color: 'var(--c4)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                  Agency Intelligence Assistant
                </div>
              </div>
              <Link to="/pixel" className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--c3)' }}>Open →</Link>
            </div>

            <div style={{ fontSize: 12, color: 'var(--c3)', lineHeight: 1.6 }}>
              Here's what's on your plate — tap a question to get a response instantly.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {buildSuggestions().map(s => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  style={{
                    textAlign: 'left', padding: '10px 14px',
                    background: '#f8f8fc', border: '1px solid var(--c6)',
                    borderRadius: 10, cursor: 'pointer', fontSize: 12,
                    color: 'var(--c2)', fontFamily: 'inherit', fontWeight: 500,
                    transition: 'border-color 0.15s, background 0.15s',
                    display: 'flex', alignItems: 'flex-start', gap: 9, lineHeight: 1.45,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b5cf6'; e.currentTarget.style.background = '#f3f3fd' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c6)'; e.currentTarget.style.background = '#f8f8fc' }}
                >
                  <span style={{ color: '#8b5cf6', fontSize: 13, lineHeight: '1.45', flexShrink: 0 }}>✦</span>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Invoices to issue */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="section-bar">
              <h2>Invoices to Issue</h2>
              <Link to="/this-month" className="btn btn-secondary btn-sm">→ This Month</Link>
            </div>
            <div className="card">
              {rStore.loading ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>Loading…</div>
              ) : invoicesToIssue.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, marginBottom: 6, color: 'var(--green)' }}>✓</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c2)', marginBottom: 4 }}>All caught up</div>
                  <div style={{ fontSize: 12, color: 'var(--c4)' }}>No pending invoices for this month.</div>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Project / Contract</th>
                      <th>Client</th>
                      <th className="th-right">Amount</th>
                      <th className="th-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoicesToIssue.map(row => (
                      <tr key={row.id}>
                        <td>
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--c0)' }}>{getRowLabel(row)}</span>
                          {row.project?.pn && (
                            <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>{row.project.pn}</span>
                          )}
                        </td>
                        <td style={{ color: 'var(--c3)', fontSize: 12 }}>{getRowClient(row)}</td>
                        <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 13 }}>
                          {row.planned_amount != null ? fmtEur(row.planned_amount) : '—'}
                        </td>
                        <td className="td-right">
                          <span className={probBadge(row.probability)}>{row.probability}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {invoicesToIssue.length > 1 && (
                    <tfoot>
                      <tr>
                        <td colSpan={2} style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)' }}>Total</td>
                        <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmtEur(invoiceTotal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 3: Sales + Expirations ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

          {/* Sales */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="section-bar">
              <h2>Sales Pipeline</h2>
              <Link to="/sales" className="btn btn-secondary btn-sm">→ Sales</Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="card card-body" style={{ padding: '14px 16px' }}>
                <div className="stat-card-label">Active Deals</div>
                <div className="stat-card-value">{activeDeals.length}</div>
              </div>
              <div className="card card-body" style={{ padding: '14px 16px' }}>
                <div className="stat-card-label">Pipeline Value</div>
                <div className="stat-card-value" style={{ fontSize: 18 }}>{fmtEur(pipelineValue)}</div>
              </div>
            </div>

            {staleDeals.length > 0 && (
              <div className="alert alert-amber" style={{ fontSize: 12 }}>
                <strong>{staleDeals.length} deal{staleDeals.length > 1 ? 's' : ''} stalled</strong> — no movement in 30+ days:{' '}
                {staleDeals.slice(0, 2).map(d => d.title).join(', ')}
                {staleDeals.length > 2 && ` +${staleDeals.length - 2} more`}
                <Link to="/sales" style={{ marginLeft: 10, fontWeight: 700, textDecoration: 'underline' }}>Review →</Link>
              </div>
            )}

            <div className="card">
              {pipeStore.loading ? (
                <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 12 }}>Loading…</div>
              ) : activeDeals.length === 0 ? (
                <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 12 }}>No active deals in the pipeline.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Deal</th>
                      <th>Client</th>
                      <th className="th-right">Value</th>
                      <th className="th-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDeals.slice(0, 6).map(deal => (
                      <tr key={deal.id}>
                        <td>
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--c0)' }}>{deal.title}</span>
                          {daysSince(deal.created_at) > 30 && (
                            <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 9 }}>stale</span>
                          )}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--c3)' }}>
                          {deal.client?.name ?? deal.company_name ?? '—'}
                        </td>
                        <td className="td-right text-mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>
                          {deal.estimated_amount != null ? fmtEur(deal.estimated_amount) : '—'}
                        </td>
                        <td className="td-right">
                          <span className={probBadge(deal.probability)}>{deal.probability}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Expirations */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="section-bar">
              <h2>Expiring Soon</h2>
            </div>

            {totalExpirations === 0 ? (
              <div className="card card-body" style={{ textAlign: 'center', padding: '32px 20px' }}>
                <div style={{ fontSize: 20, color: 'var(--green)', marginBottom: 6 }}>✓</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c2)', marginBottom: 4 }}>Nothing expiring soon</div>
                <div style={{ fontSize: 12, color: 'var(--c4)' }}>All domains, contracts, and hosting are up to date.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {expiringDomains.length > 0 && (
                  <div className="card card-body" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c4)', marginBottom: 8 }}>Domains</div>
                    {expiringDomains.map(domain => (
                      <ExpirationRow
                        key={domain.id}
                        name={domain.domain_name}
                        sub={domain.client?.name}
                        days={daysUntil(domain.expiry_date)}
                        date={domain.expiry_date}
                        isCritical={daysUntil(domain.expiry_date) <= 7}
                      />
                    ))}
                    <Link to="/domains" style={{ fontSize: 11, color: 'var(--navy)', fontWeight: 600, marginTop: 10, display: 'inline-block' }}>Manage domains →</Link>
                  </div>
                )}

                {expiringMaintenances.length > 0 && (
                  <div className="card card-body" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c4)', marginBottom: 8 }}>Maintenance Contracts</div>
                    {expiringMaintenances.map(m => (
                      <ExpirationRow
                        key={m.id}
                        name={m.name}
                        sub={m.client?.name}
                        days={m.contract_end ? daysUntil(m.contract_end) : 0}
                        date={m.contract_end ?? ''}
                        isCritical={false}
                      />
                    ))}
                    <Link to="/maintenances" style={{ fontSize: 11, color: 'var(--navy)', fontWeight: 600, marginTop: 10, display: 'inline-block' }}>Manage contracts →</Link>
                  </div>
                )}

                {expiringHosting.length > 0 && (
                  <div className="card card-body" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c4)', marginBottom: 8 }}>Hosting</div>
                    {expiringHosting.map(h => (
                      <ExpirationRow
                        key={h.id}
                        name={h.description ?? h.project_pn ?? '—'}
                        sub={h.client?.name}
                        days={h.contract_expiry ? daysUntil(h.contract_expiry) : 0}
                        date={h.contract_expiry ?? ''}
                        isCritical={false}
                      />
                    ))}
                    <Link to="/infrastructure" style={{ fontSize: 11, color: 'var(--navy)', fontWeight: 600, marginTop: 10, display: 'inline-block' }}>Manage hosting →</Link>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
