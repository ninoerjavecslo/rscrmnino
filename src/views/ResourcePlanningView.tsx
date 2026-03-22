import { useState, useEffect, useMemo } from 'react'
import { useResourceStore } from '../stores/resource'
import { useProjectsStore } from '../stores/projects'
import { useMaintenancesStore } from '../stores/maintenances'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { AllocationCategory, Maintenance, Project, TeamMember, TimeOff } from '../lib/types'

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div style={{ flex: 1 }}>
            <h3 style={{ marginBottom: 10 }}>Assign to {member.name}</h3>
            <div style={{ display: 'flex', gap: 20 }}>
              {[
                { label: 'Already planned', value: `${alreadyPlanned}h`, color: alreadyPlanned > weekCapacity ? 'var(--red)' : 'var(--c0)' },
                { label: 'Capacity', value: `${weekCapacity}h`, color: 'var(--c0)' },
                { label: 'Remaining', value: `${remaining}h`, color: remaining < 0 ? 'var(--red)' : 'var(--green)' },
              ].map(s => (
                <div key={s.label}>
                  <div style={{ fontSize: 10, color: 'var(--c4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
            {isOver && (
              <div style={{ marginTop: 10, padding: '7px 12px', background: '#fce4ec', borderRadius: 6, fontSize: 12, color: '#c62828', fontWeight: 600 }}>
                ⚠ Over capacity by {Math.abs(remaining)}h — consider reducing hours or moving work to another week.
              </div>
            )}
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">

          {/* Category tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {CAT_OPTIONS.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => setForm(f => ({
                  ...f, category: opt.value, projectId: '', maintenanceId: '', customLabel: '',
                  leaveDays: [], leaveHoursPerDay: member.hours_per_day,
                  isBillable: opt.defaultBillable,
                }))}
                style={{
                  padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: form.category === opt.value ? '2px solid var(--navy)' : '2px solid var(--c5)',
                  background: form.category === opt.value ? 'var(--navy)' : '#fff',
                  color: form.category === opt.value ? '#fff' : 'var(--c2)',
                }}
              >{opt.label}</button>
            ))}
          </div>

          {/* Priority buttons (not for leave) */}
          {!isLeave && (
            <div style={{ marginBottom: 16 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>Priority</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['none', 'high', 'urgent'] as const).map(p => {
                  const colors = { none: { bg: '#fff', border: 'var(--c5)', text: 'var(--c2)' }, high: { bg: '#fff8e1', border: '#ffcc02', text: '#e65100' }, urgent: { bg: '#fce4ec', border: '#ef9a9a', text: '#c62828' } }
                  const c = colors[p]
                  const active = form.priority === p
                  return (
                    <button key={p} type="button"
                      onClick={() => setForm(f => ({ ...f, priority: p }))}
                      style={{
                        padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
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
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Project</label>
              <input placeholder="Search projects..." value={projSearch} onChange={e => setProjSearch(e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--c6)', borderRadius: 6 }}>
                {filteredProjects.length === 0 && <div style={{ padding: '10px 12px', color: 'var(--c4)', fontSize: 13 }}>No projects found</div>}
                {filteredProjects.map(p => (
                  <div key={p.id} onClick={() => setForm(f => ({ ...f, projectId: p.id }))}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--c7)', background: form.projectId === p.id ? 'var(--navy-light)' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 12, color: 'var(--c3)', marginRight: 8 }}>{p.pn}</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                    </div>
                    {p.client && <span style={{ fontSize: 11, color: 'var(--c4)' }}>{p.client.name}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Maintenance select */}
          {form.category === 'maintenance' && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Maintenance Contract</label>
              <input placeholder="Search maintenances..." value={maintSearch} onChange={e => setMaintSearch(e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--c6)', borderRadius: 6 }}>
                {filteredMaintenances.length === 0 && <div style={{ padding: '10px 12px', color: 'var(--c4)', fontSize: 13 }}>No active maintenances found</div>}
                {filteredMaintenances.map(m => (
                  <div key={m.id} onClick={() => setForm(f => ({ ...f, maintenanceId: m.id }))}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--c7)', background: form.maintenanceId === m.id ? 'var(--navy-light)' : '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                      {m.client && <span style={{ fontSize: 11, color: 'var(--c4)', marginLeft: 8 }}>{m.client.name}</span>}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--c4)' }}>{m.hours_included}h/mo</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom label */}
          {(form.category === 'internal' || form.category === 'meeting' || form.category === 'admin' || form.category === 'sales') && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Label</label>
              <input placeholder="e.g. Team workshop, Sales call…" value={form.customLabel} onChange={e => setForm(f => ({ ...f, customLabel: e.target.value }))} />
            </div>
          )}

          {/* Day picker (leave + meeting) */}
          {usesDayPicker && (
            <div style={{ marginBottom: 20 }}>
              <div className="form-label" style={{ marginBottom: 8 }}>
                {isLeave ? 'Select days off' : 'Select meeting days'}
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {days.map(d => {
                  const wd = new Date(d + 'T00:00:00')
                  const selected = form.leaveDays.includes(d)
                  return (
                    <button key={d} type="button" onClick={() => toggleLeaveDay(d)}
                      style={{
                        flex: 1, padding: '10px 4px', borderRadius: 8, cursor: 'pointer',
                        border: selected ? '2px solid var(--navy)' : '2px solid var(--c5)',
                        background: selected ? 'var(--navy)' : '#fff',
                        color: selected ? '#fff' : 'var(--c3)',
                        fontSize: 12, fontWeight: 700, textAlign: 'center',
                      }}
                    >
                      <div>{wd.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                      <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>{wd.getDate()}/{wd.getMonth() + 1}</div>
                    </button>
                  )
                })}
              </div>
              <div className="form-group">
                <label className="form-label">Hours per day</label>
                <input type="number" min={0.5} max={member.hours_per_day} step={0.5}
                  value={form.leaveHoursPerDay}
                  onChange={e => setForm(f => ({ ...f, leaveHoursPerDay: Number(e.target.value) }))}
                  style={{ maxWidth: 120 }} />
                {form.leaveDays.length > 0 && (
                  <div className="form-hint">{form.leaveDays.length} day{form.leaveDays.length > 1 ? 's' : ''} · {pickedTotal}h total</div>
                )}
              </div>
            </div>
          )}

          {/* Hours + Deadline + Billable (not for day-picker categories) */}
          {!usesDayPicker && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
              <div className="form-group">
                <label className="form-label">Total Hours (week)</label>
                <input type="number" min={0.5} step={0.5} value={form.hours}
                  onChange={e => setForm(f => ({ ...f, hours: Number(e.target.value) }))} />
                <div className="form-hint">{(form.hours / days.length).toFixed(1)}h / day</div>
              </div>
              <div className="form-group">
                <label className="form-label">Deadline (optional)</label>
                <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Billable</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.isBillable}
                    onChange={e => setForm(f => ({ ...f, isBillable: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: 'var(--green)' }} />
                  <span style={{ fontSize: 13, color: form.isBillable ? 'var(--green)' : 'var(--c3)', fontWeight: 600 }}>
                    {form.isBillable ? 'Billable' : 'Non-billable'}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Note */}
          {!isLeave && (
            <div className="form-group">
              <label className="form-label">Note for member dashboard</label>
              <textarea rows={2} placeholder="e.g. Focus on checkout flow, coordinate with design team…"
                value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                style={{ resize: 'vertical' }} />
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-secondary btn-sm" disabled={isSaveDisabled} onClick={() => doSave(true)}>
            {saving ? 'Saving…' : `${saveLabel} + Add more`}
          </button>
          <button className="btn btn-primary btn-sm" disabled={isSaveDisabled} onClick={() => doSave(false)}>
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ProjectPoolPanel ──────────────────────────────────────────────────────────

function ProjectPoolPanel({ projects, onClose }: { projects: Project[]; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const active = projects.filter(p =>
    p.status === 'active' &&
    (search === '' || `${p.pn} ${p.name}`.toLowerCase().includes(search.toLowerCase()))
  )
  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 320, zIndex: 200,
      background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--c6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Project Pool</div>
          <div style={{ fontSize: 12, color: 'var(--c4)' }}>{active.length} active projects</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>&times;</button>
      </div>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--c6)' }}>
        <input placeholder="Search projects..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%' }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {active.map(p => (
          <div key={p.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--c7)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--c4)', marginBottom: 2 }}>{p.pn}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)' }}>{p.name}</div>
                {p.client && <div style={{ fontSize: 11, color: 'var(--c4)', marginTop: 2 }}>{p.client.name}</div>}
              </div>
              <span className={`badge ${p.type === 'fixed' ? 'badge-blue' : p.type === 'maintenance' ? 'badge-amber' : 'badge-green'}`}>
                {p.type}
              </span>
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <div>
            <h3 style={{ marginBottom: 2 }}>Weekly Planning Summary</h3>
            <div style={{ fontSize: 12, color: 'var(--c4)' }}>Week of {weekLabel} · Complete capacity review</div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">

          {/* stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total Capacity', value: `${totalCapacity}h`, sub: null, color: 'var(--navy)' },
              { label: 'Allocated', value: `${totalAllocated}h`, sub: `${Math.round((totalAllocated / (totalCapacity || 1)) * 100)}% utilized`, color: 'var(--green)' },
              { label: 'Buffer Remaining', value: `${Math.max(0, buffer)}h`, sub: buffer < totalCapacity * 0.1 ? 'Low buffer' : 'Healthy', color: buffer < 0 ? 'var(--red)' : 'var(--amber)' },
              { label: 'Over-allocated', value: String(overAllocated.length), sub: overAllocated.length > 0 ? 'Team member' + (overAllocated.length > 1 ? 's' : '') : 'None', color: overAllocated.length > 0 ? 'var(--red)' : 'var(--green)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--c7)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                {s.sub && <div style={{ fontSize: 11, color: 'var(--c4)', marginTop: 3 }}>{s.sub}</div>}
              </div>
            ))}
          </div>

          {/* capacity by member */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c1)', marginBottom: 12 }}>Capacity by Team Member</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {memberStats.map(ms => {
                const pct = ms.capacity > 0 ? Math.min(1, ms.allocated / ms.capacity) : 0
                const barColor = ms.utilization > 100 ? 'var(--red)' : ms.utilization >= 70 ? 'var(--green)' : ms.utilization >= 50 ? 'var(--amber)' : 'var(--c5)'
                return (
                  <div key={ms.member.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 140, fontSize: 13, fontWeight: 600, color: 'var(--c1)', flexShrink: 0 }}>
                      {ms.member.name}
                      {ms.member.role && <div style={{ fontSize: 11, color: 'var(--c4)', fontWeight: 400 }}>{ms.member.role}</div>}
                    </div>
                    <div style={{ flex: 1, height: 8, background: 'var(--c6)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct * 100}%`, height: '100%', background: barColor, borderRadius: 4 }} />
                    </div>
                    <div style={{ width: 80, textAlign: 'right', fontSize: 13, fontWeight: 700, color: barColor }}>
                      {ms.allocated}h / {ms.capacity}h
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* over-allocated */}
          {overAllocated.length > 0 && (
            <div style={{ background: '#fce4ec', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', marginBottom: 8 }}>⚠ Over-allocated Members</div>
              {overAllocated.map(ms => (
                <div key={ms.member.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{ms.member.name}</span>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>+{ms.allocated - ms.capacity}h over</span>
                </div>
              ))}
            </div>
          )}

          {/* maintenance buffer note */}
          {memberStats.some(ms => ms.hasMaintenance) && (
            <div style={{ background: '#fff8e1', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#e65100' }}>
              <strong>Maintenance buffer:</strong> Some members have maintenance allocations. Variable maintenance demand may consume additional capacity — keep buffer available.
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

// ── MemberRow ─────────────────────────────────────────────────────────────────

function MemberRow({ stats, onAssign, onEdit, onShareLink }: { stats: MemberStats; onAssign: () => void; onEdit: () => void; onShareLink: () => void }) {
  const { member, capacity, allocated, utilization, projectChips, hasMaintenance, offDays, leaveHours } = stats
  const pct = capacity > 0 ? Math.min(1, allocated / capacity) : 0
  const barColor = utilization > 100 ? 'var(--red)' : utilization >= 70 ? 'var(--green)' : utilization >= 50 ? 'var(--amber)' : 'var(--c5)'
  const teamColor = member.team?.color ?? '#64748b'

  return (
    <tr style={{ borderBottom: '1px solid var(--c7)' }}>
      {/* Member */}
      <td style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: teamColor + '22', color: teamColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800,
          }}>
            {member.name.charAt(0)}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)' }}>{member.name}</span>
              <button
                onClick={onShareLink}
                title="Copy member dashboard link"
                style={{ background: 'none', border: 'none', padding: '1px 3px', cursor: 'pointer', fontSize: 12, color: 'var(--c4)', lineHeight: 1 }}
              >🔗</button>
            </div>
            <div style={{ fontSize: 11, color: teamColor, fontWeight: 600 }}>
              {member.team?.name ?? '—'}{member.role ? ` · ${member.role}` : ''}
            </div>
          </div>
        </div>
      </td>

      {/* Availability */}
      <td style={{ padding: '14px 12px', verticalAlign: 'middle' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c1)' }}>
          {capacity}h
          {offDays > 0 && <span style={{ fontSize: 11, color: 'var(--amber)', marginLeft: 6 }}>−{offDays}d off</span>}
          {leaveHours > 0 && <span style={{ fontSize: 11, color: '#c62828', marginLeft: 6 }}>−{leaveHours}h leave</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--c4)' }}>{member.hours_per_day}h/day</div>
      </td>

      {/* Current projects */}
      <td style={{ padding: '14px 12px', verticalAlign: 'middle', maxWidth: 280 }}>
        {projectChips.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--c5)' }}>No assignments</span>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {projectChips.slice(0, 4).map((chip, i) => {
              const c = PRIORITY_CHIP[chip.priority]
              return (
                <span key={i} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>
                  {chip.label} <span style={{ opacity: 0.7 }}>({chip.hours}h)</span>
                </span>
              )
            })}
            {projectChips.length > 4 && (
              <span style={{ fontSize: 11, color: 'var(--c4)', alignSelf: 'center' }}>+{projectChips.length - 4}</span>
            )}
            {hasMaintenance && (
              <span title="Has maintenance allocations — keep buffer available" style={{
                padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                background: '#fff8e1', color: '#e65100', cursor: 'default',
              }}>M buffer</span>
            )}
          </div>
        )}
      </td>

      {/* Allocated hours + bar */}
      <td style={{ padding: '14px 12px', verticalAlign: 'middle', width: 180 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1, height: 6, background: 'var(--c6)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${pct * 100}%`, height: '100%', background: barColor, borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c2)', flexShrink: 0 }}>
            {allocated}h / {capacity}h
          </span>
        </div>
      </td>

      {/* Utilization */}
      <td style={{ padding: '14px 12px', verticalAlign: 'middle' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: utilizationColor(utilization) }}>
          {utilization}%
        </span>
        {utilization > 100 && <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>OVER</div>}
        {utilization < 50 && utilization >= 0 && <div style={{ fontSize: 10, color: 'var(--c4)' }}>LOW</div>}
      </td>

      {/* Actions */}
      <td style={{ padding: '14px 16px', verticalAlign: 'middle', textAlign: 'right' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {stats.projectChips.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={onEdit} style={{ fontSize: 12 }}>
              Edit
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={onAssign} style={{ fontSize: 12 }}>
            + Assign
          </button>
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div>
            <h3>Edit allocations — {member.name}</h3>
            <div style={{ fontSize: 12, color: 'var(--c4)', marginTop: 2 }}>{groups.length} assignment{groups.length !== 1 ? 's' : ''} this week</div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {groups.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--c4)', fontSize: 14 }}>No allocations this week</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {groups.map(g => {
                const cat = CAT_BADGE[g.category]
                const isSav = saving === g.key
                const isDel = deleting === g.key
                const isLeaveG = g.category === 'leave'
                const usesDayPickerG = isLeaveG || g.category === 'meeting'
                const sortedDates = [...g.dates].sort()
                return (
                  <div key={g.key} style={{ border: `1px solid ${g.dirty ? 'var(--amber)' : 'var(--c6)'}`, borderRadius: 10, padding: '16px 18px', background: g.dirty ? '#fffbf0' : '#fff' }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: cat.bg, color: cat.color }}>{cat.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c0)', flex: 1 }}>{g.label}</span>
                      {/* Day chips */}
                      <div style={{ display: 'flex', gap: 4 }}>
                        {sortedDates.map(d => (
                          <span key={d} style={{ padding: '2px 7px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'var(--navy-light)', color: 'var(--navy)' }}>
                            {new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Priority (not for leave) */}
                    {!isLeaveG && (
                      <div style={{ marginBottom: 12 }}>
                        <div className="form-label" style={{ marginBottom: 6 }}>Priority</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['none', 'high', 'urgent'] as const).map(p => {
                            const colors = { none: { bg: '#fff', border: 'var(--c5)', text: 'var(--c2)' }, high: { bg: '#fff8e1', border: '#ffcc02', text: '#e65100' }, urgent: { bg: '#fce4ec', border: '#ef9a9a', text: '#c62828' } }
                            const c = colors[p]; const active = g.priority === p
                            return (
                              <button key={p} type="button" onClick={() => setGroup(g.key, { priority: p })}
                                style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `2px solid ${active ? c.border : 'var(--c5)'}`, background: active ? c.bg : '#fff', color: active ? c.text : 'var(--c3)', boxShadow: active ? `0 0 0 1px ${c.border}` : 'none' }}
                              >{p === 'none' ? 'No priority' : p.charAt(0).toUpperCase() + p.slice(1)}</button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Hours + Billable */}
                    <div style={{ display: 'grid', gridTemplateColumns: usesDayPickerG ? '1fr' : '160px 1fr 1fr', gap: 14, marginBottom: !isLeaveG ? 12 : 0 }}>
                      <div className="form-group">
                        <label className="form-label">{usesDayPickerG ? 'Hours per day' : 'Total hours (week)'}</label>
                        <input type="number" min={0.5} step={0.5} value={g.totalHours}
                          onChange={e => setGroup(g.key, { totalHours: Number(e.target.value) })}
                          style={{ maxWidth: 120 }} />
                        {!usesDayPickerG && g.ids.length > 0 && (
                          <div className="form-hint">{(g.totalHours / g.ids.length).toFixed(1)}h / day · {g.ids.length} day{g.ids.length > 1 ? 's' : ''}</div>
                        )}
                        {usesDayPickerG && g.ids.length > 0 && (
                          <div className="form-hint">{g.ids.length} day{g.ids.length > 1 ? 's' : ''} · {g.totalHours}h total</div>
                        )}
                      </div>
                      {!usesDayPickerG && (
                        <>
                          <div className="form-group">
                            <label className="form-label">Billable</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
                              <input type="checkbox" checked={g.isBillable} onChange={e => setGroup(g.key, { isBillable: e.target.checked })} style={{ width: 16, height: 16, accentColor: 'var(--green)' }} />
                              <span style={{ fontSize: 13, color: g.isBillable ? 'var(--green)' : 'var(--c3)', fontWeight: 600 }}>{g.isBillable ? 'Billable' : 'Non-billable'}</span>
                            </label>
                          </div>
                          <div />
                        </>
                      )}
                    </div>

                    {/* Note (not for leave) */}
                    {!isLeaveG && (
                      <div className="form-group">
                        <label className="form-label">Note</label>
                        <textarea rows={2} value={g.notes} onChange={e => setGroup(g.key, { notes: e.target.value })}
                          placeholder="Note for member dashboard…" style={{ resize: 'vertical' }} />
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                      <button className="btn btn-ghost btn-xs" disabled={isDel} onClick={() => deleteGroup(g.key)}
                        style={{ color: 'var(--red)', fontSize: 12 }}>
                        {isDel ? 'Removing…' : 'Remove'}
                      </button>
                      {g.dirty && (
                        <button className="btn btn-primary btn-xs" disabled={isSav} onClick={() => saveGroup(g.key)}>
                          {isSav ? 'Saving…' : 'Save changes'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
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
    <div style={{ marginTop: 20 }}>
      <div style={{ background: '#fff', border: '1px solid var(--c6)', borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c1)', marginBottom: 16 }}>Weekly Allocation by Team</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {teams.map(team => (
            <div key={team.teamName} style={{ border: '1px solid var(--c6)', borderRadius: 8, overflow: 'hidden' }}>
              {/* Team header */}
              <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: team.teamColor + '18', borderBottom: '1px solid var(--c6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: team.teamColor, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: team.teamColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{team.teamName}</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c2)' }}>{team.totalHours}h</span>
              </div>
              {/* Projects */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {team.projects.map((proj, i) => {
                  const pc = PRIORITY_CHIP[proj.priority]
                  const catBadge = CAT_BADGE[proj.category]
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: i < team.projects.length - 1 ? '1px solid var(--c7)' : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          {proj.priority !== 'none' && (
                            <span style={{ padding: '1px 5px', borderRadius: 6, fontSize: 9, fontWeight: 800, background: pc.bg, color: pc.color, textTransform: 'uppercase', flexShrink: 0 }}>
                              {proj.priority}
                            </span>
                          )}
                          <span style={{ padding: '1px 5px', borderRadius: 6, fontSize: 9, fontWeight: 700, background: catBadge.bg, color: catBadge.color, flexShrink: 0 }}>
                            {catBadge.label}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.label}</div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c2)', flexShrink: 0 }}>{proj.hours}h</span>
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 780 }}>
        <div className="modal-header">
          <div>
            <h3>Bulk Assign</h3>
            <div style={{ fontSize: 12, color: 'var(--c4)', marginTop: 2 }}>Assign the same allocation to multiple team members at once</div>
          </div>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
          {/* Member list */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="form-label" style={{ margin: 0 }}>Team Members</span>
              <button className="btn btn-ghost btn-xs" onClick={toggleAll} style={{ fontSize: 11 }}>
                {selected.size === members.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <input placeholder="Search members…" value={memberSearch} onChange={e => setMemberSearch(e.target.value)} style={{ marginBottom: 8, fontSize: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
              {members.filter(m => memberSearch === '' || m.name.toLowerCase().includes(memberSearch.toLowerCase())).map(m => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, cursor: 'pointer', background: selected.has(m.id) ? 'var(--navy-light)' : 'var(--c7)' }}>
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleMember(m.id)} style={{ accentColor: 'var(--navy)' }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c0)' }}>{m.name}</div>
                    {m.role && <div style={{ fontSize: 11, color: 'var(--c4)' }}>{m.role}</div>}
                  </div>
                </label>
              ))}
            </div>
            {selected.size > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--navy)', fontWeight: 700 }}>{selected.size} member{selected.size > 1 ? 's' : ''} selected</div>
            )}
          </div>

          {/* Assignment form */}
          <div>
            {/* Category */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
              {CAT_OPTIONS.map(opt => (
                <button key={opt.value} type="button"
                  onClick={() => setForm(f => ({ ...f, category: opt.value, projectId: '', maintenanceId: '', customLabel: '', leaveDays: [], leaveHoursPerDay: 8, isBillable: opt.defaultBillable }))}
                  style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: form.category === opt.value ? '2px solid var(--navy)' : '2px solid var(--c5)',
                    background: form.category === opt.value ? 'var(--navy)' : '#fff',
                    color: form.category === opt.value ? '#fff' : 'var(--c2)',
                  }}
                >{opt.label}</button>
              ))}
            </div>

            {/* Priority (not for leave) */}
            {!isLeave && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {(['none', 'high', 'urgent'] as const).map(p => {
                  const colors = { none: { bg: '#fff', border: 'var(--c5)', text: 'var(--c2)' }, high: { bg: '#fff8e1', border: '#ffcc02', text: '#e65100' }, urgent: { bg: '#fce4ec', border: '#ef9a9a', text: '#c62828' } }
                  const c = colors[p]; const active = form.priority === p
                  return (
                    <button key={p} type="button" onClick={() => setForm(f => ({ ...f, priority: p }))}
                      style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `2px solid ${active ? c.border : 'var(--c5)'}`, background: active ? c.bg : '#fff', color: active ? c.text : 'var(--c3)' }}
                    >{p === 'none' ? 'No priority' : p.charAt(0).toUpperCase() + p.slice(1)}</button>
                  )
                })}
              </div>
            )}

            {form.category === 'project' && (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Project</label>
                <input placeholder="Search…" value={projSearch} onChange={e => setProjSearch(e.target.value)} style={{ marginBottom: 6 }} />
                <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid var(--c6)', borderRadius: 6 }}>
                  {filteredProjects.map(p => (
                    <div key={p.id} onClick={() => setForm(f => ({ ...f, projectId: p.id }))}
                      style={{ padding: '7px 12px', cursor: 'pointer', background: form.projectId === p.id ? 'var(--navy-light)' : '#fff', borderBottom: '1px solid var(--c7)', fontSize: 13, fontWeight: 600 }}>
                      <span style={{ fontSize: 11, color: 'var(--c4)', marginRight: 6 }}>{p.pn}</span>{p.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {form.category === 'maintenance' && (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Maintenance</label>
                <input placeholder="Search…" value={maintSearch} onChange={e => setMaintSearch(e.target.value)} style={{ marginBottom: 6 }} />
                <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid var(--c6)', borderRadius: 6 }}>
                  {filteredMaintenances.map(m => (
                    <div key={m.id} onClick={() => setForm(f => ({ ...f, maintenanceId: m.id }))}
                      style={{ padding: '7px 12px', cursor: 'pointer', background: form.maintenanceId === m.id ? 'var(--navy-light)' : '#fff', borderBottom: '1px solid var(--c7)', fontSize: 13, fontWeight: 600 }}>
                      {m.name}{m.client && <span style={{ fontSize: 11, color: 'var(--c4)', marginLeft: 6 }}>{m.client.name}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(form.category === 'internal' || form.category === 'meeting' || form.category === 'admin' || form.category === 'sales') && (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Label</label>
                <input placeholder="e.g. Weekly standup" value={form.customLabel} onChange={e => setForm(f => ({ ...f, customLabel: e.target.value }))} />
              </div>
            )}

            {/* Day picker (leave + meeting) */}
            {usesDayPicker && (
              <div style={{ marginBottom: 16 }}>
                <div className="form-label" style={{ marginBottom: 8 }}>
                  {isLeave ? 'Select days off' : 'Select meeting days'}
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {days.map(d => {
                    const wd = new Date(d + 'T00:00:00')
                    const sel = form.leaveDays.includes(d)
                    return (
                      <button key={d} type="button" onClick={() => toggleDay(d)}
                        style={{
                          flex: 1, padding: '8px 4px', borderRadius: 8, cursor: 'pointer',
                          border: sel ? '2px solid var(--navy)' : '2px solid var(--c5)',
                          background: sel ? 'var(--navy)' : '#fff',
                          color: sel ? '#fff' : 'var(--c3)',
                          fontSize: 12, fontWeight: 700, textAlign: 'center',
                        }}
                      >
                        <div>{wd.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                        <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, opacity: 0.8 }}>{wd.getDate()}/{wd.getMonth() + 1}</div>
                      </button>
                    )
                  })}
                </div>
                <div className="form-group">
                  <label className="form-label">Hours per day</label>
                  <input type="number" min={0.5} step={0.5} value={form.leaveHoursPerDay}
                    onChange={e => setForm(f => ({ ...f, leaveHoursPerDay: Number(e.target.value) }))}
                    style={{ maxWidth: 120 }} />
                  {form.leaveDays.length > 0 && (
                    <div className="form-hint">{form.leaveDays.length} day{form.leaveDays.length > 1 ? 's' : ''} · {pickedTotal}h total per member</div>
                  )}
                </div>
              </div>
            )}

            {/* Hours + Deadline + Billable (not for day-picker categories) */}
            {!usesDayPicker && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Hours (week)</label>
                  <input type="number" min={0.5} step={0.5} value={form.hours} onChange={e => setForm(f => ({ ...f, hours: Number(e.target.value) }))} />
                  <div className="form-hint">{(form.hours / days.length).toFixed(1)}h/day</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Deadline</label>
                  <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Billable</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.isBillable} onChange={e => setForm(f => ({ ...f, isBillable: e.target.checked }))} style={{ accentColor: 'var(--green)' }} />
                    <span style={{ fontSize: 13, color: form.isBillable ? 'var(--green)' : 'var(--c3)', fontWeight: 600 }}>{form.isBillable ? 'Billable' : 'Non-billable'}</span>
                  </label>
                </div>
              </div>
            )}
            {!isLeave && (
              <div className="form-group">
                <label className="form-label">Note</label>
                <textarea rows={2} placeholder="Note visible on member dashboard…" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={saving || selected.size === 0} onClick={handleSave}>
            {saving ? 'Saving…' : `Assign to ${selected.size} member${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
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
  const [assignTarget, setAssignTarget] = useState<TeamMember | null>(null)
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null)
  const [allTimeOff, setAllTimeOff] = useState<TimeOff[]>([])

  const { members, allocations, teams, fetchMembers, fetchTeams, fetchAllocations, addAllocationsBatch, updateAllocation, removeAllocation } = useResourceStore()
  const { projects, fetchAll: fetchProjects } = useProjectsStore()
  const { maintenances, fetchAll: fetchMaintenances } = useMaintenancesStore()

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
  }, [weekStart, weekEnd, fetchAllocations])

  const memberStats = useMemo<MemberStats[]>(() => {
    return members.map(m => {
      const memberAllocs = allocations.filter(a => a.member_id === m.id)
      const memberTimeOff = allTimeOff.filter(t => t.member_id === m.id)
      const offDays = timeOffWorkDays(memberTimeOff, days)
      const availDays = 5 - offDays
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
      <div className="page-header">
        <div>
          <h1>Resource Planning</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>← Prev</button>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setWeekStart(getMonday(new Date()))}>Today</button>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--c1)' }}>{fmtWeekLabel(weekStart)}</span>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => setWeekStart(shiftWeek(weekStart, 1))}>Next →</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBulk(true)}>Bulk Assign</button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowPool(!showPool)}
            style={{ background: showPool ? 'var(--navy-light)' : undefined }}
          >
            Project Pool {showPool ? '→' : '←'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowSummary(true)}>
            Save Week
          </button>
        </div>
      </div>

      <div className="page-content">

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
            <div key={s.label} style={{ background: '#fff', border: '1px solid var(--c6)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters + summary chips */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {underCount > 0 && (
              <span style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: '#fff8e1', color: '#e65100', border: '1px solid #ffcc02',
              }}>{underCount} under 50%</span>
            )}
            {overCount > 0 && (
              <span style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: '#fce4ec', color: 'var(--red)', border: '1px solid #ef9a9a',
              }}>{overCount} over-allocated</span>
            )}
            <span style={{ fontSize: 13, color: 'var(--c3)' }}>{filtered.length} people</span>
          </div>
        </div>

        {/* Table */}
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--c7)', borderBottom: '2px solid var(--c6)' }}>
                {['Team Member', 'Availability', 'Current Projects', 'Allocated Hours', 'Utilization', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: h === 'Actions' ? 'right' : 'left',
                    fontSize: 11, fontWeight: 700, color: 'var(--c3)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 14 }}>
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
        </div>

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
          maintenances={maintenances}
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
            maintenances={maintenances}
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
