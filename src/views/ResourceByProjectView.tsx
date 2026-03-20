import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
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
    <div style={{ display: 'flex', background: 'var(--c6)', borderRadius: 8, padding: 3, gap: 2 }}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: '5px 14px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 500,
            background: value === opt ? '#fff' : 'transparent',
            color: value === opt ? 'var(--c0)' : 'var(--c3)',
            boxShadow: value === opt ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}
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

  /* ── shared cell style ────────────────────────────────────────── */
  const thStyle: React.CSSProperties = {
    padding: '10px 12px',
    textAlign: 'center',
    borderBottom: '2px solid var(--c5)',
    minWidth: 90,
    color: 'var(--c2)',
    fontWeight: 600,
    fontSize: 12,
    background: 'var(--c7)',
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1>{viewMode === 'project' ? 'By Project' : 'By People'}</h1>
          <p style={{ color: 'var(--c3)', fontSize: 13, margin: 0 }}>
            Allocation grouped by {viewMode === 'project' ? 'project' : 'team member'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              timeMode === 'weekly'
                ? setWeekOffset(o => o - 1)
                : setMonthOffset(o => o - 1)
            }
          >
            ← Prev
          </button>
          <span style={{ fontWeight: 600, minWidth: 180, textAlign: 'center' }}>
            {periodLabel}
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() =>
              timeMode === 'weekly'
                ? setWeekOffset(o => o + 1)
                : setMonthOffset(o => o + 1)
            }
            disabled={timeMode === 'weekly' ? weekOffset >= 0 : monthOffset >= 0}
          >
            Next →
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="stats-strip">
        <div className="stat-card">
          <div className="stat-card-label">
            {viewMode === 'project' ? 'Total Projects' : 'Total Members'}
          </div>
          <div className="stat-card-value">
            {viewMode === 'project' ? totalProjects : totalMembers}
          </div>
          <div className="stat-card-sub">with allocations</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Total Hours</div>
          <div className="stat-card-value">{totalHours}h</div>
          <div className="stat-card-sub">
            {viewMode === 'project' ? 'project time' : 'team time'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Period</div>
          <div className="stat-card-value" style={{ fontSize: 14 }}>
            {timeMode === 'weekly' ? 'Weekly' : 'Monthly'}
          </div>
          <div className="stat-card-sub">{statLabel}</div>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--c3)', padding: '8px 0' }}>Loading...</p>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          {isEmpty ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--c4)',
                fontSize: 15,
              }}
            >
              {emptyText}
            </div>
          ) : viewMode === 'project' ? (
            /* ── BY PROJECT TABLE ─────────────────────────────────── */
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th
                    style={{
                      ...thStyle,
                      textAlign: 'left',
                      borderBottom: '2px solid var(--c5)',
                      minWidth: 180,
                    }}
                  >
                    Project
                  </th>
                  {columns.map(col => (
                    <th key={col} style={thStyle}>
                      {colHeader(col)}
                    </th>
                  ))}
                  <th
                    style={{
                      ...thStyle,
                      textAlign: 'right',
                    }}
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: idx < projectRows.length - 1 ? '1px solid var(--c6)' : 'none',
                      background: idx % 2 === 1 ? 'var(--c7)' : undefined,
                    }}
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c0)' }}>
                        {row.name}
                      </div>
                      {row.pn && (
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--navy)',
                            fontFamily: 'monospace',
                            marginTop: 2,
                          }}
                        >
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
                          style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top' }}
                        >
                          {hrs > 0 ? (
                            <div>
                              <div
                                style={{
                                  display: 'inline-block',
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  background: 'var(--navy-light)',
                                  color: 'var(--navy)',
                                  fontWeight: 700,
                                  fontSize: 13,
                                  marginBottom: names.length > 0 ? 4 : 0,
                                }}
                              >
                                {hrs}h
                              </div>
                              {names.length > 0 && (
                                <div
                                  style={{ fontSize: 10, color: 'var(--c3)', lineHeight: 1.4 }}
                                >
                                  {names.join(', ')}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--c5)', fontSize: 14 }}>—</span>
                          )}
                        </td>
                      )
                    })}
                    <td
                      style={{
                        padding: '10px 14px',
                        textAlign: 'right',
                        fontWeight: 800,
                        fontSize: 14,
                        color: 'var(--c0)',
                      }}
                    >
                      {row.total}h
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--c5)', background: 'var(--c7)' }}>
                  <td
                    style={{
                      padding: '8px 14px',
                      fontWeight: 700,
                      fontSize: 13,
                      color: 'var(--c2)',
                    }}
                  >
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
                        style={{
                          padding: '8px 12px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: 13,
                          color: 'var(--c1)',
                        }}
                      >
                        {colTotal > 0 ? `${colTotal}h` : '—'}
                      </td>
                    )
                  })}
                  <td
                    style={{
                      padding: '8px 14px',
                      textAlign: 'right',
                      fontWeight: 800,
                      fontSize: 14,
                      color: 'var(--c0)',
                    }}
                  >
                    {totalHours}h
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            /* ── BY PEOPLE TABLE ──────────────────────────────────── */
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th
                    style={{
                      ...thStyle,
                      textAlign: 'left',
                      borderBottom: '2px solid var(--c5)',
                      minWidth: 160,
                    }}
                  >
                    Member
                  </th>
                  {columns.map(col => (
                    <th key={col} style={thStyle}>
                      {colHeader(col)}
                    </th>
                  ))}
                  <th
                    style={{
                      ...thStyle,
                      textAlign: 'right',
                    }}
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {peopleRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: idx < peopleRows.length - 1 ? '1px solid var(--c6)' : 'none',
                      background: idx % 2 === 1 ? 'var(--c7)' : undefined,
                    }}
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c0)' }}>
                        {row.name}
                      </div>
                    </td>
                    {columns.map(col => {
                      const hrs = row.colHours[col] ?? 0
                      const projects = row.colProjects[col] ?? []
                      return (
                        <td
                          key={col}
                          style={{ padding: '8px 10px', textAlign: 'center', verticalAlign: 'top' }}
                        >
                          {hrs > 0 ? (
                            <div>
                              <div
                                style={{
                                  display: 'inline-block',
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  background: 'var(--navy-light)',
                                  color: 'var(--navy)',
                                  fontWeight: 700,
                                  fontSize: 13,
                                  marginBottom: projects.length > 0 ? 4 : 0,
                                }}
                              >
                                {hrs}h
                              </div>
                              {projects.length > 0 && (
                                <div
                                  style={{ fontSize: 10, color: 'var(--c3)', lineHeight: 1.4 }}
                                >
                                  {projects.join(', ')}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--c5)', fontSize: 14 }}>—</span>
                          )}
                        </td>
                      )
                    })}
                    <td
                      style={{
                        padding: '10px 14px',
                        textAlign: 'right',
                        fontWeight: 800,
                        fontSize: 14,
                        color: 'var(--c0)',
                      }}
                    >
                      {row.total}h
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--c5)', background: 'var(--c7)' }}>
                  <td
                    style={{
                      padding: '8px 14px',
                      fontWeight: 700,
                      fontSize: 13,
                      color: 'var(--c2)',
                    }}
                  >
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
                        style={{
                          padding: '8px 12px',
                          textAlign: 'center',
                          fontWeight: 700,
                          fontSize: 13,
                          color: 'var(--c1)',
                        }}
                      >
                        {colTotal > 0 ? `${colTotal}h` : '—'}
                      </td>
                    )
                  })}
                  <td
                    style={{
                      padding: '8px 14px',
                      textAlign: 'right',
                      fontWeight: 800,
                      fontSize: 14,
                      color: 'var(--c0)',
                    }}
                  >
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
