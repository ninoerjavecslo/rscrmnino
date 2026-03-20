import { useState, useEffect, useCallback, useMemo } from 'react'
import { useResourceStore } from '../stores/resource'
import { useProjectsStore } from '../stores/projects'
import { Select } from '../components/Select'
import { toast } from '../lib/toast'
import type { AllocationCategory, Project, ResourceAllocation } from '../lib/types'
import { analyzeMemberBuffer } from '../lib/bufferAnalysis'
import type { MemberBufferStats } from '../lib/bufferAnalysis'
import { distributeWeekly } from '../lib/distributeWeekly'
import { supabase } from '../lib/supabase'
import { useTemplates } from '../hooks/useTemplates'
import type { AllocationTemplate, TemplateEntry } from '../lib/types'

/* ── helpers ──────────────────────────────────────────────────── */

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMonday(d: Date): string {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = c.getDay()
  c.setDate(c.getDate() + (day === 0 ? -6 : 1 - day))
  return localDate(c)
}

function weekDaysOf(monday: string): string[] {
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

function dayLabel(s: string): string {
  const d = new Date(s + 'T00:00:00')
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
}
function dayNum(s: string): string {
  const d = new Date(s + 'T00:00:00')
  return `${d.getDate()}/${d.getMonth() + 1}`
}

function fmtWeekLabel(monday: string): string {
  return new Date(monday + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const CATS: { value: AllocationCategory; label: string; color: string; bg: string; billable: boolean }[] = [
  { value: 'project',     label: 'Project',     color: 'var(--navy)', bg: 'var(--navy-light)', billable: true },
  { value: 'maintenance', label: 'Maintenance', color: '#c2410c',     bg: '#fff7ed',           billable: true },
  { value: 'internal',    label: 'Internal',    color: 'var(--blue)', bg: '#e8f4fd',           billable: false },
  { value: 'meeting',     label: 'Meeting',     color: '#e67700',     bg: '#fff3e0',           billable: false },
  { value: 'admin',       label: 'Admin',       color: 'var(--c3)',   bg: 'var(--c7)',         billable: false },
  { value: 'leave',       label: 'Leave',       color: 'var(--red)',  bg: '#fce4ec',           billable: false },
]

function catInfo(c: AllocationCategory) { return CATS.find(x => x.value === c)! }

/* ── grouped alloc type ──────────────────────────────────────── */

interface AllocGroup {
  key: string
  memberId: string
  category: AllocationCategory
  projectId: string | null
  projectLabel: string
  label: string | null
  dayHours: Record<string, number>
  allocIds: Record<string, string>
  weekTotal: number
  recurring: boolean
  recurringGroupId: string | null
  isDeadlineWeek: boolean
  hasUnplanned: boolean
}

/* ── assign entry (multi-assign) ─────────────────────────────── */

interface AssignEntry {
  id: number
  category: AllocationCategory
  projectId: string
  label: string
  mode: 'week' | 'day'
  totalHours: number
  dayHours: number[]
  recurring: boolean
  repeatWeeks: number
  billable: boolean
  hasDeadline: boolean
  deadlineDate: string
}

let entryIdCounter = 0
function newEntry(fridayDate: string): AssignEntry {
  return { id: ++entryIdCounter, category: 'project', projectId: '', label: '', mode: 'week', totalHours: 20, dayHours: [0, 0, 0, 0, 0], recurring: false, repeatWeeks: 4, billable: true, hasDeadline: false, deadlineDate: fridayDate }
}

/* ── WizardSteps helper ───────────────────────────────────────── */

function WizardSteps({ step }: { step: number }) {
  const labels = ['Projects', 'Budgets & Team', 'AI Plan', 'Review']
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
      {labels.map((label, i) => {
        const n = i + 1
        const done = step > n
        const active = step === n
        return (
          <>
            <div key={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 10, fontWeight: 800,
                background: done || active ? 'var(--navy)' : 'var(--c6)',
                color: done || active ? '#fff' : 'var(--c3)',
              }}>{done ? '✓' : n}</div>
              <span style={{ fontSize: 10, color: active ? 'var(--navy)' : 'var(--c3)', fontWeight: active ? 700 : 400, whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div style={{ flex: 1, height: 2, background: step > n ? 'var(--navy)' : 'var(--c6)', margin: '0 4px', marginBottom: 14 }} />
            )}
          </>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════ */

export function ResourcePlanningView() {
  const {
    members, allocations, loading,
    fetchMembers, fetchAllocations,
    addAllocationsBatch, removeAllocation, removeRecurringGroup,
    removeAllocationsForWeek,
    deliverables, fetchDeliverables,
  } = useResourceStore()
  const projects: Project[] = useProjectsStore(s => s.projects)
  const fetchProjects = useProjectsStore(s => s.fetchAll)

  const { templates, saveTemplate, deleteTemplate, applyTemplate } = useTemplates()

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [detailGroup, setDetailGroup] = useState<AllocGroup | null>(null)

  // filters
  const [search, setSearch] = useState('')
  const [filterTeam, setFilterTeam] = useState('')

  // assign modal
  const [assignFor, setAssignFor] = useState<string | null>(null)
  const [assignEntries, setAssignEntries] = useState<AssignEntry[]>([])
  const [bufferStats, setBufferStats] = useState<Map<string, MemberBufferStats>>(new Map())
  const [assignTab, setAssignTab] = useState<'simple' | 'advanced'>('simple')

  // batch assign modal
  const [showBatch, setShowBatch] = useState(false)
  const [batchMembers, setBatchMembers] = useState<Set<string>>(new Set())
  const [batchCategory, setBatchCategory] = useState<AllocationCategory>('admin')
  const [batchLabel, setBatchLabel] = useState('')
  const [batchProjectId, setBatchProjectId] = useState('')
  const [batchHours, setBatchHours] = useState(0.5)
  const [batchFreq, setBatchFreq] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [batchWeekDay, setBatchWeekDay] = useState(1) // 1=Mon
  const [batchMonthDay, setBatchMonthDay] = useState(1) // 1st of month
  const [batchWeeks, setBatchWeeks] = useState(4)
  const [batchSaving, setBatchSaving] = useState(false)

  // template state
  const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [saveTemplateName, setSaveTemplateName] = useState('')
  const [lastWeekDismissed, setLastWeekDismissed] = useState(false)
  const [lastWeekAllocations, setLastWeekAllocations] = useState<ResourceAllocation[]>([])

  // smart plan modal
  const [showSmartPlan, setShowSmartPlan] = useState(false)
  const [smartLoading, setSmartLoading] = useState(false)
  const [smartSuggestions, setSmartSuggestions] = useState<{ member_id: string; project_id: string; category: AllocationCategory; weekly_hours: number; label: string; reason: string }[]>([])
  const [smartRemovedIdx, setSmartRemovedIdx] = useState<Set<number>>(new Set())
  const [smartSaving, setSmartSaving] = useState(false)

  // smart allocate wizard
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1)
  const [wizardMonth, setWizardMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [wizardSelectedProjects, setWizardSelectedProjects] = useState<Set<string>>(new Set())
  const [wizardBudgets, setWizardBudgets] = useState<Record<string, number>>({})
  const [wizardProjectMembers, setWizardProjectMembers] = useState<Record<string, string[]>>({})
  const [wizardPlan, setWizardPlan] = useState<{
    week_start: string
    allocations: { member_id: string; project_id: string; weekly_hours: number; reason: string; _id: string }[]
  }[]>([])
  const [wizardLoading, setWizardLoading] = useState(false)
  const [wizardSaveAsTemplate, setWizardSaveAsTemplate] = useState(false)
  const [wizardTemplateName, setWizardTemplateName] = useState('')
  const [wizardSaving, setWizardSaving] = useState(false)

  const days = weekDaysOf(weekStart)
  const weekEnd = days[4]
  const teams = useResourceStore(s => s.teams)
  const fetchTeams = useResourceStore(s => s.fetchTeams)
  const allActive = members.filter(m => m.active)
  const active = allActive.filter(m => {
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterTeam && m.team_id !== filterTeam) return false
    return true
  })

  useEffect(() => { fetchMembers(); fetchProjects(); fetchTeams(); fetchDeliverables() }, [])
  useEffect(() => { fetchAllocations(weekStart, weekEnd) }, [weekStart])
  useEffect(() => {
    if (!assignFor) return
    analyzeMemberBuffer(assignFor).then(stats => {
      setBufferStats(prev => new Map(prev).set(assignFor, stats))
    })
  }, [assignFor])

  useEffect(() => {
    setLastWeekDismissed(sessionStorage.getItem('rp_lastweek_dismissed_' + weekStart) === '1')
  }, [weekStart])

  useEffect(() => {
    const prevMonday = (() => {
      const d = new Date(weekStart + 'T00:00:00')
      d.setDate(d.getDate() - 7)
      return localDate(d)
    })()
    const prevFriday = (() => {
      const d = new Date(weekStart + 'T00:00:00')
      d.setDate(d.getDate() - 3)
      return localDate(d)
    })()
    supabase.from('resource_allocations')
      .select('*, project:projects(id, pn, name)')
      .gte('date', prevMonday).lte('date', prevFriday)
      .then(({ data }) => setLastWeekAllocations((data ?? []) as ResourceAllocation[]))
  }, [weekStart])

  /* ── grouping ─── */

  const grouped = useCallback((): Record<string, AllocGroup[]> => {
    const r: Record<string, AllocGroup[]> = {}
    for (const m of active) r[m.id] = []
    for (const a of allocations) {
      if (!r[a.member_id]) continue
      const k = `${a.member_id}:${a.category}:${a.project_id || a.label || a.category}`
      let g = r[a.member_id].find(x => x.key === k)
      if (!g) {
        g = {
          key: k, memberId: a.member_id, category: a.category,
          projectId: a.project_id || null,
          projectLabel: (a.category === 'project' || a.category === 'maintenance') ? (a.project ? `${a.project.pn} — ${a.project.name}` : '?') : (a.label || a.category),
          label: a.label || null, dayHours: {}, allocIds: {}, weekTotal: 0,
          recurring: !!a.recurring_group_id, recurringGroupId: a.recurring_group_id || null,
          isDeadlineWeek: false, hasUnplanned: false,
        }
        r[a.member_id].push(g)
      }
      g.dayHours[a.date] = (g.dayHours[a.date] || 0) + a.hours
      g.allocIds[a.date] = a.id
      g.weekTotal += a.hours
      if ((a.notes || '').includes('[DEADLINE]') || a.deadline_date) g.isDeadlineWeek = true
      if (a.is_unplanned) g.hasUnplanned = true
    }
    return r
  }, [allocations, active])

  const groups = grouped()
  const unplannedCount = allocations.filter(a => a.is_unplanned).length
  const mTotal = (mid: string) => (groups[mid] || []).reduce((s, g) => s + g.weekTotal, 0)
  const mDayTotal = (mid: string, d: string) => allocations.filter(a => a.member_id === mid && a.date === d).reduce((s, a) => s + a.hours, 0)

  const showLastWeekBanner = !lastWeekDismissed
    && allocations.length === 0
    && lastWeekAllocations.length > 0

  const lastWeekSummary = useMemo(() => {
    const groups: Record<string, number> = {}
    for (const a of lastWeekAllocations) {
      const label = (a.project as { pn?: string } | null)?.pn ?? (a as { label?: string }).label ?? a.category
      const key = `${a.member_id}::${label}`
      groups[key] = (groups[key] || 0) + a.hours
    }
    return Object.entries(groups).slice(0, 4).map(([key, h]) => {
      const [mid, label] = key.split('::')
      const m = allActive.find(x => x.id === mid)
      return `${m?.name ?? '?'} ${h}h ${label}`
    }).join(' · ')
  }, [lastWeekAllocations, allActive])

  function buildLastWeekTemplate(): Pick<AllocationTemplate, 'entries'> {
    const grps: Record<string, TemplateEntry> = {}
    for (const a of lastWeekAllocations) {
      const key = `${a.member_id}::${a.project_id ?? a.category}`
      if (!grps[key]) {
        const m = allActive.find(x => x.id === a.member_id)
        const proj = a.project as { pn?: string; name?: string } | null
        grps[key] = {
          member_id: a.member_id,
          member_name: m?.name ?? '?',
          project_id: a.project_id ?? null,
          project_label: proj ? `${proj.pn} — ${proj.name}` : (a as { label?: string }).label ?? a.category,
          category: a.category,
          weekly_hours: 0,
          is_billable: a.is_billable,
        }
      }
      grps[key].weekly_hours += a.hours
    }
    return { entries: Object.values(grps) }
  }

  /* ── assign ─── */

  const openAssign = (mid: string) => {
    setAssignFor(mid)
    setAssignEntries([newEntry(weekEnd)])
  }

  const updateEntry = (id: number, patch: Partial<AssignEntry>) => {
    setAssignEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }
  const removeEntry = (id: number) => {
    setAssignEntries(prev => prev.filter(e => e.id !== id))
  }

  const handleAssign = async () => {
    if (!assignFor) return
    const member = members.find(m => m.id === assignFor)
    const cap = member?.hours_per_day ?? 8

    try {
      const allRows: Array<{ member_id: string; project_id?: string | null; category: AllocationCategory; date: string; hours: number; label?: string | null; notes?: string | null; recurring_group_id?: string | null }> = []

      for (const entry of assignEntries) {
        if ((entry.category === 'project' || entry.category === 'maintenance') && !entry.projectId) { toast('error', 'Select a project for each entry'); return }
        const weeksN = entry.recurring ? entry.repeatWeeks : 1
        const gid = entry.recurring ? crypto.randomUUID() : null

        for (let w = 0; w < weeksN; w++) {
          const wkDays = weekDaysOf(shiftWeek(weekStart, w))
          const base = {
            member_id: assignFor,
            project_id: (entry.category === 'project' || entry.category === 'maintenance') ? entry.projectId : null,
            category: entry.category,
            label: (entry.category !== 'project' && entry.category !== 'maintenance') ? (entry.label || null) : null,
            notes: entry.hasDeadline ? '[DEADLINE]' : null,
            is_billable: entry.billable,
            deadline_date: entry.hasDeadline ? entry.deadlineDate : null,
            recurring_group_id: gid,
          }
          if (entry.mode === 'day') {
            entry.dayHours.forEach((h, i) => { if (h > 0) allRows.push({ ...base, date: wkDays[i], hours: h }) })
          } else {
            let rem = entry.totalHours
            for (let i = 0; i < 5 && rem > 0; i++) {
              const used = w === 0 ? mDayTotal(assignFor, wkDays[i]) : 0
              const avail = Math.max(0, cap - used)
              if (avail <= 0) continue
              const a = Math.min(avail, rem)
              allRows.push({ ...base, date: wkDays[i], hours: a })
              rem -= a
            }
          }
        }
      }

      if (allRows.length === 0) { toast('error', 'Nothing to allocate'); return }
      await addAllocationsBatch(allRows)
      toast('success', `Allocated ${allRows.reduce((s, r) => s + r.hours, 0)}h`)
      setAssignFor(null)
    } catch { toast('error', 'Failed to allocate') }
  }

  /* ── delete ─── */

  const deleteGroup = async (g: AllocGroup) => {
    try {
      if (g.recurringGroupId) { await removeRecurringGroup(g.recurringGroupId); toast('success', 'Series removed') }
      else { await removeAllocationsForWeek(g.memberId, g.projectId, g.category, weekStart, weekEnd); toast('success', 'Removed') }
      setDetailGroup(null)
    } catch { toast('error', 'Failed') }
  }

  const deleteDay = async (allocId: string, g: AllocGroup, day: string) => {
    try {
      await removeAllocation(allocId)
      toast('success', 'Day removed')
      const hrs = g.dayHours[day] || 0
      setDetailGroup({ ...g, dayHours: { ...g.dayHours, [day]: 0 }, allocIds: { ...g.allocIds, [day]: '' }, weekTotal: g.weekTotal - hrs })
    } catch { toast('error', 'Failed') }
  }

  const projectOptions = projects.filter((p: Project) => p.status === 'active').map((p: Project) => ({ value: p.id, label: `${p.pn} — ${p.name}` }))

  /* ── batch assign ──────────────────────────────────────────── */

  const openBatch = () => {
    setBatchMembers(new Set(allActive.map(m => m.id)))
    setBatchCategory('admin')
    setBatchLabel('')
    setBatchProjectId('')
    setBatchHours(0.5)
    setBatchFreq('daily')
    setBatchWeekDay(1)
    setBatchMonthDay(1)
    setBatchWeeks(4)
    setShowBatch(true)
  }

  const handleBatchAssign = async () => {
    if (batchMembers.size === 0) { toast('error', 'Select at least one member'); return }
    const needsProject = batchCategory === 'project' || batchCategory === 'maintenance'
    if (needsProject && !batchProjectId) { toast('error', 'Select a project'); return }
    if (!needsProject && !batchLabel.trim()) { toast('error', 'Enter a label'); return }
    setBatchSaving(true)
    try {
      const rows: Array<{ member_id: string; category: AllocationCategory; date: string; hours: number; project_id?: string | null; label?: string | null; is_billable: boolean; recurring_group_id?: string }> = []
      const gid = crypto.randomUUID()
      const cat = CATS.find(c => c.value === batchCategory)!

      for (let w = 0; w < batchWeeks; w++) {
        const wkStart = shiftWeek(weekStart, w)
        const wkDays = weekDaysOf(wkStart)

        for (const mid of batchMembers) {
          const base = {
            member_id: mid,
            category: batchCategory,
            project_id: needsProject ? batchProjectId : null,
            label: needsProject ? null : batchLabel.trim(),
            is_billable: cat.billable,
            recurring_group_id: batchWeeks > 1 ? gid : undefined,
          }
          if (batchFreq === 'daily') {
            wkDays.forEach(d => rows.push({ ...base, date: d, hours: batchHours }))
          } else if (batchFreq === 'weekly') {
            const d = wkDays[Math.min(batchWeekDay, 4)]
            rows.push({ ...base, date: d, hours: batchHours })
          } else {
            // monthly — find the target day in the month of wkStart
            const ref = new Date(wkStart + 'T00:00:00')
            const target = new Date(ref.getFullYear(), ref.getMonth(), batchMonthDay)
            if (target.getDay() !== 0 && target.getDay() !== 6) {
              const ds = `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')}`
              // only add once per month
              if (!rows.find(r => r.member_id === mid && r.date === ds)) {
                rows.push({ ...base, date: ds, hours: batchHours })
              }
            }
          }
        }
      }

      if (rows.length === 0) { toast('error', 'Nothing to allocate'); setBatchSaving(false); return }
      await addAllocationsBatch(rows)
      toast('success', `Added ${rows.length} allocations for ${batchMembers.size} member${batchMembers.size > 1 ? 's' : ''}`)
      setShowBatch(false)
    } catch { toast('error', 'Failed to batch assign') }
    finally { setBatchSaving(false) }
  }

  /* ── smart plan ────────────────────────────────────────────── */

  const runSmartPlan = async () => {
    setSmartLoading(true)
    setSmartSuggestions([])
    setSmartRemovedIdx(new Set())
    try {
      const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-planner`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({ members: allActive, deliverables, allocations, weekStart, weekEnd, projects }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.suggestions?.length) {
          setSmartSuggestions(data.suggestions)
        } else {
          toast('info', 'AI returned no suggestions for this week')
        }
      } else {
        throw new Error('Edge function error')
      }
    } catch {
      toast('error', 'Smart planner unavailable — check Supabase edge function')
    } finally {
      setSmartLoading(false)
    }
  }

  const applySmartPlan = async () => {
    const toApply = smartSuggestions.filter((_, i) => !smartRemovedIdx.has(i))
    if (toApply.length === 0) { toast('error', 'Nothing selected'); return }
    setSmartSaving(true)
    try {
      const expanded = toApply.flatMap(s =>
        distributeWeekly(weekStart, s.member_id, s.weekly_hours, allActive, allocations).map(({ date, hours }) => ({
          member_id: s.member_id,
          project_id: s.project_id || null,
          category: s.category,
          date,
          hours,
          label: s.label || null,
          is_billable: s.category === 'project' || s.category === 'maintenance',
        }))
      )
      if (expanded.length === 0) { toast('error', 'No available capacity to distribute hours'); return }
      await addAllocationsBatch(expanded)
      toast('success', `Applied ${expanded.length} day allocations from ${toApply.length} suggestions`)
      setShowSmartPlan(false)
      setSmartSuggestions([])
    } catch { toast('error', 'Failed to apply plan') }
    finally { setSmartSaving(false) }
  }

  /* ── smart allocate wizard ─────────────────────────────────── */

  function resetWizard() {
    setWizardStep(1)
    setWizardSelectedProjects(new Set())
    setWizardBudgets({})
    setWizardProjectMembers({})
    setWizardPlan([])
    setWizardLoading(false)
    setWizardSaveAsTemplate(false)
    setWizardTemplateName('')
  }

  async function runWizardAI() {
    setWizardLoading(true)
    setWizardPlan([])
    try {
      const monthStart = wizardMonth + '-01'
      const selectedProjs = projects.filter(p => wizardSelectedProjects.has(p.id))
      const projPayload = selectedProjs.map(p => ({
        id: p.id, pn: p.pn, name: p.name,
        budget_hours: wizardBudgets[p.id] ?? 40,
        member_ids: wizardProjectMembers[p.id] ?? [],
        deliverables: deliverables.filter(d => d.project_id === p.id && d.status === 'active')
          .map(d => ({ title: d.title, due_date: d.due_date ?? null, estimated_hours: d.estimated_hours ?? null })),
      }))

      const monthEnd = (() => {
        const d = new Date(monthStart + 'T00:00:00')
        d.setMonth(d.getMonth() + 1)
        d.setDate(0)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })()
      const { data: monthAllocs } = await supabase.from('resource_allocations')
        .select('member_id, date, hours')
        .gte('date', monthStart).lte('date', monthEnd)

      const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-allocator`
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
        body: JSON.stringify({
          projects: projPayload,
          members: allActive.map(m => ({ id: m.id, name: m.name, hours_per_day: m.hours_per_day, role: m.role ?? null })),
          month_start: monthStart,
          existing_allocations: monthAllocs ?? [],
        }),
      })
      if (!res.ok) throw new Error('Edge function error')
      const data = await res.json()

      const plan = (data.weeks ?? []).map((w: { week_start: string; allocations: { member_id: string; project_id: string; weekly_hours: number; reason: string }[] }) => ({
        week_start: w.week_start,
        allocations: (w.allocations ?? []).map((a: { member_id: string; project_id: string; weekly_hours: number; reason: string }) => ({
          ...a, _id: Math.random().toString(36).slice(2)
        })),
      }))
      setWizardPlan(plan)
      setWizardStep(3)
    } catch {
      toast('error', 'Smart allocator unavailable — check Supabase edge function')
    } finally {
      setWizardLoading(false)
    }
  }

  async function handleWizardApply() {
    setWizardSaving(true)
    try {
      const monthStart = wizardMonth + '-01'
      const monthEnd = (() => {
        const d = new Date(monthStart + 'T00:00:00')
        d.setMonth(d.getMonth() + 1)
        d.setDate(0)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      })()

      const { data: monthAllocs } = await supabase.from('resource_allocations')
        .select('member_id, date, hours, id')
        .gte('date', monthStart).lte('date', monthEnd)

      const existingByWeek = (weekStartStr: string) => (monthAllocs ?? []).filter(a => {
        const d = new Date(a.date + 'T00:00:00')
        const mon = new Date(weekStartStr + 'T00:00:00')
        const fri = new Date(mon)
        fri.setDate(fri.getDate() + 4)
        return d >= mon && d <= fri
      })

      const rows: { member_id: string; project_id: string | null; category: AllocationCategory; date: string; hours: number; is_billable: boolean }[] = []
      for (const week of wizardPlan) {
        const weekSlice = existingByWeek(week.week_start) as ResourceAllocation[]
        for (const alloc of week.allocations) {
          if (alloc.weekly_hours <= 0) continue
          const daySlots = distributeWeekly(week.week_start, alloc.member_id, alloc.weekly_hours, allActive, weekSlice)
          for (const { date, hours } of daySlots) {
            rows.push({
              member_id: alloc.member_id,
              project_id: alloc.project_id,
              category: 'project',
              date,
              hours,
              is_billable: true,
            })
          }
        }
      }

      if (rows.length === 0) { toast('info', 'No capacity available'); setWizardSaving(false); return }
      await addAllocationsBatch(rows)

      if (wizardSaveAsTemplate && wizardTemplateName.trim()) {
        const entryMap: Record<string, { sum: number; count: number; entry: TemplateEntry }> = {}
        for (const week of wizardPlan) {
          for (const alloc of week.allocations) {
            if (alloc.weekly_hours <= 0) continue
            const key = `${alloc.member_id}::${alloc.project_id}`
            const m = allActive.find(x => x.id === alloc.member_id)
            const proj = projects.find(p => p.id === alloc.project_id)
            if (!entryMap[key]) {
              entryMap[key] = {
                sum: 0, count: 0,
                entry: {
                  member_id: alloc.member_id, member_name: m?.name ?? '?',
                  project_id: alloc.project_id, project_label: proj ? `${proj.pn} — ${proj.name}` : '?',
                  category: 'project', weekly_hours: 0, is_billable: true,
                }
              }
            }
            entryMap[key].sum += alloc.weekly_hours
            entryMap[key].count += 1
          }
        }
        const entries: TemplateEntry[] = Object.values(entryMap).map(({ sum, count, entry }) => ({
          ...entry, weekly_hours: Math.round((sum / count) * 2) / 2,
        }))
        await saveTemplate(wizardTemplateName.trim(), entries)
      }

      toast('success', `Applied ${rows.length} allocations across the month`)
      setShowWizard(false)
      resetWizard()
    } catch {
      toast('error', 'Failed to apply plan')
    } finally {
      setWizardSaving(false)
    }
  }

  /* ── render ────────────────────────────────────────────────── */

  return (
    <div>
      <div className="page-header">
        <div><h1>Resource Planning</h1><p>Weekly team allocation</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Templates dropdown */}
          <div style={{ position: 'relative' }}>
            <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); setShowTemplatesDropdown(v => !v) }}>
              📋 Templates ▾
            </button>
            {showTemplatesDropdown && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, zIndex: 200, marginTop: 4,
                background: '#fff', border: '1px solid var(--c6)', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 280, padding: 8,
              }} onClick={e => e.stopPropagation()}>
                {templates.length === 0 && (
                  <div style={{ padding: '10px 8px', fontSize: 13, color: 'var(--c3)' }}>No saved templates yet.</div>
                )}
                {templates.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)' }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--c3)' }}>{t.entries.length} entries</div>
                    </div>
                    <button className="btn btn-primary btn-xs" onClick={async () => {
                      setShowTemplatesDropdown(false)
                      await applyTemplate(t, weekStart, allocations, allActive, addAllocationsBatch)
                    }}>Apply</button>
                    <button className="btn btn-ghost btn-xs" onClick={() => deleteTemplate(t.id)}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save as template */}
          <button className="btn btn-secondary btn-sm" onClick={() => {
            const d = new Date(weekStart + 'T00:00:00')
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            setSaveTemplateName(`Sprint Week ${label}`)
            setShowSaveTemplate(true)
          }}>💾 Save week</button>

          <button className="btn btn-secondary btn-sm" onClick={openBatch}>⚡ Batch Assign</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowSmartPlan(true); runSmartPlan() }}>✦ Smart Plan</button>
          <button className="btn btn-primary btn-sm" onClick={() => { resetWizard(); setShowWizard(true) }}>✦ Smart Allocate</button>
        </div>
      </div>

      <div className="page-content" onClick={() => setShowTemplatesDropdown(false)}>
        {/* ── Week nav ─── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button className="btn btn-secondary" onClick={() => setWeekStart(shiftWeek(weekStart, -1))} style={{ height: 42, padding: '0 18px', fontSize: 14 }}>&larr; Prev</button>
          <button className="btn btn-ghost" onClick={() => setWeekStart(getMonday(new Date()))} style={{ height: 42, padding: '0 18px', fontSize: 14, color: 'var(--navy)', fontWeight: 600 }}>Today</button>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--c0)', margin: 0 }}>Week of {fmtWeekLabel(weekStart)}</h2>
          <button className="btn btn-secondary" onClick={() => setWeekStart(shiftWeek(weekStart, 1))} style={{ height: 42, padding: '0 18px', fontSize: 14 }}>Next &rarr;</button>
          {loading && <span style={{ fontSize: 13, color: 'var(--c4)' }}>Loading...</span>}
        </div>

        {showLastWeekBanner && (
          <div style={{
            background: 'var(--navy-light)', border: '1px solid var(--c5)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 14 }}>💡</span>
            <span style={{ fontSize: 13, flex: 1, color: 'var(--c1)' }}>
              <strong>Repeat last week?</strong> {lastWeekSummary}
            </span>
            <button className="btn btn-primary btn-sm" onClick={async () => {
              await applyTemplate(buildLastWeekTemplate(), weekStart, allocations, allActive, addAllocationsBatch)
            }}>Apply</button>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              sessionStorage.setItem('rp_lastweek_dismissed_' + weekStart, '1')
              setLastWeekDismissed(true)
            }}>Dismiss</button>
          </div>
        )}

        {/* ── Filters ─── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name..."
            style={{ width: 220 }}
          />
          <Select
            value={filterTeam}
            onChange={v => setFilterTeam(v)}
            options={[{ value: '', label: 'All teams' }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
            style={{ width: 180 }}
          />
          {/* Stats summary */}
          {(() => {
            const overAlloc = allActive.filter(m => {
              return days.some(d => mDayTotal(m.id, d) > m.hours_per_day)
            })
            const underAlloc = allActive.filter(m => {
              const cap = m.hours_per_day * 5
              return cap > 0 && mTotal(m.id) < cap * 0.5
            })
            return (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
                {unplannedCount > 0 && (
                  <span className="badge badge-amber" style={{ fontSize: 13, padding: '6px 12px' }}>
                    ⚡ {unplannedCount} unplanned
                  </span>
                )}
                {overAlloc.length > 0 && (
                  <span className="badge badge-red" style={{ fontSize: 13, padding: '6px 12px' }}>
                    {overAlloc.length} over-allocated
                  </span>
                )}
                {underAlloc.length > 0 && (
                  <span className="badge badge-amber" style={{ fontSize: 13, padding: '6px 12px' }}>
                    {underAlloc.length} under 50%
                  </span>
                )}
                <span style={{ fontSize: 14, color: 'var(--c3)' }}>{active.length} people</span>
              </div>
            )
          })()}
        </div>

        {/* ── People ─── */}
        {active.map(member => {
          const gs = groups[member.id] || []
          const total = mTotal(member.id)
          const cap = member.hours_per_day * 5
          const pct = cap > 0 ? Math.round((total / cap) * 100) : 0
          const isExp = expanded.has(member.id)
          const hasOverDay = days.some(d => mDayTotal(member.id, d) > member.hours_per_day)
          const isUnder = cap > 0 && pct < 50

          return (
            <div key={member.id} className="card" style={{ marginBottom: 20 }}>
              {/* ── Person header ─── */}
              <div
                onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(member.id) ? n.delete(member.id) : n.add(member.id); return n })}
                style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', cursor: 'pointer', gap: 16, borderBottom: isExp && gs.length > 0 ? '2px solid var(--c6)' : undefined }}
              >
                <span style={{ fontSize: 14, color: 'var(--c4)', width: 18 }}>{isExp ? '▾' : '▸'}</span>

                {/* Name + team — left side, plenty of room */}
                <div style={{ minWidth: 200, flex: '0 0 200px' }}>
                  <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--c0)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {member.name}
                    {gs.some(g => g.isDeadlineWeek) && <span className="badge badge-red" style={{ fontSize: 10 }}>DEADLINE</span>}
                    {hasOverDay && <span className="badge badge-red" style={{ fontSize: 10 }}>OVER</span>}
                    {isUnder && <span className="badge badge-amber" style={{ fontSize: 10 }}>LOW</span>}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--c4)', marginTop: 2 }}>
                    {member.team ? <span style={{ color: member.team.color, fontWeight: 600 }}>{member.team.name}</span> : 'No team'}
                    {member.role && <span> · {member.role}</span>}
                  </div>
                </div>

                {/* Capacity — middle */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 14, color: 'var(--c3)', whiteSpace: 'nowrap' }}>{total}h / {cap}h</span>
                  <div style={{ flex: 1, maxWidth: 160, height: 8, borderRadius: 4, background: 'var(--c6)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, borderRadius: 4, background: pct > 100 ? 'var(--red)' : pct >= 80 ? 'var(--green)' : 'var(--blue)', transition: 'width .2s' }} />
                  </div>
                  <span className={pct > 100 ? 'badge badge-red' : pct >= 80 ? 'badge badge-green' : 'badge badge-gray'} style={{ fontSize: 13, fontWeight: 700 }}>{pct}%</span>
                </div>

                {/* Daily mini — right side */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {days.map(d => {
                    const dt = mDayTotal(member.id, d)
                    const isOver = dt > member.hours_per_day
                    const isFull = dt === member.hours_per_day
                    return (
                      <div key={d} style={{ textAlign: 'center', width: 44 }}>
                        <div style={{ fontSize: 11, color: 'var(--c4)', marginBottom: 2 }}>{dayLabel(d)}</div>
                        <div style={{
                          fontSize: 14, fontWeight: 700, padding: '3px 0', borderRadius: 6,
                          background: isOver ? 'rgba(211,47,47,.15)' : isFull ? 'rgba(5,150,105,.15)' : dt > 0 ? 'rgba(5,150,105,.06)' : 'var(--c7)',
                          color: isOver ? 'var(--red)' : isFull ? 'var(--green)' : dt > 0 ? 'var(--c1)' : 'var(--c5)',
                          border: isOver ? '2px solid var(--red)' : '2px solid transparent',
                        }}>{dt || '—'}</div>
                      </div>
                    )
                  })}
                </div>

                <button className="btn btn-primary" onClick={e => { e.stopPropagation(); openAssign(member.id) }} style={{ height: 44, padding: '0 24px', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  + Assign
                </button>
              </div>

              {/* ── Expanded rows ─── */}
              {isExp && (
                <div>
                  {gs.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', background: 'var(--c7)', borderBottom: '1px solid var(--c6)' }}>
                      <div style={{ width: 32 }} />
                      <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Allocation</div>
                      {days.map(d => <div key={d} style={{ width: 64, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--c4)' }}>{dayLabel(d)} {dayNum(d)}</div>)}
                      <div style={{ width: 64, textAlign: 'center', fontSize: 12, fontWeight: 700, color: 'var(--c4)' }}>Total</div>
                    </div>
                  )}
                  {gs.map(g => {
                    const ci = catInfo(g.category)
                    return (
                      <div
                        key={g.key}
                        onClick={() => setDetailGroup(g)}
                        style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid var(--c6)', cursor: 'pointer', transition: 'background .1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#fafbfc')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <div style={{ width: 32, display: 'flex', justifyContent: 'center' }}>
                          <div style={{ width: 12, height: 12, borderRadius: '50%', background: ci.color, flexShrink: 0 }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--c0)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.projectLabel}</span>
                            {g.recurring && <span className="badge badge-blue" style={{ fontSize: 10 }}>↻</span>}
                            {g.hasUnplanned && <span className="badge badge-amber" style={{ fontSize: 10 }}>⚡ UNPLANNED</span>}
                            {g.isDeadlineWeek && <span className="badge badge-red" style={{ fontSize: 10 }}>DEADLINE</span>}
                          </div>
                          <div style={{ fontSize: 12, color: ci.color, fontWeight: 600 }}>{ci.label}</div>
                        </div>
                        {days.map(d => {
                          const hrs = g.dayHours[d] || 0
                          return (
                            <div key={d} style={{ width: 64, textAlign: 'center' }}>
                              {hrs > 0 ? (
                                <span style={{
                                  display: 'inline-block', padding: '5px 0', width: 48, borderRadius: 8,
                                  fontSize: 15, fontWeight: 700,
                                  background: ci.bg, color: ci.color,
                                  borderLeft: `4px solid ${ci.color}`,
                                }}>{hrs}h</span>
                              ) : <span style={{ color: 'var(--c6)', fontSize: 14 }}>—</span>}
                            </div>
                          )
                        })}
                        <div style={{ width: 64, textAlign: 'center', fontWeight: 800, fontSize: 16, color: 'var(--c0)' }}>{g.weekTotal}h</div>
                      </div>
                    )
                  })}
                  {gs.length === 0 && (
                    <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 15 }}>
                      No allocations yet. Click <strong>+ Assign</strong> to add work.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {active.length === 0 && (
          <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--c4)', fontSize: 16 }}>
            No team members. Go to <strong>Team</strong> to add people first.
          </div>
        )}
      </div>

      {/* ═══════════ ASSIGN MODAL ═══════════ */}
      {assignFor && (() => {
        const member = members.find(m => m.id === assignFor)
        if (!member) return null
        return (
          <div className="modal-overlay" onClick={() => { setAssignFor(null); setAssignTab('simple') }}>
            <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              <div className="modal-header">
                <h3>Assign to {member.name}</h3>
                <button className="modal-close" onClick={() => { setAssignFor(null); setAssignTab('simple') }}>&times;</button>
              </div>

              <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                {/* Buffer suggestion */}
                {bufferStats.get(assignFor) && (() => {
                  const stats = bufferStats.get(assignFor)!
                  if (stats.avgUnplannedHoursPerWeek <= 0) return null
                  return (
                    <div className="alert alert-amber" style={{ fontSize: 13, marginBottom: 12 }}>
                      <strong>Buffer suggestion:</strong> Based on the last {stats.weeksAnalyzed} weeks,{' '}
                      {member.name} averages <strong>{stats.avgUnplannedHoursPerWeek}h/week</strong> of unplanned work.
                      Consider leaving some capacity free.
                    </div>
                  )
                })()}

                {/* Capacity overview */}
                <div style={{ background: 'var(--c7)', borderRadius: 10, padding: 14, marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Available capacity this week</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {days.map(d => {
                      const used = mDayTotal(member.id, d)
                      const avail = Math.max(0, member.hours_per_day - used)
                      const isOver = used > member.hours_per_day
                      return (
                        <div key={d} style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontSize: 12, color: 'var(--c4)', marginBottom: 3 }}>{dayLabel(d)}</div>
                          <div style={{
                            fontSize: 16, fontWeight: 800, padding: '6px 0', borderRadius: 8,
                            background: isOver ? 'rgba(211,47,47,.1)' : avail === 0 ? 'rgba(5,150,105,.1)' : '#fff',
                            color: isOver ? 'var(--red)' : avail === 0 ? 'var(--green)' : 'var(--c1)',
                            border: isOver ? '2px solid var(--red)' : '1px solid var(--c6)',
                          }}>
                            {isOver ? `${used}h!` : `${avail}h`}
                          </div>
                          <div style={{ fontSize: 10, color: isOver ? 'var(--red)' : 'var(--c4)', marginTop: 2 }}>
                            {isOver ? 'over!' : avail === 0 ? 'full' : `of ${member.hours_per_day}h`}
                          </div>
                        </div>
                      )
                    })}
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: 'var(--c4)', marginBottom: 3 }}>Week</div>
                      <div style={{ fontSize: 16, fontWeight: 800, padding: '6px 0', borderRadius: 8, background: '#fff', border: '1px solid var(--c6)', color: 'var(--c1)' }}>
                        {Math.max(0, member.hours_per_day * 5 - mTotal(member.id))}h
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--c4)', marginTop: 2 }}>free</div>
                    </div>
                  </div>
                </div>

                {/* Simple / Advanced tabs */}
                <div style={{ display: 'flex', border: '1px solid var(--c6)', borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
                  {(['simple', 'advanced'] as const).map(tab => (
                    <button key={tab} onClick={() => setAssignTab(tab)} style={{
                      flex: 1, padding: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      fontWeight: 700, fontSize: 13,
                      background: assignTab === tab ? 'var(--navy)' : 'var(--c7)',
                      color: assignTab === tab ? '#fff' : 'var(--c3)',
                    }}>
                      {tab === 'simple' ? 'Simple' : 'Advanced'}
                    </button>
                  ))}
                </div>

                {/* ── Simple tab ── */}
                {assignTab === 'simple' && (() => {
                  const e0 = assignEntries[0]
                  const needsProject = e0.category === 'project' || e0.category === 'maintenance'
                  return (
                    <div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Type</label>
                          <Select
                            value={e0.category}
                            onChange={v => {
                              const cat = v as AllocationCategory
                              const b = CATS.find(c => c.value === cat)?.billable ?? false
                              setAssignEntries(prev => prev.map((e, i) => i === 0 ? { ...e, category: cat, billable: b } : e))
                            }}
                            options={CATS.map(c => ({ value: c.value, label: c.label }))}
                          />
                        </div>
                        {needsProject ? (
                          <div className="form-group">
                            <label className="form-label">Project</label>
                            <Select
                              value={e0.projectId}
                              onChange={v => setAssignEntries(prev => prev.map((e, i) => i === 0 ? { ...e, projectId: v } : e))}
                              options={projectOptions}
                              placeholder="Choose project..."
                              searchable
                            />
                          </div>
                        ) : (
                          <div className="form-group">
                            <label className="form-label">Description</label>
                            <input
                              value={e0.label}
                              onChange={ev => setAssignEntries(prev => prev.map((e, i) => i === 0 ? { ...e, label: ev.target.value } : e))}
                              placeholder={e0.category === 'leave' ? 'e.g. Annual leave' : e0.category === 'meeting' ? 'e.g. Sprint planning' : 'Description'}
                            />
                          </div>
                        )}
                      </div>

                      <div className="form-group">
                        <label className="form-label">Hours this week</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <input
                            type="number" min={1} step={1}
                            value={e0.totalHours}
                            onChange={ev => setAssignEntries(prev => prev.map((e, i) => i === 0 ? { ...e, totalHours: Number(ev.target.value), mode: 'week' } : e))}
                            style={{ width: 80, fontSize: 20, fontWeight: 800, textAlign: 'center' }}
                          />
                          <span style={{ fontSize: 15, color: 'var(--c3)' }}>hours</span>
                          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
                            {[4, 8, 16, 20, 24, 32, 40].map(h => (
                              <button key={h} type="button"
                                className={`btn ${e0.totalHours === h ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                                onClick={() => setAssignEntries(prev => prev.map((e, i) => i === 0 ? { ...e, totalHours: h, mode: 'week' } : e))}
                                style={{ padding: '6px 12px', fontSize: 13 }}
                              >{h}h</button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 8, flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                          <input type="checkbox" checked={e0.recurring}
                            onChange={ev => setAssignEntries(prev => prev.map((e, i) => i === 0 ? { ...e, recurring: ev.target.checked } : e))}
                            style={{ width: 18, height: 18 }} />
                          Repeat weekly
                        </label>
                        {e0.recurring && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                            for <input type="number" value={e0.repeatWeeks}
                              onChange={ev => setAssignEntries(prev => prev.map((e, i) => i === 0 ? { ...e, repeatWeeks: Number(ev.target.value) } : e))}
                              min={2} max={52} style={{ width: 56, textAlign: 'center', fontSize: 14, padding: '6px' }} /> weeks
                          </span>
                        )}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                          <input type="checkbox" checked={e0.billable}
                            onChange={ev => setAssignEntries(prev => prev.map((e, i) => i === 0 ? { ...e, billable: ev.target.checked } : e))}
                            style={{ width: 18, height: 18 }} />
                          Billable
                        </label>
                      </div>

                      <div className="modal-footer" style={{ padding: '16px 0 0', border: 'none' }}>
                        <button className="btn btn-primary" onClick={handleAssign} style={{ height: 44, padding: '0 28px', fontSize: 15, fontWeight: 700, width: '100%' }}>
                          Assign {e0.totalHours}h{e0.recurring ? ' + recurring' : ''}
                        </button>
                      </div>
                    </div>
                  )
                })()}

                {/* ── Advanced tab ── */}
                {assignTab === 'advanced' && (
                  <div>
                    {assignEntries.map((entry, idx) => (
                      <div key={entry.id} style={{ border: '1.5px solid var(--c6)', borderRadius: 12, padding: 20, marginBottom: 16, position: 'relative' }}>
                    {assignEntries.length > 1 && (
                      <button className="btn btn-ghost btn-xs" onClick={() => removeEntry(entry.id)} style={{ position: 'absolute', top: 12, right: 12, color: 'var(--red)', fontSize: 16 }}>&times;</button>
                    )}

                    {idx > 0 && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 12 }}>Allocation {idx + 1}</div>}

                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Type</label>
                        <Select
                          value={entry.category}
                          onChange={v => { const cat = v as AllocationCategory; const b = CATS.find(c => c.value === cat)?.billable ?? false; updateEntry(entry.id, { category: cat, billable: b }) }}
                          options={CATS.map(c => ({ value: c.value, label: c.label }))}
                        />
                      </div>
                      {(entry.category === 'project' || entry.category === 'maintenance') ? (
                        <div className="form-group">
                          <label className="form-label">Project</label>
                          <Select
                            value={entry.projectId}
                            onChange={v => updateEntry(entry.id, { projectId: v })}
                            options={projectOptions}
                            placeholder="Choose project..."
                            searchable
                          />
                        </div>
                      ) : (
                        <div className="form-group">
                          <label className="form-label">Description</label>
                          <input
                            value={entry.label}
                            onChange={e => updateEntry(entry.id, { label: e.target.value })}
                            placeholder={entry.category === 'leave' ? 'e.g. Annual leave' : entry.category === 'meeting' ? 'e.g. Sprint planning' : 'Description'}
                          />
                        </div>
                      )}
                    </div>

                    {/* Mode toggle */}
                    <div className="form-group">
                      <label className="form-label">Allocation mode</label>
                      <div style={{ display: 'flex', gap: 2, background: 'var(--c7)', borderRadius: 10, padding: 3 }}>
                        {(['week', 'day'] as const).map(m => (
                          <button key={m} type="button" onClick={() => updateEntry(entry.id, { mode: m })}
                            style={{
                              flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: entry.mode === m ? 700 : 400,
                              background: entry.mode === m ? '#fff' : 'transparent',
                              color: entry.mode === m ? 'var(--navy)' : 'var(--c4)',
                              boxShadow: entry.mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >{m === 'week' ? 'Per week — auto split' : 'Per day — manual'}</button>
                        ))}
                      </div>
                    </div>

                    {entry.mode === 'week' ? (
                      <div className="form-group">
                        <label className="form-label">Hours this week</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <input type="number" value={entry.totalHours} onChange={e => updateEntry(entry.id, { totalHours: Number(e.target.value) })} min={1} step={1} style={{ width: 80, fontSize: 20, fontWeight: 800, textAlign: 'center' }} />
                          <span style={{ fontSize: 15, color: 'var(--c3)' }}>hours</span>
                          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
                            {[4, 8, 16, 20, 24, 32, 40].map(h => (
                              <button key={h} type="button" className={`btn ${entry.totalHours === h ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                                onClick={() => updateEntry(entry.id, { totalHours: h })}
                                style={{ padding: '6px 12px', fontSize: 13 }}
                              >{h}h</button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="form-group">
                        <label className="form-label">Hours per day</label>
                        <div style={{ display: 'flex', gap: 10 }}>
                          {days.map((d, i) => {
                            const existing = mDayTotal(member.id, d)
                            const planned = entry.dayHours[i]
                            const wouldBe = existing + planned
                            const isOver = wouldBe > member.hours_per_day && planned > 0
                            return (
                              <div key={d} style={{ flex: 1, textAlign: 'center' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c3)', marginBottom: 6 }}>{dayLabel(d)} {dayNum(d)}</div>
                                <input type="number" min={0} max={24} step={1} value={planned}
                                  onChange={e => { const h = [...entry.dayHours]; h[i] = Number(e.target.value); updateEntry(entry.id, { dayHours: h }) }}
                                  style={{ textAlign: 'center', fontSize: 18, fontWeight: 700, padding: '10px 4px', borderColor: isOver ? 'var(--red)' : undefined, color: isOver ? 'var(--red)' : undefined }}
                                />
                                {isOver && <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2, fontWeight: 700 }}>{wouldBe}h total!</div>}
                              </div>
                            )
                          })}
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 14, color: 'var(--c3)', marginTop: 8 }}>
                          Total: <strong>{entry.dayHours.reduce((s, h) => s + h, 0)}h</strong>
                        </div>
                      </div>
                    )}

                    {/* Options row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                        <input type="checkbox" checked={entry.recurring} onChange={e => updateEntry(entry.id, { recurring: e.target.checked })} style={{ width: 18, height: 18 }} />
                        Repeat weekly
                      </label>
                      {entry.recurring && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                          for <input type="number" value={entry.repeatWeeks} onChange={e => updateEntry(entry.id, { repeatWeeks: Number(e.target.value) })} min={2} max={52} style={{ width: 56, textAlign: 'center', fontSize: 14, padding: '6px' }} /> weeks
                        </span>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                        <input type="checkbox" checked={entry.billable} onChange={e => updateEntry(entry.id, { billable: e.target.checked })} style={{ width: 18, height: 18 }} />
                        Billable
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer', marginLeft: 'auto', color: entry.hasDeadline ? 'var(--red)' : undefined }}>
                        <input type="checkbox" checked={entry.hasDeadline} onChange={e => updateEntry(entry.id, { hasDeadline: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--red)' }} />
                        Deadline
                      </label>
                      {entry.hasDeadline && (
                        <input type="date" value={entry.deadlineDate} onChange={e => updateEntry(entry.id, { deadlineDate: e.target.value })} style={{ fontSize: 14, padding: '6px 10px', borderRadius: 'var(--r)', border: '1.5px solid var(--red)', color: 'var(--red)', fontWeight: 600 }} />
                      )}
                    </div>
                      </div>
                    ))}

                    <button className="btn btn-secondary" onClick={() => setAssignEntries(prev => [...prev, newEntry(weekEnd)])} style={{ width: '100%', height: 44, fontSize: 15 }}>
                      + Add another allocation
                    </button>
                  </div>
                )}

              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setAssignFor(null); setAssignTab('simple') }} style={{ height: 44, padding: '0 24px', fontSize: 15 }}>Cancel</button>
                <button className="btn btn-primary" onClick={handleAssign} style={{ height: 44, padding: '0 28px', fontSize: 15, fontWeight: 700 }}>
                  Assign {assignEntries.reduce((s, e) => s + (e.mode === 'week' ? e.totalHours : e.dayHours.reduce((a, b) => a + b, 0)), 0)}h
                  {assignEntries.some(e => e.recurring) ? ' + recurring' : ''}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══════════ BATCH ASSIGN MODAL ═══════════ */}
      {showBatch && (
        <div className="modal-overlay" onClick={() => setShowBatch(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h3>Batch Assign</h3>
              <button className="modal-close" onClick={() => setShowBatch(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Members */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Members</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <button
                    className={`btn btn-xs ${batchMembers.size === allActive.length ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setBatchMembers(batchMembers.size === allActive.length ? new Set() : new Set(allActive.map(m => m.id)))}
                  >All</button>
                  {allActive.map(m => (
                    <button
                      key={m.id}
                      className={`btn btn-xs ${batchMembers.has(m.id) ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setBatchMembers(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n })}
                    >{m.name}</button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Category</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {CATS.map(c => (
                    <button
                      key={c.value}
                      className={`btn btn-xs`}
                      style={{ background: batchCategory === c.value ? c.color : undefined, color: batchCategory === c.value ? '#fff' : c.color, border: `1px solid ${c.color}`, fontWeight: 600 }}
                      onClick={() => { setBatchCategory(c.value); setBatchLabel(''); setBatchProjectId('') }}
                    >{c.label}</button>
                  ))}
                </div>
              </div>

              {/* Label / project */}
              {(batchCategory === 'project' || batchCategory === 'maintenance') ? (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Project</label>
                  <Select value={batchProjectId} onChange={setBatchProjectId} options={projectOptions} placeholder="Select project..." />
                </div>
              ) : (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Label</label>
                  <input value={batchLabel} onChange={e => setBatchLabel(e.target.value)} placeholder={
                    batchCategory === 'meeting' ? 'e.g. Weekly standup' :
                    batchCategory === 'admin' ? 'e.g. Lunch break' :
                    batchCategory === 'internal' ? 'e.g. R&D' : 'Description'
                  } />
                </div>
              )}

              {/* Hours + frequency */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Hours per occurrence</label>
                  <input type="number" min={0.25} max={24} step={0.25} value={batchHours} onChange={e => setBatchHours(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Frequency</label>
                  <select value={batchFreq} onChange={e => setBatchFreq(e.target.value as 'daily' | 'weekly' | 'monthly')}>
                    <option value="daily">Daily (Mon–Fri)</option>
                    <option value="weekly">Weekly (pick day)</option>
                    <option value="monthly">Monthly (pick day of month)</option>
                  </select>
                </div>
              </div>

              {batchFreq === 'weekly' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Day of week</label>
                  <select value={batchWeekDay} onChange={e => setBatchWeekDay(parseInt(e.target.value))}>
                    {['Monday','Tuesday','Wednesday','Thursday','Friday'].map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
              {batchFreq === 'monthly' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Day of month</label>
                  <input type="number" min={1} max={28} value={batchMonthDay} onChange={e => setBatchMonthDay(parseInt(e.target.value) || 1)} />
                </div>
              )}

              {/* Weeks */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Repeat for how many weeks?</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1,2,4,8,12,26,52].map(w => (
                    <button key={w} className={`btn btn-xs ${batchWeeks === w ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setBatchWeeks(w)}>{w === 52 ? '1y' : w === 26 ? '6m' : w === 12 ? '3m' : `${w}w`}</button>
                  ))}
                </div>
              </div>

              {/* Preview summary */}
              <div style={{ background: 'var(--c7)', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: 'var(--c2)' }}>
                <strong>Preview:</strong> {batchMembers.size} member{batchMembers.size !== 1 ? 's' : ''} &middot; {batchHours}h {batchFreq} &middot; {batchWeeks} week{batchWeeks !== 1 ? 's' : ''} = <strong>{(() => {
                  const perWeek = batchFreq === 'daily' ? 5 : 1
                  return batchMembers.size * perWeek * batchWeeks * batchHours
                })()}h total</strong>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowBatch(false)} style={{ height: 44, padding: '0 24px' }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleBatchAssign} disabled={batchSaving} style={{ height: 44, padding: '0 28px', fontWeight: 700 }}>
                {batchSaving ? 'Saving...' : 'Apply to All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ SMART PLAN MODAL ═══════════ */}
      {showSmartPlan && (
        <div className="modal-overlay" onClick={() => !smartLoading && !smartSaving && setShowSmartPlan(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 740, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div>
                <h3>✦ Smart Planning Wizard</h3>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--c4)', fontWeight: 400 }}>Week of {fmtWeekLabel(weekStart)}</p>
              </div>
              <button className="modal-close" onClick={() => setShowSmartPlan(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              {smartLoading && (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--c1)', marginBottom: 6 }}>Analysing deliverables & capacity…</div>
                  <div style={{ fontSize: 13, color: 'var(--c4)' }}>AI is building a schedule based on your team, projects, and deadlines</div>
                </div>
              )}

              {!smartLoading && smartSuggestions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--c4)' }}>
                  <div style={{ fontSize: 14, marginBottom: 16 }}>No suggestions available. Make sure you have deliverables set on your projects.</div>
                  <button className="btn btn-secondary btn-sm" onClick={runSmartPlan}>Try again</button>
                </div>
              )}

              {!smartLoading && smartSuggestions.length > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <span style={{ fontSize: 14, color: 'var(--c3)' }}>{smartSuggestions.length - smartRemovedIdx.size} of {smartSuggestions.length} suggestions selected</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => setSmartRemovedIdx(new Set())}>Select all</button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setSmartRemovedIdx(new Set(smartSuggestions.map((_, i) => i)))}>Clear all</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--c3)', marginBottom: 12 }}>
                    Hours will be distributed evenly across days with available capacity.
                  </div>
                  <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--c6)' }}>
                        <th style={{ width: 32, padding: '8px 4px' }}></th>
                        <th style={{ textAlign: 'left', padding: '8px 8px', color: 'var(--c3)', fontWeight: 700 }}>Member</th>
                        <th style={{ textAlign: 'left', padding: '8px 8px', color: 'var(--c3)', fontWeight: 700 }}>Allocation</th>
                        <th style={{ textAlign: 'right', padding: '8px 8px', color: 'var(--c3)', fontWeight: 700 }}>Weekly h</th>
                        <th style={{ textAlign: 'left', padding: '8px 8px', color: 'var(--c3)', fontWeight: 700 }}>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {smartSuggestions.map((s, i) => {
                        const removed = smartRemovedIdx.has(i)
                        const mem = allActive.find(m => m.id === s.member_id)
                        const proj = projects.find(p => p.id === s.project_id)
                        const ci = catInfo(s.category)
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--c7)', opacity: removed ? 0.35 : 1, background: removed ? undefined : 'transparent', cursor: 'pointer', transition: 'opacity .15s' }}
                            onClick={() => setSmartRemovedIdx(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })}>
                            <td style={{ padding: '10px 4px' }}>
                              <input type="checkbox" checked={!removed} onChange={() => {}} style={{ width: 15, height: 15 }} />
                            </td>
                            <td style={{ padding: '10px 8px', fontWeight: 600 }}>{mem?.name ?? '?'}</td>
                            <td style={{ padding: '10px 8px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: ci.color, flexShrink: 0 }} />
                                {proj ? `${proj.pn} — ${proj.name}` : s.label || ci.label}
                              </span>
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 700 }}>{s.weekly_hours}h</td>
                            <td style={{ padding: '10px 8px', color: 'var(--c4)', fontSize: 12 }}>{s.reason}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--c3)' }}>Total</td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: 800, fontSize: 16 }}>
                          {smartSuggestions.filter((_, i) => !smartRemovedIdx.has(i)).reduce((s, r) => s + r.weekly_hours, 0)}h
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </>
              )}
            </div>
            <div className="modal-footer">
              {!smartLoading && smartSuggestions.length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={runSmartPlan} style={{ marginRight: 'auto' }}>↻ Regenerate</button>
              )}
              <button className="btn btn-secondary" onClick={() => setShowSmartPlan(false)} style={{ height: 44, padding: '0 24px' }}>Cancel</button>
              {!smartLoading && smartSuggestions.length > 0 && (
                <button className="btn btn-primary" onClick={applySmartPlan} disabled={smartSaving || smartRemovedIdx.size === smartSuggestions.length} style={{ height: 44, padding: '0 28px', fontWeight: 700 }}>
                  {smartSaving ? 'Applying...' : `Apply ${smartSuggestions.length - smartRemovedIdx.size} allocations`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ DETAIL MODAL ═══════════ */}
      {detailGroup && (() => {
        const g = detailGroup
        const member = members.find(m => m.id === g.memberId)
        const ci = catInfo(g.category)
        return (
          <div className="modal-overlay" onClick={() => setDetailGroup(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
              <div className="modal-header">
                <h3>{g.projectLabel}</h3>
                <button className="modal-close" onClick={() => setDetailGroup(null)}>&times;</button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
                  <span style={{ padding: '5px 14px', borderRadius: 20, fontSize: 14, fontWeight: 700, background: ci.bg, color: ci.color }}>{ci.label}</span>
                  {g.recurring && <span className="badge badge-blue" style={{ fontSize: 12 }}>↻ Recurring</span>}
                  {g.isDeadlineWeek && <span className="badge badge-red" style={{ fontSize: 12 }}>DEADLINE</span>}
                  {member && <span style={{ fontSize: 14, color: 'var(--c3)' }}>Assigned to <strong>{member.name}</strong></span>}
                </div>

                {g.hasUnplanned && (
                  <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#c2410c', marginBottom: 16 }}>
                    ⚡ This includes unplanned work reported by a team member.
                  </div>
                )}

                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Daily breakdown</div>
                {days.map(d => {
                  const hrs = g.dayHours[d] || 0
                  const aid = g.allocIds[d]
                  return (
                    <div key={d} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--c6)' }}>
                      <span style={{ width: 120, fontSize: 15, fontWeight: 600, color: 'var(--c1)' }}>{dayLabel(d)} {dayNum(d)}</span>
                      <div style={{ flex: 1 }}>
                        {hrs > 0 ? (
                          <span style={{ display: 'inline-block', padding: '6px 18px', borderRadius: 8, fontSize: 16, fontWeight: 800, background: ci.bg, color: ci.color }}>{hrs}h</span>
                        ) : <span style={{ color: 'var(--c5)', fontSize: 14 }}>—</span>}
                      </div>
                      {hrs > 0 && aid && (
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteDay(aid, g, d)} style={{ color: 'var(--red)', fontSize: 13 }}>Remove</button>
                      )}
                    </div>
                  )
                })}
                <div style={{ display: 'flex', alignItems: 'center', padding: '14px 0' }}>
                  <span style={{ width: 120, fontSize: 15, fontWeight: 800 }}>Week total</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--c0)' }}>{g.weekTotal}h</span>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => { deleteGroup(g) }} style={{ color: 'var(--red)', height: 44, padding: '0 20px', fontSize: 14, marginRight: 'auto' }}>
                  {g.recurring ? 'Delete entire series' : 'Delete this week'}
                </button>
                <button className="btn btn-secondary" onClick={() => setDetailGroup(null)} style={{ height: 44, padding: '0 24px', fontSize: 15 }}>Close</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══════════ SMART ALLOCATE WIZARD ═══════════ */}
      {showWizard && (
        <div className="modal-overlay" onClick={() => { if (!wizardLoading && !wizardSaving) { setShowWizard(false); resetWizard() } }}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>✦ Smart Allocate</h3>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--c4)', fontWeight: 400 }}>Monthly AI-powered resource planning</p>
              </div>
              <button className="modal-close" onClick={() => { setShowWizard(false); resetWizard() }}>&times;</button>
            </div>
            <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
              <WizardSteps step={wizardStep} />

              {/* Step 1 — Pick projects */}
              {wizardStep === 1 && (
                <div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c2)' }}>Month:</span>
                    <input type="month" value={wizardMonth} onChange={e => setWizardMonth(e.target.value)}
                      style={{ border: '1px solid var(--c6)', borderRadius: 6, padding: '4px 8px', fontFamily: 'inherit', fontSize: 13 }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {projects.filter(p => p.status === 'active').map(p => {
                      const checked = wizardSelectedProjects.has(p.id)
                      const delivCount = deliverables.filter(d => d.project_id === p.id && d.status === 'active').length
                      return (
                        <div key={p.id} onClick={() => setWizardSelectedProjects(prev => {
                          const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n
                        })} style={{
                          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                          border: checked ? '1.5px solid var(--navy)' : '1px solid var(--c6)',
                          background: checked ? 'var(--navy-light)' : '#fff',
                        }}>
                          <input type="checkbox" checked={checked} onChange={() => {}} style={{ width: 15, height: 15 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)' }}>{p.pn} — {p.name}</div>
                            {delivCount > 0 && <div style={{ fontSize: 11, color: 'var(--c3)' }}>{delivCount} active deliverable{delivCount !== 1 ? 's' : ''}</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Step 2 — Budgets & team */}
              {wizardStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[...wizardSelectedProjects].map(pid => {
                    const proj = projects.find(p => p.id === pid)
                    if (!proj) return null
                    const delivHours = deliverables.filter(d => d.project_id === pid && d.status === 'active')
                      .reduce((s, d) => s + (d.estimated_hours ?? 0), 0)
                    const defaultBudget = delivHours > 0 ? delivHours : 40
                    const budget = wizardBudgets[pid] ?? defaultBudget
                    const memberIds = wizardProjectMembers[pid] ?? []
                    return (
                      <div key={pid} style={{ background: 'var(--c7)', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)', marginBottom: 8 }}>{proj.pn} — {proj.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <label style={{ fontSize: 12, color: 'var(--c3)' }}>Budget (hours):</label>
                          <input type="number" value={budget} min={1} step={0.5}
                            onChange={e => setWizardBudgets(prev => ({ ...prev, [pid]: Number(e.target.value) }))}
                            style={{ width: 70, border: '1px solid var(--c6)', borderRadius: 6, padding: '4px 8px', fontFamily: 'inherit', fontSize: 13 }} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--c3)', marginBottom: 6, fontWeight: 700 }}>TEAM</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {allActive.map(m => {
                            const sel = memberIds.includes(m.id)
                            return (
                              <button key={m.id} onClick={() => setWizardProjectMembers(prev => ({
                                ...prev, [pid]: sel ? memberIds.filter(id => id !== m.id) : [...memberIds, m.id],
                              }))} style={{
                                padding: '4px 10px', borderRadius: 100, fontSize: 12, fontWeight: 600,
                                border: sel ? '1.5px solid var(--navy)' : '1px solid var(--c6)',
                                background: sel ? 'var(--navy-light)' : '#fff',
                                color: sel ? 'var(--navy)' : 'var(--c2)',
                                cursor: 'pointer', fontFamily: 'inherit',
                              }}>{m.name}</button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                  {(() => {
                    const totalBudget = [...wizardSelectedProjects].reduce((s, pid) => s + (wizardBudgets[pid] ?? 40), 0)
                    const allMemberIds = new Set([...wizardSelectedProjects].flatMap(pid => wizardProjectMembers[pid] ?? []))
                    const weekCount = 4
                    const totalCap = [...allMemberIds].reduce((s, mid) => {
                      const m = allActive.find(x => x.id === mid)
                      return s + (m ? m.hours_per_day * 5 * weekCount : 0)
                    }, 0)
                    if (totalBudget > totalCap && totalCap > 0) {
                      return <div className="alert alert-amber" style={{ marginTop: 10, fontSize: 12 }}>
                        ⚠ Total budget ({totalBudget}h) exceeds estimated team capacity ({totalCap}h). Plan may be truncated.
                      </div>
                    }
                    return null
                  })()}
                </div>
              )}

              {/* Step 3 — AI plan */}
              {wizardStep === 3 && (
                <div>
                  {wizardLoading && (
                    <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                      <div style={{ fontSize: 28, marginBottom: 12 }}>✦</div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c1)', marginBottom: 6 }}>Generating allocation plan…</div>
                      <div style={{ fontSize: 13, color: 'var(--c4)' }}>AI is planning {wizardSelectedProjects.size} projects across the month</div>
                    </div>
                  )}
                  {!wizardLoading && wizardPlan.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid var(--c6)' }}>
                            <th style={{ textAlign: 'left', padding: '8px', color: 'var(--c3)', fontWeight: 700 }}>Member</th>
                            {wizardPlan.map(w => (
                              <th key={w.week_start} style={{ textAlign: 'center', padding: '8px', color: 'var(--c3)', fontWeight: 700, minWidth: 100 }}>
                                {new Date(w.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {allActive.filter(m => wizardPlan.some(w => w.allocations.some(a => a.member_id === m.id))).map(m => (
                            <tr key={m.id} style={{ borderBottom: '1px solid var(--c7)' }}>
                              <td style={{ padding: '8px', fontWeight: 700, color: 'var(--c0)' }}>{m.name}</td>
                              {wizardPlan.map(w => {
                                const cellAllocs = w.allocations.filter(a => a.member_id === m.id)
                                return (
                                  <td key={w.week_start} style={{ padding: '8px', verticalAlign: 'top' }}>
                                    {cellAllocs.length === 0
                                      ? <span style={{ color: 'var(--c5)', fontSize: 11 }}>—</span>
                                      : cellAllocs.map(a => {
                                        const proj = projects.find(p => p.id === a.project_id)
                                        return (
                                          <div key={a._id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                            <span style={{ fontSize: 11, color: 'var(--navy)', fontWeight: 600 }}>{proj?.pn ?? '?'}</span>
                                            <input type="number" value={a.weekly_hours} min={0} step={0.5}
                                              onChange={e => {
                                                const val = Number(e.target.value)
                                                setWizardPlan(prev => prev.map(wk =>
                                                  wk.week_start !== w.week_start ? wk : {
                                                    ...wk,
                                                    allocations: wk.allocations.map(al =>
                                                      al._id === a._id ? { ...al, weekly_hours: val } : al
                                                    )
                                                  }
                                                ))
                                              }}
                                              style={{ width: 44, border: '1px solid var(--c6)', borderRadius: 4, padding: '2px 4px', fontSize: 11, fontFamily: 'inherit' }} />
                                            <span style={{ fontSize: 10, color: 'var(--c3)' }}>h</span>
                                          </div>
                                        )
                                      })
                                    }
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {!wizardLoading && wizardPlan.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '32px', color: 'var(--c3)', fontSize: 13 }}>
                      No plan generated. <button className="btn btn-secondary btn-sm" onClick={runWizardAI}>Try again</button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4 — Review & apply */}
              {wizardStep === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[...wizardSelectedProjects].map(pid => {
                    const proj = projects.find(p => p.id === pid)
                    const budget = wizardBudgets[pid] ?? 40
                    const allocated = wizardPlan.flatMap(w => w.allocations)
                      .filter(a => a.project_id === pid)
                      .reduce((s, a) => s + a.weekly_hours, 0)
                    const pct = budget > 0 ? Math.round((allocated / budget) * 100) : 0
                    return (
                      <div key={pid} style={{ background: 'var(--c7)', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{proj?.pn} — {proj?.name}</span>
                          <span style={{ fontSize: 12, color: pct >= 90 ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>{allocated}h / {budget}h ({pct}%)</span>
                        </div>
                        <div style={{ height: 4, background: 'var(--c6)', borderRadius: 2, marginTop: 6 }}>
                          <div style={{ width: `${Math.min(100, pct)}%`, height: 4, background: pct >= 90 ? 'var(--green)' : 'var(--navy)', borderRadius: 2 }} />
                        </div>
                      </div>
                    )
                  })}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" id="wiz-save-tmpl" checked={wizardSaveAsTemplate}
                      onChange={e => {
                        setWizardSaveAsTemplate(e.target.checked)
                        if (e.target.checked && !wizardTemplateName) {
                          const d = new Date(wizardMonth + '-01T00:00:00')
                          setWizardTemplateName(`${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Smart Plan`)
                        }
                      }} />
                    <label htmlFor="wiz-save-tmpl" style={{ fontSize: 13 }}>Save as template</label>
                    {wizardSaveAsTemplate && (
                      <input value={wizardTemplateName} onChange={e => setWizardTemplateName(e.target.value)}
                        style={{ flex: 1, border: '1px solid var(--c6)', borderRadius: 6, padding: '4px 8px', fontFamily: 'inherit', fontSize: 13 }} />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              {wizardStep > 1 && (
                <button className="btn btn-ghost btn-sm" style={{ marginRight: 'auto' }}
                  onClick={() => setWizardStep(s => (s - 1) as 1 | 2 | 3 | 4)}>← Back</button>
              )}
              <button className="btn btn-secondary" onClick={() => { setShowWizard(false); resetWizard() }}>Cancel</button>
              {wizardStep === 1 && (
                <button className="btn btn-primary" disabled={wizardSelectedProjects.size === 0}
                  onClick={() => setWizardStep(2)}>
                  Next: Set budgets →
                </button>
              )}
              {wizardStep === 2 && (
                <button className="btn btn-primary"
                  disabled={[...wizardSelectedProjects].some(pid => !(wizardProjectMembers[pid]?.length > 0))}
                  onClick={() => { setWizardStep(3); runWizardAI() }}>
                  ✦ Generate Plan →
                </button>
              )}
              {wizardStep === 3 && !wizardLoading && wizardPlan.length > 0 && (
                <button className="btn btn-primary" onClick={() => setWizardStep(4)}>
                  Review & Apply →
                </button>
              )}
              {wizardStep === 4 && (
                <button className="btn btn-primary" disabled={wizardSaving}
                  onClick={handleWizardApply}>
                  {wizardSaving ? 'Applying…' : 'Apply plan'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ SAVE TEMPLATE MODAL ═══════════ */}
      {showSaveTemplate && (
        <div className="modal-overlay" onClick={() => setShowSaveTemplate(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Save week as template</h3>
              <button className="modal-close" onClick={() => setShowSaveTemplate(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Template name</label>
                <input className="form-input" value={saveTemplateName}
                  onChange={e => setSaveTemplateName(e.target.value)} />
              </div>
              <div style={{ marginTop: 12 }}>
                {(() => {
                  const grps: Record<string, number> = {}
                  for (const a of allocations) {
                    const proj = a.project as { pn?: string; name?: string } | null
                    const label = proj ? `${proj.pn} — ${proj.name}` : (a as { label?: string }).label ?? a.category
                    const m = allActive.find(x => x.id === a.member_id)
                    const key = `${m?.name ?? '?'} — ${label}`
                    grps[key] = (grps[key] || 0) + a.hours
                  }
                  return Object.entries(grps).map(([key, h]) => (
                    <div key={key} style={{ fontSize: 13, color: 'var(--c2)', padding: '3px 0' }}>
                      {key}: <strong>{h}h</strong>
                    </div>
                  ))
                })()}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowSaveTemplate(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!saveTemplateName.trim()} onClick={async () => {
                const entryGroups: Record<string, TemplateEntry> = {}
                for (const a of allocations) {
                  const key = `${a.member_id}::${a.project_id ?? a.category}`
                  if (!entryGroups[key]) {
                    const m = allActive.find(x => x.id === a.member_id)
                    const proj = a.project as { pn?: string; name?: string } | null
                    entryGroups[key] = {
                      member_id: a.member_id,
                      member_name: m?.name ?? '?',
                      project_id: a.project_id ?? null,
                      project_label: proj ? `${proj.pn} — ${proj.name}` : (a as { label?: string }).label ?? a.category,
                      category: a.category,
                      weekly_hours: 0,
                      is_billable: a.is_billable,
                    }
                  }
                  entryGroups[key].weekly_hours += a.hours
                }
                await saveTemplate(saveTemplateName.trim(), Object.values(entryGroups))
                setShowSaveTemplate(false)
              }}>Save template</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
