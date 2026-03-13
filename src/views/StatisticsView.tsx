import { useEffect } from 'react'
import { useProjectsStore } from '../stores/projects'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import type { Project } from '../lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return '€' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function pct(part: number, total: number): string {
  if (total === 0) return '0%'
  return Math.round((part / total) * 100) + '%'
}

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string
  sub?: string
  color: string
}

function StatCard({ label, value, sub, color }: StatCardProps) {
  return (
    <div className="stat-card" style={{ '--left-color': color } as React.CSSProperties}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function StatisticsView() {
  const pStore      = useProjectsStore()
  const infraStore  = useInfraStore()
  const domStore    = useDomainsStore()

  useEffect(() => {
    pStore.fetchAll()
    infraStore.fetchAll()
    domStore.fetchAll()
  }, [])

  // ── Project derived data ──────────────────────────────────────────────────

  const allProjects: Project[] = pStore.projects

  const pipelineValue = allProjects
    .filter(p => p.status === 'active')
    .reduce((s, p) => s + (p.contract_value ?? 0), 0)

  const activeCount = allProjects.filter(p => p.status === 'active').length

  // Project type breakdown
  const types: Array<{ key: Project['type']; label: string }> = [
    { key: 'fixed',       label: 'Fixed' },
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'variable',    label: 'Variable' },
  ]

  const totalPortfolioValue = allProjects.reduce((s, p) => s + (p.contract_value ?? 0), 0)

  const typeRows = types.map(({ key, label }) => {
    const subset  = allProjects.filter(p => p.type === key)
    const count   = subset.length
    const value   = subset.reduce((s, p) => s + (p.contract_value ?? 0), 0)
    const share   = pct(value, totalPortfolioValue)
    return { key, label, count, value, share }
  })

  // Project status breakdown — only Active and Completed
  const statuses: Array<{ key: Project['status']; label: string }> = [
    { key: 'active',    label: 'Active' },
    { key: 'completed', label: 'Completed' },
  ]

  const statusRows = statuses.map(({ key, label }) => {
    const subset = allProjects.filter(p => p.status === key)
    const count  = subset.length
    const value  = subset.reduce((s, p) => s + (p.contract_value ?? 0), 0)
    return { key, label, count, value }
  })

  const statusTotal = statusRows.reduce((s, r) => s + r.count, 0)

  // ── Infrastructure data ───────────────────────────────────────────────────

  const monthlyRev = infraStore.monthlyRevenueEquiv()

  // ── Domain data ───────────────────────────────────────────────────────────

  const totalDomains  = domStore.domains.length
  const criticalDoms  = domStore.critical()
  const soonDoms      = domStore.warningSoon()
  const safeDomCount  = totalDomains - criticalDoms.length - soonDoms.length

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>Statistics</h1>
          <p>Revenue and performance metrics</p>
        </div>
      </div>

      {/* Top stats strip */}
      <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <StatCard
          label="Total pipeline value"
          value={pipelineValue ? fmtEur(pipelineValue) : '—'}
          sub="active project contracts"
          color="var(--navy)"
        />
        <StatCard
          label="Active projects"
          value={String(activeCount)}
          sub={`of ${allProjects.length} total`}
          color="var(--c1)"
        />
        <StatCard
          label="Monthly hosting revenue"
          value={monthlyRev ? fmtEur(monthlyRev) : '—'}
          sub="from active hosting clients"
          color="var(--green)"
        />
      </div>

      <div className="page-content">

        {/* ── Section 1 & 2: side by side breakdown ── */}
        <div className="grid-2" style={{ marginBottom: 28 }}>

          {/* Project Breakdown by type */}
          <div>
            <div className="section-bar" style={{ marginBottom: 10 }}><h2>Project Breakdown</h2></div>
            <div className="card" style={{ padding: 20 }}>
              {typeRows.map(row => {
                const barColor = row.key === 'fixed' ? 'var(--navy)' : row.key === 'maintenance' ? 'var(--amber)' : 'var(--green)'
                const widthPct = totalPortfolioValue > 0 ? Math.round((row.value / totalPortfolioValue) * 100) : 0
                return (
                  <div key={row.key} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: barColor, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--c1)' }}>{row.label}</span>
                        <span style={{ fontSize: 12, color: 'var(--c3)' }}>{row.count} project{row.count !== 1 ? 's' : ''}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="text-mono" style={{ fontWeight: 700, fontSize: 14 }}>{row.value > 0 ? fmtEur(row.value) : '—'}</span>
                        <span style={{ fontSize: 12, color: 'var(--c3)', marginLeft: 6 }}>{widthPct}%</span>
                      </div>
                    </div>
                    <div style={{ height: 7, background: 'var(--c6)', borderRadius: 100, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${widthPct}%`, background: barColor, borderRadius: 100, transition: 'width .4s' }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ borderTop: '1px solid var(--c6)', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total ({allProjects.length} projects)</span>
                <span className="text-mono" style={{ fontWeight: 800, fontSize: 15, color: 'var(--navy)' }}>{totalPortfolioValue > 0 ? fmtEur(totalPortfolioValue) : '—'}</span>
              </div>
            </div>
          </div>

          {/* Project Status breakdown */}
          <div>
            <div className="section-bar" style={{ marginBottom: 10 }}><h2>Project Status</h2></div>
            <div className="card" style={{ padding: 20 }}>
              {statusRows.map(row => {
                const barColor = row.key === 'active' ? 'var(--green)' : 'var(--c4)'
                const widthPct = statusTotal > 0 ? Math.round((row.count / statusTotal) * 100) : 0
                return (
                  <div key={row.key} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: barColor, flexShrink: 0, display: 'inline-block' }} />
                        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--c1)' }}>{row.label}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="text-mono" style={{ fontWeight: 700, fontSize: 14 }}>{row.count}</span>
                        {row.value > 0 && <span style={{ fontSize: 12, color: 'var(--c3)', marginLeft: 8 }}>{fmtEur(row.value)}</span>}
                      </div>
                    </div>
                    <div style={{ height: 7, background: 'var(--c6)', borderRadius: 100, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${widthPct}%`, background: barColor, borderRadius: 100, transition: 'width .4s' }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ borderTop: '1px solid var(--c6)', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
                <span className="text-mono" style={{ fontWeight: 800, fontSize: 15 }}>{statusTotal}</span>
              </div>
            </div>
          </div>

        </div>

        {/* ── Section 3: Domain health ── */}
        <div className="section-bar">
          <h2>Domain Health</h2>
        </div>

        <div className="card" style={{ marginBottom: 28, padding: 20 }}>
          {totalDomains === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--c4)' }}>
              <div className="text-sm">No domains tracked yet</div>
            </div>
          ) : (
            <div className="grid-4">
              {/* Total */}
              <div style={{ padding: '16px 18px', background: 'var(--c7)', borderRadius: 'var(--r)', textAlign: 'center' }}>
                <div className="stat-card-label" style={{ marginBottom: 6 }}>Total domains</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)', fontVariantNumeric: 'tabular-nums' }}>{totalDomains}</div>
                <div className="stat-card-sub" style={{ marginTop: 4 }}>registered</div>
              </div>

              {/* Critical */}
              <div style={{ padding: '16px 18px', background: criticalDoms.length > 0 ? 'var(--red-bg, #fef2f2)' : 'var(--c7)', borderRadius: 'var(--r)', textAlign: 'center', border: criticalDoms.length > 0 ? '1px solid var(--red-border, #fecaca)' : '1px solid transparent' }}>
                <div className="stat-card-label" style={{ marginBottom: 6 }}>Critical</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: criticalDoms.length > 0 ? 'var(--red)' : 'var(--c3)', fontVariantNumeric: 'tabular-nums' }}>{criticalDoms.length}</div>
                <div style={{ marginTop: 6 }}>
                  <span className={`badge ${criticalDoms.length > 0 ? 'badge-red' : 'badge-gray'}`}>expires ≤ 7d</span>
                </div>
              </div>

              {/* Expiring soon */}
              <div style={{ padding: '16px 18px', background: soonDoms.length > 0 ? 'var(--amber-bg, #fffbeb)' : 'var(--c7)', borderRadius: 'var(--r)', textAlign: 'center', border: soonDoms.length > 0 ? '1px solid var(--amber-border, #fde68a)' : '1px solid transparent' }}>
                <div className="stat-card-label" style={{ marginBottom: 6 }}>Expiring soon</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: soonDoms.length > 0 ? 'var(--amber)' : 'var(--c3)', fontVariantNumeric: 'tabular-nums' }}>{soonDoms.length}</div>
                <div style={{ marginTop: 6 }}>
                  <span className={`badge ${soonDoms.length > 0 ? 'badge-amber' : 'badge-gray'}`}>expires ≤ 30d</span>
                </div>
              </div>

              {/* Safe */}
              <div style={{ padding: '16px 18px', background: 'var(--c7)', borderRadius: 'var(--r)', textAlign: 'center' }}>
                <div className="stat-card-label" style={{ marginBottom: 6 }}>Safe</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: safeDomCount > 0 ? 'var(--green)' : 'var(--c3)', fontVariantNumeric: 'tabular-nums' }}>{safeDomCount}</div>
                <div style={{ marginTop: 6 }}>
                  <span className="badge badge-green">more than 30d</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
