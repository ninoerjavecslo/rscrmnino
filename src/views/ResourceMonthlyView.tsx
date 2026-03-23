import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useResourceStore } from '../stores/resource'
import { useHolidayStore } from '../stores/holidays'
import { workDaysInRange, holidayWorkDays } from '../lib/capacityUtils'
import { Button } from '@/components/ui/button'
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
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border -mx-6 -mt-6 mb-6">
        <div>
          <h1>Monthly Overview</h1>
          <p className="text-muted-foreground text-[13px] m-0">Team utilization by week</p>
        </div>
        <div className="flex gap-2 items-center">
          <Button variant="ghost" size="sm" onClick={() => setMonthOffset(o => o - 1)}>← Prev</Button>
          <span className="font-semibold min-w-[140px] text-center">{monthLabel}</span>
          <Button variant="ghost" size="sm" onClick={() => setMonthOffset(o => o + 1)} disabled={monthOffset >= 0}>Next →</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Active</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{activeMembers.length}</div>
          <div className="text-xs text-muted-foreground mt-1">members</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Total Hours</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{totalHours}h</div>
          <div className="text-xs text-muted-foreground mt-1">{monthLabel}</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Weeks</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{weeks.length}</div>
          <div className="text-xs text-muted-foreground mt-1">in month</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Avg / Member</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{activeMembers.length > 0 ? Math.round(totalHours / activeMembers.length) : 0}h</div>
          <div className="text-xs text-muted-foreground mt-1">this month</div>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-2">Loading...</p>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            {/* Header row */}
            <div
              className="gap-0 px-4 py-[10px] border-b-2 border-border bg-[var(--c7)] grid"
              style={{ gridTemplateColumns: `24px 1fr 140px 80px ${weeks.map(() => '72px').join(' ')}` }}
            >
              <div />
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[.5px]">Member</div>
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[.5px]">Progress</div>
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[.5px] text-center">Total</div>
              {weeks.map((w, i) => (
                <div key={w} className="text-xs font-bold text-[var(--c2)] text-center">W{i + 1}</div>
              ))}
            </div>

            {sortedMembers.length === 0 && (
              <div className="px-4 py-8 text-center text-muted-foreground">No active team members.</div>
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
                <div key={member.id} className={isLast && !expanded ? '' : 'border-b border-[var(--c6)]'}>
                  {/* Summary row */}
                  <div
                    className="gap-0 px-4 py-3 cursor-pointer items-center grid"
                    style={{ gridTemplateColumns: `24px 1fr 140px 80px ${weeks.map(() => '72px').join(' ')}` }}
                    onClick={() => setExpandedIds(prev => { const n = new Set(prev); n.has(member.id) ? n.delete(member.id) : n.add(member.id); return n })}
                  >
                    <span className="text-muted-foreground text-[11px]">{expanded ? '▼' : '▶'}</span>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[15px]">{member.name}</span>
                        {member.team && (
                          <span
                            className="text-[11px] font-semibold px-[7px] py-[2px] rounded"
                            style={{ color: member.team.color, background: `${member.team.color}20` }}
                          >
                            {member.team.name}
                          </span>
                        )}
                      </div>
                      {member.role && <div className="text-xs text-muted-foreground mt-[1px]">{member.role}</div>}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-[6px] bg-[var(--c6)] rounded-[3px] overflow-hidden">
                        <div style={{ width: `${Math.min(utilPct, 100)}%`, height: '100%', background: utilPct > 100 ? 'var(--red)' : utilPct >= 80 ? 'var(--green)' : 'var(--amber)', borderRadius: 3 }} />
                      </div>
                      <span
                        className="text-xs font-bold min-w-[36px]"
                        style={{ color: utilPct > 100 ? 'var(--red)' : utilPct >= 80 ? 'var(--green)' : 'var(--amber)' }}
                      >{utilPct}%</span>
                    </div>

                    <div className="text-center font-extrabold text-[15px]">{totalHrs}h</div>

                    {weeks.map(w => {
                      const wHours = memberWeekHours(member.id, w)
                      const wCap = weekWorkDays(w) * (member.hours_per_day ?? 8)
                      const cs = weekCellStyle(wHours, wCap)
                      return (
                        <div key={w} className="flex justify-center">
                          <div
                            className="w-[58px] h-8 rounded flex items-center justify-center text-[13px] font-bold"
                            style={{ background: cs.background, color: cs.color }}
                          >
                            {wHours === 0 ? '—' : `${wHours}h`}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Expanded — week breakdown */}
                  {expanded && (
                    <div className="border-t border-border bg-[var(--c7)]">
                      {weeks.map((w, wi) => {
                        const groups = memberWeekGroups(member.id, w)
                        const wTotal = memberWeekHours(member.id, w)
                        if (groups.length === 0) return null
                        const wStart = new Date(w + 'T00:00:00')
                        const wFriday = new Date(wStart.getFullYear(), wStart.getMonth(), wStart.getDate() + 4)
                        const wLabel = `W${wi + 1} — ${wStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${wFriday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                        return (
                          <div key={w} className="px-4 py-3 pl-10 border-b border-border">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-bold text-[var(--c2)]">{wLabel}</span>
                              <span className="text-[13px] font-extrabold text-[var(--c0)]">{wTotal}h</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              {groups.map(g => (
                                <div key={g.key} className="flex items-center gap-[10px]">
                                  <span
                                    className="text-[11px] font-semibold px-[7px] py-[2px] rounded capitalize whitespace-nowrap"
                                    style={{ background: CAT_BG[g.category] ?? 'var(--c7)', color: CAT_COLOR[g.category] ?? 'var(--c2)' }}
                                  >
                                    {g.category}
                                  </span>
                                  <span className="text-[13px] text-[var(--c1)] flex-1">{g.label}</span>
                                  <span className="text-[13px] font-bold text-[var(--c0)]">{g.hours}h</span>
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
          <div className="mt-3 flex gap-[14px] flex-wrap items-center px-1 py-[6px]">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-[.5px]">Week capacity:</span>
            {[
              { label: '0h', bg: 'var(--c6)', color: 'var(--c4)' },
              { label: '<40%', bg: 'var(--c7)', color: 'var(--c3)' },
              { label: '40–79%', bg: '#fff8e1', color: '#e67700' },
              { label: '80–100%', bg: '#c8e6c9', color: 'var(--green)' },
              { label: '>100%', bg: '#ffcdd2', color: 'var(--red)' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-[5px]">
                <div className="w-[14px] h-[14px] rounded-[3px] border border-border" style={{ background: item.bg }} />
                <span className="text-[11px] font-semibold" style={{ color: item.color }}>{item.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
