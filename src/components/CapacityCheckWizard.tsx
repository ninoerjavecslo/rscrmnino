import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useResourceStore } from '../stores/resource'
import { useHolidayStore } from '../stores/holidays'
import { workDaysInRange, timeOffWorkDays, holidayWorkDays } from '../lib/capacityUtils'
import type { PipelineItem, CompanyHoliday } from '../lib/types'

interface Props { onClose: () => void }

type Step = 'select' | 'hours' | 'grid' | 'gap'

interface AllocRow { member_id: string; category: string; date: string; hours: number }
interface TimeOffRow { member_id: string; start_date: string; end_date: string }

const fmtCurrency = (n: number) => n >= 1000 ? `€${(n / 1000).toFixed(0)}k` : `€${n}`
const fmtMonthLabel = (s: string) => {
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('en', { month: 'short', year: 'numeric' })
}

function getMonthRange(deal: PipelineItem): string[] {
  const start = deal.expected_month ?? null
  const end = deal.expected_end_month ?? start
  if (!start) return []
  const months: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const endDate = new Date((end ?? start) + 'T00:00:00')
  endDate.setDate(1)
  while (cur <= endDate) {
    months.push(cur.toISOString().slice(0, 10).slice(0, 7) + '-01')
    cur.setMonth(cur.getMonth() + 1)
  }
  return months
}

function monthRange(monthStr: string): { start: string; end: string } {
  const [year, month] = monthStr.split('-').map(Number)
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}` }
}

function cellColor(pct: number): string {
  if (pct > 100) return '#ffcdd2'
  if (pct >= 80) return '#fff9c4'
  return '#e8f5e9'
}
function cellText(pct: number): string {
  if (pct > 100) return '#c62828'
  if (pct >= 80) return '#f57f17'
  return '#2e7d32'
}

export function CapacityCheckWizard({ onClose }: Props) {
  const { teams, members, fetchTeams, fetchMembers } = useResourceStore()
  const holidayStore = useHolidayStore()

  const [step, setStep] = useState<Step>('select')
  const [pipelineItems, setPipelineItems] = useState<PipelineItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hoursPerMonth, setHoursPerMonth] = useState<Record<string, number>>({})
  const [avgRate, setAvgRate] = useState(75)

  const [allocations, setAllocations] = useState<AllocRow[]>([])
  const [allTimeOff, setAllTimeOff] = useState<TimeOffRow[]>([])
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchTeams()
    if (!members.length) fetchMembers()
    supabase
      .from('pipeline_items')
      .select('*, client:clients(id, name)')
      .eq('status', 'proposal')
      .order('expected_month')
      .then(({ data }) => setPipelineItems((data ?? []) as PipelineItem[]))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedDeals = useMemo(() =>
    pipelineItems.filter(d => selectedIds.has(d.id)),
    [pipelineItems, selectedIds]
  )

  // All months spanned by selected deals
  const scenarioMonths = useMemo(() => {
    const all = selectedDeals.flatMap(getMonthRange)
    const unique = [...new Set(all)].sort()
    return unique
  }, [selectedDeals])

  // Auto-fill hours when deals are selected
  function autoFillHours() {
    const next: Record<string, number> = { ...hoursPerMonth }
    selectedDeals.forEach(deal => {
      const months = getMonthRange(deal)
      const totalHours = Math.round((deal.estimated_amount ?? 0) / avgRate)
      const perMonth = months.length > 0 ? Math.round(totalHours / months.length) : 0
      months.forEach(m => {
        const key = `${deal.id}-${m}`
        if (!(key in next)) next[key] = perMonth
      })
    })
    setHoursPerMonth(next)
  }

  async function goToGrid() {
    if (scenarioMonths.length === 0) return
    setLoading(true)
    const minMonth = scenarioMonths[0]
    const maxMonth = scenarioMonths[scenarioMonths.length - 1]
    const { start: rangeStart } = monthRange(minMonth)
    const { end: rangeEnd } = monthRange(maxMonth)

    const [allocRes, toRes, hols] = await Promise.all([
      supabase.from('resource_allocations')
        .select('member_id, category, date, hours')
        .gte('date', rangeStart).lte('date', rangeEnd),
      supabase.from('time_off').select('member_id, start_date, end_date')
        .lte('start_date', rangeEnd).gte('end_date', rangeStart),
      holidayStore.fetchByRange(rangeStart, rangeEnd),
    ])
    setAllocations((allocRes.data ?? []) as AllocRow[])
    setAllTimeOff((toRes.data ?? []) as TimeOffRow[])
    setHolidays(hols)
    setLoading(false)
    setStep('grid')
  }

  const activeMembers = useMemo(() => members.filter(m => m.active), [members])

  // Grid: for each month × team: capacity, currentAllocated, dealHours, available, shortfall
  const gridData = useMemo(() => {
    if (step !== 'grid' && step !== 'gap') return []
    return scenarioMonths.map(monthStr => {
      const year = parseInt(monthStr.slice(0, 4))
      const { start, end } = monthRange(monthStr)

      const teamCells = teams.map(team => {
        const teamMembers = activeMembers.filter(m => m.team_id === team.id)

        const capacity = teamMembers.reduce((sum, member) => {
          const memberTimeOff = allTimeOff.filter(t => t.member_id === member.id)
          const days = workDaysInRange(start, end)
          const offDays = timeOffWorkDays(memberTimeOff, days)
          const holDays = holidayWorkDays(holidays, days, member.team_id, year)
          const leaveHrs = allocations
            .filter(a => a.member_id === member.id && a.category === 'leave' && a.date >= start && a.date <= end)
            .reduce((s, a) => s + a.hours, 0)
          const grossDays = Math.max(0, days.length - offDays - holDays)
          return sum + Math.max(0, grossDays * member.hours_per_day - leaveHrs)
        }, 0)

        const currentAllocated = allocations
          .filter(a => teamMembers.some(m => m.id === a.member_id) && a.category !== 'leave' && a.date >= start && a.date <= end)
          .reduce((s, a) => s + a.hours, 0)

        const dealHours = selectedDeals.reduce((sum, deal) => {
          const key = `${deal.id}-${monthStr}`
          return sum + (hoursPerMonth[key] ?? 0)
        }, 0)

        const available = Math.max(0, capacity - currentAllocated)
        const shortfall = Math.max(0, dealHours - available)
        const totalUsedPct = capacity > 0 ? Math.round(((currentAllocated + dealHours) / capacity) * 100) : 0

        return { teamId: team.id, teamName: team.name, teamColor: team.color, capacity, currentAllocated, dealHours, available, shortfall, totalUsedPct }
      }).filter(c => c.capacity > 0 || c.dealHours > 0)

      const totalShortfall = teamCells.reduce((s, c) => s + c.shortfall, 0)
      return { month: monthStr, teamCells, totalShortfall }
    })
  }, [step, scenarioMonths, teams, activeMembers, allTimeOff, holidays, allocations, selectedDeals, hoursPerMonth])

  const gapMonths = useMemo(() => gridData.filter(r => r.totalShortfall > 0), [gridData])
  const totalShortfall = useMemo(() => gridData.reduce((s, r) => s + r.totalShortfall, 0), [gridData])
  const avgHoursPerDay = useMemo(() => {
    if (!activeMembers.length) return 8
    return activeMembers.reduce((s, m) => s + m.hours_per_day, 0) / activeMembers.length
  }, [activeMembers])

  function toggleDeal(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '90vw', maxWidth: 860, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--c6)' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, fontFamily: 'Manrope, sans-serif', color: 'var(--c0)' }}>Capacity Check</div>
            <div style={{ fontSize: 13, color: 'var(--c3)', marginTop: 2 }}>Check if your team can absorb new deals</div>
          </div>
          {/* Step indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 20 }}>
            {(['select', 'hours', 'grid', 'gap'] as Step[]).map((s, i) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: step === s ? 'var(--navy)' : ['select', 'hours', 'grid', 'gap'].indexOf(step) > i ? 'var(--green)' : 'var(--c6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: step === s || ['select', 'hours', 'grid', 'gap'].indexOf(step) > i ? '#fff' : 'var(--c4)' }}>
                  {i + 1}
                </div>
                {i < 3 && <div style={{ width: 20, height: 1, background: 'var(--c6)' }} />}
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c3)', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* Step 1: Select deals */}
          {step === 'select' && (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)', marginBottom: 16 }}>Select pipeline deals to simulate</div>
              {pipelineItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c4)' }}>No active proposals in the pipeline.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pipelineItems.map(deal => {
                    const months = getMonthRange(deal)
                    const isSelected = selectedIds.has(deal.id)
                    return (
                      <label key={deal.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: isSelected ? 'rgba(15,23,42,0.04)' : '#fafafa', border: `1.5px solid ${isSelected ? 'var(--navy)' : 'var(--c6)'}`, borderRadius: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleDeal(deal.id)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--c0)' }}>
                            {deal.client?.name ?? deal.company_name ?? 'Unknown'} — {deal.title}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--c3)', marginTop: 2 }}>
                            {deal.estimated_amount ? fmtCurrency(deal.estimated_amount) : 'No amount'} &middot; {months.length > 0 ? months.map(fmtMonthLabel).join(' – ') : 'No dates'} &middot; {deal.deal_type.replace('_', ' ')}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c3)' }}>{deal.probability}%</div>
                      </label>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* Step 2: Hours per month */}
          {step === 'hours' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)' }}>Hours needed per deal per month</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--c3)' }}>Avg rate</span>
                  <input type="number" value={avgRate} onChange={e => setAvgRate(Number(e.target.value))} style={{ width: 70, textAlign: 'center' }} />
                  <span style={{ fontSize: 13, color: 'var(--c3)' }}>€/h</span>
                  <button className="btn btn-secondary btn-xs" onClick={autoFillHours}>Auto-estimate</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {selectedDeals.map(deal => {
                  const months = getMonthRange(deal)
                  const totalHours = Math.round((deal.estimated_amount ?? 0) / avgRate)
                  return (
                    <div key={deal.id} className="card">
                      <div className="card-body" style={{ padding: '14px 18px' }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)', marginBottom: 4 }}>{deal.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--c3)', marginBottom: 12 }}>
                          {deal.estimated_amount ? `€${deal.estimated_amount.toLocaleString()} ÷ €${avgRate}/h ≈ ${totalHours}h total` : 'No amount set'}
                        </div>
                        {months.length === 0 ? (
                          <p style={{ color: 'var(--c4)', fontSize: 13 }}>No dates set for this deal.</p>
                        ) : (
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {months.map(m => {
                              const key = `${deal.id}-${m}`
                              return (
                                <div key={m} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c3)' }}>{fmtMonthLabel(m)}</span>
                                  <input
                                    type="number" min={0}
                                    value={hoursPerMonth[key] ?? 0}
                                    onChange={e => setHoursPerMonth(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                                    style={{ width: 72, textAlign: 'center' }}
                                  />
                                  <span style={{ fontSize: 10, color: 'var(--c4)' }}>hours</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Step 3: Capacity grid */}
          {step === 'grid' && (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)', marginBottom: 16 }}>Capacity impact by team and month</div>
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c4)' }}>Loading capacity data…</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr style={{ background: 'var(--c7)' }}>
                        <th style={{ textAlign: 'left' }}>Team</th>
                        {scenarioMonths.map(m => (
                          <th key={m} style={{ textAlign: 'center', fontSize: 11 }}>{fmtMonthLabel(m)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {teams.filter(t => gridData.some(r => r.teamCells.some(c => c.teamId === t.id))).map(team => (
                        <tr key={team.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: team.color }} />
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{team.name}</span>
                            </div>
                          </td>
                          {scenarioMonths.map(m => {
                            const row = gridData.find(r => r.month === m)
                            const cell = row?.teamCells.find(c => c.teamId === team.id)
                            if (!cell) return <td key={m} style={{ textAlign: 'center', color: 'var(--c5)' }}>—</td>
                            return (
                              <td key={m} style={{ textAlign: 'center', padding: '6px' }}>
                                <div style={{ background: cellColor(cell.totalUsedPct), color: cellText(cell.totalUsedPct), borderRadius: 6, padding: '5px 8px', fontWeight: 700, fontSize: 13 }}>
                                  {cell.totalUsedPct}%
                                  {cell.shortfall > 0 && (
                                    <div style={{ fontSize: 10, fontWeight: 600 }}>-{cell.shortfall}h short</div>
                                  )}
                                  {cell.shortfall === 0 && (
                                    <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{cell.dealHours}h / {cell.available}h avail</div>
                                  )}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Step 4: Gap summary */}
          {step === 'gap' && (
            <>
              {totalShortfall === 0 ? (
                <div className="alert" style={{ background: '#e8f5e9', borderColor: 'var(--green)', color: 'var(--green)', marginBottom: 20 }}>
                  All selected deals fit within existing team capacity. No gaps detected.
                </div>
              ) : (
                <div className="alert alert-amber" style={{ marginBottom: 20 }}>
                  {gapMonths.length} month{gapMonths.length !== 1 ? 's' : ''} have capacity gaps totaling <strong>{totalShortfall}h</strong>. Consider hiring or deferring deals.
                </div>
              )}

              {gapMonths.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Team</th>
                      <th className="th-right">Shortfall</th>
                      <th className="th-right">FTEs needed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gapMonths.flatMap(row =>
                      row.teamCells
                        .filter(c => c.shortfall > 0)
                        .map(c => {
                          const fte = (c.shortfall / (avgHoursPerDay * 20)).toFixed(1)
                          return (
                            <tr key={`${row.month}-${c.teamId}`}>
                              <td style={{ fontWeight: 600 }}>{fmtMonthLabel(row.month)}</td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.teamColor }} />
                                  {c.teamName}
                                </div>
                              </td>
                              <td className="td-right" style={{ color: 'var(--red)', fontWeight: 700 }}>{c.shortfall}h</td>
                              <td className="td-right" style={{ color: 'var(--c2)' }}>+{fte} FTE</td>
                            </tr>
                          )
                        })
                    )}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid var(--c6)' }}>
          <div>
            {step !== 'select' && (
              <button className="btn btn-ghost btn-sm" onClick={() => {
                if (step === 'hours') setStep('select')
                else if (step === 'grid') setStep('hours')
                else if (step === 'gap') setStep('grid')
              }}>← Back</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
            {step === 'select' && (
              <button className="btn btn-primary btn-sm" disabled={selectedIds.size === 0}
                onClick={() => { autoFillHours(); setStep('hours') }}>
                Next: Set Hours →
              </button>
            )}
            {step === 'hours' && (
              <button className="btn btn-primary btn-sm" disabled={scenarioMonths.length === 0}
                onClick={goToGrid}>
                {loading ? 'Loading…' : 'Check Capacity →'}
              </button>
            )}
            {step === 'grid' && (
              <button className="btn btn-primary btn-sm" onClick={() => setStep('gap')}>
                View Hiring Gap →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
