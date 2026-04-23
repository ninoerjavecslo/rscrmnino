// Supabase Custom Access Token Hook — Edge Function fallback
// Registered in Supabase Dashboard > Authentication > Hooks
// as type "HTTPS" with this function's public URL.
//
// Semantics MUST match the SQL version in
// supabase/migrations/20260424000003_rls_policies.sql —
// look up organization_members by user_id, write
// organization_id into claims.app_metadata.
//
// The SQL pg-function hook (plan 01-03 Task 1) is primary.
// This Edge Function is the fallback — having both deployed
// lets the Supabase Dashboard switch between them without
// a code change.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Supabase sends a webhook signature; verify it in production.
// Set AUTH_HOOK_SECRET in Dashboard > Auth > Hooks env vars.
const HOOK_SECRET = Deno.env.get('AUTH_HOOK_SECRET') ?? ''

interface HookPayload {
  user_id: string
  claims: {
    app_metadata?: Record<string, unknown>
    [key: string]: unknown
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Supabase Auth sends a signature header — verify when HOOK_SECRET is set.
  if (HOOK_SECRET) {
    const provided = req.headers.get('webhook-signature') ?? ''
    if (provided !== HOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const payload = (await req.json()) as HookPayload
  const userId = payload.user_id

  if (!userId) {
    return new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Service-role client — bypasses RLS, needed to read
  // organization_members reliably before the user's session
  // is fully valid. Do NOT call supabase.auth.admin.*
  // on the same user (causes circular update + 422 timeout).
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  // Initialize app_metadata — write to app_metadata only
  // (PITFALLS.md Pitfall 2 — app_metadata is server-controlled)
  const appMeta = { ...(payload.claims.app_metadata ?? {}) } as Record<string, unknown>

  if (!error && data?.organization_id) {
    appMeta.organization_id = data.organization_id
  } else {
    // User has no membership — remove any stale org claim.
    delete appMeta.organization_id
  }

  const mutated: HookPayload = {
    ...payload,
    claims: {
      ...payload.claims,
      app_metadata: appMeta,
    },
  }

  return new Response(JSON.stringify(mutated), {
    headers: { 'Content-Type': 'application/json' },
  })
})
