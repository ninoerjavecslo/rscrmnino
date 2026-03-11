import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendMessage } from '../_shared/telegram.ts'
import { getAuth } from '../_shared/auth.ts'

const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const telegramAuth = await getAuth(supabase)

  if (!telegramAuth?.telegram_id) {
    return new Response('No linked user', { status: 200 })
  }

  const chatId = telegramAuth.telegram_id
  const today = new Date()
  const dayOfMonth = today.getDate()

  // ── Monthly invoicing reminder (2nd of month) ─────────────────────────
  if (dayOfMonth === 2) {
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

    const { data: planned } = await supabase
      .from('revenue_planner')
      .select('id, planned_amount, project:projects(pn, name, client:clients(name))')
      .eq('month', thisMonth)
      .eq('status', 'planned')
      .order('planned_amount', { ascending: false })

    if (planned && planned.length > 0) {
      const total = planned.reduce((sum, p) => sum + (p.planned_amount ?? 0), 0)
      const monthLabel = today.toLocaleString('en', { month: 'long', year: 'numeric' })

      const lines = planned.map((p) => {
        const proj = p.project as Record<string, unknown>
        const client = (proj?.client as Record<string, unknown>)?.name ?? ''
        return `• <b>${proj?.name}</b> · ${client} · €${p.planned_amount?.toLocaleString()}`
      })

      await sendMessage(
        chatId,
        `📅 <b>Invoicing reminder — ${monthLabel}</b>\n\nPlanned entries to issue:\n${lines.join('\n')}\n\n<b>Total: €${total.toLocaleString()}</b>`
      )
    }
  }

  // ── Daily overdue check ───────────────────────────────────────────────
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]

  const { data: overdue } = await supabase
    .from('revenue_planner')
    .select('id, planned_amount, actual_amount, month, project:projects(pn, name, client:clients(name))')
    .eq('status', 'issued')
    .lt('month', thisMonthStart)
    .order('month', { ascending: true })

  if (overdue && overdue.length > 0) {
    for (const entry of overdue) {
      const proj = entry.project as Record<string, unknown>
      const client = (proj?.client as Record<string, unknown>)?.name ?? ''
      const amount = entry.actual_amount ?? entry.planned_amount
      const monthLabel = new Date(entry.month + 'T00:00:00').toLocaleString('en', { month: 'long', year: 'numeric' })
      const daysAgo = Math.floor((today.getTime() - new Date(entry.month + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))

      await sendMessage(
        chatId,
        `⚠️ <b>Overdue: ${proj?.name}</b> · ${client}\nMonth: ${monthLabel} · €${amount?.toLocaleString()} · issued ${daysAgo}d ago`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Mark paid', callback_data: `pay_${entry.id}` },
              { text: '⏭ Snooze', callback_data: `snooze_${entry.id}` },
            ]],
          },
        }
      )
    }
  }

  return new Response('OK', { status: 200 })
})
