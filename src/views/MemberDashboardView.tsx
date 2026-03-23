import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { TeamMember, ResourceAllocation, AllocationCategory } from '../lib/types'
import { Button } from '@/components/ui/button'
import { Modal } from '../components/Modal'

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
    <Modal title="Report Sick Leave" onClose={onClose} maxWidth={400}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={save} disabled={sel.length === 0 || saving}>
            {saving ? '…' : `Report ${sel.length} day${sel.length !== 1 ? 's' : ''}`}
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-[var(--c2)] mb-4">Select the days you were sick.</p>
      <div className="flex gap-2 flex-wrap">
        {days.map(d => {
          const active = sel.includes(d)
          return (
            <button key={d}
              onClick={() => setSel(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])}
              className={`px-4 py-[10px] rounded-lg text-[13px] font-bold cursor-pointer transition-all ${
                active
                  ? 'border-2 border-[var(--red)] bg-[var(--red-bg)] text-[var(--red)]'
                  : 'border-2 border-[var(--c5)] bg-white text-[var(--c1)]'
              }`}
            >
              {fmtDayShort(d)} {new Date(d + 'T00:00:00').getDate()}
            </button>
          )
        })}
      </div>
    </Modal>
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
  const todayStr = localDate(new Date())
  const [form, setForm] = useState({
    date: days.includes(todayStr) ? todayStr : days[0],
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
    <Modal title="Log Unplanned Work" onClose={onClose} maxWidth={480}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? '…' : 'Add Entry'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-[6px]">Day</div>
          <div className="flex gap-[6px]">
            {days.map(d => (
              <button key={d} onClick={() => setForm(f => ({ ...f, date: d }))}
                className={`flex-1 py-[7px] px-1 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                  form.date === d
                    ? 'border-2 border-[var(--navy)] bg-[var(--navy)] text-white'
                    : 'border-2 border-[var(--c5)] bg-white text-[var(--c1)]'
                }`}
              >
                {fmtDayShort(d)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-[6px]">Category</div>
          <div className="flex gap-[6px] flex-wrap">
            {CATS.map(c => (
              <button key={c} onClick={() => setForm(f => ({ ...f, category: c }))}
                className="px-3 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-all"
                style={{
                  border: form.category === c ? `2px solid ${CAT_STYLE[c].color}` : '2px solid var(--c5)',
                  background: form.category === c ? CAT_STYLE[c].bg : '#fff',
                  color: form.category === c ? CAT_STYLE[c].color : 'var(--c3)',
                }}
              >
                {CAT_STYLE[c].label}
              </button>
            ))}
          </div>
        </div>
        {(form.category === 'project' || form.category === 'maintenance') && (
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project</label>
            <select value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}>
              <option value="">— Select project —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.pn} · {p.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Label (optional)</label>
            <input placeholder="e.g. Bug fix, Client call…" value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Hours</label>
            <input type="number" min={0.5} step={0.5} value={form.hours}
              onChange={e => setForm(f => ({ ...f, hours: Number(e.target.value) }))} />
          </div>
        </div>
      </div>
    </Modal>
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
    <Modal
      title="Report Delay"
      onClose={onClose}
      maxWidth={440}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={saving}
            className="bg-[#d97706] hover:bg-[#b45309] text-white"
            onClick={save}
          >
            {saving ? '…' : 'Report Delay'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[14px]">
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project</label>
          <select value={projectId} onChange={e => setProjectId(e.target.value)}>
            <option value="">— Select project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.pn} · {p.name}</option>)}
          </select>
        </div>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">What's delayed? (optional)</label>
          <textarea rows={3} placeholder="Briefly describe the delay…"
            value={note} onChange={e => setNote(e.target.value)} className="resize-y" />
        </div>
      </div>
    </Modal>
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
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    )
  }
  if (!member) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <div className="text-center">
          <div className="text-[32px] mb-3">🔒</div>
          <div className="text-base font-bold">Invalid or expired link</div>
          <div className="text-[13px] text-[var(--c2)] mt-[6px]">Ask your team lead for a new link.</div>
        </div>
      </div>
    )
  }

  const teamColor = (member.team as { color?: string } | null)?.color ?? '#0f172a'
  const teamName = (member.team as { name?: string } | null)?.name ?? ''

  const NAV: Array<{ id: ActiveView; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard',   icon: <IconGrid /> },
    { id: 'plan',      label: 'Weekly Plan',  icon: <IconCalendar /> },
    { id: 'stats',     label: 'Statistics',   icon: <IconBarChart /> },
    { id: 'timesheets',label: 'Timesheets',   icon: <IconClock /> },
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
        <div className={`flex items-center ${isMobile ? 'gap-[10px] px-4 py-3' : 'gap-[14px] px-6 py-[14px]'}`}>
          {/* Icon */}
          <div
            className="w-[38px] h-[38px] rounded-[10px] flex-shrink-0 flex items-center justify-center text-xs font-extrabold"
            style={{
              background: isMaint ? '#fff7ed' : cat.bg,
              border: isMaint ? '1px solid #fed7aa' : 'none',
              color: isMaint ? '#c2410c' : cat.color,
            }}
          >
            {isMaint ? <IconWrench /> : g.label.charAt(0).toUpperCase()}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className={`flex items-center gap-[6px] mb-[2px] flex-wrap`}>
              <span
                className={`text-sm font-bold overflow-hidden text-ellipsis whitespace-nowrap ${isMobile ? 'max-w-[160px]' : ''}`}
                style={{ color: isMaint ? '#92400e' : 'var(--c0)' }}
              >{g.label}</span>
              {g.priority === 'urgent' && <span className="px-[7px] py-[1px] rounded text-[9px] font-bold bg-[var(--red-bg)] text-[var(--red)] uppercase flex-shrink-0">URGENT</span>}
              {g.priority === 'high' && <span className="px-[7px] py-[1px] rounded text-[9px] font-bold bg-[#fffbeb] text-[#d97706] uppercase flex-shrink-0">HIGH</span>}
            </div>
            {g.note && <div className="text-xs text-[var(--c2)] italic mb-1">"{g.note}"</div>}
            {!isMobile && (
              <div className="flex gap-1">
                {!isMaint && <span className="px-[7px] py-[1px] rounded text-[9px] font-bold uppercase" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>}
                {g.dates.sort().map(d => (
                  <span key={d} className="px-[6px] py-[1px] rounded text-[9px] font-bold" style={{ background: isMaint ? '#fed7aa' : 'var(--c7)', color: isMaint ? '#c2410c' : 'var(--c2)' }}>{fmtDayShort(d)}</span>
                ))}
              </div>
            )}
          </div>
          {/* ALLOCATED */}
          <div className={`text-center flex-shrink-0 ${isMobile ? 'min-w-[54px]' : 'min-w-[76px]'}`}>
            {!isMobile && <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.07em] mb-[3px]">Allocated</div>}
            <div
              className={`font-extrabold ${isMobile ? 'text-[15px]' : 'text-lg'}`}
              style={{ color: isMaint ? '#c2410c' : 'var(--navy)', fontFamily: 'Manrope, sans-serif' }}
            >{fmt(g.allocated)}h</div>
          </div>
          {/* REMAINING */}
          <div className={`text-center flex-shrink-0 ${isMobile ? 'min-w-[54px]' : 'min-w-[76px]'}`}>
            {!isMobile && <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.07em] mb-[3px]">Remaining</div>}
            <div className={`font-extrabold ${isMobile ? 'text-[15px]' : 'text-lg'}`} style={{ color: remColor, fontFamily: 'Manrope, sans-serif' }}>
              {done ? '✓' : `${fmt(remaining)}h`}
            </div>
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
    <div className="flex min-h-screen bg-[var(--bg)]">

      {/* ── Desktop Sidebar ── */}
      {!isMobile && (
        <div className="w-[220px] flex-shrink-0 bg-white border-r border-[var(--c5)] flex flex-col fixed top-0 bottom-0 left-0 z-40">
          <div className="px-5 py-[18px] pb-[14px] border-b border-[var(--c6)]">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-[7px] bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-black" style={{ fontFamily: 'Manrope, sans-serif' }}>R</span>
              </div>
              <div>
                <div className="text-[13px] font-extrabold text-foreground leading-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>Agency OS</div>
                <div className="text-[10px] text-[var(--c2)]">Member Portal</div>
              </div>
            </div>
          </div>
          <nav className="flex-1 p-[10px] flex flex-col gap-[2px]">
            {NAV.map(item => {
              const active = activeView === item.id
              return (
                <button key={item.id} onClick={() => setActiveView(item.id)}
                  className="flex items-center gap-[9px] w-full px-3 py-[9px] rounded-lg border-none cursor-pointer text-left text-[13px]"
                  style={{
                    background: active ? 'var(--navy-light)' : 'transparent',
                    color: active ? 'var(--navy)' : 'var(--c2)',
                    fontWeight: active ? 700 : 500,
                  }}>
                  <span style={{ color: active ? 'var(--navy)' : 'var(--c3)', display: 'flex' }}>{item.icon}</span>
                  {item.label}
                </button>
              )
            })}
          </nav>
          <div className="px-4 py-[14px] border-t border-[var(--c6)] flex items-center gap-[10px]">
            <div
              className="w-[34px] h-[34px] rounded-full flex-shrink-0 flex items-center justify-center text-[13px] font-extrabold"
              style={{ background: teamColor + '22', color: teamColor }}
            >
              {member.name.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <div className="text-[13px] font-bold text-foreground truncate">{member.name}</div>
              <div className="text-[11px] text-[var(--c2)]">{member.role ?? teamName}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Main ── */}
      <div className={`flex-1 min-h-screen ${isMobile ? 'ml-0 pb-[72px]' : 'ml-[220px]'}`}>

        {/* Mobile top bar */}
        {isMobile && (
          <div className="bg-white border-b border-[var(--c5)] px-4 py-3 flex items-center justify-between sticky top-0 z-[30]">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <span className="text-white text-[11px] font-black">R</span>
              </div>
              <span className="text-[13px] font-extrabold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>Agency OS</span>
            </div>
            <div
              className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-xs font-extrabold"
              style={{ background: teamColor + '22', color: teamColor }}
            >
              {member.name.charAt(0)}
            </div>
          </div>
        )}

        {/* ════ DASHBOARD ════ */}
        {activeView === 'dashboard' && (
          <div className={isMobile ? 'px-4 pt-4 pb-6' : 'px-8 pt-7 pb-14'}>
            {/* Outer 2-col: left content + right priorities */}
            <div
              className={`gap-5 items-start max-w-[1100px] ${isMobile ? 'flex flex-col' : 'grid'}`}
              style={!isMobile ? { gridTemplateColumns: '1fr 272px' } : undefined}
            >

              {/* ── LEFT COLUMN ── */}
              <div className="min-w-0">

                {/* Welcome */}
                <div
                  className={`bg-white rounded-xl border border-[var(--c5)] mb-4 ${isMobile ? 'p-4' : 'px-7 py-5'}`}
                >
                  <div className={`flex justify-between gap-3 ${isMobile ? 'flex-col items-start' : 'flex-row items-center'}`}>
                    <div>
                      <div
                        className={`font-extrabold text-foreground ${isMobile ? 'text-xl' : 'text-2xl'}`}
                        style={{ fontFamily: 'Manrope, sans-serif' }}
                      >
                        {greeting}, {member.name.split(' ')[0]}.
                      </div>
                      <div className="flex items-center gap-2 mt-[6px] flex-wrap">
                        <span className="px-[10px] py-[2px] rounded-[20px] text-[11px] font-bold" style={{ background: teamColor + '18', color: teamColor }}>
                          {member.role ?? teamName}
                        </span>
                        <span className="text-xs text-[var(--c2)]">
                          {fmtWeekRange(weekStart)}
                          {isCurrentWeek && confirmedDayCount > 0 && <span> · {confirmedDayCount}/5 confirmed</span>}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setShowSickLeave(true)}
                        className="flex items-center gap-[5px] text-xs font-bold px-3 py-2 rounded-lg cursor-pointer border border-[var(--red-border)] bg-[var(--red-bg)] text-[var(--red)]">
                        <IconHome /> Sick Leave
                      </button>
                      <button onClick={() => setShowDelay(true)}
                        className="flex items-center gap-[5px] text-xs font-bold px-3 py-2 rounded-lg cursor-pointer border border-[#fcd34d] bg-[#fffbeb] text-[#d97706]">
                        <IconAlertTriangle /> {isMobile ? 'Delay' : 'Report Delay'}
                      </button>
                      <button onClick={() => setShowUnplanned(true)}
                        className="flex items-center gap-[5px] text-xs font-bold px-3 py-2 rounded-lg cursor-pointer border border-[var(--c5)] bg-white text-[var(--c1)]">
                        <IconPlus /> Unplanned
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3 stat cards */}
                <div className={`grid grid-cols-3 mb-4 ${isMobile ? 'gap-2' : 'gap-3'}`}>
                  {[
                    { label: 'TOTAL CAPACITY', value: fmt(weekCapacity), unit: 'hrs', sub: 'Standard week', color: 'var(--c0)' },
                    { label: 'ALLOCATED', value: fmt(totalAllocated), unit: 'hrs', sub: `${utilization}% utilization`, color: totalAllocated > weekCapacity ? 'var(--red)' : 'var(--navy)' },
                    { label: 'LOGGED', value: fmt(totalLogged), unit: 'hrs', sub: `${fmt(Math.max(0, totalAllocated - totalLogged))}h remaining`, color: totalLogged > 0 ? 'var(--green)' : 'var(--c3)' },
                  ].map(s => (
                    <div key={s.label} className={`bg-white border border-[var(--c5)] rounded-xl ${isMobile ? 'p-[14px] px-3' : 'p-5'}`}>
                      <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.08em] mb-2">{s.label}</div>
                      <div className="flex items-baseline gap-[2px] mb-1">
                        <span className={`font-black leading-none ${isMobile ? 'text-[22px]' : 'text-[28px]'}`} style={{ color: s.color, fontFamily: 'Manrope, sans-serif' }}>{s.value}</span>
                        <span className={`font-semibold ${isMobile ? 'text-[11px]' : 'text-[13px]'}`} style={{ color: s.color }}>{s.unit}</span>
                      </div>
                      <div className={`text-[var(--c2)] ${isMobile ? 'text-[10px]' : 'text-[11px]'}`}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Assigned Projects */}
                <div className="bg-white rounded-xl border border-[var(--c5)] mb-4 overflow-hidden">
                  <div className={`${isMobile ? 'px-4 py-3' : 'px-6 py-[14px]'} border-b border-[var(--c5)] flex items-center justify-between`}>
                    <div className="text-[15px] font-extrabold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>Assigned Projects</div>
                    <div className="text-xs text-[var(--c2)] font-semibold">{projectGroups.length + maintenanceGroups.length} active this week</div>
                  </div>
                  {projectGroups.length === 0 && maintenanceGroups.length === 0 ? (
                    <div className="px-6 py-8 text-center text-muted-foreground text-[13px]">No work allocated this week.</div>
                  ) : (
                    <>
                      {projectGroups.map((g, i) => (
                        <ProjectRow key={g.key} g={g} last={i === projectGroups.length - 1 && maintenanceGroups.length === 0} isMaint={false} />
                      ))}
                      {maintenanceGroups.length > 0 && (
                        <>
                          <div className="px-6 py-[6px] bg-[#fff7ed] flex items-center gap-[6px]" style={{ borderTop: projectGroups.length > 0 ? '2px solid #fed7aa' : undefined, borderBottom: '1px solid #fed7aa' }}>
                            <span className="flex text-[#c2410c]"><IconWrench /></span>
                            <span className="text-[11px] font-bold text-[#c2410c] uppercase tracking-[0.05em]">Maintenance</span>
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
                  <div className="bg-white rounded-xl border border-[var(--c5)] overflow-hidden">
                    <div className={`${isMobile ? 'px-4 py-3' : 'px-6 py-[14px]'} border-b border-[var(--c5)] flex items-center justify-between flex-wrap gap-2`}>
                      <div>
                        <div className="text-[15px] font-extrabold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>Daily Confirmation</div>
                        <div className="text-xs text-[var(--c2)] mt-[2px]">Log hours worked on this day.</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => confirmDayIdx > 0 && setConfirmDay(days[confirmDayIdx - 1])}
                          disabled={confirmDayIdx <= 0}
                          className="w-7 h-7 rounded border border-[var(--c5)] bg-white flex items-center justify-center text-sm font-bold"
                          style={{ color: confirmDayIdx <= 0 ? 'var(--c5)' : 'var(--c1)', cursor: confirmDayIdx <= 0 ? 'default' : 'pointer' }}
                        >‹</button>
                        <div className="text-xs font-semibold text-[var(--c2)] bg-[var(--c7)] px-3 py-[5px] rounded-[20px] min-w-[160px] text-center">
                          {fmtDateMedium(confirmDay)}
                          {confirmDay === today && <span className="ml-[6px] text-[10px] font-bold text-primary bg-[var(--navy-light)] px-[6px] py-[1px] rounded-[10px]">TODAY</span>}
                        </div>
                        <button
                          onClick={() => confirmDayIdx < days.length - 1 && setConfirmDay(days[confirmDayIdx + 1])}
                          disabled={confirmDayIdx >= days.length - 1}
                          className="w-7 h-7 rounded border border-[var(--c5)] bg-white flex items-center justify-center text-sm font-bold"
                          style={{ color: confirmDayIdx >= days.length - 1 ? 'var(--c5)' : 'var(--c1)', cursor: confirmDayIdx >= days.length - 1 ? 'default' : 'pointer' }}
                        >›</button>
                      </div>
                    </div>

                    {confirmDayLeave.length > 0 && (
                      <div className="px-6 py-3 bg-[var(--red-bg)] border-b border-[var(--red-border)] text-[13px] text-[var(--red)] font-semibold">
                        {confirmDayLeave[0].label ?? 'Leave'} — marked as off this day
                      </div>
                    )}

                    {confirmDayAllocs.length === 0 && confirmDayLeave.length === 0 ? (
                      <div className="px-6 py-8 text-center text-muted-foreground text-[13px]">
                        No tasks planned for this day.
                        <span className="text-primary font-semibold ml-[6px] cursor-pointer" onClick={() => setShowUnplanned(true)}>+ Log unplanned work</span>
                      </div>
                    ) : (
                      <>
                        {!isMobile && (
                          <div className="grid px-6 py-2 bg-[var(--c8)] border-b border-[var(--c5)]" style={{ gridTemplateColumns: '1fr 210px' }}>
                            <div className="text-[11px] font-bold text-[var(--c2)] uppercase tracking-[0.05em]">Project</div>
                            <div className="text-[11px] font-bold text-[var(--c2)] uppercase tracking-[0.05em] text-right">Hours Worked</div>
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
                            <div
                              key={a.id}
                              className={`${isMobile ? 'px-4 py-3 flex flex-col gap-[10px]' : 'px-6 py-[14px] grid items-center'}`}
                              style={!isMobile ? { gridTemplateColumns: '1fr 210px', borderBottom: i < confirmDayAllocs.length - 1 ? '1px solid var(--c5)' : 'none' } : { borderBottom: i < confirmDayAllocs.length - 1 ? '1px solid var(--c5)' : 'none' }}
                            >
                              <div>
                                <div className="flex items-center gap-[5px] mb-[3px]">
                                  <span className="px-2 py-[2px] rounded text-[10px] font-bold uppercase" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
                                  {pri === 'urgent' && <span className="px-[7px] py-[2px] rounded text-[10px] font-bold bg-[var(--red-bg)] text-[var(--red)]">URGENT</span>}
                                  {pri === 'high' && <span className="px-[7px] py-[2px] rounded text-[10px] font-bold bg-[#fff8e1] text-[#e65100]">HIGH</span>}
                                </div>
                                <div className="text-sm font-bold text-foreground">{projName}</div>
                                {note && <div className="text-xs text-[var(--c2)] italic mt-[1px]">"{note}"</div>}
                                {existingLogged > 0 && (
                                  <div className="text-[11px] text-[#16a34a] font-semibold mt-[3px]">✓ {fmt(existingLogged)}h logged today</div>
                                )}
                              </div>
                              <div className={`flex items-center gap-2 ${isMobile ? 'justify-start' : 'justify-end'}`}>
                                <div className="flex items-center border border-[var(--c5)] rounded-lg overflow-hidden">
                                  <input
                                    type="number" min={0} step={0.5}
                                    value={val}
                                    placeholder="0.0"
                                    onChange={e => setTodayLog(prev => ({ ...prev, [a.id]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') logHours(a.id) }}
                                    className="w-[70px] px-[10px] py-2 border-none text-sm font-bold text-center outline-none text-foreground"
                                  />
                                  <div className="px-[6px] py-2 text-[13px] text-[var(--c2)] border-l border-[var(--c5)] bg-[var(--c7)]">h</div>
                                </div>
                                <button
                                  onClick={() => logHours(a.id)}
                                  disabled={isSaving || val === '' || isNaN(parseFloat(val))}
                                  className="px-4 py-2 rounded-lg text-[13px] font-bold border-none"
                                  style={{
                                    background: isSaving ? 'var(--c5)' : 'var(--navy)',
                                    color: isSaving ? 'var(--c3)' : '#fff',
                                    cursor: isSaving ? 'default' : 'pointer',
                                  }}
                                >
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
                <div className="sticky top-7">
                  <div className="bg-primary rounded-xl px-5 py-[18px]">
                    <div className="flex items-center gap-[7px] mb-[14px]">
                      <span className="flex text-[#94a3b8]"><IconZap /></span>
                      <span className="text-[13px] font-extrabold text-white" style={{ fontFamily: 'Manrope, sans-serif' }}>Priorities</span>
                    </div>
                    {allGroupsSorted.length === 0 ? (
                      <div className="text-xs text-[#64748b] leading-relaxed">No work planned this week.</div>
                    ) : (
                      <div className="flex flex-col gap-[6px]">
                        {allGroupsSorted.map(g => (
                          <div
                            key={g.key}
                            className="px-3 py-[9px] rounded-lg"
                            style={{
                              background: g.priority === 'urgent' ? 'rgba(239,68,68,0.15)' : g.priority === 'high' ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.07)',
                              border: `1px solid ${g.priority === 'urgent' ? 'rgba(239,68,68,0.3)' : g.priority === 'high' ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.09)'}`,
                            }}
                          >
                            {g.priority !== 'none' && (
                              <div className="mb-1">
                                <span
                                  className="px-[7px] py-[1px] rounded text-[9px] font-bold uppercase text-white"
                                  style={{ background: g.priority === 'urgent' ? 'rgba(239,68,68,0.8)' : 'rgba(217,119,6,0.8)' }}
                                >{g.priority}</span>
                              </div>
                            )}
                            <div className="text-xs font-bold text-[#f1f5f9] leading-tight">{g.label}</div>
                            {g.note && <div className="text-[11px] text-[#94a3b8] mt-[3px] leading-snug">{g.note}</div>}
                            <div className="text-[11px] text-[#475569] mt-1">{fmt(g.allocated)}h allocated</div>
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
          <div className={isMobile ? 'px-4 pt-4 pb-6' : 'px-8 pt-7 pb-14'}>
            <div className="flex items-center gap-2 mb-5 flex-wrap">
              <button onClick={() => setWeekStart(shiftWeek(weekStart, -1))}
                className="border border-[var(--c5)] bg-white cursor-pointer text-[var(--c2)] rounded px-3 py-[5px] text-sm">‹</button>
              <span className={`text-[13px] font-bold text-[var(--c1)] text-center ${!isMobile ? 'min-w-[200px]' : ''}`}>{fmtWeekRange(weekStart)}</span>
              <button onClick={() => setWeekStart(shiftWeek(weekStart, 1))}
                className="border border-[var(--c5)] bg-white cursor-pointer text-[var(--c2)] rounded px-3 py-[5px] text-sm">›</button>
              {!isCurrentWeek && (
                <button onClick={() => setWeekStart(getMonday(new Date()))}
                  className="text-xs font-bold px-3 py-[5px] rounded-md bg-primary text-white border-none cursor-pointer">
                  Today
                </button>
              )}
            </div>

            <div className="bg-white rounded-xl border border-[var(--c5)] overflow-hidden mb-4">
              <div className={`${isMobile ? 'px-4 py-3' : 'px-6 py-[14px]'} border-b border-[var(--c5)] flex items-center justify-between`}>
                <div className="text-[15px] font-extrabold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>Weekly Project Plan</div>
                <div className="text-xs text-[var(--c2)] font-semibold">{fmtWeekRange(weekStart)}</div>
              </div>
              {projectGroups.length === 0 && maintenanceGroups.length === 0 && (
                <div className="px-6 py-8 text-center text-muted-foreground text-[13px]">No work allocated this week.</div>
              )}
              {projectGroups.map((g, i) => (
                <ProjectRow key={g.key} g={g} last={i === projectGroups.length - 1 && maintenanceGroups.length === 0} isMaint={false} />
              ))}
              {maintenanceGroups.length > 0 && (
                <>
                  <div className="px-6 py-[6px] bg-[#fff7ed] flex items-center gap-[6px]" style={{ borderTop: projectGroups.length > 0 ? '2px solid #fed7aa' : undefined, borderBottom: '1px solid #fed7aa' }}>
                    <span className="flex text-[#c2410c]"><IconWrench /></span>
                    <span className="text-[11px] font-bold text-[#c2410c] uppercase tracking-[0.05em]">Maintenance</span>
                  </div>
                  {maintenanceGroups.map((g, i) => (
                    <ProjectRow key={g.key} g={g} last={i === maintenanceGroups.length - 1} isMaint={true} />
                  ))}
                </>
              )}
            </div>

            {/* Week at a Glance */}
            <div className={`bg-white rounded-xl border border-[var(--c5)] ${isMobile ? 'px-4 py-[14px]' : 'px-6 py-4'}`}>
              <div className="text-[13px] font-extrabold text-foreground mb-[14px]" style={{ fontFamily: 'Manrope, sans-serif' }}>Week at a Glance</div>
              <div className={`grid grid-cols-5 ${isMobile ? 'gap-[6px]' : 'gap-3'}`}>
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
                    <div key={d} className="text-center">
                      <div className={`text-[11px] mb-[6px] ${isToday ? 'font-extrabold text-primary' : 'font-semibold text-[var(--c2)]'}`}>
                        {fmtDayShort(d)} {new Date(d + 'T00:00:00').getDate()}
                      </div>
                      <div className="h-12 bg-[var(--c7)] rounded overflow-hidden relative mb-1">
                        <div
                          className="absolute bottom-0 left-0 right-0 opacity-80"
                          style={{ height: `${pct * 100}%`, background: dLeave ? 'var(--red)' : isConf ? 'var(--green)' : 'var(--navy)' }}
                        />
                        {dLogged > 0 && (
                          <div
                            className="absolute bottom-0 left-0 right-0"
                            style={{ height: `${Math.min(1, dLogged / cap) * 100}%`, background: 'var(--green)' }}
                          />
                        )}
                      </div>
                      <div className={`text-[11px] font-bold ${dLeave ? 'text-[var(--red)]' : 'text-[var(--c1)]'}`}>
                        {dLeave ? 'Off' : dHrs > 0 ? `${fmt(dHrs)}h` : '–'}
                      </div>
                      {isConf && <div className="text-[9px] text-[#16a34a] font-bold">✓</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ════ STATISTICS ════ */}
        {activeView === 'stats' && (
          <div className={isMobile ? 'p-4' : 'px-8 pt-7 pb-14'}>
            <div className="bg-white rounded-xl border border-[var(--c5)] p-12 text-center text-muted-foreground">
              <div className="font-bold text-foreground mb-[6px]">Statistics coming soon</div>
              <div className="text-[13px]">Detailed utilization and trend reports will appear here.</div>
            </div>
          </div>
        )}

        {/* ════ TIMESHEETS ════ */}
        {activeView === 'timesheets' && (
          <div className={isMobile ? 'p-4' : 'px-8 pt-7 pb-14'}>
            <div className="bg-white rounded-xl border border-[var(--c5)] p-12 text-center text-muted-foreground">
              <div className="font-bold text-foreground mb-[6px]">Timesheets coming soon</div>
              <div className="text-[13px]">Your full logged hours history will appear here.</div>
            </div>
          </div>
        )}

      </div>

      {/* ── Mobile Bottom Nav ── */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[var(--c5)] flex" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          {NAV.map(item => {
            const active = activeView === item.id
            return (
              <button key={item.id} onClick={() => setActiveView(item.id)}
                className="flex-1 flex flex-col items-center gap-[3px] py-[10px] px-1 border-none bg-transparent cursor-pointer"
                style={{ color: active ? 'var(--navy)' : 'var(--c3)' }}>
                <span className="flex">{item.icon}</span>
                <span className={`text-[10px] ${active ? 'font-bold' : 'font-normal'}`}>{item.label}</span>
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
