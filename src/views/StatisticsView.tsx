import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { useMaintenancesStore } from '../stores/maintenances'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import { usePipelineStore } from '../stores/pipeline'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €'
}

function fmtMonth(yyyymmdd: string): string {
  const d = new Date(yyyymmdd + 'T00:00:00')
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

/** Build an array of YYYY-MM-DD strings (first of month) relative to today */
function buildMonthRange(startOffset: number, endOffset: number): string[] {
  const today = new Date('2026-03-15T00:00:00')
  const result: string[] = []
  for (let i = startOffset; i <= endOffset; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    result.push(`${y}-${m}-01`)
  }
  return result
}

/** Build all 12 months of a given year as YYYY-MM-DD strings */
function buildYearMonths(year: number): string[] {
  const result: string[] = []
  for (let m = 1; m <= 12; m++) {
    result.push(`${year}-${String(m).padStart(2, '0')}-01`)
  }
  return result
}

const CURRENT_YEAR = 2026

// ── Sub-components ────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string
  sub?: string
  color?: string
}

function StatCard({ label, value, sub, color = 'var(--navy)' }: StatCardProps) {
  return (
    <div className="stat-card" style={{ '--left-color': color } as React.CSSProperties}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  )
}

function SectionHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="section-bar" style={{ marginBottom: 12 }}>
      <h2>{title}</h2>
      {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function StatisticsView() {
  const clientsStore  = useClientsStore()
  const projectsStore = useProjectsStore()
  const maintStore    = useMaintenancesStore()
  const revenueStore  = useRevenuePlannerStore()
  const infraStore    = useInfraStore()
  const domainsStore  = useDomainsStore()
  const pipelineStore = usePipelineStore()

  const [chartYear, setChartYear] = useState(CURRENT_YEAR)

  // Fetch on mount: current year months + next 6 months for forecast
  useEffect(() => {
    clientsStore.fetchAll()
    projectsStore.fetchAll()
    maintStore.fetchAll()
    infraStore.fetchAll()
    domainsStore.fetchAll()
    pipelineStore.fetchAll()
    const months = buildMonthRange(-11, 6)
    revenueStore.fetchByMonths(months)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch revenue data when chart year changes
  useEffect(() => {
    const months = [
      ...buildYearMonths(chartYear),
      ...buildMonthRange(0, 5),
    ]
    revenueStore.fetchByMonths(months)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartYear])

  const clients      = clientsStore.clients
  const projects     = projectsStore.projects
  const maintenances = maintStore.maintenances
  const rows         = revenueStore.rows
  const hostingClients = infraStore.hostingClients
  const pipelineItems  = pipelineStore.items
  const yearPrefix     = String(CURRENT_YEAR)

  // ── Section 1: Top KPIs ──────────────────────────────────────────────────

  const activeProjects = useMemo(() => projects.filter(p => p.status === 'active'), [projects])

  const activeMaintenances = useMemo(() => maintenances.filter(m => m.status === 'active'), [maintenances])

  const totalMaintMRR = useMemo(
    () => activeMaintenances.reduce((s, m) => s + m.monthly_retainer, 0),
    [activeMaintenances],
  )

  const hostingMRR = useMemo(
    () => hostingClients
      .filter(h => h.status === 'active')
      .reduce((s, h) => s + (h.cycle === 'monthly' ? h.amount : h.amount / 12), 0),
    [hostingClients],
  )

  const activePipelineItems = useMemo(
    () => pipelineItems.filter(p => p.status === 'proposal'),
    [pipelineItems],
  )

  const weightedPipelineValue = useMemo(
    () => pipelineItems
      .filter(p => p.status !== 'won' && p.status !== 'lost')
      .reduce((s, p) => s + ((p.estimated_amount ?? 0) * p.probability) / 100, 0),
    [pipelineItems],
  )

  const ytdRows = useMemo(
    () => rows.filter(r => r.month.startsWith(yearPrefix)),
    [rows, yearPrefix],
  )

  const ytdInvoiced = useMemo(
    () => ytdRows
      .filter(r => r.status === 'issued' || r.status === 'paid')
      .reduce((s, r) => s + (r.actual_amount ?? 0), 0),
    [ytdRows],
  )

  const ytdPlanned = useMemo(
    () => ytdRows
      .filter(r => r.status !== 'cost' && r.status !== 'deferred')
      .reduce((s, r) => s + (r.planned_amount ?? 0), 0),
    [ytdRows],
  )

  // Active clients = unique clients with at least one active project or active maintenance
  const activeClientIds = useMemo(() => {
    const ids = new Set<string>()
    activeProjects.forEach(p => { if (p.client_id) ids.add(p.client_id) })
    activeMaintenances.forEach(m => { ids.add(m.client_id) })
    return ids
  }, [activeProjects, activeMaintenances])

  // ── Section 2: Monthly Revenue Chart ──────────────────────────────────────

  const chartYearMonths = useMemo(() => buildYearMonths(chartYear), [chartYear])

  const monthlyRevenueData = useMemo(() => {
    return chartYearMonths.map(month => {
      const monthRows = rows.filter(r => r.month === month)
      const planned = monthRows
        .filter(r => r.status !== 'cost' && r.status !== 'deferred')
        .reduce((s, r) => s + (r.planned_amount ?? 0), 0)
      const actual = monthRows
        .filter(r => r.status === 'issued' || r.status === 'paid')
        .reduce((s, r) => s + (r.actual_amount ?? 0), 0)
      return { month: fmtMonth(month), planned, actual }
    })
  }, [rows, chartYearMonths])

  // Revenue by project type (from planned rows)
  const revenueByType = useMemo(() => {
    const map: Record<string, number> = { fixed: 0, maintenance: 0, variable: 0 }
    rows
      .filter(r => r.status !== 'cost' && r.status !== 'deferred' && r.project?.type)
      .forEach(r => {
        const t = r.project!.type
        map[t] = (map[t] ?? 0) + (r.planned_amount ?? 0)
      })
    return [
      { name: 'Fixed',       value: map.fixed,       color: 'var(--blue)' },
      { name: 'Maintenance', value: map.maintenance,  color: 'var(--amber)' },
      { name: 'Variable',    value: map.variable,     color: 'var(--green)' },
    ].filter(d => d.value > 0)
  }, [rows])

  // ── Section 3: Projects ──────────────────────────────────────────────────

  const projectStatusCounts = useMemo(() => {
    const statuses = ['active', 'paused', 'completed', 'cancelled'] as const
    return statuses.map(s => ({
      status: s,
      count: projects.filter(p => p.status === s).length,
    }))
  }, [projects])

  const top10Projects = useMemo(() => {
    return [...projects]
      .filter(p => (p.contract_value ?? 0) > 0)
      .sort((a, b) => (b.contract_value ?? 0) - (a.contract_value ?? 0))
      .slice(0, 10)
      .map(p => {
        const invoiced = rows
          .filter(r => r.project_id === p.id && (r.status === 'issued' || r.status === 'paid'))
          .reduce((s, r) => s + (r.actual_amount ?? 0), 0)
        const left = (p.contract_value ?? 0) - invoiced
        return { ...p, invoiced, left }
      })
  }, [projects, rows])

  const projectStatusChartData = useMemo(() => [
    { name: 'Active',    count: projects.filter(p => p.status === 'active').length },
    { name: 'Paused',    count: projects.filter(p => p.status === 'paused').length },
    { name: 'Completed', count: projects.filter(p => p.status === 'completed').length },
    { name: 'Cancelled', count: projects.filter(p => p.status === 'cancelled').length },
  ], [projects])

  // ── Section 4: Clients ────────────────────────────────────────────────────

  // Top 10 clients by YTD planned revenue
  const clientRevenueData = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>()
    ytdRows
      .filter(r => r.status !== 'cost' && r.status !== 'deferred')
      .forEach(r => {
        const clientId =
          r.project?.client_id ??
          r.maintenance?.client?.id ??
          r.hosting?.client?.id ??
          r.domain?.client?.id ??
          null
        const clientName =
          r.project ? clients.find(c => c.id === r.project!.client_id)?.name :
          r.maintenance?.client?.name ??
          r.hosting?.client?.name ??
          r.domain?.client?.name ?? null
        if (!clientId || !clientName) return
        const existing = map.get(clientId)
        if (existing) {
          existing.value += (r.planned_amount ?? 0)
        } else {
          map.set(clientId, { name: clientName, value: r.planned_amount ?? 0 })
        }
      })
    return [...map.values()]
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
  }, [ytdRows, clients])

  const clientTableData = useMemo(() => {
    return clients.map(c => {
      const activeProj = projects.filter(p => p.client_id === c.id && p.status === 'active').length
      const activeMaint = maintenances.filter(m => m.client_id === c.id && m.status === 'active').length
      const ytdRev = ytdRows
        .filter(r => {
          const cid = r.project?.client_id ?? r.maintenance?.client?.id ?? r.hosting?.client?.id ?? r.domain?.client?.id
          return cid === c.id && r.status !== 'cost' && r.status !== 'deferred'
        })
        .reduce((s, r) => s + (r.planned_amount ?? 0), 0)
      const pipeVal = pipelineItems
        .filter(p => p.client_id === c.id && p.status !== 'won' && p.status !== 'lost')
        .reduce((s, p) => s + ((p.estimated_amount ?? 0) * p.probability) / 100, 0)
      return { ...c, activeProj, activeMaint, ytdRev, pipeVal }
    })
      .filter(c => c.activeProj > 0 || c.activeMaint > 0 || c.ytdRev > 0)
      .sort((a, b) => b.ytdRev - a.ytdRev)
  }, [clients, projects, maintenances, ytdRows, pipelineItems])

  // ── Section 6: Pipeline ────────────────────────────────────────────────────

  const pipelineStatusData = useMemo(() => {
    const statuses = ['proposal', 'won', 'lost'] as const
    return statuses.map(s => ({
      name: s.charAt(0).toUpperCase() + s.slice(1),
      count: pipelineItems.filter(p => p.status === s).length,
    }))
  }, [pipelineItems])

  const activePipelineCount = useMemo(
    () => pipelineItems.filter(p => p.status !== 'won' && p.status !== 'lost').length,
    [pipelineItems],
  )

  // ── Section 7: Forecast (next 6 months) ──────────────────────────────────

  const next6Months = useMemo(() => buildMonthRange(0, 5), [])

  const forecastData = useMemo(() => {
    return next6Months.map(month => {
      const monthRows = rows.filter(r => r.month === month)
      const confirmed = monthRows
        .filter(r =>
          (r.status === 'issued' || r.status === 'planned' || r.status === 'retainer') &&
          r.probability === 100,
        )
        .reduce((s, r) => s + (r.planned_amount ?? 0), 0)
      const pipeWeighted = pipelineItems
        .filter(p => {
          if (p.status === 'won' || p.status === 'lost') return false
          if (!p.expected_month) return false
          const em = p.expected_month.substring(0, 7) + '-01'
          return em === month
        })
        .reduce((s, p) => s + ((p.estimated_amount ?? 0) * p.probability) / 100, 0)
      return { month: fmtMonth(month), confirmed, pipeline: Math.round(pipeWeighted) }
    })
  }, [rows, next6Months, pipelineItems])

  // ── Status badge helpers ──────────────────────────────────────────────────

  function projectStatusBadge(status: string) {
    const map: Record<string, string> = {
      active: 'badge badge-green',
      paused: 'badge badge-amber',
      completed: 'badge badge-navy',
      cancelled: 'badge badge-gray',
    }
    return map[status] ?? 'badge badge-gray'
  }

  function maintStatusBadge(status: string) {
    const map: Record<string, string> = {
      active: 'badge badge-green',
      paused: 'badge badge-amber',
      cancelled: 'badge badge-gray',
    }
    return map[status] ?? 'badge badge-gray'
  }

  function hostingStatusBadge(status: string) {
    const map: Record<string, string> = {
      active: 'badge badge-green',
      paused: 'badge badge-amber',
      cancelled: 'badge badge-gray',
    }
    return map[status] ?? 'badge badge-gray'
  }

  function pipelineBadge(status: string) {
    const map: Record<string, string> = {
      proposal:    'badge badge-blue',
      won:         'badge badge-green',
      lost:        'badge badge-red',
    }
    return map[status] ?? 'badge badge-gray'
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>Statistics</h1>
          <p>CEO dashboard — live across all data</p>
        </div>
      </div>

      {/* ── Section 1: Top KPI strip ── */}
      <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <StatCard
          label="Active Clients"
          value={String(activeClientIds.size)}
          sub={`of ${clients.length} total`}
          color="var(--navy)"
        />
        <StatCard
          label="Active Projects"
          value={String(activeProjects.length)}
          sub={`of ${projects.length} total`}
          color="var(--blue)"
        />
        <StatCard
          label="Maintenance Contracts"
          value={String(activeMaintenances.length)}
          sub={totalMaintMRR > 0 ? `${fmtEur(totalMaintMRR)} /mo` : undefined}
          color="var(--amber)"
        />
        <StatCard
          label="Hosting MRR"
          value={hostingMRR > 0 ? fmtEur(hostingMRR) : '—'}
          sub="active hosting clients"
          color="var(--green)"
        />
      </div>
      <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 0 }}>
        <StatCard
          label="Pipeline"
          value={String(activePipelineCount)}
          sub={weightedPipelineValue > 0 ? `weighted ${fmtEur(weightedPipelineValue)}` : 'open deals'}
          color="var(--navy)"
        />
        <StatCard
          label="YTD Invoiced"
          value={ytdInvoiced > 0 ? fmtEur(ytdInvoiced) : '—'}
          sub={`issued + paid in ${yearPrefix}`}
          color="var(--green)"
        />
        <StatCard
          label="YTD Planned"
          value={ytdPlanned > 0 ? fmtEur(ytdPlanned) : '—'}
          sub={`all planned in ${yearPrefix}`}
          color="var(--blue)"
        />
        <StatCard
          label="Active Pipeline Items"
          value={String(activePipelineItems.length)}
          sub="proposals in progress"
          color="var(--amber)"
        />
      </div>

      <div className="page-content">

        {/* ── Section 2: Revenue Overview ── */}
        <SectionHeader
          title={`Revenue Overview — ${chartYear}`}
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setChartYear(y => y - 1)}
                style={{ padding: '2px 8px', fontWeight: 700 }}
              >←</button>
              <span style={{ fontWeight: 700, fontSize: 14, minWidth: 36, textAlign: 'center' }}>{chartYear}</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setChartYear(y => y + 1)}
                style={{ padding: '2px 8px', fontWeight: 700 }}
              >→</button>
            </div>
          }
        />
        <div className="card" style={{ marginBottom: 28 }}>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyRevenueData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c6)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--c3)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--c3)' }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: unknown) => fmtEur(Number(v))} />
                <Legend />
                <Bar dataKey="planned" name="Planned" fill="var(--navy)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="actual"  name="Actual (Invoiced)" fill="var(--green)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {revenueByType.length > 0 && (
          <>
            <SectionHeader title="Revenue by Project Type" />
            <div className="card" style={{ marginBottom: 28 }}>
              <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
                <ResponsiveContainer width="40%" height={220}>
                  <PieChart>
                    <Pie
                      data={revenueByType}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
                      labelLine={false}
                    >
                      {revenueByType.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => fmtEur(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ flex: 1 }}>
                  {revenueByType.map(d => (
                    <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: d.color, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</span>
                      </div>
                      <span className="text-mono" style={{ fontSize: 14, fontWeight: 700 }}>{fmtEur(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Section 3: Projects ── */}
        <SectionHeader title="Projects" />

        <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
          {projectStatusCounts.map(s => (
            <StatCard
              key={s.status}
              label={s.status.charAt(0).toUpperCase() + s.status.slice(1)}
              value={String(s.count)}
              color={
                s.status === 'active' ? 'var(--green)' :
                s.status === 'paused' ? 'var(--amber)' :
                s.status === 'completed' ? 'var(--navy)' : 'var(--c4)'
              }
            />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
          {/* Projects by status horizontal bar */}
          <div className="card">
            <div className="card-body">
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>By Status</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  layout="vertical"
                  data={projectStatusChartData}
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--c6)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--c3)' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--c2)' }} width={70} />
                  <Tooltip />
                  <Bar dataKey="count" name="Projects" fill="var(--navy)" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top 5 projects by contract value (abbreviated) */}
          <div className="card">
            <div className="card-body">
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top 5 by Contract Value</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', paddingBottom: 6, color: 'var(--c3)', fontWeight: 600, fontSize: 11 }}>Project</th>
                    <th style={{ textAlign: 'right', paddingBottom: 6, color: 'var(--c3)', fontWeight: 600, fontSize: 11 }}>Contract</th>
                    <th style={{ textAlign: 'right', paddingBottom: 6, color: 'var(--c3)', fontWeight: 600, fontSize: 11 }}>Invoiced</th>
                  </tr>
                </thead>
                <tbody>
                  {top10Projects.slice(0, 5).map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--c6)' }}>
                      <td style={{ padding: '6px 0' }}>
                        <div style={{ fontWeight: 600, color: 'var(--c1)' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--c3)' }}>{p.client?.name ?? '—'}</div>
                      </td>
                      <td className="td-right text-mono" style={{ fontSize: 13 }}>{fmtEur(p.contract_value ?? 0)}</td>
                      <td className="td-right text-mono" style={{ fontSize: 13, color: p.invoiced > 0 ? 'var(--green)' : 'var(--c4)' }}>{p.invoiced > 0 ? fmtEur(p.invoiced) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Top 10 projects full table */}
        <div className="card" style={{ marginBottom: 28 }}>
          <div className="card-body">
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 13, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top 10 Projects by Contract Value</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Name</th>
                  <th style={{ textAlign: 'left', paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Client</th>
                  <th style={{ textAlign: 'left', paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Type</th>
                  <th style={{ textAlign: 'left', paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Status</th>
                  <th className="th-right" style={{ paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Contract</th>
                  <th className="th-right" style={{ paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Invoiced</th>
                  <th className="th-right" style={{ paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Left</th>
                </tr>
              </thead>
              <tbody>
                {top10Projects.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--c6)' }}>
                    <td style={{ padding: '8px 8px 8px 0', fontWeight: 600 }}>{p.name}</td>
                    <td style={{ padding: '8px 8px 8px 0', color: 'var(--c3)', fontSize: 12 }}>{p.client?.name ?? '—'}</td>
                    <td style={{ padding: '8px 8px 8px 0' }}>
                      <span className={`badge ${p.type === 'fixed' ? 'badge-navy' : p.type === 'maintenance' ? 'badge-amber' : 'badge-blue'}`}>
                        {p.type}
                      </span>
                    </td>
                    <td style={{ padding: '8px 8px 8px 0' }}>
                      <span className={projectStatusBadge(p.status)}>{p.status}</span>
                    </td>
                    <td className="td-right text-mono">{fmtEur(p.contract_value ?? 0)}</td>
                    <td className="td-right text-mono" style={{ color: p.invoiced > 0 ? 'var(--green)' : 'var(--c4)' }}>{p.invoiced > 0 ? fmtEur(p.invoiced) : '—'}</td>
                    <td className="td-right text-mono" style={{ color: p.left > 0 ? 'var(--c1)' : 'var(--c4)' }}>{p.left > 0 ? fmtEur(p.left) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Section 4: Clients ── */}
        <SectionHeader title="Clients" />

        {clientRevenueData.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-body">
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Clients by YTD Planned Revenue</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={clientRevenueData} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--c6)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--c3)' }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--c3)' }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: unknown) => fmtEur(Number(v))} />
                  <Bar dataKey="value" name="YTD Revenue" fill="var(--navy)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 28 }}>
          <div className="card-body">
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 13, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Client Overview</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Client</th>
                  <th className="th-right" style={{ paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Active Projects</th>
                  <th className="th-right" style={{ paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Maintenance</th>
                  <th className="th-right" style={{ paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>YTD Revenue</th>
                  <th className="th-right" style={{ paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Pipeline Value</th>
                </tr>
              </thead>
              <tbody>
                {clientTableData.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--c6)' }}>
                    <td style={{ padding: '8px 0', fontWeight: 600 }}>{c.name}</td>
                    <td className="td-right">{c.activeProj > 0 ? c.activeProj : <span style={{ color: 'var(--c4)' }}>—</span>}</td>
                    <td className="td-right">{c.activeMaint > 0 ? c.activeMaint : <span style={{ color: 'var(--c4)' }}>—</span>}</td>
                    <td className="td-right text-mono" style={{ color: c.ytdRev > 0 ? 'var(--c1)' : 'var(--c4)' }}>{c.ytdRev > 0 ? fmtEur(c.ytdRev) : '—'}</td>
                    <td className="td-right text-mono" style={{ color: c.pipeVal > 0 ? 'var(--blue)' : 'var(--c4)' }}>{c.pipeVal > 0 ? fmtEur(c.pipeVal) : '—'}</td>
                  </tr>
                ))}
                {clientTableData.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--c4)', padding: '20px 0' }}>No client data yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Section 5: Maintenance & Hosting ── */}
        <SectionHeader title="Maintenance & Hosting" />

        <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
          <StatCard
            label="Active Maintenances"
            value={String(activeMaintenances.length)}
            color="var(--amber)"
          />
          <StatCard
            label="Total Monthly Retainer"
            value={totalMaintMRR > 0 ? fmtEur(totalMaintMRR) : '—'}
            sub="per month"
            color="var(--amber)"
          />
          <StatCard
            label="Active Hosting Clients"
            value={String(hostingClients.filter(h => h.status === 'active').length)}
            color="var(--blue)"
          />
          <StatCard
            label="Hosting MRR"
            value={hostingMRR > 0 ? fmtEur(hostingMRR) : '—'}
            sub="monthly equivalent"
            color="var(--green)"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
          {/* Maintenance table */}
          <div className="card">
            <div className="card-body">
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Maintenance Portfolio</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', paddingBottom: 6, color: 'var(--c3)', fontWeight: 600, fontSize: 11 }}>Name / Client</th>
                    <th className="th-right" style={{ paddingBottom: 6, color: 'var(--c3)', fontWeight: 600, fontSize: 11 }}>Retainer/mo</th>
                    <th style={{ paddingBottom: 6, color: 'var(--c3)', fontWeight: 600, fontSize: 11, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenances.map(m => (
                    <tr key={m.id} style={{ borderTop: '1px solid var(--c6)' }}>
                      <td style={{ padding: '6px 0' }}>
                        <div style={{ fontWeight: 600, color: 'var(--c1)' }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--c3)' }}>{m.client?.name ?? '—'}</div>
                      </td>
                      <td className="td-right text-mono" style={{ fontSize: 12 }}>{fmtEur(m.monthly_retainer)}</td>
                      <td style={{ textAlign: 'center', padding: '6px 0' }}>
                        <span className={maintStatusBadge(m.status)}>{m.status}</span>
                      </td>
                    </tr>
                  ))}
                  {maintenances.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', color: 'var(--c4)', padding: '12px 0' }}>No maintenance contracts</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Hosting table */}
          <div className="card">
            <div className="card-body">
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hosting Revenue</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', paddingBottom: 6, color: 'var(--c3)', fontWeight: 600, fontSize: 11 }}>Client / Description</th>
                    <th className="th-right" style={{ paddingBottom: 6, color: 'var(--c3)', fontWeight: 600, fontSize: 11 }}>Amount</th>
                    <th style={{ paddingBottom: 6, color: 'var(--c3)', fontWeight: 600, fontSize: 11, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {hostingClients.map(h => (
                    <tr key={h.id} style={{ borderTop: '1px solid var(--c6)' }}>
                      <td style={{ padding: '6px 0' }}>
                        <div style={{ fontWeight: 600, color: 'var(--c1)' }}>{h.client?.name ?? '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--c3)' }}>{h.description ?? h.project_pn}</div>
                      </td>
                      <td className="td-right text-mono" style={{ fontSize: 12 }}>
                        {fmtEur(h.amount)}<span style={{ fontSize: 10, color: 'var(--c3)', marginLeft: 3 }}>/{h.cycle === 'monthly' ? 'mo' : 'yr'}</span>
                      </td>
                      <td style={{ textAlign: 'center', padding: '6px 0' }}>
                        <span className={hostingStatusBadge(h.status)}>{h.status}</span>
                      </td>
                    </tr>
                  ))}
                  {hostingClients.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', color: 'var(--c4)', padding: '12px 0' }}>No hosting clients</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Section 6: Pipeline ── */}
        <SectionHeader title="Pipeline" />

        <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
          {pipelineStatusData.map(s => (
            <StatCard
              key={s.name}
              label={s.name}
              value={String(s.count)}
              color={s.name === 'Won' ? 'var(--green)' : s.name === 'Lost' ? 'var(--red)' : 'var(--blue)'}
            />
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 16 }}>
          <div className="card">
            <div className="card-body">
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pipeline by Status</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  layout="vertical"
                  data={pipelineStatusData}
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--c6)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--c3)' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: 'var(--c2)' }} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" name="Items" fill="var(--blue)" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Weighted Pipeline Summary</div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--navy)', fontVariantNumeric: 'tabular-nums' }}>
                  {weightedPipelineValue > 0 ? fmtEur(weightedPipelineValue) : '—'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--c3)', marginTop: 2 }}>Weighted by probability</div>
              </div>
              <div style={{ borderTop: '1px solid var(--c6)', paddingTop: 12 }}>
                {pipelineItems
                  .filter(p => p.status !== 'won' && p.status !== 'lost')
                  .slice(0, 5)
                  .map(p => (
                    <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--c2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{p.title}</span>
                      <span className="text-mono" style={{ fontSize: 12, color: 'var(--blue)' }}>
                        {fmtEur(((p.estimated_amount ?? 0) * p.probability) / 100)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline items table */}
        <div className="card" style={{ marginBottom: 28 }}>
          <div className="card-body">
            <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 13, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pipeline Items</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Title</th>
                  <th style={{ textAlign: 'left', paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Client</th>
                  <th style={{ textAlign: 'left', paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Status</th>
                  <th className="th-right" style={{ paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Amount</th>
                  <th className="th-right" style={{ paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Prob.</th>
                  <th className="th-right" style={{ paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Weighted</th>
                  <th style={{ textAlign: 'left', paddingBottom: 8, color: 'var(--c3)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--c5)' }}>Expected</th>
                </tr>
              </thead>
              <tbody>
                {pipelineItems.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid var(--c6)' }}>
                    <td style={{ padding: '8px 0', fontWeight: 600 }}>{p.title}</td>
                    <td style={{ padding: '8px 8px 8px 0', color: 'var(--c3)', fontSize: 12 }}>{p.client?.name ?? p.company_name ?? '—'}</td>
                    <td style={{ padding: '8px 8px 8px 0' }}>
                      <span className={pipelineBadge(p.status)}>{p.status}</span>
                    </td>
                    <td className="td-right text-mono">{p.estimated_amount ? fmtEur(p.estimated_amount) : '—'}</td>
                    <td className="td-right">{p.probability}%</td>
                    <td className="td-right text-mono" style={{ color: 'var(--blue)' }}>
                      {p.estimated_amount ? fmtEur((p.estimated_amount * p.probability) / 100) : '—'}
                    </td>
                    <td style={{ padding: '8px 0', fontSize: 12, color: 'var(--c3)' }}>
                      {p.expected_month ? fmtMonth(p.expected_month.substring(0, 7) + '-01') : '—'}
                    </td>
                  </tr>
                ))}
                {pipelineItems.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--c4)', padding: '20px 0' }}>No pipeline items</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Section 7: Forecast ── */}
        <SectionHeader title="Forecast — Next 6 Months" />
        <div className="card" style={{ marginBottom: 28 }}>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={forecastData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c6)" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'var(--c3)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--c3)' }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: unknown) => fmtEur(Number(v))} />
                <Legend />
                <Bar dataKey="confirmed" name="Confirmed (100%)" fill="var(--navy)" radius={[2, 2, 0, 0]} stackId="a" />
                <Bar dataKey="pipeline"  name="Pipeline (weighted)" fill="var(--amber)" radius={[2, 2, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  )
}
