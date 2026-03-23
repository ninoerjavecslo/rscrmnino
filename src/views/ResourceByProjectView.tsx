import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Button } from '@/components/ui/button'
import type { ResourceAllocation } from '../lib/types'

/* ── types ─────────────────────────────────────────────────────── */

type ViewMode = 'project' | 'people'
type TimeMode = 'weekly' | 'monthly'

/* ── helpers ──────────────────────────────────────────────────── */

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekRange(offset: number) {
  const d = new Date()
  const day = d.getDay()
  const mon = new Date(d)
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offset * 7)
  const fri = new Date(mon)
  fri.setDate(mon.getDate() + 4)
  const start = localDate(mon)
  const end = localDate(fri)
  const label = `${mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${fri.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  return { start, end, label, days: getDays(start) }
}

function getDays(weekStart: string): string[] {
  const d = new Date(weekStart + 'T00:00:00')
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
    return localDate(x)
  })
}

function getMonthRange(offset: number) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  const start = localDate(d)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const end = localDate(last)
  const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return { start, end, label, weeks: getWeeksInRange(start, end) }
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

function dayColLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]
  return `${dayName} ${d.getDate()}/${d.getMonth() + 1}`
}

function weekColLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dayBelongsToWeek(day: string, weekStart: string): boolean {
  const ws = new Date(weekStart + 'T00:00:00')
  const we = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + 4)
  const dd = new Date(day + 'T00:00:00')
  return dd >= ws && dd <= we
}

/* ── row types ─────────────────────────────────────────────────── */

interface ProjectRow {
  id: string
  pn: string
  name: string
  colHours: Record<string, number>
  colMembers: Record<string, string[]>
  total: number
}

interface PeopleRow {
  id: string
  name: string
  colHours: Record<string, number>
  colProjects: Record<string, string[]>
  total: number
}

interface TeamMember {
  id: string
  name: string
}

/* ── segmented toggle ───────────────────────────────────────────── */

function SegmentedToggle<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T
  options: T[]
  labels: Record<T, string>
  onChange: (v: T) => void
}) {
  return (
    <div className="flex bg-[var(--c6)] rounded-lg p-[3px] gap-0.5">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={[
            'px-[14px] py-[5px] rounded border-none cursor-pointer text-[13px] font-medium transition-all',
            value === opt
              ? 'bg-white text-[var(--c0)] shadow-sm'
              : 'bg-transparent text-[var(--c3)]',
          ].join(' ')}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  )
}

/* ── main view ────────────────────────────────────────────────── */

export function ResourceByProjectView() {
  const [viewMode, setViewMode] = useState<ViewMode>('project')
  const [timeMode, setTimeMode] = useState<TimeMode>('weekly')
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)
  const [allocations, setAllocations] = useState<ResourceAllocation[]>([])
  const [loading, setLoading] = useState(false)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  /* fetch active team members once */
  useEffect(() => {
    supabase
      .from('team_members')
      .select('id, name')
      .eq('active', true)
      .then(({ data }) => {
        setTeamMembers((data ?? []) as TeamMember[])
      })
  }, [])

  /* fetch allocations when period changes */
  useEffect(() => {
    const { start, end } =
      timeMode === 'weekly' ? getWeekRange(weekOffset) : getMonthRange(monthOffset)
    setLoading(true)
    supabase
      .from('resource_allocations')
      .select('*, member:team_members(id, name), project:projects(id, pn, name)')
      .gte('date', start)
      .lte('date', end)
      .order('date')
      .then(({ data }) => {
        setAllocations((data ?? []) as ResourceAllocation[])
        setLoading(false)
      })
  }, [weekOffset, monthOffset, timeMode])

  /* ── period metadata ──────────────────────────────────────────── */
  const weekRange = getWeekRange(weekOffset)
  const monthRange = getMonthRange(monthOffset)
  const periodLabel = timeMode === 'weekly' ? weekRange.label : monthRange.label
  const columns: string[] =
    timeMode === 'weekly' ? weekRange.days : monthRange.weeks

  /* ── build project rows ───────────────────────────────────────── */
  const projectMap = new Map<string, ProjectRow>()

  for (const a of allocations) {
    if (!a.project_id || !a.project) continue
    let row = projectMap.get(a.project_id)
    if (!row) {
      row = {
        id: a.project_id,
        pn: a.project.pn ?? '',
        name: a.project.name ?? a.project_id,
        colHours: {},
        colMembers: {},
        total: 0,
      }
      projectMap.set(a.project_id, row)
    }
    const colKey =
      timeMode === 'weekly'
        ? a.date
        : columns.find(w => dayBelongsToWeek(a.date, w)) ?? ''

    if (!colKey) continue
    row.colHours[colKey] = (row.colHours[colKey] ?? 0) + a.hours
    row.total += a.hours
    const memberName =
      a.member?.name ??
      teamMembers.find(m => m.id === a.member_id)?.name ??
      a.member_id
    if (!row.colMembers[colKey]) row.colMembers[colKey] = []
    if (!row.colMembers[colKey].includes(memberName)) {
      row.colMembers[colKey].push(memberName)
    }
  }

  const projectRows = [...projectMap.values()].sort((a, b) => b.total - a.total)

  /* ── build people rows ────────────────────────────────────────── */
  const peopleMap = new Map<string, PeopleRow>()

  for (const a of allocations) {
    let row = peopleMap.get(a.member_id)
    if (!row) {
      const memberName =
        a.member?.name ??
        teamMembers.find(m => m.id === a.member_id)?.name ??
        a.member_id
      row = {
        id: a.member_id,
        name: memberName,
        colHours: {},
        colProjects: {},
        total: 0,
      }
      peopleMap.set(a.member_id, row)
    }
    const colKey =
      timeMode === 'weekly'
        ? a.date
        : columns.find(w => dayBelongsToWeek(a.date, w)) ?? ''

    if (!colKey) continue
    row.colHours[colKey] = (row.colHours[colKey] ?? 0) + a.hours
    row.total += a.hours
    const projectLabel = a.project?.pn ?? a.project?.name ?? a.category ?? 'Other'
    if (!row.colProjects[colKey]) row.colProjects[colKey] = []
    if (!row.colProjects[colKey].includes(projectLabel)) {
      row.colProjects[colKey].push(projectLabel)
    }
  }

  const peopleRows = [...peopleMap.values()].sort((a, b) => b.total - a.total)

  /* ── stats ────────────────────────────────────────────────────── */
  const totalHours = allocations.reduce((s, a) => s + a.hours, 0)
  const totalProjects = projectMap.size
  const totalMembers = peopleMap.size
  const statLabel =
    timeMode === 'weekly'
      ? `Week of ${weekRange.label}`
      : monthRange.label

  /* ── empty message ────────────────────────────────────────────── */
  const isEmpty =
    viewMode === 'project' ? projectRows.length === 0 : peopleRows.length === 0
  const emptyText =
    viewMode === 'project'
      ? `No project allocations for this ${timeMode === 'weekly' ? 'week' : 'month'}.`
      : `No team allocations for this ${timeMode === 'weekly' ? 'week' : 'month'}.`

  /* ── column header label ──────────────────────────────────────── */
  const colHeader = (col: string) =>
    timeMode === 'weekly' ? dayColLabel(col) : weekColLabel(col)

  /* ── shared th classes ────────────────────────────────────────── */
  const thClass = 'px-3 py-[10px] text-center border-b-2 border-border min-w-[90px] text-[var(--c2)] font-semibold text-xs bg-[var(--c7)]'

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border -mx-6 -mt-6 mb-6">
        <div>
          <h1>{viewMode === 'project' ? 'By Project' : 'By People'}</h1>
          <p className="text-muted-foreground text-[13px] m-0">
            Allocation grouped by {viewMode === 'project' ? 'project' : 'team member'}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <SegmentedToggle<ViewMode>
            value={viewMode}
            options={['project', 'people']}
            labels={{ project: 'By Project', people: 'By People' }}
            onChange={setViewMode}
          />
          <SegmentedToggle<TimeMode>
            value={timeMode}
            options={['weekly', 'monthly']}
            labels={{ weekly: 'Weekly', monthly: 'Monthly' }}
            onChange={setTimeMode}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              timeMode === 'weekly'
                ? setWeekOffset(o => o - 1)
                : setMonthOffset(o => o - 1)
            }
          >
            ← Prev
          </Button>
          <span className="font-semibold min-w-[180px] text-center">
            {periodLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              timeMode === 'weekly'
                ? setWeekOffset(o => o + 1)
                : setMonthOffset(o => o + 1)
            }
            disabled={timeMode === 'weekly' ? weekOffset >= 0 : monthOffset >= 0}
          >
            Next →
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">
            {viewMode === 'project' ? 'Total Projects' : 'Total Members'}
          </div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">
            {viewMode === 'project' ? totalProjects : totalMembers}
          </div>
          <div className="text-xs text-muted-foreground mt-1">with allocations</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Total Hours</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{totalHours}h</div>
          <div className="text-xs text-muted-foreground mt-1">
            {viewMode === 'project' ? 'project time' : 'team time'}
          </div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Period</div>
          <div className="text-sm font-extrabold tracking-[-0.5px] mt-2 text-foreground">
            {timeMode === 'weekly' ? 'Weekly' : 'Monthly'}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{statLabel}</div>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground py-2">Loading...</p>
      ) : (
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-x-auto">
          {isEmpty ? (
            <div className="py-10 px-5 text-center text-muted-foreground text-[15px]">
              {emptyText}
            </div>
          ) : viewMode === 'project' ? (
            /* ── BY PROJECT TABLE ─────────────────────────────────── */
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={`${thClass} text-left min-w-[180px]`}>
                    Project
                  </th>
                  {columns.map(col => (
                    <th key={col} className={thClass}>
                      {colHeader(col)}
                    </th>
                  ))}
                  <th className={`${thClass} text-right`}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`${idx % 2 === 1 ? 'bg-[var(--c7)]' : ''} ${idx < projectRows.length - 1 ? 'border-b border-[var(--c6)]' : ''}`}
                  >
                    <td className="px-[14px] py-[10px]">
                      <div className="font-bold text-[13px] text-[var(--c0)]">
                        {row.name}
                      </div>
                      {row.pn && (
                        <div className="text-[11px] text-primary mt-0.5">
                          {row.pn}
                        </div>
                      )}
                    </td>
                    {columns.map(col => {
                      const hrs = row.colHours[col] ?? 0
                      const names = row.colMembers[col] ?? []
                      return (
                        <td
                          key={col}
                          className="px-[10px] py-2 text-center align-top"
                        >
                          {hrs > 0 ? (
                            <div>
                              <div
                                className={`inline-block px-[10px] py-1 rounded bg-[var(--navy-light)] text-primary font-bold text-[13px]${names.length > 0 ? ' mb-1' : ''}`}
                              >
                                {hrs}h
                              </div>
                              {names.length > 0 && (
                                <div className="text-[10px] text-muted-foreground leading-[1.4]">
                                  {names.join(', ')}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[var(--c5)] text-sm">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-[14px] py-[10px] text-right font-extrabold text-sm text-[var(--c0)]">
                      {row.total}h
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-[var(--c7)]">
                  <td className="px-[14px] py-2 font-bold text-[13px] text-[var(--c2)]">
                    Total
                  </td>
                  {columns.map(col => {
                    const colTotal = allocations
                      .filter(a =>
                        timeMode === 'weekly'
                          ? a.project_id && a.date === col
                          : a.project_id && dayBelongsToWeek(a.date, col)
                      )
                      .reduce((s, a) => s + a.hours, 0)
                    return (
                      <td
                        key={col}
                        className="px-3 py-2 text-center font-bold text-[13px] text-[var(--c1)]"
                      >
                        {colTotal > 0 ? `${colTotal}h` : '—'}
                      </td>
                    )
                  })}
                  <td className="px-[14px] py-2 text-right font-extrabold text-sm text-[var(--c0)]">
                    {totalHours}h
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            /* ── BY PEOPLE TABLE ──────────────────────────────────── */
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className={`${thClass} text-left min-w-[160px]`}>
                    Member
                  </th>
                  {columns.map(col => (
                    <th key={col} className={thClass}>
                      {colHeader(col)}
                    </th>
                  ))}
                  <th className={`${thClass} text-right`}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {peopleRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`${idx % 2 === 1 ? 'bg-[var(--c7)]' : ''} ${idx < peopleRows.length - 1 ? 'border-b border-[var(--c6)]' : ''}`}
                  >
                    <td className="px-[14px] py-[10px]">
                      <div className="font-bold text-[13px] text-[var(--c0)]">
                        {row.name}
                      </div>
                    </td>
                    {columns.map(col => {
                      const hrs = row.colHours[col] ?? 0
                      const projects = row.colProjects[col] ?? []
                      return (
                        <td
                          key={col}
                          className="px-[10px] py-2 text-center align-top"
                        >
                          {hrs > 0 ? (
                            <div>
                              <div
                                className={`inline-block px-[10px] py-1 rounded bg-[var(--navy-light)] text-primary font-bold text-[13px]${projects.length > 0 ? ' mb-1' : ''}`}
                              >
                                {hrs}h
                              </div>
                              {projects.length > 0 && (
                                <div className="text-[10px] text-muted-foreground leading-[1.4]">
                                  {projects.join(', ')}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[var(--c5)] text-sm">—</span>
                          )}
                        </td>
                      )
                    })}
                    <td className="px-[14px] py-[10px] text-right font-extrabold text-sm text-[var(--c0)]">
                      {row.total}h
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-[var(--c7)]">
                  <td className="px-[14px] py-2 font-bold text-[13px] text-[var(--c2)]">
                    Total
                  </td>
                  {columns.map(col => {
                    const colTotal = allocations
                      .filter(a =>
                        timeMode === 'weekly'
                          ? a.date === col
                          : dayBelongsToWeek(a.date, col)
                      )
                      .reduce((s, a) => s + a.hours, 0)
                    return (
                      <td
                        key={col}
                        className="px-3 py-2 text-center font-bold text-[13px] text-[var(--c1)]"
                      >
                        {colTotal > 0 ? `${colTotal}h` : '—'}
                      </td>
                    )
                  })}
                  <td className="px-[14px] py-2 text-right font-extrabold text-sm text-[var(--c0)]">
                    {totalHours}h
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
