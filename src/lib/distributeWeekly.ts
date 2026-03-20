import type { TeamMember, ResourceAllocation } from './types'

function weekDaysOf(monday: string): string[] {
  const d = new Date(monday + 'T00:00:00')
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  })
}

/**
 * Distribute weeklyHours evenly across Mon–Fri of weekStart,
 * respecting existing allocations as used capacity.
 * Returns 0.5h-rounded { date, hours } pairs for available days only.
 */
export function distributeWeekly(
  weekStart: string,
  memberId: string,
  weeklyHours: number,
  members: TeamMember[],
  allocations: ResourceAllocation[],
): { date: string; hours: number }[] {
  const member = members.find(m => m.id === memberId)
  if (!member) return []
  const days = weekDaysOf(weekStart)
  const used: Record<string, number> = {}
  for (const a of allocations) {
    if (a.member_id === memberId && days.includes(a.date)) {
      used[a.date] = (used[a.date] || 0) + a.hours
    }
  }
  const avail = days
    .map(d => ({ date: d, avail: Math.max(0, member.hours_per_day - (used[d] || 0)) }))
    .filter(x => x.avail > 0)
  if (avail.length === 0) return []
  const perDay = weeklyHours / avail.length
  const result: { date: string; hours: number }[] = []
  let remaining = weeklyHours
  for (const { date, avail: cap } of avail) {
    if (remaining <= 0) break
    const h = Math.min(Math.round(Math.min(perDay, cap) * 2) / 2, Math.round(remaining * 2) / 2)
    if (h > 0) { result.push({ date, hours: h }); remaining -= h }
  }
  return result
}
