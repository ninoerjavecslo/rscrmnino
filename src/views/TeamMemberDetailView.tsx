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
  const pastTimeOff = timeOff.filter(t => t.end_date < today)

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
        {/* ── Stats ─────────────────────────────────────────────────────── */}
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

        {/* ── Projects ──────────────────────────────────────────────────── */}
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
          <div className="card" style={{ marginBottom: 28 }}>
            <div className="card-body" style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--c4)' }}>
              No projects assigned yet
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12, marginBottom: 28 }}>
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

        {/* ── Two columns: Hours + Time Off ─────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Hours by Category */}
          <div>
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
          </div>

          {/* Time Off */}
          <div>
            <div className="section-bar" style={{ marginBottom: 14 }}>
              <h2>Time Off</h2>
              {!showTimeOffForm && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowTimeOffForm(true)}>+ Add</button>
              )}
            </div>

            {showTimeOffForm && (
              <div className="card" style={{ marginBottom: 12 }}>
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

            <div className="card">
              <div className="card-body">
                {upcomingTimeOff.length === 0 && pastTimeOff.length === 0 && (
                  <p style={{ color: 'var(--c4)' }}>No time off scheduled</p>
                )}

                {upcomingTimeOff.length > 0 && (
                  <>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>Upcoming</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: pastTimeOff.length > 0 ? 24 : 0 }}>
                      {upcomingTimeOff.map(t => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--c7)', borderRadius: 8, borderLeft: '3px solid var(--navy)' }}>
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

                {pastTimeOff.length > 0 && (
                  <>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>Past</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {pastTimeOff.map(t => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderRadius: 8, opacity: 0.5 }}>
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
