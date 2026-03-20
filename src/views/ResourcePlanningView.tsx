import React, { useEffect, useState } from 'react'
import { useResourceStore } from '../stores/resource'
import { useProjectsStore } from '../stores/projects'
import type { ResourcePlan } from '../lib/types'
import { toast } from '../lib/toast'

// ── Period helpers ────────────────────────────────────────────────────────────

function getMondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

type ViewMode = 'week' | 'month' | 'year'

function generatePeriods(offset: number, view: ViewMode): string[] {
  const today = new Date()
  if (view === 'week') {
    const start = getMondayOf(today)
    start.setDate(start.getDate() + offset * 7)
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i * 7)
      return toDateStr(d)
    })
  }
  if (view === 'year') {
    const year = today.getFullYear() + offset
    return Array.from({ length: 12 }, (_, i) => toDateStr(new Date(year, i, 1)))
  }
  return Array.from({ length: 6 }, (_, i) => {
    return toDateStr(new Date(today.getFullYear(), today.getMonth() + offset + i, 1))
  })
}

function periodsFrom(start: string, count: number, type: ViewMode): string[] {
  const d = new Date(start + 'T00:00:00')
  return Array.from({ length: count }, (_, i) => {
    if (type === 'week') {
      const dd = new Date(d); dd.setDate(d.getDate() + i * 7); return toDateStr(dd)
    }
    return toDateStr(new Date(d.getFullYear(), d.getMonth() + i, 1))
  })
}

const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function fmtNode(period: string, type: 'week' | 'month'): React.ReactNode {
  const d = new Date(period + 'T00:00:00')
  if (type === 'week') {
    const e = new Date(d); e.setDate(d.getDate() + 6)
    const s = e.getMonth() !== d.getMonth()
      ? `${MO[d.getMonth()]} ${d.getDate()} – ${MO[e.getMonth()]} ${e.getDate()}`
      : `${MO[d.getMonth()]} ${d.getDate()}–${e.getDate()}`
    return <>{s}</>
  }
  return <><b>{MO[d.getMonth()]}</b> <span style={{ opacity: 0.5, fontWeight: 400 }}>{d.getFullYear()}</span></>
}

function fmtStr(period: string, type: 'week' | 'month'): string {
  const d = new Date(period + 'T00:00:00')
  if (type === 'week') {
    const e = new Date(d); e.setDate(d.getDate() + 6)
    return e.getMonth() !== d.getMonth()
      ? `${MO[d.getMonth()]} ${d.getDate()} – ${MO[e.getMonth()]} ${e.getDate()}`
      : `${MO[d.getMonth()]} ${d.getDate()}–${e.getDate()}`
  }
  return `${MO[d.getMonth()]} ${d.getFullYear()}`
}

function isCurrent(period: string, type: 'week' | 'month'): boolean {
  const t = new Date()
  const d = new Date(period + 'T00:00:00')
  if (type === 'week') return toDateStr(d) === toDateStr(getMondayOf(t))
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth()
}

// ── Month helpers ─────────────────────────────────────────────────────────────

function weekInMonth(weekStr: string, monthStr: string): boolean {
  const w = new Date(weekStr + 'T00:00:00')
  const m = new Date(monthStr + 'T00:00:00')
  return w.getFullYear() === m.getFullYear() && w.getMonth() === m.getMonth()
}

// Returns true if planDate falls anywhere within the 7-day window starting on weekMonday
function planInWeek(weekMonday: string, planDate: string): boolean {
  const mon = new Date(weekMonday + 'T00:00:00')
  const plan = new Date(planDate + 'T00:00:00')
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return plan >= mon && plan <= sun
}

function mondaysInMonth(monthStr: string): string[] {
  const base = new Date(monthStr + 'T00:00:00')
  const year = base.getFullYear()
  const month = base.getMonth()
  const result: string[] = []
  let d = getMondayOf(new Date(year, month, 1))
  if (d.getMonth() !== month) d.setDate(d.getDate() + 7)
  while (d.getFullYear() === year && d.getMonth() === month) {
    result.push(toDateStr(d))
    d = new Date(d)
    d.setDate(d.getDate() + 7)
  }
  return result
}

function monthLastDay(monthStr: string): string {
  const d = new Date(monthStr + 'T00:00:00')
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

// ── Distribution helper ───────────────────────────────────────────────────────

function distribute(total: number, count: number): number[] {
  if (count <= 0 || total <= 0) return Array(count).fill(0)
  const per = Math.floor((total / count) * 2) / 2          // round down to 0.5
  const rem = Math.round((total - per * count) * 10) / 10  // remainder on first
  return Array.from({ length: count }, (_, i) => i === 0 ? per + rem : per)
}

// ── Modal types ───────────────────────────────────────────────────────────────

type RowType = 'ux' | 'dev'

interface AssignModal {
  projectId: string; projectLabel: string
  rowType: RowType; period: string
  existingId: string | null; memberId: string; hours: string
}

interface BulkModal {
  projectId: string; projectLabel: string; rowType: RowType
  memberId: string
  startPeriodIdx: number
  numPeriods: number
  totalHours: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ResourcePlanningView() {
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [offset, setOffset] = useState(0)
  const periodType: 'week' | 'month' = viewMode === 'week' ? 'week' : 'month'
  const [assignModal, setAssignModal] = useState<AssignModal | null>(null)
  const [bulkModal, setBulkModal] = useState<BulkModal | null>(null)
  const [teamModal, setTeamModal] = useState(false)
  const [addProjectModal, setAddProjectModal] = useState(false)
  const [newMemberName, setNewMemberName] = useState('')
  const [projectSearch, setProjectSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const rs = useResourceStore()
  const ps = useProjectsStore()
  const periods = generatePeriods(offset, viewMode)

  useEffect(() => {
    rs.fetchMembers(); rs.fetchPlannedProjects()
    if (ps.projects.length === 0) ps.fetchAll()
  }, [])

  useEffect(() => { rs.fetchPlans(periods, periodType) }, [offset, viewMode])

  const plannedProjects = ps.projects.filter(p => rs.plannedProjectIds.includes(p.id))
  const availableToAdd = ps.projects
    .filter(p => p.status === 'active' && !rs.plannedProjectIds.includes(p.id))
    .filter(p => !projectSearch ||
      p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
      (p.client?.name ?? '').toLowerCase().includes(projectSearch.toLowerCase()) ||
      p.pn.toLowerCase().includes(projectSearch.toLowerCase())
    )

  const isMonthView = viewMode !== 'week'
  const periodMatch = (p: ResourcePlan, per: string) => isMonthView ? weekInMonth(p.period, per) : planInWeek(per, p.period)
  const uxPlans  = (pid: string, per: string) => rs.plans.filter(p => p.project_id === pid && periodMatch(p, per) && p.member_id !== null)
  const devPlans = (pid: string, per: string) => rs.plans.filter(p => p.project_id === pid && periodMatch(p, per) && p.member_id === null)

  // Aggregate UX plans by member for month/year view
  const uxGroups = (pid: string, per: string) => {
    const map = new Map<string, number>()
    for (const p of uxPlans(pid, per)) map.set(p.member_id!, (map.get(p.member_id!) ?? 0) + p.hours)
    return Array.from(map.entries()).map(([memberId, hours]) => ({ memberId, hours }))
  }
  const devGroupHours = (pid: string, per: string) => devPlans(pid, per).reduce((s, p) => s + p.hours, 0)

  function openAssign(projectId: string, projectLabel: string, rowType: RowType, period: string, existing?: ResourcePlan | { memberId: string; hours: number }) {
    if (existing && 'memberId' in existing) {
      // Month view: pre-filled from aggregated group
      setAssignModal({ projectId, projectLabel, rowType, period, existingId: null, memberId: existing.memberId, hours: String(existing.hours) })
    } else {
      setAssignModal({ projectId, projectLabel, rowType, period, existingId: existing?.id ?? null, memberId: (existing as ResourcePlan | undefined)?.member_id ?? '', hours: existing ? String((existing as ResourcePlan).hours) : '' })
    }
  }

  function openBulk(projectId: string, projectLabel: string, rowType: RowType) {
    setBulkModal({ projectId, projectLabel, rowType, memberId: rowType === 'ux' ? (rs.members[0]?.id ?? '') : '', startPeriodIdx: 0, numPeriods: 4, totalHours: '' })
  }

  async function handleSave() {
    if (!assignModal || !assignModal.hours) return
    if (assignModal.rowType === 'ux' && !assignModal.memberId) return
    const memberId = assignModal.rowType === 'ux' ? assignModal.memberId : null
    const total = parseFloat(assignModal.hours)
    setSaving(true)
    try {
      if (!isMonthView) {
        await rs.upsertPlan(assignModal.existingId, {
          member_id: memberId, project_id: assignModal.projectId,
          period: assignModal.period, period_type: 'week', hours: total, notes: null,
        })
      } else {
        // Month/year view: delete existing weekly records for that month, then save distributed
        const weeks = mondaysInMonth(assignModal.period)
        await rs.deleteMonthPlans(assignModal.projectId, memberId, assignModal.period, monthLastDay(assignModal.period))
        const dist = distribute(total, weeks.length)
        for (let i = 0; i < weeks.length; i++) {
          await rs.upsertPlan(null, { member_id: memberId, project_id: assignModal.projectId, period: weeks[i], period_type: 'week', hours: dist[i], notes: null })
        }
      }
      toast('success', 'Saved'); setAssignModal(null)
    } catch { toast('error', 'Failed to save') }
    finally { setSaving(false) }
  }

  async function handleDeletePlan() {
    if (!assignModal) return
    const memberId = assignModal.rowType === 'ux' ? assignModal.memberId : null
    setSaving(true)
    try {
      if (!isMonthView && assignModal.existingId) {
        await rs.deletePlan(assignModal.existingId)
      } else {
        await rs.deleteMonthPlans(assignModal.projectId, memberId, assignModal.period, monthLastDay(assignModal.period))
      }
      toast('success', 'Removed'); setAssignModal(null)
    } catch { toast('error', 'Failed to delete') }
    finally { setSaving(false) }
  }

  async function handleBulkSave() {
    if (!bulkModal || !bulkModal.totalHours) return
    if (bulkModal.rowType === 'ux' && !bulkModal.memberId) return
    const total = parseFloat(bulkModal.totalHours)
    if (isNaN(total) || total <= 0) return
    setSaving(true)
    try {
      const startPeriod = periods[bulkModal.startPeriodIdx]
      const memberId = bulkModal.rowType === 'ux' ? bulkModal.memberId : null
      if (!isMonthView) {
        const ps2 = periodsFrom(startPeriod, bulkModal.numPeriods, 'week')
        const dist = distribute(total, bulkModal.numPeriods)
        for (let i = 0; i < ps2.length; i++) {
          await rs.upsertPlan(null, { member_id: memberId, project_id: bulkModal.projectId, period: ps2[i], period_type: 'week', hours: dist[i], notes: null })
        }
        toast('success', `Assigned ${total}h across ${bulkModal.numPeriods} weeks`)
      } else {
        // Month/year: distribute across all weeks within the selected months
        const monthPeriods = periodsFrom(startPeriod, bulkModal.numPeriods, viewMode)
        const allWeeks = monthPeriods.flatMap(m => mondaysInMonth(m))
        const dist = distribute(total, allWeeks.length)
        for (let i = 0; i < allWeeks.length; i++) {
          await rs.upsertPlan(null, { member_id: memberId, project_id: bulkModal.projectId, period: allWeeks[i], period_type: 'week', hours: dist[i], notes: null })
        }
        toast('success', `Assigned ${total}h across ${bulkModal.numPeriods} months`)
      }
      setBulkModal(null)
    } catch { toast('error', 'Failed to save') }
    finally { setSaving(false) }
  }

  // Distribution preview for bulk modal
  const bulkDist = bulkModal && bulkModal.totalHours && parseFloat(bulkModal.totalHours) > 0
    ? distribute(parseFloat(bulkModal.totalHours), bulkModal.numPeriods)
    : null
  const bulkStartPeriods = bulkModal
    ? periodsFrom(periods[bulkModal.startPeriodIdx] ?? periods[0], bulkModal.numPeriods, periodType)
    : []

  const COL_W = viewMode === 'year' ? 110 : 165
  const NAME_W = 230
  const TOT_W = 72

  // Totals helpers
  const uxTotal  = (pid: string) => periods.reduce((s, p) => s + uxPlans(pid, p).reduce((a, x) => a + x.hours, 0), 0)
  const devTotal = (pid: string) => periods.reduce((s, p) => s + devPlans(pid, p).reduce((a, x) => a + x.hours, 0), 0)
  const periodUxTotal  = (per: string) => plannedProjects.reduce((s, p) => s + uxPlans(p.id, per).reduce((a, x) => a + x.hours, 0), 0)
  const periodDevTotal = (per: string) => plannedProjects.reduce((s, p) => s + devPlans(p.id, per).reduce((a, x) => a + x.hours, 0), 0)
  const grandTotal = periods.reduce((s, p) => s + periodUxTotal(p) + periodDevTotal(p), 0)

  return (
    <div className="page-content">
      {/* Hover CSS */}
      <style>{`
        .rp-cell .rp-add { opacity: 0; transition: opacity 0.12s; font-size: 11px; color: var(--c4); padding: 2px 0; }
        .rp-cell:hover .rp-add { opacity: 1; }
        .rp-cell:hover { background: #f5f7ff !important; }
        .rp-chip:hover { opacity: 0.85; }
        .rp-bulk-btn { opacity: 0; transition: opacity 0.12s; }
        .rp-row-label:hover .rp-bulk-btn { opacity: 1; }
      `}</style>

      {/* ── Header ── */}
      <div className="page-header">
        <h1 className="page-title">Resource Planning</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary btn-sm" onClick={() => { setProjectSearch(''); setAddProjectModal(true) }}>+ Add Project</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setTeamModal(true)}>Manage Team</button>
          <div style={{ width: 1, height: 20, background: 'var(--c5)' }} />
          <div style={{ display: 'flex', border: '1px solid var(--c5)', borderRadius: 6, overflow: 'hidden' }}>
            <button className={'btn btn-sm' + (viewMode === 'week' ? ' btn-primary' : ' btn-ghost')} style={{ borderRadius: 0, border: 'none', minWidth: 52 }} onClick={() => { setViewMode('week'); setOffset(0) }}>Week</button>
            <button className={'btn btn-sm' + (viewMode === 'month' ? ' btn-primary' : ' btn-ghost')} style={{ borderRadius: 0, border: 'none', borderLeft: '1px solid var(--c5)', minWidth: 58 }} onClick={() => { setViewMode('month'); setOffset(0) }}>Month</button>
            <button className={'btn btn-sm' + (viewMode === 'year' ? ' btn-primary' : ' btn-ghost')} style={{ borderRadius: 0, border: 'none', borderLeft: '1px solid var(--c5)', minWidth: 52 }} onClick={() => { setViewMode('year'); setOffset(0) }}>Year</button>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className="btn btn-ghost btn-sm" style={{ minWidth: 32 }} onClick={() => setOffset(o => o - 1)}>‹</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setOffset(0)}>
              {viewMode === 'year' ? new Date().getFullYear() + offset : 'Today'}
            </button>
            <button className="btn btn-ghost btn-sm" style={{ minWidth: 32 }} onClick={() => setOffset(o => o + 1)}>›</button>
          </div>
        </div>
      </div>

      {/* ── Empty state ── */}
      {plannedProjects.length === 0 && (
        <div className="card" style={{ padding: '64px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.2 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--c2)', marginBottom: 6 }}>No projects in plan</div>
          <div style={{ fontSize: 13, color: 'var(--c4)', marginBottom: 20 }}>Add active projects to start planning resources</div>
          <button className="btn btn-primary btn-sm" onClick={() => { setProjectSearch(''); setAddProjectModal(true) }}>+ Add Project</button>
        </div>
      )}

      {/* ── Table ── */}
      {plannedProjects.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: NAME_W }} />
              {periods.map(p => <col key={p} style={{ width: COL_W }} />)}
              <col style={{ width: TOT_W }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ padding: '12px 16px', borderBottom: '2px solid var(--c5)', borderRight: '2px solid var(--c4)', fontSize: 10, fontWeight: 700, color: 'var(--c3)', letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'left', position: 'sticky', left: 0, background: 'var(--c7)', zIndex: 2 }}>
                  Project
                  {viewMode === 'year' && <span style={{ marginLeft: 8, fontWeight: 800, color: 'var(--navy)', fontSize: 11, letterSpacing: 0 }}>{new Date().getFullYear() + offset}</span>}
                </th>
                {periods.map(p => {
                  const cur = isCurrent(p, periodType)
                  const d = new Date(p + 'T00:00:00')
                  return (
                    <th key={p} style={{ padding: viewMode === 'year' ? '8px 4px' : '10px 10px 8px', borderBottom: '2px solid var(--c5)', borderRight: '1px solid var(--c6)', fontSize: viewMode === 'year' ? 11 : 12, fontWeight: 600, color: cur ? 'var(--navy)' : 'var(--c2)', textAlign: 'center', background: cur ? '#eef2ff' : 'var(--c7)', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {viewMode === 'year' ? <b>{MO[d.getMonth()]}</b> : fmtNode(p, periodType)}
                      {cur && <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--navy)', letterSpacing: '0.1em', opacity: 0.6, marginTop: 3 }}>NOW</div>}
                    </th>
                  )
                })}
                <th style={{ padding: '10px 8px', borderBottom: '2px solid var(--c5)', fontSize: 10, fontWeight: 700, color: 'var(--c3)', textAlign: 'center', background: 'var(--c7)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {plannedProjects.map((project, pi) => {
                const rowBg = pi % 2 === 0 ? '#f0f3fa' : '#edf0f8'
                return (
                  <React.Fragment key={project.id}>

                    {/* ── Project header ── */}
                    <tr>
                      <td style={{ padding: '11px 14px', background: rowBg, borderTop: pi === 0 ? 'none' : '2px solid var(--c4)', borderBottom: '1px solid var(--c5)', borderRight: '2px solid var(--c4)', position: 'sticky', left: 0, zIndex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)', lineHeight: 1.3 }}>
                              {project.client?.name
                                ? <><span style={{ color: 'var(--c3)', fontWeight: 500 }}>{project.client.name}</span><span style={{ color: 'var(--c4)', margin: '0 4px' }}>—</span>{project.name}</>
                                : project.name}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--c4)', marginTop: 2, fontFamily: 'monospace', letterSpacing: '0.03em' }}>{project.pn}</div>
                          </div>
                          <button onClick={() => rs.removeProjectFromPlan(project.id)} title="Remove from plan" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c4)', fontSize: 18, lineHeight: 1, padding: '2px 4px', borderRadius: 4 }}>×</button>
                        </div>
                      </td>
                      {periods.map(p => {
                        const cur = isCurrent(p, periodType)
                        const bg2 = cur ? (pi % 2 === 0 ? '#e6eaf8' : '#e3e7f5') : rowBg
                        return <td key={p} style={{ background: bg2, borderTop: pi === 0 ? 'none' : '2px solid var(--c4)', borderBottom: '1px solid var(--c5)', borderRight: '1px solid var(--c5)' }} />
                      })}
                      <td style={{ background: rowBg, borderTop: pi === 0 ? 'none' : '2px solid var(--c4)', borderBottom: '1px solid var(--c5)' }} />
                    </tr>

                    {/* ── UX/UI row ── */}
                    <tr>
                      <td className="rp-row-label" style={{ padding: '10px 14px', borderBottom: '1px solid var(--c6)', borderRight: '2px solid var(--c4)', position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', background: '#eef2ff', borderRadius: 5, fontSize: 11, fontWeight: 700, color: 'var(--navy)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                            <span style={{ fontSize: 8 }}>●</span> UX / UI
                          </div>
                          <button
                            className="rp-bulk-btn btn btn-ghost btn-xs"
                            onClick={() => openBulk(project.id, project.name, 'ux')}
                            title="Bulk assign"
                            style={{ fontSize: 11, color: 'var(--navy)', fontWeight: 600, padding: '3px 8px' }}
                          >
                            ⚡ Bulk
                          </button>
                        </div>
                      </td>
                      {periods.map(period => {
                        const plans = uxPlans(project.id, period)
                        const cur = isCurrent(period, periodType)
                        return (
                          <td key={period} className="rp-cell" onClick={() => openAssign(project.id, project.name, 'ux', period)}
                            style={{ padding: '8px', borderBottom: '1px solid var(--c6)', borderRight: '1px solid var(--c6)', verticalAlign: 'top', cursor: 'pointer', background: cur ? '#f3f5ff' : 'white', minHeight: 60 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {isMonthView
                                ? uxGroups(project.id, period).map(({ memberId, hours }) => {
                                    const member = rs.members.find(m => m.id === memberId)
                                    return (
                                      <div key={memberId} className="rp-chip" onClick={e => { e.stopPropagation(); openAssign(project.id, project.name, 'ux', period, { memberId, hours }) }}
                                        style={{ background: 'var(--navy)', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, boxShadow: '0 1px 3px rgba(15,23,80,0.18)' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member?.name ?? '—'}</span>
                                        <span style={{ flexShrink: 0, background: 'rgba(255,255,255,0.18)', borderRadius: 3, padding: '1px 5px', fontSize: 11 }}>{hours}h</span>
                                      </div>
                                    )
                                  })
                                : uxPlans(project.id, period).map(plan => {
                                    const member = rs.members.find(m => m.id === plan.member_id)
                                    return (
                                      <div key={plan.id} className="rp-chip" onClick={e => { e.stopPropagation(); openAssign(project.id, project.name, 'ux', period, plan) }}
                                        style={{ background: 'var(--navy)', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, boxShadow: '0 1px 3px rgba(15,23,80,0.18)' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member?.name ?? '—'}</span>
                                        <span style={{ flexShrink: 0, background: 'rgba(255,255,255,0.18)', borderRadius: 3, padding: '1px 5px', fontSize: 11 }}>{plan.hours}h</span>
                                      </div>
                                    )
                                  })
                              }
                              <div className="rp-add">+ assign</div>
                            </div>
                          </td>
                        )
                      })}
                      <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--c6)', background: '#f0f4ff', textAlign: 'center', verticalAlign: 'middle' }}>
                        {uxTotal(project.id) > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>{uxTotal(project.id)}h</span>}
                      </td>
                    </tr>

                    {/* ── Dev row ── */}
                    <tr>
                      <td className="rp-row-label" style={{ padding: '10px 14px', borderBottom: '2px solid var(--c5)', borderRight: '2px solid var(--c4)', position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', background: '#f1f5f9', borderRadius: 5, fontSize: 11, fontWeight: 700, color: 'var(--c2)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                            <span style={{ fontSize: 8 }}>●</span> Dev
                          </div>
                          <button
                            className="rp-bulk-btn btn btn-ghost btn-xs"
                            onClick={() => openBulk(project.id, project.name, 'dev')}
                            title="Bulk assign"
                            style={{ fontSize: 11, color: 'var(--c2)', fontWeight: 600, padding: '3px 8px' }}
                          >
                            ⚡ Bulk
                          </button>
                        </div>
                      </td>
                      {periods.map(period => {
                        const plans = devPlans(project.id, period)
                        const cur = isCurrent(period, periodType)
                        return (
                          <td key={period} className="rp-cell" onClick={() => openAssign(project.id, project.name, 'dev', period)}
                            style={{ padding: '8px', borderBottom: '2px solid var(--c5)', borderRight: '1px solid var(--c6)', verticalAlign: 'top', cursor: 'pointer', background: cur ? '#f3f5ff' : 'white', minHeight: 60 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {isMonthView
                                ? (() => { const dh = devGroupHours(project.id, period); return dh > 0 ? (
                                    <div className="rp-chip" onClick={e => { e.stopPropagation(); openAssign(project.id, project.name, 'dev', period, { memberId: '', hours: dh }) }}
                                      style={{ background: '#334155', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
                                      <span style={{ fontSize: 11, opacity: 0.7 }}>Dev</span>
                                      <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 3, padding: '1px 5px', fontSize: 11 }}>{dh}h</span>
                                    </div>) : null })()
                                : devPlans(project.id, period).map(plan => (
                                    <div key={plan.id} className="rp-chip" onClick={e => { e.stopPropagation(); openAssign(project.id, project.name, 'dev', period, plan) }}
                                      style={{ background: '#334155', color: '#fff', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
                                      <span style={{ fontSize: 11, opacity: 0.7 }}>Dev</span>
                                      <span style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 3, padding: '1px 5px', fontSize: 11 }}>{plan.hours}h</span>
                                    </div>
                                  ))
                              }
                              <div className="rp-add">+ assign</div>
                            </div>
                          </td>
                        )
                      })}
                      <td style={{ padding: '6px 8px', borderBottom: '2px solid var(--c5)', background: '#f1f5f9', textAlign: 'center', verticalAlign: 'middle' }}>
                        {devTotal(project.id) > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c2)' }}>{devTotal(project.id)}h</span>}
                      </td>
                    </tr>

                  </React.Fragment>
                )
              })}
            </tbody>
            {plannedProjects.length > 0 && (
              <tfoot>
                <tr>
                  <td style={{ padding: '10px 14px', borderTop: '2px solid var(--c3)', background: '#1e2a4a', position: 'sticky', left: 0, zIndex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Total</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>All projects</div>
                  </td>
                  {periods.map(per => {
                    const ux = periodUxTotal(per)
                    const dev = periodDevTotal(per)
                    const tot = ux + dev
                    const cur = isCurrent(per, periodType)
                    return (
                      <td key={per} style={{ padding: '8px 6px', borderTop: '2px solid var(--c3)', background: cur ? '#2a3a5e' : '#1e2a4a', textAlign: 'center', verticalAlign: 'middle' }}>
                        {tot > 0 ? (
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{tot}h</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                              <span style={{ color: '#93c5fd' }}>{ux}h</span> <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span> <span style={{ color: '#94a3b8' }}>{dev}h</span>
                            </div>
                          </div>
                        ) : <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>—</span>}
                      </td>
                    )
                  })}
                  <td style={{ padding: '8px', borderTop: '2px solid var(--c3)', background: '#162038', textAlign: 'center', verticalAlign: 'middle' }}>
                    {grandTotal > 0 && <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{grandTotal}h</span>}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── Bulk Assign modal ─────────────────────────────────────────────────── */}
      {bulkModal && (
        <div className="modal-overlay" onClick={() => setBulkModal(null)}>
          <div className="modal-box" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  ⚡ Bulk assign {bulkModal.rowType === 'ux' ? 'UX / UI' : 'Dev'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--c4)', marginTop: 2 }}>{bulkModal.projectLabel}</div>
              </div>
              <button className="modal-close" onClick={() => setBulkModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Person (UX only) */}
              {bulkModal.rowType === 'ux' && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Person</label>
                  <select
                    value={bulkModal.memberId}
                    onChange={e => setBulkModal(m => m ? { ...m, memberId: e.target.value } : m)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--c5)', fontSize: 13, background: 'white' }}
                  >
                    <option value="">Select person…</option>
                    {rs.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  {rs.members.length === 0 && <div className="form-hint">Add team members via "Manage Team" first</div>}
                </div>
              )}

              {/* Total hours + num periods side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Total hours</label>
                  <input
                    type="number" min={0} step={1} placeholder="e.g. 80"
                    value={bulkModal.totalHours}
                    onChange={e => setBulkModal(m => m ? { ...m, totalHours: e.target.value } : m)}
                    autoFocus={bulkModal.rowType === 'dev'}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--c5)', fontSize: 13 }}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Spread over ({periodType === 'week' ? 'weeks' : 'months'})</label>
                  <input
                    type="number" min={1} max={periodType === 'week' ? 52 : 24} step={1}
                    value={bulkModal.numPeriods}
                    onChange={e => setBulkModal(m => m ? { ...m, numPeriods: Math.max(1, parseInt(e.target.value) || 1) } : m)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--c5)', fontSize: 13 }}
                  />
                </div>
              </div>

              {/* Starting period */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Starting {periodType === 'week' ? 'week' : 'month'}</label>
                <select
                  value={bulkModal.startPeriodIdx}
                  onChange={e => setBulkModal(m => m ? { ...m, startPeriodIdx: parseInt(e.target.value) } : m)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--c5)', fontSize: 13, background: 'white' }}
                >
                  {periods.map((p, i) => (
                    <option key={p} value={i}>{fmtStr(p, periodType)}{isCurrent(p, periodType) ? ' (current)' : ''}</option>
                  ))}
                </select>
              </div>

              {/* Distribution preview */}
              {bulkDist && (
                <div style={{ background: 'var(--c7)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Distribution preview</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {bulkDist.map((h, i) => {
                      const per = bulkStartPeriods[i]
                      const maxH = Math.max(...bulkDist)
                      const pct = maxH > 0 ? (h / maxH) * 100 : 0
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ fontSize: 11, color: 'var(--c3)', width: 100, flexShrink: 0, fontWeight: 500 }}>
                            {per ? fmtStr(per, periodType) : ''}
                          </div>
                          <div style={{ flex: 1, height: 6, background: 'var(--c5)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: bulkModal.rowType === 'ux' ? 'var(--navy)' : '#334155', borderRadius: 3, transition: 'width 0.2s' }} />
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c1)', width: 34, textAlign: 'right', flexShrink: 0 }}>{h}h</div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c4)', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--c6)' }}>
                    Total: <strong>{bulkDist.reduce((a, b) => a + b, 0)}h</strong> · {bulkModal.numPeriods} {periodType === 'week' ? 'weeks' : 'months'} · ~{Math.round(bulkDist[0])}h / {periodType === 'week' ? 'week' : 'month'}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <div style={{ flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={() => setBulkModal(null)}>Cancel</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleBulkSave}
                disabled={saving || !bulkModal.totalHours || (bulkModal.rowType === 'ux' && !bulkModal.memberId)}
              >
                {saving ? 'Saving…' : `Assign ${bulkModal.totalHours ? bulkModal.totalHours + 'h' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Single cell assign modal ──────────────────────────────────────────── */}
      {assignModal && (
        <div className="modal-overlay" onClick={() => setAssignModal(null)}>
          <div className="modal-box" style={{ maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{assignModal.existingId ? 'Edit' : 'Assign'} {assignModal.rowType === 'ux' ? 'UX / UI' : 'Dev'}</div>
                <div style={{ fontSize: 12, color: 'var(--c4)', marginTop: 2 }}>{assignModal.projectLabel} · {fmtStr(assignModal.period, periodType)}</div>
              </div>
              <button className="modal-close" onClick={() => setAssignModal(null)}>×</button>
            </div>
            <div className="modal-body">
              {assignModal.rowType === 'ux' && (
                <div className="form-group">
                  <label className="form-label">Person</label>
                  <select value={assignModal.memberId} onChange={e => setAssignModal(m => m ? { ...m, memberId: e.target.value } : m)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--c5)', fontSize: 13, background: 'white' }}>
                    <option value="">Select person…</option>
                    {rs.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Hours</label>
                <input type="number" min={0} step={0.5} placeholder="e.g. 32" value={assignModal.hours} onChange={e => setAssignModal(m => m ? { ...m, hours: e.target.value } : m)} onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus={assignModal.rowType === 'dev'} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--c5)', fontSize: 13 }} />
              </div>
            </div>
            <div className="modal-footer">
              {(assignModal.existingId || (isMonthView && assignModal.hours)) && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={handleDeletePlan} disabled={saving}>Delete</button>}
              <div style={{ flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={() => setAssignModal(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !assignModal.hours || (assignModal.rowType === 'ux' && !assignModal.memberId)}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Project modal ─────────────────────────────────────────────────── */}
      {addProjectModal && (
        <div className="modal-overlay" onClick={() => setAddProjectModal(false)}>
          <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontSize: 15, fontWeight: 700 }}>Add project to plan</div>
              <button className="modal-close" onClick={() => setAddProjectModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '12px 20px 20px' }}>
              <input type="text" placeholder="Search…" value={projectSearch} onChange={e => setProjectSearch(e.target.value)} autoFocus style={{ width: '100%', padding: '9px 12px', borderRadius: 7, border: '1px solid var(--c5)', fontSize: 13, marginBottom: 12, boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {availableToAdd.length === 0 && <div style={{ color: 'var(--c4)', fontSize: 13, padding: '16px 0', textAlign: 'center' }}>No projects available</div>}
                {availableToAdd.map(p => (
                  <div key={p.id} onClick={async () => { await rs.addProjectToPlan(p.id); toast('success', `${p.name} added`); setAddProjectModal(false) }}
                    style={{ padding: '11px 14px', borderRadius: 7, border: '1px solid var(--c6)', cursor: 'pointer', background: 'white' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--c7)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c0)' }}>
                      {p.client?.name ? <><span style={{ color: 'var(--c3)' }}>{p.client.name}</span> — </> : ''}{p.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--c4)', marginTop: 2, fontFamily: 'monospace' }}>{p.pn}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Team modal ───────────────────────────────────────────────────────── */}
      {teamModal && (
        <div className="modal-overlay" onClick={() => setTeamModal(false)}>
          <div className="modal-box" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontSize: 15, fontWeight: 700 }}>Manage UX/UI Team</div>
              <button className="modal-close" onClick={() => setTeamModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {rs.members.length === 0
                ? <p style={{ color: 'var(--c4)', fontSize: 13, marginBottom: 16 }}>No members yet.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                    {rs.members.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: 'var(--c7)', borderRadius: 7, fontSize: 14, fontWeight: 500 }}>
                        <span>{m.name}</span>
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => rs.removeMember(m.id).then(() => toast('success', 'Removed'))}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="text" placeholder="Name…" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newMemberName.trim()) rs.addMember(newMemberName.trim()).then(() => { setNewMemberName(''); toast('success', 'Added') }) }} style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--c5)', fontSize: 13 }} />
                <button className="btn btn-primary btn-sm" disabled={!newMemberName.trim()} onClick={() => rs.addMember(newMemberName.trim()).then(() => { setNewMemberName(''); toast('success', 'Added') })}>Add</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
