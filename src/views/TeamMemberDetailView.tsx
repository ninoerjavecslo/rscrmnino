import { useEffect, useState, useMemo, type ReactNode } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useResourceStore } from '../stores/resource'
import { useProjectsStore } from '../stores/projects'
import { useHolidayStore } from '../stores/holidays'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { TimeOff, AllocationCategory, MemberProject } from '../lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

const CAT_COLORS: Record<AllocationCategory, string> = {
  project: 'var(--navy)',
  maintenance: 'var(--green)',
  internal: 'var(--blue)',
  meeting: 'var(--amber)',
  admin: 'var(--c3)',
  leave: 'var(--red)',
  sales: '#7c3aed',
}

const STATUS_BORDER: Record<string, string> = {
  active: 'var(--green)',
  paused: 'var(--amber)',
  completed: 'var(--c4)',
  cancelled: 'var(--red)',
}

type StatusBadgeVariant = 'green' | 'amber' | 'gray' | 'red'
const STATUS_BADGE: Record<string, StatusBadgeVariant> = {
  active: 'green',
  paused: 'amber',
  completed: 'gray',
  cancelled: 'red',
}

type TypeBadgeVariant = 'navy' | 'blue' | 'amber'
const TYPE_BADGE: Record<string, TypeBadgeVariant> = {
  fixed: 'navy',
  maintenance: 'blue',
  variable: 'amber',
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const fmt = (n: number) => String(Math.round(n * 10) / 10)

const fmtDate = (d: string) => {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function workingDays(start: string, end: string) {
  let count = 0
  const d = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  while (d <= e) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

type MemberTab = 'overview' | 'projects' | 'timeoff'

interface AllocationRow {
  category: AllocationCategory
  hours: number
  date: string
  label?: string | null
  project?: { id: string; pn: string; name: string } | null
}

// ── Tab Icons ────────────────────────────────────────────────────────────────
function OverviewIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
}
function ProjectsIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
}
function TimeOffIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
}

export function TeamMemberDetailView() {
  const { id } = useParams<{ id: string }>()
  const {
    members, fetchMembers, fetchTeams,
    timeOff, fetchTimeOff, addTimeOff, removeTimeOff,
    memberProjects, fetchMemberProjects, addMemberProject, removeMemberProject,
  } = useResourceStore()
  const pStore = useProjectsStore()
  const { holidays, fetchAll: fetchHolidays } = useHolidayStore()

  const [activeTab, setActiveTab] = useState<MemberTab>('overview')
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [allocLoading, setAllocLoading] = useState(true)

  // Add project form
  const [showAddProject, setShowAddProject] = useState(false)
  const [addProjectId, setAddProjectId] = useState('')
  const [addProjectRole, setAddProjectRole] = useState('')

  // Time off form
  const [showTimeOffForm, setShowTimeOffForm] = useState(false)
  const [toStart, setToStart] = useState('')
  const [toEnd, setToEnd] = useState('')
  const [toReason, setToReason] = useState('')
  const [timeOffYear, setTimeOffYear] = useState(new Date().getFullYear())

  // Calendar state — syncs year with timeOffYear
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear] = useState(new Date().getFullYear())

  // Sync calendar year when timeOffYear changes
  useEffect(() => {
    setCalYear(timeOffYear)
  }, [timeOffYear])

  useEffect(() => {
    if (!members.length) fetchMembers()
    fetchTeams()
    fetchHolidays()
    if (!pStore.projects.length) pStore.fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return
    fetchTimeOff(id)
    fetchMemberProjects(id)
    const year = new Date().getFullYear()
    const start = `${year}-01-01`
    const end = `${year}-12-31`
    setAllocLoading(true)
    supabase
      .from('resource_allocations')
      .select('category, hours, date, label, project:projects(id, pn, name)')
      .eq('member_id', id)
      .gte('date', start)
      .lte('date', end)
      .order('date')
      .then(({ data }) => {
        setAllocations((data ?? []) as unknown as AllocationRow[])
        setAllocLoading(false)
      })
  }, [id, fetchTimeOff, fetchMemberProjects])

  const member = members.find(m => m.id === id)

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!member) return null
    const now = new Date()
    const year = now.getFullYear()

    const monthStr = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const monthAllocs = allocations.filter(a => a.date.startsWith(monthStr))
    const monthHours = monthAllocs.reduce((s, a) => s + a.hours, 0)

    const monthStart = `${monthStr}-01`
    const lastDay = new Date(year, now.getMonth() + 1, 0).getDate()
    const monthEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`
    const monthCapacity = workingDays(monthStart, monthEnd) * member.hours_per_day

    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const yearVacation = (member.vacation_days_year ?? 0) * member.hours_per_day
    const yearCapacity = Math.max(0, workingDays(yearStart, yearEnd) * member.hours_per_day - yearVacation)
    const yearOverhead = ((member.overhead_meetings_month ?? 0) + (member.overhead_sales_month ?? 0)) * 12
    const yearHours = allocations.reduce((s, a) => s + a.hours, 0) + yearOverhead
    const remaining = Math.max(0, yearCapacity - yearHours)

    const byCategory: Record<string, number> = {}
    allocations.forEach(a => { byCategory[a.category] = (byCategory[a.category] ?? 0) + a.hours })

    const today = now.toISOString().slice(0, 10)
    const totalTimeOffDays = timeOff.filter(t => t.end_date >= today).reduce((s, t) => s + workingDays(t.start_date, t.end_date), 0)

    return {
      monthHours, monthCapacity, yearHours, yearCapacity, remaining,
      utilization: monthCapacity > 0 ? Math.round((monthHours / monthCapacity) * 100) : 0,
      byCategory, totalTimeOffDays,
    }
  }, [allocations, member, timeOff])

  // ── Monthly stacked chart ────────────────────────────────────────────────
  const monthlyData = useMemo(() => {
    if (!member) return []
    const year = new Date().getFullYear()
    return Array.from({ length: 12 }, (_, i) => {
      const monthStr = `${year}-${String(i + 1).padStart(2, '0')}`
      const monthStart = `${monthStr}-01`
      const lastDay = new Date(year, i + 1, 0).getDate()
      const monthEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`
      const monthOverhead = (member.overhead_meetings_month ?? 0) + (member.overhead_sales_month ?? 0)
      const monthVacation = ((member.vacation_days_year ?? 0) / 12) * member.hours_per_day
      const capacity = Math.max(0, workingDays(monthStart, monthEnd) * member.hours_per_day - monthVacation)

      const allocatedHours = allocations
        .filter(a => a.date >= monthStart && a.date <= monthEnd && a.category !== 'leave')
        .reduce((s, a) => s + a.hours, 0) + monthOverhead

      const timeOffHours = timeOff
        .filter(t => t.start_date <= monthEnd && t.end_date >= monthStart)
        .reduce((s, t) => {
          const start = t.start_date < monthStart ? monthStart : t.start_date
          const end = t.end_date > monthEnd ? monthEnd : t.end_date
          return s + workingDays(start, end) * member.hours_per_day
        }, 0)

      const holidayHours = holidays
        .filter(h => {
          const hDate = h.recurrence === 'yearly' ? `${year}-${h.date.slice(5)}` : h.date
          return hDate >= monthStart && hDate <= monthEnd
        })
        .reduce((s, h) => {
          const hDate = h.recurrence === 'yearly' ? `${year}-${h.date.slice(5)}` : h.date
          const dow = new Date(hDate + 'T00:00:00').getDay()
          return dow !== 0 && dow !== 6 ? s + member.hours_per_day : s
        }, 0)

      return { label: MONTH_NAMES[i], capacity, allocatedHours, timeOffHours, holidayHours }
    })
  }, [allocations, member, timeOff, holidays])

  // ── Time off monthly summary ─────────────────────────────────────────────
  const timeOffMonthlySummary = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthStr = `${timeOffYear}-${String(i + 1).padStart(2, '0')}`
      const monthStart = `${monthStr}-01`
      const lastDay = new Date(timeOffYear, i + 1, 0).getDate()
      const monthEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`
      const days = timeOff
        .filter(t => t.start_date <= monthEnd && t.end_date >= monthStart)
        .reduce((s, t) => {
          const start = t.start_date < monthStart ? monthStart : t.start_date
          const end = t.end_date > monthEnd ? monthEnd : t.end_date
          return s + workingDays(start, end)
        }, 0)
      return { label: MONTH_NAMES[i], days }
    })
  }, [timeOff, timeOffYear])

  // ── Calendar helpers ─────────────────────────────────────────────────────
  function isTimeOffDay(dateStr: string) {
    return timeOff.some(t => t.start_date <= dateStr && t.end_date >= dateStr)
  }

  function getHolidayName(dateStr: string) {
    const [y] = dateStr.split('-')
    const h = holidays.find(h => {
      const hDate = h.recurrence === 'yearly' ? `${y}-${h.date.slice(5)}` : h.date
      return hDate === dateStr
    })
    return h?.name ?? null
  }

  function prevCalMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
  }
  function nextCalMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
  }

  // ── Project helpers ───────────────────────────────────────────────────────
  const assignedProjectIds = new Set(memberProjects.map(mp => mp.project_id))
  const availableProjects = pStore.projects.filter(p => p.status === 'active' && !assignedProjectIds.has(p.id))

  const handleAddProject = async () => {
    if (!addProjectId || !id) return
    try {
      await addMemberProject(id, addProjectId, addProjectRole.trim() || undefined)
      toast('success', 'Project assigned')
      setShowAddProject(false)
      setAddProjectId('')
      setAddProjectRole('')
    } catch { toast('error', 'Failed to assign project') }
  }

  const handleRemoveProject = async (mp: MemberProject) => {
    if (!confirm(`Remove ${mp.project?.name} from ${member?.name}?`)) return
    try {
      await removeMemberProject(mp.id)
      toast('success', 'Project removed')
    } catch { toast('error', 'Failed to remove') }
  }

  const saveTimeOff = async () => {
    if (!toStart || !toEnd || !id) return
    if (toEnd < toStart) { toast('error', 'End date must be after start'); return }
    try {
      await addTimeOff({ member_id: id, start_date: toStart, end_date: toEnd, reason: toReason.trim() || undefined })
      toast('success', 'Time off added')
      setShowTimeOffForm(false)
      setToStart(''); setToEnd(''); setToReason('')
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed to add time off') }
  }

  const deleteTimeOff = async (t: TimeOff) => {
    if (!confirm(`Remove time off ${fmtDate(t.start_date)} – ${fmtDate(t.end_date)}?`)) return
    try { await removeTimeOff(t.id); toast('success', 'Removed') }
    catch { toast('error', 'Failed to remove') }
  }

  if (!member) {
    return (
      <div className="flex-1 overflow-auto p-[60px] text-center text-muted-foreground">
        {members.length === 0 ? 'Loading...' : 'Member not found'}
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const upcomingTimeOff = timeOff.filter(t => t.end_date >= today)
  const pastTimeOff = timeOff.filter(t => t.end_date < today && t.start_date.startsWith(String(timeOffYear)))

  // ── Calendar render ───────────────────────────────────────────────────────
  const firstDow = new Date(calYear, calMonth, 1).getDay()
  const adjustedFirst = (firstDow + 6) % 7
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const calCells: (number | null)[] = []
  for (let i = 0; i < adjustedFirst; i++) calCells.push(null)
  for (let d = 1; d <= daysInMonth; d++) calCells.push(d)
  while (calCells.length % 7 !== 0) calCells.push(null)
  const calDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  // ── Stacked chart render ─────────────────────────────────────────────────
  const barH = 72
  const maxCap = Math.max(...monthlyData.map(m => m.capacity), 1)

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div className="flex items-center gap-3.5">
          <Link to="/settings?tab=team"><Button variant="ghost" size="sm">&larr;</Button></Link>
          <div>
            <h1 className="flex items-center gap-2.5">
              {member.name}
              {member.team && (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold" style={{ background: member.team.color + '22', color: member.team.color }}>
                  {member.team.name}
                </span>
              )}
            </h1>
            <p className="text-muted-foreground mt-0.5">
              {member.role || 'No role'} &middot; {member.hours_per_day}h/day
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div className="flex gap-0 border-b border-border mb-7">
          {([
            { key: 'overview', label: 'Overview', Icon: OverviewIcon },
            { key: 'projects', label: 'Projects', Icon: ProjectsIcon },
            { key: 'timeoff', label: 'Time Off', Icon: TimeOffIcon },
          ] as { key: MemberTab; label: string; Icon: () => ReactNode }[]).map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap cursor-pointer bg-transparent border-none border-b-2 -mb-px transition-colors ${
                activeTab === key
                  ? 'border-b-2 border-primary text-primary'
                  : 'border-transparent text-muted-foreground'
              }`}
              style={{ fontFamily: 'inherit' }}>
              <Icon />
              {label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ─────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            {stats && !allocLoading && (
              <div className="grid grid-cols-4 gap-4 mb-7">
                <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
                  <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">This Month</div>
                  <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmt(stats.monthHours)}h</div>
                  <div className="text-xs text-muted-foreground mt-1">of {fmt(stats.monthCapacity)}h capacity</div>
                </div>
                <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
                  <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Available / Year</div>
                  <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmt(stats.yearCapacity)}h</div>
                  <div className="text-xs text-muted-foreground mt-1">{new Date().getFullYear()} capacity</div>
                </div>
                <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
                  <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Remaining / Year</div>
                  <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${stats.remaining < stats.yearCapacity * 0.2 ? 'text-[#dc2626]' : 'text-[#16a34a]'}`}>
                    {fmt(stats.remaining)}h
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">unallocated hours</div>
                </div>
                <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
                  <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Time Off</div>
                  <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{stats.totalTimeOffDays}d</div>
                  <div className="text-xs text-muted-foreground mt-1">upcoming</div>
                </div>
              </div>
            )}

            {/* Skills */}
            {member.skills && (
              <Card className="mb-5">
                <CardContent className="p-4 pt-4">
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2.5">Skills</div>
                  <div className="flex flex-wrap gap-1.5">
                    {member.skills.split(',').map(s => s.trim()).filter(Boolean).map(skill => (
                      <span key={skill} className="text-xs px-2.5 py-1 rounded font-semibold" style={{ background: 'var(--navy)1a', color: 'var(--navy)', border: '1px solid var(--navy)33' }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Monthly stacked chart */}
            {!allocLoading && (
              <Card className="mb-7">
                <CardContent>
                  <div className="font-bold text-[13px] text-foreground mb-1">Monthly Allocation — {new Date().getFullYear()}</div>
                  <div className="flex gap-4 mb-4">
                    {[
                      { color: 'var(--navy)', label: 'Available Hours' },
                      { color: '#f59e0b', label: 'Time Off' },
                      { color: '#10b981', label: 'Holidays' },
                    ].map(l => (
                      <div key={l.label} className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: l.color }} />
                        <span className="text-[11px] text-muted-foreground font-medium">{l.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5 items-end" style={{ height: barH + 20 }}>
                    {monthlyData.map((m, i) => {
                      const cap = m.capacity
                      const availableHours = Math.max(0, cap - m.timeOffHours - m.holidayHours)
                      const availH = cap > 0 ? (availableHours / maxCap) * barH : 0
                      const toH = cap > 0 ? (Math.min(m.timeOffHours, cap) / maxCap) * barH : 0
                      const holH = cap > 0 ? (Math.min(m.holidayHours, cap) / maxCap) * barH : 0
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full rounded overflow-hidden flex flex-col-reverse" style={{ height: barH }}>
                            <div style={{ height: availH, background: 'var(--navy)', flexShrink: 0 }} />
                            <div style={{ height: toH, background: '#f59e0b', flexShrink: 0 }} />
                            <div style={{ height: holH, background: '#10b981', flexShrink: 0 }} />
                          </div>
                          <div className="text-[10px] text-muted-foreground text-center">{m.label}</div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Hours by Category */}
            <div className="flex items-center justify-between mb-3.5">
              <h2>Hours by Category</h2>
            </div>
            <Card>
              <CardContent>
                {allocLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : Object.keys(stats?.byCategory ?? {}).length === 0 ? (
                  <p className="text-muted-foreground">No allocations this year</p>
                ) : (
                  <div className="flex flex-col gap-3.5">
                    {Object.entries(stats!.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, hours]) => (
                      <div key={cat}>
                        <div className="flex justify-between mb-1.5">
                          <span className="capitalize font-semibold text-sm">{cat}</span>
                          <span className="font-bold text-sm">{fmt(hours)}h</span>
                        </div>
                        <div className="h-2 rounded bg-gray-100">
                          <div style={{
                            height: 8, borderRadius: 4,
                            background: CAT_COLORS[cat as AllocationCategory] ?? 'var(--c4)',
                            width: `${Math.min(100, (hours / (stats!.yearHours || 1)) * 100)}%`,
                            transition: 'width 0.3s',
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Projects tab ─────────────────────────────────────────────────── */}
        {activeTab === 'projects' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2>Projects</h2>
              <Button variant="outline" size="sm" onClick={() => setShowAddProject(true)}>+ Assign Project</Button>
            </div>

            {showAddProject && (
              <Card className="mb-4">
                <CardContent className="flex gap-3 items-end">
                  <div className="mb-4 flex-[2]" style={{ margin: 0 }}>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Project</label>
                    <select value={addProjectId} onChange={e => setAddProjectId(e.target.value)}>
                      <option value="">Select project...</option>
                      {availableProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.pn})</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-4 flex-1" style={{ margin: 0 }}>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Role <span className="text-xs text-muted-foreground normal-case tracking-normal font-normal">optional</span></label>
                    <input value={addProjectRole} onChange={e => setAddProjectRole(e.target.value)} placeholder="e.g. Lead developer" />
                  </div>
                  <div className="flex gap-2 pb-px">
                    <Button variant="ghost" size="sm" onClick={() => { setShowAddProject(false); setAddProjectId(''); setAddProjectRole('') }}>Cancel</Button>
                    <Button size="sm" onClick={handleAddProject} disabled={!addProjectId}>Save</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {memberProjects.length === 0 && !showAddProject ? (
              <Card>
                <CardContent className="text-center py-10 text-muted-foreground">
                  No projects assigned yet
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
                {memberProjects.map(mp => {
                  const status = mp.project?.status ?? 'active'
                  const borderColor = STATUS_BORDER[status] ?? 'var(--c5)'
                  return (
                    <Card key={mp.id} style={{ borderLeft: `4px solid ${borderColor}` }}>
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start mb-3">
                          <Link to={`/projects/${mp.project_id}`} className="font-bold text-base text-foreground no-underline leading-snug">
                            {mp.project?.name ?? 'Unknown'}
                          </Link>
                          <Button variant="ghost" size="xs" onClick={() => handleRemoveProject(mp)} className="text-muted-foreground -mt-0.5">&times;</Button>
                        </div>
                        <div className="flex gap-1.5 mb-3 flex-wrap">
                          <Badge variant="gray">{mp.project?.pn}</Badge>
                          {mp.project?.type && <Badge variant={TYPE_BADGE[mp.project.type] ?? 'gray'}>{mp.project.type.toUpperCase()}</Badge>}
                          {mp.project?.status && <Badge variant={STATUS_BADGE[mp.project.status] ?? 'gray'}>{mp.project.status.toUpperCase()}</Badge>}
                        </div>
                        <div className="flex flex-col gap-1">
                          {mp.project?.client && (
                            <div className="text-[13px] text-muted-foreground">
                              <span className="text-muted-foreground mr-1">Client</span>
                              <Link to={`/clients/${mp.project.client.id}`} className="font-medium text-primary hover:underline cursor-pointer font-semibold">{mp.project.client.name}</Link>
                            </div>
                          )}
                          {mp.role && (
                            <div className="text-[13px] text-muted-foreground">
                              <span className="text-muted-foreground mr-1">Role</span>
                              <strong className="text-[#374151]">{mp.role}</strong>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── Time Off tab ─────────────────────────────────────────────────── */}
        {activeTab === 'timeoff' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="m-0">Time Off</h2>
                <Button variant="ghost" size="sm" onClick={() => setTimeOffYear(y => y - 1)}>‹</Button>
                <span className="font-bold text-sm">{timeOffYear}</span>
                <Button variant="ghost" size="sm" onClick={() => setTimeOffYear(y => y + 1)}>›</Button>
              </div>
              {!showTimeOffForm && (
                <Button variant="outline" size="sm" onClick={() => setShowTimeOffForm(true)}>+ Add Time Off</Button>
              )}
            </div>

            {showTimeOffForm && (
              <Card className="mb-4">
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="mb-4" style={{ margin: 0 }}>
                      <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Start date</label>
                      <input type="date" lang="en-GB" value={toStart} onChange={e => { setToStart(e.target.value); if (!toEnd) setToEnd(e.target.value) }} />
                    </div>
                    <div className="mb-4" style={{ margin: 0 }}>
                      <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">End date</label>
                      <input type="date" lang="en-GB" value={toEnd} onChange={e => setToEnd(e.target.value)} />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Reason <span className="text-xs text-muted-foreground normal-case tracking-normal font-normal">optional</span></label>
                    <input value={toReason} onChange={e => setToReason(e.target.value)} placeholder="e.g. Vacation, sick leave..." />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setShowTimeOffForm(false)}>Cancel</Button>
                    <Button size="sm" onClick={saveTimeOff}>Save</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Calendar */}
            <Card className="mb-5 overflow-hidden">
              <CardContent className="p-0">
                {/* Header */}
                <div className="flex items-center px-5 py-4 border-b border-border">
                  <Button variant="ghost" size="sm" onClick={prevCalMonth}>‹</Button>
                  <span className="font-bold text-[15px] min-w-[180px] text-center">
                    {MONTH_FULL[calMonth]} {calYear}
                  </span>
                  <Button variant="ghost" size="sm" onClick={nextCalMonth}>›</Button>
                  <div className="ml-auto flex items-center gap-3.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#fca5a5' }} />
                      <span className="text-[11px] text-muted-foreground font-medium">Time off</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#bfdbfe' }} />
                      <span className="text-[11px] text-muted-foreground font-medium">Holiday</span>
                    </div>
                  </div>
                </div>
                {/* Day headers */}
                <div className="grid grid-cols-7 border-b border-border">
                  {calDayLabels.map((d, i) => (
                    <div key={d} style={{
                      textAlign: 'center', padding: '10px 0', fontSize: 11, fontWeight: 700,
                      color: i >= 5 ? 'var(--c4)' : 'var(--c3)',
                      background: i >= 5 ? 'var(--c7)' : '#fff',
                      borderRight: i < 6 ? '1px solid var(--c6)' : undefined,
                      letterSpacing: '0.3px',
                    }}>{d}</div>
                  ))}
                </div>
                {/* Days */}
                <div className="grid grid-cols-7">
                  {calCells.map((day, idx) => {
                    const dow = idx % 7
                    const isWeekend = dow >= 5
                    if (day === null) return (
                      <div key={idx} style={{
                        minHeight: 64, padding: '10px 12px',
                        background: isWeekend ? 'var(--c7)' : '#fff',
                        borderRight: dow < 6 ? '1px solid var(--c6)' : undefined,
                        borderBottom: '1px solid var(--c6)',
                      }} />
                    )
                    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const isOff = isTimeOffDay(dateStr)
                    const holidayName = getHolidayName(dateStr)
                    const isToday = dateStr === today
                    return (
                      <div key={idx} style={{
                        minHeight: 64, padding: '10px 12px',
                        borderRight: dow < 6 ? '1px solid var(--c6)' : undefined,
                        borderBottom: '1px solid var(--c6)',
                        background: isOff ? '#fee2e2' : holidayName ? '#eff6ff' : isWeekend ? 'var(--c7)' : '#fff',
                      }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 28, height: 28, borderRadius: '50%',
                          background: isToday ? 'var(--navy)' : 'transparent',
                          color: isToday ? '#fff' : isOff ? '#b91c1c' : holidayName ? '#1d4ed8' : isWeekend ? 'var(--c4)' : 'var(--c0)',
                          fontSize: 14, fontWeight: isToday ? 700 : 500,
                        }}>
                          {day}
                        </span>
                        {holidayName && !isOff && (
                          <div className="text-[10px] mt-0.5 leading-tight font-medium" style={{ color: '#1d4ed8' }}>{holidayName}</div>
                        )}
                        {isOff && (
                          <div className="text-[10px] mt-0.5 leading-tight font-medium" style={{ color: '#b91c1c' }}>Time off</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Days off by month */}
            <Card className="mb-5">
              <CardContent>
                <div className="font-bold text-[13px] text-foreground mb-3.5">Days Off by Month — {timeOffYear}</div>
                <div className="grid grid-cols-6 gap-2">
                  {timeOffMonthlySummary.map((m, i) => {
                    const bg = m.days === 0 ? 'var(--c7)' : m.days <= 2 ? '#fffde7' : '#ffebee'
                    const color = m.days === 0 ? 'var(--c4)' : m.days <= 2 ? 'var(--amber)' : 'var(--red)'
                    return (
                      <div key={i} className="rounded-lg text-center" style={{ background: bg, padding: '12px 8px' }}>
                        <div className="text-[11px] font-semibold text-muted-foreground mb-1">{m.label}</div>
                        <div className="text-lg font-extrabold" style={{ color, fontFamily: 'Manrope, sans-serif' }}>{m.days}</div>
                        <div className="text-[10px] text-muted-foreground">days</div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Upcoming */}
            {upcomingTimeOff.length > 0 && (
              <>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2.5">Upcoming</div>
                <div className="flex flex-col gap-2 mb-6">
                  {upcomingTimeOff.map(t => (
                    <div key={t.id} className="flex justify-between items-center px-4 py-3 bg-white border border-border rounded-[10px]" style={{ borderLeft: '3px solid var(--navy)' }}>
                      <div>
                        <div className="font-semibold text-sm">
                          {fmtDate(t.start_date)}{t.start_date !== t.end_date ? ` – ${fmtDate(t.end_date)}` : ''}
                        </div>
                        <div className="text-[13px] text-muted-foreground mt-0.5">
                          {workingDays(t.start_date, t.end_date)} working day{workingDays(t.start_date, t.end_date) !== 1 ? 's' : ''}
                          {t.reason && <> &middot; {t.reason}</>}
                        </div>
                      </div>
                      <Button variant="ghost" size="xs" onClick={() => deleteTimeOff(t)} className="text-[#dc2626]">&times;</Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Past (for selected year) */}
            {pastTimeOff.length > 0 && (
              <>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2.5">Past ({timeOffYear})</div>
                <div className="flex flex-col gap-1.5">
                  {pastTimeOff.map(t => (
                    <div key={t.id} className="flex justify-between items-center px-4 py-2 rounded-lg opacity-50">
                      <div>
                        <span className="text-sm">
                          {fmtDate(t.start_date)}{t.start_date !== t.end_date ? ` – ${fmtDate(t.end_date)}` : ''}
                        </span>
                        <span className="text-[13px] text-muted-foreground ml-2">
                          {workingDays(t.start_date, t.end_date)}d
                          {t.reason && <> &middot; {t.reason}</>}
                        </span>
                      </div>
                      <Button variant="ghost" size="xs" onClick={() => deleteTimeOff(t)} className="text-[#dc2626]">&times;</Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {upcomingTimeOff.length === 0 && pastTimeOff.length === 0 && (
              <div className="text-center py-5 text-muted-foreground">
                No time off scheduled for {timeOffYear}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
