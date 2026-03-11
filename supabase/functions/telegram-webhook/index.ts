import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.53.0'
import {
  sendMessage,
  sendConfirmation,
  answerCallbackQuery,
  editMessageReplyMarkup,
} from '../_shared/telegram.ts'
import {
  verifyAndLinkCode,
  getAuth,
  storePendingAction,
  clearPendingAction,
  markUpdateProcessed,
} from '../_shared/auth.ts'
import { TOOL_DEFINITIONS, executeTool, executeStatusUpdate } from '../_shared/tools.ts'

const WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

function supabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

Deno.serve(async (req) => {
  // Verify webhook secret
  const secret = req.headers.get('X-Telegram-Bot-Api-Secret-Token')
  if (secret !== WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const update = await req.json()

  await processUpdate(update).catch(console.error)

  return new Response('OK', { status: 200 })
})

async function processUpdate(update: Record<string, unknown>) {
  const supabase = supabaseClient()
  const auth = await getAuth(supabase)

  // ── Handle callback_query (inline button taps) ──────────────────────────
  if (update.callback_query) {
    const cq = update.callback_query as Record<string, unknown>
    const chatId = (cq.from as Record<string, unknown>).id as number
    const messageId = (cq.message as Record<string, unknown>)?.message_id as number

    await answerCallbackQuery(cq.id as string)

    if (!auth?.telegram_id || auth.telegram_id !== chatId) {
      return
    }

    const data = cq.data as string

    if (data === 'confirm_yes') {
      // Check TTL
      if (!auth.pending_action || !auth.pending_action_expires_at) {
        await sendMessage(chatId, '⚠️ Action expired. Please try again.')
        return
      }
      if (new Date(auth.pending_action_expires_at) < new Date()) {
        await clearPendingAction(supabase)
        await sendMessage(chatId, '⚠️ Confirmation timed out. Please try again.')
        return
      }

      const pa = auth.pending_action as Record<string, unknown>
      try {
        const result = await executeStatusUpdate(
          supabase,
          pa.plan_id as string,
          pa.new_status as string,
          pa.actual_amount as number | undefined
        )
        await clearPendingAction(supabase)
        await editMessageReplyMarkup(chatId, messageId)

        const proj = (result as Record<string, unknown>).project as Record<string, unknown>
        const client = (proj?.client as Record<string, unknown>)?.name ?? ''
        const emoji = pa.new_status === 'paid' ? '💰' : '✅'
        const label = pa.new_status === 'issued' ? 'issued' : 'marked as paid'
        const amount = (result as Record<string, unknown>).actual_amount ?? (result as Record<string, unknown>).planned_amount
        await sendMessage(chatId, `${emoji} ${proj?.name} · ${client} — €${amount} ${label}`)
      } catch (e) {
        await sendMessage(chatId, `❌ Error: ${(e as Error).message}`)
      }
    } else if (data === 'confirm_no') {
      await clearPendingAction(supabase)
      await editMessageReplyMarkup(chatId, messageId)
      await sendMessage(chatId, '↩️ Cancelled.')
    }

    return
  }

  // ── Handle text messages ─────────────────────────────────────────────────
  const message = update.message as Record<string, unknown> | undefined
  if (!message) return

  const updateId = update.update_id as number
  const chatId = (message.from as Record<string, unknown>).id as number
  const text = (message.text as string) ?? ''

  // Dedup
  if (auth?.last_update_id && auth.last_update_id >= updateId) return
  await markUpdateProcessed(supabase, updateId)

  // ── /start <code> ───────────────────────────────────────────────────────
  if (text.startsWith('/start')) {
    const code = text.split(' ')[1]?.trim()
    if (!code) {
      await sendMessage(chatId, '👋 Hi! To link your Renderspace account, go to Settings in the app and get your link code, then send:\n\n<code>/start YOUR_CODE</code>')
      return
    }
    const ok = await verifyAndLinkCode(supabase, code, chatId)
    if (ok) {
      await sendMessage(chatId, '✅ <b>Linked!</b> Your Renderspace account is connected.\n\nI\'m your Renderspace worker. Just tell me what to do:\n• "list active projects"\n• "create project for Acme, fixed 8000€"\n• "show planned invoices for March"\n• "issue March invoice for Acme"')
    } else {
      await sendMessage(chatId, '❌ Invalid or expired link code. Generate a new one in the app Settings.')
    }
    return
  }

  // Auth check — ignore messages from unknown senders
  if (!auth?.telegram_id || auth.telegram_id !== chatId) {
    await sendMessage(chatId, '🔒 Not linked. Send <code>/start</code> to get started.')
    return
  }

  // ── Claude tool_use loop ─────────────────────────────────────────────────
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const systemPrompt = `You are a Renderspace worker bot. You help manage projects, clients, and invoices.
Today is ${new Date().toISOString().split('T')[0]}.
Always respond in the same language the user is writing in.
Be concise — use bullet points and bold text (HTML) for structure.
For update_revenue_plan_status: always call the tool — the confirmation flow is handled separately.
Use €X,XXX format for amounts. Use project pn (e.g. RS-2026-001) when referencing projects.`

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: text },
  ]

  let finalText = ''

  // Agentic loop — Claude may call multiple tools
  for (let i = 0; i < 5; i++) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS as Anthropic.Messages.Tool[],
      messages,
    })

    if (response.stop_reason === 'end_turn') {
      finalText = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as Anthropic.Messages.TextBlock).text)
        .join('\n')
      break
    }

    if (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(b => b.type === 'tool_use') as Anthropic.Messages.ToolUseBlock[]
      messages.push({ role: 'assistant', content: response.content })

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []

      for (const toolUse of toolUses) {
        const { result, requiresConfirmation } = await executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          supabase
        )

        if (requiresConfirmation && toolUse.name === 'update_revenue_plan_status') {
          const pending = result as Record<string, unknown>
          const plan = pending.plan as Record<string, unknown>
          const proj = (plan.project as Record<string, unknown>)
          const client = ((proj?.client as Record<string, unknown>)?.name ?? '') as string
          const amount = plan.actual_amount ?? plan.planned_amount
          const month = (plan.month as string).slice(0, 7)
          const statusLabel = pending.new_status === 'paid' ? 'mark as paid' : 'issue'

          await storePendingAction(supabase, {
            plan_id: plan.id,
            new_status: pending.new_status,
            actual_amount: pending.actual_amount,
          })

          await sendConfirmation(
            chatId,
            `${statusLabel === 'issue' ? '🧾' : '💰'} <b>Confirm:</b> ${statusLabel} ${proj?.name} · ${client}\nMonth: ${month} · €${amount}`,
            'confirm_yes',
            'confirm_no'
          )
          return
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        })
      }

      messages.push({ role: 'user', content: toolResults })
      continue
    }

    break
  }

  if (finalText) {
    await sendMessage(chatId, finalText)
  }
}
