import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function generateLinkCode(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function createLinkCode(supabase: SupabaseClient): Promise<string> {
  const code = generateLinkCode()
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  // Upsert single row (single-user app — id is fixed)
  await supabase
    .from('telegram_auth')
    .upsert({ id: '00000000-0000-0000-0000-000000000001', link_code: code, link_code_expires_at: expires }, { onConflict: 'id' })

  return code
}

export async function verifyAndLinkCode(
  supabase: SupabaseClient,
  code: string,
  telegramId: number
): Promise<boolean> {
  const { data } = await supabase
    .from('telegram_auth')
    .select('link_code, link_code_expires_at')
    .single()

  if (!data?.link_code || data.link_code !== code) return false
  if (new Date(data.link_code_expires_at) < new Date()) return false

  await supabase
    .from('telegram_auth')
    .update({
      telegram_id: telegramId,
      link_code: null,
      link_code_expires_at: null,
      linked_at: new Date().toISOString(),
    })
    .eq('id', '00000000-0000-0000-0000-000000000001')

  return true
}

export async function getAuth(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('telegram_auth')
    .select('*')
    .single()
  return data
}

export async function storePendingAction(
  supabase: SupabaseClient,
  action: Record<string, unknown>
) {
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString()
  await supabase
    .from('telegram_auth')
    .update({ pending_action: action, pending_action_expires_at: expires })
    .eq('id', '00000000-0000-0000-0000-000000000001')
}

export async function clearPendingAction(supabase: SupabaseClient) {
  await supabase
    .from('telegram_auth')
    .update({ pending_action: null, pending_action_expires_at: null })
    .eq('id', '00000000-0000-0000-0000-000000000001')
}

export async function markUpdateProcessed(supabase: SupabaseClient, updateId: number) {
  await supabase
    .from('telegram_auth')
    .update({ last_update_id: updateId })
    .eq('id', '00000000-0000-0000-0000-000000000001')
}
