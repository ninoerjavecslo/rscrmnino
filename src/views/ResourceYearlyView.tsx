import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useResourceStore } from '../stores/resource'
import { useHolidayStore } from '../stores/holidays'
import { workDaysInRange, timeOffWorkDays, holidayWorkDays } from '../lib/capacityUtils'
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

  const [year, setYear] = useState(new Date().getFullYear())
  const [mode, setMode] = useState<Mode>('allocated')
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())

  const [allocations, setAllocations] = useState<AllocRow[]>([])
  const [deliverables, setDeliverables] = useState<DelivRow[]>([])
  const [allTimeOff, setAllTimeOff] = useState<TimeOffRow[]>([])
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchTeams()
    fetchMembers()
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
    if (cell.capacity === 0) return <td style={{ textAlign: 'center', color: 'var(--c5)', fontSize: 12 }}>—</td>
    return (
      <td style={{ textAlign: 'center', padding: '3px 4px' }}>
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
      <div className="page-header">
        <div>
          <h1>Yearly Capacity Planning</h1>
          <p>Strategic allocation and team utilization for {year}.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y - 1)}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 15, minWidth: 40, textAlign: 'center' }}>{year}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y + 1)}>›</button>
          </div>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--c5)' }}>
            <button className={`btn btn-sm${mode === 'allocated' ? ' btn-primary' : ' btn-ghost'}`} style={{ borderRadius: 0, border: 'none' }} onClick={() => setMode('allocated')}>Allocated</button>
            <button className={`btn btn-sm${mode === 'estimated' ? ' btn-primary' : ' btn-ghost'}`} style={{ borderRadius: 0, border: 'none', borderLeft: '1px solid var(--c5)' }} onClick={() => setMode('estimated')}>Estimated</button>
          </div>
        </div>
      </div>

      <div className="page-content">

        {/* ── Stats strip ─────────────────────────────────────────────────── */}
        {!loading && totalCapacity > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
            {/* Total Billable Capacity */}
            <div className="card">
              <div className="card-body" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Total Billable Capacity</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--c0)', fontFamily: 'Manrope, sans-serif', lineHeight: 1 }}>
                  {totalCapacity.toLocaleString()}
                  <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--c3)', marginLeft: 6 }}>Hours</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--c4)', marginTop: 8 }}>
                  {activeMembers.length} active members
                </div>
              </div>
            </div>

            {/* Current Commitments */}
            <div className="card">
              <div className="card-body" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Current Commitments</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--c0)', fontFamily: 'Manrope, sans-serif', lineHeight: 1 }}>
                  {Math.round(totalCommitments).toLocaleString()}
                  <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--c3)', marginLeft: 6 }}>Hours</span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <div style={{ height: 4, borderRadius: 2, background: 'var(--c6)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, utilizationPct)}%`, background: utilizationPct > 100 ? 'var(--red)' : utilizationPct >= 80 ? 'var(--green)' : 'var(--amber)', transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--c4)', marginTop: 4 }}>{utilizationPct}% of total capacity utilized</div>
                </div>
              </div>
            </div>

            {/* Available for Sales */}
            <div className="card" style={{ background: 'var(--navy)', border: 'none' }}>
              <div className="card-body" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Available Capacity</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', fontFamily: 'Manrope, sans-serif', lineHeight: 1 }}>
                  {Math.round(availableHours).toLocaleString()}
                  <span style={{ fontSize: 16, fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginLeft: 6 }}>Hours</span>
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8 }}>
                  Unallocated hours for {year}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Heatmap legend ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--c3)', fontWeight: 600 }}>Utilization:</span>
          {[
            { label: '0–50%', bg: '#e2e8f0', color: 'var(--c3)' },
            { label: '50–80%', bg: '#64748b', color: '#fff' },
            { label: '80–95%', bg: '#334155', color: '#fff' },
            { label: '95–100%', bg: '#1e293b', color: '#fff' },
            { label: '>100%', bg: '#fee2e2', color: '#b91c1c' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 28, height: 20, background: l.bg, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: l.color }}>{l.label.split('–')[0]}</span>
              </div>
              <span style={{ fontSize: 12, color: 'var(--c3)' }}>{l.label}</span>
            </div>
          ))}
        </div>

        {/* ── Heatmap table ────────────────────────────────────────────────── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c4)' }}>Loading…</div>
        ) : (
          <div className="card" style={{ overflowX: 'auto', marginBottom: 24 }}>
            <table style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'var(--c7)' }}>
                  <th style={{ width: 200, textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase' }}>Team / Member</th>
                  {MONTHS.map(m => (
                    <th key={m} style={{ textAlign: 'center', padding: '10px 4px', fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', minWidth: 68 }}>{m}</th>
                  ))}
                  <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', minWidth: 68 }}>Year</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map(({ team, memberRows, months, yearTotal }) => {
                  const isExpanded = expandedTeams.has(team.id)
                  return (
                    <>
                      <tr key={team.id} onClick={() => toggleTeam(team.id)}
                        style={{ cursor: 'pointer', background: '#fafafa', borderTop: '2px solid var(--c6)' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, color: 'var(--c4)', lineHeight: 1 }}>{isExpanded ? '▼' : '▶'}</span>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: team.color, flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)' }}>{team.name}</span>
                            <span style={{ fontSize: 12, color: 'var(--c4)' }}>({memberRows.length})</span>
                          </div>
                        </td>
                        {months.map((cell, i) => <Cell key={i} cell={cell} bold />)}
                        <Cell cell={yearTotal} bold />
                      </tr>

                      {isExpanded && memberRows.map(({ member, months: mMonths, yearTotal: mYear }) => (
                        <tr key={member.id} style={{ borderTop: '1px solid var(--c6)' }}>
                          <td style={{ padding: '8px 16px 8px 36px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: team.color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: team.color, flexShrink: 0 }}>
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <Link to={`/team/${member.id}`} style={{ fontWeight: 600, fontSize: 13, color: 'var(--c0)', textDecoration: 'none' }}
                                  onClick={e => e.stopPropagation()}>{member.name}</Link>
                                {member.role && <div style={{ fontSize: 11, color: 'var(--c4)' }}>{member.role}</div>}
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
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c4)' }}>
                No team members found. Add members in Settings → Team.
              </div>
            )}
          </div>
        )}

        {/* ── Bottom sections ──────────────────────────────────────────────── */}
        {!loading && (criticalAlerts.length > 0 || topMembers.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Critical Alerts */}
            {criticalAlerts.length > 0 && (
              <div className="card">
                <div className="card-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)' }}>Critical Allocation Alerts</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {criticalAlerts.map((a, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: '#fff5f5', borderRadius: 8, borderLeft: '3px solid var(--red)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeLinecap="round" style={{ marginTop: 1, flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--c0)' }}>
                            {a.name} over-capacity ({a.month})
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--c3)', marginTop: 2 }}>
                            {a.type === 'team' ? 'Team' : 'Member'} at <strong style={{ color: 'var(--red)' }}>{a.pct}%</strong> utilization
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Lead Utilization */}
            {topMembers.length > 0 && (
              <div className="card">
                <div className="card-body">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)' }}>Lead Utilization</span>
                    <span style={{ fontSize: 12, color: 'var(--c4)' }}>Year {year}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {topMembers.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: m.teamColor + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: m.teamColor, flexShrink: 0 }}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <Link to={`/team/${m.id}`} style={{ fontWeight: 600, fontSize: 13, color: 'var(--c0)', textDecoration: 'none' }}>{m.name}</Link>
                            <span style={{ fontSize: 12, fontWeight: 700, color: m.pct > 100 ? 'var(--red)' : m.pct >= 80 ? 'var(--green)' : 'var(--c3)', fontFamily: 'Manrope, sans-serif', flexShrink: 0 }}>
                              {m.pct}%
                              {m.pct > 100 && <span style={{ marginLeft: 4, fontSize: 10 }}>OVER</span>}
                            </span>
                          </div>
                          {m.role && <div style={{ fontSize: 11, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{m.role}</div>}
                          <div style={{ height: 3, borderRadius: 2, background: 'var(--c6)', marginTop: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(100, m.pct)}%`, background: m.pct > 100 ? 'var(--red)' : m.pct >= 80 ? 'var(--green)' : 'var(--amber)' }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </>
  )
}
