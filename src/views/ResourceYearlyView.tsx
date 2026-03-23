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
interface DelivRow { project_id: string; due_date: string; start_date: string | null; estimated_hours: number | null; team: string | null; team_hours: Record<string, number> | null; member_percentages: Record<string, number> | null }
interface TimeOffRow { member_id: string; start_date: string; end_date: string }
interface MaintTeamRow { team_name: string; hours_per_month: number; contract_start: string; contract_end: string | null }

/** Working days in [monthStart, monthEnd] that overlap with [delivStart, delivEnd] */
function workDaysInOverlap(monthStart: string, monthEnd: string, delivStart: string, delivEnd: string): number {
  const overlapStart = monthStart > delivStart ? monthStart : delivStart
  const overlapEnd = monthEnd < delivEnd ? monthEnd : delivEnd
  if (overlapStart > overlapEnd) return 0
  return workDaysInRange(overlapStart, overlapEnd).length
}

/** Total working days across the entire deliverable range */
function totalWorkDaysInDeliv(delivStart: string, delivEnd: string): number {
  return Math.max(1, workDaysInRange(delivStart, delivEnd).length)
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
  // projectMembersMap: projectId → Set of member_ids assigned to that project
  const [projectMembersMap, setProjectMembersMap] = useState<Record<string, Set<string>>>({})
  const [maintTeamRows, setMaintTeamRows] = useState<MaintTeamRow[]>([])
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
        .select('project_id, due_date, start_date, estimated_hours, team, team_hours, member_percentages')
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
      : supabase.from('project_deliverables').select('project_id, due_date, start_date, estimated_hours, team, team_hours, member_percentages').gte('due_date', yearStart).lte('due_date', yearEnd).neq('status', 'completed')

    Promise.all([timeOffQ, holidayQ, dataQ]).then(([toRes, hols, dataRes]) => {
      setAllTimeOff((toRes.data ?? []) as TimeOffRow[])
      setHolidays(hols)
      if (mode === 'allocated') {
        setAllocations((dataRes.data ?? []) as AllocRow[])
        setDeliverables([])
        setProjectMembersMap({})
        setMaintTeamRows([])
        setLoading(false)
      } else {
        const delivs = (dataRes.data ?? []) as DelivRow[]
        setDeliverables(delivs)
        setAllocations([])
        // Fetch member_projects + maintenances in parallel
        const projectIds = [...new Set(delivs.map(d => d.project_id))]
        const memberProjQ = projectIds.length > 0
          ? supabase.from('member_projects').select('project_id, member_id').in('project_id', projectIds)
          : Promise.resolve({ data: [] })
        const maintQ = supabase.from('maintenances').select('id, status, contract_start, contract_end, team_hours').eq('status', 'active')
        Promise.all([memberProjQ, maintQ]).then(([mpRes, maintRes]) => {
          const map: Record<string, Set<string>> = {}
          ;((mpRes as { data: { project_id: string; member_id: string }[] | null }).data ?? []).forEach(row => {
            if (!map[row.project_id]) map[row.project_id] = new Set()
            map[row.project_id].add(row.member_id)
          })
          setProjectMembersMap(map)
          const mRows: MaintTeamRow[] = []
          ;((maintRes.data ?? []) as { contract_start: string; contract_end: string | null; team_hours: Record<string, number> | null }[]).forEach(m => {
            const th = m.team_hours
            if (!th) return
            Object.entries(th).forEach(([teamName, hours]) => {
              if (hours > 0) mRows.push({ team_name: teamName, hours_per_month: hours, contract_start: m.contract_start, contract_end: m.contract_end })
            })
          })
          setMaintTeamRows(mRows)
          setLoading(false)
        })
      }
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
          const vacationDaysPerMonth = (member.vacation_days_year ?? 0) / 12
          const vacationHours = vacationDaysPerMonth * (member.hours_per_day ?? 8)
          const overheadHours = (member.overhead_meetings_month ?? 0) + (member.overhead_sales_month ?? 0)
          const capacity = Math.max(0, grossDays * member.hours_per_day - vacationHours)

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
                if (!d.team) return false
                const teamMatch = d.team.split(',').some(t => t.trim().toLowerCase() === teamName.toLowerCase())
                if (!teamMatch) return false
                if (d.member_percentages) {
                  // Only include this member if they have an explicit percentage entry
                  const memberPct = (d.member_percentages as Record<string, number>)[member.id]
                  if (memberPct == null || memberPct === 0) return false
                } else {
                  // If member_percentages null, only include if this member is assigned to the project
                  const projMembers = projectMembersMap[d.project_id]
                  if (projMembers && projMembers.size > 0 && !projMembers.has(member.id)) return false
                }
                const delivStart = d.start_date ?? d.due_date
                const overlapDays = workDaysInOverlap(start, end, delivStart, d.due_date)
                return overlapDays > 0
              })
              .reduce((s, d) => {
                const delivStart = d.start_date ?? d.due_date
                const memberPct = (d.member_percentages as Record<string, number> | null)?.[member.id]
                let memberShare: number
                if (memberPct != null) {
                  // Use explicit per-member percentage of team hours
                  const teamHrs = (d.team_hours as Record<string, number> | null)?.[teamName] ?? d.estimated_hours ?? 0
                  memberShare = (memberPct / 100) * teamHrs
                } else {
                  // Equal split among project-assigned team members
                  const projMembers = projectMembersMap[d.project_id]
                  const assignedTeamMembers = projMembers
                    ? activeMembers.filter(m => projMembers.has(m.id) && (m.team as { name?: string } | null)?.name === teamName).length
                    : teamMemberCount
                  const count = Math.max(1, assignedTeamMembers)
                  const teamSpecific = (d.team_hours as Record<string, number> | null)?.[teamName] ?? d.estimated_hours ?? 0
                  memberShare = teamSpecific / count
                }
                if (d.start_date) {
                  // Distribute proportionally by working days in this month vs full range
                  const monthWorkDays = workDaysInOverlap(start, end, delivStart, d.due_date)
                  const totalWorkDays = totalWorkDaysInDeliv(delivStart, d.due_date)
                  return s + memberShare * (monthWorkDays / totalWorkDays)
                }
                return s + memberShare
              }, 0)
            hours = Math.round(delivHours) + overheadHours
            const pct = capacity > 0 ? Math.round((hours / capacity) * 100) : 0
            return { hours, capacity, pct }
          }
        })

        const yearHours = Math.round(months.reduce((s, m) => s + m.hours, 0))
        const yearCap = Math.round(months.reduce((s, m) => s + m.capacity, 0))
        const yearPct = yearCap > 0 ? Math.round((yearHours / yearCap) * 100) : 0

        return { member, months, yearTotal: { hours: yearHours, capacity: yearCap, pct: yearPct } }
      })

      // Per-team unassigned: compute first so we can include in team totals
      let teamUnassignedMonths: number[] | null = null
      if (mode === 'estimated') {
        const teamNameLower = team.name.toLowerCase()
        const unassignedDelivs = deliverables.filter(d => {
          if (!d.team) return false
          const teamMatch = d.team.split(',').some(t => t.trim().toLowerCase() === teamNameLower)
          if (!teamMatch) return false
          if (d.member_percentages) return false
          const projMembers = projectMembersMap[d.project_id]
          if (!projMembers || projMembers.size === 0) return true
          const hasAssigned = activeMembers.some(m =>
            projMembers.has(m.id) &&
            (m.team as { name?: string } | null)?.name?.toLowerCase() === teamNameLower
          )
          return !hasAssigned
        })
        const teamMaintRows = maintTeamRows.filter(mr => mr.team_name.toLowerCase() === teamNameLower)
        const unassignedArr = Array.from({ length: 12 }, (_, i) => {
          const { start, end } = monthRange(year, i)
          let h = unassignedDelivs
            .filter(d => {
              const delivStart = d.start_date ?? d.due_date
              return workDaysInOverlap(start, end, delivStart, d.due_date) > 0
            })
            .reduce((s, d) => {
              const th = (d.team_hours as Record<string, number> | null)?.[team.name] ?? d.estimated_hours ?? 0
              if (d.start_date) {
                const monthWorkDays = workDaysInOverlap(start, end, d.start_date, d.due_date)
                const totalWorkDays = totalWorkDaysInDeliv(d.start_date, d.due_date)
                return s + th * (monthWorkDays / totalWorkDays)
              }
              return s + th
            }, 0)
          const ml = start.slice(0, 7)
          h += teamMaintRows
            .filter(mr => {
              const cs = mr.contract_start.slice(0, 7)
              const ce = mr.contract_end ? mr.contract_end.slice(0, 7) : '9999-12'
              return cs <= ml && ml <= ce
            })
            .reduce((s, mr) => s + mr.hours_per_month, 0)
          return Math.round(h)
        })
        if (unassignedArr.some(h => h > 0)) teamUnassignedMonths = unassignedArr
      }

      const teamMonths: MonthCell[] = Array.from({ length: 12 }, (_, i) => {
        const memberHours = memberRows.reduce((s, r) => s + r.months[i].hours, 0)
        const unassignedHours = teamUnassignedMonths?.[i] ?? 0
        const hours = memberHours + unassignedHours
        const capacity = memberRows.reduce((s, r) => s + r.months[i].capacity, 0)
        const pct = capacity > 0 ? Math.round((hours / capacity) * 100) : 0
        return { hours, capacity, pct }
      })
      const yearHours = Math.round(teamMonths.reduce((s, m) => s + m.hours, 0))
      const yearCap = Math.round(teamMonths.reduce((s, m) => s + m.capacity, 0))
      const yearPct = yearCap > 0 ? Math.round((yearHours / yearCap) * 100) : 0

      return { team, memberRows, months: teamMonths, yearTotal: { hours: yearHours, capacity: yearCap, pct: yearPct }, unassignedMonths: teamUnassignedMonths }
    }).filter(row => row.memberRows.length > 0)
  }, [teams, activeMembers, allocations, deliverables, allTimeOff, holidays, year, mode, memberCountByTeamName, projectMembersMap, maintTeamRows])

  // ── Global unassigned row: deliverables with NO team set ──────────────────
  const unassignedMonths = useMemo((): number[] | null => {
    if (mode !== 'estimated') return null
    const noTeam = deliverables.filter(d => !d.team || d.team.trim() === '')
    if (noTeam.length === 0) return null
    const months = Array.from({ length: 12 }, (_, i) => {
      const { start, end } = monthRange(year, i)
      const hours = noTeam
        .filter(d => {
          const delivStart = d.start_date ?? d.due_date
          return workDaysInOverlap(start, end, delivStart, d.due_date) > 0
        })
        .reduce((s, d) => {
          const h = d.estimated_hours ?? 0
          if (d.start_date) {
            const monthWorkDays = workDaysInOverlap(start, end, d.start_date, d.due_date)
            const totalWorkDays = totalWorkDaysInDeliv(d.start_date, d.due_date)
            return s + h * (monthWorkDays / totalWorkDays)
          }
          return s + h
        }, 0)
      return Math.round(hours)
    })
    return months.some(h => h > 0) ? months : null
  }, [deliverables, mode, year])

  // ── Per-project statistics (estimated mode) ───────────────────────────────
  const projectStats = useMemo(() => {
    if (mode !== 'estimated' || deliverables.length === 0) return []
    const byProject: Record<string, number> = {}
    deliverables.forEach(d => {
      byProject[d.project_id] = (byProject[d.project_id] ?? 0) + (d.estimated_hours ?? 0)
    })
    return Object.entries(byProject)
      .map(([projectId, hours]) => {
        const project = projectsStore.projects.find(p => p.id === projectId)
        return { projectId, name: project?.name ?? 'Unknown project', pn: project?.pn ?? '', hours }
      })
      .filter(r => r.hours > 0)
      .sort((a, b) => b.hours - a.hours)
  }, [deliverables, mode, projectsStore.projects])

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
                {teamRows.map(({ team, memberRows, months, yearTotal, unassignedMonths: teamUnassigned }) => {
                  const isExpanded = expandedTeams.has(team.id)
                  const teamUnassignedTotal = teamUnassigned ? teamUnassigned.reduce((s, h) => s + h, 0) : 0
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
                            {mode === 'estimated' && teamUnassignedTotal > 0 && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-1">
                                +{teamUnassignedTotal}h unassigned
                              </span>
                            )}
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

                      {isExpanded && teamUnassigned && (
                        <tr className="border-t border-dashed border-amber-200 bg-amber-50/40">
                          <td style={{ padding: '6px 16px 6px 36px' }}>
                            <div className="flex items-center gap-2">
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>?</div>
                              <span className="text-[12px] font-semibold text-amber-700 italic">Unassigned</span>
                            </div>
                          </td>
                          {teamUnassigned.map((h, i) => (
                            <td key={i} style={{ textAlign: 'center', padding: '6px 2px' }}>
                              {h > 0 ? (
                                <div style={{ background: '#fef3c7', borderRadius: 4, padding: '3px 2px', fontSize: 11, fontWeight: 600, color: '#92400e' }}>{h}h</div>
                              ) : null}
                            </td>
                          ))}
                          <td style={{ textAlign: 'center', padding: '6px 2px' }}>
                            <div style={{ background: '#fde68a', borderRadius: 4, padding: '3px 6px', fontSize: 11, fontWeight: 700, color: '#78350f' }}>{teamUnassignedTotal}h</div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>

            {/* Unassigned row */}
            {unassignedMonths && (
              <tr className="border-t-2 border-dashed border-[var(--c6)]">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#94a3b8', flexShrink: 0 }} />
                    <span className="font-bold text-sm text-[var(--c3)] italic">Unassigned</span>
                    <span className="text-xs text-[var(--c4)]">no team set</span>
                  </div>
                </td>
                {unassignedMonths.map((h, i) => (
                  <td key={i} style={{ textAlign: 'center', padding: '6px 2px' }}>
                    {h > 0 ? (
                      <div style={{ background: '#f1f5f9', borderRadius: 4, padding: '4px 2px', fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                        {h}h
                      </div>
                    ) : null}
                  </td>
                ))}
                <td style={{ textAlign: 'center', padding: '6px 2px' }}>
                  <div style={{ background: '#f1f5f9', borderRadius: 4, padding: '4px 6px', fontSize: 11, fontWeight: 700, color: '#475569' }}>
                    {unassignedMonths.reduce((s, h) => s + h, 0)}h
                  </div>
                </td>
              </tr>
            )}

            {teamRows.length === 0 && !loading && (
              <div className="text-center py-16 text-muted-foreground">
                No team members found. Add members in Settings → Team.
              </div>
            )}
          </Card>
        )}

        {/* ── Per-project statistics (estimated mode) ──────────────────────── */}
        {!loading && projectStats.length > 0 && (
          <Card className="mb-4">
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <span className="font-bold text-sm text-[var(--c0)]">Estimated Hours by Project</span>
                <span className="text-xs text-[var(--c4)]">{year}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {projectStats.map((p) => {
                  const maxH = projectStats[0].hours
                  const barPct = maxH > 0 ? Math.round((p.hours / maxH) * 100) : 0
                  const totalH = projectStats.reduce((s, x) => s + x.hours, 0)
                  const sharePct = totalH > 0 ? Math.round((p.hours / totalH) * 100) : 0
                  return (
                    <div key={p.projectId} className="flex flex-col gap-2 rounded-[10px] border border-border bg-white p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {p.pn && <div className="text-[10px] font-mono text-muted-foreground mb-0.5">{p.pn}</div>}
                          <div className="text-[13px] font-semibold text-foreground leading-tight truncate">{p.name}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[22px] font-extrabold font-[Manrope,sans-serif] text-foreground leading-none">{p.hours}<span className="text-[13px] font-semibold text-muted-foreground ml-0.5">h</span></div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{sharePct}% of total</div>
                        </div>
                      </div>
                      <div className="h-[5px] rounded-full bg-[var(--c7)] overflow-hidden">
                        <div style={{ height: '100%', width: `${barPct}%`, background: 'var(--navy)', borderRadius: 9999, transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Bottom sections ──────────────────────────────────────────────── */}
        {!loading && (criticalAlerts.length > 0 || topMembers.length > 0 || teamRows.length > 0) && (
          <div className={`grid gap-4 ${[criticalAlerts.length > 0, topMembers.length > 0, teamRows.length > 0].filter(Boolean).length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>

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

            {/* Team Utilization */}
            {teamRows.length > 0 && (
              <Card>
                <CardContent>
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-bold text-sm text-[var(--c0)]">Team Utilization</span>
                    <span className="text-xs text-[var(--c4)]">Year {year}</span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {teamRows.map(({ team, yearTotal }) => (
                      <div key={team.id} className="flex items-center gap-3">
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: team.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: team.color, flexShrink: 0 }}>
                          {team.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-[13px] text-[var(--c0)]">{team.name}</span>
                            <span className="text-xs font-bold shrink-0 font-[Manrope,sans-serif]" style={{ color: yearTotal.pct > 100 ? 'var(--red)' : yearTotal.pct >= 80 ? 'var(--green)' : 'var(--c3)' }}>
                              {yearTotal.pct}%
                              {yearTotal.pct > 100 && <span className="ml-1 text-[10px]">OVER</span>}
                            </span>
                          </div>
                          <div className="text-[11px] text-[var(--c4)]">{Math.round(yearTotal.hours)}h / {Math.round(yearTotal.capacity)}h cap</div>
                          <div className="h-[3px] rounded-sm bg-[var(--c6)] mt-1 overflow-hidden">
                            <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, yearTotal.pct)}%`, background: yearTotal.pct > 100 ? 'var(--red)' : yearTotal.pct >= 80 ? 'var(--green)' : 'var(--amber)' }} />
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
