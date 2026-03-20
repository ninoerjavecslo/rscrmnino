import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.53.0'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

interface InputProject {
  id: string
  pn: string
  name: string
  budget_hours: number
  member_ids: string[]
  deliverables: Array<{ title: string; due_date: string | null; estimated_hours: number | null }>
}

interface InputMember {
  id: string
  name: string
  hours_per_day: number
  role?: string | null
}

interface ExistingAlloc {
  member_id: string
  date: string
  hours: number
}

interface WizardAllocation {
  member_id: string
  project_id: string
  weekly_hours: number
  reason: string
}

interface WizardWeek {
  week_start: string
  allocations: WizardAllocation[]
}

function getMondaysInMonth(monthStart: string): string[] {
  const startDate = new Date(monthStart + 'T00:00:00')
  const month = startDate.getMonth()
  // Go to the Monday of the week containing month_start
  const d = new Date(startDate)
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))

  const mondays: string[] = []
  while (true) {
    const fri = new Date(d)
    fri.setDate(fri.getDate() + 4)
    // Stop when Monday is past the month (handles December: check year advance too)
    if (d.getFullYear() > startDate.getFullYear() ||
        (d.getMonth() > month && d.getFullYear() >= startDate.getFullYear())) break
    // Include weeks that have at least one day in the target month
    if (d.getMonth() === month || fri.getMonth() === month) {
      const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
      mondays.push(`${y}-${m}-${day}`)
    }
    d.setDate(d.getDate() + 7)
  }
  return mondays
}

function normalizeWeeks(raw: { weeks?: unknown[] } | null, members: InputMember[], projects: InputProject[]): WizardWeek[] {
  return ((raw?.weeks ?? []) as WizardWeek[]).map((w: WizardWeek) => ({
    week_start: w.week_start,
    allocations: (w.allocations ?? [])
      .map((a: WizardAllocation) => ({
        member_id: a.member_id,
        project_id: a.project_id,
        weekly_hours: Math.max(0, Number(a.weekly_hours) || 0),
        reason: a.reason ?? '',
      }))
      .filter((a: WizardAllocation) =>
        a.weekly_hours > 0
        && members.some(m => m.id === a.member_id)
        && projects.some(p => p.id === a.project_id)
      ),
  }))
}

function weekDays(monday: string): string[] {
  const d = new Date(monday + 'T00:00:00')
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    })
  }

  try {
    const { projects, members, month_start, existing_allocations } = await req.json() as {
      projects: InputProject[]
      members: InputMember[]
      month_start: string
      existing_allocations: ExistingAlloc[]
    }

    const mondays = getMondaysInMonth(month_start)

    // Compute available capacity per member per week
    const capacityMap: Record<string, Record<string, number>> = {}
    for (const m of members) {
      capacityMap[m.id] = {}
      for (const mon of mondays) {
        const days = weekDays(mon)
        const used = existing_allocations
          .filter(a => a.member_id === m.id && days.includes(a.date))
          .reduce((s, a) => s + a.hours, 0)
        capacityMap[m.id][mon] = Math.max(0, m.hours_per_day * 5 - used)
      }
    }

    const lines: string[] = []
    lines.push(`Month: ${month_start} — ${mondays.length} weeks`)
    lines.push(`Weeks: ${mondays.join(', ')}`)
    lines.push('')

    lines.push('=== TEAM CAPACITY PER WEEK ===')
    for (const m of members) {
      const weekCaps = mondays.map(mon => `${mon}: ${capacityMap[m.id][mon]}h`).join(' | ')
      lines.push(`${m.name} [id:${m.id}] (${m.role ?? 'team member'}): ${weekCaps}`)
    }
    lines.push('')

    lines.push('=== PROJECTS & BUDGETS ===')
    for (const p of projects) {
      const assignedNames = p.member_ids.map(mid => members.find(m => m.id === mid)?.name ?? mid).join(', ')
      lines.push(`${p.pn} — ${p.name} [id:${p.id}]: ${p.budget_hours}h budget | team: ${assignedNames}`)
      for (const d of p.deliverables) {
        lines.push(`  · "${d.title}" due ${d.due_date ?? 'no date'}, est. ${d.estimated_hours ?? '?'}h`)
      }
    }

    const prompt = `${lines.join('\n')}

=== YOUR TASK ===
Create a week-by-week allocation plan for this month. Distribute each project's budget across its team members over the available weeks.

Rules:
1. Never give a member more hours in a week than their available capacity for that week
2. Only assign members who are listed in a project's team
3. Prioritize deliverables with earlier due dates
4. Try to give each project meaningful progress every week (don't front-load or back-load)
5. Use 0.5h increments, minimum 1h per allocation entry
6. Aim to use most of each project's budget across the month

Return ONLY valid JSON (no markdown):
{
  "weeks": [
    {
      "week_start": "YYYY-MM-DD",
      "allocations": [
        { "member_id": "...", "project_id": "...", "weekly_hours": 20, "reason": "one sentence" }
      ]
    }
  ]
}`

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    let weeks: WizardWeek[] = []

    try {
      weeks = normalizeWeeks(JSON.parse(text.trim()), members, projects)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        try { weeks = normalizeWeeks(JSON.parse(match[0]), members, projects) } catch { /* give up */ }
      }
    }

    return new Response(JSON.stringify({ weeks }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
