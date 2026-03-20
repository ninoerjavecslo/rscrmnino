import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.53.0'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

interface Allocation {
  member_id: string
  category: string
  date: string
  hours: number
  is_billable?: boolean | null
  is_unplanned?: boolean | null
  deadline_date?: string | null
  member?: { id: string; name: string } | null
  project?: { id: string; pn: string; name: string } | null
}

interface Member {
  id: string
  name: string
  hours_per_day?: number
}

interface Deliverable {
  id: string
  title: string
  due_date?: string | null
  estimated_hours?: number | null
  status: string
  project?: { id: string; pn: string; name: string } | null
}

interface Advisory {
  id: string
  type: string
  priority: 'high' | 'medium' | 'low'
  title: string
  body: string
}

function buildContext(
  allocations: Allocation[],
  members: Member[],
  deliverables: Deliverable[],
  weekStart: string,
  weekEnd: string
): string {
  const lines: string[] = []
  lines.push(`Week: ${weekStart} to ${weekEnd}`)
  lines.push(`Team members: ${members.map(m => m.name).join(', ')}`)
  lines.push('')

  // Per-member summary
  for (const member of members) {
    const ma = allocations.filter(a => a.member_id === member.id)
    const total = ma.reduce((s, a) => s + a.hours, 0)
    const billable = ma.filter(a => a.is_billable).reduce((s, a) => s + a.hours, 0)
    const unplanned = ma.filter(a => a.is_unplanned).reduce((s, a) => s + a.hours, 0)
    const capacity = 5 * (member.hours_per_day ?? 8)
    if (total > 0) {
      lines.push(`${member.name}: ${total}h planned (capacity ${capacity}h), ${billable}h billable, ${unplanned}h unplanned`)
      // Per-day breakdown
      const days: Record<string, number> = {}
      for (const a of ma) { days[a.date] = (days[a.date] ?? 0) + a.hours }
      const dayStr = Object.entries(days).map(([d, h]) => `${d}: ${h}h`).join(', ')
      lines.push(`  Days: ${dayStr}`)
      // Categories
      const cats: Record<string, number> = {}
      for (const a of ma) { cats[a.category] = (cats[a.category] ?? 0) + a.hours }
      lines.push(`  Categories: ${Object.entries(cats).map(([c, h]) => `${c} ${h}h`).join(', ')}`)
    } else {
      lines.push(`${member.name}: 0h planned this week (capacity ${capacity}h)`)
    }
  }

  lines.push('')
  lines.push('Deliverables due this week or overdue:')
  const today = new Date().toISOString().slice(0, 10)
  const soon = new Date(); soon.setDate(soon.getDate() + 7)
  const soonStr = soon.toISOString().slice(0, 10)
  const relevant = deliverables.filter(d => d.status === 'active' && d.due_date && d.due_date <= soonStr)
  if (relevant.length === 0) {
    lines.push('  None')
  } else {
    for (const d of relevant) {
      const overdue = d.due_date && d.due_date < today ? ' [OVERDUE]' : ''
      lines.push(`  ${d.project?.name ?? 'Unknown'} — ${d.title} due ${d.due_date}${overdue}${d.estimated_hours ? ` (${d.estimated_hours}h est)` : ''}`)
    }
  }

  return lines.join('\n')
}

const SYSTEM_PROMPT = `You are a resource planning advisor for a digital agency. Analyze the weekly resource data and return a JSON response with actionable advisories.

Return ONLY valid JSON in this exact format:
{
  "summary": "2-3 sentence plain English summary of the week's resource situation",
  "advisories": [
    {
      "id": "unique-string-id",
      "type": "overallocation|underallocation|deadline_risk|unplanned_spike|low_billable|suggestion",
      "priority": "high|medium|low",
      "title": "Short title (max 60 chars)",
      "body": "Detailed explanation with specific names, hours, and actionable advice (max 150 chars)"
    }
  ]
}

Rules:
- Only include advisories that are genuinely worth acting on
- Be specific: use actual member names, project names, and hours
- priority "high" = needs action today, "medium" = review this week, "low" = nice to know
- Maximum 6 advisories total, prioritize the most impactful
- Today's date: ${new Date().toISOString().slice(0, 10)}`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  try {
    const { allocations, members, deliverables, weekStart, weekEnd } = await req.json()

    const context = buildContext(
      allocations ?? [],
      members ?? [],
      deliverables ?? [],
      weekStart ?? '',
      weekEnd ?? ''
    )

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Analyze this week's resource data:\n\n${context}` }],
    })

    const textBlock = res.content.find(b => b.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : '{}'

    // Parse JSON, strip markdown code fences if present
    const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(clean)

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
