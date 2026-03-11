import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createLinkCode, getAuth } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

function supabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  const supabase = supabaseClient()

  // GET — generate a new link code
  if (req.method === 'GET') {
    const code = await createLinkCode(supabase)
    return new Response(JSON.stringify({ code }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  // GET status — check if linked
  if (req.method === 'POST') {
    const auth = await getAuth(supabase)
    return new Response(
      JSON.stringify({
        linked: !!auth?.telegram_id,
        linked_at: auth?.linked_at ?? null,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }

  // DELETE — revoke link
  if (req.method === 'DELETE') {
    await supabase
      .from('telegram_auth')
      .update({ telegram_id: null, linked_at: null, pending_action: null, pending_action_expires_at: null })
      .eq('id', '00000000-0000-0000-0000-000000000001')

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  return new Response('Method not allowed', { status: 405, headers: cors })
})
