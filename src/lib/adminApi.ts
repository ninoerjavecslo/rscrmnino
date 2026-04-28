import { supabase } from './supabase'

const FN_URL = `${(import.meta as { env: Record<string, string> }).env.VITE_SUPABASE_URL}/functions/v1/admin-ops`

async function call(action: string, payload: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ action, ...payload }),
  })
  return res.json() as Promise<{ ok: boolean; data?: unknown; error?: string }>
}

export const adminApi = {
  createUser: (email: string, name: string, password: string, org_id?: string, role?: string) =>
    call('create-user', { email, name, password, org_id, role }),

  addMember: (email: string, org_id: string, role: string) =>
    call('add-member', { email, org_id, role }),

  removeMember: (member_id: string) =>
    call('remove-member', { member_id }),

  updateMemberRole: (member_id: string, role: string) =>
    call('update-member-role', { member_id, role }),
}
