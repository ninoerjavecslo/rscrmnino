import type { ResourceAllocation, TeamMember, ProjectDeliverable } from './types'

export type AdvisoryPriority = 'high' | 'medium' | 'low'
export type AdvisoryType = 'overallocation' | 'underallocation' | 'deadline_risk' | 'unplanned_spike' | 'low_billable'

export interface Advisory {
  id: string
  type: AdvisoryType
  priority: AdvisoryPriority
  title: string
  body: string
  memberName?: string
  actionLabel?: string
}

export function generateAdvisories(
  allocations: ResourceAllocation[],
  members: TeamMember[],
  deliverables: ProjectDeliverable[],
  weekStart: string,
  _weekEnd: string
): Advisory[] {
  const advisories: Advisory[] = []
  const today = new Date().toISOString().slice(0, 10)

  // weekStart and weekEnd are used as context; weekEnd drives "soon" window
  void weekStart

  // 1. Over-allocation: member with total hours > days*8
  const weekDays = 5
  const capacity = weekDays * 8
  const memberHours = new Map<string, number>()
  for (const a of allocations) {
    memberHours.set(a.member_id, (memberHours.get(a.member_id) ?? 0) + a.hours)
  }
  for (const [memberId, hours] of memberHours) {
    if (hours > capacity) {
      const member = members.find(m => m.id === memberId)
      if (member) {
        advisories.push({
          id: `over-${memberId}`,
          type: 'overallocation',
          priority: 'high',
          title: `${member.name} is over-allocated`,
          body: `Planned ${hours}h this week (capacity: ${capacity}h). Consider redistributing ${hours - capacity}h.`,
          memberName: member.name,
          actionLabel: 'Review allocation',
        })
      }
    }
  }

  // 2. Under-allocation: member with < 50% capacity and has some hours
  for (const member of members) {
    const hours = memberHours.get(member.id) ?? 0
    const pct = hours / capacity
    if (pct < 0.5 && hours > 0) {
      advisories.push({
        id: `under-${member.id}`,
        type: 'underallocation',
        priority: 'low',
        title: `${member.name} has spare capacity`,
        body: `Only ${hours}h planned (${Math.round(pct * 100)}% utilization). ${Math.round(capacity - hours)}h available.`,
        memberName: member.name,
      })
    }
  }

  // 3. Deadline risk: deliverables due within 7 days that are still active
  const soon = new Date()
  soon.setDate(soon.getDate() + 7)
  const soonStr = soon.toISOString().slice(0, 10)
  for (const d of deliverables) {
    if (d.status === 'active' && d.due_date && d.due_date <= soonStr) {
      const overdue = d.due_date < today
      advisories.push({
        id: `deadline-${d.id}`,
        type: 'deadline_risk',
        priority: overdue ? 'high' : 'medium',
        title: overdue ? `Overdue: ${d.title}` : `Deadline soon: ${d.title}`,
        body: `${d.project?.name ?? 'Unknown project'} — due ${d.due_date}${d.estimated_hours ? ` (${d.estimated_hours}h estimated)` : ''}`,
        actionLabel: 'View project',
      })
    }
  }

  // 4. Unplanned spike: >20% of this week's hours are unplanned
  const totalHours = allocations.reduce((s, a) => s + a.hours, 0)
  const unplannedHours = allocations.filter(a => a.is_unplanned).reduce((s, a) => s + a.hours, 0)
  if (totalHours > 0 && unplannedHours / totalHours > 0.2) {
    advisories.push({
      id: 'unplanned-spike',
      type: 'unplanned_spike',
      priority: 'medium',
      title: 'High unplanned work this week',
      body: `${unplannedHours}h unplanned out of ${totalHours}h total (${Math.round(unplannedHours / totalHours * 100)}%). Review team capacity and buffer planning.`,
    })
  }

  // 5. Low billable ratio: <60% of hours are billable
  const billableHours = allocations.filter(a => a.is_billable).reduce((s, a) => s + a.hours, 0)
  if (totalHours >= 20 && billableHours / totalHours < 0.6) {
    advisories.push({
      id: 'low-billable',
      type: 'low_billable',
      priority: 'medium',
      title: 'Low billable ratio this week',
      body: `${billableHours}h billable out of ${totalHours}h total (${Math.round(billableHours / totalHours * 100)}%). Target is 60%+.`,
    })
  }

  // Sort: high → medium → low
  const order: Record<AdvisoryPriority, number> = { high: 0, medium: 1, low: 2 }
  return advisories.sort((a, b) => order[a.priority] - order[b.priority])
}
