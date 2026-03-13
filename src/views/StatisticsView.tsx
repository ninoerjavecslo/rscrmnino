import { useEffect } from 'react'
import { useProjectsStore } from '../stores/projects'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import { useMaintenancesStore } from '../stores/maintenances'
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
  const maintStore  = useMaintenancesStore()

  useEffect(() => {
    pStore.fetchAll()
    infraStore.fetchAll()
    domStore.fetchAll()
    maintStore.fetchAll()
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

  const monthlyRev    = infraStore.monthlyRevenueEquiv()
  const hostingAnnual = monthlyRev * 12

  // ── Maintenance data ──────────────────────────────────────────────────────

  const maintAnnual = maintStore.maintenances
    .filter(m => m.status === 'active')
    .reduce((s, m) => s + m.monthly_retainer * 12, 0)

  // ── Domain data ───────────────────────────────────────────────────────────

  const activeDoms      = domStore.domains.filter(d => !d.archived)
  const totalDomains    = activeDoms.length
  const criticalDoms    = domStore.critical().filter(d => !d.archived)
  const soonDoms        = domStore.warningSoon().filter(d => !d.archived)
  const safeDomCount    = totalDomains - criticalDoms.length - soonDoms.length
  const totalYearlyCost = activeDoms.reduce((s, d) => s + (d.yearly_amount ?? 0), 0)

  // ── Revenue by stream ─────────────────────────────────────────────────────

  const streams = [
    { key: 'projects',      label: 'Projects',      sub: 'active pipeline',    value: pipelineValue,   color: 'var(--navy)' },
    { key: 'maintenances',  label: 'Maintenances',  sub: 'annual retainers',   value: maintAnnual,     color: 'var(--amber)' },
    { key: 'hosting',       label: 'Hosting',       sub: 'annual equivalent',  value: hostingAnnual,   color: 'var(--blue)' },
    { key: 'domains',       label: 'Domains',       sub: 'yearly renewals',    value: totalYearlyCost, color: 'var(--green)' },
  ]
  const totalRevenue = streams.reduce((s, r) => s + r.value, 0)

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

        {/* ── Revenue by stream ── */}
        <div className="section-bar" style={{ marginBottom: 10 }}><h2>Revenue by Stream</h2></div>
        <div className="card" style={{ padding: 20, marginBottom: 28 }}>
          {streams.map(row => {
            const widthPct = totalRevenue > 0 ? Math.round((row.value / totalRevenue) * 100) : 0
            return (
              <div key={row.key} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: row.color, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--c1)' }}>{row.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--c3)' }}>{row.sub}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className="text-mono" style={{ fontWeight: 700, fontSize: 14 }}>{row.value > 0 ? fmtEur(row.value) : '—'}</span>
                    <span style={{ fontSize: 12, color: 'var(--c3)', marginLeft: 6 }}>{widthPct}%</span>
                  </div>
                </div>
                <div style={{ height: 7, background: 'var(--c6)', borderRadius: 100, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${widthPct}%`, background: row.color, borderRadius: 100, transition: 'width .4s' }} />
                </div>
              </div>
            )
          })}
          <div style={{ borderTop: '1px solid var(--c6)', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
            <span className="text-mono" style={{ fontWeight: 800, fontSize: 15, color: 'var(--navy)' }}>{totalRevenue > 0 ? fmtEur(totalRevenue) : '—'}</span>
          </div>
        </div>

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

        {totalDomains === 0 ? (
          <div className="card" style={{ marginBottom: 28, padding: '20px', textAlign: 'center', color: 'var(--c4)' }}>
            <div className="text-sm">No domains tracked yet</div>
          </div>
        ) : (
          <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(5,1fr)', marginBottom: 28 }}>
            <StatCard
              label="Total domains"
              value={String(totalDomains)}
              sub="registered"
              color="var(--navy)"
            />
            <StatCard
              label="Critical"
              value={String(criticalDoms.length)}
              sub="expires ≤ 7 days"
              color={criticalDoms.length > 0 ? 'var(--red)' : 'var(--c5)'}
            />
            <StatCard
              label="Expiring soon"
              value={String(soonDoms.length)}
              sub="expires ≤ 30 days"
              color={soonDoms.length > 0 ? 'var(--amber)' : 'var(--c5)'}
            />
            <StatCard
              label="Safe"
              value={String(safeDomCount)}
              sub="more than 30 days"
              color="var(--green)"
            />
            <StatCard
              label="Yearly domain cost"
              value={totalYearlyCost > 0 ? fmtEur(totalYearlyCost) : '—'}
              sub="across all domains"
              color="var(--c3)"
            />
          </div>
        )}

      </div>
    </div>
  )
}
