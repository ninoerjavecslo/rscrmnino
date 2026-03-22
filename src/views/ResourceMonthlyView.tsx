import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useResourceStore } from '../stores/resource'
import { useHolidayStore } from '../stores/holidays'
import { workDaysInRange, holidayWorkDays } from '../lib/capacityUtils'
import type { ResourceAllocation, CompanyHoliday } from '../lib/types'

/* ── helpers ──────────────────────────────────────────────────── */

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMonthRange(offset: number): { start: string; end: string; label: string } {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  const start = localDate(d)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { start, end: localDate(end), label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
}

function getWeeksInRange(start: string, end: string): string[] {
  const weeks: string[] = []
  const d = new Date(start + 'T00:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  while (localDate(d) <= end) {
    weeks.push(localDate(d))
    d.setDate(d.getDate() + 7)
  }
  return weeks
}

function weekDatesOf(monday: string): string[] {
  const d = new Date(monday + 'T00:00:00')
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
    return localDate(x)
  })
}

function countWorkDays(start: string, end: string): number {
  let count = 0
  const d = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')
  while (d <= endDate) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

function weekCellStyle(hours: number, capacity: number): { background: string; color: string } {
  if (hours === 0) return { background: 'transparent', color: 'var(--c5)' }
  const pct = capacity > 0 ? hours / capacity : 0
  if (pct > 1.05) return { background: '#ffcdd2', color: 'var(--red)' }
  if (pct >= 0.8) return { background: '#c8e6c9', color: 'var(--green)' }
  if (pct >= 0.4) return { background: '#fff8e1', color: '#e67700' }
  return { background: 'var(--c7)', color: 'var(--c3)' }
}

const CAT_COLOR: Record<string, string> = {
  project: 'var(--navy)', maintenance: 'var(--green)', internal: 'var(--blue)',
  meeting: '#e67700', admin: 'var(--c3)', leave: 'var(--red)',
}
const CAT_BG: Record<string, string> = {
  project: 'var(--navy-light)', maintenance: '#e8f5e9', internal: '#e8f4fd',
  meeting: '#fff3e0', admin: 'var(--c7)', leave: '#ffcdd2',
}

/* ── main view ────────────────────────────────────────────────── */

export function ResourceMonthlyView() {
  const [monthOffset, setMonthOffset] = useState(0)
  const [allocations, setAllocations] = useState<ResourceAllocation[]>([])
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const members = useResourceStore(s => s.members)
  const fetchMembers = useResourceStore(s => s.fetchMembers)
  const fetchHolidaysByRange = useHolidayStore(s => s.fetchByRange)

  useEffect(() => { fetchMembers() }, [fetchMembers])

  const { start: monthStart, end: monthEnd, label: monthLabel } = getMonthRange(monthOffset)
  const weeks = getWeeksInRange(monthStart, monthEnd)
  const workDays = countWorkDays(monthStart, monthEnd)
  const weekWorkDays = (monday: string) => weekDatesOf(monday).filter(d => {
    if (d < monthStart || d > monthEnd) return false
    const day = new Date(d + 'T00:00:00').getDay()
    return day !== 0 && day !== 6
  }).length

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase
        .from('resource_allocations')
        .select('*, member:team_members(id, name), project:projects(id, pn, name)')
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .order('date'),
      fetchHolidaysByRange(monthStart, monthEnd),
    ]).then(([allocRes, hols]) => {
      setAllocations((allocRes.data ?? []) as ResourceAllocation[])
      setHolidays(hols)
      setLoading(false)
    })
  }, [monthStart, monthEnd, fetchHolidaysByRange])

  const activeMembers = members.filter(m => m.active)

  function memberWeekHours(memberId: string, monday: string): number {
    return weekDatesOf(monday).reduce((sum, d) => {
      if (d < monthStart || d > monthEnd) return sum
      return sum + allocations.filter(a => a.member_id === memberId && a.date === d).reduce((s, a) => s + a.hours, 0)
    }, 0)
  }

  function memberMonthTotal(memberId: string): number {
    return allocations.filter(a => a.member_id === memberId).reduce((s, a) => s + a.hours, 0)
  }

  // Group allocations by week then by project/label key
  function memberWeekGroups(memberId: string, monday: string): { key: string; label: string; category: string; hours: number }[] {
    const allDays = weekDatesOf(monday)
    const weekAllocs = allocations.filter(a =>
      a.member_id === memberId && allDays.includes(a.date) && a.date >= monthStart && a.date <= monthEnd
    )
    const map: Record<string, { label: string; category: string; hours: number }> = {}
    for (const a of weekAllocs) {
      const key = `${a.category}:${a.project_id || a.label || a.category}`
      if (!map[key]) {
        map[key] = {
          label: a.project ? `${a.project.pn} — ${a.project.name}` : (a.label || a.category),
          category: a.category,
          hours: 0,
        }
      }
      map[key].hours += a.hours
    }
    return Object.entries(map).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.hours - a.hours)
  }

  const totalHours = allocations.reduce((s, a) => s + a.hours, 0)
  const sortedMembers = [...activeMembers].sort((a, b) => memberMonthTotal(b.id) - memberMonthTotal(a.id))

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>Monthly Overview</h1>
          <p style={{ color: 'var(--c3)', fontSize: 13, margin: 0 }}>Team utilization by week</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setMonthOffset(o => o - 1)}>← Prev</button>
          <span style={{ fontWeight: 600, minWidth: 140, textAlign: 'center' }}>{monthLabel}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMonthOffset(o => o + 1)} disabled={monthOffset >= 0}>Next →</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-strip">
        <div className="stat-card">
          <div className="stat-card-label">Active</div>
          <div className="stat-card-value">{activeMembers.length}</div>
          <div className="stat-card-sub">members</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Total Hours</div>
          <div className="stat-card-value">{totalHours}h</div>
          <div className="stat-card-sub">{monthLabel}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Weeks</div>
          <div className="stat-card-value">{weeks.length}</div>
          <div className="stat-card-sub">in month</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Avg / Member</div>
          <div className="stat-card-value">{activeMembers.length > 0 ? Math.round(totalHours / activeMembers.length) : 0}h</div>
          <div className="stat-card-sub">this month</div>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--c3)', padding: '8px 0' }}>Loading...</p>
      ) : (
        <>
          {/* Table */}
          <div className="card" style={{ overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: `24px 1fr 140px 80px ${weeks.map(() => '72px').join(' ')}`, gap: 0, padding: '10px 16px', borderBottom: '2px solid var(--c6)', background: 'var(--c7)' }}>
              <div />
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Member</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Progress</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '.5px', textAlign: 'center' }}>Total</div>
              {weeks.map((w, i) => (
                <div key={w} style={{ fontSize: 12, fontWeight: 700, color: 'var(--c2)', textAlign: 'center' }}>W{i + 1}</div>
              ))}
            </div>

            {sortedMembers.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--c4)' }}>No active team members.</div>
            )}

            {sortedMembers.map((member, idx) => {
              const totalHrs = memberMonthTotal(member.id)
              const monthDays = workDaysInRange(monthStart, monthEnd)
              const year = new Date(monthStart + 'T00:00:00').getFullYear()
              const holDays = holidayWorkDays(holidays, monthDays, member.team_id, year)
              const capacity = Math.max(0, workDays - holDays) * (member.hours_per_day ?? 8)
              const utilPct = capacity > 0 ? Math.round((totalHrs / capacity) * 100) : 0
              const expanded = expandedIds.has(member.id)
              const isLast = idx === sortedMembers.length - 1

              return (
                <div key={member.id} style={{ borderBottom: isLast && !expanded ? 'none' : '1px solid var(--c6)' }}>
                  {/* Summary row */}
                  <div
                    style={{ display: 'grid', gridTemplateColumns: `24px 1fr 140px 80px ${weeks.map(() => '72px').join(' ')}`, gap: 0, padding: '12px 16px', cursor: 'pointer', alignItems: 'center' }}
                    onClick={() => setExpandedIds(prev => { const n = new Set(prev); n.has(member.id) ? n.delete(member.id) : n.add(member.id); return n })}
                  >
                    <span style={{ color: 'var(--c4)', fontSize: 11 }}>{expanded ? '▼' : '▶'}</span>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>{member.name}</span>
                        {member.team && (
                          <span style={{ fontSize: 11, fontWeight: 600, color: member.team.color, background: `${member.team.color}20`, padding: '2px 7px', borderRadius: 4 }}>
                            {member.team.name}
                          </span>
                        )}
                      </div>
                      {member.role && <div style={{ fontSize: 12, color: 'var(--c4)', marginTop: 1 }}>{member.role}</div>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: 'var(--c6)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(utilPct, 100)}%`, height: '100%', background: utilPct > 100 ? 'var(--red)' : utilPct >= 80 ? 'var(--green)' : 'var(--amber)', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: utilPct > 100 ? 'var(--red)' : utilPct >= 80 ? 'var(--green)' : 'var(--amber)', minWidth: 36 }}>{utilPct}%</span>
                    </div>

                    <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 15 }}>{totalHrs}h</div>

                    {weeks.map(w => {
                      const wHours = memberWeekHours(member.id, w)
                      const wCap = weekWorkDays(w) * (member.hours_per_day ?? 8)
                      const cs = weekCellStyle(wHours, wCap)
                      return (
                        <div key={w} style={{ display: 'flex', justifyContent: 'center' }}>
                          <div style={{ width: 58, height: 32, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: cs.background, color: cs.color }}>
                            {wHours === 0 ? '—' : `${wHours}h`}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Expanded — week breakdown */}
                  {expanded && (
                    <div style={{ borderTop: '1px solid var(--c6)', background: 'var(--c7)' }}>
                      {weeks.map((w, wi) => {
                        const groups = memberWeekGroups(member.id, w)
                        const wTotal = memberWeekHours(member.id, w)
                        if (groups.length === 0) return null
                        const wStart = new Date(w + 'T00:00:00')
                        const wFriday = new Date(wStart.getFullYear(), wStart.getMonth(), wStart.getDate() + 4)
                        const wLabel = `W${wi + 1} — ${wStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${wFriday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                        return (
                          <div key={w} style={{ padding: '12px 16px 12px 40px', borderBottom: '1px solid var(--c6)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c2)' }}>{wLabel}</span>
                              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--c0)' }}>{wTotal}h</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {groups.map(g => (
                                <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: CAT_BG[g.category] ?? 'var(--c7)', color: CAT_COLOR[g.category] ?? 'var(--c2)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                                    {g.category}
                                  </span>
                                  <span style={{ fontSize: 13, color: 'var(--c1)', flex: 1 }}>{g.label}</span>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)' }}>{g.hours}h</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ marginTop: 12, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', padding: '6px 4px' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Week capacity:</span>
            {[
              { label: '0h', bg: 'var(--c6)', color: 'var(--c4)' },
              { label: '<40%', bg: 'var(--c7)', color: 'var(--c3)' },
              { label: '40–79%', bg: '#fff8e1', color: '#e67700' },
              { label: '80–100%', bg: '#c8e6c9', color: 'var(--green)' },
              { label: '>100%', bg: '#ffcdd2', color: 'var(--red)' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: item.bg, border: '1px solid var(--c5)' }} />
                <span style={{ fontSize: 11, color: item.color, fontWeight: 600 }}>{item.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
