import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import type { Project, Domain, RevenuePlanner } from '../lib/types'

// ── Helper functions ───────────────────────────────────────────────────────────

function getMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fmtMonthLabel(m: string): string {
  const d = new Date(m + 'T00:00:00')
  return d.toLocaleString('en', { month: 'long', year: 'numeric' })
}

function daysUntil(d: string): number {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
}

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const yyyy = dt.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function fmtTodayLabel(): string {
  return new Date().toLocaleString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DashboardView() {
  const pStore = useProjectsStore()
  const cStore = useClientsStore()
  const infraStore = useInfraStore()
  const domainsStore = useDomainsStore()
  const rStore = useRevenuePlannerStore()

  const currentMonth = getMonthStr()

  useEffect(() => {
    pStore.fetchAll()
    cStore.fetchAll()
    infraStore.fetchAll()
    domainsStore.fetchAll()
    rStore.fetchByMonths([currentMonth])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Derived data ─────────────────────────────────────────────────────────────

  const activeProjects: Project[] = pStore.projects.filter(p => p.status === 'active')

  const hostingMrr = infraStore.monthlyRevenueEquiv()

  const criticalDomains: Domain[] = domainsStore.critical()
  const warningSoonDomains: Domain[] = domainsStore.warningSoon()
  const expiringDomains: Domain[] = [...criticalDomains, ...warningSoonDomains]

  const pendingInvoices: RevenuePlanner[] = rStore.rows.filter(r => r.status === 'planned')

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted">{fmtTodayLabel()}</p>
        </div>
      </div>

      {/* ── Stats strip ──────────────────────────────────────────────────────── */}
      <div className="stats-strip">
        <div
          className="stat-card"
          style={{ '--left-color': 'var(--navy)' } as React.CSSProperties}
        >
          <div className="stat-card-label">Active Projects</div>
          <div className="stat-card-value">{activeProjects.length}</div>
          <div className="stat-card-sub">
            {pStore.projects.length} total projects
          </div>
        </div>

        <div
          className="stat-card"
          style={{ '--left-color': 'var(--green)' } as React.CSSProperties}
        >
          <div className="stat-card-label">Clients</div>
          <div className="stat-card-value">{cStore.clients.length}</div>
          <div className="stat-card-sub">registered clients</div>
        </div>

        <div
          className="stat-card"
          style={{ '--left-color': 'var(--c5)' } as React.CSSProperties}
        >
          <div className="stat-card-label">Hosting MRR</div>
          <div className="stat-card-value" style={{ fontVariantNumeric: 'tabular-nums' }}>
            €{hostingMrr.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/mo
          </div>
          <div className="stat-card-sub">from hosting clients</div>
        </div>

        <div
          className="stat-card"
          style={{
            '--left-color': expiringDomains.length > 0 ? 'var(--red)' : 'var(--c5)',
          } as React.CSSProperties}
        >
          <div className="stat-card-label">Domains Expiring</div>
          <div
            className="stat-card-value"
            style={{ color: expiringDomains.length > 0 ? 'var(--red)' : undefined }}
          >
            {expiringDomains.length}
          </div>
          <div className="stat-card-sub">in the next 30 days</div>
        </div>
      </div>

      {/* ── Page content ─────────────────────────────────────────────────────── */}
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Quick Actions ────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Link to="/clients" style={{ textDecoration: 'none' }}>
            <div className="card" style={{ padding: '20px 16px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c1)' }}>+ New Client</div>
            </div>
          </Link>
          <Link to="/projects" style={{ textDecoration: 'none' }}>
            <div className="card" style={{ padding: '20px 16px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/></svg>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c1)' }}>+ New Project</div>
            </div>
          </Link>
          <Link to="/this-month" style={{ textDecoration: 'none' }}>
            <div className="card" style={{ padding: '20px 16px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c1)' }}>Plan Invoice</div>
            </div>
          </Link>
          <Link to="/infrastructure" style={{ textDecoration: 'none' }}>
            <div className="card" style={{ padding: '20px 16px', textAlign: 'center', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--c3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c1)' }}>Infrastructure</div>
            </div>
          </Link>
        </div>

        {/* ── 2-column grid: invoices left, projects right ─────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

          {/* ── Invoices to Issue ─────────────────────────────────────────── */}
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
                  <span
                    className="spinner"
                    style={{
                      width: 22,
                      height: 22,
                      borderWidth: 3,
                      borderTopColor: 'var(--navy)',
                      borderColor: 'var(--c5)',
                      display: 'inline-block',
                    }}
                  />
                </div>
              ) : pendingInvoices.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>✓</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c2)', marginBottom: 4 }}>
                    All caught up!
                  </div>
                  <div className="text-sm text-muted">No pending invoices for {fmtMonthLabel(currentMonth)}.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {pendingInvoices.map((row: RevenuePlanner) => (
                    <div
                      key={row.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--c6)',
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)', marginBottom: 2 }}>
                          {row.project?.name ?? '—'}
                        </div>
                        {row.project?.pn && (
                          <span
                            className="badge badge-gray"
                            style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums' }}
                          >
                            {row.project.pn}
                          </span>
                        )}
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 14,
                            fontVariantNumeric: 'tabular-nums',
                            color: 'var(--navy)',
                            marginBottom: 4,
                          }}
                        >
                          {row.planned_amount != null
                            ? `€${row.planned_amount.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                            : '—'}
                        </div>
                        <Link to="/this-month" className="btn btn-primary btn-xs">
                          Issue
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Active Projects ──────────────────────────────────────────── */}
          <div>
            <div className="section-bar">
              <h2>Active Projects</h2>
              <Link to="/projects" className="btn btn-secondary btn-sm">
                → All Projects
              </Link>
            </div>

            <div className="card">
              {pStore.loading ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--c4)' }}>
                  <span
                    className="spinner"
                    style={{
                      width: 22,
                      height: 22,
                      borderWidth: 3,
                      borderTopColor: 'var(--navy)',
                      borderColor: 'var(--c5)',
                      display: 'inline-block',
                    }}
                  />
                </div>
              ) : activeProjects.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <div className="text-sm text-muted">No active projects.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {activeProjects.slice(0, 8).map((p: Project) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '11px 16px',
                        borderBottom: '1px solid var(--c6)',
                        gap: 12,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link
                          to={`/projects/${p.id}`}
                          style={{
                            fontWeight: 700,
                            fontSize: 14,
                            color: 'var(--c0)',
                            textDecoration: 'none',
                            display: 'block',
                            marginBottom: 2,
                          }}
                          className="table-link"
                        >
                          {p.name}
                        </Link>
                        <div className="text-sm text-muted" style={{ fontSize: 12 }}>
                          {p.client?.name ?? '—'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span
                          className={`badge ${
                            p.type === 'fixed'
                              ? 'badge-blue'
                              : p.type === 'maintenance'
                              ? 'badge-green'
                              : 'badge-navy'
                          }`}
                        >
                          {p.type.charAt(0).toUpperCase() + p.type.slice(1)}
                        </span>
                      </div>
                    </div>
                  ))}
                  {activeProjects.length > 8 && (
                    <div style={{ padding: '10px 16px', textAlign: 'center' }}>
                      <Link to="/projects" className="text-sm text-muted">
                        +{activeProjects.length - 8} more projects
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Domains to Renew ────────────────────────────────────────────────── */}
        {expiringDomains.length > 0 && (
          <div>
            <div className="section-bar">
              <h2>Domains to Renew</h2>
              <Link to="/domains" className="btn btn-secondary btn-sm">
                → Domains
              </Link>
            </div>

            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Domain</th>
                    <th>Client</th>
                    <th>Expiry Date</th>
                    <th>Days Left</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringDomains.map((domain: Domain) => {
                    const days = daysUntil(domain.expiry_date)
                    const daysColor = days <= 7 ? 'var(--red)' : 'var(--amber)'
                    return (
                      <tr key={domain.id}>
                        <td>
                          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)' }}>
                            {domain.domain_name}
                          </span>
                        </td>
                        <td className="text-sm text-muted">{domain.client?.name ?? '—'}</td>
                        <td className="text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {fmtDate(domain.expiry_date)}
                        </td>
                        <td>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: 13,
                              color: daysColor,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {days}d
                          </span>
                          {days <= 7 && (
                            <span className="badge badge-amber" style={{ marginLeft: 8 }}>
                              Critical
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}


      </div>
    </div>
  )
}
