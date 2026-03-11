import { useEffect, useState } from 'react'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useProjectsStore } from '../stores/projects'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import type { RevenuePlanner } from '../lib/types'
import './CeoSummaryView.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMonthStr(offset = 0): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fmtMonthLabel(monthStr: string): string {
  const d = new Date(monthStr + 'T00:00:00')
  return d.toLocaleString('en', { month: 'long', year: 'numeric' })
}

function fmtEuro(n: number): string {
  return '€' + n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: RevenuePlanner['status'] }) {
  if (status === 'paid') {
    return (
      <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#f0fdf4', color: '#15803d', border: '1px solid #86efac', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        Paid
      </span>
    )
  }
  if (status === 'issued') {
    return (
      <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        Issued
      </span>
    )
  }
  if (status === 'retainer') {
    return (
      <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#f4f4f5', color: '#6b7280', border: '1px solid #d4d4d8', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        Deferred
      </span>
    )
  }
  return (
    <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
      Planned
    </span>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function CeoSummaryView() {
  const rStore = useRevenuePlannerStore()
  const pStore = useProjectsStore()
  const infraStore = useInfraStore()
  const domainsStore = useDomainsStore()

  const [monthOffset, setMonthOffset] = useState(0)
  const currentMonth = getMonthStr(monthOffset)
  const monthLabel = fmtMonthLabel(currentMonth)

  useEffect(() => {
    rStore.fetchByMonths([currentMonth])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth])

  useEffect(() => {
    if (pStore.projects.length === 0) pStore.fetchAll()
    infraStore.fetchAll()
    domainsStore.fetchAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = rStore.rows

  // ── Stats ────────────────────────────────────────────────────────────────────

  const plannedTotal = rows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)

  const issuedRows = rows.filter(r => r.status === 'issued' || r.status === 'paid')
  const issuedTotal = issuedRows.reduce((s, r) => s + (r.actual_amount ?? r.planned_amount ?? 0), 0)

  const pendingRows = rows.filter(r => r.status === 'planned')
  const pendingTotal = pendingRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)

  // ── Hosting (monthly) ────────────────────────────────────────────────────────

  const monthlyHosting = infraStore.hostingClients.filter(h => h.status === 'active' && h.cycle === 'monthly')
  const hostingTotal = monthlyHosting.reduce((s, h) => s + h.amount, 0)

  // ── Domains expiring this month ───────────────────────────────────────────────

  const currentMonthPrefix = currentMonth.slice(0, 7)
  const domainsThisMonth = domainsStore.domains.filter(
    d => d.expiry_date.slice(0, 7) === currentMonthPrefix
  )
  const domainsTotal = domainsThisMonth.reduce((s, d) => s + (d.yearly_amount ?? 0), 0)

  // ── Project name lookup ──────────────────────────────────────────────────────

  function rowLabel(r: RevenuePlanner): { name: string; client: string } {
    const proj = pStore.projects.find(p => p.id === r.project_id)
    if (proj) return { name: proj.name, client: proj.client?.name ?? '' }
    return { name: r.project?.name ?? '—', client: '' }
  }

  const isLoading = rStore.loading && rows.length === 0

  return (
    <div className="ceo-layout">
      <div className="ceo-inner">

        {/* Header */}
        <div className="ceo-header">
          <div className="ceo-header-brand">
            <div className="ceo-header-brand-name">Renderspace</div>
            <div className="ceo-header-brand-sub">Monthly Summary</div>
          </div>
          <div className="ceo-header-nav">
            <button className="ceo-nav-btn" onClick={() => setMonthOffset(o => o - 1)}>‹</button>
            <span className="ceo-header-month">{monthLabel}</span>
            <button className="ceo-nav-btn" onClick={() => setMonthOffset(o => o + 1)} disabled={monthOffset >= 0} style={{ opacity: monthOffset >= 0 ? 0.3 : 1 }}>›</button>
          </div>
        </div>

        {/* Stats */}
        <div className="ceo-stats">
          <div className="ceo-stat" style={{ borderLeftColor: '#1a3a6c' }}>
            <div className="ceo-stat-label">Planned</div>
            <div className="ceo-stat-value" style={{ color: '#1a3a6c' }}>{fmtEuro(plannedTotal)}</div>
            <div className="ceo-stat-sub">{rows.length} invoice{rows.length !== 1 ? 's' : ''}</div>
          </div>
          <div className="ceo-stat" style={{ borderLeftColor: '#2563eb' }}>
            <div className="ceo-stat-label">Issued</div>
            <div className="ceo-stat-value" style={{ color: '#2563eb' }}>{fmtEuro(issuedTotal)}</div>
            <div className="ceo-stat-sub">{issuedRows.length} sent</div>
          </div>
          <div className="ceo-stat" style={{ borderLeftColor: '#d97706' }}>
            <div className="ceo-stat-label">Pending</div>
            <div className="ceo-stat-value" style={{ color: '#d97706' }}>{fmtEuro(pendingTotal)}</div>
            <div className="ceo-stat-sub">{pendingRows.length} to issue</div>
          </div>
        </div>

        {/* Project invoices */}
        <div className="ceo-section">
          <div className="ceo-section-title">Project invoices</div>

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af' }}>
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 10, padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13, fontWeight: 500, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              No invoices planned for {monthLabel}
            </div>
          ) : (
            <>
              {/* Issued / Paid first */}
              {issuedRows.length > 0 && (
                <>
                  {issuedRows.map(r => {
                    const { name, client } = rowLabel(r)
                    const amount = r.actual_amount ?? r.planned_amount ?? 0
                    return (
                      <div key={r.id} className="ceo-row">
                        <div className="ceo-row-left">
                          <div className="ceo-row-name">{name}</div>
                          {client && <div className="ceo-row-client">{client}</div>}
                        </div>
                        <div className="ceo-row-right">
                          <span className="ceo-row-amount" style={{ color: r.status === 'paid' ? '#15803d' : '#2563eb' }}>
                            {fmtEuro(amount)}
                          </span>
                          <StatusBadge status={r.status} />
                        </div>
                      </div>
                    )
                  })}
                  {pendingRows.length > 0 && <div className="ceo-divider" />}
                </>
              )}

              {/* Planned / Pending */}
              {pendingRows.map(r => {
                const { name, client } = rowLabel(r)
                const amount = r.planned_amount ?? 0
                return (
                  <div key={r.id} className="ceo-row">
                    <div className="ceo-row-left">
                      <div className="ceo-row-name">{name}</div>
                      {client && <div className="ceo-row-client">{client}</div>}
                    </div>
                    <div className="ceo-row-right">
                      <span className="ceo-row-amount" style={{ color: '#d97706' }}>
                        {fmtEuro(amount)}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                )
              })}

              {/* Deferred */}
              {rows.filter(r => r.status === 'retainer').map(r => {
                const { name, client } = rowLabel(r)
                return (
                  <div key={r.id} className="ceo-row" style={{ opacity: 0.65 }}>
                    <div className="ceo-row-left">
                      <div className="ceo-row-name">{name}</div>
                      {client && <div className="ceo-row-client">{client}</div>}
                    </div>
                    <div className="ceo-row-right">
                      <span className="ceo-row-amount" style={{ color: '#9ca3af' }}>
                        {fmtEuro(r.planned_amount ?? 0)}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Hosting + Domains section */}
        {(hostingTotal > 0 || domainsTotal > 0) && (
          <div className="ceo-section">
            <div className="ceo-section-title">Recurring revenue</div>
            {hostingTotal > 0 && (
              <div className="ceo-row">
                <div className="ceo-row-left">
                  <div className="ceo-row-name">Hosting</div>
                  <div className="ceo-row-client">{monthlyHosting.length} active client{monthlyHosting.length !== 1 ? 's' : ''}</div>
                </div>
                <div className="ceo-row-right">
                  <span className="ceo-row-amount" style={{ color: '#0369a1' }}>{fmtEuro(hostingTotal)}</span>
                  <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Monthly</span>
                </div>
              </div>
            )}
            {domainsTotal > 0 && (
              <div className="ceo-row">
                <div className="ceo-row-left">
                  <div className="ceo-row-name">Domain renewals</div>
                  <div className="ceo-row-client">{domainsThisMonth.length} domain{domainsThisMonth.length !== 1 ? 's' : ''} expiring</div>
                </div>
                <div className="ceo-row-right">
                  <span className="ceo-row-amount" style={{ color: '#7c3aed' }}>{fmtEuro(domainsTotal)}</span>
                  <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Yearly</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grand total */}
        {(rows.length > 0 || hostingTotal > 0 || domainsTotal > 0) && (
          <div className="ceo-section">
            <div style={{
              background: '#1a3a6c',
              borderRadius: 10,
              padding: '16px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 2 }}>
                  Total revenue {monthLabel}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
                  projects + hosting + domains
                </div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
                {fmtEuro(plannedTotal + hostingTotal + domainsTotal)}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="ceo-footer">
          Renderspace d.o.o. · {new Date().getFullYear()}
        </div>

      </div>
    </div>
  )
}
