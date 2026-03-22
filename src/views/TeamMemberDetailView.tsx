import { useEffect, useState, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useResourceStore } from '../stores/resource'
import { useProjectsStore } from '../stores/projects'
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

const TYPE_BADGE: Record<string, string> = {
  fixed: 'badge-navy',
  maintenance: 'badge-blue',
  variable: 'badge-amber',
}

const fmt = (n: number) => String(Math.round(n * 10) / 10)

const fmtDate = (d: string) => {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const fmtMonth = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en', { month: 'short' })

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

export function TeamMemberDetailView() {
  const { id } = useParams<{ id: string }>()
  const {
    members, fetchMembers, fetchTeams,
    timeOff, fetchTimeOff, addTimeOff, removeTimeOff,
    memberProjects, fetchMemberProjects, addMemberProject, removeMemberProject,
  } = useResourceStore()
  const pStore = useProjectsStore()

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

  useEffect(() => {
    if (!members.length) fetchMembers()
    fetchTeams()
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

  // Stats
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

    const byCategory: Record<string, number> = {}
    allocations.forEach(a => { byCategory[a.category] = (byCategory[a.category] ?? 0) + a.hours })

    const yearHours = allocations.reduce((s, a) => s + a.hours, 0)

    const today = now.toISOString().slice(0, 10)
    const totalTimeOffDays = timeOff.filter(t => t.end_date >= today).reduce((s, t) => s + workingDays(t.start_date, t.end_date), 0)

    return {
      monthHours, monthCapacity,
      utilization: monthCapacity > 0 ? Math.round((monthHours / monthCapacity) * 100) : 0,
      yearHours, byCategory, totalTimeOffDays,
    }
  }, [allocations, member, timeOff])

  // Monthly chart data (12 months of current year)
  const monthlyData = useMemo(() => {
    if (!member) return []
    const year = new Date().getFullYear()
    return Array.from({ length: 12 }, (_, i) => {
      const monthStr = `${year}-${String(i + 1).padStart(2, '0')}`
      const monthStart = `${monthStr}-01`
      const lastDay = new Date(year, i + 1, 0).getDate()
      const monthEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`
      const hours = allocations
        .filter(a => a.date.startsWith(monthStr) && a.category !== 'leave')
        .reduce((s, a) => s + a.hours, 0)
      const capacity = workingDays(monthStart, monthEnd) * member.hours_per_day
      const pct = capacity > 0 ? Math.round((hours / capacity) * 100) : 0
      return { label: fmtMonth(monthStart), hours, capacity, pct }
    })
  }, [allocations, member])

  // Time off monthly summary
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
      return { label: fmtMonth(monthStart), days }
    })
  }, [timeOff, timeOffYear])

  // Available projects (not already assigned)
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
    } catch { toast('error', 'Failed to add time off') }
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

  const utilizationColor = (pct: number) =>
    pct > 100 ? 'var(--red)' : pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--c4)'

  const utilizationBg = (pct: number) =>
    pct > 100 ? '#ffebee' : pct >= 80 ? '#e8f5e9' : pct >= 40 ? '#fffde7' : 'var(--c7)'

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link to="/team" className="btn btn-ghost btn-sm">&larr;</Link>
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
        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--c6)', marginBottom: 28 }}>
          {(['overview', 'projects', 'timeoff'] as MemberTab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid var(--navy)' : '2px solid transparent', cursor: 'pointer', padding: '10px 18px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: activeTab === tab ? 'var(--navy)' : 'var(--c3)', transition: 'color .12s', whiteSpace: 'nowrap', marginBottom: -2 }}>
              {tab === 'overview' ? 'Overview' : tab === 'projects' ? 'Projects' : 'Time Off'}
            </button>
          ))}
        </div>

        {/* ── Overview tab ─────────────────────────────────────────────── */}
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
                  <div className="stat-card-label">Utilization</div>
                  <div className="stat-card-value" style={{ color: stats.utilization >= 80 ? 'var(--green)' : stats.utilization >= 50 ? 'var(--amber)' : 'var(--red)' }}>
                    {stats.utilization}%
                  </div>
                  <div className="stat-card-sub">this month</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">Year Total</div>
                  <div className="stat-card-value">{fmt(stats.yearHours)}h</div>
                  <div className="stat-card-sub">{new Date().getFullYear()}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-card-label">Time Off</div>
                  <div className="stat-card-value">{stats.totalTimeOffDays}d</div>
                  <div className="stat-card-sub">upcoming</div>
                </div>
              </div>
            )}

            {/* Monthly chart */}
            {!allocLoading && (
              <div className="card" style={{ marginBottom: 28 }}>
                <div className="card-body">
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c0)', marginBottom: 16 }}>Monthly Allocation — {new Date().getFullYear()}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
                    {monthlyData.map((m, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: utilizationColor(m.pct) }}>{m.pct > 0 ? `${m.pct}%` : ''}</div>
                        <div style={{ width: '100%', background: 'var(--c6)', borderRadius: 4, height: 60, display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                          <div style={{
                            width: '100%',
                            height: `${Math.min(100, m.pct)}%`,
                            background: utilizationBg(m.pct),
                            borderTop: `2px solid ${utilizationColor(m.pct)}`,
                            transition: 'height 0.3s',
                            minHeight: m.hours > 0 ? 4 : 0,
                          }} />
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--c4)', textAlign: 'center' }}>{m.label}</div>
                      </div>
                    ))}
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

        {/* ── Projects tab ─────────────────────────────────────────────── */}
        {activeTab === 'projects' && (
          <>
            <div className="section-bar" style={{ marginBottom: 14 }}>
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
                <div className="card-body" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--c4)' }}>
                  No projects assigned yet
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                {memberProjects.map(mp => (
                  <div key={mp.id} className="card" style={{ position: 'relative' }}>
                    <div className="card-body" style={{ padding: '16px 18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div>
                          <Link to={`/projects/${mp.project_id}`} style={{ fontWeight: 700, fontSize: 15, color: 'var(--c0)', textDecoration: 'none' }}>
                            {mp.project?.name ?? 'Unknown'}
                          </Link>
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <span className="badge badge-gray">{mp.project?.pn}</span>
                            {mp.project?.type && <span className={`badge ${TYPE_BADGE[mp.project.type] ?? 'badge-gray'}`}>{mp.project.type}</span>}
                            {mp.project?.status && <span className={`badge ${STATUS_BADGE[mp.project.status] ?? 'badge-gray'}`}>{mp.project.status}</span>}
                          </div>
                        </div>
                        <button className="btn btn-ghost btn-xs" onClick={() => handleRemoveProject(mp)} style={{ color: 'var(--red)', marginTop: -2 }}>&times;</button>
                      </div>
                      {mp.project?.client && (
                        <div style={{ fontSize: 13, color: 'var(--c3)', marginBottom: 4 }}>
                          Client: <Link to={`/clients/${mp.project.client.id}`} className="table-link">{mp.project.client.name}</Link>
                        </div>
                      )}
                      {mp.role && (
                        <div style={{ fontSize: 13, color: 'var(--c2)' }}>
                          Role: <strong>{mp.role}</strong>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Time Off tab ─────────────────────────────────────────────── */}
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

            {/* Monthly summary grid */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c0)', marginBottom: 14 }}>Days Off by Month</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
                  {timeOffMonthlySummary.map((m, i) => {
                    const bg = m.days === 0 ? 'var(--c7)' : m.days <= 2 ? '#fffde7' : '#ffebee'
                    const color = m.days === 0 ? 'var(--c4)' : m.days <= 2 ? 'var(--amber)' : 'var(--red)'
                    return (
                      <div key={i} style={{ background: bg, borderRadius: 8, padding: '10px 8px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c3)', marginBottom: 4 }}>{m.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: 'Manrope, sans-serif' }}>{m.days}</div>
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
              <div className="card">
                <div className="card-body" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--c4)' }}>
                  No time off scheduled for {timeOffYear}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
