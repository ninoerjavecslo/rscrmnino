import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.53.0'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

interface AllocationWithActual {
  id: string
  project_pn?: string
  project_name?: string
  category: string
  planned_hours: number
  actual_hours: number | null
  note?: string
}

interface WeekAllocation {
  date: string
  project_name?: string
  category: string
  hours: number
}

interface RescheduleOption {
  id: string
  title: string
  description: string
  impact: string
}

interface DayAdvisorResponse {
  reschedule_options: RescheduleOption[]
  insights: Array<{ label: string; text: string }>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }
    })
  }

  try {
    const { member_name, date, capacity_hours, today_tasks, remaining_week } = await req.json() as {
      member_name: string
      date: string
      capacity_hours: number
      today_tasks: AllocationWithActual[]
      remaining_week: WeekAllocation[]
    }

    const deltaLines = today_tasks
      .filter(t => t.actual_hours !== null && t.actual_hours !== t.planned_hours)
      .map(t => {
        const diff = (t.actual_hours ?? 0) - t.planned_hours
        const sign = diff > 0 ? '+' : ''
        return `- ${t.project_name || t.category}: planned ${t.planned_hours}h, actual ${t.actual_hours}h (${sign}${diff}h)${t.note ? ` — "${t.note}"` : ''}`
      })

    if (deltaLines.length === 0) {
      return new Response(JSON.stringify({ reschedule_options: [], insights: [] }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const remainingLines = remaining_week.map(a =>
      `  ${a.date}: ${a.project_name || a.category} ${a.hours}h`
    ).join('\n')

    const prompt = `You are a resource planning assistant for a digital agency.

Team member: ${member_name}
Date: ${date}
Daily capacity: ${capacity_hours}h

=== TODAY'S ACTUAL vs PLANNED ===
${deltaLines.join('\n')}

=== REMAINING WEEK (scheduled) ===
${remainingLines || '  (nothing else scheduled)'}

Based on these actual hours vs plan, suggest exactly 3 reschedule options.
Be specific: name the project, the hours, the day.
Keep each option short and actionable.

Also provide 1-2 brief insights (patterns, risks, opportunities).

Return ONLY valid JSON:
{
  "reschedule_options": [
    {
      "id": "opt1",
      "title": "Short title (max 40 chars)",
      "description": "One sentence with specifics: project, hours, day",
      "impact": "one-word impact: low | medium | high"
    }
  ],
  "insights": [
    { "label": "Pattern", "text": "One sentence observation" }
  ]
}`

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed: DayAdvisorResponse = JSON.parse(clean)

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
