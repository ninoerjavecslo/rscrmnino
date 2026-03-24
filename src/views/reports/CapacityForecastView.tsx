// src/views/reports/CapacityForecastView.tsx
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useResourceStore } from '../../stores/resource'
import { useHolidayStore } from '../../stores/holidays'
import { workDaysInRange, adjustedCapacityForRange } from '../../lib/capacityUtils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ReportHeader } from '../../components/ReportHeader'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import type { CompanyHoliday, TeamMember } from '../../lib/types'

// ── Types ────────────────────────────────────────────────────────────────────

interface DelivRow {
  id: string
  title: string
  project_id: string
  due_date: string
  start_date: string | null
  estimated_hours: number | null
  team: string | null
  team_hours: Record<string, number> | null
  member_percentages: Record<string, number> | null
  project?: { id: string; pn: string; name: string } | null
}

interface TimeOffRow { member_id: string; start_date: string; end_date: string }

interface MonthData {
  label: string       // e.g. "Apr 2026"
  monthKey: string    // e.g. "2026-04"
  start: string
  end: string
  capacity: number
  estimated: number
}

interface TeamMonthData extends MonthData {
  teamBreakdown: Record<string, { capacity: number; estimated: number }>
}

interface Scenario {
  title: string
  risk: 'low' | 'medium' | 'high'
  summary: string
  bullets: string[]
  impact: string   // e.g. "+120h in June"
}

interface AIInsight {
  summary: string
  scenarios: Scenario[]
}

type Range = 1 | 3 | 6
type GroupBy = 'team' | 'person'

// ── Helpers ──────────────────────────────────────────────────────────────────

function monthRange(year: number, monthIndex: number) {
  const mm = String(monthIndex + 1).padStart(2, '0')
  const start = `${year}-${mm}-01`
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const end = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

function workDaysInOverlap(mStart: string, mEnd: string, dStart: string, dEnd: string) {
  const oStart = mStart > dStart ? mStart : dStart
  const oEnd = mEnd < dEnd ? mEnd : dEnd
  if (oStart > oEnd) return 0
  return workDaysInRange(oStart, oEnd).length
}

function totalWorkDaysInDeliv(dStart: string, dEnd: string) {
  return Math.max(1, workDaysInRange(dStart, dEnd).length)
}

function delivHoursInMonth(d: DelivRow, mStart: string, mEnd: string): number {
  if (!d.estimated_hours && !d.team_hours) return 0
  const dStart = d.start_date ?? d.due_date
  const dEnd = d.due_date
  const overlap = workDaysInOverlap(mStart, mEnd, dStart, dEnd)
  const total = totalWorkDaysInDeliv(dStart, dEnd)
  const fraction = overlap / total
  const hours = d.team_hours
    ? Object.values(d.team_hours).reduce((s, h) => s + h, 0)
    : (d.estimated_hours ?? 0)
  return Math.round(hours * fraction)
}

function delivHoursInMonthByTeam(d: DelivRow, mStart: string, mEnd: string): Record<string, number> {
  if (!d.team_hours && !d.estimated_hours) return {}
  const dStart = d.start_date ?? d.due_date
  const dEnd = d.due_date
  const overlap = workDaysInOverlap(mStart, mEnd, dStart, dEnd)
  const total = totalWorkDaysInDeliv(dStart, dEnd)
  const fraction = overlap / total
  if (d.team_hours) {
    const result: Record<string, number> = {}
    Object.entries(d.team_hours).forEach(([t, h]) => { result[t] = Math.round(h * fraction) })
    return result
  }
  const teamName = d.team ?? 'Unknown'
  return { [teamName]: Math.round((d.estimated_hours ?? 0) * fraction) }
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// ── Main Component ────────────────────────────────────────────────────────────

export function CapacityForecastView() {
  const { teams, members, fetchTeams, fetchMembers } = useResourceStore()
  const holidayStore = useHolidayStore()

  const [range, setRange] = useState<Range>(3)
  const [groupBy, setGroupBy] = useState<GroupBy>('team')
  const [deliverables, setDeliverables] = useState<DelivRow[]>([])
  const [timeOff, setTimeOff] = useState<TimeOffRow[]>([])
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([])
  const [loading, setLoading] = useState(true)

  // AI state
  const [aiLoading, setAiLoading] = useState(false)
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null)
  const [selectedDeliv, setSelectedDeliv] = useState<string>('')

  useEffect(() => {
    fetchTeams()
    fetchMembers()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute months in range
  const months = useMemo(() => {
    const result: Array<{ year: number; monthIndex: number; key: string; label: string; start: string; end: string }> = []
    const now = new Date()
    for (let i = 0; i < range; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const { start, end } = monthRange(d.getFullYear(), d.getMonth())
      result.push({
        year: d.getFullYear(),
        monthIndex: d.getMonth(),
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`,
        start,
        end,
      })
    }
    return result
  }, [range])

  // Fetch data for range
  useEffect(() => {
    if (months.length === 0) return
    setLoading(true)
    const rangeStart = months[0].start
    const rangeEnd = months[months.length - 1].end

    Promise.all([
      supabase.from('project_deliverables')
        .select('id, title, project_id, due_date, start_date, estimated_hours, team, team_hours, member_percentages, project:projects(id, pn, name)')
        .gte('due_date', rangeStart)
        .lte('due_date', rangeEnd)
        .neq('status', 'completed'),
      supabase.from('time_off').select('member_id, start_date, end_date')
        .lte('start_date', rangeEnd).gte('end_date', rangeStart),
      holidayStore.fetchByRange(rangeStart, rangeEnd),
    ]).then(([delivRes, toRes, hols]) => {
      setDeliverables((delivRes.data ?? []) as DelivRow[])
      setTimeOff((toRes.data ?? []) as TimeOffRow[])
      setHolidays(hols)
      setLoading(false)
    })
  }, [months]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeMembers = useMemo(() => members.filter(m => m.active && (m.hours_per_day ?? 0) > 0), [members])

  // Compute capacity per month — stable, uses closed-over timeOff/holidays
  const memberCapacity = useMemo(() => (m: TeamMember, start: string, end: string): number => {
    const days = workDaysInRange(start, end)
    const memberTimeOff = timeOff.filter(t => t.member_id === m.id)
    const cap = adjustedCapacityForRange(m, days, memberTimeOff, holidays, [], new Date(start).getFullYear())
    return isNaN(cap) ? days.length * (m.hours_per_day ?? 8) : cap
  }, [timeOff, holidays])

  // Chart data: overall capacity vs estimated
  const chartData = useMemo(() => {
    return months.map(m => {
      const capacity = activeMembers.reduce((s, mem) => s + memberCapacity(mem, m.start, m.end), 0)
      const estimated = deliverables.reduce((s, d) => s + delivHoursInMonth(d, m.start, m.end), 0)
      return { month: m.label, capacity: Math.round(capacity), estimated }
    })
  }, [months, activeMembers, deliverables, memberCapacity])

  // Chart data by team
  const teamNames = useMemo(() => teams.map(t => t.name), [teams])

  const teamChartData = useMemo(() => {
    return months.map(m => {
      const row: Record<string, number> & { month: string } = { month: m.label }
      teams.forEach(t => {
        const teamMembers = activeMembers.filter(mem => mem.team?.name === t.name)
        const cap = teamMembers.reduce((s, mem) => s + memberCapacity(mem, m.start, m.end), 0)
        const est = deliverables.reduce((s, d) => {
          const byTeam = delivHoursInMonthByTeam(d, m.start, m.end)
          return s + (byTeam[t.name] ?? 0)
        }, 0)
        row[`${t.name}_cap`] = Math.round(cap)
        row[`${t.name}_est`] = est
      })
      return row
    })
  }, [months, teams, activeMembers, deliverables, memberCapacity])

  // Project load table
  const projectLoad = useMemo(() => {
    const map: Record<string, { name: string; pn: string; monthHours: Record<string, number> }> = {}
    deliverables.forEach(d => {
      const pid = d.project_id
      const proj = d.project as { id: string; pn: string; name: string } | null
      if (!map[pid]) map[pid] = { name: proj?.name ?? pid, pn: proj?.pn ?? '', monthHours: {} }
      months.forEach(m => {
        const h = delivHoursInMonth(d, m.start, m.end)
        map[pid].monthHours[m.key] = (map[pid].monthHours[m.key] ?? 0) + h
      })
    })
    return Object.entries(map).map(([id, v]) => ({ id, ...v }))
      .filter(p => Object.values(p.monthHours).some(h => h > 0))
      .sort((a, b) => {
        const aTotal = Object.values(a.monthHours).reduce((s, h) => s + h, 0)
        const bTotal = Object.values(b.monthHours).reduce((s, h) => s + h, 0)
        return bTotal - aTotal
      })
  }, [deliverables, months])

  // Total capacity for AI context
  const totalCapacity = chartData.reduce((s, d) => s + d.capacity, 0)
  const totalEstimated = chartData.reduce((s, d) => s + d.estimated, 0)
  const utilizationPct = totalCapacity > 0 ? Math.round((totalEstimated / totalCapacity) * 100) : 0

  async function generateAIInsight() {
    setAiLoading(true)
    setAiInsight(null)

    const deliv = selectedDeliv
      ? deliverables.find(d => d.id === selectedDeliv)
      : null

    const capacitySummary = chartData.map(d =>
      `${d.month}: capacity ${d.capacity}h, estimated load ${d.estimated}h (${d.capacity > 0 ? Math.round(d.estimated / d.capacity * 100) : 0}% utilization)`
    ).join('\n')

    const projectSummary = projectLoad.slice(0, 8).map(p =>
      `${p.pn} ${p.name}: ${months.map(m => `${m.label} ${p.monthHours[m.key] ?? 0}h`).join(', ')}`
    ).join('\n')

    const teamSummary = teams.map(t => {
      const cap = months.map(m => {
        const teamMembers = activeMembers.filter(mem => mem.team?.name === t.name)
        return teamMembers.reduce((s, mem) => s + memberCapacity(mem, m.start, m.end), 0)
      }).reduce((s, h) => s + h, 0)
      return `${t.name}: ${Math.round(cap)}h capacity`
    }).join(', ')

    const delayContext = deliv
      ? `\n\nThe user wants to model what happens if this deliverable is delayed by 2-4 weeks: "${deliv.title}" (${deliv.estimated_hours ?? 'unknown'}h, due ${deliv.due_date}, team: ${deliv.team ?? 'unspecified'})`
      : '\n\nGenerate general delay scenarios for the highest-risk deliverables.'

    const prompt = `You are an agency capacity planning expert. Analyze this team capacity data and generate insights.

TIME RANGE: ${months[0]?.label} to ${months[months.length - 1]?.label} (${range} month${range > 1 ? 's' : ''})
OVERALL UTILIZATION: ${utilizationPct}% (${totalEstimated}h estimated / ${totalCapacity}h capacity)

CAPACITY BY MONTH:
${capacitySummary}

TEAM BREAKDOWN:
${teamSummary}

TOP PROJECTS:
${projectSummary}
${delayContext}

Respond with a JSON object (no markdown wrapper):
{
  "summary": "1-2 sentences. Key risk + key opportunity only.",
  "scenarios": [
    {
      "title": "Short title (4-6 words)",
      "risk": "low|medium|high",
      "summary": "One sentence outcome",
      "impact": "Short metric e.g. '+80h in May' or 'Dev overloaded Jun'",
      "bullets": ["Max 3 bullet points", "Each max 8 words", "Specific team or month"]
    }
  ]
}

Generate exactly 3 scenarios: optimistic, realistic, worst-case. Be brief and specific. Bullets must be short actionable facts.`

    try {
      const { data } = await supabase.functions.invoke('jira-proxy', {
        body: { action: 'claude-insight', prompt }
      })
      if (data?.insight) {
        try {
          // Strip markdown code fences if present
          const raw = data.insight.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
          const parsed = JSON.parse(raw)
          setAiInsight(parsed)
        } catch {
          setAiInsight({ summary: data.insight, scenarios: [] })
        }
      }
    } catch {
      // fallback: call Claude API directly via edge function
    }
    setAiLoading(false)
  }

  const riskColor: Record<string, string> = {
    low: 'green', medium: 'amber', high: 'red'
  }

  return (
    <div className="flex-1 overflow-auto">
      <ReportHeader
        title="Capacity Forecast"
        subtitle="Estimated load vs available capacity with AI scenarios"
      />

      <div className="p-6 space-y-6">
        {/* Controls */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-medium">Range</span>
          {([1, 3, 6] as Range[]).map(r => (
            <Button key={r} size="sm" variant={range === r ? 'default' : 'outline'} onClick={() => setRange(r)}>
              {r === 1 ? '1 month' : `${r} months`}
            </Button>
          ))}
          <div className="w-px h-5 bg-border mx-1" />
          <span className="text-xs text-muted-foreground font-medium">Group by</span>
          <Button size="sm" variant={groupBy === 'team' ? 'default' : 'outline'} onClick={() => setGroupBy('team')}>Team</Button>
          <Button size="sm" variant={groupBy === 'person' ? 'default' : 'outline'} onClick={() => setGroupBy('person')}>Person</Button>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground text-sm py-16">Loading capacity data…</div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total Capacity', value: `${totalCapacity}h` },
                { label: 'Total Estimated', value: `${totalEstimated}h` },
                { label: 'Utilization', value: `${utilizationPct}%`, highlight: utilizationPct > 90 ? 'red' : utilizationPct > 70 ? 'amber' : 'green' },
                { label: 'Projects Active', value: String(projectLoad.length) },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-[10px] border border-border p-4">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-1">{s.label}</div>
                  <div className={`text-[28px] font-extrabold tracking-[-0.5px] ${s.highlight === 'red' ? 'text-red-600' : s.highlight === 'amber' ? 'text-amber-600' : 'text-foreground'}`}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Chart */}
            <Card>
              <CardContent className="p-5">
                <div className="text-[11px] font-bold uppercase tracking-[.09em] text-muted-foreground mb-4">
                  Capacity vs Estimated Load {groupBy === 'team' ? '— by team' : '— total'}
                </div>
                {groupBy === 'person' ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={chartData} barCategoryGap="40%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12 }} unit="h" axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number) => `${v}h`} />
                      <Legend />
                      <Bar dataKey="capacity" name="Available Capacity" fill="#e2e8f0" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="estimated" name="Estimated Load" fill="#1e293b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  // Team view: 2 bars per month — capacity stacked by team, load stacked by team
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={teamChartData} barCategoryGap="35%" barGap={6}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12 }} unit="h" axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number) => `${v}h`} />
                      <Legend />
                      {teamNames.map((t, i) => (
                        <Bar key={`${t}_cap`} dataKey={`${t}_cap`} name={i === 0 ? 'Capacity' : undefined}
                          stackId="capacity" fill={`hsl(${(i * 55) % 360}, 15%, 88%)`}
                          radius={i === teamNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                      ))}
                      {teamNames.map((t, i) => (
                        <Bar key={`${t}_est`} dataKey={`${t}_est`} name={`${t}`}
                          stackId="load" fill={`hsl(${(i * 55) % 360}, 65%, 42%)`}
                          radius={i === teamNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Project load table */}
            {projectLoad.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <div className="px-5 py-3 border-b border-border text-[11px] font-bold uppercase tracking-[.09em] text-muted-foreground">
                    Project Load
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>PROJECT</th>
                        {months.map(m => <th key={m.key} className="text-right">{m.label}</th>)}
                        <th className="text-right">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectLoad.map(p => {
                        const total = Object.values(p.monthHours).reduce((s, h) => s + h, 0)
                        return (
                          <tr key={p.id}>
                            <td>
                              <div className="font-medium text-[13px]">{p.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">{p.pn}</div>
                            </td>
                            {months.map(m => (
                              <td key={m.key} className="text-right text-[13px]">
                                {p.monthHours[m.key] ? `${p.monthHours[m.key]}h` : '—'}
                              </td>
                            ))}
                            <td className="text-right text-[13px] font-semibold">{total}h</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* AI Scenarios */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[.09em] text-muted-foreground mb-1">AI Capacity Scenarios</div>
                    <div className="text-xs text-muted-foreground">Select a deliverable to model delay impact, or generate a general overview</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedDeliv}
                      onChange={e => setSelectedDeliv(e.target.value)}
                      className="text-sm border border-border rounded px-2 py-1.5 max-w-[220px]"
                    >
                      <option value="">General overview</option>
                      {deliverables.map(d => (
                        <option key={d.id} value={d.id}>{d.title} ({d.due_date})</option>
                      ))}
                    </select>
                    <Button size="sm" onClick={generateAIInsight} disabled={aiLoading}>
                      {aiLoading ? 'Generating…' : '✦ Generate'}
                    </Button>
                  </div>
                </div>

                {aiInsight ? (
                  <div className="space-y-4">
                    {/* Executive summary */}
                    <div className="flex items-start gap-3 bg-[#f8f7fb] border border-[#e8e3ea] rounded-lg px-4 py-3">
                      <span className="text-base mt-0.5">✦</span>
                      <p className="text-[13px] leading-relaxed text-foreground">{aiInsight.summary}</p>
                    </div>
                    {/* Scenarios */}
                    <div className="grid grid-cols-3 gap-3">
                      {aiInsight.scenarios.map((s, i) => {
                        const riskBg = s.risk === 'high' ? 'bg-red-50 border-red-200' : s.risk === 'medium' ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
                        const riskDot = s.risk === 'high' ? 'bg-red-500' : s.risk === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                        return (
                          <div key={i} className={`border rounded-lg p-4 space-y-3 ${riskBg}`}>
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-[13px] font-bold leading-tight">{s.title}</div>
                              <div className={`w-2.5 h-2.5 rounded-full mt-0.5 shrink-0 ${riskDot}`} />
                            </div>
                            {/* Impact pill */}
                            {s.impact && (
                              <div className="inline-block text-[11px] font-semibold bg-white/70 border border-black/10 rounded-full px-2.5 py-0.5">
                                {s.impact}
                              </div>
                            )}
                            {/* One-line summary */}
                            <div className="text-[12px] text-muted-foreground leading-snug">{s.summary}</div>
                            {/* Bullets */}
                            {s.bullets && s.bullets.length > 0 && (
                              <ul className="space-y-1">
                                {s.bullets.map((b, bi) => (
                                  <li key={bi} className="flex items-start gap-1.5 text-[12px] text-foreground">
                                    <span className="mt-1 shrink-0 text-muted-foreground">→</span>
                                    <span>{b}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground text-[13px] py-8">
                    Click "Generate" to get AI-powered capacity scenarios and recommendations
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
