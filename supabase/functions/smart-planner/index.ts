import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.53.0'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

interface Member {
  id: string
  name: string
  hours_per_day: number
  role?: string | null
  team?: { name: string; color: string } | null
}

interface Deliverable {
  id: string
  title: string
  due_date?: string | null
  estimated_hours?: number | null
  status: string
  project?: { id: string; pn: string; name: string } | null
}

interface Allocation {
  member_id: string
  category: string
  date: string
  hours: number
  project?: { id: string; pn: string; name: string } | null
}

interface Project {
  id: string
  pn: string
  name: string
  status: string
}

interface Suggestion {
  member_id: string
  project_id: string
  category: string
  weekly_hours: number
  label: string
  reason: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } })
  }

  try {
    const { members, deliverables, allocations, weekStart, weekEnd, projects } = await req.json() as {
      members: Member[]
      deliverables: Deliverable[]
      allocations: Allocation[]
      weekStart: string
      weekEnd: string
      projects: Project[]
    }

    // Weekly capacity per member
    const weeklyUsed: Record<string, number> = {}
    for (const m of members) weeklyUsed[m.id] = 0
    for (const a of allocations) {
      weeklyUsed[a.member_id] = (weeklyUsed[a.member_id] || 0) + a.hours
    }

    const lines: string[] = []
    lines.push(`Week: ${weekStart} to ${weekEnd}`)
    lines.push('')

    lines.push('=== TEAM CAPACITY (WEEKLY) ===')
    for (const m of members) {
      const capacity = m.hours_per_day * 5
      const used = weeklyUsed[m.id] || 0
      const avail = Math.max(0, capacity - used)
      lines.push(`${m.name} [id:${m.id}] (${m.role || 'team member'}): ${avail}h available (${used}h used of ${capacity}h total)`)
    }
    lines.push('')

    lines.push('=== ACTIVE DELIVERABLES ===')
    const active = deliverables.filter(d => d.status === 'active')
    if (active.length === 0) {
      lines.push('No active deliverables.')
    } else {
      for (const d of active) {
        const proj = d.project ? `${d.project.pn} — ${d.project.name} [id:${d.project.id}]` : 'Unknown project'
        lines.push(`- [${proj}] "${d.title}" due ${d.due_date || 'no date'}, est. ${d.estimated_hours || '?'}h`)
      }
    }
    lines.push('')

    lines.push('=== EXISTING ALLOCATIONS THIS WEEK ===')
    if (allocations.length === 0) {
      lines.push('None yet.')
    } else {
      const summary: Record<string, number> = {}
      for (const a of allocations) {
        const mem = members.find(m => m.id === a.member_id)
        const proj = a.project ? `${a.project.pn}` : a.category
        const key = `${mem?.name || '?'} / ${proj}`
        summary[key] = (summary[key] || 0) + a.hours
      }
      for (const [key, h] of Object.entries(summary)) {
        lines.push(`- ${key}: ${h}h`)
      }
    }

    const prompt = `${lines.join('\n')}

=== YOUR TASK ===
Suggest how to allocate the remaining available hours this week across active deliverables.

Rules:
1. Never suggest more weekly_hours for a member than their available capacity
2. Prioritize deliverables with closer due dates
3. Suggest weekly_hours in 0.5h increments, minimum 1h per suggestion
4. Only suggest for members with available capacity
5. Focus on meaningful blocks — one suggestion per member per project is ideal

Return ONLY a JSON object (no markdown, no explanation):
{
  "suggestions": [
    {
      "member_id": "<exact member id from context>",
      "project_id": "<project id or empty string>",
      "category": "project",
      "weekly_hours": 12,
      "label": "short label if no project",
      "reason": "one sentence why"
    }
  ]
}

Maximum 12 suggestions total.`

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    let suggestions: Suggestion[] = []
    try {
      const parsed = JSON.parse(text.trim())
      suggestions = (parsed.suggestions || []).filter((s: Suggestion) =>
        s.member_id && s.weekly_hours > 0 && s.category
      )
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          const parsed = JSON.parse(match[0])
          suggestions = parsed.suggestions || []
        } catch { /* give up */ }
      }
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
