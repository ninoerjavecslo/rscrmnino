import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.53.0'
import OpenAI from 'https://esm.sh/openai@4'
import { TOOL_DEFINITIONS, executeTool } from '../_shared/tools.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!

const DATA_KEYWORDS = [
  'revenue', 'client', 'domain', 'hosting', 'invoice', 'forecast',
  'maintenance', 'cost', 'pipeline', 'billing', 'contract', 'project',
  'expiry', 'payment', 'stranka', 'račun', 'domena', 'gostovanje',
  'value', 'worth', 'earn', 'earning', 'income', 'total', 'summary',
  'overview', 'how much', 'what do', 'unichem', 'client',
]

function routeModel(_message: string): 'claude' | 'gpt4o' {
  // Always use Claude — it has tool use and access to all live agency data
  return 'claude'
}

function toOpenAITools(tools: typeof TOOL_DEFINITIONS) {
  return tools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))
}

const SYSTEM_PROMPT = `You are Pixel AI, an intelligent assistant for an agency called Renderspace. You have access to the agency's live data: clients, projects, revenue, hosting, domains, maintenances, infrastructure costs, sales pipeline, team members, and resource planning.

Today's date is ${new Date().toISOString().slice(0, 10)}.

CORE RULE: ALWAYS use tools to fetch live data before answering. Never answer from memory or make assumptions. If you're unsure which tool to use, use multiple tools and combine the results.

TOOL USAGE RULES:
- Client value / what we earn / total from a client → use get_client_overview
- Monthly revenue / this month's income → use get_monthly_revenue_summary (not list_revenue_plans alone)
- Specific project details → use get_project_details
- All clients → use list_clients
- All projects → use list_projects
- Hosting → use list_hosting_clients
- Maintenance contracts → use list_maintenances (has billing_cycle: monthly or annual; annual contracts bill once per year in a selected billing_month)
- Domains → use list_domains
- Sales pipeline → use list_pipeline
- Team members / capacity / hours → use list_team_members
- Resource allocations / who is working on what / hours per project → use list_resource_allocations

RESOURCE PLANNING CONCEPTS:
- Team members have: hours_per_day (e.g. 8), overhead_meetings_month (h/mo for internal meetings), overhead_sales_month (h/mo for sales activities), vacation_days_year (vacation days per year).
- Capacity = (working days in month × hours_per_day) − (vacation days pro-rated per month).
- In "Estimated" mode: overhead hours (meetings + sales) are added to utilised hours (they count as work, not free time).
- In "Allocated" mode: only project deliverables count; no overhead.
- Deliverables are distributed across months weighted by working days in each month.
- Unassigned hours = estimated project hours not yet assigned to a specific person.

MAINTENANCE BILLING:
- monthly: one revenue plan row per month with the monthly_retainer amount.
- annual: one revenue plan row per year in the selected billing_month (e.g. billing_month=3 → March each year), with the full annual amount (monthly_retainer × 12). The monthly_retainer field stores the monthly equivalent even for annual contracts.

Format numbers as currency (e.g. 1.200 €). Format hours as e.g. 48 h. Be concise and direct.`

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
    const { message, conversation_id, history = [], force_model } = await req.json()
    if (!message) return new Response(JSON.stringify({ error: 'message required' }), { status: 400 })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const model: 'claude' | 'gpt4o' = (force_model === 'claude' || force_model === 'gpt4o')
      ? force_model
      : routeModel(message)

    // Upsert conversation
    let convId = conversation_id
    if (!convId) {
      const { data: conv } = await supabase
        .from('pixel_conversations')
        .insert({ title: message.slice(0, 60) })
        .select('id')
        .single()
      convId = conv?.id
    } else {
      await supabase.from('pixel_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId)
    }

    // Save user message
    await supabase.from('pixel_messages').insert({
      conversation_id: convId, role: 'user', content: message,
    })

    const msgs = [
      ...history.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ]

    let responseText = ''

    if (model === 'claude') {
      const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
      let claudeMsgs: Anthropic.MessageParam[] = msgs as Anthropic.MessageParam[]

      while (true) {
        const res = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: TOOL_DEFINITIONS as Anthropic.Tool[],
          messages: claudeMsgs,
        })

        if (res.stop_reason === 'tool_use') {
          const toolUses = res.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
          claudeMsgs = [...claudeMsgs, { role: 'assistant', content: res.content }]
          const toolResults: Anthropic.ToolResultBlockParam[] = []
          for (const tu of toolUses) {
            const { result } = await executeTool(tu.name, tu.input as Record<string, unknown>, supabase)
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
          }
          claudeMsgs = [...claudeMsgs, { role: 'user', content: toolResults }]
        } else {
          const textBlock = res.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined
          responseText = textBlock?.text ?? ''
          break
        }
      }
    } else {
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY })
      const openaiMsgs: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...msgs as OpenAI.ChatCompletionMessageParam[],
      ]

      while (true) {
        const res = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: openaiMsgs,
          tools: toOpenAITools(TOOL_DEFINITIONS),
          tool_choice: 'auto',
        })

        const choice = res.choices[0]
        openaiMsgs.push(choice.message)

        if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls) {
          for (const tc of choice.message.tool_calls) {
            const input = JSON.parse(tc.function.arguments)
            const { result } = await executeTool(tc.function.name, input, supabase)
            openaiMsgs.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            })
          }
        } else {
          responseText = choice.message.content ?? ''
          break
        }
      }
    }

    // Save assistant response
    await supabase.from('pixel_messages').insert({
      conversation_id: convId, role: 'assistant', content: responseText, model,
    })

    return new Response(JSON.stringify({ message: responseText, model, conversation_id: convId }), {
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
