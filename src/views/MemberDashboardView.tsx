import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { TeamMember, ResourceAllocation, AllocationCategory } from '../lib/types'

// ── helpers ────────────────────────────────────────────────────────────────────

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function getMonday(d: Date): string {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = c.getDay()
  c.setDate(c.getDate() + (day === 0 ? -6 : 1 - day))
  return localDate(c)
}
function weekDays(monday: string): string[] {
  const d = new Date(monday + 'T00:00:00')
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
    return localDate(x)
  })
}
function shiftWeek(monday: string, n: number): string {
  const d = new Date(monday + 'T00:00:00')
  return localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n * 7))
}
function fmtDayShort(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })
}
function fmtDateMedium(s: string): string {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}
function fmtWeekRange(monday: string): string {
  const mon = new Date(monday + 'T00:00:00')
  const fri = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4)
  return `${mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${fri.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}
function parsePriority(notes: string | null | undefined): 'urgent' | 'high' | 'none' {
  if (!notes) return 'none'
  if (notes.startsWith('[URGENT]')) return 'urgent'
  if (notes.startsWith('[HIGH]')) return 'high'
  return 'none'
}
function cleanNote(notes: string | null | undefined): string {
  return (notes ?? '').replace(/^\[(URGENT|HIGH)\]\s*/, '').trim()
}
function fmt(n: number): string {
  return String(Math.round(n * 10) / 10)
}

const CAT_STYLE: Record<AllocationCategory, { bg: string; color: string; label: string }> = {
  project:     { bg: 'var(--navy-light)', color: 'var(--navy)',  label: 'Project' },
  maintenance: { bg: '#fff7ed',           color: '#c2410c',      label: 'Maintenance' },
  internal:    { bg: 'var(--blue-bg)',    color: 'var(--blue)',  label: 'Internal' },
  meeting:     { bg: '#fff3e0',           color: '#e67700',      label: 'Meeting' },
  admin:       { bg: 'var(--c7)',         color: 'var(--c3)',    label: 'Admin' },
  leave:       { bg: 'var(--red-bg)',     color: 'var(--red)',   label: 'Leave' },
  sales:       { bg: '#f3e8ff',           color: '#7c3aed',      label: 'Sales' },
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const S = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function IconGrid() { return <svg {...S}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg> }
function IconCalendar() { return <svg {...S}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
function IconBarChart() { return <svg {...S}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function IconClock() { return <svg {...S}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> }
function IconWrench() { return <svg {...S}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> }
function IconHome() { return <svg {...S}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function IconAlertTriangle() { return <svg {...S}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> }
function IconPlus() { return <svg {...S}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function IconZap() { return <svg {...S}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> }

// ── mobile hook ────────────────────────────────────────────────────────────────

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

// ── SickLeaveModal ─────────────────────────────────────────────────────────────

function SickLeaveModal({ days, member, onClose, onSaved }: {
  days: string[]
  member: TeamMember
  onClose: () => void
  onSaved: () => void
}) {
  const [sel, setSel] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  async function save() {
    if (sel.length === 0) return
    setSaving(true)
    try {
      await supabase.from('resource_allocations').insert(
        sel.map(d => ({
          member_id: member.id, category: 'leave' as AllocationCategory,
          date: d, hours: member.hours_per_day ?? 8, label: 'Sick Leave',
          is_billable: false, is_unplanned: false,
        }))
      )
      toast('success', 'Sick leave reported')
      onSaved(); onClose()
    } catch { toast('error', 'Failed to save') }
    setSaving(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 800 }}>Report Sick Leave</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 13, color: 'var(--c2)', marginBottom: 16 }}>Select the days you were sick.</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {days.map(d => {
              const active = sel.includes(d)
              return (
                <button key={d}
                  onClick={() => setSel(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])}
                  style={{
                    padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    border: active ? '2px solid var(--red)' : '2px solid var(--c5)',
                    background: active ? 'var(--red-bg)' : '#fff',
                    color: active ? 'var(--red)' : 'var(--c1)',
                  }}>
                  {fmtDayShort(d)} {new Date(d + 'T00:00:00').getDate()}
                </button>
              )
            })}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button onClick={save} disabled={sel.length === 0 || saving}
            style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: 'none', cursor: sel.length === 0 ? 'default' : 'pointer',
              background: 'var(--red)', color: '#fff', opacity: sel.length === 0 ? 0.5 : 1,
            }}>
            {saving ? '…' : `Report ${sel.length} day${sel.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── UnplannedModal ─────────────────────────────────────────────────────────────

function UnplannedModal({ member, days, projects, onClose, onSaved }: {
  member: TeamMember
  days: string[]
  projects: Array<{ id: string; pn: string; name: string }>
  onClose: () => void
  onSaved: () => void
}) {
  const today = localDate(new Date())
  const [form, setForm] = useState({
    date: days.includes(today) ? today : days[0],
    projectId: '',
    category: 'project' as AllocationCategory,
    label: '',
    hours: 1,
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await supabase.from('resource_allocations').insert({
        member_id: member.id,
        project_id: form.projectId || null,
        category: form.category,
        date: form.date,
        hours: form.hours,
        label: form.label.trim() || null,
        notes: 'Unplanned work',
        is_billable: form.category === 'project' || form.category === 'maintenance',
        is_unplanned: true,
      })
      toast('success', 'Unplanned work logged')
      onSaved(); onClose()
    } catch { toast('error', 'Failed to save') }
    setSaving(false)
  }

  const CATS: AllocationCategory[] = ['project', 'maintenance', 'internal', 'meeting', 'admin']

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 800 }}>Log Unplanned Work</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="form-label" style={{ marginBottom: 6 }}>Day</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {days.map(d => (
                <button key={d} onClick={() => setForm(f => ({ ...f, date: d }))}
                  style={{
                    flex: 1, padding: '7px 4px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    border: form.date === d ? '2px solid var(--navy)' : '2px solid var(--c5)',
                    background: form.date === d ? 'var(--navy)' : '#fff',
                    color: form.date === d ? '#fff' : 'var(--c1)',
                  }}>
                  {fmtDayShort(d)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="form-label" style={{ marginBottom: 6 }}>Category</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {CATS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, category: c }))}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    border: form.category === c ? `2px solid ${CAT_STYLE[c].color}` : '2px solid var(--c5)',
                    background: form.category === c ? CAT_STYLE[c].bg : '#fff',
                    color: form.category === c ? CAT_STYLE[c].color : 'var(--c3)',
                  }}>
                  {CAT_STYLE[c].label}
                </button>
              ))}
            </div>
          </div>
          {(form.category === 'project' || form.category === 'maintenance') && (
            <div className="form-group">
              <label className="form-label">Project</label>
              <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}>
                <option value="">— Select project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.pn} · {p.name}</option>)}
              </select>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Label (optional)</label>
              <input placeholder="e.g. Bug fix, Client call…" value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>
            <div className="form-group" style={{ flex: '0 0 100px' }}>
              <label className="form-label">Hours</label>
              <input type="number" min={0.5} step={0.5} value={form.hours}
                onChange={e => setForm(f => ({ ...f, hours: Number(e.target.value) }))} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
            {saving ? '…' : 'Add Entry'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ReportDelayModal ───────────────────────────────────────────────────────────

function ReportDelayModal({ projects, onClose }: {
  projects: Array<{ id: string; pn: string; name: string }>
  onClose: () => void
}) {
  const [projectId, setProjectId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await new Promise(r => setTimeout(r, 350))
    toast('success', 'Delay reported to your team')
    setSaving(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span style={{ fontWeight: 800 }}>Report Delay</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Project</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)}>
              <option value="">— Select project —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.pn} · {p.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">What's delayed? (optional)</label>
            <textarea rows={3} placeholder="Briefly describe the delay…"
              value={note} onChange={e => setNote(e.target.value)} style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button onClick={save} disabled={saving}
            style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              border: 'none', cursor: saving ? 'default' : 'pointer',
              background: 'var(--amber)', color: '#fff',
            }}>
            {saving ? '…' : 'Report Delay'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── types ──────────────────────────────────────────────────────────────────────

interface ActualRecord {
  id: string
  allocation_id: string
  member_id: string
  date: string
  actual_hours: number
}

type ProjectGroup = {
  key: string
  label: string
  category: AllocationCategory
  allocIds: string[]
  allocated: number
  note: string
  priority: 'urgent' | 'high' | 'none'
  dates: string[]
}

type ActiveView = 'dashboard' | 'plan' | 'stats' | 'timesheets'

// ── MemberDashboardView ────────────────────────────────────────────────────────

export function MemberDashboardView() {
  const { token } = useParams<{ token: string }>()
  const isMobile = useIsMobile()

  const [member, setMember] = useState<TeamMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [allocs, setAllocs] = useState<ResourceAllocation[]>([])
  const [actuals, setActuals] = useState<Record<string, number>>({})
  const [todayLog, setTodayLog] = useState<Record<string, string>>({})
  const [confirmDay, setConfirmDay] = useState(() => localDate(new Date()))
  const [loggingId, setLoggingId] = useState<string | null>(null)
  const [confirmedDays, setConfirmedDays] = useState<Set<string>>(new Set())
  const [projects, setProjects] = useState<Array<{ id: string; pn: string; name: string }>>([])
  const [showSickLeave, setShowSickLeave] = useState(false)
  const [showUnplanned, setShowUnplanned] = useState(false)
  const [showDelay, setShowDelay] = useState(false)
  const [activeView, setActiveView] = useState<ActiveView>('dashboard')

  const today = localDate(new Date())
  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const weekEnd = days[4]
  const isCurrentWeek = weekStart === getMonday(new Date())

  useEffect(() => {
    if (!token) return
    setLoading(true)
    supabase.from('team_members').select('*, team:teams(id, name, color)')
      .eq('share_token', token).single()
      .then(({ data }) => { setMember(data as TeamMember ?? null); setLoading(false) })
  }, [token])

  const loadAllocs = useCallback(async () => {
    if (!member) return
    const { data } = await supabase
      .from('resource_allocations')
      .select('*, project:projects(id, pn, name)')
      .eq('member_id', member.id)
      .gte('date', weekStart).lte('date', weekEnd)
      .order('date')
    setAllocs((data ?? []) as ResourceAllocation[])
  }, [member, weekStart, weekEnd])

  useEffect(() => { loadAllocs() }, [loadAllocs])

  const loadActuals = useCallback(async () => {
    if (allocs.length === 0) return
    const ids = allocs.map(a => a.id)
    const { data } = await supabase
      .from('allocation_actuals')
      .select('id, allocation_id, member_id, date, actual_hours')
      .in('allocation_id', ids)
    if (data) {
      const map: Record<string, number> = {}
      ;(data as ActualRecord[]).forEach(r => {
        map[r.allocation_id] = (map[r.allocation_id] ?? 0) + r.actual_hours
      })
      setActuals(map)
    }
  }, [allocs])

  useEffect(() => { loadActuals() }, [loadActuals])

  useEffect(() => {
    if (!member) return
    supabase.from('resource_confirmations').select('date')
      .eq('member_id', member.id).gte('date', weekStart).lte('date', weekEnd)
      .then(({ data }) => setConfirmedDays(new Set((data ?? []).map((r: { date: string }) => r.date))))
  }, [member, weekStart, weekEnd])

  useEffect(() => {
    supabase.from('projects').select('id, pn, name').eq('status', 'active').order('name')
      .then(({ data }) => setProjects(data ?? []))
  }, [])

  useEffect(() => {
    const confirmDayAllocs = allocs.filter(a => a.date === confirmDay && a.category !== 'leave')
    setTodayLog(prev => {
      const next = { ...prev }
      confirmDayAllocs.forEach(a => { if (next[a.id] === undefined) next[a.id] = '' })
      return next
    })
  }, [allocs, confirmDay])

  useEffect(() => {
    const current = localDate(new Date())
    if (days.includes(current)) setConfirmDay(current)
    else setConfirmDay(days[0])
  }, [weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── derived ───────────────────────────────────────────────────────────────────

  const leaveAllocs = allocs.filter(a => a.category === 'leave')
  const workAllocs = allocs.filter(a => a.category !== 'leave')
  const leaveDayCount = [...new Set(leaveAllocs.map(a => a.date))].length
  const weekCapacity = member ? (member.hours_per_day ?? 8) * (5 - leaveDayCount) : 40
  const totalAllocated = workAllocs.reduce((s, a) => s + a.hours, 0)
  const totalLogged = Object.values(actuals).reduce((s, h) => s + h, 0)
  const utilization = weekCapacity > 0 ? Math.round((totalAllocated / weekCapacity) * 100) : 0
  const confirmedDayCount = days.filter(d => confirmedDays.has(d)).length

  const priorityOrder: Record<'urgent' | 'high' | 'none', number> = { urgent: 0, high: 1, none: 2 }

  const projectGroups = useMemo<ProjectGroup[]>(() => {
    const map: Record<string, ProjectGroup> = {}
    workAllocs.filter(a => a.category !== 'maintenance').forEach(a => {
      const pid = (a as { project_id?: string | null }).project_id ?? null
      const key = pid ? `p:${pid}` : `l:${a.label ?? a.category}`
      const lbl = (a.project as { name?: string } | null)?.name ?? a.label ?? CAT_STYLE[a.category].label
      const pri = parsePriority(a.notes)
      if (!map[key]) {
        map[key] = { key, label: lbl, category: a.category, allocIds: [], allocated: 0, note: cleanNote(a.notes), priority: 'none', dates: [] }
      }
      map[key].allocIds.push(a.id)
      map[key].allocated += a.hours
      if (!map[key].dates.includes(a.date)) map[key].dates.push(a.date)
      if (pri === 'urgent') map[key].priority = 'urgent'
      else if (pri === 'high' && map[key].priority !== 'urgent') map[key].priority = 'high'
    })
    return Object.values(map).sort((a, b) => {
      const pd = priorityOrder[a.priority] - priorityOrder[b.priority]
      return pd !== 0 ? pd : b.allocated - a.allocated
    })
  }, [workAllocs]) // eslint-disable-line react-hooks/exhaustive-deps

  const maintenanceGroups = useMemo<ProjectGroup[]>(() => {
    const map: Record<string, ProjectGroup> = {}
    workAllocs.filter(a => a.category === 'maintenance').forEach(a => {
      const pid = (a as { project_id?: string | null }).project_id ?? null
      const key = pid ? `p:${pid}` : `l:${a.label ?? a.category}`
      const lbl = (a.project as { name?: string } | null)?.name ?? a.label ?? 'Maintenance'
      const pri = parsePriority(a.notes)
      if (!map[key]) {
        map[key] = { key, label: lbl, category: 'maintenance', allocIds: [], allocated: 0, note: cleanNote(a.notes), priority: 'none', dates: [] }
      }
      map[key].allocIds.push(a.id)
      map[key].allocated += a.hours
      if (!map[key].dates.includes(a.date)) map[key].dates.push(a.date)
      if (pri === 'urgent') map[key].priority = 'urgent'
      else if (pri === 'high' && map[key].priority !== 'urgent') map[key].priority = 'high'
    })
    return Object.values(map).sort((a, b) => {
      const pd = priorityOrder[a.priority] - priorityOrder[b.priority]
      return pd !== 0 ? pd : b.allocated - a.allocated
    })
  }, [workAllocs]) // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDayAllocs = allocs.filter(a => a.date === confirmDay && a.category !== 'leave')
  const confirmDayLeave = allocs.filter(a => a.date === confirmDay && a.category === 'leave')
  const confirmDayIdx = days.indexOf(confirmDay)

  // All groups sorted by priority for priorities panel
  const allGroupsSorted = [...projectGroups, ...maintenanceGroups]
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  function groupLogged(g: ProjectGroup): number {
    return g.allocIds.reduce((s, id) => s + (actuals[id] ?? 0), 0)
  }

  async function logHours(allocId: string) {
    if (!member) return
    const rawVal = todayLog[allocId]
    const hrs = parseFloat(rawVal)
    if (isNaN(hrs) || hrs < 0) { toast('error', 'Enter a valid number of hours'); return }
    setLoggingId(allocId)
    try {
      await supabase.from('allocation_actuals').upsert(
        { allocation_id: allocId, member_id: member.id, date: confirmDay, actual_hours: hrs },
        { onConflict: 'allocation_id,date' }
      )
      setActuals(prev => ({ ...prev, [allocId]: hrs }))
      toast('success', 'Hours logged')
    } catch { toast('error', 'Failed to log hours') }
    setLoggingId(null)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--c3)' }}>Loading…</div>
      </div>
    )
  }
  if (!member) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Invalid or expired link</div>
          <div style={{ fontSize: 13, color: 'var(--c2)', marginTop: 6 }}>Ask your team lead for a new link.</div>
        </div>
      </div>
    )
  }

  const teamColor = (member.team as { color?: string } | null)?.color ?? '#0f172a'
  const teamName = (member.team as { name?: string } | null)?.name ?? ''

  const NAV: Array<{ id: ActiveView; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard',  icon: <IconGrid /> },
    { id: 'plan',      label: 'Weekly Plan', icon: <IconCalendar /> },
    { id: 'stats',     label: 'Statistics',  icon: <IconBarChart /> },
    { id: 'timesheets',label: 'Timesheets',  icon: <IconClock /> },
  ]

  // ── Project row component ─────────────────────────────────────────────────────

  function ProjectRow({ g, last, isMaint }: { g: ProjectGroup; last: boolean; isMaint: boolean }) {
    const cat = CAT_STYLE[g.category]
    const logged = groupLogged(g)
    const remaining = Math.max(0, g.allocated - logged)
    const pct = g.allocated > 0 ? Math.min(1, logged / g.allocated) : 0
    const done = remaining === 0 && logged > 0
    const remPct = g.allocated > 0 ? remaining / g.allocated : 1
    const remColor = done ? 'var(--green)' : remPct < 0.2 ? 'var(--red)' : isMaint ? '#92400e' : 'var(--c0)'
    const barColor = done ? 'var(--green)' : isMaint ? '#c2410c' : 'var(--navy)'

    return (
      <div style={{ borderBottom: last ? 'none' : isMaint ? '1px solid #fed7aa' : '1px solid var(--c5)', background: isMaint ? '#fffbf7' : '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, padding: isMobile ? '12px 16px 12px' : '14px 24px 14px' }}>
          {/* Icon */}
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: isMaint ? '#fff7ed' : cat.bg,
            border: isMaint ? '1px solid #fed7aa' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isMaint ? '#c2410c' : cat.color, fontSize: 12, fontWeight: 800,
          }}>
            {isMaint ? <IconWrench /> : g.label.charAt(0).toUpperCase()}
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: isMaint ? '#92400e' : 'var(--c0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? 160 : 'none' }}>{g.label}</span>
              {g.priority === 'urgent' && <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: 'var(--red-bg)', color: 'var(--red)', textTransform: 'uppercase', flexShrink: 0 }}>URGENT</span>}
              {g.priority === 'high' && <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#fffbeb', color: '#d97706', textTransform: 'uppercase', flexShrink: 0 }}>HIGH</span>}
            </div>
            {g.note && <div style={{ fontSize: 12, color: 'var(--c2)', fontStyle: 'italic', marginBottom: 4 }}>"{g.note}"</div>}
            {!isMobile && (
              <div style={{ display: 'flex', gap: 4 }}>
                {!isMaint && <span style={{ padding: '1px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: cat.bg, color: cat.color, textTransform: 'uppercase' }}>{cat.label}</span>}
                {g.dates.sort().map(d => (
                  <span key={d} style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: isMaint ? '#fed7aa' : 'var(--c7)', color: isMaint ? '#c2410c' : 'var(--c2)' }}>{fmtDayShort(d)}</span>
                ))}
              </div>
            )}
          </div>
          {/* ALLOCATED */}
          <div style={{ textAlign: 'center', minWidth: isMobile ? 54 : 76, flexShrink: 0 }}>
            {!isMobile && <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Allocated</div>}
            <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 800, color: isMaint ? '#c2410c' : 'var(--navy)', fontFamily: 'Manrope, sans-serif' }}>{fmt(g.allocated)}h</div>
          </div>
          {/* REMAINING */}
          <div style={{ textAlign: 'center', minWidth: isMobile ? 54 : 76, flexShrink: 0 }}>
            {!isMobile && <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Remaining</div>}
            <div style={{ fontSize: isMobile ? 15 : 18, fontWeight: 800, color: remColor, fontFamily: 'Manrope, sans-serif' }}>{done ? '✓' : `${fmt(remaining)}h`}</div>
          </div>
        </div>
        {/* Full-width progress bar */}
        <div style={{ height: 4, background: isMaint ? '#fde8d0' : 'var(--c6)' }}>
          <div style={{ height: '100%', width: `${pct * 100}%`, background: barColor, transition: 'width 0.3s ease' }} />
        </div>
      </div>
    )
  }

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Desktop Sidebar ── */}
      {!isMobile && (
        <div style={{
          width: 220, flexShrink: 0, background: '#fff', borderRight: '1px solid var(--c5)',
          display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 40,
        }}>
          <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--c6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 900, fontFamily: 'Manrope, sans-serif' }}>R</span>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c0)', fontFamily: 'Manrope, sans-serif', lineHeight: 1.1 }}>Agency OS</div>
                <div style={{ fontSize: 10, color: 'var(--c2)' }}>Member Portal</div>
              </div>
            </div>
          </div>
          <nav style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV.map(item => {
              const active = activeView === item.id
              return (
                <button key={item.id} onClick={() => setActiveView(item.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                    padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: active ? 'var(--navy-light)' : 'transparent',
                    color: active ? 'var(--navy)' : 'var(--c2)',
                    fontWeight: active ? 700 : 500, fontSize: 13,
                  }}>
                  <span style={{ color: active ? 'var(--navy)' : 'var(--c3)', display: 'flex' }}>{item.icon}</span>
                  {item.label}
                </button>
              )
            })}
          </nav>
          <div style={{ padding: '14px 16px', borderTop: '1px solid var(--c6)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: teamColor + '22', color: teamColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>
              {member.name.charAt(0)}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{member.name}</div>
              <div style={{ fontSize: 11, color: 'var(--c2)' }}>{member.role ?? teamName}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <div style={{ marginLeft: isMobile ? 0 : 220, flex: 1, minHeight: '100vh', paddingBottom: isMobile ? 72 : 0 }}>

        {/* Mobile top bar */}
        {isMobile && (
          <div style={{ background: '#fff', borderBottom: '1px solid var(--c5)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>R</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c0)', fontFamily: 'Manrope, sans-serif' }}>Agency OS</span>
            </div>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: teamColor + '22', color: teamColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
              {member.name.charAt(0)}
            </div>
          </div>
        )}

        {/* ════ DASHBOARD ════ */}
        {activeView === 'dashboard' && (
          <div style={{ padding: isMobile ? '16px 16px 24px' : '28px 32px 56px' }}>
            {/* Outer 2-col: left content + right priorities */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 272px', gap: 20, alignItems: 'start', maxWidth: 1100 }}>

              {/* ── LEFT COLUMN ── */}
              <div style={{ minWidth: 0 }}>

                {/* Welcome */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--c5)', padding: isMobile ? '16px' : '20px 28px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
                    <div>
                      <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: 'var(--c0)', fontFamily: 'Manrope, sans-serif' }}>
                        {greeting}, {member.name.split(' ')[0]}.
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: teamColor + '18', color: teamColor }}>
                          {member.role ?? teamName}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--c2)' }}>
                          {fmtWeekRange(weekStart)}
                          {isCurrentWeek && confirmedDayCount > 0 && <span> · {confirmedDayCount}/5 confirmed</span>}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button onClick={() => setShowSickLeave(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--red-border)', background: 'var(--red-bg)', color: 'var(--red)', cursor: 'pointer' }}>
                        <IconHome /> Sick Leave
                      </button>
                      <button onClick={() => setShowDelay(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '8px 12px', borderRadius: 8, border: '1px solid #fcd34d', background: '#fffbeb', color: '#d97706', cursor: 'pointer' }}>
                        <IconAlertTriangle /> {isMobile ? 'Delay' : 'Report Delay'}
                      </button>
                      <button onClick={() => setShowUnplanned(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--c5)', background: '#fff', color: 'var(--c1)', cursor: 'pointer' }}>
                        <IconPlus /> Unplanned
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3 stat cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: isMobile ? 8 : 12, marginBottom: 16 }}>
                  {[
                    { label: 'TOTAL CAPACITY', value: fmt(weekCapacity), unit: 'hrs', sub: 'Standard week', color: 'var(--c0)' },
                    { label: 'ALLOCATED', value: fmt(totalAllocated), unit: 'hrs', sub: `${utilization}% utilization`, color: totalAllocated > weekCapacity ? 'var(--red)' : 'var(--navy)' },
                    { label: 'LOGGED', value: fmt(totalLogged), unit: 'hrs', sub: `${fmt(Math.max(0, totalAllocated - totalLogged))}h remaining`, color: totalLogged > 0 ? 'var(--green)' : 'var(--c3)' },
                  ].map(s => (
                    <div key={s.label} style={{ background: '#fff', border: '1px solid var(--c5)', borderRadius: 12, padding: isMobile ? '14px 12px' : '20px 20px' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{s.label}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 4 }}>
                        <span style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: s.color, fontFamily: 'Manrope, sans-serif', lineHeight: 1 }}>{s.value}</span>
                        <span style={{ fontSize: isMobile ? 11 : 13, fontWeight: 600, color: s.color }}>{s.unit}</span>
                      </div>
                      <div style={{ fontSize: isMobile ? 10 : 11, color: 'var(--c2)' }}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Assigned Projects */}
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--c5)', marginBottom: 16, overflow: 'hidden' }}>
                  <div style={{ padding: isMobile ? '12px 16px' : '14px 24px', borderBottom: '1px solid var(--c5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c0)', fontFamily: 'Manrope, sans-serif' }}>Assigned Projects</div>
                    <div style={{ fontSize: 12, color: 'var(--c2)', fontWeight: 600 }}>{projectGroups.length + maintenanceGroups.length} active this week</div>
                  </div>
                  {projectGroups.length === 0 && maintenanceGroups.length === 0 ? (
                    <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--c3)', fontSize: 13 }}>No work allocated this week.</div>
                  ) : (
                    <>
                      {projectGroups.map((g, i) => (
                        <ProjectRow key={g.key} g={g} last={i === projectGroups.length - 1 && maintenanceGroups.length === 0} isMaint={false} />
                      ))}
                      {maintenanceGroups.length > 0 && (
                        <>
                          <div style={{ padding: '6px 24px', background: '#fff7ed', borderTop: projectGroups.length > 0 ? '2px solid #fed7aa' : undefined, borderBottom: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: '#c2410c', display: 'flex' }}><IconWrench /></span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Maintenance</span>
                          </div>
                          {maintenanceGroups.map((g, i) => (
                            <ProjectRow key={g.key} g={g} last={i === maintenanceGroups.length - 1} isMaint={true} />
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Daily Confirmation */}
                {isCurrentWeek && (
                  <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--c5)', overflow: 'hidden' }}>
                    <div style={{ padding: isMobile ? '12px 16px' : '14px 24px', borderBottom: '1px solid var(--c5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c0)', fontFamily: 'Manrope, sans-serif' }}>Daily Confirmation</div>
                        <div style={{ fontSize: 12, color: 'var(--c2)', marginTop: 2 }}>Log hours worked on this day.</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                          onClick={() => confirmDayIdx > 0 && setConfirmDay(days[confirmDayIdx - 1])}
                          disabled={confirmDayIdx <= 0}
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--c5)', background: '#fff', color: confirmDayIdx <= 0 ? 'var(--c5)' : 'var(--c1)', cursor: confirmDayIdx <= 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                          ‹
                        </button>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)', padding: '5px 12px', borderRadius: 20, minWidth: 160, textAlign: 'center' }}>
                          {fmtDateMedium(confirmDay)}
                          {confirmDay === today && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--navy)', background: 'var(--navy-light)', padding: '1px 6px', borderRadius: 10 }}>TODAY</span>}
                        </div>
                        <button
                          onClick={() => confirmDayIdx < days.length - 1 && setConfirmDay(days[confirmDayIdx + 1])}
                          disabled={confirmDayIdx >= days.length - 1}
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--c5)', background: '#fff', color: confirmDayIdx >= days.length - 1 ? 'var(--c5)' : 'var(--c1)', cursor: confirmDayIdx >= days.length - 1 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                          ›
                        </button>
                      </div>
                    </div>

                    {confirmDayLeave.length > 0 && (
                      <div style={{ padding: '12px 24px', background: 'var(--red-bg)', borderBottom: '1px solid var(--red-border)', fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
                        {confirmDayLeave[0].label ?? 'Leave'} — marked as off this day
                      </div>
                    )}

                    {confirmDayAllocs.length === 0 && confirmDayLeave.length === 0 ? (
                      <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--c3)', fontSize: 13 }}>
                        No tasks planned for this day.
                        <span style={{ color: 'var(--navy)', fontWeight: 600, marginLeft: 6, cursor: 'pointer' }} onClick={() => setShowUnplanned(true)}>+ Log unplanned work</span>
                      </div>
                    ) : (
                      <>
                        {!isMobile && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 210px', padding: '8px 24px', background: 'var(--c8)', borderBottom: '1px solid var(--c5)' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Hours Worked</div>
                          </div>
                        )}
                        {confirmDayAllocs.map((a, i) => {
                          const cat = CAT_STYLE[a.category]
                          const projName = (a.project as { name?: string } | null)?.name ?? a.label ?? cat.label
                          const note = cleanNote(a.notes)
                          const pri = parsePriority(a.notes)
                          const val = todayLog[a.id] ?? ''
                          const existingLogged = actuals[a.id] ?? 0
                          const isSaving = loggingId === a.id
                          return (
                            <div key={a.id} style={{
                              display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 210px',
                              padding: isMobile ? '12px 16px' : '14px 24px',
                              borderBottom: i < confirmDayAllocs.length - 1 ? '1px solid var(--c5)' : 'none',
                              gap: isMobile ? 10 : 0, alignItems: 'center',
                            }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                                  <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', background: cat.bg, color: cat.color }}>{cat.label}</span>
                                  {pri === 'urgent' && <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: 'var(--red-bg)', color: 'var(--red)' }}>URGENT</span>}
                                  {pri === 'high' && <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#fff8e1', color: '#e65100' }}>HIGH</span>}
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c0)' }}>{projName}</div>
                                {note && <div style={{ fontSize: 12, color: 'var(--c2)', fontStyle: 'italic', marginTop: 1 }}>"{note}"</div>}
                                {existingLogged > 0 && (
                                  <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600, marginTop: 3 }}>✓ {fmt(existingLogged)}h logged today</div>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
                                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--c5)', borderRadius: 8, overflow: 'hidden' }}>
                                  <input
                                    type="number" min={0} step={0.5}
                                    value={val}
                                    placeholder="0.0"
                                    onChange={e => setTodayLog(prev => ({ ...prev, [a.id]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') logHours(a.id) }}
                                    style={{ width: 70, padding: '8px 10px', border: 'none', fontSize: 14, fontWeight: 700, textAlign: 'center', outline: 'none', color: 'var(--c0)' }}
                                  />
                                  <div style={{ padding: '8px 6px', fontSize: 13, color: 'var(--c2)', borderLeft: '1px solid var(--c5)', background: 'var(--c7)' }}>h</div>
                                </div>
                                <button
                                  onClick={() => logHours(a.id)}
                                  disabled={isSaving || val === '' || isNaN(parseFloat(val))}
                                  style={{
                                    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                                    border: 'none', cursor: isSaving ? 'default' : 'pointer',
                                    background: isSaving ? 'var(--c5)' : 'var(--navy)', color: isSaving ? 'var(--c3)' : '#fff',
                                  }}>
                                  {isSaving ? '…' : 'Log'}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── RIGHT COLUMN: Priorities ── */}
              {!isMobile && (
                <div style={{ position: 'sticky', top: 28 }}>
                  <div style={{ background: 'var(--navy)', borderRadius: 12, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
                      <span style={{ color: '#94a3b8', display: 'flex' }}><IconZap /></span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', fontFamily: 'Manrope, sans-serif' }}>Priorities</span>
                    </div>
                    {allGroupsSorted.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>No work planned this week.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {allGroupsSorted.map(g => (
                          <div key={g.key} style={{
                            padding: '9px 12px', borderRadius: 8,
                            background: g.priority === 'urgent' ? 'rgba(239,68,68,0.15)' : g.priority === 'high' ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.07)',
                            border: `1px solid ${g.priority === 'urgent' ? 'rgba(239,68,68,0.3)' : g.priority === 'high' ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.09)'}`,
                          }}>
                            {g.priority !== 'none' && (
                              <div style={{ marginBottom: 4 }}>
                                <span style={{
                                  padding: '1px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                                  background: g.priority === 'urgent' ? 'rgba(239,68,68,0.8)' : 'rgba(217,119,6,0.8)', color: '#fff',
                                }}>{g.priority}</span>
                              </div>
                            )}
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.3 }}>{g.label}</div>
                            {g.note && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, lineHeight: 1.4 }}>{g.note}</div>}
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{fmt(g.allocated)}h allocated</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ════ WEEKLY PLAN ════ */}
        {activeView === 'plan' && (
          <div style={{ padding: isMobile ? '16px 16px 24px' : '28px 32px 56px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              <button onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
                style={{ border: '1px solid var(--c5)', background: '#fff', cursor: 'pointer', color: 'var(--c2)', borderRadius: 6, padding: '5px 12px', fontSize: 14 }}>‹</button>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c1)', minWidth: isMobile ? 0 : 200, textAlign: 'center' }}>{fmtWeekRange(weekStart)}</span>
              <button onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
                style={{ border: '1px solid var(--c5)', background: '#fff', cursor: 'pointer', color: 'var(--c2)', borderRadius: 6, padding: '5px 12px', fontSize: 14 }}>›</button>
              {!isCurrentWeek && (
                <button onClick={() => setWeekStart(getMonday(new Date()))}
                  style={{ fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 6, background: 'var(--navy)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                  Today
                </button>
              )}
            </div>

            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--c5)', overflow: 'hidden', marginBottom: 16 }}>
              <div style={{ padding: isMobile ? '12px 16px' : '14px 24px', borderBottom: '1px solid var(--c5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c0)', fontFamily: 'Manrope, sans-serif' }}>Weekly Project Plan</div>
                <div style={{ fontSize: 12, color: 'var(--c2)', fontWeight: 600 }}>{fmtWeekRange(weekStart)}</div>
              </div>
              {projectGroups.length === 0 && maintenanceGroups.length === 0 && (
                <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--c3)', fontSize: 13 }}>No work allocated this week.</div>
              )}
              {projectGroups.map((g, i) => (
                <ProjectRow key={g.key} g={g} last={i === projectGroups.length - 1 && maintenanceGroups.length === 0} isMaint={false} />
              ))}
              {maintenanceGroups.length > 0 && (
                <>
                  <div style={{ padding: '6px 24px', background: '#fff7ed', borderTop: projectGroups.length > 0 ? '2px solid #fed7aa' : undefined, borderBottom: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#c2410c', display: 'flex' }}><IconWrench /></span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#c2410c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Maintenance</span>
                  </div>
                  {maintenanceGroups.map((g, i) => (
                    <ProjectRow key={g.key} g={g} last={i === maintenanceGroups.length - 1} isMaint={true} />
                  ))}
                </>
              )}
            </div>

            {/* Week at a Glance */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--c5)', padding: isMobile ? '14px 16px' : '16px 24px' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c0)', fontFamily: 'Manrope, sans-serif', marginBottom: 14 }}>Week at a Glance</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: isMobile ? 6 : 12 }}>
                {days.map(d => {
                  const dAllocs = allocs.filter(a => a.date === d && a.category !== 'leave')
                  const dLeave = allocs.some(a => a.date === d && a.category === 'leave')
                  const dHrs = dAllocs.reduce((s, a) => s + a.hours, 0)
                  const dLogged = dAllocs.reduce((s, a) => s + (actuals[a.id] ?? 0), 0)
                  const isConf = confirmedDays.has(d)
                  const isToday = d === today
                  const cap = member.hours_per_day ?? 8
                  const pct = cap > 0 ? Math.min(1, dHrs / cap) : 0
                  return (
                    <div key={d} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--navy)' : 'var(--c2)', marginBottom: 6 }}>
                        {fmtDayShort(d)} {new Date(d + 'T00:00:00').getDate()}
                      </div>
                      <div style={{ height: 48, background: 'var(--c7)', borderRadius: 6, overflow: 'hidden', position: 'relative', marginBottom: 4 }}>
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${pct * 100}%`, background: dLeave ? 'var(--red)' : isConf ? 'var(--green)' : 'var(--navy)', opacity: 0.8 }} />
                        {dLogged > 0 && (
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${Math.min(1, dLogged / cap) * 100}%`, background: 'var(--green)' }} />
                        )}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: dLeave ? 'var(--red)' : 'var(--c1)' }}>
                        {dLeave ? 'Off' : dHrs > 0 ? `${fmt(dHrs)}h` : '–'}
                      </div>
                      {isConf && <div style={{ fontSize: 9, color: 'var(--green)', fontWeight: 700 }}>✓</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════ STATISTICS ════ */}
        {activeView === 'stats' && (
          <div style={{ padding: isMobile ? '16px' : '28px 32px 56px' }}>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--c5)', padding: '48px', textAlign: 'center', color: 'var(--c3)' }}>
              <div style={{ fontWeight: 700, color: 'var(--c1)', marginBottom: 6 }}>Statistics coming soon</div>
              <div style={{ fontSize: 13 }}>Detailed utilization and trend reports will appear here.</div>
            </div>
          </div>
        )}

        {/* ════ TIMESHEETS ════ */}
        {activeView === 'timesheets' && (
          <div style={{ padding: isMobile ? '16px' : '28px 32px 56px' }}>
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--c5)', padding: '48px', textAlign: 'center', color: 'var(--c3)' }}>
              <div style={{ fontWeight: 700, color: 'var(--c1)', marginBottom: 6 }}>Timesheets coming soon</div>
              <div style={{ fontSize: 13 }}>Your full logged hours history will appear here.</div>
            </div>
          </div>
        )}

      </div>

      {/* ── Mobile Bottom Nav ── */}
      {isMobile && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
          background: '#fff', borderTop: '1px solid var(--c5)',
          display: 'flex', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
          {NAV.map(item => {
            const active = activeView === item.id
            return (
              <button key={item.id} onClick={() => setActiveView(item.id)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '10px 4px', border: 'none', background: 'transparent', cursor: 'pointer',
                  color: active ? 'var(--navy)' : 'var(--c3)',
                }}>
                <span style={{ display: 'flex' }}>{item.icon}</span>
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 400 }}>{item.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {showSickLeave && (
        <SickLeaveModal days={days} member={member} onClose={() => setShowSickLeave(false)} onSaved={loadAllocs} />
      )}
      {showUnplanned && (
        <UnplannedModal member={member} days={days} projects={projects} onClose={() => setShowUnplanned(false)} onSaved={loadAllocs} />
      )}
      {showDelay && (
        <ReportDelayModal projects={projects} onClose={() => setShowDelay(false)} />
      )}
    </div>
  )
}
