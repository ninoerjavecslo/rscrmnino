import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useRevenuePlannerStore } from '../../stores/revenuePlanner'
import { usePipelineStore } from '../../stores/pipeline'
import { useResourceStore } from '../../stores/resource'
import { useHolidayStore } from '../../stores/holidays'
import { supabase } from '../../lib/supabase'
import { workDaysInRange, adjustedCapacityForRange } from '../../lib/capacityUtils'
import type { TimeOff, RevenuePlanner, ResourceAllocation, PipelineItem } from '../../lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function toMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtEuro(n: number) {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €'
}

function dealTotal(item: PipelineItem): number {
  const amt = item.estimated_amount ?? 0
  if (item.deal_type === 'fixed' && item.monthly_schedule?.length) {
    return item.monthly_schedule.reduce((s, r) => s + r.amount, 0)
  }
  if (item.deal_type === 'monthly' && item.expected_month && item.expected_end_month) {
    const s = new Date(item.expected_month + 'T00:00:00')
    const e = new Date(item.expected_end_month + 'T00:00:00')
    const count = Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1)
    return amt * count
  }
  return amt
}

interface DigestDeliverable {
  id: string
  title: string
  status: string
  due_date: string
  project: { id: string; pn: string; name: string } | null
}

export function MonthlyDigestView() {
  const now = new Date()
  const [selectedMonthStr, setSelectedMonthStr] = useState(toMonthStr(now))
  const selectedMonth = selectedMonthStr + '-01'

  const rpStore = useRevenuePlannerStore()
  const plStore = usePipelineStore()
  const resourceStore = useResourceStore()
  const holidayStore = useHolidayStore()

  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [allocations, setAllocations] = useState<ResourceAllocation[]>([])
  const [deliverables, setDeliverables] = useState<DigestDeliverable[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const [yStr, moStr] = selectedMonthStr.split('-')
    const y = Number(yStr)
    const mo = Number(moStr)
    const lastDay = new Date(y, mo, 0).getDate()
    const monthStart = `${y}-${String(mo).padStart(2, '0')}-01`
    const monthEnd = `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    Promise.all([
      rpStore.fetchByMonths([selectedMonth]),
      plStore.fetchAll(),
      resourceStore.fetchMembers(),
      holidayStore.fetchAll(),
      supabase.from('time_off').select('*')
        .then(({ data }) => setTimeOff((data ?? []) as TimeOff[])),
      supabase.from('resource_allocations')
        .select('id, member_id, hours, is_billable, category, date')
        .gte('date', monthStart).lte('date', monthEnd)
        .then(({ data }) => setAllocations((data ?? []) as ResourceAllocation[])),
      supabase.from('project_deliverables')
        .select('id, title, status, due_date, project:projects(id, pn, name)')
        .gte('due_date', monthStart).lte('due_date', monthEnd)
        .order('due_date')
        .then(({ data }) => setDeliverables((data ?? []) as DigestDeliverable[])),
    ]).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonthStr])

  const monthRows = useMemo(() =>
    rpStore.rows.filter((r: RevenuePlanner) => r.month === selectedMonth),
    [rpStore.rows, selectedMonth])

  const invoiced = monthRows
    .filter((r: RevenuePlanner) => r.status === 'issued' || r.status === 'paid')
    .reduce((s: number, r: RevenuePlanner) => s + (r.actual_amount ?? r.planned_amount ?? 0), 0)
  const planned = monthRows.reduce((s: number, r: RevenuePlanner) => s + (r.planned_amount ?? 0), 0)

  const [yNum, moNum] = selectedMonthStr.split('-').map(Number)
  const monthWorkDays = workDaysInRange(
    `${yNum}-${String(moNum).padStart(2, '0')}-01`,
    `${yNum}-${String(moNum).padStart(2, '0')}-${new Date(yNum, moNum, 0).getDate()}`
  )
  const activeMembers = resourceStore.members.filter(m => m.active)
  const holidays = holidayStore.holidays

  const teamCapacity = activeMembers.reduce((s, m) =>
    s + adjustedCapacityForRange(m, monthWorkDays, timeOff, holidays, [], yNum).adjustedCapacity, 0)
  const totalAllocated = allocations.reduce((s, a) => s + a.hours, 0)
  const utilizationPct = teamCapacity > 0 ? Math.round(totalAllocated / teamCapacity * 100) : 0
  const billableHours = allocations.filter(a => a.is_billable).reduce((s, a) => s + a.hours, 0)

  const pipelineForMonth = plStore.items.filter(i =>
    i.expected_month?.slice(0, 7) === selectedMonthStr)
  const won = pipelineForMonth.filter(i => i.status === 'won')
  const lost = pipelineForMonth.filter(i => i.status === 'lost')
  const open = pipelineForMonth.filter(i => i.status === 'proposal')

  const memberHoursMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const a of allocations) {
      map[a.member_id] = (map[a.member_id] ?? 0) + a.hours
    }
    return map
  }, [allocations])

  const memberCapMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of activeMembers) {
      map[m.id] = adjustedCapacityForRange(m, monthWorkDays, timeOff, holidays, [], yNum).adjustedCapacity
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMembers, monthWorkDays, timeOff, holidays, yNum])

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex items-center gap-3 px-6 py-5 bg-white border-b border-border">
        <Link to="/reports" className="text-xs text-muted-foreground font-semibold flex items-center gap-1 no-underline">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Reports
        </Link>
        <span className="text-muted-foreground text-xs">/</span>
        <h1 className="text-[18px] font-extrabold tracking-[-0.2px] m-0">Monthly Digest</h1>
        <div className="ml-auto">
          <input
            type="month"
            value={selectedMonthStr}
            onChange={e => setSelectedMonthStr(e.target.value)}
            className="text-sm border border-border rounded px-2 py-1"
          />
        </div>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'INVOICED REVENUE', value: fmtEuro(invoiced), sub: `of ${fmtEuro(planned)} planned` },
            { label: 'TEAM UTILIZATION', value: `${utilizationPct}%`, sub: `${Math.round(totalAllocated)}h of ${Math.round(teamCapacity)}h` },
            { label: 'DELIVERABLES DONE', value: deliverables.filter(d => d.status === 'completed').length, sub: `of ${deliverables.length} due this month` },
            { label: 'DEALS WON', value: won.length, sub: won.length > 0 ? fmtEuro(won.reduce((s, i) => s + dealTotal(i), 0)) : 'no wins this month' },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.08em] mb-2">{s.label}</div>
                <div className="text-[24px] font-extrabold tracking-[-0.5px] leading-none mb-1">{String(s.value)}</div>
                <div className="text-xs text-muted-foreground">{s.sub}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-5 mb-5">
          <Card>
            <CardContent className="p-0">
              <div className="px-5 py-4 border-b border-border font-bold text-[14px] flex justify-between items-center">
                Revenue
                <span className="text-xs font-normal text-muted-foreground">
                  {invoiced > 0 && planned > 0 ? `${Math.round(invoiced / planned * 100)}% collected` : 'nothing invoiced yet'}
                </span>
              </div>
              {loading ? <div className="px-5 py-6 text-sm text-muted-foreground">Loading…</div> :
              monthRows.length === 0 ? <div className="px-5 py-6 text-sm text-muted-foreground">No revenue planned for this month.</div> : (
                <div className="divide-y divide-border">
                  {monthRows.map((r: RevenuePlanner) => (
                    <div key={r.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                      <div>
                        <span className="font-medium text-foreground">{r.project?.name ?? r.notes ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={r.status === 'paid' ? 'green' : r.status === 'issued' ? 'blue' : 'gray'}>
                          {r.status}
                        </Badge>
                        <span className="font-bold tabular-nums">{fmtEuro(r.actual_amount ?? r.planned_amount ?? 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="px-5 py-4 border-b border-border font-bold text-[14px]">Pipeline Activity</div>
              <div className="px-5 py-3 flex gap-3 border-b border-border">
                <Badge variant="green">{won.length} Won</Badge>
                <Badge variant="red">{lost.length} Lost</Badge>
                <Badge variant="amber">{open.length} Open</Badge>
              </div>
              {pipelineForMonth.length === 0 ? (
                <div className="px-5 py-6 text-sm text-muted-foreground">No deals expected this month.</div>
              ) : (
                <div className="divide-y divide-border">
                  {pipelineForMonth.map(i => (
                    <div key={i.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                      <span className="font-medium">{i.title}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant={i.status === 'won' ? 'green' : i.status === 'lost' ? 'red' : 'amber'}>{i.status}</Badge>
                        <span className="tabular-nums text-muted-foreground">{fmtEuro(dealTotal(i))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <Card>
            <CardContent className="p-0">
              <div className="px-5 py-4 border-b border-border font-bold text-[14px] flex justify-between items-center">
                Team Capacity
                <span className="text-xs font-normal text-muted-foreground">{Math.round(billableHours)}h billable</span>
              </div>
              {activeMembers.length === 0 ? <div className="px-5 py-6 text-sm text-muted-foreground">No team members.</div> : (
                <div className="divide-y divide-border">
                  {activeMembers.map(m => {
                    const mHours = memberHoursMap[m.id] ?? 0
                    const mCap = memberCapMap[m.id] ?? 0
                    const pct = mCap > 0 ? Math.round(mHours / mCap * 100) : 0
                    return (
                      <div key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                        <span className="text-[13px] font-medium w-28 shrink-0">{m.name}</span>
                        <div className="flex-1 h-1.5 bg-[#e8e3ea] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${Math.min(100, pct)}%`,
                            background: pct > 100 ? '#dc2626' : pct > 80 ? '#0f172a' : '#64748b'
                          }} />
                        </div>
                        <span className="text-xs font-bold w-12 text-right">{pct}%</span>
                        <span className="text-xs text-muted-foreground w-20 text-right tabular-nums">{Math.round(mHours)}h / {Math.round(mCap)}h</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="px-5 py-4 border-b border-border font-bold text-[14px]">Deliverables Due</div>
              {deliverables.length === 0 ? (
                <div className="px-5 py-6 text-sm text-muted-foreground">No deliverables due this month.</div>
              ) : (
                <div className="divide-y divide-border">
                  {deliverables.map(d => (
                    <div key={d.id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                      <div>
                        <div className="font-medium text-foreground">{d.title}</div>
                        <div className="text-xs text-muted-foreground">{d.project?.pn} {d.project?.name}</div>
                      </div>
                      <Badge variant={d.status === 'completed' ? 'green' : d.status === 'delayed' ? 'red' : 'gray'}>
                        {d.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
