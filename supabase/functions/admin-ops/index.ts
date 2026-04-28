import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ADMIN_EMAIL = 'nino.erjavec@renderspace.si'

function ok(data: unknown) {
  return new Response(JSON.stringify({ ok: true, data }), { headers: { 'Content-Type': 'application/json' } })
}
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })
  }
  if (req.method !== 'POST') return err('Method not allowed', 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return err('Unauthorized', 401)

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Verify caller is the admin
  const { data: { user } } = await admin.auth.getUser(token)
  if (!user || user.email !== ADMIN_EMAIL) return err('Forbidden', 403)

  const body = await req.json()
  const { action } = body

  // ── Create new user ─────────────────────────────────────────
  if (action === 'create-user') {
    const { email, name, password, org_id, role } = body
    if (!email || !password) return err('email and password required')

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: name ?? '' },
    })
    if (createErr) return err(createErr.message)

    if (org_id && created.user) {
      const { error: memberErr } = await admin
        .from('organization_members')
        .insert({ organization_id: org_id, user_id: created.user.id, role: role ?? 'member' })
      if (memberErr) return err(memberErr.message)
    }

    return ok({ user: created.user })
  }

  // ── Add existing user to org ─────────────────────────────────
  if (action === 'add-member') {
    const { email, org_id, role } = body
    if (!email || !org_id) return err('email and org_id required')

    // Look up user by email in app_users
    const { data: appUser } = await admin.from('app_users').select('id').eq('email', email).maybeSingle()
    if (!appUser) return err('No user found with that email')

    const { error } = await admin
      .from('organization_members')
      .insert({ organization_id: org_id, user_id: appUser.id, role: role ?? 'member' })
    if (error) return err(error.message)

    return ok({})
  }

  // ── Remove member from org ───────────────────────────────────
  if (action === 'remove-member') {
    const { member_id } = body
    const { error } = await admin.from('organization_members').delete().eq('id', member_id)
    if (error) return err(error.message)
    return ok({})
  }

  // ── Update member role ───────────────────────────────────────
  if (action === 'update-member-role') {
    const { member_id, role } = body
    const { error } = await admin.from('organization_members').update({ role }).eq('id', member_id)
    if (error) return err(error.message)
    return ok({})
  }

  return err('Unknown action', 400)
})
