import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { TeamMember, ResourceAllocation, ResourceConfirmation, AllocationCategory } from '../lib/types'
import { generatePPSCsv, downloadCsv } from '../lib/exportPPS'
import { toast } from '../lib/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '../components/Modal'

// ─── Utility functions ────────────────────────────────────────────────────────

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getOffsetMonday(offset: number): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day) + offset * 7)
  return localDate(d)
}

function getWeekDays(monday: string): string[] {
  const d = new Date(monday + 'T00:00:00')
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
    return localDate(x)
  })
}

function formatWeekRange(monday: string): string {
  const mon = new Date(monday + 'T00:00:00')
  const fri = new Date(mon)
  fri.setDate(mon.getDate() + 4)
  const mStr = mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const fStr = fri.toLocaleDateString('en-US', { day: 'numeric' })
  return `${mStr}–${fStr}, ${fri.getFullYear()}`
}

function getTeamMemberStatus(
  memberId: string,
  days: string[],
  alloc: Array<{ member_id: string; date: string; hours: number }>,
  cap: number
): 'ok' | 'busy' | 'light' {
  const total = alloc.filter(a => a.member_id === memberId && days.includes(a.date)).reduce((s, a) => s + a.hours, 0)
  const maxCap = days.length * cap
  const pct = maxCap > 0 ? total / maxCap : 0
  if (pct >= 0.9) return 'busy'
  if (pct < 0.3) return 'light'
  return 'ok'
}

// ─── DayPill ─────────────────────────────────────────────────────────────────

function DayPill({ dateStr, label, hours, capacity, status, isSelected, isToday, onClick }: {
  dateStr: string; label: string; hours: number; capacity: number
  status: 'confirmed' | 'delayed' | null; isSelected: boolean; isToday: boolean
  onClick: () => void
}) {
  const pct = Math.min(1, capacity > 0 ? hours / capacity : 0)
  const barColor =
    status === 'confirmed' ? 'var(--green)'
    : status === 'delayed' ? 'var(--amber)'
    : isToday ? 'var(--navy)'
    : 'var(--c5)'
  const borderLeftColor =
    status === 'confirmed' ? 'var(--green)'
    : status === 'delayed' ? 'var(--amber)'
    : isToday ? 'var(--navy)'
    : 'transparent'

  return (
    <div
      onClick={onClick}
      className={`px-[10px] py-[9px] rounded-lg cursor-pointer mb-1 transition-all ${
        isSelected
          ? 'bg-[var(--navy-light)] border-[1.5px] border-[var(--navy-muted)]'
          : 'bg-transparent border-[1.5px] border-transparent'
      }`}
      style={{ borderLeftColor: isSelected ? 'var(--navy-muted)' : borderLeftColor, borderLeftWidth: '3px' }}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-[var(--c1)]'}`}>{label}</div>
          <div className="text-[10px] text-muted-foreground mt-[1px]">{dateStr}{isToday ? ' · Today' : ''}</div>
        </div>
        {status === 'confirmed' && <span className="text-[10px] font-bold text-[#16a34a]">✓</span>}
        {status === 'delayed' && <span className="text-[10px] font-bold text-[#d97706]">⚠</span>}
      </div>
      <div className="flex items-center gap-[5px] mt-[5px]">
        <div className="flex-1 h-[3px] bg-[var(--c6)] rounded-sm">
          <div style={{ width: `${pct * 100}%`, height: 3, borderRadius: 2, background: barColor }} />
        </div>
        <span className={`text-[10px] font-semibold whitespace-nowrap ${hours > capacity ? 'text-[#dc2626]' : 'text-muted-foreground'}`}>
          {hours}h{hours > capacity ? '!' : ''}
        </span>
      </div>
    </div>
  )
}

// ─── HourChips ───────────────────────────────────────────────────────────────

function HourChips({ planned, actual, onChange }: { planned: number; actual: number; onChange: (h: number) => void }) {
  const options: number[] = []
  for (let h = Math.max(0.5, planned - 2); h <= planned + 3; h += 0.5) {
    options.push(Math.round(h * 2) / 2)
  }
  const unique = [...new Set(options)]
  return (
    <div className="flex flex-wrap gap-[5px] mt-2">
      {unique.map(h => {
        const isSelected = h === actual
        const isPlanned = h === planned
        const isLess = h < planned
        const isMore = h > planned
        let bg = 'var(--c7)', color = 'var(--c2)', border = 'var(--c6)'
        if (isSelected && isPlanned) { bg = 'var(--navy-light)'; color = 'var(--navy)'; border = 'var(--navy-muted)' }
        else if (isSelected && isLess) { bg = 'var(--amber-bg)'; color = 'var(--amber)'; border = 'var(--amber-border)' }
        else if (isSelected && isMore) { bg = 'var(--blue-bg)'; color = 'var(--blue)'; border = 'var(--blue-border)' }
        return (
          <button
            key={h}
            onClick={() => onChange(h)}
            className="px-3 py-[5px] rounded-full text-xs font-bold cursor-pointer"
            style={{ border: `1.5px solid ${border}`, background: bg, color, fontFamily: 'inherit' }}
          >
            {h}h{isPlanned && !isSelected ? ' ✓' : ''}
          </button>
        )
      })}
    </div>
  )
}

// ─── MyWeekView ──────────────────────────────────────────────────────────────

export function MyWeekView() {
  const { token } = useParams<{ token: string }>()
  const [member, setMember] = useState<TeamMember | null>(null)
  const [allocations, setAllocations] = useState<ResourceAllocation[]>([])
  const [confirmations, setConfirmations] = useState<ResourceConfirmation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [showUnplanned, setShowUnplanned] = useState(false)
  const [unplannedProject, setUnplannedProject] = useState('')
  const [unplannedHours, setUnplannedHours] = useState(2)
  const [unplannedDesc, setUnplannedDesc] = useState('')
  const [projectList, setProjectList] = useState<Array<{ id: string; pn: string; name: string }>>([])

  // New state
  const [selectedDate, setSelectedDate] = useState(() => localDate(new Date()))
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; hours_per_day: number }>>([])
  const [teamAllocations, setTeamAllocations] = useState<Array<{ member_id: string; date: string; hours: number }>>([])
  const [actualMap] = useState<Record<string, number>>({})
  const [noteMap] = useState<Record<string, string>>({})
  const [projectDailyInputs, setProjectDailyInputs] = useState<Record<string, number>>({})
  const [eodLoading, setEodLoading] = useState(false)
  const [aiOptions, setAiOptions] = useState<Array<{ id: string; title: string; description: string; impact: string }>>([])
  const [aiInsights, setAiInsights] = useState<Array<{ label: string; text: string }>>([])
  const [aiLoading, setAiLoading] = useState(false)
  const [unplannedQuery, setUnplannedQuery] = useState('')
  const [selectedAiOption, setSelectedAiOption] = useState<string | null>(null)

  const today = localDate(new Date())
  const weekStart = getOffsetMonday(weekOffset)
  const weekDays = getWeekDays(weekStart)
  const weekEnd = weekDays[4]

  const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.from('projects').select('id, pn, name').eq('status', 'active').order('pn')
      .then(({ data }) => setProjectList(data ?? []))
  }, [])

  useEffect(() => {
    if (!token) { setError('No token provided'); setLoading(false); return }

    async function load() {
      setLoading(true)
      const { data: m, error: mErr } = await supabase
        .from('team_members').select('*').eq('share_token', token).single()
      if (mErr || !m) { setError('Invalid or expired link'); setLoading(false); return }
      setMember(m as TeamMember)

      const [allocRes, confRes] = await Promise.all([
        supabase.from('resource_allocations')
          .select('*, project:projects(id, pn, name)')
          .eq('member_id', m.id).gte('date', weekStart).lte('date', weekEnd).order('date'),
        supabase.from('resource_confirmations')
          .select('*').eq('member_id', m.id).gte('date', weekStart).lte('date', weekEnd),
      ])
      if (allocRes.data) setAllocations(allocRes.data as ResourceAllocation[])
      if (confRes.data) setConfirmations(confRes.data as ResourceConfirmation[])
      setLoading(false)
    }

    load()
  }, [token, weekStart, weekEnd])

  useEffect(() => {
    if (!member) return
    Promise.all([
      supabase.from('team_members').select('id, name, hours_per_day').eq('active', true).order('display_order'),
      supabase.from('resource_allocations').select('member_id, date, hours').gte('date', weekStart).lte('date', weekEnd),
    ]).then(([membersRes, allocRes]) => {
      if (membersRes.data) setTeamMembers(membersRes.data)
      if (allocRes.data) setTeamAllocations(allocRes.data)
    })
  }, [member, weekStart, weekEnd])

  // Reset daily inputs when date changes
  useEffect(() => {
    const inputs: Record<string, number> = {}
    for (const a of allocations.filter(x => x.date === selectedDate)) {
      const key = a.project_id || `${a.category}:${a.label || ''}`
      inputs[key] = (inputs[key] || 0) + a.hours
    }
    setProjectDailyInputs(inputs)
  }, [selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Computed values ────────────────────────────────────────────────────────

  const matchedProject = useMemo(() => {
    if (!unplannedQuery.trim()) return null
    const q = unplannedQuery.toLowerCase()
    const scored = projectList
      .map(p => {
        const haystack = `${p.pn} ${p.name}`.toLowerCase()
        const score = haystack.includes(q) ? 1 : q.split(' ').filter(w => w && haystack.includes(w)).length / Math.max(1, q.split(' ').filter(Boolean).length)
        return { ...p, score }
      })
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
    return scored[0] ?? null
  }, [unplannedQuery, projectList])

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function markDelayed(date: string) {
    if (!member) return
    const { error: delayErr } = await supabase.from('resource_confirmations').upsert(
      { member_id: member.id, date, status: 'delayed', delay_reason: null },
      { onConflict: 'member_id,date' }
    )
    if (delayErr) { toast('error', 'Failed to save: ' + delayErr.message); return }
    setConfirmations(prev => [
      ...prev.filter(c => c.date !== date),
      { id: '', member_id: member.id, date, status: 'delayed', delay_reason: null, confirmed_at: new Date().toISOString() },
    ])
  }

  async function handleEodSubmit() {
    if (!member) return
    setEodLoading(true)
    const snapDate = selectedDate

    // Save actuals for existing today allocations (distribute project input across multiple allocs proportionally)
    const inserts = selectedAllocs.map(a => {
      const key = a.project_id || `${a.category}:${a.label || ''}`
      const todayPlannedForKey = weekProjectList.find(g => g.key === key)?.todayPlanned ?? a.hours
      const userInput = projectDailyInputs[key] ?? todayPlannedForKey
      const ratio = todayPlannedForKey > 0 ? a.hours / todayPlannedForKey : 1
      return {
        allocation_id: a.id,
        member_id: member.id,
        date: snapDate,
        actual_hours: Math.max(0, Math.round(userInput * ratio * 2) / 2),
        note: noteMap[a.id] || null,
      }
    })
    if (inserts.length > 0) {
      const { error: actualsErr } = await supabase.from('allocation_actuals').upsert(inserts, { onConflict: 'allocation_id' })
      if (actualsErr) { toast('error', 'Failed to save actuals: ' + actualsErr.message); setEodLoading(false); return }
    }

    // Create unplanned allocations for extra work on week projects not originally today
    const extras = weekProjectList.filter(g => g.todayPlanned === 0 && (projectDailyInputs[g.key] ?? 0) > 0)
    for (const g of extras) {
      const hours = projectDailyInputs[g.key]
      const { data: newAlloc } = await supabase.from('resource_allocations').insert({
        member_id: member.id,
        project_id: g.projectId,
        category: g.category,
        date: snapDate,
        hours,
        is_unplanned: true,
        is_billable: g.category === 'project' || g.category === 'maintenance',
      }).select().single()
      if (newAlloc) {
        await supabase.from('allocation_actuals').insert({
          allocation_id: newAlloc.id,
          member_id: member.id,
          date: snapDate,
          actual_hours: hours,
        })
      }
    }

    const { error: confErr } = await supabase.from('resource_confirmations').upsert(
      { member_id: member.id, date: snapDate, status: 'confirmed' },
      { onConflict: 'member_id,date' }
    )
    if (confErr) { toast('error', 'Failed to confirm day: ' + confErr.message); setEodLoading(false); return }

    // Reload allocations to include any newly created ones
    const { data: freshAllocs } = await supabase.from('resource_allocations')
      .select('*, project:projects(id, pn, name)')
      .eq('member_id', member.id).gte('date', weekStart).lte('date', weekEnd).order('date')
    if (freshAllocs) setAllocations(freshAllocs as ResourceAllocation[])

    setConfirmations(prev => [
      ...prev.filter(c => c.date !== snapDate),
      { id: '', member_id: member.id, date: snapDate, status: 'confirmed', delay_reason: null, confirmed_at: new Date().toISOString() },
    ])
    toast('success', 'Day confirmed!')

    const hasDeltas = weekProjectList.some(g =>
      Math.abs((projectDailyInputs[g.key] ?? g.todayPlanned) - g.todayPlanned) > 0.1
    )
    if (hasDeltas || extras.length > 0) await fetchAiAdvice(selectedAllocs, snapDate)
    setEodLoading(false)
  }

  async function fetchAiAdvice(selectedAllocsArg: ResourceAllocation[], snapDate: string) {
    if (!member) return
    setAiLoading(true)
    const today_tasks = selectedAllocsArg.map(a => ({
      id: a.id,
      project_name: a.project?.name ?? a.label ?? a.category,
      category: a.category,
      planned_hours: a.hours,
      actual_hours: actualMap[a.id] ?? null,
      note: noteMap[a.id] || undefined,
    }))
    const remaining_week = allocations
      .filter(a => a.date > snapDate)
      .map(a => ({
        date: a.date,
        project_name: a.project?.name ?? a.label ?? a.category,
        category: a.category,
        hours: a.hours,
      }))

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/day-advisor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          member_name: member.name,
          date: selectedDate,
          capacity_hours: member.hours_per_day,
          today_tasks,
          remaining_week,
        }),
      })
      const json = await res.json()
      setAiOptions(json.reschedule_options ?? [])
      setAiInsights(json.insights ?? [])
    } catch { /* silent fail — AI panel shows empty state */ }
    setAiLoading(false)
  }

  async function handleReportUnplanned(categoryOverride: AllocationCategory = 'project') {
    if (!member) return
    const { error: insErr } = await supabase.from('resource_allocations').insert({
      member_id: member.id,
      project_id: unplannedProject || null,
      category: categoryOverride,
      date: selectedDate,
      hours: unplannedHours,
      label: unplannedDesc || null,
      is_unplanned: true,
      is_billable: true,
    })
    if (insErr) { toast('error', 'Failed to save: ' + insErr.message); return }
    const { data } = await supabase.from('resource_allocations')
      .select('*, project:projects(id, pn, name)')
      .eq('member_id', member.id).gte('date', weekStart).lte('date', weekEnd).order('date')
    if (data) setAllocations(data as ResourceAllocation[])
    toast('success', 'Unplanned work logged!')
    setShowUnplanned(false)
    setUnplannedProject('')
    setUnplannedHours(2)
    setUnplannedDesc('')
    setUnplannedQuery('')
  }

  function handleExportPPS() {
    if (!member) return
    const csv = generatePPSCsv(allocations, member.name)
    const filename = `PPS_${member.name.replace(/\s+/g, '_')}_${weekStart}.csv`
    downloadCsv(csv, filename)
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedAllocs = allocations.filter(a => a.date === selectedDate)
  const selectedConf = confirmations.find(c => c.date === selectedDate)
  const isFutureDay = selectedDate > today
  const isConfirmed = selectedConf?.status === 'confirmed'

  const weekConfirmedHours = allocations
    .filter(a => confirmations.some(c => c.date === a.date && c.status === 'confirmed'))
    .reduce((s, a) => s + (actualMap[a.id] ?? a.hours), 0)

  const todayHours = allocations.filter(a => a.date === today).reduce((s, a) => s + a.hours, 0)

  const weekBillableHours = allocations.filter(a => a.is_billable).reduce((s, a) => s + a.hours, 0)
  const weekTotalHours = allocations.reduce((s, a) => s + a.hours, 0)
  const billablePct = weekTotalHours > 0 ? Math.round((weekBillableHours / weekTotalHours) * 100) : 0

  const delayedDaysCount = confirmations.filter(c => c.status === 'delayed').length

  const capacity = member?.hours_per_day ?? 8

  // All unique projects for this week, today's planned hours first
  const weekProjectList = useMemo(() => {
    type Entry = { key: string; projectId: string | null; label: string; category: AllocationCategory; todayPlanned: number; todayAllocIds: string[] }
    const map = new Map<string, Entry>()
    for (const a of selectedAllocs) {
      const key = a.project_id || `${a.category}:${a.label || ''}`
      if (!map.has(key)) {
        const label = a.project ? `${a.project.pn} — ${a.project.name}` : a.label || a.category
        map.set(key, { key, projectId: a.project_id || null, label, category: a.category as AllocationCategory, todayPlanned: 0, todayAllocIds: [] })
      }
      const g = map.get(key)!
      g.todayPlanned += a.hours
      g.todayAllocIds.push(a.id)
    }
    for (const a of allocations) {
      if (a.date === selectedDate) continue
      const key = a.project_id || `${a.category}:${a.label || ''}`
      if (!map.has(key)) {
        const label = a.project ? `${a.project.pn} — ${a.project.name}` : a.label || a.category
        map.set(key, { key, projectId: a.project_id || null, label, category: a.category as AllocationCategory, todayPlanned: 0, todayAllocIds: [] })
      }
    }
    return [...map.values()].sort((a, b) => b.todayPlanned - a.todayPlanned)
  }, [allocations, selectedAllocs, selectedDate])

  // Per-project week totals (planned vs confirmed)
  const weekProjectProgress = useMemo(() => {
    type PEntry = { key: string; label: string; category: AllocationCategory; planned: number; done: number }
    const map = new Map<string, PEntry>()
    for (const a of allocations) {
      const key = a.project_id || `${a.category}:${a.label || ''}`
      if (!map.has(key)) {
        const label = a.project ? `${a.project.pn} — ${a.project.name}` : a.label || a.category
        map.set(key, { key, label, category: a.category as AllocationCategory, planned: 0, done: 0 })
      }
      const g = map.get(key)!
      g.planned += a.hours
      if (confirmations.some(c => c.date === a.date && c.status === 'confirmed')) {
        g.done += actualMap[a.id] ?? a.hours
      }
    }
    return [...map.values()].sort((a, b) => b.planned - a.planned)
  }, [allocations, confirmations, actualMap])

  const teamOverloaded = teamMembers.filter(tm => {
    if (!member || tm.id === member.id) return false
    const status = getTeamMemberStatus(tm.id, weekDays, teamAllocations, tm.hours_per_day)
    return status === 'busy'
  })

  const firstName = member?.name.split(' ')[0] ?? ''

  // ── Loading / Error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg)]">
        <div className="text-sm text-muted-foreground font-semibold">Loading your week…</div>
      </div>
    )
  }
  if (error || !member) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg)]">
        <div className="text-center">
          <div className="text-lg font-extrabold text-foreground mb-2">Link not found</div>
          <div className="text-sm text-muted-foreground">{error ?? 'This link may be invalid or expired.'}</div>
        </div>
      </div>
    )
  }

  // ── Main render (member is non-null here) ──────────────────────────────────

  const initials = member.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div
      className="grid h-screen bg-[var(--bg)] overflow-hidden"
      style={{ gridTemplateColumns: '220px 1fr 280px', gridTemplateRows: '52px 1fr', fontFamily: "'Figtree', sans-serif" }}
    >

      {/* ── TOPBAR ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between bg-white border-b border-[var(--c6)] px-[18px] gap-3"
        style={{ gridColumn: '1 / -1', gridRow: '1' }}
      >
        {/* Left: avatar + greeting + week nav */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-[11px] font-extrabold flex-shrink-0">
            {initials}
          </div>
          <div>
            <div className="text-sm font-extrabold text-foreground leading-tight">Hi, {firstName}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">
              {new Date(today + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div className="w-px h-6 bg-[var(--c6)] mx-1" />
          {/* Week nav */}
          <div className="flex items-center gap-[6px]">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                const m = getOffsetMonday(weekOffset - 1)
                setWeekOffset(w => w - 1)
                setSelectedDate(getWeekDays(m)[0])
              }}
            >← Prev</Button>
            <span className="text-xs font-semibold text-[var(--c2)] min-w-[110px] text-center">
              {formatWeekRange(weekStart)}
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                const m = getOffsetMonday(weekOffset + 1)
                setWeekOffset(w => w + 1)
                setSelectedDate(getWeekDays(m)[0])
              }}
            >Next →</Button>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleExportPPS}>Export PPS</Button>
          <Button
            variant="outline"
            size="sm"
            className="border-[var(--red-border)] bg-[var(--red-bg)] text-[var(--red)] hover:bg-[var(--red-bg)]"
            onClick={() => { setShowUnplanned(true); setUnplannedQuery('leave') }}
          >
            🤒 Report sick
          </Button>
        </div>
      </div>

      {/* ── LEFT SIDEBAR ───────────────────────────────────────────────────── */}
      <div
        className="bg-white border-r border-[var(--c6)] overflow-y-auto px-[10px] py-3"
        style={{ gridColumn: '1', gridRow: '2' }}
      >
        {/* This week label */}
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.08em] mb-[6px] pl-[2px]">
          This week
        </div>

        {weekDays.map((day, i) => {
          const dayHours = allocations.filter(a => a.date === day).reduce((s, a) => s + a.hours, 0)
          const conf = confirmations.find(c => c.date === day)
          const status = conf ? (conf.status === 'confirmed' ? 'confirmed' : 'delayed') as 'confirmed' | 'delayed' : null
          return (
            <DayPill
              key={day}
              dateStr={day}
              label={DAY_LABELS[i]}
              hours={dayHours}
              capacity={capacity}
              status={status}
              isSelected={selectedDate === day}
              isToday={day === today}
              onClick={() => setSelectedDate(day)}
            />
          )
        })}

        {/* Divider */}
        <div className="h-px bg-[var(--c6)] my-[10px]" />

        {/* Team section */}
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.08em] mb-[6px] pl-[2px]">
          Team
        </div>

        {teamMembers.filter(tm => tm.id !== member.id).map(tm => {
          const status = getTeamMemberStatus(tm.id, weekDays, teamAllocations, tm.hours_per_day)
          const tmInitials = tm.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
          return (
            <div key={tm.id} className="flex items-center gap-2 px-1 py-[6px] rounded">
              <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[9px] font-extrabold flex-shrink-0">
                {tmInitials}
              </div>
              <span className="text-xs font-semibold text-[var(--c1)] flex-1 truncate">{tm.name}</span>
              {status === 'ok' && <Badge variant="green" className="text-[9px] px-[6px] py-[2px]">ok</Badge>}
              {status === 'busy' && <Badge variant="amber" className="text-[9px] px-[6px] py-[2px]">busy</Badge>}
              {status === 'light' && <Badge variant="gray" className="text-[9px] px-[6px] py-[2px]">light</Badge>}
            </div>
          )
        })}
      </div>

      {/* ── MAIN PANEL ─────────────────────────────────────────────────────── */}
      <div
        className="overflow-y-auto px-6 py-5 flex flex-col gap-4"
        style={{ gridColumn: '2', gridRow: '2' }}
      >
        {/* Day title */}
        <div>
          <div className="text-xl font-extrabold tracking-tight text-foreground">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div className="text-[13px] text-muted-foreground mt-[2px]">
            {isConfirmed
              ? '✓ Day confirmed'
              : selectedConf?.status === 'delayed'
                ? '⚠ Marked as delayed'
                : isFutureDay
                  ? 'Future day'
                  : selectedAllocs.length === 0
                    ? 'No work planned'
                    : `${selectedAllocs.reduce((s, a) => s + a.hours, 0)}h planned · not yet confirmed`}
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-[10px]">
          {[
            { label: 'Confirmed hours', value: `${weekConfirmedHours}h`, isRed: false },
            { label: 'Today planned', value: `${todayHours}h`, isRed: todayHours > capacity },
            { label: 'Billable %', value: `${billablePct}%`, isRed: false },
            { label: 'Delayed days', value: `${delayedDaysCount}`, isRed: delayedDaysCount > 0 },
          ].map(stat => (
            <div key={stat.label} className="bg-white/70 backdrop-blur-sm border border-[var(--c6)] rounded-[10px] px-[14px] py-[10px]">
              <div className="text-[10px] text-muted-foreground font-semibold mb-1">{stat.label}</div>
              <div className={`text-xl font-extrabold ${stat.isRed ? 'text-[#dc2626]' : 'text-foreground'}`}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Weekly project progress */}
        {weekProjectProgress.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.08em]">
              This week — project progress
            </div>
            {weekProjectProgress.map(g => {
              const remaining = Math.max(0, g.planned - g.done)
              const pct = g.planned > 0 ? Math.min(1, g.done / g.planned) : 0
              return (
                <div key={g.key} className="flex items-center gap-[10px]">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[var(--c1)] truncate">{g.label}</div>
                    <div className="flex items-center gap-[6px] mt-[3px]">
                      <div className="flex-1 h-1 bg-[var(--c6)] rounded-sm">
                        <div style={{ width: `${pct * 100}%`, height: 4, borderRadius: 2, background: pct >= 1 ? 'var(--green)' : 'var(--navy)', transition: 'width .3s' }} />
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {g.done}h / {g.planned}h
                        {remaining > 0 && <span className="text-[#d97706] font-bold"> · {remaining}h left</span>}
                        {pct >= 1 && <span className="text-[#16a34a] font-bold"> · done</span>}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* EOD check-in / task view */}
        {isConfirmed ? (
          <div className="flex flex-col gap-[10px]">
            <div className="bg-[var(--green-bg)] border border-[var(--green-border)] rounded-[10px] px-[14px] py-[10px] flex items-center gap-2">
              <span className="text-base">✓</span>
              <span className="text-[13px] font-bold text-[#16a34a]">Day confirmed</span>
            </div>
            {weekProjectList.filter(g => g.todayPlanned > 0 || (projectDailyInputs[g.key] ?? 0) > 0).map(g => (
              <div key={g.key} className="rounded-[10px] border border-[var(--c6)] px-[14px] py-[10px] flex items-center gap-[10px]">
                <div className="w-[3px] rounded-sm bg-[#16a34a] flex-shrink-0 self-stretch" />
                <div className="flex-1">
                  <div className="text-[13px] font-bold text-foreground">{g.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-[2px]">
                    {projectDailyInputs[g.key] ?? g.todayPlanned}h confirmed
                    {g.todayPlanned > 0 && Math.abs((projectDailyInputs[g.key] ?? g.todayPlanned) - g.todayPlanned) > 0.1 && (
                      <span className="ml-[6px] text-[#d97706] font-semibold">(planned {g.todayPlanned}h)</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : isFutureDay ? (
          <div className="text-[13px] text-muted-foreground py-3">No check-in needed for future days.</div>
        ) : weekProjectList.length === 0 ? (
          <div className="text-[13px] text-muted-foreground py-3">No work planned for this day.</div>
        ) : (
          <div className="flex flex-col gap-[10px]">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.08em]">
              End of day check-in — how many hours did you work?
            </div>

            {weekProjectList.map(g => {
              const actual = projectDailyInputs[g.key] ?? g.todayPlanned
              const changed = Math.abs(actual - g.todayPlanned) > 0.01
              const delta = actual - g.todayPlanned
              const isExtra = g.todayPlanned === 0
              return (
                <div
                  key={g.key}
                  className="rounded-[10px] px-[14px] py-3 flex gap-3"
                  style={{
                    background: isExtra && actual > 0 ? 'var(--blue-bg)' : changed ? 'var(--amber-bg)' : '#fff',
                    border: isExtra && actual > 0 ? '1px solid var(--blue-border)' : changed ? '1px solid var(--amber-border)' : '1px solid var(--c6)',
                  }}
                >
                  <div style={{ width: 3, borderRadius: 3, background: isExtra ? 'var(--blue)' : 'var(--navy)', flexShrink: 0, alignSelf: 'stretch' }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-bold text-foreground">{g.label}</span>
                      {isExtra
                        ? <span className="text-[11px] text-primary font-semibold">not planned today</span>
                        : <span className="text-[11px] text-muted-foreground">Planned: {g.todayPlanned}h</span>
                      }
                      {!isExtra && changed && (
                        <span
                          className="text-[11px] font-bold rounded-full px-2 py-[2px]"
                          style={{
                            color: delta < 0 ? 'var(--amber)' : 'var(--blue)',
                            background: delta < 0 ? 'var(--amber-bg)' : 'var(--blue-bg)',
                            border: `1px solid ${delta < 0 ? 'var(--amber-border)' : 'var(--blue-border)'}`,
                          }}
                        >
                          {delta > 0 ? '+' : ''}{delta}h vs plan
                        </span>
                      )}
                    </div>
                    <HourChips
                      planned={g.todayPlanned}
                      actual={actual}
                      onChange={h => setProjectDailyInputs(prev => ({ ...prev, [g.key]: h }))}
                    />
                  </div>
                </div>
              )
            })}

            {/* Report unplanned trigger */}
            <div
              onClick={() => setShowUnplanned(true)}
              className="rounded-[10px] border-[1.5px] border-dashed border-[var(--red-border)] px-[14px] py-[10px] flex items-center gap-2 cursor-pointer text-[#dc2626] text-xs font-bold"
            >
              ⚡ Report unplanned work
            </div>

            {/* Submit row */}
            <div className="flex gap-2 items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => markDelayed(selectedDate)}
              >
                Mark delayed
              </Button>
              <Button
                size="sm"
                onClick={handleEodSubmit}
                disabled={eodLoading}
              >
                {eodLoading ? 'Saving…' : 'Submit →'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT AI PANEL ─────────────────────────────────────────────────── */}
      <div
        className="border-l border-[var(--c6)] overflow-y-auto px-[14px] py-4 bg-white"
        style={{ gridColumn: '3', gridRow: '2' }}
      >
        {/* Header */}
        <div className="flex items-start gap-2 mb-[14px]">
          <div className="w-7 h-7 rounded bg-primary text-white flex items-center justify-center text-sm flex-shrink-0">✦</div>
          <div>
            <div className="text-[13px] font-extrabold text-foreground">AI Advisor</div>
            <div className="text-[11px] text-muted-foreground">Updates after check-in</div>
          </div>
        </div>

        {/* Team overload alert */}
        {teamOverloaded.length > 0 && (
          <div className="bg-[var(--amber-bg)] border border-[var(--amber-border)] rounded-lg px-3 py-[10px] mb-3">
            <div className="text-[11px] font-bold text-[#d97706] mb-1">⚠ Team overload</div>
            <div className="text-[11px] text-[var(--c2)]">
              {teamOverloaded.map(tm => tm.name).join(', ')} {teamOverloaded.length === 1 ? 'is' : 'are'} at ≥90% capacity this week.
            </div>
          </div>
        )}

        {aiLoading && (
          <div className="bg-[var(--navy-light)] rounded-lg px-[14px] py-3 mb-3 flex items-center gap-2">
            <span className="text-sm text-primary">✦</span>
            <span className="text-xs font-semibold text-primary">Analyzing changes…</span>
          </div>
        )}

        {!aiLoading && aiOptions.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.08em] mb-2">
              Reschedule options
            </div>
            {aiOptions.map(opt => (
              <div
                key={opt.id}
                onClick={() => setSelectedAiOption(prev => prev === opt.id ? null : opt.id)}
                className="rounded-lg px-3 py-[10px] mb-2 cursor-pointer transition-all"
                style={{
                  border: selectedAiOption === opt.id ? '1.5px solid var(--navy-muted)' : '1px solid var(--c6)',
                  background: selectedAiOption === opt.id ? 'var(--navy-light)' : '#fff',
                }}
              >
                <div className="text-xs font-bold text-foreground mb-[2px]">{opt.title}</div>
                <div className="text-[11px] text-[var(--c2)] mb-1">{opt.description}</div>
                <div className="text-[10px] text-primary font-semibold">{opt.impact}</div>
              </div>
            ))}
          </div>
        )}

        {!aiLoading && aiInsights.length > 0 && (
          <div className="mb-3">
            {aiInsights.map((ins, i) => (
              <div key={i} className="bg-[var(--c7)] rounded-lg px-3 py-[10px] mb-2">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.06em] mb-[3px]">{ins.label}</div>
                <div className="text-xs text-[var(--c1)]">{ins.text}</div>
              </div>
            ))}
          </div>
        )}

        {!aiLoading && aiOptions.length === 0 && aiInsights.length === 0 && (
          <div className="text-xs text-muted-foreground leading-relaxed">
            Complete your end-of-day check-in. If any hours differ from plan, AI will suggest reschedule.
          </div>
        )}
      </div>

      {/* ── UNPLANNED MODAL ─────────────────────────────────────────────────── */}
      {showUnplanned && (
        <Modal
          title="⚡ Report unplanned work"
          onClose={() => setShowUnplanned(false)}
          maxWidth={460}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setShowUnplanned(false)}>Cancel</Button>
              <Button size="sm" onClick={() => handleReportUnplanned('project')}>Log & save →</Button>
            </>
          }
        >
          <div className="flex flex-col gap-[14px]">
            {/* Smart search */}
            <div>
              <div className="text-[11px] font-bold text-[var(--c2)] mb-[6px]">Project search</div>
              <div className="relative">
                <span className="absolute left-[10px] top-1/2 -translate-y-1/2 text-muted-foreground text-[13px]">🔍</span>
                <input
                  type="text"
                  placeholder="Search project..."
                  value={unplannedQuery}
                  onChange={e => { setUnplannedQuery(e.target.value); setUnplannedProject('') }}
                  className="w-full py-2 pl-8 pr-[10px] rounded-lg border border-[var(--c6)] text-[13px] box-border"
                  autoFocus
                />
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">AI matches to a project</div>

              {unplannedQuery.trim() && matchedProject && (
                <div
                  onClick={() => { setUnplannedProject(matchedProject.id); setUnplannedQuery(`${matchedProject.pn} — ${matchedProject.name}`) }}
                  className="mt-2 rounded-lg px-3 py-[10px] cursor-pointer"
                  style={{
                    border: unplannedProject === matchedProject.id ? '1.5px solid var(--navy-muted)' : '1px solid var(--c6)',
                    background: unplannedProject === matchedProject.id ? 'var(--navy-light)' : 'var(--c7)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary">{matchedProject.pn}</span>
                    <span className="text-xs text-[var(--c1)]">{matchedProject.name}</span>
                    <Badge variant="navy" className="text-[9px] ml-auto">matched</Badge>
                  </div>
                </div>
              )}

              {unplannedQuery.trim() && !matchedProject && (
                <div className="mt-2 rounded-lg px-3 py-[10px] bg-[var(--amber-bg)] border border-[var(--amber-border)] flex items-center justify-between">
                  <span className="text-xs text-[#d97706] font-semibold">No project found</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => { setUnplannedProject(''); setUnplannedQuery('') }}
                  >+ Log anyway</Button>
                </div>
              )}
            </div>

            {/* Hours */}
            <div>
              <div className="text-[11px] font-bold text-[var(--c2)] mb-[6px]">Hours</div>
              <HourChips planned={2} actual={unplannedHours} onChange={setUnplannedHours} />
            </div>

            {/* Note */}
            <div>
              <div className="text-[11px] font-bold text-[var(--c2)] mb-[6px]">Note (optional)</div>
              <textarea
                rows={2}
                placeholder="What happened?"
                value={unplannedDesc}
                onChange={e => setUnplannedDesc(e.target.value)}
                className="w-full px-[10px] py-2 rounded-lg border border-[var(--c6)] text-[13px] resize-none box-border"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
