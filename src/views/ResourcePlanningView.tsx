import { useState, useEffect, useMemo } from 'react'
import { useResourceStore } from '../stores/resource'
import { useProjectsStore } from '../stores/projects'
import { useMaintenancesStore } from '../stores/maintenances'
import { useHolidayStore } from '../stores/holidays'
import { holidayWorkDays } from '../lib/capacityUtils'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { CapacityCheckWizard } from '../components/CapacityCheckWizard'
import { Modal } from '../components/Modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { AllocationCategory, CompanyHoliday, Maintenance, Project, TeamMember, TimeOff } from '../lib/types'

// ── helpers ───────────────────────────────────────────────────────────────────

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
function fmtWeekLabel(monday: string): string {
  const mon = new Date(monday + 'T00:00:00')
  const fri = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 4)
  const m = mon.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const f = fri.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  return `${m} – ${f}`
}
function timeOffWorkDays(timeOff: TimeOff[], days: string[]): number {
  return days.filter(d => timeOff.some(t => d >= t.start_date && d <= t.end_date)).length
}
function utilizationColor(pct: number): string {
  if (pct > 100) return 'var(--red)'
  if (pct >= 70) return 'var(--green)'
  if (pct >= 50) return 'var(--amber)'
  return 'var(--c4)'
}
function parsePriority(notes: string | null | undefined): 'none' | 'high' | 'urgent' {
  if (!notes) return 'none'
  if (notes.includes('[URGENT]')) return 'urgent'
  if (notes.includes('[HIGH]')) return 'high'
  return 'none'
}
const PRIORITY_CHIP: Record<'none' | 'high' | 'urgent', { bg: string; color: string }> = {
  none:   { bg: 'var(--navy-light)', color: 'var(--navy)' },
  high:   { bg: '#fff8e1',           color: '#e65100' },
  urgent: { bg: '#fce4ec',           color: '#c62828' },
}

// ── types ─────────────────────────────────────────────────────────────────────

interface ProjectChip {
  label: string
  hours: number
  priority: 'none' | 'high' | 'urgent'
}

interface MemberStats {
  member: TeamMember
  capacity: number
  allocated: number
  utilization: number
  projectChips: ProjectChip[]
  hasMaintenance: boolean
  offDays: number
  leaveHours: number
}

interface AssignForm {
  category: AllocationCategory
  projectId: string
  maintenanceId: string
  customLabel: string
  hours: number
  isBillable: boolean
  priority: 'none' | 'high' | 'urgent'
  deadline: string
  note: string
  leaveDays: string[]
  leaveHoursPerDay: number
}

const DEFAULT_FORM: AssignForm = {
  category: 'project',
  projectId: '',
  maintenanceId: '',
  customLabel: '',
  hours: 8,
  isBillable: true,
  priority: 'none',
  deadline: '',
  note: '',
  leaveDays: [],
  leaveHoursPerDay: 8,
}

const CAT_OPTIONS: { value: AllocationCategory; label: string; defaultBillable: boolean }[] = [
  { value: 'project',     label: 'Project',         defaultBillable: true },
  { value: 'maintenance', label: 'Maintenance',      defaultBillable: true },
  { value: 'internal',    label: 'Internal',         defaultBillable: false },
  { value: 'meeting',     label: 'Meeting',          defaultBillable: false },
  { value: 'admin',       label: 'Admin',            defaultBillable: false },
  { value: 'sales',       label: 'Sales',            defaultBillable: false },
  { value: 'leave',       label: 'Leave / Time Off', defaultBillable: false },
]

// ── AssignModal ───────────────────────────────────────────────────────────────

function AssignModal({
  member,
  days,
  projects,
  maintenances,
  alreadyPlanned,
  weekCapacity,
  onClose,
  onSave,
}: {
  member: TeamMember
  days: string[]
  projects: Project[]
  maintenances: Maintenance[]
  alreadyPlanned: number
  weekCapacity: number
  onClose: () => void
  onSave: (rows: Array<{
    member_id: string; project_id?: string | null; category: AllocationCategory
    date: string; hours: number; label?: string | null; notes?: string | null
    is_billable?: boolean; deadline_date?: string | null
  }>) => Promise<void>
}) {
  const [form, setForm] = useState<AssignForm>({ ...DEFAULT_FORM, leaveHoursPerDay: member.hours_per_day })
  const [saving, setSaving] = useState(false)
  const [projSearch, setProjSearch] = useState('')
  const [maintSearch, setMaintSearch] = useState('')

  const filteredProjects = projects.filter(p =>
    p.status === 'active' &&
    (projSearch === '' || `${p.pn} ${p.name}`.toLowerCase().includes(projSearch.toLowerCase()))
  )

  const filteredMaintenances = maintenances.filter(m =>
    m.status === 'active' &&
    (maintSearch === '' || `${m.name}`.toLowerCase().includes(maintSearch.toLowerCase()))
  )

  const isLeave = form.category === 'leave'
  const usesDayPicker = isLeave || form.category === 'meeting'

  function toggleLeaveDay(d: string) {
    setForm(f => ({
      ...f,
      leaveDays: f.leaveDays.includes(d) ? f.leaveDays.filter(x => x !== d) : [...f.leaveDays, d],
    }))
  }

  async function doSave(keepOpen: boolean) {
    if (usesDayPicker) {
      if (form.leaveDays.length === 0) { toast('error', 'Select at least one day'); return }
      if (form.leaveHoursPerDay <= 0) { toast('error', 'Hours must be > 0'); return }
      const noteStr = form.note.trim() || null
      const rows = form.leaveDays.map(date => ({
        member_id: member.id, project_id: null,
        category: form.category,
        date, hours: form.leaveHoursPerDay,
        label: isLeave ? null : (form.customLabel.trim() || null),
        notes: noteStr, is_billable: false, deadline_date: null,
      }))
      setSaving(true)
      try { await onSave(rows); if (keepOpen) setForm(f => ({ ...f, leaveDays: [] })) }
      finally { setSaving(false) }
      return
    }
    const hoursPerDay = Math.round((form.hours / days.length) * 10) / 10
    if (hoursPerDay <= 0) { toast('error', 'Hours must be > 0'); return }
    const noteStr = [
      form.priority !== 'none' ? `[${form.priority.toUpperCase()}]` : '',
      form.note.trim(),
    ].filter(Boolean).join(' ')
    const projectId = form.category === 'project' ? (form.projectId || null)
      : form.category === 'maintenance' ? (form.maintenanceId || null)
      : null
    const rows = days.map(date => ({
      member_id: member.id, project_id: projectId,
      category: form.category, date, hours: hoursPerDay,
      label: form.customLabel.trim() || null,
      notes: noteStr || null,
      is_billable: form.isBillable,
      deadline_date: form.deadline || null,
    }))
    setSaving(true)
    try {
      await onSave(rows)
      if (keepOpen) setForm(f => ({ ...f, projectId: '', maintenanceId: '', customLabel: '', priority: 'none', note: '', deadline: '' }))
    } finally { setSaving(false) }
  }

  const pickedTotal = form.leaveDays.length * form.leaveHoursPerDay
  const remaining = weekCapacity - alreadyPlanned
  const isOver = remaining < 0

  const isSaveDisabled = saving || (
    usesDayPicker ? form.leaveDays.length === 0 :
    form.category === 'project' ? !form.projectId :
    form.category === 'maintenance' ? !form.maintenanceId :
    false
  )
  const saveLabel = isLeave
    ? `Mark ${form.leaveDays.length}d off`
    : form.category === 'meeting'
      ? `Add to ${form.leaveDays.length} day${form.leaveDays.length !== 1 ? 's' : ''}`
      : `Assign ${form.hours}h`

  return (
    <Modal title={`Assign to ${member.name}`} onClose={onClose} maxWidth={720} footer={
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="outline" size="sm" disabled={isSaveDisabled} onClick={() => doSave(true)}>
          {saving ? 'Saving…' : `${saveLabel} + Add more`}
        </Button>
        <Button size="sm" disabled={isSaveDisabled} onClick={() => doSave(false)}>
          {saving ? 'Saving…' : saveLabel}
        </Button>
      </div>
    }>
      {/* Stats row */}
      <div className="flex gap-5 mb-3">
        {[
          { label: 'Already planned', value: `${alreadyPlanned}h`, color: alreadyPlanned > weekCapacity ? 'var(--red)' : 'var(--c0)' },
          { label: 'Capacity', value: `${weekCapacity}h`, color: 'var(--c0)' },
          { label: 'Remaining', value: `${remaining}h`, color: remaining < 0 ? 'var(--red)' : 'var(--green)' },
        ].map(s => (
          <div key={s.label}>
            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.06em] mb-0.5">{s.label}</div>
            <div className="text-[20px] font-extrabold" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      {isOver && (
        <div className="mt-2.5 px-3 py-1.5 bg-[#fce4ec] rounded text-xs text-[#c62828] font-semibold mb-4">
          ⚠ Over capacity by {Math.abs(remaining)}h — consider reducing hours or moving work to another week.
        </div>
      )}

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {CAT_OPTIONS.map(opt => (
          <button key={opt.value} type="button"
            onClick={() => setForm(f => ({
              ...f, category: opt.value, projectId: '', maintenanceId: '', customLabel: '',
              leaveDays: [], leaveHoursPerDay: member.hours_per_day,
              isBillable: opt.defaultBillable,
            }))}
            className="cursor-pointer"
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: form.category === opt.value ? '2px solid var(--navy)' : '2px solid var(--c5)',
              background: form.category === opt.value ? 'var(--navy)' : '#fff',
              color: form.category === opt.value ? '#fff' : 'var(--c2)',
            }}
          >{opt.label}</button>
        ))}
      </div>

      {/* Priority buttons (not for leave) */}
      {!isLeave && (
        <div className="mb-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Priority</div>
          <div className="flex gap-1.5">
            {(['none', 'high', 'urgent'] as const).map(p => {
              const colors = { none: { bg: '#fff', border: 'var(--c5)', text: 'var(--c2)' }, high: { bg: '#fff8e1', border: '#ffcc02', text: '#e65100' }, urgent: { bg: '#fce4ec', border: '#ef9a9a', text: '#c62828' } }
              const c = colors[p]
              const active = form.priority === p
              return (
                <button key={p} type="button"
                  onClick={() => setForm(f => ({ ...f, priority: p }))}
                  className="cursor-pointer"
                  style={{
                    padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                    border: `2px solid ${active ? c.border : 'var(--c5)'}`,
                    background: active ? c.bg : '#fff',
                    color: active ? c.text : 'var(--c3)',
                    boxShadow: active ? `0 0 0 1px ${c.border}` : 'none',
                  }}
                >{p === 'none' ? 'No priority' : p.charAt(0).toUpperCase() + p.slice(1)}</button>
              )
            })}
          </div>
        </div>
      )}

      {/* Project select */}
      {form.category === 'project' && (
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Project</label>
          <input placeholder="Search projects..." value={projSearch} onChange={e => setProjSearch(e.target.value)} className="mb-2" />
          <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--c6)', borderRadius: 6 }}>
            {filteredProjects.length === 0 && <div className="px-3 py-2.5 text-muted-foreground text-[13px]">No projects found</div>}
            {filteredProjects.map(p => (
              <div key={p.id} onClick={() => setForm(f => ({ ...f, projectId: p.id }))}
                className="cursor-pointer flex justify-between items-center"
                style={{ padding: '8px 12px', borderBottom: '1px solid var(--c7)', background: form.projectId === p.id ? 'var(--navy-light)' : '#fff' }}>
                <div>
                  <span className="text-xs text-[var(--c3)] mr-2">{p.pn}</span>
                  <span className="text-[13px] font-semibold">{p.name}</span>
                </div>
                {p.client && <span className="text-[11px] text-muted-foreground">{p.client.name}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maintenance select */}
      {form.category === 'maintenance' && (
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Maintenance Contract</label>
          <input placeholder="Search maintenances..." value={maintSearch} onChange={e => setMaintSearch(e.target.value)} className="mb-2" />
          <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--c6)', borderRadius: 6 }}>
            {filteredMaintenances.length === 0 && <div className="px-3 py-2.5 text-muted-foreground text-[13px]">No active maintenances found</div>}
            {filteredMaintenances.map(m => (
              <div key={m.id} onClick={() => setForm(f => ({ ...f, maintenanceId: m.id }))}
                className="cursor-pointer flex justify-between items-center"
                style={{ padding: '8px 12px', borderBottom: '1px solid var(--c7)', background: form.maintenanceId === m.id ? 'var(--navy-light)' : '#fff' }}>
                <div>
                  <span className="text-[13px] font-semibold">{m.name}</span>
                  {m.client && <span className="text-[11px] text-muted-foreground ml-2">{m.client.name}</span>}
                </div>
                <span className="text-[11px] text-muted-foreground">{m.hours_included}h/mo</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom label */}
      {(form.category === 'internal' || form.category === 'meeting' || form.category === 'admin' || form.category === 'sales') && (
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Label</label>
          <input placeholder="e.g. Team workshop, Sales call…" value={form.customLabel} onChange={e => setForm(f => ({ ...f, customLabel: e.target.value }))} />
        </div>
      )}

      {/* Day picker (leave + meeting) */}
      {usesDayPicker && (
        <div className="mb-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
            {isLeave ? 'Select days off' : 'Select meeting days'}
          </div>
          <div className="flex gap-2 mb-4">
            {days.map(d => {
              const wd = new Date(d + 'T00:00:00')
              const selected = form.leaveDays.includes(d)
              return (
                <button key={d} type="button" onClick={() => toggleLeaveDay(d)}
                  className="flex-1 cursor-pointer text-center"
                  style={{
                    padding: '10px 4px', borderRadius: 8,
                    border: selected ? '2px solid var(--navy)' : '2px solid var(--c5)',
                    background: selected ? 'var(--navy)' : '#fff',
                    color: selected ? '#fff' : 'var(--c3)',
                    fontSize: 12, fontWeight: 700,
                  }}
                >
                  <div>{wd.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="text-[10px] font-normal mt-0.5 opacity-80">{wd.getDate()}/{wd.getMonth() + 1}</div>
                </button>
              )
            })}
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Hours per day</label>
            <input type="number" min={0.5} max={member.hours_per_day} step={0.5}
              value={form.leaveHoursPerDay}
              onChange={e => setForm(f => ({ ...f, leaveHoursPerDay: Number(e.target.value) }))}
              style={{ maxWidth: 120 }} />
            {form.leaveDays.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">{form.leaveDays.length} day{form.leaveDays.length > 1 ? 's' : ''} · {pickedTotal}h total</div>
            )}
          </div>
        </div>
      )}

      {/* Hours + Deadline + Billable (not for day-picker categories) */}
      {!usesDayPicker && (
        <div className="grid grid-cols-3 gap-3.5 mb-4">
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Total Hours (week)</label>
            <input type="number" min={0.5} step={0.5} value={form.hours}
              onChange={e => setForm(f => ({ ...f, hours: Number(e.target.value) }))} />
            <div className="text-xs text-muted-foreground mt-1">{(form.hours / days.length).toFixed(1)}h / day</div>
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Deadline (optional)</label>
            <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Billable</label>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input type="checkbox" checked={form.isBillable}
                onChange={e => setForm(f => ({ ...f, isBillable: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: 'var(--green)' }} />
              <span className="text-[13px] font-semibold" style={{ color: form.isBillable ? 'var(--green)' : 'var(--c3)' }}>
                {form.isBillable ? 'Billable' : 'Non-billable'}
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Note */}
      {!isLeave && (
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Note for member dashboard</label>
          <textarea rows={2} placeholder="e.g. Focus on checkout flow, coordinate with design team…"
            value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            style={{ resize: 'vertical' }} />
        </div>
      )}
    </Modal>
  )
}

// ── ProjectPoolPanel ──────────────────────────────────────────────────────────

function ProjectPoolPanel({ projects, onClose }: { projects: Project[]; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const active = projects.filter(p =>
    p.status === 'active' &&
    (search === '' || `${p.pn} ${p.name}`.toLowerCase().includes(search.toLowerCase()))
  )
  const TYPE_VARIANT: Record<Project['type'], 'blue' | 'amber' | 'green' | 'gray'> = {
    fixed: 'blue', maintenance: 'amber', variable: 'green', internal: 'gray',
  }
  return (
    <div className="fixed top-0 right-0 bottom-0 w-80 z-[200] bg-white flex flex-col" style={{ boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
      <div className="px-5 pt-5 pb-3 border-b border-[var(--c6)] flex justify-between items-center">
        <div>
          <div className="text-[15px] font-extrabold">Project Pool</div>
          <div className="text-xs text-muted-foreground">{active.length} active projects</div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>&times;</Button>
      </div>
      <div className="px-4 py-3 border-b border-[var(--c6)]">
        <input placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} className="w-full" />
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {active.map(p => (
          <div key={p.id} className="px-4 py-2.5 border-b border-[var(--c7)]">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[11px] text-muted-foreground mb-0.5">{p.pn}</div>
                <div className="text-[13px] font-bold text-[var(--c0)]">{p.name}</div>
                {p.client && <div className="text-[11px] text-muted-foreground mt-0.5">{p.client.name}</div>}
              </div>
              <Badge variant={TYPE_VARIANT[p.type]}>{p.type}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SummaryModal ──────────────────────────────────────────────────────────────

function SummaryModal({
  memberStats,
  weekStart,
  onClose,
}: {
  memberStats: MemberStats[]
  weekStart: string
  onClose: () => void
}) {
  const totalCapacity = memberStats.reduce((s, ms) => s + ms.capacity, 0)
  const totalAllocated = memberStats.reduce((s, ms) => s + ms.allocated, 0)
  const buffer = totalCapacity - totalAllocated
  const overAllocated = memberStats.filter(ms => ms.utilization > 100)
  const fri = new Date(weekStart + 'T00:00:00')
  fri.setDate(fri.getDate() + 4)
  const weekLabel = `${new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${fri.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <Modal title="Weekly Planning Summary" onClose={onClose} maxWidth={700} footer={
      <Button size="sm" onClick={onClose}>Done</Button>
    }>
      <div className="text-xs text-muted-foreground mb-6">Week of {weekLabel} · Complete capacity review</div>

      {/* stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Capacity', value: `${totalCapacity}h`, sub: null, color: 'var(--navy)' },
          { label: 'Allocated', value: `${totalAllocated}h`, sub: `${Math.round((totalAllocated / (totalCapacity || 1)) * 100)}% utilized`, color: 'var(--green)' },
          { label: 'Buffer Remaining', value: `${Math.max(0, buffer)}h`, sub: buffer < totalCapacity * 0.1 ? 'Low buffer' : 'Healthy', color: buffer < 0 ? 'var(--red)' : 'var(--amber)' },
          { label: 'Over-allocated', value: String(overAllocated.length), sub: overAllocated.length > 0 ? 'Team member' + (overAllocated.length > 1 ? 's' : '') : 'None', color: overAllocated.length > 0 ? 'var(--red)' : 'var(--green)' },
        ].map(s => (
          <div key={s.label} className="bg-[var(--c7)] rounded-lg px-4 py-3.5">
            <div className="text-[11px] font-bold text-[var(--c3)] uppercase tracking-[0.05em] mb-1.5">{s.label}</div>
            <div className="text-2xl font-extrabold" style={{ color: s.color }}>{s.value}</div>
            {s.sub && <div className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* capacity by member */}
      <div className="mb-6">
        <div className="text-[13px] font-bold text-[var(--c1)] mb-3">Capacity by Team Member</div>
        <div className="flex flex-col gap-2">
          {memberStats.map(ms => {
            const pct = ms.capacity > 0 ? Math.min(1, ms.allocated / ms.capacity) : 0
            const barColor = ms.utilization > 100 ? 'var(--red)' : ms.utilization >= 70 ? 'var(--green)' : ms.utilization >= 50 ? 'var(--amber)' : 'var(--c5)'
            return (
              <div key={ms.member.id} className="flex items-center gap-3">
                <div className="text-[13px] font-semibold text-[var(--c1)] shrink-0" style={{ width: 140 }}>
                  {ms.member.name}
                  {ms.member.role && <div className="text-[11px] text-muted-foreground font-normal">{ms.member.role}</div>}
                </div>
                <div className="flex-1 h-2 bg-[var(--c6)] rounded overflow-hidden">
                  <div style={{ width: `${pct * 100}%`, height: '100%', background: barColor, borderRadius: 4 }} />
                </div>
                <div className="w-20 text-right text-[13px] font-bold" style={{ color: barColor }}>
                  {ms.allocated}h / {ms.capacity}h
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* over-allocated */}
      {overAllocated.length > 0 && (
        <div className="bg-[#fce4ec] rounded-lg px-4 py-3.5 mb-4">
          <div className="text-[13px] font-bold text-[var(--red)] mb-2">⚠ Over-allocated Members</div>
          {overAllocated.map(ms => (
            <div key={ms.member.id} className="flex justify-between text-[13px] mb-1">
              <span className="font-semibold">{ms.member.name}</span>
              <span className="font-bold text-[var(--red)]">+{ms.allocated - ms.capacity}h over</span>
            </div>
          ))}
        </div>
      )}

      {/* maintenance buffer note */}
      {memberStats.some(ms => ms.hasMaintenance) && (
        <div className="bg-[#fff8e1] rounded-lg px-4 py-3 text-[13px] text-[#e65100]">
          <strong>Maintenance buffer:</strong> Some members have maintenance allocations. Variable maintenance demand may consume additional capacity — keep buffer available.
        </div>
      )}
    </Modal>
  )
}

// ── MemberRow ─────────────────────────────────────────────────────────────────

function MemberRow({ stats, onAssign, onEdit, onShareLink }: { stats: MemberStats; onAssign: () => void; onEdit: () => void; onShareLink: () => void }) {
  const { member, capacity, allocated, utilization, projectChips, hasMaintenance, offDays, leaveHours } = stats
  const pct = capacity > 0 ? Math.min(1, allocated / capacity) : 0
  const barColor = utilization > 100 ? 'var(--red)' : utilization >= 70 ? 'var(--green)' : utilization >= 50 ? 'var(--amber)' : 'var(--c5)'
  const teamColor = member.team?.color ?? '#64748b'

  return (
    <tr className="border-b border-[var(--c7)]">
      {/* Member */}
      <td className="p-4">
        <div className="flex items-center gap-2.5">
          <div className="w-[34px] h-[34px] rounded-full shrink-0 flex items-center justify-center text-[13px] font-extrabold"
            style={{ background: teamColor + '22', color: teamColor }}>
            {member.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-[var(--c0)]">{member.name}</span>
              <button
                onClick={onShareLink}
                title="Copy member dashboard link"
                className="bg-transparent border-none p-0.5 cursor-pointer text-xs text-muted-foreground leading-none"
              >🔗</button>
            </div>
            <div className="text-[11px] font-semibold" style={{ color: teamColor }}>
              {member.team?.name ?? '—'}{member.role ? ` · ${member.role}` : ''}
            </div>
          </div>
        </div>
      </td>

      {/* Availability */}
      <td className="p-3 align-middle" style={{ width: 110 }}>
        <div className="text-[13px] font-semibold text-[var(--c1)]">
          {capacity}h
          {offDays > 0 && <span className="text-[11px] text-[var(--amber)] ml-1.5">−{offDays}d off</span>}
          {leaveHours > 0 && <span className="text-[11px] text-[#c62828] ml-1.5">−{leaveHours}h leave</span>}
        </div>
        <div className="text-[11px] text-muted-foreground">{member.hours_per_day}h/day</div>
      </td>

      {/* Current projects */}
      <td className="p-3 align-middle">
        {projectChips.length === 0 ? (
          <span className="text-xs text-[var(--c5)]">No assignments</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {projectChips.slice(0, 4).map((chip, i) => {
              const c = PRIORITY_CHIP[chip.priority]
              return (
                <span key={i} className="px-2 py-0.5 rounded-[10px] text-[11px] font-semibold" style={{ background: c.bg, color: c.color }}>
                  {chip.label} <span className="opacity-70">({chip.hours}h)</span>
                </span>
              )
            })}
            {projectChips.length > 4 && (
              <span className="text-[11px] text-muted-foreground self-center">+{projectChips.length - 4}</span>
            )}
            {hasMaintenance && (
              <span title="Has maintenance allocations — keep buffer available"
                className="px-2 py-0.5 rounded-[10px] text-[11px] font-bold cursor-default"
                style={{ background: '#fff8e1', color: '#e65100' }}>M buffer</span>
            )}
          </div>
        )}
      </td>

      {/* Allocated hours + bar */}
      <td className="p-3 align-middle" style={{ width: 180 }}>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1 h-1.5 bg-[var(--c6)] rounded overflow-hidden">
            <div style={{ width: `${pct * 100}%`, height: '100%', background: barColor, borderRadius: 3 }} />
          </div>
          <span className="text-xs font-bold text-[var(--c2)] shrink-0">
            {allocated}h / {capacity}h
          </span>
        </div>
      </td>

      {/* Utilization */}
      <td className="p-3 align-middle">
        <span className="text-sm font-extrabold" style={{ color: utilizationColor(utilization) }}>
          {utilization}%
        </span>
        {utilization > 100 && <div className="text-[10px] text-[var(--red)] font-bold">OVER</div>}
        {utilization < 50 && utilization >= 0 && <div className="text-[10px] text-muted-foreground">LOW</div>}
      </td>

      {/* Actions */}
      <td className="p-4 align-middle text-right">
        <div className="flex gap-1.5 justify-end">
          {stats.projectChips.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onEdit} className="text-xs">
              Edit
            </Button>
          )}
          <Button size="sm" onClick={onAssign} className="text-xs">
            + Assign
          </Button>
        </div>
      </td>
    </tr>
  )
}

// ── EditAllocationsModal ──────────────────────────────────────────────────────

const CAT_BADGE: Record<AllocationCategory, { bg: string; color: string; label: string }> = {
  project:     { bg: 'var(--navy-light)',  color: 'var(--navy)',  label: 'Project' },
  maintenance: { bg: '#fff8e1',            color: '#e65100',      label: 'Maintenance' },
  internal:    { bg: '#f3f4f6',            color: '#374151',      label: 'Internal' },
  meeting:     { bg: '#ede9fe',            color: '#7c3aed',      label: 'Meeting' },
  admin:       { bg: '#f3f4f6',            color: '#374151',      label: 'Admin' },
  sales:       { bg: '#d1fae5',            color: '#065f46',      label: 'Sales' },
  leave:       { bg: '#fce4ec',            color: '#c62828',      label: 'Leave' },
}

type EditGroup = {
  key: string
  ids: string[]
  category: AllocationCategory
  label: string
  dates: string[]
  totalHours: number
  notes: string
  isBillable: boolean
  priority: 'none' | 'high' | 'urgent'
  dirty: boolean
}

function buildGroups(allocations: import('../lib/types').ResourceAllocation[]): EditGroup[] {
  const groupMap: Record<string, EditGroup> = {}
  allocations.forEach(a => {
    const p = a.project as { name?: string } | null | undefined
    const lbl = p?.name ?? a.label ?? a.category.charAt(0).toUpperCase() + a.category.slice(1)
    const pid = (a as { project_id?: string | null }).project_id ?? null
    const key = pid ? `p:${pid}` : `l:${a.label ?? a.category}`
    const pri = parsePriority(a.notes)
    const note = (a.notes ?? '').replace(/^\[(HIGH|URGENT)\]\s*/, '').trim()
    if (!groupMap[key]) {
      groupMap[key] = { key, ids: [], category: a.category, label: lbl, dates: [], totalHours: 0, notes: note, isBillable: a.is_billable, priority: pri, dirty: false }
    }
    groupMap[key].ids.push(a.id)
    groupMap[key].dates.push(a.date)
    groupMap[key].totalHours = Math.round((groupMap[key].totalHours + a.hours) * 10) / 10
    if (p?.name) groupMap[key].label = p.name
    if (pri === 'urgent') groupMap[key].priority = 'urgent'
    else if (pri === 'high' && groupMap[key].priority === 'none') groupMap[key].priority = 'high'
  })
  return Object.values(groupMap)
}

function EditAllocationsModal({
  member,
  allocations,
  onClose,
  onUpdate,
  onDelete,
}: {
  member: TeamMember
  allocations: import('../lib/types').ResourceAllocation[]
  onClose: () => void
  onUpdate: (id: string, data: Partial<{ hours: number; notes: string | null; is_billable: boolean }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const [groups, setGroups] = useState<EditGroup[]>(() => buildGroups(allocations))
  const [saving, setSaving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  function setGroup(key: string, patch: Partial<EditGroup>) {
    setGroups(gs => gs.map(g => g.key === key ? { ...g, ...patch, dirty: true } : g))
  }

  async function saveGroup(key: string) {
    const g = groups.find(g => g.key === key)
    if (!g || !g.dirty) return
    const hoursPerDay = Math.round((g.totalHours / g.ids.length) * 10) / 10
    const noteStr = [
      g.priority !== 'none' ? `[${g.priority.toUpperCase()}]` : '',
      g.notes.trim(),
    ].filter(Boolean).join(' ')
    setSaving(key)
    try {
      await Promise.all(g.ids.map(id => onUpdate(id, { hours: hoursPerDay, notes: noteStr || null, is_billable: g.isBillable })))
      setGroups(gs => gs.map(g => g.key === key ? { ...g, dirty: false } : g))
    } finally { setSaving(null) }
  }

  async function deleteGroup(key: string) {
    const g = groups.find(g => g.key === key)
    if (!g) return
    setDeleting(key)
    try {
      await Promise.all(g.ids.map(id => onDelete(id)))
      setGroups(gs => gs.filter(g => g.key !== key))
    } finally { setDeleting(null) }
  }

  return (
    <Modal title={`Edit allocations — ${member.name}`} onClose={onClose} maxWidth={720} footer={
      <Button size="sm" onClick={onClose}>Done</Button>
    }>
      <div className="text-xs text-muted-foreground mb-4">{groups.length} assignment{groups.length !== 1 ? 's' : ''} this week</div>
      {groups.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground text-sm">No allocations this week</div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(g => {
            const cat = CAT_BADGE[g.category]
            const isSav = saving === g.key
            const isDel = deleting === g.key
            const isLeaveG = g.category === 'leave'
            const usesDayPickerG = isLeaveG || g.category === 'meeting'
            const sortedDates = [...g.dates].sort()
            return (
              <div key={g.key} className="rounded-lg px-4 py-4"
                style={{ border: `1px solid ${g.dirty ? 'var(--amber)' : 'var(--c6)'}`, background: g.dirty ? '#fffbf0' : '#fff' }}>
                {/* Header row */}
                <div className="flex items-center gap-2.5 mb-3.5">
                  <span className="px-2.5 py-0.5 rounded-[10px] text-[11px] font-bold" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
                  <span className="text-sm font-bold text-[var(--c0)] flex-1">{g.label}</span>
                  {/* Day chips — deduplicated */}
                  <div className="flex gap-1">
                    {[...new Set(sortedDates)].map(d => (
                      <span key={d} className="px-1.5 py-0.5 rounded text-[11px] font-bold bg-[var(--navy-light)] text-[var(--navy)]">
                        {new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Priority (not for leave) */}
                {!isLeaveG && (
                  <div className="mb-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1.5">Priority</div>
                    <div className="flex gap-1.5">
                      {(['none', 'high', 'urgent'] as const).map(p => {
                        const colors = { none: { bg: '#fff', border: 'var(--c5)', text: 'var(--c2)' }, high: { bg: '#fff8e1', border: '#ffcc02', text: '#e65100' }, urgent: { bg: '#fce4ec', border: '#ef9a9a', text: '#c62828' } }
                        const c = colors[p]; const active = g.priority === p
                        return (
                          <button key={p} type="button" onClick={() => setGroup(g.key, { priority: p })}
                            className="cursor-pointer"
                            style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `2px solid ${active ? c.border : 'var(--c5)'}`, background: active ? c.bg : '#fff', color: active ? c.text : 'var(--c3)', boxShadow: active ? `0 0 0 1px ${c.border}` : 'none' }}
                          >{p === 'none' ? 'No priority' : p.charAt(0).toUpperCase() + p.slice(1)}</button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Hours + Billable */}
                <div style={{ display: 'grid', gridTemplateColumns: usesDayPickerG ? '1fr' : '160px 1fr 1fr', gap: 14, marginBottom: !isLeaveG ? 12 : 0 }}>
                  <div className="mb-4">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{usesDayPickerG ? 'Hours per day' : 'Total hours (week)'}</label>
                    <input type="number" min={0.5} step={0.5} value={g.totalHours}
                      onChange={e => setGroup(g.key, { totalHours: Number(e.target.value) })}
                      style={{ maxWidth: 120 }} />
                    {!usesDayPickerG && g.ids.length > 0 && (() => {
                      const uniqueDays = new Set(g.dates).size
                      return <div className="text-xs text-muted-foreground mt-1">{(g.totalHours / uniqueDays).toFixed(1)}h / day · {uniqueDays} day{uniqueDays > 1 ? 's' : ''}</div>
                    })()}
                    {usesDayPickerG && g.ids.length > 0 && (() => {
                      const uniqueDays = new Set(g.dates).size
                      return <div className="text-xs text-muted-foreground mt-1">{uniqueDays} day{uniqueDays > 1 ? 's' : ''} · {g.totalHours}h total</div>
                    })()}
                  </div>
                  {!usesDayPickerG && (
                    <>
                      <div className="mb-4">
                        <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Billable</label>
                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                          <input type="checkbox" checked={g.isBillable} onChange={e => setGroup(g.key, { isBillable: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--green)' }} />
                          <span className="text-[13px] font-semibold" style={{ color: g.isBillable ? 'var(--green)' : 'var(--c3)' }}>{g.isBillable ? 'Billable' : 'Non-billable'}</span>
                        </label>
                      </div>
                      <div />
                    </>
                  )}
                </div>

                {/* Note (not for leave) */}
                {!isLeaveG && (
                  <div className="mb-4">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Note</label>
                    <textarea rows={2} value={g.notes} onChange={e => setGroup(g.key, { notes: e.target.value })}
                      placeholder="Note for member dashboard…" style={{ resize: 'vertical' }} />
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 mt-3">
                  <Button variant="ghost" size="xs" disabled={isDel} onClick={() => deleteGroup(g.key)}
                    className="text-[var(--red)] text-xs">
                    {isDel ? 'Removing…' : 'Remove'}
                  </Button>
                  {g.dirty && (
                    <Button size="xs" disabled={isSav} onClick={() => saveGroup(g.key)}>
                      {isSav ? 'Saving…' : 'Save changes'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

// ── WeeklySummary ─────────────────────────────────────────────────────────────

function WeeklySummary({
  allocations,
  members,
}: {
  allocations: import('../lib/types').ResourceAllocation[]
  members: TeamMember[]
}) {
  const workAllocs = allocations.filter(a => a.category !== 'leave')

  // Group: team → project key → { label, hours, priority, category }
  const teamMap: Record<string, {
    teamName: string
    teamColor: string
    totalHours: number
    projects: Record<string, { label: string; hours: number; priority: 'none' | 'high' | 'urgent'; category: AllocationCategory }>
  }> = {}

  workAllocs.forEach(a => {
    const member = members.find(m => m.id === a.member_id)
    const teamId = member?.team_id ?? '__none__'
    const teamName = (member?.team as { name?: string } | null | undefined)?.name ?? 'Other'
    const teamColor = (member?.team as { color?: string } | null | undefined)?.color ?? '#64748b'

    const p = a.project as { name?: string } | null | undefined
    const lbl = p?.name ?? a.label ?? null
    if (!lbl) return // skip allocations with no meaningful label
    const pid = (a as { project_id?: string | null }).project_id ?? null
    const projKey = pid ? `p:${pid}` : `l:${a.label ?? a.category}`
    const pri = parsePriority(a.notes)

    if (!teamMap[teamId]) teamMap[teamId] = { teamName, teamColor, totalHours: 0, projects: {} }
    const team = teamMap[teamId]
    team.totalHours = Math.round((team.totalHours + a.hours) * 10) / 10
    if (!team.projects[projKey]) team.projects[projKey] = { label: lbl, hours: 0, priority: 'none', category: a.category }
    const proj = team.projects[projKey]
    if (p?.name) proj.label = p.name
    proj.hours = Math.round((proj.hours + a.hours) * 10) / 10
    if (pri === 'urgent') proj.priority = 'urgent'
    else if (pri === 'high' && proj.priority === 'none') proj.priority = 'high'
  })

  const teams = Object.entries(teamMap)
    .map(([, t]) => ({ ...t, projects: Object.values(t.projects).sort((a, b) => b.hours - a.hours) }))
    .sort((a, b) => b.totalHours - a.totalHours)

  if (teams.length === 0) return null

  return (
    <div className="mt-5">
      <div className="bg-white border border-[var(--c6)] rounded-xl px-5 py-4">
        <div className="text-[13px] font-bold text-[var(--c1)] mb-4">Weekly Allocation by Team</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {teams.map(team => (
            <div key={team.teamName} className="border border-[var(--c6)] rounded-lg overflow-hidden">
              {/* Team header */}
              <div className="px-3.5 py-2 flex items-center justify-between border-b border-[var(--c6)]"
                style={{ background: team.teamColor + '18' }}>
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: team.teamColor, flexShrink: 0 }} />
                  <span className="text-xs font-extrabold uppercase tracking-[0.05em]" style={{ color: team.teamColor }}>{team.teamName}</span>
                </div>
                <span className="text-xs font-bold text-[var(--c2)]">{team.totalHours}h</span>
              </div>
              {/* Projects */}
              <div className="flex flex-col">
                {team.projects.map((proj, i) => {
                  const pc = PRIORITY_CHIP[proj.priority]
                  const catBadge = CAT_BADGE[proj.category]
                  return (
                    <div key={i} className="flex items-center gap-2 px-3.5 py-2"
                      style={{ borderBottom: i < team.projects.length - 1 ? '1px solid var(--c7)' : 'none' }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          {proj.priority !== 'none' && (
                            <span className="px-1 py-px rounded text-[9px] font-extrabold uppercase shrink-0" style={{ background: pc.bg, color: pc.color }}>
                              {proj.priority}
                            </span>
                          )}
                          <span className="px-1 py-px rounded text-[9px] font-bold shrink-0" style={{ background: catBadge.bg, color: catBadge.color }}>
                            {catBadge.label}
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-[var(--c0)] truncate">{proj.label}</div>
                      </div>
                      <span className="text-[13px] font-bold text-[var(--c2)] shrink-0">{proj.hours}h</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── BulkAssignModal ───────────────────────────────────────────────────────────

function BulkAssignModal({
  members, days, projects, maintenances, onClose, onSave,
}: {
  members: TeamMember[]
  days: string[]
  projects: Project[]
  maintenances: Maintenance[]
  onClose: () => void
  onSave: (rows: Array<{
    member_id: string; project_id?: string | null; category: AllocationCategory
    date: string; hours: number; label?: string | null; notes?: string | null
    is_billable?: boolean; deadline_date?: string | null
  }>) => Promise<void>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [memberSearch, setMemberSearch] = useState('')
  const [form, setForm] = useState<AssignForm>({ ...DEFAULT_FORM })
  const [projSearch, setProjSearch] = useState('')
  const [maintSearch, setMaintSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const filteredProjects = projects.filter(p =>
    p.status === 'active' &&
    (projSearch === '' || `${p.pn} ${p.name}`.toLowerCase().includes(projSearch.toLowerCase()))
  )
  const filteredMaintenances = maintenances.filter(m =>
    m.status === 'active' &&
    (maintSearch === '' || m.name.toLowerCase().includes(maintSearch.toLowerCase()))
  )

  const isLeave = form.category === 'leave'
  const usesDayPicker = isLeave || form.category === 'meeting'
  const pickedTotal = form.leaveDays.length * form.leaveHoursPerDay

  function toggleMember(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSelected(s => s.size === members.length ? new Set() : new Set(members.map(m => m.id)))
  }
  function toggleDay(d: string) {
    setForm(f => ({
      ...f,
      leaveDays: f.leaveDays.includes(d) ? f.leaveDays.filter(x => x !== d) : [...f.leaveDays, d],
    }))
  }

  async function handleSave() {
    if (selected.size === 0) { toast('error', 'Select at least one member'); return }
    const rows: Parameters<typeof onSave>[0] = []
    if (usesDayPicker) {
      if (form.leaveDays.length === 0) { toast('error', 'Select at least one day'); return }
      if (form.leaveHoursPerDay <= 0) { toast('error', 'Hours must be > 0'); return }
      const noteStr = form.note.trim() || null
      selected.forEach(memberId => {
        form.leaveDays.forEach(date => {
          rows.push({
            member_id: memberId, project_id: null,
            category: form.category, date, hours: form.leaveHoursPerDay,
            label: isLeave ? null : (form.customLabel.trim() || null),
            notes: noteStr, is_billable: false, deadline_date: null,
          })
        })
      })
    } else {
      const hoursPerDay = Math.round((form.hours / days.length) * 10) / 10
      if (hoursPerDay <= 0) { toast('error', 'Hours must be > 0'); return }
      const noteStr = [
        form.priority !== 'none' ? `[${form.priority.toUpperCase()}]` : '',
        form.note.trim(),
      ].filter(Boolean).join(' ')
      const projectId = form.category === 'project' ? (form.projectId || null)
        : form.category === 'maintenance' ? (form.maintenanceId || null)
        : null
      selected.forEach(memberId => {
        days.forEach(date => {
          rows.push({
            member_id: memberId, project_id: projectId,
            category: form.category, date, hours: hoursPerDay,
            label: form.customLabel.trim() || null,
            notes: noteStr || null, is_billable: form.isBillable, deadline_date: form.deadline || null,
          })
        })
      })
    }
    setSaving(true)
    try { await onSave(rows) } finally { setSaving(false) }
  }

  return (
    <Modal title="Bulk Assign" onClose={onClose} maxWidth={780} footer={
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" disabled={saving || selected.size === 0} onClick={handleSave}>
          {saving ? 'Saving…' : `Assign to ${selected.size} member${selected.size !== 1 ? 's' : ''}`}
        </Button>
      </div>
    }>
      <div className="text-xs text-muted-foreground mb-4">Assign the same allocation to multiple team members at once</div>
      <div className="grid grid-cols-[220px_1fr] gap-5">
        {/* Member list */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Team Members</span>
            <Button variant="ghost" size="xs" onClick={toggleAll} className="text-[11px]">
              {selected.size === members.length ? 'Deselect all' : 'Select all'}
            </Button>
          </div>
          <input placeholder="Search members…" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} className="mb-2 text-xs" />
          <div className="flex flex-col gap-1 max-h-80 overflow-y-auto">
            {members.filter(m => memberSearch === '' || m.name.toLowerCase().includes(memberSearch.toLowerCase())).map(m => (
              <label key={m.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-[7px] cursor-pointer"
                style={{ background: selected.has(m.id) ? 'var(--navy-light)' : 'var(--c7)' }}>
                <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleMember(m.id)} style={{ accentColor: 'var(--navy)' }} />
                <div>
                  <div className="text-[13px] font-semibold text-[var(--c0)]">{m.name}</div>
                  {m.role && <div className="text-[11px] text-muted-foreground">{m.role}</div>}
                </div>
              </label>
            ))}
          </div>
          {selected.size > 0 && (
            <div className="mt-2 text-xs text-[var(--navy)] font-bold">{selected.size} member{selected.size > 1 ? 's' : ''} selected</div>
          )}
        </div>

        {/* Assignment form */}
        <div>
          {/* Category */}
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {CAT_OPTIONS.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setForm(f => ({ ...f, category: opt.value, projectId: '', maintenanceId: '', customLabel: '', leaveDays: [], leaveHoursPerDay: 8, isBillable: opt.defaultBillable }))}
                className="cursor-pointer"
                style={{
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                  border: form.category === opt.value ? '2px solid var(--navy)' : '2px solid var(--c5)',
                  background: form.category === opt.value ? 'var(--navy)' : '#fff',
                  color: form.category === opt.value ? '#fff' : 'var(--c2)',
                }}
              >{opt.label}</button>
            ))}
          </div>

          {/* Priority (not for leave) */}
          {!isLeave && (
            <div className="flex gap-1.5 mb-3.5">
              {(['none', 'high', 'urgent'] as const).map(p => {
                const colors = { none: { bg: '#fff', border: 'var(--c5)', text: 'var(--c2)' }, high: { bg: '#fff8e1', border: '#ffcc02', text: '#e65100' }, urgent: { bg: '#fce4ec', border: '#ef9a9a', text: '#c62828' } }
                const c = colors[p]; const active = form.priority === p
                return (
                  <button key={p} type="button" onClick={() => setForm(f => ({ ...f, priority: p }))}
                    className="cursor-pointer"
                    style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, border: `2px solid ${active ? c.border : 'var(--c5)'}`, background: active ? c.bg : '#fff', color: active ? c.text : 'var(--c3)' }}
                  >{p === 'none' ? 'No priority' : p.charAt(0).toUpperCase() + p.slice(1)}</button>
                )
              })}
            </div>
          )}

          {form.category === 'project' && (
            <div className="mb-3">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Project</label>
              <input placeholder="Search…" value={projSearch} onChange={e => setProjSearch(e.target.value)} className="mb-1.5" />
              <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid var(--c6)', borderRadius: 6 }}>
                {filteredProjects.map(p => (
                  <div key={p.id} onClick={() => setForm(f => ({ ...f, projectId: p.id }))}
                    className="cursor-pointer text-[13px] font-semibold"
                    style={{ padding: '7px 12px', background: form.projectId === p.id ? 'var(--navy-light)' : '#fff', borderBottom: '1px solid var(--c7)' }}>
                    <span className="text-[11px] text-muted-foreground mr-1.5">{p.pn}</span>{p.name}
                  </div>
                ))}
              </div>
            </div>
          )}
          {form.category === 'maintenance' && (
            <div className="mb-3">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Maintenance</label>
              <input placeholder="Search…" value={maintSearch} onChange={e => setMaintSearch(e.target.value)} className="mb-1.5" />
              <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid var(--c6)', borderRadius: 6 }}>
                {filteredMaintenances.map(m => (
                  <div key={m.id} onClick={() => setForm(f => ({ ...f, maintenanceId: m.id }))}
                    className="cursor-pointer text-[13px] font-semibold"
                    style={{ padding: '7px 12px', background: form.maintenanceId === m.id ? 'var(--navy-light)' : '#fff', borderBottom: '1px solid var(--c7)' }}>
                    {m.name}{m.client && <span className="text-[11px] text-muted-foreground ml-1.5">{m.client.name}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {(form.category === 'internal' || form.category === 'meeting' || form.category === 'admin' || form.category === 'sales') && (
            <div className="mb-3">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Label</label>
              <input placeholder="e.g. Weekly standup" value={form.customLabel} onChange={e => setForm(f => ({ ...f, customLabel: e.target.value }))} />
            </div>
          )}

          {/* Day picker (leave + meeting) */}
          {usesDayPicker && (
            <div className="mb-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">
                {isLeave ? 'Select days off' : 'Select meeting days'}
              </div>
              <div className="flex gap-1.5 mb-3">
                {days.map(d => {
                  const wd = new Date(d + 'T00:00:00')
                  const sel = form.leaveDays.includes(d)
                  return (
                    <button key={d} type="button" onClick={() => toggleDay(d)}
                      className="flex-1 cursor-pointer text-center"
                      style={{
                        padding: '8px 4px', borderRadius: 8,
                        border: sel ? '2px solid var(--navy)' : '2px solid var(--c5)',
                        background: sel ? 'var(--navy)' : '#fff',
                        color: sel ? '#fff' : 'var(--c3)',
                        fontSize: 12, fontWeight: 700,
                      }}
                    >
                      <div>{wd.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                      <div className="text-[10px] font-normal mt-0.5 opacity-80">{wd.getDate()}/{wd.getMonth() + 1}</div>
                    </button>
                  )
                })}
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Hours per day</label>
                <input type="number" min={0.5} step={0.5} value={form.leaveHoursPerDay}
                  onChange={e => setForm(f => ({ ...f, leaveHoursPerDay: Number(e.target.value) }))}
                  style={{ maxWidth: 120 }} />
                {form.leaveDays.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">{form.leaveDays.length} day{form.leaveDays.length > 1 ? 's' : ''} · {pickedTotal}h total per member</div>
                )}
              </div>
            </div>
          )}

          {/* Hours + Deadline + Billable (not for day-picker categories) */}
          {!usesDayPicker && (
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Hours (week)</label>
                <input type="number" min={0.5} step={0.5} value={form.hours} onChange={e => setForm(f => ({ ...f, hours: Number(e.target.value) }))} />
                <div className="text-xs text-muted-foreground mt-1">{(form.hours / days.length).toFixed(1)}h/day</div>
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Deadline</label>
                <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Billable</label>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input type="checkbox" checked={form.isBillable} onChange={e => setForm(f => ({ ...f, isBillable: e.target.checked }))} style={{ accentColor: 'var(--green)' }} />
                  <span className="text-[13px] font-semibold" style={{ color: form.isBillable ? 'var(--green)' : 'var(--c3)' }}>{form.isBillable ? 'Billable' : 'Non-billable'}</span>
                </label>
              </div>
            </div>
          )}
          {!isLeave && (
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Note</label>
              <textarea rows={2} placeholder="Note visible on member dashboard…" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ resize: 'vertical' }} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ── ResourcePlanningView ──────────────────────────────────────────────────────

export function ResourcePlanningView() {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [search, setSearch] = useState('')
  const [teamFilter, setTeamFilter] = useState('all')
  const [showPool, setShowPool] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [showCapacityWizard, setShowCapacityWizard] = useState(false)
  const [assignTarget, setAssignTarget] = useState<TeamMember | null>(null)
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null)
  const [allTimeOff, setAllTimeOff] = useState<TimeOff[]>([])
  const [allHolidays, setAllHolidays] = useState<CompanyHoliday[]>([])
  const holidayStore = useHolidayStore()

  const { members, allocations, teams, fetchMembers, fetchTeams, fetchAllocations, addAllocationsBatch, updateAllocation, removeAllocation } = useResourceStore()
  const { projects, fetchAll: fetchProjects } = useProjectsStore()
  const { maintenances, fetchAll: fetchMaintenances } = useMaintenancesStore()

  const combinedMaintenances = useMemo((): Maintenance[] => [
    ...maintenances,
    ...projects
      .filter(p => p.is_maintenance && p.status === 'active')
      .map(p => ({
        id: p.id,
        name: `${p.pn ? p.pn + ' · ' : ''}${p.name}`,
        status: 'active' as const,
        client_id: p.client_id ?? '',
        monthly_retainer: 0,
        help_requests_included: 0,
        hours_included: 0,
        contract_start: p.start_date ?? '',
        created_at: '',
      })),
  ], [maintenances, projects])

  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const weekEnd = days[4]

  useEffect(() => {
    fetchMembers()
    fetchTeams()
    fetchProjects()
    fetchMaintenances()
  }, [fetchMembers, fetchTeams, fetchProjects, fetchMaintenances])


  useEffect(() => {
    fetchAllocations(weekStart, weekEnd)
    supabase
      .from('time_off')
      .select('*')
      .lte('start_date', weekEnd)
      .gte('end_date', weekStart)
      .then(({ data }) => setAllTimeOff((data ?? []) as TimeOff[]))
    holidayStore.fetchByRange(weekStart, weekEnd).then(setAllHolidays)
  }, [weekStart, weekEnd, fetchAllocations]) // eslint-disable-line react-hooks/exhaustive-deps

  const memberStats = useMemo<MemberStats[]>(() => {
    return members.map(m => {
      const memberAllocs = allocations.filter(a => a.member_id === m.id)
      const memberTimeOff = allTimeOff.filter(t => t.member_id === m.id)
      const offDays = timeOffWorkDays(memberTimeOff, days)
      const year = new Date(days[0] + 'T00:00:00').getFullYear()
      const holDays = holidayWorkDays(allHolidays, days, m.team_id, year)
      const availDays = Math.max(0, 5 - offDays - holDays)
      const capacity = m.hours_per_day * availDays
      // leave allocations reduce capacity, not work
      const leaveAllocs = memberAllocs.filter(a => a.category === 'leave')
      const leaveHours = Math.round(leaveAllocs.reduce((s, a) => s + a.hours, 0) * 10) / 10
      const adjustedCapacity = Math.max(0, capacity - leaveHours)
      const workAllocs = memberAllocs.filter(a => a.category !== 'leave')
      const allocated = Math.round(workAllocs.reduce((s, a) => s + a.hours, 0) * 10) / 10
      const utilization = adjustedCapacity > 0 ? Math.round((allocated / adjustedCapacity) * 100) : 0
      // build leave label chip
      const leaveDays = leaveAllocs.map(a => a.date).sort()
      const leaveChips: ProjectChip[] = leaveDays.length > 0 ? (() => {
        const dayNames = leaveDays.map(d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }))
        const label = leaveDays.length === 5
          ? 'Vacation (full week)'
          : `Day off: ${dayNames.join(', ')}`
        return [{ label, hours: leaveHours, priority: 'none' as const }]
      })() : []
      // group work hours by project label
      const chipMap: Record<string, { hours: number; priority: 'none' | 'high' | 'urgent' }> = {}
      workAllocs.forEach(a => {
        const p = a.project as { name?: string } | null | undefined
        const lbl = p?.name ?? a.label ?? 'Internal'
        const pri = parsePriority(a.notes)
        if (!chipMap[lbl]) chipMap[lbl] = { hours: 0, priority: 'none' }
        chipMap[lbl].hours += a.hours
        if (pri === 'urgent') chipMap[lbl].priority = 'urgent'
        else if (pri === 'high' && chipMap[lbl].priority === 'none') chipMap[lbl].priority = 'high'
      })
      const workChips: ProjectChip[] = Object.entries(chipMap).map(([label, { hours, priority }]) => ({ label, hours: Math.round(hours * 10) / 10, priority }))
      const projectChips: ProjectChip[] = [...leaveChips, ...workChips]
      const hasMaintenance = workAllocs.some(a => a.category === 'maintenance')
      return { member: m, capacity: adjustedCapacity, allocated, utilization, projectChips, hasMaintenance, offDays, leaveHours }
    })
  }, [members, allocations, allTimeOff, days])

  const filtered = useMemo(() => memberStats.filter(ms => {
    if (search && !ms.member.name.toLowerCase().includes(search.toLowerCase())) return false
    if (teamFilter !== 'all' && ms.member.team_id !== teamFilter) return false
    return true
  }), [memberStats, search, teamFilter])

  const overCount = memberStats.filter(ms => ms.utilization > 100).length
  const underCount = memberStats.filter(ms => ms.utilization < 50).length

  const totalCapacity = memberStats.reduce((s, ms) => s + ms.capacity, 0)
  const totalAllocated = memberStats.reduce((s, ms) => s + ms.allocated, 0)
  const totalAvailable = Math.max(0, totalCapacity - totalAllocated)
  const totalUtilization = totalCapacity > 0 ? Math.round((totalAllocated / totalCapacity) * 100) : 0
  const BILLABLE_CATS: AllocationCategory[] = ['project', 'maintenance', 'sales']
  const billableHours = Math.round(allocations.filter(a => a.is_billable && BILLABLE_CATS.includes(a.category)).reduce((s, a) => s + a.hours, 0) * 10) / 10
  const billablePct = Math.min(100, totalAllocated > 0 ? Math.round((billableHours / totalAllocated) * 100) : 0)

  return (
    <div className="page">
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Resource Planning</h1>
          <div className="flex items-center gap-2 mt-1">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>← Prev</Button>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekStart(getMonday(new Date()))}>Today</Button>
            <span className="text-sm font-bold text-[var(--c1)]">{fmtWeekLabel(weekStart)}</span>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}>Next →</Button>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="ghost" size="sm" onClick={() => setShowCapacityWizard(true)}>Capacity Check</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowBulk(true)}>Bulk Assign</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPool(!showPool)}
            style={{ background: showPool ? 'var(--navy-light)' : undefined }}
          >
            Project Pool {showPool ? '→' : '←'}
          </Button>
          <Button size="sm" onClick={() => setShowSummary(true)}>
            Save Week
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total Capacity', value: `${totalCapacity}h`, color: 'var(--navy)' },
            { label: 'Allocated', value: `${totalAllocated}h`, color: totalAllocated > totalCapacity ? 'var(--red)' : 'var(--green)' },
            { label: 'Available', value: `${totalAvailable}h`, color: totalAvailable < totalCapacity * 0.1 ? 'var(--amber)' : 'var(--c1)' },
            { label: 'Utilization', value: `${totalUtilization}%`, color: totalUtilization > 100 ? 'var(--red)' : totalUtilization >= 70 ? 'var(--green)' : 'var(--amber)' },
            { label: 'Billable', value: `${billableHours}h`, color: 'var(--green)' },
            { label: 'Billable %', value: `${billablePct}%`, color: billablePct >= 70 ? 'var(--green)' : billablePct >= 50 ? 'var(--amber)' : 'var(--c4)' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-[var(--c6)] rounded-lg px-3.5 py-3">
              <div className="text-[10px] font-bold text-[var(--c4)] uppercase tracking-[0.06em] mb-1">{s.label}</div>
              <div className="text-xl font-extrabold" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters + summary chips */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-2">
            <input
              placeholder="Search by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 200 }}
            />
            <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ width: 160 }}>
              <option value="all">All teams</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 items-center">
            {underCount > 0 && (
              <span className="px-2.5 py-1 rounded-[20px] text-xs font-bold bg-[#fff8e1] text-[#e65100] border border-[#ffcc02]">
                {underCount} under 50%
              </span>
            )}
            {overCount > 0 && (
              <span className="px-2.5 py-1 rounded-[20px] text-xs font-bold bg-[#fce4ec] text-[var(--red)] border border-[#ef9a9a]">
                {overCount} over-allocated
              </span>
            )}
            <span className="text-[13px] text-[var(--c3)]">{filtered.length} people</span>
          </div>
        </div>

        {/* Table */}
        <Card className="overflow-hidden p-0">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="bg-[var(--c7)] border-b-2 border-[var(--c6)]">
                {([
                  { label: 'Team Member' },
                  { label: 'Availability', width: 110 },
                  { label: 'Current Projects' },
                  { label: 'Allocated Hours', width: 190 },
                  { label: 'Utilization', width: 90 },
                  { label: 'Actions', width: 160 },
                ] as { label: string; width?: number }[]).map(({ label, width }) => (
                  <th key={label} style={{
                    padding: '10px 16px', textAlign: label === 'Actions' ? 'right' : 'left',
                    fontSize: 11, fontWeight: 700, color: 'var(--c3)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    ...(width ? { width } : {}),
                  }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 px-5 text-center text-muted-foreground text-sm">
                    No team members found
                  </td>
                </tr>
              ) : (
                filtered.map(ms => (
                  <MemberRow
                    key={ms.member.id}
                    stats={ms}
                    onAssign={() => setAssignTarget(ms.member)}
                    onEdit={() => setEditTarget(ms.member)}
                    onShareLink={() => {
                      const url = `${window.location.origin}/member-dashboard/${ms.member.share_token}`
                      navigator.clipboard.writeText(url).then(() => toast('success', 'Dashboard link copied'))
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </Card>

        {/* Weekly summary */}
        <WeeklySummary allocations={allocations} members={members} />
      </div>

      {/* Project Pool panel */}
      {showPool && <ProjectPoolPanel projects={projects} onClose={() => setShowPool(false)} />}

      {/* Bulk Assign Modal */}
      {showBulk && (
        <BulkAssignModal
          members={members}
          days={days}
          projects={projects}
          maintenances={combinedMaintenances}
          onClose={() => setShowBulk(false)}
          onSave={async rows => {
            await addAllocationsBatch(rows)
            toast('success', `Bulk assigned to ${new Set(rows.map(r => r.member_id)).size} members`)
            setShowBulk(false)
          }}
        />
      )}

      {/* Assign Modal */}
      {assignTarget && (() => {
        const ms = memberStats.find(s => s.member.id === assignTarget.id)
        return (
          <AssignModal
            member={assignTarget}
            days={days}
            projects={projects}
            maintenances={combinedMaintenances}
            alreadyPlanned={ms?.allocated ?? 0}
            weekCapacity={ms?.capacity ?? assignTarget.hours_per_day * 5}
            onClose={() => setAssignTarget(null)}
            onSave={async rows => {
              await addAllocationsBatch(rows)
              toast('success', `Assigned to ${assignTarget.name}`)
              setAssignTarget(null)
            }}
          />
        )
      })()}

      {/* Edit Allocations Modal */}
      {editTarget && (
        <EditAllocationsModal
          member={editTarget}
          allocations={allocations.filter(a => a.member_id === editTarget.id)}
          onClose={() => setEditTarget(null)}
          onUpdate={async (id, data) => {
            await updateAllocation(id, data)
            await fetchAllocations(weekStart, weekEnd)
          }}
          onDelete={async id => {
            await removeAllocation(id)
            await fetchAllocations(weekStart, weekEnd)
            toast('success', 'Allocation removed')
          }}
        />
      )}

      {/* Capacity Check Wizard */}
      {showCapacityWizard && <CapacityCheckWizard onClose={() => setShowCapacityWizard(false)} />}

      {/* Summary Modal */}
      {showSummary && (
        <SummaryModal
          memberStats={memberStats}
          weekStart={weekStart}
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  )
}
