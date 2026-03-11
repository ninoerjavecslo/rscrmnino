const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN')!
const API = `https://api.telegram.org/bot${BOT_TOKEN}`

export async function sendMessage(
  chatId: number,
  text: string,
  options: Record<string, unknown> = {}
) {
  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...options }),
  })
}

export async function sendConfirmation(
  chatId: number,
  text: string,
  callbackYes: string,
  callbackNo: string
) {
  await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ Yes', callback_data: callbackYes },
          { text: '❌ Cancel', callback_data: callbackNo },
        ]],
      },
    }),
  })
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await fetch(`${API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  })
}

export async function editMessageReplyMarkup(chatId: number, messageId: number) {
  await fetch(`${API}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
  })
}
