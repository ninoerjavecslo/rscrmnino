import { supabase } from './supabase'

export interface MemberBufferStats {
  memberId: string
  avgUnplannedHoursPerWeek: number
  totalUnplannedHours: number
  weeksAnalyzed: number
  topCategories: Array<{ category: string; hours: number }>
}

/**
 * Analyze unplanned work history for a member over the past N weeks.
 * Returns suggested buffer hours per week.
 */
export async function analyzeMemberBuffer(memberId: string, weeksBack = 8): Promise<MemberBufferStats> {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - weeksBack * 7)

  const from = `${startDate.getFullYear()}-${String(startDate.getMonth()+1).padStart(2,'0')}-${String(startDate.getDate()).padStart(2,'0')}`
  const to = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`

  const { data } = await supabase
    .from('resource_allocations')
    .select('category, hours, date')
    .eq('member_id', memberId)
    .eq('is_unplanned', true)
    .gte('date', from)
    .lte('date', to)

  const rows = data ?? []
  const totalHours = rows.reduce((s, r) => s + (r.hours ?? 0), 0)

  // Count by category
  const catMap: Record<string, number> = {}
  for (const r of rows) {
    catMap[r.category] = (catMap[r.category] ?? 0) + r.hours
  }
  const topCategories = Object.entries(catMap)
    .map(([category, hours]) => ({ category, hours }))
    .sort((a, b) => b.hours - a.hours)

  return {
    memberId,
    avgUnplannedHoursPerWeek: weeksBack > 0 ? Math.round((totalHours / weeksBack) * 10) / 10 : 0,
    totalUnplannedHours: totalHours,
    weeksAnalyzed: weeksBack,
    topCategories,
  }
}

/**
 * Get buffer stats for all members in a list, in parallel.
 */
export async function analyzeTeamBuffers(memberIds: string[]): Promise<Map<string, MemberBufferStats>> {
  const results = await Promise.all(memberIds.map(id => analyzeMemberBuffer(id)))
  return new Map(results.map(r => [r.memberId, r]))
}
