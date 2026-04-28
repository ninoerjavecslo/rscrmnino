import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { adminApi } from '../../lib/adminApi'
import { toast } from '../../lib/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'

interface UserRow {
  id: string
  email: string
  name: string
  created_at: string
  memberships: { member_id: string; org_id: string; org_name: string; org_slug: string; role: string }[]
}

interface OrgOption { id: string; name: string; slug: string }

const ROLE_BADGE: Record<string, 'navy' | 'blue' | 'gray'> = { owner: 'navy', admin: 'blue', member: 'gray' }
const TH = ({ children }: { children: React.ReactNode }) => (
  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{children}</th>
)

// ── Add User Modal ───────────────────────────────────────────────
function AddUserModal({ orgs, onClose, onCreated }: { orgs: OrgOption[]; onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [orgId, setOrgId] = useState('')
  const [role, setRole] = useState('member')
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!email.trim() || !password.trim()) return
    setSaving(true)
    const res = await adminApi.createUser(email.trim(), name.trim(), password, orgId || undefined, role)
    if (!res.ok) { toast('error', res.error ?? 'Failed to create user'); setSaving(false); return }
    toast('success', `User "${email}" created`)
    onCreated()
    onClose()
    setSaving(false)
  }

  return (
    <Modal open title="Add New User" onClose={onClose} maxWidth={500}
      footer={
        <>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-sm" style={{ background: 'var(--navy)', color: '#fff' }}
            onClick={handleCreate} disabled={saving || !email.trim() || !password.trim()}>
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Email *</label>
            <input className="input" type="email" placeholder="user@company.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Full name</label>
            <input className="input" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Password *</label>
          <input className="input" type="password" placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <div style={{ borderTop: '1px solid #e8e3ea', paddingTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Assign to workspace (optional)</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Organization</label>
              <select className="input" value={orgId} onChange={e => setOrgId(e.target.value)}>
                <option value="">— None —</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Role</label>
              <select className="input" value={role} onChange={e => setRole(e.target.value)} disabled={!orgId}>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Main view ────────────────────────────────────────────────────
export function AdminUsersView() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [orgs, setOrgs] = useState<OrgOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<{ memberId: string; email: string; orgName: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [usersRes, membersRes, orgsRes] = await Promise.all([
      supabase.from('app_users').select('id, email, name, created_at').order('created_at', { ascending: false }),
      supabase.from('organization_members').select('id, user_id, role, organization_id, organizations(id, name, slug)'),
      supabase.from('organizations').select('id, name, slug').order('name'),
    ])
    setOrgs((orgsRes.data ?? []) as OrgOption[])
    const membersByUser: Record<string, UserRow['memberships']> = {}
    for (const m of membersRes.data ?? []) {
      const org = m.organizations as { id: string; name: string; slug: string } | null
      if (!membersByUser[m.user_id]) membersByUser[m.user_id] = []
      membersByUser[m.user_id].push({ member_id: m.id, org_id: m.organization_id, org_name: org?.name ?? '—', org_slug: org?.slug ?? '', role: m.role })
    }
    setUsers((usersRes.data ?? []).map(u => ({ ...u, memberships: membersByUser[u.id] ?? [] })))
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleRemoveMember() {
    if (!removeTarget) return
    const res = await adminApi.removeMember(removeTarget.memberId)
    if (!res.ok) toast('error', res.error ?? 'Failed')
    else { toast('success', 'Removed from workspace'); setRemoveTarget(null); await load() }
  }

  const filtered = users.filter(u =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) || u.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', fontFamily: 'Manrope, sans-serif', margin: 0 }}>Users</h1>
            <p className="text-sm text-[#64748b] mt-1">{users.length} total accounts</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input className="input" style={{ width: 240 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            <Button onClick={() => setShowAdd(true)}>+ Add User</Button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-[#e8e3ea] overflow-hidden">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-[#64748b]">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[#64748b]">No users found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ borderBottom: '1px solid #e8e3ea', background: '#f8f9fb' }}>
                <tr><TH>User</TH><TH>Workspaces</TH><TH>Joined</TH></tr>
              </thead>
              <tbody>
                {filtered.map((user, i) => (
                  <tr key={user.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f1edf2' : undefined }}>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{user.name || '—'}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{user.email}</div>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {user.memberships.length === 0 ? (
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>No workspace</span>
                      ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {user.memberships.map(m => (
                            <div key={m.member_id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f8f9fb', border: '1px solid #e8e3ea', borderRadius: 6, padding: '3px 8px' }}>
                              <code style={{ fontSize: 11, color: '#475569' }}>{m.org_slug}</code>
                              <Badge variant={ROLE_BADGE[m.role] ?? 'gray'}>{m.role}</Badge>
                              <button
                                onClick={() => setRemoveTarget({ memberId: m.member_id, email: user.email, orgName: m.org_name })}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
                                title="Remove from workspace"
                              >×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '13px 16px', color: '#94a3b8', fontSize: 12 }}>{new Date(user.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAdd && <AddUserModal orgs={orgs} onClose={() => setShowAdd(false)} onCreated={load} />}

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove from workspace"
        message={`Remove ${removeTarget?.email} from "${removeTarget?.orgName}"? They will lose access immediately.`}
        confirmLabel="Remove"
        onConfirm={handleRemoveMember}
        onCancel={() => setRemoveTarget(null)}
      />
    </>
  )
}
