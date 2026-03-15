import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useMaintenancesStore } from '../stores/maintenances'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import type { RevenuePlanner, Domain, Maintenance, HostingClient } from '../lib/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fmtTodayLabel(): string {
  return new Date().toLocaleString('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function daysUntil(d: string): number {
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
}

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
}

function fmtEur(n: number): string {
  return n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

function getProbabilityBadgeClass(p: number): string {
  if (p >= 100) return 'badge badge-green'
  if (p >= 75) return 'badge badge-blue'
  if (p >= 50) return 'badge badge-navy'
  return 'badge badge-amber'
}

// ── Quick links ────────────────────────────────────────────────────────────────

function IconCalendar() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function IconGrid() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  )
}
function IconUsers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
function IconFolder() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  )
}
function IconTrendingUp() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  )
}

const QUICK_LINKS = [
  { label: 'This Month', sub: 'monthly invoicing', to: '/this-month', Icon: IconCalendar, color: 'var(--navy)' },
  { label: 'Invoice Plan', sub: 'multi-month planning', to: '/planning', Icon: IconGrid, color: 'var(--blue)' },
  { label: 'Clients', sub: 'manage clients', to: '/clients', Icon: IconUsers, color: 'var(--green)' },
  { label: 'Projects', sub: 'all projects', to: '/projects', Icon: IconFolder, color: 'var(--amber)' },
  { label: 'Forecast', sub: 'pipeline & revenue', to: '/forecast', Icon: IconTrendingUp, color: 'var(--red)' },
]

function QuickLinkCard({ label, sub, to, Icon, color }: typeof QUICK_LINKS[0]) {
  const [hovered, setHovered] = useState(false)
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div
        className="card card-body"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          textAlign: 'center', cursor: 'pointer',
          padding: '20px 12px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          transition: 'box-shadow 0.15s, transform 0.15s',
          boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.10)' : undefined,
          transform: hovered ? 'translateY(-2px)' : undefined,
        }}
      >
        <div style={{ color, opacity: hovered ? 1 : 0.75, transition: 'opacity 0.15s' }}>
          <Icon />
        </div>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c1)' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--c4)' }}>{sub}</div>
      </div>
    </Link>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DashboardView() {
  const pStore = useProjectsStore()
  const cStore = useClientsStore()
  const mStore = useMaintenancesStore()
  const infraStore = useInfraStore()
  const domainsStore = useDomainsStore()
  const rStore = useRevenuePlannerStore()

  const currentMonth = getMonthStr()

  useEffect(() => {
    pStore.fetchAll()
    cStore.fetchAll()
    mStore.fetchAll()
    infraStore.fetchAll()
    domainsStore.fetchAll()
    rStore.fetchByMonths([currentMonth])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derived: KPIs ───────────────────────────────────────────────────────────

  const activeMaintenances = mStore.maintenances.filter(m => m.status === 'active')

  // ── Derived: Invoices to issue ──────────────────────────────────────────────

  const invoicesToIssue: RevenuePlanner[] = rStore.rows.filter(
    r => r.status === 'planned' || r.status === 'retainer'
  )

  // ── Derived: Alerts ─────────────────────────────────────────────────────────

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

  const hasAlerts =
    expiringDomains.length > 0 ||
    expiringMaintenances.length > 0 ||
    expiringHosting.length > 0

  // ── Helpers for display ─────────────────────────────────────────────────────

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

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted">{fmtTodayLabel()}</p>
        </div>
      </div>


      {/* ── Page content ──────────────────────────────────────────────────── */}
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* ── Quick Links ───────────────────────────────────────────────────── */}
        <div>
          <div className="section-bar">
            <h2>Quick Links</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {QUICK_LINKS.map((link) => (
              <QuickLinkCard key={link.to} {...link} />
            ))}
          </div>
        </div>

        {/* ── Invoices to Issue ─────────────────────────────────────────────── */}
        <div>
          <div className="section-bar">
            <h2>Invoices to Issue This Month</h2>
            <Link to="/this-month" className="btn btn-secondary btn-sm">
              → This Month
            </Link>
          </div>

          <div className="card">
            {rStore.loading ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--c4)' }}>
                Loading…
              </div>
            ) : invoicesToIssue.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 8, color: 'var(--green)' }}>✓</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c2)', marginBottom: 4 }}>
                  All caught up
                </div>
                <div style={{ fontSize: 13, color: 'var(--c4)' }}>
                  No pending invoices for this month.
                </div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Project / Contract</th>
                    <th>Client</th>
                    <th className="th-right">Amount</th>
                    <th className="th-right">Probability</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesToIssue.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--c0)' }}>
                          {getRowLabel(row)}
                        </span>
                        {row.project?.pn && (
                          <span
                            className="badge badge-gray"
                            style={{ marginLeft: 8, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
                          >
                            {row.project.pn}
                          </span>
                        )}
                      </td>
                      <td style={{ color: 'var(--c3)', fontSize: 13 }}>
                        {getRowClient(row)}
                      </td>
                      <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>
                        {row.planned_amount != null ? fmtEur(row.planned_amount) : '—'}
                      </td>
                      <td className="td-right">
                        <span className={getProbabilityBadgeClass(row.probability)}>
                          {row.probability}%
                        </span>
                      </td>
                      <td className="td-right">
                        <Link to="/this-month" className="table-link" style={{ fontSize: 13 }}>
                          → Issue
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Alerts ────────────────────────────────────────────────────────── */}
        {hasAlerts && (
          <div>
            <div className="section-bar">
              <h2>Alerts</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Expiring domains */}
              {expiringDomains.map((domain) => {
                const days = daysUntil(domain.expiry_date)
                const isCritical = days <= 7
                return (
                  <div
                    key={domain.id}
                    className={isCritical ? 'alert alert-red' : 'alert alert-amber'}
                  >
                    <strong>Domain expiring{isCritical ? ' soon' : ''}:</strong>{' '}
                    <span style={{ fontWeight: 600 }}>{domain.domain_name}</span>
                    {domain.client?.name && (
                      <span style={{ color: 'inherit', opacity: 0.8 }}> — {domain.client.name}</span>
                    )}
                    <span style={{ marginLeft: 8 }}>
                      {days <= 0 ? 'Expired' : `${days} day${days === 1 ? '' : 's'} left`}
                      {' '}({fmtDate(domain.expiry_date)})
                    </span>
                    <Link
                      to="/domains"
                      style={{ marginLeft: 12, fontWeight: 600, textDecoration: 'underline' }}
                    >
                      Renew →
                    </Link>
                  </div>
                )
              })}

              {/* Expiring maintenance contracts */}
              {expiringMaintenances.map((m) => {
                const days = m.contract_end ? daysUntil(m.contract_end) : 0
                return (
                  <div key={m.id} className="alert alert-amber">
                    <strong>Maintenance contract expiring:</strong>{' '}
                    <span style={{ fontWeight: 600 }}>{m.name}</span>
                    {m.client?.name && (
                      <span style={{ opacity: 0.8 }}> — {m.client.name}</span>
                    )}
                    <span style={{ marginLeft: 8 }}>
                      {days <= 0 ? 'Expired' : `${days} day${days === 1 ? '' : 's'} left`}
                      {m.contract_end && ` (ends ${fmtDate(m.contract_end)})`}
                    </span>
                    <Link
                      to="/maintenances"
                      style={{ marginLeft: 12, fontWeight: 600, textDecoration: 'underline' }}
                    >
                      Review →
                    </Link>
                  </div>
                )
              })}

              {/* Expiring hosting contracts */}
              {expiringHosting.map((h) => {
                const days = h.contract_expiry ? daysUntil(h.contract_expiry) : 0
                return (
                  <div key={h.id} className="alert alert-amber">
                    <strong>Hosting contract expiring:</strong>{' '}
                    <span style={{ fontWeight: 600 }}>{h.description ?? h.project_pn}</span>
                    {h.client?.name && (
                      <span style={{ opacity: 0.8 }}> — {h.client.name}</span>
                    )}
                    <span style={{ marginLeft: 8 }}>
                      {days <= 0 ? 'Expired' : `${days} day${days === 1 ? '' : 's'} left`}
                      {h.contract_expiry && ` (expires ${fmtDate(h.contract_expiry)})`}
                    </span>
                    <Link
                      to="/infrastructure"
                      style={{ marginLeft: 12, fontWeight: 600, textDecoration: 'underline' }}
                    >
                      Review →
                    </Link>
                  </div>
                )
              })}

            </div>
          </div>
        )}


      </div>
    </div>
  )
}
