import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { workDaysInRange } from '../../lib/capacityUtils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ReportHeader } from '../../components/ReportHeader'
import { StatCard } from '../../components/StatCard'

interface DelayedDeliverable {
  id: string
  title: string
  due_date: string
  estimated_hours: number | null
  notes: string | null
  member_percentages: Record<string, number> | null
  project: { id: string; pn: string; name: string } | null
}

interface ConfirmDelay {
  id: string
  member_id: string
  date: string
  delay_reason: string | null
  member: { id: string; name: string } | null
}

interface DisplacedAlloc {
  id: string
  date: string
  hours: number
  member: { id: string; name: string } | null
  project: { id: string; pn: string; name: string } | null
}

function daysOverdue(dueDate: string, today: string): number {
  if (dueDate >= today) return 0
  return workDaysInRange(dueDate, today).length
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function DelayImpactView() {
  const [deliverables, setDeliverables] = useState<DelayedDeliverable[]>([])
  const [confirmDelays, setConfirmDelays] = useState<ConfirmDelay[]>([])
  const [displaced, setDisplaced] = useState<DisplacedAlloc[]>([])
  const [loading, setLoading] = useState(true)
  const [today] = useState(() => new Date().toISOString().slice(0, 10))

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('project_deliverables')
        .select('id, title, due_date, estimated_hours, notes, member_percentages, project:projects(id, pn, name)')
        .eq('status', 'delayed')
        .order('due_date')
        .then(({ data }) => setDeliverables((data ?? []) as unknown as DelayedDeliverable[])),
      supabase.from('resource_confirmations')
        .select('id, member_id, date, delay_reason, member:team_members(id, name)')
        .eq('status', 'delayed')
        .order('date', { ascending: false })
        .limit(50)
        .then(({ data }) => setConfirmDelays((data ?? []) as unknown as ConfirmDelay[])),
      supabase.from('resource_allocations')
        .select('id, date, hours, member:team_members(id, name), project:projects(id, pn, name)')
        .not('displaced_allocation_id', 'is', null)
        .gte('date', today)
        .order('date')
        .limit(100)
        .then(({ data }) => setDisplaced((data ?? []) as unknown as DisplacedAlloc[])),
    ]).finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const affectedMembers = useMemo(() => {
    const ids = new Set<string>()
    deliverables.forEach(d => {
      if (d.member_percentages) Object.keys(d.member_percentages).forEach(id => ids.add(id))
    })
    displaced.forEach(a => { if (a.member?.id) ids.add(a.member.id) })
    return ids.size
  }, [deliverables, displaced])

  const totalHoursDisplaced = deliverables.reduce((s, d) => s + (d.estimated_hours ?? 0), 0)
  const avgDaysOverdue = deliverables.length > 0
    ? Math.round(deliverables.reduce((s, d) => s + daysOverdue(d.due_date, today), 0) / deliverables.length)
    : 0

  return (
    <div className="flex-1 overflow-auto">
      <ReportHeader title="Delay Impact" />
      <div className="p-6">
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="DELAYED ITEMS" value={deliverables.length} sub="project deliverables" />
          <StatCard label="AFFECTED MEMBERS" value={affectedMembers} sub="unique team members" />
          <StatCard label="HOURS DISPLACED" value={`${totalHoursDisplaced}h`} sub="estimated hours" />
          <StatCard label="AVG DAYS OVERDUE" value={avgDaysOverdue} sub="working days" />
        </div>

        <Card className="mb-5">
          <CardContent className="p-0">
            <div className="px-5 py-4 border-b border-border font-bold text-[14px]">Delayed Deliverables</div>
            {loading ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">Loading…</div>
            ) : deliverables.length === 0 ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">No delayed deliverables.</div>
            ) : (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr style={{ background: '#f4f2f6', borderBottom: '1px solid #e8e3ea' }}>
                    {['PROJECT', 'DELIVERABLE', 'DUE DATE', 'DAYS OVERDUE', 'EST. HOURS', 'NOTES'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-[0.07em]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deliverables.map(d => {
                    const overdue = daysOverdue(d.due_date, today)
                    return (
                      <tr key={d.id} className="border-b border-border last:border-0 hover:bg-[#f9f9f9]">
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11px] text-muted-foreground">{d.project?.pn}</span>
                          <span className="ml-2 font-semibold text-foreground">{d.project?.name}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold">{d.title}</td>
                        <td className="px-4 py-3">{fmtDate(d.due_date)}</td>
                        <td className="px-4 py-3">
                          {overdue > 0 ? (
                            <Badge variant="red">{overdue}d</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">Not yet due</span>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums">{d.estimated_hours != null ? `${d.estimated_hours}h` : '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-[12px]">{d.notes ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="mb-5">
          <CardContent className="p-0">
            <div className="px-5 py-4 border-b border-border font-bold text-[14px]">Member Confirmation Delays</div>
            {!loading && confirmDelays.length === 0 ? (
              <div className="px-5 py-8 text-sm text-muted-foreground">No member delays recorded.</div>
            ) : (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr style={{ background: '#f4f2f6', borderBottom: '1px solid #e8e3ea' }}>
                    {['MEMBER', 'DATE', 'DELAY REASON'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-[0.07em]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {confirmDelays.map(c => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-[#f9f9f9]">
                      <td className="px-4 py-3 font-semibold">{c.member?.name ?? '—'}</td>
                      <td className="px-4 py-3">{fmtDate(c.date)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{c.delay_reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {displaced.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="px-5 py-4 border-b border-border font-bold text-[14px]">Displaced Allocations (upcoming)</div>
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr style={{ background: '#f4f2f6', borderBottom: '1px solid #e8e3ea' }}>
                    {['MEMBER', 'PROJECT', 'DATE', 'HOURS'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-muted-foreground uppercase tracking-[0.07em]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displaced.map(a => (
                    <tr key={a.id} className="border-b border-border last:border-0 hover:bg-[#f9f9f9]">
                      <td className="px-4 py-3 font-semibold">{a.member?.name ?? '—'}</td>
                      <td className="px-4 py-3">{a.project ? `${a.project.pn} ${a.project.name}` : '—'}</td>
                      <td className="px-4 py-3">{fmtDate(a.date)}</td>
                      <td className="px-4 py-3 tabular-nums">{a.hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
