import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { useMaintenancesStore } from '../stores/maintenances'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { usePipelineStore } from '../stores/pipeline'
import { hostingAnnualValue } from '../lib/types'
import type { PipelineItem, InfrastructureCost } from '../lib/types'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

// ── Helpers ────────────────────────────────────────────────────────────────────

const NOW = new Date()
const CURRENT_YEAR = NOW.getFullYear()
const CURRENT_MONTH_IDX = NOW.getMonth()
const CURRENT_MONTH_STR = `${CURRENT_YEAR}-${String(CURRENT_MONTH_IDX + 1).padStart(2, '0')}-01`
const YTD_PREFIX = `${CURRENT_YEAR}-`

const ALL_MONTHS: string[] = []
for (let y = CURRENT_YEAR - 1; y <= CURRENT_YEAR + 1; y++) {
  for (let m = 1; m <= 12; m++) {
    ALL_MONTHS.push(`${y}-${String(m).padStart(2, '0')}-01`)
  }
}

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €'
}

function fmtMonth(s: string): string {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleString('en', { month: 'short', year: 'numeric' })
}

function shortMonth(s: string): string {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleString('en', { month: 'short' })
}


function costAnnualValue(c: InfrastructureCost): number {
  const yearStart = `${CURRENT_YEAR}-01-01`
  const yearEnd   = `${CURRENT_YEAR}-12-01`
  if (c.status === 'active') return c.monthly_cost * 12
  if (c.status === 'inactive' && c.cancelled_from) {
    if (c.cancelled_from <= yearStart) return 0
    const effEnd = c.cancelled_from < yearEnd ? c.cancelled_from : yearEnd
    const [sy, sm] = yearStart.split('-').map(Number)
    const [ey, em] = effEnd.split('-').map(Number)
    return Math.max(0, (ey - sy) * 12 + (em - sm)) * c.monthly_cost
  }
  return 0
}

function dealTotal(item: PipelineItem): number {
  if (item.deal_type === 'fixed' && item.monthly_schedule?.length) {
    return item.monthly_schedule.reduce((s, r) => s + r.amount, 0)
  }
  const amt = item.estimated_amount ?? 0
  if (item.deal_type === 'monthly' && item.expected_month && item.expected_end_month) {
    const s = new Date(item.expected_month + 'T00:00:00')
    const e = new Date(item.expected_end_month + 'T00:00:00')
    const cnt = Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1)
    return amt * cnt
  }
  return amt
}

// ── Chart components (Recharts) ────────────────────────────────────────────────

const CHART_COLORS = { navy: '#1a3a6c', green: '#16a34a', amber: '#d97706', blue: '#2563eb', red: '#dc2626' }

function eurFormatter(val: number) {
  return val >= 1000 ? `${Math.round(val / 1000)}k €` : `${val} €`
}

function ForecastChart({ data, currentMonth }: {
  data: { label: string; actual: number | null; plan: number | null; pipeline: number | null }[]
  currentMonth: string
}) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 24, left: 10, bottom: 5 }} barGap={3} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={eurFormatter} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={58} />
        <Tooltip
          formatter={(val, name) => { const n = Number(val); return [n > 0 ? `${n.toLocaleString('de-DE')} €` : '—', String(name)] }}
          contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <ReferenceLine x={currentMonth} stroke={CHART_COLORS.navy} strokeDasharray="4 3" strokeOpacity={0.4} strokeWidth={1.5} label={{ value: 'Today', position: 'top', fontSize: 10, fill: CHART_COLORS.navy }} />
        <Bar dataKey="plan" name="Confirmed Plan" fill={CHART_COLORS.navy} fillOpacity={0.35} radius={[3, 3, 0, 0]} />
        <Bar dataKey="actual" name="Invoiced" fill={CHART_COLORS.green} fillOpacity={0.85} radius={[3, 3, 0, 0]} />
        <Bar dataKey="pipeline" name="Pipeline" fill={CHART_COLORS.amber} fillOpacity={0.7} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function MonthlyChart({ data }: { data: { label: string; plan: number; actual: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 24, left: 10, bottom: 5 }} barGap={3} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={eurFormatter} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={58} />
        <Tooltip
          formatter={(val, name) => { const n = Number(val); return [`${n.toLocaleString('de-DE')} €`, String(name)] }}
          contentStyle={{ fontSize: 12, border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="plan" name="Plan" fill={CHART_COLORS.navy} fillOpacity={0.3} radius={[3, 3, 0, 0]} />
        <Bar dataKey="actual" name="Invoiced" fill={CHART_COLORS.green} fillOpacity={0.85} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function MiniBar({ value, max, color = 'var(--navy)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-[6px] bg-[var(--c6)] rounded-[3px] overflow-hidden min-w-[80px]">
      <div className="h-full rounded-[3px] transition-[width] duration-300 ease-in-out" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// ── Tab bar ────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'clients' | 'projects' | 'maintenance' | 'hosting' | 'crs' | 'sales'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview',     label: 'Overview' },
  { id: 'clients',      label: 'Clients' },
  { id: 'projects',     label: 'Projects' },
  { id: 'maintenance',  label: 'Maintenance' },
  { id: 'hosting',      label: 'Hosting & Domains' },
  { id: 'crs',          label: 'Change Requests' },
  { id: 'sales',        label: 'Sales' },
]

// ── Main component ─────────────────────────────────────────────────────────────

export function StatisticsView() {
  const [tab, setTab] = useState<Tab>('overview')

  const clientsStore  = useClientsStore()
  const projectsStore = useProjectsStore()
  const maintStore    = useMaintenancesStore()
  const infraStore    = useInfraStore()
  const domainsStore  = useDomainsStore()
  const rpStore       = useRevenuePlannerStore()
  const crStore       = useChangeRequestsStore()
  const pStore        = usePipelineStore()

  useEffect(() => {
    clientsStore.fetchAll()
    projectsStore.fetchAll()
    maintStore.fetchAll()
    infraStore.fetchAll()
    domainsStore.fetchAll()
    rpStore.fetchByMonths(ALL_MONTHS)
    crStore.fetchAllApproved()
    pStore.fetchAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clients      = clientsStore.clients
  const projects     = projectsStore.projects
  const maintenances = maintStore.maintenances
  const hosting      = infraStore.hostingClients
  const costs        = infraStore.infraCosts
  const domains      = domainsStore.domains
  const rows         = rpStore.rows
  const approvedCRs  = crStore.approvedCRs
  const pipeline     = pStore.items

  // ── Shared derivations ─────────────────────────────────────────────────────

  const ytdRows = useMemo(() => rows.filter(r => r.month.startsWith(YTD_PREFIX)), [rows])

  const totalInvoicedYTD = useMemo(() =>
    ytdRows.filter(r => r.status === 'issued' || r.status === 'paid').reduce((s, r) => s + (r.actual_amount ?? 0), 0)
  , [ytdRows])

  const mrrRetainers = useMemo(() =>
    rows.filter(r => r.month === CURRENT_MONTH_STR && r.status === 'retainer').reduce((s, r) => s + (r.planned_amount ?? 0), 0)
  , [rows])

  const mrrHosting = useMemo(() =>
    hosting.filter(h => h.status === 'active' && h.cycle === 'monthly').reduce((s, h) => s + h.amount, 0)
  , [hosting])

  const mrr = mrrRetainers + mrrHosting

  const activeProjects = useMemo(() => projects.filter(p => p.status === 'active'), [projects])

  const pipelineWeighted = useMemo(() =>
    pipeline.filter(p => p.status === 'proposal').reduce((s, p) => s + dealTotal(p) * (p.probability / 100), 0)
  , [pipeline])

  // ── Overview: Year forecast chart (Jan-Dec) ────────────────────────────────

  const yearForecastData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = `${CURRENT_YEAR}-${String(i + 1).padStart(2, '0')}-01`
      const mRows = rows.filter(r => r.month === month && r.status !== 'cost' && r.status !== 'deferred')
      const actual = mRows.filter(r => r.status === 'issued' || r.status === 'paid').reduce((s, r) => s + (r.actual_amount ?? 0), 0)
      const plan   = mRows.filter(r => r.status === 'planned' || r.status === 'retainer').reduce((s, r) => s + (r.planned_amount ?? 0), 0)
      const monthPfx = month.slice(0, 7)
      let pipelineWeighted = 0
      let pipelineBest = 0
      for (const p of pipeline) {
        if (p.status === 'won' || p.status === 'lost') continue
        let amt = 0
        if (p.deal_type === 'fixed' && p.monthly_schedule?.length) {
          const row = p.monthly_schedule.find(r => r.month === month)
          amt = row?.amount ?? 0
        } else if (p.deal_type === 'monthly' && p.expected_month && p.expected_end_month) {
          if (p.expected_month.slice(0, 7) <= monthPfx && p.expected_end_month.slice(0, 7) >= monthPfx) amt = p.estimated_amount ?? 0
        } else {
          if (p.expected_month?.slice(0, 7) === monthPfx) amt = p.estimated_amount ?? 0
        }
        pipelineWeighted += amt * (p.probability / 100)
        pipelineBest += amt
      }
      const isPast = month < CURRENT_MONTH_STR
      const isCurrent = month === CURRENT_MONTH_STR
      return {
        month,
        label: shortMonth(month),
        actual: isPast ? actual : null,
        plan: plan > 0 ? plan : null,
        pipeline: !isPast && pipelineBest > 0 ? pipelineBest : null,
        pipelineWeighted,
        pipelineBest,
        isPast,
        isCurrent,
      }
    })
  }, [rows, pipeline])

  const projectionSummary = useMemo(() => {
    const futureMonths = yearForecastData.filter(d => !d.isPast)
    const confirmedRemaining    = futureMonths.reduce((s, d) => s + (d.plan ?? 0), 0)
    const pipelineWeightedTotal = futureMonths.reduce((s, d) => s + d.pipelineWeighted, 0)
    const pipelineFaceTotal     = futureMonths.reduce((s, d) => s + d.pipelineBest, 0)
    return {
      confirmedRemaining,
      pipelineWeightedTotal,
      pipelineFaceTotal,
      projectedYearEnd: totalInvoicedYTD + confirmedRemaining + pipelineFaceTotal,
    }
  }, [yearForecastData, totalInvoicedYTD])

  // ── Overview: Plan vs Actual (this year, for MonthlyChart) ─────────────────

  const monthlyChartData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = `${CURRENT_YEAR}-${String(i + 1).padStart(2, '0')}-01`
      const mRows = rows.filter(r => r.month === month && r.status !== 'cost' && r.status !== 'deferred')
      // Plan = all planned amounts (retainer + planned + issued/paid at planned rate)
      const plan   = mRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
      // Actual = only what was issued/paid (actual billed amount)
      const actual = mRows.filter(r => r.status === 'issued' || r.status === 'paid').reduce((s, r) => s + (r.actual_amount ?? r.planned_amount ?? 0), 0)
      return { label: shortMonth(month), plan, actual }
    })
  }, [rows])

  // ── Overview: Revenue mix YTD ──────────────────────────────────────────────

  const revMix = useMemo(() => {
    // Projects: rpStore rows this year that belong to a project (not maintenance/hosting/domain)
    const projRows = ytdRows.filter(r => r.project_id && !r.maintenance_id && !r.hosting_client_id && !r.domain_id && r.status !== 'cost' && r.status !== 'deferred')
    const projects_amt = projRows.reduce((s, r) => s + (r.actual_amount ?? r.planned_amount ?? 0), 0)

    // Maintenance: directly from maintenances store — monthly_retainer × months active this year
    const yearStart = `${CURRENT_YEAR}-01`
    const yearEnd   = `${CURRENT_YEAR}-12`
    const maint_amt = maintenances.filter(m => m.status === 'active').reduce((s, m) => {
      const cStart = m.contract_start ? m.contract_start.slice(0, 7) : yearStart
      const cEnd   = m.contract_end   ? m.contract_end.slice(0, 7)   : yearEnd
      const effStart = cStart > yearStart ? cStart : yearStart
      const effEnd   = cEnd   < yearEnd   ? cEnd   : yearEnd
      if (effStart > effEnd) return s
      const [sy, sm] = effStart.split('-').map(Number)
      const [ey, em] = effEnd.split('-').map(Number)
      const months = (ey - sy) * 12 + (em - sm) + 1
      return s + m.monthly_retainer * months
    }, 0)

    // Hosting: directly from hostingClients annual value
    const host_amt = hosting.filter(h => h.status === 'active').reduce((s, h) => s + hostingAnnualValue(h), 0)

    // Domains: directly from domains yearly_amount
    const domain_amt = domains.filter(d => !d.archived && d.status !== 'expired').reduce((s, d) => s + (d.yearly_amount ?? 0), 0)

    const total = projects_amt + maint_amt + host_amt + domain_amt || 1
    return [
      { label: 'Projects',    amount: projects_amt, color: 'var(--navy)' },
      { label: 'Maintenance', amount: maint_amt,    color: 'var(--amber)' },
      { label: 'Hosting',     amount: host_amt,     color: 'var(--blue)' },
      { label: 'Domains',     amount: domain_amt,   color: 'var(--green)' },
    ].map(s => ({ ...s, pct: Math.round((s.amount / total) * 100) }))
  }, [ytdRows, maintenances, hosting, domains])

  // ── Overview: Top 5 clients by YTD ────────────────────────────────────────

  const top5Clients = useMemo(() => {
    const map = new Map<string, { name: string; amount: number }>()
    const invoicedRows = ytdRows.filter(r => r.status === 'issued' || r.status === 'paid')
    for (const r of invoicedRows) {
      const clientId =
        r.project?.client_id ??
        r.maintenance?.client?.id ??
        r.hosting?.client?.id ??
        r.domain?.client?.id
      if (!clientId) continue
      const clientName =
        r.project ? (clients.find(c => c.id === r.project!.client_id)?.name ?? clientId) :
        r.maintenance?.client?.name ?? r.hosting?.client?.name ?? r.domain?.client?.name ?? clientId
      const cur = map.get(clientId) ?? { name: clientName, amount: 0 }
      cur.amount += r.actual_amount ?? 0
      map.set(clientId, cur)
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 5)
  }, [ytdRows, clients])

  // ── Clients tab ───────────────────────────────────────────────────────────

  const clientRanking = useMemo(() => {
    const map = new Map<string, { name: string; amount: number; projectCount: number }>()
    for (const c of clients) {
      map.set(c.id, { name: c.name, amount: 0, projectCount: 0 })
    }
    const invoicedRows = ytdRows.filter(r => r.status === 'issued' || r.status === 'paid')
    for (const r of invoicedRows) {
      const clientId =
        r.project?.client_id ??
        r.maintenance?.client?.id ??
        r.hosting?.client?.id ??
        r.domain?.client?.id
      if (!clientId || !map.has(clientId)) continue
      map.get(clientId)!.amount += r.actual_amount ?? 0
    }
    for (const p of projects.filter(pr => pr.status === 'active')) {
      if (p.client_id && map.has(p.client_id)) map.get(p.client_id)!.projectCount++
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount)
  }, [clients, ytdRows, projects])

  const clientsWithActivity = useMemo(() => {
    const ids = new Set<string>()
    activeProjects.forEach(p => { if (p.client_id) ids.add(p.client_id) })
    maintenances.filter(m => m.status === 'active').forEach(m => ids.add(m.client_id))
    return ids.size
  }, [activeProjects, maintenances])

  const avgInvoicedPerClient = clientsWithActivity > 0 ? totalInvoicedYTD / clientsWithActivity : 0

  // ── Projects tab ──────────────────────────────────────────────────────────

  const completedThisYear = useMemo(() => projects.filter(p => p.status === 'completed'), [projects])
  const portfolioValue = useMemo(() => activeProjects.reduce((s, p) => s + (p.initial_contract_value ?? 0), 0), [activeProjects])
  const avgProjectValue = activeProjects.length > 0 ? portfolioValue / activeProjects.length : 0

  const projectsByType = useMemo(() => {
    const fixed = activeProjects.filter(p => p.type === 'fixed').length
    const maint = activeProjects.filter(p => p.type === 'maintenance').length
    const variable = activeProjects.filter(p => p.type === 'variable').length
    const total = activeProjects.length || 1
    return [
      { label: 'Fixed', count: fixed, pct: Math.round(fixed / total * 100) },
      { label: 'Recurring', count: maint, pct: Math.round(maint / total * 100) },
      { label: 'Variable', count: variable, pct: Math.round(variable / total * 100) },
    ]
  }, [activeProjects])

  const top10Projects = useMemo(() =>
    [...activeProjects].sort((a, b) => (b.initial_contract_value ?? 0) - (a.initial_contract_value ?? 0)).slice(0, 10)
  , [activeProjects])

  const projectStatusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of projects) { counts[p.status] = (counts[p.status] ?? 0) + 1 }
    return Object.entries(counts).map(([status, count]) => ({ status, count, pct: Math.round(count / projects.length * 100) }))
  }, [projects])

  const projectsEndingSoon = useMemo(() => {
    const now = Date.now()
    return activeProjects
      .filter(p => p.end_date)
      .map(p => ({ ...p, daysLeft: Math.ceil((new Date(p.end_date! + 'T00:00:00').getTime() - now) / 86_400_000) }))
      .filter(p => p.daysLeft >= 0 && p.daysLeft <= 60)
      .sort((a, b) => a.daysLeft - b.daysLeft)
  }, [activeProjects])

  // ── Hosting & Domains tab ─────────────────────────────────────────────────

  const activeHosting = useMemo(() => hosting.filter(h => h.status === 'active'), [hosting])
  const hostingPerYear = useMemo(() => hosting.reduce((s, h) => s + hostingAnnualValue(h), 0), [hosting])

  const providerStats = useMemo(() => {
    const map = new Map<string, { clients: number; revenue: number; cost: number }>()
    hosting.forEach(h => {
      const key = h.provider || '— Unassigned —'
      const cur = map.get(key) ?? { clients: 0, revenue: 0, cost: 0 }
      cur.clients += h.status === 'active' ? 1 : 0
      cur.revenue += hostingAnnualValue(h)
      map.set(key, cur)
    })
    costs.forEach(c => {
      const annual = costAnnualValue(c)
      if (annual === 0) return
      const key = c.provider || '— Unassigned —'
      const cur = map.get(key) ?? { clients: 0, revenue: 0, cost: 0 }
      cur.cost += annual
      map.set(key, cur)
    })
    return [...map.entries()]
      .map(([provider, d]) => ({ provider, ...d, margin: d.revenue - d.cost }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [hosting, costs])

  const totalHostRevenue = providerStats.reduce((s, p) => s + p.revenue, 0)
  const totalHostCost    = providerStats.reduce((s, p) => s + p.cost, 0)
  const totalHostMargin  = totalHostRevenue - totalHostCost

  const activeDomains   = useMemo(() => domains.filter(d => !d.archived && d.status !== 'expired'), [domains])
  const expiringSoon    = useMemo(() => domains.filter(d => d.status === 'expiring_soon' && !d.archived), [domains])
  const domainRevenueYr = useMemo(() => {
    const curYearStr = String(CURRENT_YEAR)
    const curMonthStr = CURRENT_MONTH_STR
    return domains.filter(d => {
      if (d.status === 'expired') return false
      if (!d.archived) return true
      const billingMonth = `${curYearStr}-${(d.registered_date ?? d.expiry_date).slice(5, 7)}-01`
      return billingMonth <= curMonthStr
    }).reduce((s, d) => s + (d.yearly_amount ?? 0), 0)
  }, [domains])

  const expiringSoon60 = useMemo(() => {
    const now = Date.now()
    return domains
      .filter(d => !d.archived)
      .map(d => ({ ...d, daysLeft: Math.ceil((new Date(d.expiry_date + 'T00:00:00').getTime() - now) / 86_400_000) }))
      .filter(d => d.daysLeft >= 0 && d.daysLeft <= 60)
      .sort((a, b) => a.daysLeft - b.daysLeft)
  }, [domains])

  // ── CRs tab ───────────────────────────────────────────────────────────────

  const totalCRValue = useMemo(() => approvedCRs.reduce((s, c) => s + (c.amount ?? 0), 0), [approvedCRs])
  const avgCRValue   = approvedCRs.length > 0 ? totalCRValue / approvedCRs.length : 0
  const maxCR        = useMemo(() => approvedCRs.reduce((m, c) => Math.max(m, c.amount ?? 0), 0), [approvedCRs])

  const crsBySource = useMemo(() => {
    const map = new Map<string, { label: string; count: number; total: number }>()
    for (const cr of approvedCRs) {
      const key = cr.project_id ?? cr.maintenance_id ?? 'unknown'
      const label = cr.project_id
        ? `${cr.project?.pn ?? ''} ${cr.project?.name ?? key}`.trim()
        : cr.maintenance_id
          ? (cr.maintenance?.name ?? key)
          : key
      const cur = map.get(key) ?? { label, count: 0, total: 0 }
      cur.count++
      cur.total += cr.amount ?? 0
      map.set(key, cur)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [approvedCRs])

  // ── Sales tab ─────────────────────────────────────────────────────────────

  const activeDeals = useMemo(() => pipeline.filter(p => p.status === 'proposal'), [pipeline])
  const wonThisYear = useMemo(() => pipeline.filter(p => p.status === 'won' && p.created_at.startsWith(YTD_PREFIX)), [pipeline])
  const lostThisYear = useMemo(() => pipeline.filter(p => p.status === 'lost' && p.created_at.startsWith(YTD_PREFIX)), [pipeline])
  const closedCount = wonThisYear.length + lostThisYear.length
  const winRate = closedCount > 0 ? Math.round(wonThisYear.length / closedCount * 100) : 0

  const dealsByStatus = useMemo(() => {
    const groups: Record<string, PipelineItem[]> = { proposal: [], won: [], lost: [] }
    for (const p of pipeline) { groups[p.status]?.push(p) }
    return Object.entries(groups).map(([status, items]) => ({
      status,
      count: items.length,
      value: items.reduce((s, p) => s + dealTotal(p), 0),
    }))
  }, [pipeline])

  const dealsByType = useMemo(() => {
    const groups: Record<string, PipelineItem[]> = { one_time: [], monthly: [], fixed: [] }
    for (const p of activeDeals) { groups[p.deal_type]?.push(p) }
    return [
      { type: 'one_time', label: 'One-time', ...groups },
      { type: 'monthly',  label: 'Monthly',  ...groups },
      { type: 'fixed',    label: 'Fixed',     ...groups },
    ].map(t => ({
      label: t.label,
      count: (groups[t.type] ?? []).length,
      value: (groups[t.type] ?? []).reduce((s, p) => s + dealTotal(p), 0),
    }))
  }, [activeDeals])

  const pipelineForecast = useMemo(() => {
    const months: string[] = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(CURRENT_YEAR, CURRENT_MONTH_IDX + i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
    }
    return months.map(m => {
      const deals = activeDeals.filter(p => p.expected_month?.slice(0, 7) === m.slice(0, 7))
      const faceValue = deals.reduce((s, p) => s + dealTotal(p), 0)
      const likely    = deals.filter(p => p.probability >= 50).reduce((s, p) => s + dealTotal(p), 0)
      const hopefully = deals.filter(p => p.probability >= 25).reduce((s, p) => s + dealTotal(p), 0)
      return { month: m, count: deals.length, faceValue, likely, hopefully }
    })
  }, [activeDeals])

  const topDeals = useMemo(() =>
    [...activeDeals].sort((a, b) => dealTotal(b) - dealTotal(a)).slice(0, 10)
  , [activeDeals])

  const activeDealsFaceValue = useMemo(() => activeDeals.reduce((s, p) => s + dealTotal(p), 0), [activeDeals])

  // ── Maintenance tab ───────────────────────────────────────────────────────

  const activeMaintenances = useMemo(() => maintenances.filter(m => m.status === 'active'), [maintenances])
  const totalMRR = useMemo(() => activeMaintenances.reduce((s, m) => s + m.monthly_retainer, 0), [activeMaintenances])
  const avgRetainer = activeMaintenances.length > 0 ? totalMRR / activeMaintenances.length : 0

  const maintEndingSoon = useMemo(() => {
    const now = Date.now()
    return activeMaintenances
      .filter(m => m.contract_end)
      .map(m => ({ ...m, daysLeft: Math.ceil((new Date(m.contract_end! + 'T00:00:00').getTime() - now) / 86_400_000) }))
      .filter(m => m.daysLeft >= 0 && m.daysLeft <= 60)
      .sort((a, b) => a.daysLeft - b.daysLeft)
  }, [activeMaintenances])

  const maintMonthlyChart = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const month = `${CURRENT_YEAR}-${String(i + 1).padStart(2, '0')}-01`
      const mRows = rows.filter(r => r.month === month && r.maintenance_id != null && r.status !== 'cost' && r.status !== 'deferred')
      const actual  = mRows.filter(r => r.status === 'issued' || r.status === 'paid').reduce((s, r) => s + (r.actual_amount ?? 0), 0)
      const plan    = mRows.filter(r => r.status === 'planned' || r.status === 'retainer').reduce((s, r) => s + (r.planned_amount ?? 0), 0)
      return { label: shortMonth(month), plan, actual }
    })
  }, [rows])

  const maintByClient = useMemo(() => {
    const map = new Map<string, { clientName: string; contracts: number; retainer: number }>()
    for (const m of activeMaintenances) {
      const clientName = clients.find(c => c.id === m.client_id)?.name ?? m.client_id
      const cur = map.get(m.client_id) ?? { clientName, contracts: 0, retainer: 0 }
      cur.contracts++
      cur.retainer += m.monthly_retainer
      map.set(m.client_id, cur)
    }
    return [...map.values()].sort((a, b) => b.retainer - a.retainer)
  }, [activeMaintenances, clients])

  // ── Domains alerts ────────────────────────────────────────────────────────

  const domainsExpiring30 = useMemo(() => {
    const now = Date.now()
    return domains.filter(d => !d.archived && Math.ceil((new Date(d.expiry_date + 'T00:00:00').getTime() - now) / 86_400_000) <= 30 && d.status !== 'expired').length
  }, [domains])

  const pipelineThisMonth = useMemo(() =>
    activeDeals.filter(p => p.expected_month?.startsWith(CURRENT_MONTH_STR.slice(0, 7))).length
  , [activeDeals])

  // ── Tab content ───────────────────────────────────────────────────────────

  function renderOverview() {
    const maxTop5 = top5Clients[0]?.amount ?? 1
    return (
      <>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">INVOICED YTD</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#16a34a]">{fmtEur(totalInvoicedYTD)}</div>
            <div className="text-xs text-muted-foreground mt-1">issued + paid {CURRENT_YEAR}</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">MRR</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(mrr)}</div>
            <div className="text-xs text-muted-foreground mt-1">retainers + hosting</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">ACTIVE PROJECTS</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{activeProjects.length}</div>
            <div className="text-xs text-muted-foreground mt-1">of {projects.length} total</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">PIPELINE WEIGHTED</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(pipelineWeighted)}</div>
            <div className="text-xs text-muted-foreground mt-1">{activeDeals.length} active deals</div>
          </div>
        </div>

        {/* Alerts */}
        {(domainsExpiring30 > 0 || pipelineThisMonth > 0) && (
          <div className="flex gap-2 pb-4 flex-wrap">
            {domainsExpiring30 > 0 && (
              <Badge variant="amber">{domainsExpiring30} domain{domainsExpiring30 > 1 ? 's' : ''} expiring ≤30 days</Badge>
            )}
            {pipelineThisMonth > 0 && (
              <Badge variant="blue">{pipelineThisMonth} deal{pipelineThisMonth > 1 ? 's' : ''} expected this month</Badge>
            )}
          </div>
        )}

        <div className="overflow-auto p-6 pt-0">

          {/* Year Forecast Chart */}
          <div className="flex items-center justify-between mb-3">
            <h2>Full Year Forecast — {CURRENT_YEAR}</h2>
            <span className="text-xs text-muted-foreground">Past: invoiced vs plan · Future: confirmed plan + pipeline</span>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col mb-6">
            <ForecastChart data={yearForecastData} currentMonth={shortMonth(CURRENT_MONTH_STR)} />
          </div>

          {/* Projection summary cards */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">INVOICED YTD</div>
              <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#16a34a]">{fmtEur(totalInvoicedYTD)}</div>
              <div className="text-xs text-muted-foreground mt-1">issued + paid so far</div>
            </div>
            <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">REMAINING CONFIRMED</div>
              <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(projectionSummary.confirmedRemaining)}</div>
              <div className="text-xs text-muted-foreground mt-1">planned rows remaining</div>
            </div>
            <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">PIPELINE TOTAL</div>
              <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(projectionSummary.pipelineFaceTotal)}</div>
              <div className="text-xs text-muted-foreground mt-1">weighted: {fmtEur(projectionSummary.pipelineWeightedTotal)}</div>
            </div>
            <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">PROJECTED YEAR-END</div>
              <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#2563eb]">{fmtEur(projectionSummary.projectedYearEnd)}</div>
              <div className="text-xs text-muted-foreground mt-1">confirmed + all pipeline</div>
            </div>
          </div>

          {/* Plan vs Actual this year */}
          <div className="flex items-center justify-between mb-3"><h2>Plan vs Actual — {CURRENT_YEAR}</h2></div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col mb-6">
            <MonthlyChart data={monthlyChartData} />
          </div>

          {/* Revenue Mix */}
          <div className="flex items-center justify-between mb-3"><h2>Revenue Mix — Planned {CURRENT_YEAR}</h2></div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col mb-6">
            {revMix.map(s => (
              <div key={s.label} className="grid items-center gap-3 mb-2.5" style={{ gridTemplateColumns: '120px 100px 1fr 48px' }}>
                <span className="text-[13px] font-semibold">{s.label}</span>
                <span className="text-[13px] text-[#374151] text-right">{fmtEur(s.amount)}</span>
                <MiniBar value={s.amount} max={totalInvoicedYTD} color={s.color} />
                <span className="text-xs text-muted-foreground text-right">{s.pct}%</span>
              </div>
            ))}
          </div>

          {/* Top 5 clients */}
          <div className="flex items-center justify-between mb-3"><h2>Top 5 Clients by Invoiced YTD</h2></div>
          <Card>
            <table>
              <thead>
                <tr>
                  <th className="w-[40px]">RANK</th>
                  <th>CLIENT</th>
                  <th className="text-right">INVOICED YTD</th>
                  <th className="w-[160px]">BAR</th>
                </tr>
              </thead>
              <tbody>
                {top5Clients.map((c, i) => (
                  <tr key={c.name}>
                    <td className="font-bold text-muted-foreground">#{i+1}</td>
                    <td className="font-semibold">{c.name}</td>
                    <td className="text-right font-bold text-[#16a34a]">{fmtEur(c.amount)}</td>
                    <td><MiniBar value={c.amount} max={maxTop5} color="var(--green)" /></td>
                  </tr>
                ))}
                {top5Clients.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-muted-foreground py-5">No invoiced revenue yet</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </>
    )
  }

  function renderClients() {
    const maxAmount = clientRanking[0]?.amount ?? 1
    const totalYTD = clientRanking.reduce((s, c) => s + c.amount, 0) || 1
    return (
      <>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">TOTAL CLIENTS</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{clients.length}</div>
            <div className="text-xs text-muted-foreground mt-1">in system</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">ACTIVE CLIENTS</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{clientsWithActivity}</div>
            <div className="text-xs text-muted-foreground mt-1">with active project or maintenance</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">AVG INVOICED / ACTIVE</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(avgInvoicedPerClient)}</div>
            <div className="text-xs text-muted-foreground mt-1">YTD per active client</div>
          </div>
        </div>
        <div className="overflow-auto p-6 pt-0">
          <div className="flex items-center justify-between mb-3"><h2>Client Revenue Ranking — YTD</h2></div>
          <Card>
            <table>
              <thead>
                <tr>
                  <th className="w-[40px]">RANK</th>
                  <th>CLIENT</th>
                  <th className="text-right">PROJECTS</th>
                  <th className="text-right">INVOICED YTD</th>
                  <th className="text-right">% OF TOTAL</th>
                  <th className="w-[120px]">BAR</th>
                </tr>
              </thead>
              <tbody>
                {clientRanking.map((c, i) => (
                  <tr key={c.name} className={c.amount === 0 ? 'opacity-50' : undefined}>
                    <td className="font-bold text-muted-foreground">#{i+1}</td>
                    <td className="font-semibold">{c.name}</td>
                    <td className="text-right">{c.projectCount}</td>
                    <td className={`text-right ${c.amount > 0 ? 'font-bold text-[#16a34a]' : 'text-muted-foreground'}`}>
                      {c.amount > 0 ? fmtEur(c.amount) : '—'}
                    </td>
                    <td className="text-right text-muted-foreground">
                      {c.amount > 0 ? Math.round(c.amount / totalYTD * 100) + '%' : '—'}
                    </td>
                    <td>
                      {c.amount > 0 && <MiniBar value={c.amount} max={maxAmount} color="var(--navy)" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </>
    )
  }

  function renderProjects() {
    const maxProjVal = top10Projects[0]?.initial_contract_value ?? 1
    return (
      <>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">ACTIVE PROJECTS</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{activeProjects.length}</div>
            <div className="text-xs text-muted-foreground mt-1">of {projects.length} total</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">COMPLETED THIS YEAR</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{completedThisYear.length}</div>
            <div className="text-xs text-muted-foreground mt-1">status = completed</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">PORTFOLIO VALUE</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(portfolioValue)}</div>
            <div className="text-xs text-muted-foreground mt-1">sum of active contracts</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">AVG PROJECT VALUE</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(avgProjectValue)}</div>
            <div className="text-xs text-muted-foreground mt-1">active only</div>
          </div>
        </div>
        <div className="overflow-auto p-6 pt-0">
          {/* Type breakdown */}
          <div className="flex items-center justify-between mb-3"><h2>Project Type Breakdown</h2></div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {projectsByType.map(t => (
              <div key={t.label} className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
                <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">{t.label.toUpperCase()}</div>
                <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{t.count}</div>
                <div className="mt-1.5"><MiniBar value={t.count} max={activeProjects.length} color="var(--navy)" /></div>
                <div className="text-xs text-muted-foreground mt-1">{t.pct}%</div>
              </div>
            ))}
          </div>

          {/* Top 10 by value */}
          <div className="flex items-center justify-between mb-3"><h2>Top 10 Active Projects by Value</h2></div>
          <Card>
            <table>
              <thead>
                <tr>
                  <th>PROJECT</th>
                  <th>CLIENT</th>
                  <th className="text-right">VALUE</th>
                  <th className="w-[160px]">BAR</th>
                </tr>
              </thead>
              <tbody>
                {top10Projects.map(p => (
                  <tr key={p.id}>
                    <td><Badge variant="gray" className="mr-1.5">{p.pn}</Badge>{p.name}</td>
                    <td className="text-muted-foreground text-[13px]">{p.client?.name ?? '—'}</td>
                    <td className="text-right font-bold text-primary">{fmtEur(p.initial_contract_value ?? 0)}</td>
                    <td><MiniBar value={p.initial_contract_value ?? 0} max={maxProjVal} color="var(--navy)" /></td>
                  </tr>
                ))}
                {top10Projects.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-muted-foreground py-5">No active projects</td></tr>
                )}
              </tbody>
            </table>
          </Card>

          {/* Status overview */}
          <div className="flex items-center justify-between mb-3"><h2>Status Overview</h2></div>
          <Card>
            <table>
              <thead><tr><th>STATUS</th><th className="text-right">COUNT</th><th className="text-right">%</th></tr></thead>
              <tbody>
                {projectStatusBreakdown.map(s => (
                  <tr key={s.status}>
                    <td><Badge variant={s.status === 'active' ? 'green' : s.status === 'completed' ? 'blue' : s.status === 'paused' ? 'amber' : 'gray'}>{s.status}</Badge></td>
                    <td className="text-right">{s.count}</td>
                    <td className="text-right text-muted-foreground">{s.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Ending soon */}
          {projectsEndingSoon.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3"><h2>Ending Within 60 Days</h2></div>
              <Card>
                <table>
                  <thead><tr><th>PROJECT</th><th>CLIENT</th><th className="text-right">END DATE</th><th className="text-right">DAYS LEFT</th></tr></thead>
                  <tbody>
                    {projectsEndingSoon.map(p => (
                      <tr key={p.id}>
                        <td><Badge variant="gray" className="mr-1.5">{p.pn}</Badge>{p.name}</td>
                        <td className="text-muted-foreground text-[13px]">{p.client?.name ?? '—'}</td>
                        <td className="text-right">{new Date(p.end_date! + 'T00:00:00').toLocaleDateString('sl-SI')}</td>
                        <td className="text-right"><Badge variant={p.daysLeft <= 14 ? 'red' : 'amber'}>{p.daysLeft}d</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </div>
      </>
    )
  }

  function renderHosting() {
    return (
      <>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">ACTIVE HOSTING CLIENTS</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{activeHosting.length}</div>
            <div className="text-xs text-muted-foreground mt-1">{hosting.filter(h=>h.status==='cancelled').length} cancelled</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">HOSTING REVENUE / YR</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(hostingPerYear)}</div>
            <div className="text-xs text-muted-foreground mt-1">across all providers</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">HOSTING COST / YR</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#dc2626]">{fmtEur(totalHostCost)}</div>
            <div className="text-xs text-muted-foreground mt-1">active infra costs</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">MARGIN / YR</div>
            <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${totalHostMargin >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{fmtEur(totalHostMargin)}</div>
            <div className="text-xs text-muted-foreground mt-1">{totalHostRevenue > 0 ? Math.round(totalHostMargin / totalHostRevenue * 100) : 0}% margin</div>
          </div>
        </div>

        <div className="overflow-auto p-6 pt-0">
          <div className="flex items-center justify-between mb-3"><h2>Hosting Revenue vs Cost by Provider</h2></div>
          <Card>
            {providerStats.length === 0 ? (
              <div className="px-7 py-7 text-center text-muted-foreground text-[13px]">No hosting data yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>PROVIDER</th>
                    <th className="text-right">CLIENTS</th>
                    <th className="text-right">REVENUE / YR</th>
                    <th className="text-right">COST / YR</th>
                    <th className="text-right">MARGIN / YR</th>
                    <th className="text-right">MARGIN %</th>
                  </tr>
                </thead>
                <tbody>
                  {providerStats.map(p => {
                    const marginPct = p.revenue > 0 ? Math.round(p.margin / p.revenue * 100) : 0
                    return (
                      <tr key={p.provider}>
                        <td className="font-bold">{p.provider}</td>
                        <td className="text-right">{p.clients}</td>
                        <td className="text-right font-semibold text-[#16a34a]">{fmtEur(p.revenue)}</td>
                        <td className="text-right text-[#dc2626]">{fmtEur(p.cost)}</td>
                        <td className={`text-right font-semibold ${p.margin >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{fmtEur(p.margin)}</td>
                        <td className="text-right">
                          <Badge variant={marginPct >= 50 ? 'green' : marginPct >= 0 ? 'amber' : 'red'}>{marginPct}%</Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#f3f4f6]">
                    <td className="font-bold">Total</td>
                    <td className="text-right text-muted-foreground">{activeHosting.length}</td>
                    <td className="text-right font-extrabold text-[#16a34a]">{fmtEur(totalHostRevenue)}</td>
                    <td className="text-right font-bold text-[#dc2626]">{fmtEur(totalHostCost)}</td>
                    <td className={`text-right font-extrabold ${totalHostMargin >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{fmtEur(totalHostMargin)}</td>
                    <td className="text-right">
                      <Badge variant={totalHostRevenue > 0 && Math.round(totalHostMargin/totalHostRevenue*100) >= 50 ? 'green' : totalHostRevenue > 0 && Math.round(totalHostMargin/totalHostRevenue*100) >= 0 ? 'amber' : 'red'}>
                        {totalHostRevenue > 0 ? Math.round(totalHostMargin / totalHostRevenue * 100) : 0}%
                      </Badge>
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Card>

          {/* Domain stats */}
          <div className="flex items-center justify-between mb-3"><h2>Domain Statistics</h2></div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">TOTAL DOMAINS</div>
              <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{activeDomains.length}</div>
              <div className="text-xs text-muted-foreground mt-1">{domains.filter(d=>d.archived).length} archived</div>
            </div>
            <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">EXPIRING SOON</div>
              <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${expiringSoon.length > 0 ? 'text-[#d97706]' : 'text-foreground'}`}>{expiringSoon.length}</div>
              <div className="text-xs text-muted-foreground mt-1">within 30 days</div>
            </div>
            <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">EXPIRING ≤60 DAYS</div>
              <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${expiringSoon60.length > 0 ? 'text-[#d97706]' : 'text-foreground'}`}>{expiringSoon60.length}</div>
              <div className="text-xs text-muted-foreground mt-1">{expiringSoon60.filter(d=>d.daysLeft<=7).length} critical (≤7d)</div>
            </div>
            <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">DOMAIN REVENUE / YR</div>
              <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(domainRevenueYr)}</div>
              <div className="text-xs text-muted-foreground mt-1">billable domains</div>
            </div>
          </div>

          {expiringSoon60.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3"><h2>Expiring Within 60 Days</h2></div>
              <Card>
                <table>
                  <thead>
                    <tr>
                      <th>DOMAIN</th>
                      <th>CLIENT</th>
                      <th className="text-right">EXPIRY</th>
                      <th className="text-right">DAYS LEFT</th>
                      <th className="text-right">AUTO-RENEW</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringSoon60.map(d => (
                      <tr key={d.id}>
                        <td className="font-semibold">{d.domain_name}</td>
                        <td className="text-muted-foreground">{d.client?.name ?? '—'}</td>
                        <td className="text-right">{new Date(d.expiry_date + 'T00:00:00').toLocaleDateString('sl-SI')}</td>
                        <td className="text-right"><Badge variant={d.daysLeft <= 7 ? 'red' : d.daysLeft <= 30 ? 'amber' : 'blue'}>{d.daysLeft}d</Badge></td>
                        <td className="text-right"><Badge variant={d.auto_renew ? 'green' : 'gray'}>{d.auto_renew ? 'Yes' : 'No'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </div>
      </>
    )
  }

  function renderCRs() {
    return (
      <>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">TOTAL APPROVED CRs</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{approvedCRs.length}</div>
            <div className="text-xs text-muted-foreground mt-1">status = approved</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">TOTAL CR VALUE</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(totalCRValue)}</div>
            <div className="text-xs text-muted-foreground mt-1">approved CRs</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">AVG CR VALUE</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(avgCRValue)}</div>
            <div className="text-xs text-muted-foreground mt-1">per approved CR</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">LARGEST CR</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(maxCR)}</div>
            <div className="text-xs text-muted-foreground mt-1">single CR value</div>
          </div>
        </div>
        <div className="overflow-auto p-6 pt-0">
          <div className="flex items-center justify-between mb-3"><h2>CRs by Project / Maintenance</h2></div>
          <Card>
            {crsBySource.length === 0 ? (
              <div className="px-7 py-7 text-center text-muted-foreground text-[13px]">No approved CRs yet.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>SOURCE</th>
                    <th className="text-right"># CRs</th>
                    <th className="text-right">TOTAL VALUE</th>
                    <th className="text-right">AVG VALUE</th>
                  </tr>
                </thead>
                <tbody>
                  {crsBySource.map(s => (
                    <tr key={s.label}>
                      <td className="font-semibold">{s.label}</td>
                      <td className="text-right">{s.count}</td>
                      <td className="text-right font-bold text-[#16a34a]">{fmtEur(s.total)}</td>
                      <td className="text-right text-muted-foreground">{fmtEur(s.count > 0 ? s.total / s.count : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </>
    )
  }

  function renderSales() {
    const maxDealVal = topDeals[0] ? dealTotal(topDeals[0]) : 1
    const maxForecast = Math.max(...pipelineForecast.map(m => m.faceValue), 1)
    return (
      <>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">ACTIVE DEALS</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{activeDeals.length}</div>
            <div className="text-xs text-muted-foreground mt-1">{fmtEur(activeDealsFaceValue)} face value</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">WON THIS YEAR</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#16a34a]">{wonThisYear.length}</div>
            <div className="text-xs text-muted-foreground mt-1">{fmtEur(wonThisYear.reduce((s,p) => s + dealTotal(p), 0))}</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">LOST THIS YEAR</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#dc2626]">{lostThisYear.length}</div>
            <div className="text-xs text-muted-foreground mt-1">{fmtEur(lostThisYear.reduce((s,p) => s + dealTotal(p), 0))}</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">WIN RATE</div>
            <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${winRate >= 50 ? 'text-[#16a34a]' : 'text-[#d97706]'}`}>{winRate}%</div>
            <div className="text-xs text-muted-foreground mt-1">{closedCount} closed deals</div>
          </div>
        </div>
        <div className="overflow-auto p-6 pt-0">
          {/* Pipeline by stage */}
          <div className="flex items-center justify-between mb-3"><h2>Pipeline by Stage</h2></div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col mb-6">
            {dealsByStatus.map(s => (
              <div key={s.status} className="grid items-center gap-3 mb-2.5" style={{ gridTemplateColumns: '100px 60px 120px 1fr' }}>
                <Badge variant={s.status === 'won' ? 'green' : s.status === 'lost' ? 'red' : 'amber'}>{s.status}</Badge>
                <span className="text-[13px] font-bold">{s.count}</span>
                <span className="text-[13px] text-[#374151]">{fmtEur(s.value)}</span>
                <MiniBar value={s.count} max={pipeline.length || 1} color={s.status === 'won' ? 'var(--green)' : s.status === 'lost' ? 'var(--red)' : 'var(--amber)'} />
              </div>
            ))}
          </div>

          {/* Deal type breakdown */}
          <div className="flex items-center justify-between mb-3"><h2>Deal Type Breakdown (Active)</h2></div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {dealsByType.map(t => (
              <div key={t.label} className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
                <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">{t.label.toUpperCase()}</div>
                <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{t.count}</div>
                <div className="text-xs text-muted-foreground mt-1">{fmtEur(t.value)}</div>
              </div>
            ))}
          </div>

          {/* Forecast by month */}
          <div className="flex items-center justify-between mb-3"><h2>Pipeline Forecast — Next 6 Months</h2></div>
          <Card>
            <table>
              <thead>
                <tr>
                  <th>MONTH</th>
                  <th className="text-right">DEALS</th>
                  <th className="text-right">FACE VALUE</th>
                  <th className="text-right">LIKELY (≥50%)</th>
                  <th className="text-right">HOPEFULLY (≥25%)</th>
                  <th className="w-[120px]">BAR</th>
                </tr>
              </thead>
              <tbody>
                {pipelineForecast.map(m => (
                  <tr key={m.month}>
                    <td className="font-semibold">{fmtMonth(m.month)}</td>
                    <td className="text-right">{m.count}</td>
                    <td className="text-right font-bold">{m.faceValue > 0 ? fmtEur(m.faceValue) : '—'}</td>
                    <td className="text-right text-[#16a34a]">{m.likely > 0 ? fmtEur(m.likely) : '—'}</td>
                    <td className="text-right text-[#2563eb]">{m.hopefully > 0 ? fmtEur(m.hopefully) : '—'}</td>
                    <td><MiniBar value={m.faceValue} max={maxForecast} color="var(--navy)" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Top deals */}
          <div className="flex items-center justify-between mb-3"><h2>Top Active Deals</h2></div>
          <Card>
            {topDeals.length === 0 ? (
              <div className="px-7 py-7 text-center text-muted-foreground text-[13px]">No active deals.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>COMPANY</th>
                    <th>TITLE</th>
                    <th>TYPE</th>
                    <th className="text-right">AMOUNT</th>
                    <th className="text-right">PROB.</th>
                    <th>EXPECTED</th>
                    <th className="w-[100px]">BAR</th>
                  </tr>
                </thead>
                <tbody>
                  {topDeals.map(p => (
                    <tr key={p.id}>
                      <td className="font-semibold">{p.company_name ?? p.client?.name ?? '—'}</td>
                      <td className="text-[13px]">{p.title}</td>
                      <td><Badge variant="gray">{p.deal_type}</Badge></td>
                      <td className="text-right font-bold">{fmtEur(dealTotal(p))}</td>
                      <td className="text-right"><Badge variant={p.probability >= 75 ? 'green' : p.probability >= 50 ? 'blue' : p.probability >= 25 ? 'amber' : 'gray'}>{p.probability}%</Badge></td>
                      <td className="text-[13px] text-muted-foreground">{p.expected_month ? fmtMonth(p.expected_month) : '—'}</td>
                      <td><MiniBar value={dealTotal(p)} max={maxDealVal} color="var(--navy)" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </>
    )
  }

  function renderMaintenance() {
    const maxRetainer = maintByClient[0]?.retainer ?? 1
    return (
      <>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">ACTIVE CONTRACTS</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{activeMaintenances.length}</div>
            <div className="text-xs text-muted-foreground mt-1">of {maintenances.length} total</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">TOTAL MRR</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#d97706]">{fmtEur(totalMRR)}</div>
            <div className="text-xs text-muted-foreground mt-1">monthly retainers</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">ANNUAL RETAINER VALUE</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(totalMRR * 12)}</div>
            <div className="text-xs text-muted-foreground mt-1">if all contracts run full year</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">AVG RETAINER</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEur(avgRetainer)}</div>
            <div className="text-xs text-muted-foreground mt-1">per active contract / mo</div>
          </div>
        </div>

        {maintEndingSoon.length > 0 && (
          <div className="pb-4">
            {maintEndingSoon.map(m => (
              <div key={m.id} className="rounded-lg border border-[#fcd34d] bg-[#fef9ee] px-3 py-2 text-sm text-[#92400e] mb-1.5">
                <strong>{m.name}</strong> — contract ends in {m.daysLeft} day{m.daysLeft !== 1 ? 's' : ''} ({m.contract_end})
              </div>
            ))}
          </div>
        )}

        <div className="overflow-auto p-6 pt-0">
          <div className="flex items-center justify-between mb-3"><h2>Monthly Maintenance Revenue — {CURRENT_YEAR}</h2></div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col mb-6">
            <MonthlyChart data={maintMonthlyChart} />
          </div>

          <div className="flex items-center justify-between mb-3"><h2>Retainer by Client</h2></div>
          <Card>
            <table>
              <thead>
                <tr>
                  <th>CLIENT</th>
                  <th className="text-right">CONTRACTS</th>
                  <th className="text-right">MONTHLY RETAINER</th>
                  <th className="text-right">ANNUAL</th>
                  <th className="w-[160px]">BAR</th>
                </tr>
              </thead>
              <tbody>
                {maintByClient.map(c => (
                  <tr key={c.clientName}>
                    <td className="font-semibold">{c.clientName}</td>
                    <td className="text-right">{c.contracts}</td>
                    <td className="text-right font-bold text-[#d97706]">{fmtEur(c.retainer)}</td>
                    <td className="text-right text-[#374151]">{fmtEur(c.retainer * 12)}</td>
                    <td><MiniBar value={c.retainer} max={maxRetainer} color="var(--amber)" /></td>
                  </tr>
                ))}
                {maintByClient.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-5">No active maintenance contracts</td></tr>
                )}
              </tbody>
              {maintByClient.length > 0 && (
                <tfoot>
                  <tr className="bg-[#f9fafb] border-t-2 border-[#e5e7eb]">
                    <td colSpan={2} className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.05em]">Total</td>
                    <td className="text-right font-bold text-[#d97706]">{fmtEur(totalMRR)}</td>
                    <td className="text-right font-bold text-[#374151]">{fmtEur(totalMRR * 12)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </Card>

          <div className="flex items-center justify-between mb-3"><h2>Active Contracts</h2></div>
          <Card>
            <table>
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>CLIENT</th>
                  <th className="text-right">RETAINER / MO</th>
                  <th className="text-right">HRS / MO</th>
                  <th>CONTRACT</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {activeMaintenances.map(m => {
                  const clientName = clients.find(c => c.id === m.client_id)?.name ?? '—'
                  const now = Date.now()
                  const daysLeft = m.contract_end ? Math.ceil((new Date(m.contract_end + 'T00:00:00').getTime() - now) / 86_400_000) : null
                  return (
                    <tr key={m.id}>
                      <td className="font-semibold">{m.name}</td>
                      <td className="text-muted-foreground text-[13px]">{clientName}</td>
                      <td className="text-right font-bold text-[#d97706]">{fmtEur(m.monthly_retainer)}</td>
                      <td className="text-right">{m.hours_included ?? '—'}</td>
                      <td className={`text-xs ${daysLeft !== null && daysLeft <= 30 ? 'text-[#dc2626]' : 'text-muted-foreground'}`}>
                        {m.contract_start ? m.contract_start.slice(0,7) : '—'} → {m.contract_end ? m.contract_end.slice(0,7) : '∞'}
                        {daysLeft !== null && daysLeft <= 60 && <Badge variant="amber" className="ml-1.5">{daysLeft}d left</Badge>}
                      </td>
                      <td><Badge variant="green">Active</Badge></td>
                    </tr>
                  )
                })}
                {activeMaintenances.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted-foreground py-5">No active contracts</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Statistics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Agency intelligence overview</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b-2 border-[#e5e7eb] flex px-5 gap-0.5 bg-white">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-[13px] rounded-t-lg border-none cursor-pointer transition-colors -mb-0.5 ${tab === t.id ? 'font-bold bg-primary text-white' : 'font-medium bg-transparent text-muted-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-6 pt-4">
        {tab === 'overview'     && renderOverview()}
        {tab === 'clients'      && renderClients()}
        {tab === 'projects'     && renderProjects()}
        {tab === 'maintenance'  && renderMaintenance()}
        {tab === 'hosting'      && renderHosting()}
        {tab === 'crs'          && renderCRs()}
        {tab === 'sales'        && renderSales()}
      </div>
    </div>
  )
}
