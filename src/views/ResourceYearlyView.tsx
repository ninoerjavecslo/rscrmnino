import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useResourceStore } from '../stores/resource'
import { useHolidayStore } from '../stores/holidays'
import { useProjectsStore } from '../stores/projects'
import { workDaysInRange, timeOffWorkDays, holidayWorkDays } from '../lib/capacityUtils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Modal } from '../components/Modal'
import { Select } from '../components/Select'
import { toast } from '../lib/toast'
import type { CompanyHoliday } from '../lib/types'

interface AllocRow { member_id: string; category: string; date: string; hours: number }
interface DelivRow { project_id: string; due_date: string; start_date: string | null; estimated_hours: number | null; team: string | null; team_hours: Record<string, number> | null }
interface TimeOffRow { member_id: string; start_date: string; end_date: string }

function countMonthsBetween(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1)
}

type Mode = 'allocated' | 'estimated'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Heatmap: darker = higher utilization (matches screenshot)
function cellColor(pct: number): string {
  if (pct === 0) return 'transparent'
  if (pct > 100) return '#fee2e2'
  if (pct >= 95) return '#1e293b'
  if (pct >= 80) return '#334155'
  if (pct >= 50) return '#64748b'
  return '#e2e8f0'
}
function cellTextColor(pct: number): string {
  if (pct > 100) return '#b91c1c'
  if (pct >= 50) return '#fff'
  return 'var(--c4)'
}

function monthRange(year: number, monthIndex: number): { start: string; end: string } {
  const mm = String(monthIndex + 1).padStart(2, '0')
  const monthStart = `${year}-${mm}-01`
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const monthEnd = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
  return { start: monthStart, end: monthEnd }
}

interface MonthCell { hours: number; capacity: number; pct: number }

export function ResourceYearlyView() {
  const { teams, members, fetchTeams, fetchMembers } = useResourceStore()
  const holidayStore = useHolidayStore()
  const projectsStore = useProjectsStore()

  const [year, setYear] = useState(new Date().getFullYear())
  const [mode, setMode] = useState<Mode>('allocated')
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())

  const [allocations, setAllocations] = useState<AllocRow[]>([])
  const [deliverables, setDeliverables] = useState<DelivRow[]>([])
  const [allTimeOff, setAllTimeOff] = useState<TimeOffRow[]>([])
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([])
  const [loading, setLoading] = useState(false)

  // ── Add Estimation modal ──────────────────────────────────────────────────
  const [showEstModal, setShowEstModal] = useState(false)
  const [estProjectId, setEstProjectId] = useState('')
  const [estTitle, setEstTitle] = useState('')
  const [estStartDate, setEstStartDate] = useState('')
  const [estDueDate, setEstDueDate] = useState('')
  const [estHours, setEstHours] = useState<number | ''>('')
  const [estTeams, setEstTeams] = useState<string[]>([])
  const [estTeamHours, setEstTeamHours] = useState<Record<string, number>>({})
  const [estSaving, setEstSaving] = useState(false)
  const [showNewProjModal, setShowNewProjModal] = useState(false)
  const [newProjName, setNewProjName] = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [newProjSaving, setNewProjSaving] = useState(false)

  function resetEstForm() {
    setEstProjectId(''); setEstTitle(''); setEstStartDate(''); setEstDueDate('')
    setEstHours(''); setEstTeams([]); setEstTeamHours({})
  }

  async function saveEstimation() {
    if (!estProjectId || !estTitle.trim() || !estDueDate) return
    setEstSaving(true)
    const totalHours = estTeams.length > 1
      ? estTeams.reduce((s, t) => s + (estTeamHours[t] ?? 0), 0)
      : estHours || null
    const teamHrsPayload = estTeams.length > 1 ? estTeamHours : null
    const { error } = await supabase.from('project_deliverables').insert({
      project_id: estProjectId,
      title: estTitle.trim(),
      due_date: estDueDate,
      start_date: estStartDate || null,
      estimated_hours: totalHours,
      team: estTeams.length > 0 ? estTeams.join(', ') : null,
      team_hours: teamHrsPayload,
      status: 'active',
    })
    setEstSaving(false)
    if (error) { toast('error', 'Failed to save estimation'); return }
    toast('success', 'Estimation added')
    setShowEstModal(false)
    resetEstForm()
    // refresh deliverables if in estimated mode
    if (mode === 'estimated') {
      const yearStart = `${year}-01-01`
      const yearEnd = `${year}-12-31`
      const { data } = await supabase.from('project_deliverables')
        .select('project_id, due_date, start_date, estimated_hours, team, team_hours')
        .gte('due_date', yearStart).lte('due_date', yearEnd).neq('status', 'completed')
      setDeliverables((data ?? []) as DelivRow[])
    }
  }

  async function saveNewProject() {
    if (!newProjName.trim() || !newClientName.trim()) return
    setNewProjSaving(true)
    const { data: client, error: ce } = await supabase
      .from('clients').insert({ name: newClientName.trim(), status: 'active' }).select('id').single()
    if (ce) { toast('error', 'Failed to create client'); setNewProjSaving(false); return }
    const allProjects = projectsStore.projects
    const year = new Date().getFullYear()
    const prefix = `RS-${year}-`
    const nums = allProjects.map(p => p.pn).filter(pn => pn.startsWith(prefix))
      .map(pn => parseInt(pn.slice(prefix.length), 10)).filter(n => !isNaN(n))
    const pn = `${prefix}${String((nums.length > 0 ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
    const { data: proj, error: pe } = await supabase
      .from('projects').insert({
        pn, name: newProjName.trim(), client_id: client.id,
        type: 'fixed', status: 'active', pm: 'Nino', currency: 'EUR',
      }).select('id').single()
    if (pe) { toast('error', 'Failed to create project'); setNewProjSaving(false); return }
    await projectsStore.fetchAll()
    setEstProjectId(proj.id)
    setShowNewProjModal(false)
    setNewProjName(''); setNewClientName('')
    setNewProjSaving(false)
    toast('success', 'Project created')
  }

  useEffect(() => {
    fetchTeams()
    fetchMembers()
    projectsStore.fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    setLoading(true)

    const timeOffQ = supabase
      .from('time_off')
      .select('member_id, start_date, end_date')
      .lte('start_date', yearEnd)
      .gte('end_date', yearStart)

    const holidayQ = holidayStore.fetchByRange(yearStart, yearEnd)

    const dataQ = mode === 'allocated'
      ? supabase.from('resource_allocations').select('member_id, category, date, hours').gte('date', yearStart).lte('date', yearEnd)
      : supabase.from('project_deliverables').select('project_id, due_date, start_date, estimated_hours, team, team_hours').gte('due_date', yearStart).lte('due_date', yearEnd).neq('status', 'completed')

    Promise.all([timeOffQ, holidayQ, dataQ]).then(([toRes, hols, dataRes]) => {
      setAllTimeOff((toRes.data ?? []) as TimeOffRow[])
      setHolidays(hols)
      if (mode === 'allocated') {
        setAllocations((dataRes.data ?? []) as AllocRow[])
        setDeliverables([])
      } else {
        setDeliverables((dataRes.data ?? []) as DelivRow[])
        setAllocations([])
      }
      setLoading(false)
    })
  }, [year, mode]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeMembers = useMemo(() => members.filter(m => m.active), [members])

  const memberCountByTeamName = useMemo(() => {
    const counts: Record<string, number> = {}
    activeMembers.forEach(m => {
      const name = m.team?.name ?? ''
      counts[name] = (counts[name] ?? 0) + 1
    })
    return counts
  }, [activeMembers])

  const teamRows = useMemo(() => {
    return teams.map(team => {
      const teamMembers = activeMembers.filter(m => m.team_id === team.id)

      const memberRows = teamMembers.map(member => {
        const memberTimeOff = allTimeOff.filter(t => t.member_id === member.id)

        const months: MonthCell[] = Array.from({ length: 12 }, (_, i) => {
          const { start, end } = monthRange(year, i)
          const days = workDaysInRange(start, end)
          const offDays = timeOffWorkDays(memberTimeOff, days)
          const holDays = holidayWorkDays(holidays, days, member.team_id, year)
          const grossDays = Math.max(0, days.length - offDays - holDays)
          const capacity = grossDays * member.hours_per_day

          let hours = 0
          if (mode === 'allocated') {
            const leaveHrs = allocations
              .filter(a => a.member_id === member.id && a.category === 'leave' && a.date >= start && a.date <= end)
              .reduce((s, a) => s + a.hours, 0)
            const adjCapacity = Math.max(0, capacity - leaveHrs)
            hours = allocations
              .filter(a => a.member_id === member.id && a.category !== 'leave' && a.date >= start && a.date <= end)
              .reduce((s, a) => s + a.hours, 0)
            const pct = adjCapacity > 0 ? Math.round((hours / adjCapacity) * 100) : 0
            return { hours, capacity: Math.max(0, adjCapacity), pct }
          } else {
            const teamName = team.name
            const teamMemberCount = Math.max(1, memberCountByTeamName[teamName] ?? 1)
            const monthLabel = start.slice(0, 7) // YYYY-MM
            const delivHours = deliverables
              .filter(d => {
                const teamMatch = d.team === null ||
                  d.team.split(',').some(t => t.trim().toLowerCase() === teamName.toLowerCase())
                if (!teamMatch) return false
                // Check month overlap: [start_date || due_date_month, due_date]
                const rangeStart = (d.start_date ?? d.due_date).slice(0, 7)
                const rangeEnd = d.due_date.slice(0, 7)
                return rangeStart <= monthLabel && monthLabel <= rangeEnd
              })
              .reduce((s, d) => {
                const teamSpecific = (d.team_hours as Record<string, number> | null)?.[teamName] ?? d.estimated_hours ?? 0
                if (d.start_date) {
                  return s + teamSpecific / countMonthsBetween(d.start_date, d.due_date)
                }
                return s + teamSpecific
              }, 0)
            hours = Math.round(delivHours / teamMemberCount)
            const pct = capacity > 0 ? Math.round((hours / capacity) * 100) : 0
            return { hours, capacity, pct }
          }
        })

        const yearHours = months.reduce((s, m) => s + m.hours, 0)
        const yearCap = months.reduce((s, m) => s + m.capacity, 0)
        const yearPct = yearCap > 0 ? Math.round((yearHours / yearCap) * 100) : 0

        return { member, months, yearTotal: { hours: yearHours, capacity: yearCap, pct: yearPct } }
      })

      const teamMonths: MonthCell[] = Array.from({ length: 12 }, (_, i) => {
        const hours = memberRows.reduce((s, r) => s + r.months[i].hours, 0)
        const capacity = memberRows.reduce((s, r) => s + r.months[i].capacity, 0)
        const pct = capacity > 0 ? Math.round((hours / capacity) * 100) : 0
        return { hours, capacity, pct }
      })
      const yearHours = teamMonths.reduce((s, m) => s + m.hours, 0)
      const yearCap = teamMonths.reduce((s, m) => s + m.capacity, 0)
      const yearPct = yearCap > 0 ? Math.round((yearHours / yearCap) * 100) : 0

      return { team, memberRows, months: teamMonths, yearTotal: { hours: yearHours, capacity: yearCap, pct: yearPct } }
    }).filter(row => row.memberRows.length > 0)
  }, [teams, activeMembers, allocations, deliverables, allTimeOff, holidays, year, mode, memberCountByTeamName])

  // ── Aggregate stats ───────────────────────────────────────────────────────
  const totalCapacity = useMemo(() => teamRows.reduce((s, r) => s + r.yearTotal.capacity, 0), [teamRows])
  const totalCommitments = useMemo(() => teamRows.reduce((s, r) => s + r.yearTotal.hours, 0), [teamRows])
  const availableHours = Math.max(0, totalCapacity - totalCommitments)
  const utilizationPct = totalCapacity > 0 ? Math.round((totalCommitments / totalCapacity) * 100) : 0

  // ── Critical alerts: teams over 100% in any month ────────────────────────
  const criticalAlerts = useMemo(() => {
    const alerts: { name: string; month: string; pct: number; type: 'team' | 'member' }[] = []
    teamRows.forEach(({ team, months, memberRows }) => {
      months.forEach((cell, i) => {
        if (cell.pct > 100) alerts.push({ name: team.name, month: MONTHS[i], pct: cell.pct, type: 'team' })
      })
      memberRows.forEach(({ member, months: mMonths }) => {
        mMonths.forEach((cell, i) => {
          if (cell.pct > 105) alerts.push({ name: member.name, month: MONTHS[i], pct: cell.pct, type: 'member' })
        })
      })
    })
    return alerts.slice(0, 4)
  }, [teamRows])

  // ── Lead utilization: top 5 members by year pct ──────────────────────────
  const topMembers = useMemo(() => {
    const all: { id: string; name: string; role: string; pct: number; teamColor: string }[] = []
    teamRows.forEach(({ team, memberRows }) => {
      memberRows.forEach(({ member, yearTotal }) => {
        if (yearTotal.capacity > 0) {
          all.push({ id: member.id, name: member.name, role: member.role ?? '', pct: yearTotal.pct, teamColor: team.color })
        }
      })
    })
    return all.sort((a, b) => b.pct - a.pct).slice(0, 5)
  }, [teamRows])

  function toggleTeam(teamId: string) {
    setExpandedTeams(prev => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  function Cell({ cell, bold }: { cell: MonthCell; bold?: boolean }) {
    if (cell.capacity === 0) return <td className="text-center text-xs text-muted-foreground">—</td>
    return (
      <td className="text-center" style={{ padding: '3px 4px' }}>
        <div style={{
          background: cellColor(cell.pct),
          color: cellTextColor(cell.pct),
          borderRadius: 6,
          padding: '6px 2px',
          fontWeight: bold ? 800 : 600,
          fontSize: 13,
          fontFamily: 'Manrope, sans-serif',
          lineHeight: 1.2,
        }}>
          {cell.pct}%
          <div style={{ fontSize: 9, fontWeight: 400, color: 'inherit', opacity: 0.8 }}>{Math.round(cell.hours)}h</div>
        </div>
      </td>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Yearly Capacity Planning</h1>
          <p>Strategic allocation and team utilization for {year}.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setYear(y => y - 1)}>‹</Button>
            <span className="font-bold text-[15px] min-w-[40px] text-center">{year}</span>
            <Button variant="ghost" size="sm" onClick={() => setYear(y => y + 1)}>›</Button>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-border">
            <Button
              size="sm"
              variant={mode === 'allocated' ? 'default' : 'ghost'}
              className="rounded-none border-none"
              onClick={() => setMode('allocated')}
            >Allocated</Button>
            <Button
              size="sm"
              variant={mode === 'estimated' ? 'default' : 'ghost'}
              className="rounded-none border-none border-l border-border"
              onClick={() => setMode('estimated')}
            >Estimated</Button>
          </div>
          <Button size="sm" onClick={() => { resetEstForm(); setShowEstModal(true) }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Estimation
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── Stats strip ─────────────────────────────────────────────────── */}
        {!loading && totalCapacity > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            {/* Total Billable Capacity */}
            <Card>
              <CardContent className="px-6 py-5">
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px] mb-2">Total Billable Capacity</div>
                <div className="text-[32px] font-extrabold text-foreground font-[Manrope,sans-serif] leading-none">
                  {totalCapacity.toLocaleString()}
                  <span className="text-base font-medium text-muted-foreground ml-1.5">Hours</span>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {activeMembers.length} active members
                </div>
              </CardContent>
            </Card>

            {/* Current Commitments */}
            <Card>
              <CardContent className="px-6 py-5">
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px] mb-2">Current Commitments</div>
                <div className="text-[32px] font-extrabold text-foreground font-[Manrope,sans-serif] leading-none">
                  {Math.round(totalCommitments).toLocaleString()}
                  <span className="text-base font-medium text-muted-foreground ml-1.5">Hours</span>
                </div>
                <div className="mt-2.5">
                  <div className="h-1 rounded-sm bg-[var(--c6)] overflow-hidden">
                    <div style={{
                      height: '100%', borderRadius: 2, width: `${Math.min(100, utilizationPct)}%`,
                      background: utilizationPct > 100 ? 'var(--red)' : utilizationPct >= 80 ? 'var(--green)' : 'var(--amber)',
                      transition: 'width 0.4s'
                    }} />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">{utilizationPct}% of total capacity utilized</div>
                </div>
              </CardContent>
            </Card>

            {/* Available Capacity */}
            <Card className="bg-[var(--navy)] border-none">
              <CardContent className="px-6 py-5">
                <div className="text-[11px] font-bold text-white/60 uppercase tracking-[0.5px] mb-2">Available Capacity</div>
                <div className="text-[32px] font-extrabold text-white font-[Manrope,sans-serif] leading-none">
                  {Math.round(availableHours).toLocaleString()}
                  <span className="text-base font-medium text-white/70 ml-1.5">Hours</span>
                </div>
                <div className="text-xs text-white/50 mt-2">
                  Unallocated hours for {year}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Heatmap legend ───────────────────────────────────────────────── */}
        <div className="flex gap-4 mb-4 items-center flex-wrap">
          <span className="text-xs text-[var(--c3)] font-semibold">Utilization:</span>
          {[
            { label: '0–50%', bg: '#e2e8f0', color: 'var(--c3)' },
            { label: '50–80%', bg: '#64748b', color: '#fff' },
            { label: '80–95%', bg: '#334155', color: '#fff' },
            { label: '95–100%', bg: '#1e293b', color: '#fff' },
            { label: '>100%', bg: '#fee2e2', color: '#b91c1c' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div style={{ width: 28, height: 20, background: l.bg, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: l.color }}>{l.label.split('–')[0]}</span>
              </div>
              <span className="text-xs text-[var(--c3)]">{l.label}</span>
            </div>
          ))}
        </div>

        {/* ── Heatmap table ────────────────────────────────────────────────── */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading…</div>
        ) : (
          <Card className="overflow-x-auto mb-6">
            <table style={{ minWidth: 900 }}>
              <thead>
                <tr className="bg-[var(--c7)]">
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-[var(--c3)] uppercase" style={{ width: 200 }}>Team / Member</th>
                  {MONTHS.map(m => (
                    <th key={m} className="text-center py-2.5 text-[11px] font-bold text-[var(--c3)] uppercase" style={{ padding: '10px 4px', minWidth: 68 }}>{m}</th>
                  ))}
                  <th className="text-center py-2.5 text-[11px] font-bold text-[var(--c3)] uppercase" style={{ padding: '10px 8px', minWidth: 68 }}>Year</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map(({ team, memberRows, months, yearTotal }) => {
                  const isExpanded = expandedTeams.has(team.id)
                  return (
                    <>
                      <tr key={team.id} onClick={() => toggleTeam(team.id)}
                        className="cursor-pointer bg-[#fafafa] border-t-2 border-[var(--c6)]">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] text-[var(--c4)] leading-none">{isExpanded ? '▼' : '▶'}</span>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: team.color, flexShrink: 0 }} />
                            <span className="font-bold text-sm text-[var(--c0)]">{team.name}</span>
                            <span className="text-xs text-[var(--c4)]">({memberRows.length})</span>
                          </div>
                        </td>
                        {months.map((cell, i) => <Cell key={i} cell={cell} bold />)}
                        <Cell cell={yearTotal} bold />
                      </tr>

                      {isExpanded && memberRows.map(({ member, months: mMonths, yearTotal: mYear }) => (
                        <tr key={member.id} className="border-t border-[var(--c6)]">
                          <td style={{ padding: '8px 16px 8px 36px' }}>
                            <div className="flex items-center gap-2">
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: team.color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: team.color, flexShrink: 0 }}>
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <Link to={`/team/${member.id}`} className="font-semibold text-[13px] text-[var(--c0)] no-underline"
                                  onClick={e => e.stopPropagation()}>{member.name}</Link>
                                {member.role && <div className="text-[11px] text-[var(--c4)]">{member.role}</div>}
                              </div>
                            </div>
                          </td>
                          {mMonths.map((cell, i) => <Cell key={i} cell={cell} />)}
                          <Cell cell={mYear} />
                        </tr>
                      ))}
                    </>
                  )
                })}
              </tbody>
            </table>

            {teamRows.length === 0 && !loading && (
              <div className="text-center py-16 text-muted-foreground">
                No team members found. Add members in Settings → Team.
              </div>
            )}
          </Card>
        )}

        {/* ── Bottom sections ──────────────────────────────────────────────── */}
        {!loading && (criticalAlerts.length > 0 || topMembers.length > 0) && (
          <div className="grid grid-cols-2 gap-4">

            {/* Critical Alerts */}
            {criticalAlerts.length > 0 && (
              <Card>
                <CardContent>
                  <div className="flex items-center gap-2 mb-4">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span className="font-bold text-sm text-[var(--c0)]">Critical Allocation Alerts</span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {criticalAlerts.map((a, i) => (
                      <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 bg-[#fff5f5] rounded-lg border-l-[3px] border-[var(--red)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeLinecap="round" className="mt-px shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        <div>
                          <div className="font-semibold text-[13px] text-[var(--c0)]">
                            {a.name} over-capacity ({a.month})
                          </div>
                          <div className="text-xs text-[var(--c3)] mt-0.5">
                            {a.type === 'team' ? 'Team' : 'Member'} at <strong className="text-[var(--red)]">{a.pct}%</strong> utilization
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Lead Utilization */}
            {topMembers.length > 0 && (
              <Card>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-bold text-sm text-[var(--c0)]">Lead Utilization</span>
                    <span className="text-xs text-[var(--c4)]">Year {year}</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {topMembers.map(m => (
                      <div key={m.id} className="flex items-center gap-3">
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: m.teamColor + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: m.teamColor, flexShrink: 0 }}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <Link to={`/team/${m.id}`} className="font-semibold text-[13px] text-[var(--c0)] no-underline">{m.name}</Link>
                            <span className="text-xs font-bold shrink-0 font-[Manrope,sans-serif]" style={{ color: m.pct > 100 ? 'var(--red)' : m.pct >= 80 ? 'var(--green)' : 'var(--c3)' }}>
                              {m.pct}%
                              {m.pct > 100 && <span className="ml-1 text-[10px]">OVER</span>}
                            </span>
                          </div>
                          {m.role && <div className="text-[11px] text-[var(--c4)] uppercase tracking-[0.3px]">{m.role}</div>}
                          <div className="h-[3px] rounded-sm bg-[var(--c6)] mt-1 overflow-hidden">
                            <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, m.pct)}%`, background: m.pct > 100 ? 'var(--red)' : m.pct >= 80 ? 'var(--green)' : 'var(--amber)' }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        )}

      </div>
      {/* ── Add Estimation Modal ─────────────────────────────────────────── */}
      {showEstModal && (
        <Modal title="Add Estimation" maxWidth={620} onClose={() => { setShowEstModal(false); resetEstForm() }}>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project</label>
            <Select
              value={estProjectId}
              onChange={v => {
                if (v === '__new__') { setShowNewProjModal(true) }
                else { setEstProjectId(v) }
              }}
              placeholder="Select project…"
              options={[
                ...projectsStore.projects
                  .filter(p => p.status === 'active')
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(p => ({ value: p.id, label: p.name })),
                { value: '__new__', label: '+ New project…' },
              ]}
            />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Title</label>
            <input value={estTitle} onChange={e => setEstTitle(e.target.value)} placeholder="e.g. UX/UI Design delivery" autoFocus />
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Start Date <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input type="date" value={estStartDate} onChange={e => setEstStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Due Date</label>
              <input type="date" value={estDueDate} onChange={e => setEstDueDate(e.target.value)} />
            </div>
            {estTeams.length <= 1 && (
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Estimated Hours</label>
                <input type="number" value={estHours} onChange={e => setEstHours(e.target.value ? Number(e.target.value) : '')} min={0} step={1} placeholder="40" />
              </div>
            )}
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Team</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {teams.map(t => {
                const sel = estTeams.includes(t.name)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setEstTeams(prev => sel ? prev.filter(x => x !== t.name) : [...prev, t.name])}
                    className={`px-3.5 py-1 rounded-full border-2 font-semibold text-[13px] cursor-pointer uppercase tracking-wide transition-all ${sel ? 'border-primary bg-primary text-white' : 'border-[var(--c5)] bg-white text-[#374151]'}`}
                  >
                    {t.name}
                  </button>
                )
              })}
            </div>
          </div>
          {estTeams.length > 1 && (
            <div className="bg-[var(--c7)] rounded-lg px-4 py-3 mb-4">
              <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2.5">Hours per Team</div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                {estTeams.map(tName => (
                  <div key={tName}>
                    <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">{tName}</label>
                    <input
                      type="number" min={0} step={1} placeholder="0"
                      value={estTeamHours[tName] ?? ''}
                      onChange={e => setEstTeamHours(prev => ({ ...prev, [tName]: e.target.value ? Number(e.target.value) : 0 }))}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Total: <strong>{estTeams.reduce((s, t) => s + (estTeamHours[t] ?? 0), 0)}h</strong>
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="outline" size="sm" onClick={() => { setShowEstModal(false); resetEstForm() }}>Cancel</Button>
            <Button size="sm" disabled={!estProjectId || !estTitle.trim() || !estDueDate || estSaving} onClick={saveEstimation}>
              {estSaving ? 'Saving…' : 'Add Estimation'}
            </Button>
          </div>
        </Modal>
      )}
      {showNewProjModal && (
        <Modal title="New Project" maxWidth={420} onClose={() => { setShowNewProjModal(false); setNewProjName(''); setNewClientName('') }}>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project name</label>
            <input value={newProjName} onChange={e => setNewProjName(e.target.value)} placeholder="e.g. Petrol — Prenova" autoFocus />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Client name</label>
            <input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="e.g. Petrol d.o.o." />
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="outline" size="sm" onClick={() => { setShowNewProjModal(false); setNewProjName(''); setNewClientName('') }}>Cancel</Button>
            <Button size="sm" disabled={!newProjName.trim() || !newClientName.trim() || newProjSaving} onClick={saveNewProject}>
              {newProjSaving ? 'Creating…' : 'Create & Select'}
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}
