import type { TeamMember, ResourceAllocation, CompanyHoliday } from './types'

interface TimeOffEntry { member_id: string; start_date: string; end_date: string }

/** Returns all Mon–Fri date strings (YYYY-MM-DD) between start and end inclusive */
export function workDaysInRange(start: string, end: string): string[] {
  const days: string[] = []
  const cur = new Date(start + 'T00:00:00')
  const endDate = new Date(end + 'T00:00:00')
  while (cur <= endDate) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) {
      days.push(cur.toISOString().slice(0, 10))
    }
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

/** Count of `days` covered by any time_off entry for the member */
export function timeOffWorkDays(timeOff: TimeOffEntry[], days: string[]): number {
  return days.filter(d => timeOff.some(t => t.start_date <= d && t.end_date >= d)).length
}

/** Whether a holiday applies to the given teamId */
function holidayApplies(holiday: CompanyHoliday, teamId: string | null | undefined): boolean {
  if (holiday.applies_to.length === 0) return true
  if (!teamId) return false
  return holiday.applies_to.includes(teamId)
}

/**
 * Count of `days` blocked by a company holiday that applies to this team.
 * Yearly-recurring holidays are expanded to `year` before matching.
 */
export function holidayWorkDays(
  holidays: CompanyHoliday[],
  days: string[],
  teamId: string | null | undefined,
  year: number,
): number {
  const effectiveDates = holidays
    .filter(h => holidayApplies(h, teamId))
    .map(h => h.recurrence === 'yearly' ? `${year}-${h.date.slice(5)}` : h.date)

  return days.filter(d => effectiveDates.includes(d)).length
}

/**
 * Computes adjusted capacity for a member over a set of working days,
 * accounting for time off, company holidays, and leave allocations.
 */
export function adjustedCapacityForRange(
  member: Pick<TeamMember, 'id' | 'team_id' | 'hours_per_day'>,
  days: string[],
  timeOff: TimeOffEntry[],
  holidays: CompanyHoliday[],
  leaveAllocations: ResourceAllocation[],
  year: number,
): { capacity: number; adjustedCapacity: number } {
  const memberTimeOff = timeOff.filter(t => t.member_id === member.id)
  const offDays = timeOffWorkDays(memberTimeOff, days)
  const holDays = holidayWorkDays(holidays, days, member.team_id, year)
  const grossDays = Math.max(0, days.length - offDays - holDays)
  const capacity = grossDays * member.hours_per_day

  const leaveHours = leaveAllocations
    .filter(a => a.member_id === member.id && a.category === 'leave')
    .reduce((s, a) => s + a.hours, 0)

  return { capacity, adjustedCapacity: Math.max(0, capacity - leaveHours) }
}
