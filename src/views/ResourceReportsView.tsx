import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useResourceStore } from '../stores/resource'
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
  return (
    <div style={{ width: 80, height: 6, background: 'var(--c6)', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        width: `${Math.min(pct, 100)}%`,
        height: '100%',
        background: pct > 100 ? 'var(--red)' : pct > 70 ? 'var(--green)' : 'var(--amber)',
      }} />
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

  /* ── render ───────────────────────────────────────────────────── */

  return (
    <div className="page-content">

      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Resource Reports</h1>
          <p style={{ color: 'var(--c3)', fontSize: 13, margin: 0 }}>Allocation analytics by member, category and project</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-ghost btn-sm" onClick={setThisWeek}>This week</button>
            <button className="btn btn-ghost btn-sm" onClick={setLastWeek}>Last week</button>
            <button className="btn btn-ghost btn-sm" onClick={setThisMonth}>This month</button>
            <button className="btn btn-ghost btn-sm" onClick={setLastMonth}>Last month</button>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ fontSize: 13, padding: '5px 8px', border: '1px solid var(--c5)', borderRadius: 'var(--r, 6px)', color: 'var(--c1)' }} />
            <span style={{ color: 'var(--c4)' }}>→</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ fontSize: 13, padding: '5px 8px', border: '1px solid var(--c5)', borderRadius: 'var(--r, 6px)', color: 'var(--c1)' }} />
          </div>
        </div>
      </div>

      {loading && <p style={{ color: 'var(--c3)', padding: '8px 0' }}>Loading...</p>}

      {/* Stats strip */}
      <div className="stats-strip">
        <div className="stat-card">
          <div className="stat-card-label">Total Hours</div>
          <div className="stat-card-value">{totalHours.toFixed(1)}h</div>
          <div className="stat-card-sub">{workDays} working days</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Billable %</div>
          <div className="stat-card-value">{billablePct}%</div>
          <div className="stat-card-sub">{billableHours.toFixed(1)}h billable</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Unplanned %</div>
          <div className="stat-card-value">{unplannedPct}%</div>
          <div className="stat-card-sub">{unplannedHours.toFixed(1)}h unplanned</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Avg Utilization</div>
          <div className="stat-card-value">{avgUtil}%</div>
          <div className="stat-card-sub">{activeMemberIds.length} active members</div>
        </div>
      </div>

      {/* Section 1: By Member */}
      <div className="section-bar" style={{ marginTop: 24 }}>By Member</div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {memberRows.length === 0 ? (
            <p style={{ color: 'var(--c3)', padding: '16px 20px' }}>No data for this period.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c6)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Member</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Total</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Billable</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Billable %</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Unplanned</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left',  fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Utilization</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left',  fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Categories</th>
                </tr>
              </thead>
              <tbody>
                {memberRows.map((row, i) => {
                  const billPct = row.total > 0 ? Math.round((row.billable / row.total) * 100) : 0
                  return (
                    <tr key={row.id} style={{ borderBottom: i < memberRows.length - 1 ? '1px solid var(--c6)' : 'none' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: 14 }}>{row.name}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 14, fontFamily: 'monospace' }}>{row.total.toFixed(1)}h</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 14, fontFamily: 'monospace' }}>{row.billable.toFixed(1)}h</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 14 }}>
                        <span className={billPct >= 70 ? 'badge badge-green' : billPct >= 40 ? 'badge badge-amber' : 'badge badge-red'}>
                          {billPct}%
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 14, fontFamily: 'monospace', color: row.unplanned > 0 ? 'var(--amber)' : 'var(--c3)' }}>
                        {row.unplanned > 0 ? `${row.unplanned.toFixed(1)}h` : '—'}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <UtilBar pct={row.utilPct} />
                          <span style={{ fontSize: 12, color: 'var(--c2)', fontFamily: 'monospace' }}>{row.utilPct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {row.categories.map(({ cat, hours }) => {
                            const ci = catInfo(cat)
                            return (
                              <span key={cat} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                background: ci.color + '18', color: ci.color,
                                border: `1px solid ${ci.color}30`,
                              }}>
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
        </div>
      </div>

      {/* Section 2: By Category */}
      <div className="section-bar" style={{ marginTop: 24 }}>By Category</div>
      <div className="card">
        <div className="card-body">
          {catTotals.length === 0 ? (
            <p style={{ color: 'var(--c3)' }}>No data for this period.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {catTotals.map(cat => {
                const pct = totalHours > 0 ? Math.round((cat.hours / totalHours) * 100) : 0
                const barWidth = Math.round((cat.hours / maxCatHours) * 100)
                return (
                  <div key={cat.value} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 100, fontSize: 13, fontWeight: 600, color: cat.color, flexShrink: 0 }}>
                      {cat.label}
                    </div>
                    <div style={{ flex: 1, height: 16, background: 'var(--c6)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        width: `${barWidth}%`,
                        height: '100%',
                        background: cat.color,
                        borderRadius: 3,
                        transition: 'width 0.3s',
                      }} />
                    </div>
                    <div style={{ width: 80, fontSize: 13, fontFamily: 'monospace', textAlign: 'right', color: 'var(--c1)', flexShrink: 0 }}>
                      {cat.hours.toFixed(1)}h
                    </div>
                    <div style={{ width: 40, fontSize: 12, color: 'var(--c3)', textAlign: 'right', flexShrink: 0 }}>
                      {pct}%
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section 3: By Project */}
      <div className="section-bar" style={{ marginTop: 24 }}>By Project</div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {projectRows.length === 0 ? (
            <p style={{ color: 'var(--c3)', padding: '16px 20px' }}>No project allocations in this period.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c6)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Project #</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Project Name</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Total Hours</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Billable Hours</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left',  fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Members</th>
                </tr>
              </thead>
              <tbody>
                {projectRows.map((row, i) => (
                  <tr key={row.id} style={{ borderBottom: i < projectRows.length - 1 ? '1px solid var(--c6)' : 'none' }}>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 13, color: 'var(--navy)' }}>{row.pn}</td>
                    <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 500 }}>{row.name}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 14, fontFamily: 'monospace' }}>{row.total.toFixed(1)}h</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 14, fontFamily: 'monospace', color: 'var(--green)' }}>{row.billable.toFixed(1)}h</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--c2)' }}>{row.memberNames.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Section 4: Unplanned Work log */}
      <div className="section-bar" style={{ marginTop: 24 }}>Unplanned Work</div>
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {unplannedLog.length === 0 ? (
            <p style={{ color: 'var(--c3)', padding: '16px 20px' }}>No unplanned work in this period.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c6)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Date</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Member</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Category</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Project</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Hours</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--c2)', background: 'var(--c7)' }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {unplannedLog.map((a, i) => {
                  const ci = catInfo(a.category)
                  const memberName = a.member?.name ?? members.find(m => m.id === a.member_id)?.name ?? a.member_id
                  return (
                    <tr key={a.id} style={{ borderBottom: i < unplannedLog.length - 1 ? '1px solid var(--c6)' : 'none' }}>
                      <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'monospace', color: 'var(--c1)' }}>{a.date}</td>
                      <td style={{ padding: '10px 16px', fontSize: 14, fontWeight: 500 }}>{memberName}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 7px', borderRadius: 4,
                          fontSize: 11, fontWeight: 600,
                          background: ci.color + '18', color: ci.color,
                          border: `1px solid ${ci.color}30`,
                        }}>
                          {ci.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--navy)' }}>
                        {a.project ? `${a.project.pn} — ${a.project.name}` : (a.label ?? '—')}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: 14, fontFamily: 'monospace', color: 'var(--amber)' }}>
                        {a.hours.toFixed(1)}h
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--c2)' }}>{a.notes ?? a.label ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ height: 40 }} />
    </div>
  )
}
