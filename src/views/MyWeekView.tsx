import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { TeamMember, ResourceAllocation, ResourceConfirmation, AllocationCategory } from '../lib/types'
import { generatePPSCsv, downloadCsv } from '../lib/exportPPS'

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
  const barColor = status === 'confirmed' ? 'var(--green)' : status === 'delayed' ? 'var(--amber)' : isToday ? 'var(--navy)' : 'var(--c5)'
  const borderLeft = status === 'confirmed' ? '3px solid var(--green)' : status === 'delayed' ? '3px solid var(--amber)' : isToday ? '3px solid var(--navy)' : '3px solid transparent'
  return (
    <div
      onClick={onClick}
      style={{
        padding: '9px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 4,
        background: isSelected ? 'var(--navy-light)' : 'transparent',
        border: isSelected ? '1.5px solid var(--navy-muted)' : '1.5px solid transparent',
        borderLeft: isSelected ? '1.5px solid var(--navy-muted)' : borderLeft,
        transition: 'all 0.12s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: isToday ? 'var(--navy)' : 'var(--c1)' }}>{label}</div>
          <div style={{ fontSize: 10, color: 'var(--c3)', marginTop: 1 }}>{dateStr}{isToday ? ' · Today' : ''}</div>
        </div>
        {status === 'confirmed' && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)' }}>✓</span>}
        {status === 'delayed' && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber)' }}>⚠</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
        <div style={{ flex: 1, height: 3, background: 'var(--c6)', borderRadius: 2 }}>
          <div style={{ width: `${pct * 100}%`, height: 3, borderRadius: 2, background: barColor }} />
        </div>
        <span style={{ fontSize: 10, color: hours > capacity ? 'var(--red)' : 'var(--c3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
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
          <button key={h} onClick={() => onChange(h)} style={{
            padding: '5px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700,
            border: `1.5px solid ${border}`, background: bg, color, cursor: 'pointer', fontFamily: 'inherit',
          }}>
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
  const [actualMap, setActualMap] = useState<Record<string, number>>({})
  const [noteMap, setNoteMap] = useState<Record<string, string>>({})
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
    await supabase.from('resource_confirmations').upsert(
      { member_id: member.id, date, status: 'delayed', delay_reason: null },
      { onConflict: 'member_id,date' }
    )
    setConfirmations(prev => [
      ...prev.filter(c => c.date !== date),
      { id: '', member_id: member.id, date, status: 'delayed', delay_reason: null, confirmed_at: new Date().toISOString() },
    ])
  }

  async function handleEodSubmit() {
    if (!member) return
    setEodLoading(true)
    const selectedAllocs = allocations.filter(a => a.date === selectedDate)

    const inserts = selectedAllocs.map(a => ({
      allocation_id: a.id,
      member_id: member.id,
      date: selectedDate,
      actual_hours: actualMap[a.id] ?? a.hours,
      note: noteMap[a.id] || null,
    }))

    await supabase.from('allocation_actuals').upsert(inserts, { onConflict: 'allocation_id' })
    await supabase.from('resource_confirmations').upsert(
      { member_id: member.id, date: selectedDate, status: 'confirmed' },
      { onConflict: 'member_id,date' }
    )
    setConfirmations(prev => [
      ...prev.filter(c => c.date !== selectedDate),
      { id: '', member_id: member.id, date: selectedDate, status: 'confirmed', delay_reason: null, confirmed_at: new Date().toISOString() },
    ])

    const hasDeltas = selectedAllocs.some(a => (actualMap[a.id] ?? a.hours) !== a.hours)
    if (hasDeltas) await fetchAiAdvice(selectedAllocs)
    setEodLoading(false)
  }

  async function fetchAiAdvice(selectedAllocs: ResourceAllocation[]) {
    if (!member) return
    setAiLoading(true)
    const today_tasks = selectedAllocs.map(a => ({
      id: a.id,
      project_name: a.project?.name ?? a.label ?? a.category,
      category: a.category,
      planned_hours: a.hours,
      actual_hours: actualMap[a.id] ?? null,
      note: noteMap[a.id] || undefined,
    }))
    const remaining_week = allocations
      .filter(a => a.date > selectedDate)
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
    if (insErr) { alert('Failed to save: ' + insErr.message); return }
    const { data } = await supabase.from('resource_allocations')
      .select('*, project:projects(id, pn, name)')
      .eq('member_id', member.id).gte('date', weekStart).lte('date', weekEnd).order('date')
    if (data) setAllocations(data as ResourceAllocation[])
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

  const teamOverloaded = teamMembers.filter(tm => {
    if (!member || tm.id === member.id) return false
    const status = getTeamMemberStatus(tm.id, weekDays, teamAllocations, tm.hours_per_day)
    return status === 'busy'
  })

  const firstName = member?.name.split(' ')[0] ?? ''

  // ── Loading / Error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', fontFamily: "'Figtree', sans-serif" }}>
        <div style={{ fontSize: 14, color: 'var(--c3)', fontWeight: 600 }}>Loading your week…</div>
      </div>
    )
  }
  if (error || !member) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', fontFamily: "'Figtree', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--c0)', marginBottom: 8 }}>Link not found</div>
          <div style={{ fontSize: 14, color: 'var(--c3)' }}>{error ?? 'This link may be invalid or expired.'}</div>
        </div>
      </div>
    )
  }

  // ── Main render (member is non-null here) ──────────────────────────────────

  const initials = member.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '220px 1fr 280px',
      gridTemplateRows: '52px 1fr',
      height: '100vh',
      background: 'var(--bg)',
      fontFamily: "'Figtree', sans-serif",
      overflow: 'hidden',
    }}>

      {/* ── TOPBAR ─────────────────────────────────────────────────────────── */}
      <div style={{
        gridColumn: '1 / -1',
        gridRow: '1',
        background: '#fff',
        borderBottom: '1px solid var(--c6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
        gap: 12,
      }}>
        {/* Left: avatar + greeting + week nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--navy)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, flexShrink: 0,
          }}>{initials}</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--c0)', lineHeight: 1.2 }}>Hi, {firstName}</div>
            <div style={{ fontSize: 10, color: 'var(--c3)', lineHeight: 1.2 }}>
              {new Date(today + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div style={{ width: 1, height: 24, background: 'var(--c6)', margin: '0 4px' }} />
          {/* Week nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => {
                const m = getOffsetMonday(weekOffset - 1)
                setWeekOffset(w => w - 1)
                setSelectedDate(getWeekDays(m)[0])
              }}
            >← Prev</button>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c2)', minWidth: 110, textAlign: 'center' }}>
              {formatWeekRange(weekStart)}
            </span>
            <button
              className="btn btn-ghost btn-xs"
              disabled={weekOffset >= 0}
              style={{ opacity: weekOffset >= 0 ? 0.4 : 1, cursor: weekOffset >= 0 ? 'not-allowed' : 'pointer' }}
              onClick={() => {
                const m = getOffsetMonday(weekOffset + 1)
                setWeekOffset(w => w + 1)
                setSelectedDate(getWeekDays(m)[0])
              }}
            >Next →</button>
          </div>
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleExportPPS}>Export PPS</button>
          <button
            className="btn btn-sm"
            style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1.5px solid var(--red-border)' }}
            onClick={() => { setShowUnplanned(true); setUnplannedQuery('leave') }}
          >
            🤒 Report sick
          </button>
        </div>
      </div>

      {/* ── LEFT SIDEBAR ───────────────────────────────────────────────────── */}
      <div style={{
        gridColumn: '1',
        gridRow: '2',
        background: '#fff',
        borderRight: '1px solid var(--c6)',
        overflowY: 'auto',
        padding: '12px 10px',
      }}>
        {/* This week label */}
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, paddingLeft: 2 }}>
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
        <div style={{ height: 1, background: 'var(--c6)', margin: '10px 0' }} />

        {/* Team section */}
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, paddingLeft: 2 }}>
          Team
        </div>

        {teamMembers.filter(tm => tm.id !== member.id).map(tm => {
          const status = getTeamMemberStatus(tm.id, weekDays, teamAllocations, tm.hours_per_day)
          const tmInitials = tm.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
          return (
            <div key={tm.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderRadius: 6 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--navy)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800, flexShrink: 0,
              }}>{tmInitials}</div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tm.name}</span>
              {status === 'ok' && <span className="badge badge-green" style={{ fontSize: 9, padding: '2px 6px' }}>ok</span>}
              {status === 'busy' && <span className="badge badge-amber" style={{ fontSize: 9, padding: '2px 6px' }}>busy</span>}
              {status === 'light' && <span className="badge badge-gray" style={{ fontSize: 9, padding: '2px 6px' }}>light</span>}
            </div>
          )
        })}
      </div>

      {/* ── MAIN PANEL ─────────────────────────────────────────────────────── */}
      <div style={{
        gridColumn: '2',
        gridRow: '2',
        overflowY: 'auto',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Day title */}
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.4px', color: 'var(--c0)' }}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <div style={{ fontSize: 13, color: 'var(--c3)', marginTop: 2 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Confirmed hours', value: `${weekConfirmedHours}h`, color: 'var(--c0)' },
            { label: 'Today planned', value: `${todayHours}h`, color: todayHours > capacity ? 'var(--red)' : 'var(--c0)' },
            { label: 'Billable %', value: `${billablePct}%`, color: 'var(--c0)' },
            { label: 'Delayed days', value: `${delayedDaysCount}`, color: delayedDaysCount > 0 ? 'var(--red)' : 'var(--c0)' },
          ].map(stat => (
            <div key={stat.label} style={{
              background: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--c6)',
              borderRadius: 10,
              padding: '10px 14px',
            }}>
              <div style={{ fontSize: 10, color: 'var(--c3)', fontWeight: 600, marginBottom: 4 }}>{stat.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: stat.color }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* EOD check-in section */}
        {isConfirmed ? (
          <div style={{
            background: 'var(--green-bg)', border: '1px solid var(--green-border)',
            borderRadius: 10, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>✓</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>Day confirmed</span>
          </div>
        ) : isFutureDay ? (
          <div style={{ fontSize: 13, color: 'var(--c3)', padding: '12px 0' }}>No check-in needed for future days.</div>
        ) : selectedAllocs.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--c3)', padding: '12px 0' }}>No work planned for this day.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              End of day check-in — how many hours did you actually work?
            </div>

            {selectedAllocs.map(a => {
              const actual = actualMap[a.id] ?? a.hours
              const changed = actual !== a.hours
              const delta = actual - a.hours
              const taskName = a.category === 'project'
                ? `${a.project?.pn ?? '?'} — ${a.project?.name ?? 'Unknown'}`
                : a.label || a.category
              return (
                <div key={a.id} style={{
                  borderRadius: 10,
                  background: changed ? 'var(--amber-bg)' : '#fff',
                  border: changed ? '1px solid var(--amber-border)' : '1px solid var(--c6)',
                  padding: '12px 14px',
                  display: 'flex',
                  gap: 12,
                }}>
                  <div style={{ width: 3, borderRadius: 3, background: 'var(--navy)', flexShrink: 0, alignSelf: 'stretch' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)' }}>{taskName}</span>
                      <span style={{ fontSize: 11, color: 'var(--c3)' }}>Planned: {a.hours}h</span>
                      {changed && (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: delta < 0 ? 'var(--amber)' : 'var(--blue)',
                          background: delta < 0 ? 'var(--amber-bg)' : 'var(--blue-bg)',
                          border: `1px solid ${delta < 0 ? 'var(--amber-border)' : 'var(--blue-border)'}`,
                          borderRadius: 100, padding: '2px 8px',
                        }}>
                          {delta > 0 ? '+' : ''}{delta}h vs plan
                        </span>
                      )}
                      {changed && (
                        <span style={{ fontSize: 10, color: 'var(--navy)', fontWeight: 600 }}>→ AI will suggest reschedule</span>
                      )}
                    </div>
                    <HourChips
                      planned={a.hours}
                      actual={actual}
                      onChange={h => setActualMap(prev => ({ ...prev, [a.id]: h }))}
                    />
                    {changed && (
                      <input
                        type="text"
                        placeholder="Add a note (optional)"
                        value={noteMap[a.id] ?? ''}
                        onChange={e => setNoteMap(prev => ({ ...prev, [a.id]: e.target.value }))}
                        style={{
                          marginTop: 8, width: '100%', padding: '6px 10px',
                          borderRadius: 6, border: '1px solid var(--amber-border)',
                          fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box',
                          background: '#fff',
                        }}
                      />
                    )}
                  </div>
                </div>
              )
            })}

            {/* Report unplanned trigger */}
            <div
              onClick={() => setShowUnplanned(true)}
              style={{
                borderRadius: 10, border: '1.5px dashed var(--red-border)',
                padding: '10px 14px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8,
                color: 'var(--red)', fontSize: 12, fontWeight: 700,
              }}
            >
              ⚡ Report unplanned work
            </div>

            {/* Submit row */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => markDelayed(selectedDate)}
              >
                Mark delayed
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleEodSubmit}
                disabled={eodLoading}
              >
                {eodLoading ? 'Saving…' : 'Submit →'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT AI PANEL ─────────────────────────────────────────────────── */}
      <div style={{
        gridColumn: '3',
        gridRow: '2',
        borderLeft: '1px solid var(--c6)',
        overflowY: 'auto',
        padding: '16px 14px',
        background: '#fff',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: 'var(--navy)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, flexShrink: 0,
          }}>✦</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c0)' }}>AI Advisor</div>
            <div style={{ fontSize: 11, color: 'var(--c3)' }}>Updates after check-in</div>
          </div>
        </div>

        {/* Team overload alert */}
        {teamOverloaded.length > 0 && (
          <div style={{
            background: 'var(--amber-bg)', border: '1px solid var(--amber-border)',
            borderRadius: 8, padding: '10px 12px', marginBottom: 12,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', marginBottom: 4 }}>⚠ Team overload</div>
            <div style={{ fontSize: 11, color: 'var(--c2)' }}>
              {teamOverloaded.map(tm => tm.name).join(', ')} {teamOverloaded.length === 1 ? 'is' : 'are'} at ≥95% capacity this week.
            </div>
          </div>
        )}

        {aiLoading && (
          <div style={{
            background: 'var(--navy-light)', borderRadius: 8,
            padding: '12px 14px', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 14, color: 'var(--navy)' }}>✦</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>Analyzing changes…</span>
          </div>
        )}

        {!aiLoading && aiOptions.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Reschedule options
            </div>
            {aiOptions.map(opt => (
              <div
                key={opt.id}
                onClick={() => setSelectedAiOption(prev => prev === opt.id ? null : opt.id)}
                style={{
                  borderRadius: 8, padding: '10px 12px', marginBottom: 8, cursor: 'pointer',
                  border: selectedAiOption === opt.id ? '1.5px solid var(--navy-muted)' : '1px solid var(--c6)',
                  background: selectedAiOption === opt.id ? 'var(--navy-light)' : '#fff',
                  transition: 'all 0.12s',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c0)', marginBottom: 2 }}>{opt.title}</div>
                <div style={{ fontSize: 11, color: 'var(--c2)', marginBottom: 4 }}>{opt.description}</div>
                <div style={{ fontSize: 10, color: 'var(--navy)', fontWeight: 600 }}>{opt.impact}</div>
              </div>
            ))}
          </div>
        )}

        {!aiLoading && aiInsights.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {aiInsights.map((ins, i) => (
              <div key={i} style={{
                background: 'var(--c7)', borderRadius: 8,
                padding: '10px 12px', marginBottom: 8,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{ins.label}</div>
                <div style={{ fontSize: 12, color: 'var(--c1)' }}>{ins.text}</div>
              </div>
            ))}
          </div>
        )}

        {!aiLoading && aiOptions.length === 0 && aiInsights.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--c3)', lineHeight: 1.6 }}>
            Complete your end-of-day check-in. If any hours differ from plan, AI will suggest reschedule.
          </div>
        )}
      </div>

      {/* ── UNPLANNED MODAL ─────────────────────────────────────────────────── */}
      {showUnplanned && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowUnplanned(false)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 14, width: 460,
              maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{
              padding: '16px 18px', borderBottom: '1px solid var(--c6)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c0)' }}>⚡ Report unplanned work</div>
                <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 2 }}>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {member.name}
                </div>
              </div>
              <button
                onClick={() => setShowUnplanned(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--c3)', lineHeight: 1 }}
              >×</button>
            </div>

            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Smart search */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c2)', marginBottom: 6 }}>Project search</div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--c3)', fontSize: 13 }}>🔍</span>
                  <input
                    type="text"
                    placeholder="Search project..."
                    value={unplannedQuery}
                    onChange={e => { setUnplannedQuery(e.target.value); setUnplannedProject('') }}
                    style={{
                      width: '100%', padding: '8px 10px 8px 32px',
                      borderRadius: 8, border: '1px solid var(--c6)',
                      fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
                    }}
                    autoFocus
                  />
                </div>
                <div style={{ fontSize: 10, color: 'var(--c4)', marginTop: 4 }}>AI matches to a project</div>

                {unplannedQuery.trim() && matchedProject && (
                  <div
                    onClick={() => { setUnplannedProject(matchedProject.id); setUnplannedQuery(`${matchedProject.pn} — ${matchedProject.name}`) }}
                    style={{
                      marginTop: 8, borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                      border: unplannedProject === matchedProject.id ? '1.5px solid var(--navy-muted)' : '1px solid var(--c6)',
                      background: unplannedProject === matchedProject.id ? 'var(--navy-light)' : 'var(--c7)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', fontFamily: 'monospace' }}>{matchedProject.pn}</span>
                      <span style={{ fontSize: 12, color: 'var(--c1)' }}>{matchedProject.name}</span>
                      <span className="badge badge-navy" style={{ fontSize: 9, marginLeft: 'auto' }}>matched</span>
                    </div>
                  </div>
                )}

                {unplannedQuery.trim() && !matchedProject && (
                  <div style={{
                    marginTop: 8, borderRadius: 8, padding: '10px 12px',
                    background: 'var(--amber-bg)', border: '1px solid var(--amber-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>No project found</span>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => { setUnplannedProject(''); setUnplannedQuery('') }}
                    >+ Log anyway</button>
                  </div>
                )}
              </div>

              {/* Hours */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c2)', marginBottom: 6 }}>Hours</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8].map(h => (
                    <button
                      key={h}
                      onClick={() => setUnplannedHours(h)}
                      style={{
                        padding: '5px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700,
                        border: `1.5px solid ${unplannedHours === h ? 'var(--navy-muted)' : 'var(--c6)'}`,
                        background: unplannedHours === h ? 'var(--navy-light)' : 'var(--c7)',
                        color: unplannedHours === h ? 'var(--navy)' : 'var(--c2)',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >{h}h</button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c2)', marginBottom: 6 }}>Note (optional)</div>
                <textarea
                  rows={2}
                  placeholder="What happened?"
                  value={unplannedDesc}
                  onChange={e => setUnplannedDesc(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--c6)', fontSize: 13,
                    fontFamily: 'inherit', resize: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* Modal footer */}
            <div style={{
              padding: '12px 18px', borderTop: '1px solid var(--c6)',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowUnplanned(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={() => handleReportUnplanned('project')}>Log & save →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
