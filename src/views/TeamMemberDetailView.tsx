import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useResourceStore } from '../stores/resource'
import { useProjectsStore } from '../stores/projects'
import { useHolidayStore } from '../stores/holidays'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { TimeOff, AllocationCategory, MemberProject } from '../lib/types'

const CAT_COLORS: Record<AllocationCategory, string> = {
  project: 'var(--navy)',
  maintenance: 'var(--green)',
  internal: 'var(--blue)',
  meeting: 'var(--amber)',
  admin: 'var(--c3)',
  leave: 'var(--red)',
  sales: '#7c3aed',
}

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green',
  paused: 'badge-amber',
  completed: 'badge-gray',
  cancelled: 'badge-red',
}

const STATUS_BORDER: Record<string, string> = {
  active: 'var(--green)',
  paused: 'var(--amber)',
  completed: 'var(--c4)',
  cancelled: 'var(--red)',
}

const TYPE_BADGE: Record<string, string> = {
  fixed: 'badge-navy',
  maintenance: 'badge-blue',
  variable: 'badge-amber',
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
    const yearCapacity = workingDays(yearStart, yearEnd) * member.hours_per_day
    const yearHours = allocations.reduce((s, a) => s + a.hours, 0)
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
      const capacity = workingDays(monthStart, monthEnd) * member.hours_per_day

      const allocatedHours = allocations
        .filter(a => a.date >= monthStart && a.date <= monthEnd && a.category !== 'leave')
        .reduce((s, a) => s + a.hours, 0)

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
      <div className="page-content" style={{ padding: 60, textAlign: 'center', color: 'var(--c3)' }}>
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
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to="/settings?tab=team" className="btn btn-ghost btn-sm">&larr;</Link>
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {member.name}
              {member.team && (
                <span className="badge" style={{ background: member.team.color + '22', color: member.team.color, fontWeight: 600 }}>
                  {member.team.name}
                </span>
              )}
            </h1>
            <p style={{ color: 'var(--c3)', marginTop: 2 }}>
              {member.role || 'No role'} &middot; {member.hours_per_day}h/day
            </p>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--c6)', marginBottom: 28 }}>
          {([
            { key: 'overview', label: 'Overview', Icon: OverviewIcon },
            { key: 'projects', label: 'Projects', Icon: ProjectsIcon },
            { key: 'timeoff', label: 'Time Off', Icon: TimeOffIcon },
          ] as { key: MemberTab; label: string; Icon: () => JSX.Element }[]).map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: activeTab === key ? '2px solid var(--navy)' : '2px solid transparent',
                cursor: 'pointer', padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13,
                color: activeTab === key ? 'var(--navy)' : 'var(--c3)', transition: 'color .12s',
                whiteSpace: 'nowrap', marginBottom: -2, display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <Icon />
              {label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ─────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <>
            {stats && !allocLoading && (
              <div className="stats-strip" style={{ marginBottom: 28 }}>
                <div className="stat-card">
                  <div className="stat-card-label">This Month</div>
                  <div className="stat-card-value">{fmt(stats.monthHours)}h</div>
                  <div className="stat-card-sub">of {fmt(stats.monthCapacity)}h capacity</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">Available / Year</div>
                  <div className="stat-card-value">{fmt(stats.yearCapacity)}h</div>
                  <div className="stat-card-sub">{new Date().getFullYear()} capacity</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">Remaining / Year</div>
                  <div className="stat-card-value" style={{ color: stats.remaining < stats.yearCapacity * 0.2 ? 'var(--red)' : 'var(--green)' }}>
                    {fmt(stats.remaining)}h
                  </div>
                  <div className="stat-card-sub">unallocated hours</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">Time Off</div>
                  <div className="stat-card-value">{stats.totalTimeOffDays}d</div>
                  <div className="stat-card-sub">upcoming</div>
                </div>
              </div>
            )}

            {/* Skills */}
            {member.skills && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-body" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Skills</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {member.skills.split(',').map(s => s.trim()).filter(Boolean).map(skill => (
                      <span key={skill} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, background: 'var(--navy)1a', color: 'var(--navy)', fontWeight: 600, border: '1px solid var(--navy)33' }}>
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Monthly stacked chart */}
            {!allocLoading && (
              <div className="card" style={{ marginBottom: 28 }}>
                <div className="card-body">
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c0)', marginBottom: 4 }}>Monthly Allocation — {new Date().getFullYear()}</div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                    {[
                      { color: 'var(--navy)', label: 'Available Hours' },
                      { color: '#f59e0b', label: 'Time Off' },
                      { color: '#10b981', label: 'Holidays' },
                    ].map(l => (
                      <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--c3)', fontWeight: 500 }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: barH + 20 }}>
                    {monthlyData.map((m, i) => {
                      const cap = m.capacity
                      // Available = capacity minus time off and holidays (ignoring allocation — same as screenshot)
                      const availableHours = Math.max(0, cap - m.timeOffHours - m.holidayHours)
                      const availH = cap > 0 ? (availableHours / maxCap) * barH : 0
                      const toH = cap > 0 ? (Math.min(m.timeOffHours, cap) / maxCap) * barH : 0
                      const holH = cap > 0 ? (Math.min(m.holidayHours, cap) / maxCap) * barH : 0
                      return (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: '100%', height: barH, borderRadius: 4, overflow: 'hidden', display: 'flex', flexDirection: 'column-reverse' }}>
                            {/* Bottom: Available (navy/purple) */}
                            <div style={{ height: availH, background: 'var(--navy)', flexShrink: 0 }} />
                            {/* Middle: Time Off (orange) */}
                            <div style={{ height: toH, background: '#f59e0b', flexShrink: 0 }} />
                            {/* Top: Holidays (green) */}
                            <div style={{ height: holH, background: '#10b981', flexShrink: 0 }} />
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--c4)', textAlign: 'center' }}>{m.label}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Hours by Category */}
            <div className="section-bar" style={{ marginBottom: 14 }}>
              <h2>Hours by Category</h2>
            </div>
            <div className="card">
              <div className="card-body">
                {allocLoading ? (
                  <p style={{ color: 'var(--c4)' }}>Loading...</p>
                ) : Object.keys(stats?.byCategory ?? {}).length === 0 ? (
                  <p style={{ color: 'var(--c4)' }}>No allocations this year</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {Object.entries(stats!.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, hours]) => (
                      <div key={cat}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ textTransform: 'capitalize', fontWeight: 600, fontSize: 14 }}>{cat}</span>
                          <span className="text-mono" style={{ fontWeight: 700, fontSize: 14 }}>{fmt(hours)}h</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: 'var(--c6)' }}>
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
              </div>
            </div>
          </>
        )}

        {/* ── Projects tab ─────────────────────────────────────────────────── */}
        {activeTab === 'projects' && (
          <>
            <div className="section-bar" style={{ marginBottom: 16 }}>
              <h2>Projects</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddProject(true)}>+ Assign Project</button>
            </div>

            {showAddProject && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ margin: 0, flex: 2 }}>
                    <label className="form-label">Project</label>
                    <select value={addProjectId} onChange={e => setAddProjectId(e.target.value)}>
                      <option value="">Select project...</option>
                      {availableProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.name} ({p.pn})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0, flex: 1 }}>
                    <label className="form-label">Role <span style={{ fontWeight: 400, color: 'var(--c4)' }}>optional</span></label>
                    <input value={addProjectRole} onChange={e => setAddProjectRole(e.target.value)} placeholder="e.g. Lead developer" />
                  </div>
                  <div style={{ display: 'flex', gap: 8, paddingBottom: 1 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowAddProject(false); setAddProjectId(''); setAddProjectRole('') }}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={handleAddProject} disabled={!addProjectId}>Save</button>
                  </div>
                </div>
              </div>
            )}

            {memberProjects.length === 0 && !showAddProject ? (
              <div className="card">
                <div className="card-body" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--c4)' }}>
                  No projects assigned yet
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
                {memberProjects.map(mp => {
                  const status = mp.project?.status ?? 'active'
                  const borderColor = STATUS_BORDER[status] ?? 'var(--c5)'
                  return (
                    <div key={mp.id} className="card" style={{ borderLeft: `4px solid ${borderColor}`, position: 'relative' }}>
                      <div className="card-body" style={{ padding: '20px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <Link to={`/projects/${mp.project_id}`} style={{ fontWeight: 700, fontSize: 16, color: 'var(--c0)', textDecoration: 'none', lineHeight: 1.3 }}>
                            {mp.project?.name ?? 'Unknown'}
                          </Link>
                          <button className="btn btn-ghost btn-xs" onClick={() => handleRemoveProject(mp)} style={{ color: 'var(--c4)', marginTop: -2 }}>&times;</button>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                          <span className="badge badge-gray">{mp.project?.pn}</span>
                          {mp.project?.type && <span className={`badge ${TYPE_BADGE[mp.project.type] ?? 'badge-gray'}`}>{mp.project.type.toUpperCase()}</span>}
                          {mp.project?.status && <span className={`badge ${STATUS_BADGE[mp.project.status] ?? 'badge-gray'}`}>{mp.project.status.toUpperCase()}</span>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {mp.project?.client && (
                            <div style={{ fontSize: 13, color: 'var(--c3)' }}>
                              <span style={{ color: 'var(--c4)', marginRight: 4 }}>Client</span>
                              <Link to={`/clients/${mp.project.client.id}`} className="table-link" style={{ fontWeight: 600 }}>{mp.project.client.name}</Link>
                            </div>
                          )}
                          {mp.role && (
                            <div style={{ fontSize: 13, color: 'var(--c3)' }}>
                              <span style={{ color: 'var(--c4)', marginRight: 4 }}>Role</span>
                              <strong style={{ color: 'var(--c1)' }}>{mp.role}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── Time Off tab ─────────────────────────────────────────────────── */}
        {activeTab === 'timeoff' && (
          <>
            <div className="section-bar" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0 }}>Time Off</h2>
                <button className="btn btn-ghost btn-sm" onClick={() => setTimeOffYear(y => y - 1)}>‹</button>
                <span style={{ fontWeight: 700, fontSize: 14 }}>{timeOffYear}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setTimeOffYear(y => y + 1)}>›</button>
              </div>
              {!showTimeOffForm && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowTimeOffForm(true)}>+ Add Time Off</button>
              )}
            </div>

            {showTimeOffForm && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-body">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Start date</label>
                      <input type="date" lang="en-GB" value={toStart} onChange={e => { setToStart(e.target.value); if (!toEnd) setToEnd(e.target.value) }} />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">End date</label>
                      <input type="date" lang="en-GB" value={toEnd} onChange={e => setToEnd(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: '0 0 12px' }}>
                    <label className="form-label">Reason <span style={{ fontWeight: 400, color: 'var(--c4)' }}>optional</span></label>
                    <input value={toReason} onChange={e => setToReason(e.target.value)} placeholder="e.g. Vacation, sick leave..." />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowTimeOffForm(false)}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={saveTimeOff}>Save</button>
                  </div>
                </div>
              </div>
            )}

            {/* Calendar */}
            <div className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
              <div className="card-body" style={{ padding: 0 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--c6)' }}>
                  <button className="btn btn-ghost btn-sm" onClick={prevCalMonth}>‹</button>
                  <span style={{ fontWeight: 700, fontSize: 15, minWidth: 180, textAlign: 'center' }}>
                    {MONTH_FULL[calMonth]} {calYear}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={nextCalMonth}>›</button>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: '#fca5a5' }} />
                      <span style={{ fontSize: 11, color: 'var(--c3)', fontWeight: 500 }}>Time off</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: '#bfdbfe' }} />
                      <span style={{ fontSize: 11, color: 'var(--c3)', fontWeight: 500 }}>Holiday</span>
                    </div>
                  </div>
                </div>
                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--c6)' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
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
                          <div style={{ fontSize: 10, color: '#1d4ed8', marginTop: 3, lineHeight: 1.2, fontWeight: 500 }}>{holidayName}</div>
                        )}
                        {isOff && (
                          <div style={{ fontSize: 10, color: '#b91c1c', marginTop: 3, lineHeight: 1.2, fontWeight: 500 }}>Time off</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Days off by month */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c0)', marginBottom: 14 }}>Days Off by Month — {timeOffYear}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                  {timeOffMonthlySummary.map((m, i) => {
                    const bg = m.days === 0 ? 'var(--c7)' : m.days <= 2 ? '#fffde7' : '#ffebee'
                    const color = m.days === 0 ? 'var(--c4)' : m.days <= 2 ? 'var(--amber)' : 'var(--red)'
                    return (
                      <div key={i} style={{ background: bg, borderRadius: 8, padding: '12px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c3)', marginBottom: 4 }}>{m.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: 'Manrope, sans-serif' }}>{m.days}</div>
                        <div style={{ fontSize: 10, color: 'var(--c4)' }}>days</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Upcoming */}
            {upcomingTimeOff.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Upcoming</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {upcomingTimeOff.map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff', border: '1px solid var(--c6)', borderRadius: 10, borderLeft: '3px solid var(--navy)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          {fmtDate(t.start_date)}{t.start_date !== t.end_date ? ` – ${fmtDate(t.end_date)}` : ''}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--c3)', marginTop: 2 }}>
                          {workingDays(t.start_date, t.end_date)} working day{workingDays(t.start_date, t.end_date) !== 1 ? 's' : ''}
                          {t.reason && <> &middot; {t.reason}</>}
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-xs" onClick={() => deleteTimeOff(t)} style={{ color: 'var(--red)' }}>&times;</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Past (for selected year) */}
            {pastTimeOff.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Past ({timeOffYear})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pastTimeOff.map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderRadius: 8, opacity: 0.5 }}>
                      <div>
                        <span style={{ fontSize: 14 }}>
                          {fmtDate(t.start_date)}{t.start_date !== t.end_date ? ` – ${fmtDate(t.end_date)}` : ''}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--c4)', marginLeft: 8 }}>
                          {workingDays(t.start_date, t.end_date)}d
                          {t.reason && <> &middot; {t.reason}</>}
                        </span>
                      </div>
                      <button className="btn btn-ghost btn-xs" onClick={() => deleteTimeOff(t)} style={{ color: 'var(--red)' }}>&times;</button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {upcomingTimeOff.length === 0 && pastTimeOff.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--c4)' }}>
                No time off scheduled for {timeOffYear}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
