import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useResourceStore } from '../stores/resource'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { ResourceAllocation, AllocationCategory } from '../lib/types'

/* ── helpers ──────────────────────────────────────────────────── */

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const today = localDate(new Date())
const firstOfMonth = today.slice(0, 7) + '-01'

/** Count Mon–Fri days between two YYYY-MM-DD strings (inclusive). */
function countWorkingDays(from: string, to: string): number {
  const start = new Date(from + 'T00:00:00')
  const end   = new Date(to   + 'T00:00:00')
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

/* ── category config ──────────────────────────────────────────── */

const CATS: { value: AllocationCategory; label: string; color: string }[] = [
  { value: 'project',     label: 'Project',     color: 'var(--navy)'  },
  { value: 'maintenance', label: 'Maintenance', color: '#c2410c'      },
  { value: 'internal',    label: 'Internal',    color: 'var(--blue)'  },
  { value: 'meeting',     label: 'Meeting',     color: '#e67700'      },
  { value: 'admin',       label: 'Admin',       color: 'var(--c3)'    },
  { value: 'leave',       label: 'Leave',       color: 'var(--red)'   },
]

function catInfo(c: AllocationCategory) {
  return CATS.find(x => x.value === c) ?? { value: c, label: c, color: 'var(--c3)' }
}

/* ── sub-components ───────────────────────────────────────────── */

function UtilBar({ pct }: { pct: number }) {
  const bg = pct > 100 ? 'var(--red)' : pct > 70 ? 'var(--green)' : 'var(--amber)'
  return (
    <div className="w-20 h-[6px] bg-[var(--c6)] rounded-[3px] overflow-hidden">
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: bg }} />
    </div>
  )
}

/* ── main view ────────────────────────────────────────────────── */

export function ResourceReportsView() {
  const [from, setFrom] = useState(firstOfMonth)
  const [to,   setTo]   = useState(today)
  const [allocations, setAllocations] = useState<ResourceAllocation[]>([])
  const [loading, setLoading] = useState(false)

  const members      = useResourceStore(s => s.members)
  const fetchMembers = useResourceStore(s => s.fetchMembers)

  /* fetch members once */
  useEffect(() => { fetchMembers() }, [fetchMembers])

  /* fetch allocations whenever range changes */
  useEffect(() => {
    if (!from || !to || from > to) return
    setLoading(true)
    supabase
      .from('resource_allocations')
      .select('*, member:team_members(id, name), project:projects(id, pn, name)')
      .gte('date', from)
      .lte('date', to)
      .order('date')
      .then(({ data }) => {
        setAllocations((data ?? []) as ResourceAllocation[])
        setLoading(false)
      })
  }, [from, to])

  /* ── derived numbers ──────────────────────────────────────────── */

  const totalHours    = allocations.reduce((s, a) => s + a.hours, 0)
  const billableHours = allocations.filter(a => a.is_billable === true).reduce((s, a) => s + a.hours, 0)
  const unplannedHours = allocations.filter(a => a.is_unplanned === true).reduce((s, a) => s + a.hours, 0)

  const billablePct   = totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0
  const unplannedPct  = totalHours > 0 ? Math.round((unplannedHours / totalHours) * 100) : 0

  const workDays = countWorkingDays(from, to)

  /* avg utilization: only members who appear in allocations */
  const activeMemberIds = [...new Set(allocations.map(a => a.member_id))]
  const avgUtil = activeMemberIds.length === 0 ? 0 : Math.round(
    activeMemberIds.reduce((sum, mid) => {
      const mHours = allocations.filter(a => a.member_id === mid).reduce((s, a) => s + a.hours, 0)
      const capacity = workDays * 8
      return sum + (capacity > 0 ? (mHours / capacity) * 100 : 0)
    }, 0) / activeMemberIds.length
  )

  /* ── by-member rows ───────────────────────────────────────────── */

  interface MemberRow {
    id: string
    name: string
    total: number
    billable: number
    unplanned: number
    categories: { cat: AllocationCategory; hours: number }[]
    utilPct: number
  }

  const memberRows: MemberRow[] = activeMemberIds.map(mid => {
    const mAllocs = allocations.filter(a => a.member_id === mid)
    const total   = mAllocs.reduce((s, a) => s + a.hours, 0)
    const billable   = mAllocs.filter(a => a.is_billable).reduce((s, a) => s + a.hours, 0)
    const unplanned  = mAllocs.filter(a => a.is_unplanned).reduce((s, a) => s + a.hours, 0)
    const catMap = new Map<AllocationCategory, number>()
    for (const a of mAllocs) catMap.set(a.category, (catMap.get(a.category) ?? 0) + a.hours)
    const categories = [...catMap.entries()].map(([cat, hours]) => ({ cat, hours })).sort((a, b) => b.hours - a.hours)
    const capacity = workDays * 8
    const utilPct = capacity > 0 ? Math.round((total / capacity) * 100) : 0
    const memberInfo = members.find(m => m.id === mid) ?? mAllocs[0]?.member
    const name = memberInfo?.name ?? mid
    return { id: mid, name, total, billable, unplanned, categories, utilPct }
  }).sort((a, b) => b.total - a.total)

  /* ── by-category rows ─────────────────────────────────────────── */

  const catTotals = CATS.map(cat => {
    const hours = allocations.filter(a => a.category === cat.value).reduce((s, a) => s + a.hours, 0)
    return { ...cat, hours }
  }).filter(c => c.hours > 0)

  const maxCatHours = Math.max(...catTotals.map(c => c.hours), 1)

  /* ── by-project rows ──────────────────────────────────────────── */

  interface ProjectRow {
    id: string
    pn: string
    name: string
    total: number
    billable: number
    memberNames: string[]
  }

  const projectAllocs = allocations.filter(a => a.category === 'project' && a.project_id)
  const projectIds = [...new Set(projectAllocs.map(a => a.project_id as string))]

  const projectRows: ProjectRow[] = projectIds.map(pid => {
    const pAllocs = projectAllocs.filter(a => a.project_id === pid)
    const total   = pAllocs.reduce((s, a) => s + a.hours, 0)
    const billable = pAllocs.filter(a => a.is_billable).reduce((s, a) => s + a.hours, 0)
    const pInfo   = pAllocs[0]?.project
    const memberNames = [...new Set(
      pAllocs.map(a => a.member?.name ?? members.find(m => m.id === a.member_id)?.name ?? a.member_id)
    )]
    return {
      id: pid,
      pn:   pInfo?.pn   ?? '',
      name: pInfo?.name ?? pid,
      total,
      billable,
      memberNames,
    }
  }).sort((a, b) => b.total - a.total)

  /* ── unplanned log ────────────────────────────────────────────── */

  const unplannedLog = allocations.filter(a => a.is_unplanned === true)

  /* ── quick range presets ──────────────────────────────────────── */

  function setThisWeek() {
    const d = new Date()
    const day = d.getDay()
    const mon = new Date(d)
    mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
    const fri = new Date(mon)
    fri.setDate(mon.getDate() + 4)
    setFrom(localDate(mon))
    setTo(localDate(fri))
  }

  function setLastWeek() {
    const d = new Date()
    const day = d.getDay()
    const mon = new Date(d)
    mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1) - 7)
    const fri = new Date(mon)
    fri.setDate(mon.getDate() + 4)
    setFrom(localDate(mon))
    setTo(localDate(fri))
  }

  function setThisMonth() {
    setFrom(today.slice(0, 7) + '-01')
    setTo(today)
  }

  function setLastMonth() {
    const d = new Date()
    const first = new Date(d.getFullYear(), d.getMonth() - 1, 1)
    const last  = new Date(d.getFullYear(), d.getMonth(), 0)
    setFrom(localDate(first))
    setTo(localDate(last))
  }

  /* ── shared th class ──────────────────────────────────────────── */
  const thClass = 'px-4 py-[10px] text-xs font-semibold text-[var(--c2)] bg-[var(--c7)]'

  /* ── render ───────────────────────────────────────────────────── */

  return (
    <div className="flex-1 overflow-auto p-6">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border -mx-6 -mt-6 mb-6">
        <div>
          <h1>Resource Reports</h1>
          <p className="text-muted-foreground text-[13px] m-0">Allocation analytics by member, category and project</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap justify-end">
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={setThisWeek}>This week</Button>
            <Button variant="ghost" size="sm" onClick={setLastWeek}>Last week</Button>
            <Button variant="ghost" size="sm" onClick={setThisMonth}>This month</Button>
            <Button variant="ghost" size="sm" onClick={setLastMonth}>Last month</Button>
          </div>
          <div className="flex gap-[6px] items-center">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="text-[13px] px-2 py-[5px] border border-border rounded text-[var(--c1)]" />
            <span className="text-muted-foreground">→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="text-[13px] px-2 py-[5px] border border-border rounded text-[var(--c1)]" />
          </div>
        </div>
      </div>

      {loading && <p className="text-muted-foreground py-2">Loading...</p>}

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Total Hours</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{totalHours.toFixed(1)}h</div>
          <div className="text-xs text-muted-foreground mt-1">{workDays} working days</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Billable %</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{billablePct}%</div>
          <div className="text-xs text-muted-foreground mt-1">{billableHours.toFixed(1)}h billable</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Unplanned %</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{unplannedPct}%</div>
          <div className="text-xs text-muted-foreground mt-1">{unplannedHours.toFixed(1)}h unplanned</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Avg Utilization</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{avgUtil}%</div>
          <div className="text-xs text-muted-foreground mt-1">{activeMemberIds.length} active members</div>
        </div>
      </div>

      {/* Section 1: By Member */}
      <div className="flex items-center justify-between mb-3 mt-6">By Member</div>
      <Card>
        <CardContent className="p-0">
          {memberRows.length === 0 ? (
            <p className="text-muted-foreground px-5 py-4">No data for this period.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={`${thClass} text-left`}>Member</th>
                  <th className={`${thClass} text-right`}>Total</th>
                  <th className={`${thClass} text-right`}>Billable</th>
                  <th className={`${thClass} text-right`}>Billable %</th>
                  <th className={`${thClass} text-right`}>Unplanned</th>
                  <th className={`${thClass} text-left`}>Utilization</th>
                  <th className={`${thClass} text-left`}>Categories</th>
                </tr>
              </thead>
              <tbody>
                {memberRows.map((row, i) => {
                  const billPct = row.total > 0 ? Math.round((row.billable / row.total) * 100) : 0
                  return (
                    <tr key={row.id} className={i < memberRows.length - 1 ? 'border-b border-[var(--c6)]' : ''}>
                      <td className="px-4 py-[10px] font-semibold text-sm">{row.name}</td>
                      <td className="px-4 py-[10px] text-right text-sm">{row.total.toFixed(1)}h</td>
                      <td className="px-4 py-[10px] text-right text-sm">{row.billable.toFixed(1)}h</td>
                      <td className="px-4 py-[10px] text-right text-sm">
                        <Badge variant={billPct >= 70 ? 'green' : billPct >= 40 ? 'amber' : 'red'}>
                          {billPct}%
                        </Badge>
                      </td>
                      <td className={`px-4 py-[10px] text-right text-sm ${row.unplanned > 0 ? 'text-[#d97706]' : 'text-muted-foreground'}`}>
                        {row.unplanned > 0 ? `${row.unplanned.toFixed(1)}h` : '—'}
                      </td>
                      <td className="px-4 py-[10px]">
                        <div className="flex items-center gap-2">
                          <UtilBar pct={row.utilPct} />
                          <span className="text-xs text-[var(--c2)]">{row.utilPct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-[10px]">
                        <div className="flex flex-wrap gap-1">
                          {row.categories.map(({ cat, hours }) => {
                            const ci = catInfo(cat)
                            return (
                              <span key={cat}
                                className="inline-flex items-center gap-1 px-[7px] py-[2px] rounded text-[11px] font-semibold"
                                style={{ background: ci.color + '18', color: ci.color, border: `1px solid ${ci.color}30` }}
                              >
                                {ci.label} {hours.toFixed(0)}h
                              </span>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Section 2: By Category */}
      <div className="flex items-center justify-between mb-3 mt-6">By Category</div>
      <Card>
        <CardContent>
          {catTotals.length === 0 ? (
            <p className="text-muted-foreground">No data for this period.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {catTotals.map(cat => {
                const pct = totalHours > 0 ? Math.round((cat.hours / totalHours) * 100) : 0
                const barWidth = Math.round((cat.hours / maxCatHours) * 100)
                return (
                  <div key={cat.value} className="flex items-center gap-3">
                    <div className="w-[100px] text-[13px] font-semibold flex-shrink-0" style={{ color: cat.color }}>
                      {cat.label}
                    </div>
                    <div className="flex-1 h-4 bg-[var(--c6)] rounded-[3px] overflow-hidden">
                      <div
                        className="h-full rounded transition-[width] duration-300"
                        style={{ width: `${barWidth}%`, background: cat.color }}
                      />
                    </div>
                    <div className="w-20 text-[13px] text-right text-[var(--c1)] flex-shrink-0">
                      {cat.hours.toFixed(1)}h
                    </div>
                    <div className="w-10 text-xs text-muted-foreground text-right flex-shrink-0">
                      {pct}%
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: By Project */}
      <div className="flex items-center justify-between mb-3 mt-6">By Project</div>
      <Card>
        <CardContent className="p-0">
          {projectRows.length === 0 ? (
            <p className="text-muted-foreground px-5 py-4">No project allocations in this period.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={`${thClass} text-left`}>Project #</th>
                  <th className={`${thClass} text-left`}>Project Name</th>
                  <th className={`${thClass} text-right`}>Total Hours</th>
                  <th className={`${thClass} text-right`}>Billable Hours</th>
                  <th className={`${thClass} text-left`}>Members</th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((row, i) => (
                  <tr key={row.id} className={i < projectRows.length - 1 ? 'border-b border-[var(--c6)]' : ''}>
                    <td className="px-4 py-[10px] text-[13px] text-primary">{row.pn}</td>
                    <td className="px-4 py-[10px] text-sm font-medium">{row.name}</td>
                    <td className="px-4 py-[10px] text-right text-sm">{row.total.toFixed(1)}h</td>
                    <td className="px-4 py-[10px] text-right text-sm text-[#16a34a]">{row.billable.toFixed(1)}h</td>
                    <td className="px-4 py-[10px] text-[13px] text-[var(--c2)]">{row.memberNames.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Section 4: Unplanned Work log */}
      <div className="flex items-center justify-between mb-3 mt-6">Unplanned Work</div>
      <Card>
        <CardContent className="p-0">
          {unplannedLog.length === 0 ? (
            <p className="text-muted-foreground px-5 py-4">No unplanned work in this period.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={`${thClass} text-left`}>Date</th>
                  <th className={`${thClass} text-left`}>Member</th>
                  <th className={`${thClass} text-left`}>Category</th>
                  <th className={`${thClass} text-left`}>Project</th>
                  <th className={`${thClass} text-right`}>Hours</th>
                  <th className={`${thClass} text-left`}>Description</th>
                </tr>
              </thead>
              <tbody>
                {unplannedLog.map((a, i) => {
                  const ci = catInfo(a.category)
                  const memberName = a.member?.name ?? members.find(m => m.id === a.member_id)?.name ?? a.member_id
                  return (
                    <tr key={a.id} className={i < unplannedLog.length - 1 ? 'border-b border-[var(--c6)]' : ''}>
                      <td className="px-4 py-[10px] text-[13px] text-[var(--c1)]">{a.date}</td>
                      <td className="px-4 py-[10px] text-sm font-medium">{memberName}</td>
                      <td className="px-4 py-[10px]">
                        <span
                          className="inline-block px-[7px] py-[2px] rounded text-[11px] font-semibold"
                          style={{ background: ci.color + '18', color: ci.color, border: `1px solid ${ci.color}30` }}
                        >
                          {ci.label}
                        </span>
                      </td>
                      <td className="px-4 py-[10px] text-[13px] text-primary">
                        {a.project ? `${a.project.pn} — ${a.project.name}` : (a.label ?? '—')}
                      </td>
                      <td className="px-4 py-[10px] text-right text-sm text-[#d97706]">
                        {a.hours.toFixed(1)}h
                      </td>
                      <td className="px-4 py-[10px] text-[13px] text-[var(--c2)]">{a.notes ?? a.label ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="h-10" />
    </div>
  )
}
