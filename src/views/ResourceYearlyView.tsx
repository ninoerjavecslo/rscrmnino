import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useResourceStore } from '../stores/resource'
import { useHolidayStore } from '../stores/holidays'
import { workDaysInRange, timeOffWorkDays, holidayWorkDays } from '../lib/capacityUtils'
import type { CompanyHoliday } from '../lib/types'

interface AllocRow { member_id: string; category: string; date: string; hours: number }
interface DelivRow { project_id: string; due_date: string; estimated_hours: number | null; team: string | null }
interface TimeOffRow { member_id: string; start_date: string; end_date: string }

type Mode = 'allocated' | 'estimated'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function cellColor(pct: number): string {
  if (pct === 0) return 'transparent'
  if (pct > 100) return '#ffcdd2'
  if (pct >= 80) return '#c8e6c9'
  if (pct >= 40) return '#fff9c4'
  return '#f5f5f5'
}
function cellTextColor(pct: number): string {
  if (pct > 100) return '#c62828'
  if (pct >= 80) return '#2e7d32'
  if (pct >= 40) return '#f57f17'
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
      : supabase.from('project_deliverables').select('project_id, due_date, estimated_hours, team').lte('due_date', yearEnd).gte('due_date', yearStart).neq('status', 'completed')

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

  // For estimated mode: count active members per team by name
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
            // Estimated: deliverables due in this month for this team
            const teamName = team.name
            const teamMemberCount = Math.max(1, memberCountByTeamName[teamName] ?? 1)
            const delivHours = deliverables
              .filter(d => d.due_date >= start && d.due_date <= end && (d.team === teamName || d.team === null))
              .reduce((s, d) => s + (d.estimated_hours ?? 0), 0)
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

      // Team aggregate
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
      <td style={{ textAlign: 'center', padding: '4px 6px' }}>
        <div style={{
          background: cellColor(cell.pct),
          color: cellTextColor(cell.pct),
          borderRadius: 6,
          padding: '5px 4px',
          fontWeight: bold ? 800 : 600,
          fontSize: 13,
          fontFamily: 'Manrope, sans-serif',
          lineHeight: 1.2,
        }}>
          {cell.pct}%
          <div style={{ fontSize: 9, fontWeight: 400, color: 'inherit', opacity: 0.75 }}>{cell.hours}h</div>
        </div>
      </td>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Yearly Capacity</h1>
          <p>Full-year capacity utilization by team and member.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y - 1)}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 15, minWidth: 40, textAlign: 'center' }}>{year}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setYear(y => y + 1)}>›</button>
          </div>
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--c5)' }}>
            <button
              className={`btn btn-sm${mode === 'allocated' ? ' btn-primary' : ' btn-ghost'}`}
              style={{ borderRadius: 0, border: 'none' }}
              onClick={() => setMode('allocated')}
            >Allocated</button>
            <button
              className={`btn btn-sm${mode === 'estimated' ? ' btn-primary' : ' btn-ghost'}`}
              style={{ borderRadius: 0, border: 'none', borderLeft: '1px solid var(--c5)' }}
              onClick={() => setMode('estimated')}
            >Estimated</button>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--c3)', fontWeight: 600 }}>Capacity Legend:</span>
          {[
            { label: 'Low (0–50%)', bg: '#f5f5f5', color: 'var(--c4)' },
            { label: 'Medium (50–80%)', bg: '#fff9c4', color: '#f57f17' },
            { label: 'High (80–100%)', bg: '#c8e6c9', color: '#2e7d32' },
            { label: 'Over (>100%)', bg: '#ffcdd2', color: '#c62828' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 14, height: 14, background: l.bg, border: `1px solid ${l.color}30`, borderRadius: 3 }} />
              <span style={{ fontSize: 12, color: 'var(--c3)' }}>{l.label}</span>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c4)' }}>Loading…</div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: 'var(--c7)' }}>
                  <th style={{ width: 180, textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase' }}>Team / Member</th>
                  {MONTHS.map(m => (
                    <th key={m} style={{ textAlign: 'center', padding: '10px 6px', fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', minWidth: 70 }}>{m}</th>
                  ))}
                  <th style={{ textAlign: 'center', padding: '10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', minWidth: 70 }}>Year</th>
                </tr>
              </thead>
              <tbody>
                {teamRows.map(({ team, memberRows, months, yearTotal }) => {
                  const isExpanded = expandedTeams.has(team.id)
                  return (
                    <>
                      {/* Team row */}
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

                      {/* Member rows (when expanded) */}
                      {isExpanded && memberRows.map(({ member, months: mMonths, yearTotal: mYear }) => (
                        <tr key={member.id} style={{ borderTop: '1px solid var(--c6)' }}>
                          <td style={{ padding: '8px 16px 8px 36px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: team.color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: team.color, flexShrink: 0 }}>
                                {member.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--c0)' }}>{member.name}</div>
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
      </div>
    </>
  )
}
