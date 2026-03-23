import { useState, useEffect, useMemo } from 'react'
import { usePipelineStore } from '../../stores/pipeline'
import { useResourceStore } from '../../stores/resource'
import { useHolidayStore } from '../../stores/holidays'
import { useSettingsStore } from '../../stores/settings'
import { supabase } from '../../lib/supabase'
import { workDaysInRange, adjustedCapacityForRange } from '../../lib/capacityUtils'
import { pipelineDealTotal } from '../../lib/pipelineUtils'
import type { TimeOff, TeamMember, CompanyHoliday } from '../../lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ReportHeader } from '../../components/ReportHeader'
import { StatCard } from '../../components/StatCard'

function fmtEuro(n: number) {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' €'
}

function fmtMonth(m: string) {
  return new Date(m + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function calcTeamCapacityInMonth(
  month: string,
  activeMembers: TeamMember[],
  timeOff: TimeOff[],
  holidays: CompanyHoliday[],
): number {
  const [yStr, moStr] = month.split('-')
  const y = Number(yStr)
  const mo = Number(moStr)
  const start = `${y}-${String(mo).padStart(2, '0')}-01`
  const lastDay = new Date(y, mo, 0).getDate()
  const end = `${y}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const days = workDaysInRange(start, end)
  return activeMembers.reduce((s, m) =>
    s + adjustedCapacityForRange(m, days, timeOff, holidays, [], y).adjustedCapacity,
    0)
}

export function PipelineImpactView() {
  const plStore = usePipelineStore()
  const resourceStore = useResourceStore()
  const holidayStore = useHolidayStore()
  const settingsStore = useSettingsStore()

  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [committedByMonth, setCommittedByMonth] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      plStore.fetchAll(),
      resourceStore.fetchMembers(),
      holidayStore.fetchAll(),
      settingsStore.fetch(),
      supabase.from('time_off').select('*')
        .gte('end_date', new Date().toISOString().slice(0, 10))
        .then(({ data }) => setTimeOff((data ?? []) as TimeOff[])),
      (async () => {
        const now = new Date()
        const months: string[] = []
        for (let i = 0; i < 12; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
          months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
        }
        const start = months[0]
        const end = months[months.length - 1].slice(0, 7) + '-31'
        const { data } = await supabase
          .from('resource_allocations')
          .select('date, hours')
          .gte('date', start)
          .lte('date', end)
        const map: Record<string, number> = {}
        for (const row of data ?? []) {
          const m = (row as { date: string; hours: number }).date.slice(0, 7) + '-01'
          map[m] = (map[m] ?? 0) + (row as { date: string; hours: number }).hours
        }
        setCommittedByMonth(map)
      })(),
    ]).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeMembers = useMemo(() =>
    resourceStore.members.filter(m => m.active),
    [resourceStore.members])

  const proposals = useMemo(() =>
    plStore.items.filter(i => i.status === 'proposal'),
    [plStore.items])

  const rate = settingsStore.internalHourlyRate
  const holidays = holidayStore.holidays

  // Cache capacity per unique month to avoid recomputing for multiple proposals targeting the same month
  const capacityByMonth = useMemo(() => {
    const months = new Set(proposals.map(i => i.expected_month).filter(Boolean) as string[])
    const map: Record<string, number> = {}
    for (const month of months) {
      map[month] = calcTeamCapacityInMonth(month, activeMembers, timeOff, holidays)
    }
    return map
  }, [proposals, activeMembers, timeOff, holidays])

  const rows = useMemo(() => proposals.map(item => {
    const total = pipelineDealTotal(item)
    const hours = rate > 0 ? total / rate : 0
    const month = item.expected_month ?? null
    const capacity = month ? (capacityByMonth[month] ?? 0) : 0
    const committed = month ? (committedByMonth[month] ?? 0) : 0
    const remaining = Math.max(0, capacity - committed)
    const impactPct = capacity > 0 ? Math.round((hours / capacity) * 100) : 0
    const riskLevel = impactPct > 60 ? 'critical' : impactPct > 30 ? 'warning' : 'ok'
    return { item, total, hours, month, capacity, committed, remaining, impactPct, riskLevel }
  }), [proposals, rate, capacityByMonth, committedByMonth])

  const weightedValue = proposals.reduce((s, i) => s + pipelineDealTotal(i) * i.probability / 100, 0)
  const totalHours = rate > 0 ? proposals.reduce((s, i) => s + pipelineDealTotal(i) / rate, 0) : 0
  const atRiskMonths = new Set(rows.filter(r => r.riskLevel !== 'ok' && r.month).map(r => r.month!)).size

  return (
    <div className="flex-1 overflow-auto">
      <ReportHeader title="Pipeline Impact" />
      <div className="p-6">
        {rate === 0 && (
          <div className="mb-4 rounded-lg border border-[#fde68a] bg-[#fefce8] px-4 py-3 text-sm text-[#92400e] flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Set internal hourly rate in Settings → General to see hour estimates.
          </div>
        )}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="OPEN PROPOSALS" value={proposals.length} sub="active deals" />
          <StatCard label="WEIGHTED VALUE" value={fmtEuro(weightedValue)} sub="probability-adjusted" />
          <StatCard label="EXPECTED HOURS" value={rate > 0 ? `${Math.round(totalHours)}h` : '—'} sub={rate > 0 ? 'based on hourly rate' : 'rate not set'} />
          <StatCard label="AT-RISK MONTHS" value={atRiskMonths} sub="capacity >30% impacted" />
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="px-5 py-4 border-b border-border font-bold text-[14px]">Open Pipeline Deals</div>
            {loading ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">Loading…</div>
            ) : proposals.length === 0 ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">No open proposals.</div>
            ) : (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr style={{ background: '#f4f2f6', borderBottom: '1px solid #e8e3ea' }}>
                    {['DEAL', 'CLIENT', 'PROB', 'EXPECTED MONTH', 'VALUE', 'EST. HOURS', 'CAPACITY IMPACT', 'RISK'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-[0.07em]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ item, total, hours, month, impactPct, riskLevel }) => (
                    <tr key={item.id} className="border-b border-border last:border-0 hover:bg-[#f9f9f9]">
                      <td className="px-4 py-3 font-semibold text-foreground">{item.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.client?.name ?? item.company_name ?? '—'}</td>
                      <td className="px-4 py-3 font-bold">{item.probability}%</td>
                      <td className="px-4 py-3">{month ? fmtMonth(month) : '—'}</td>
                      <td className="px-4 py-3 font-mono text-right tabular-nums">{fmtEuro(total)}</td>
                      <td className="px-4 py-3 font-mono text-right tabular-nums">{rate > 0 ? `${Math.round(hours)}h` : '—'}</td>
                      <td className="px-4 py-3">
                        {rate > 0 && month ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-[#e8e3ea] rounded-full overflow-hidden" style={{ maxWidth: 80 }}>
                              <div className="h-full rounded-full" style={{
                                width: `${Math.min(100, impactPct)}%`,
                                background: riskLevel === 'critical' ? '#dc2626' : riskLevel === 'warning' ? '#d97706' : '#16a34a'
                              }} />
                            </div>
                            <span className="text-xs font-bold">{impactPct}%</span>
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={riskLevel === 'critical' ? 'red' : riskLevel === 'warning' ? 'amber' : 'green'}>
                          {riskLevel === 'critical' ? 'High' : riskLevel === 'warning' ? 'Medium' : 'Low'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
