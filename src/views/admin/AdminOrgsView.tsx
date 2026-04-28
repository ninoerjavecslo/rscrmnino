import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { adminApi } from '../../lib/adminApi'
import { toast } from '../../lib/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useAdminStore } from '../../stores/admin'
import type { OrgData } from '../../contexts/OrgContext'

interface OrgRow {
  id: string
  slug: string
  name: string
  plan: 'free' | 'trial' | 'paid'
  status: 'active' | 'suspended'
  created_at: string
  organization_members: { count: number }[]
}

interface Member {
  id: string
  role: string
  user_id: string
  email?: string
  name?: string
}

const PLAN_BADGE: Record<string, 'green' | 'amber' | 'gray'> = { paid: 'green', trial: 'amber', free: 'gray' }
const STATUS_BADGE: Record<string, 'green' | 'red'> = { active: 'green', suspended: 'red' }
const TH = ({ children }: { children: React.ReactNode }) => (
  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{children}</th>
)

// ── Create Org Modal ─────────────────────────────────────────────
function CreateOrgModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [plan, setPlan] = useState<'free' | 'trial' | 'paid'>('trial')
  const [addUser, setAddUser] = useState(false)
  const [email, setEmail] = useState('')
  const [userName, setUserName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('owner')
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!slug.trim() || !name.trim()) return
    if (addUser && (!email.trim() || !password.trim())) {
      toast('error', 'Email and password required for the first user')
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('organizations')
      .insert({ slug: slug.trim().toLowerCase(), name: name.trim(), plan, status: 'active' })
    if (error) { toast('error', error.message); setSaving(false); return }

    if (addUser) {
      const { data: org } = await supabase.from('organizations').select('id').eq('slug', slug.trim().toLowerCase()).single()
      if (org) {
        const res = await adminApi.createUser(email.trim(), userName.trim(), password, org.id, role)
        if (!res.ok) { toast('error', res.error ?? 'User creation failed'); setSaving(false); return }
      }
    }

    toast('success', `"${name.trim()}" created`)
    onCreated()
    onClose()
    setSaving(false)
  }

  return (
    <Modal open title="New Organization" onClose={onClose} maxWidth={560}
      footer={
        <>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-sm" style={{ background: 'var(--navy)', color: '#fff' }} onClick={handleCreate} disabled={saving || !slug.trim() || !name.trim()}>
            {saving ? 'Creating…' : 'Create Organization'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Slug *</label>
            <input className="input" placeholder="renderspace" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s/g, '-'))} />
            <div className="text-xs text-[#94a3b8] mt-1">Subdomain: {slug || 'slug'}.insighty.io</div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Name *</label>
            <input className="input" placeholder="Renderspace" value={name} onChange={e => setName(e.target.value)} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Plan</label>
          <select className="input" value={plan} onChange={e => setPlan(e.target.value as 'free' | 'trial' | 'paid')} style={{ width: 160 }}>
            <option value="free">Free</option>
            <option value="trial">Trial</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <div style={{ borderTop: '1px solid #e8e3ea', paddingTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
            <input type="checkbox" checked={addUser} onChange={e => setAddUser(e.target.checked)} />
            Add first user to this organization
          </label>
        </div>

        {addUser && (
          <div className="flex flex-col gap-3 bg-[#f8f9fb] rounded-lg p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Email *</label>
                <input className="input" type="email" placeholder="user@company.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Name</label>
                <input className="input" placeholder="Full name" value={userName} onChange={e => setUserName(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Password *</label>
                <input className="input" type="password" placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>Role</label>
                <select className="input" value={role} onChange={e => setRole(e.target.value)}>
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Org Members Modal ────────────────────────────────────────────
function OrgMembersModal({ org, onClose }: { org: OrgRow; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState('member')
  const [adding, setAdding] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)
  const [roleConfirm, setRoleConfirm] = useState<{ member: Member; newRole: string } | null>(null)

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('organization_members')
      .select('id, role, user_id')
      .eq('organization_id', org.id)
      .order('role')
    const memberList = data ?? []
    const userIds = memberList.map(m => m.user_id)
    const { data: users } = userIds.length
      ? await supabase.from('app_users').select('id, email, name').in('id', userIds)
      : { data: [] }
    const userMap = Object.fromEntries((users ?? []).map(u => [u.id, u]))
    setMembers(memberList.map(m => ({ ...m, email: userMap[m.user_id]?.email, name: userMap[m.user_id]?.name })))
    setLoading(false)
  }, [org.id])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  async function handleAdd() {
    if (!addEmail.trim()) return
    setAdding(true)
    const res = await adminApi.addMember(addEmail.trim(), org.id, addRole)
    if (!res.ok) toast('error', res.error ?? 'Failed')
    else { toast('success', 'Member added'); setAddEmail(''); await fetchMembers() }
    setAdding(false)
  }

  async function handleRemove(member: Member) {
    const res = await adminApi.removeMember(member.id)
    if (!res.ok) toast('error', res.error ?? 'Failed')
    else { toast('success', 'Member removed'); setRemoveTarget(null); await fetchMembers() }
  }

  async function handleRoleChange(member: Member, newRole: string) {
    const res = await adminApi.updateMemberRole(member.id, newRole)
    if (!res.ok) toast('error', res.error ?? 'Failed')
    else { toast('success', 'Role updated'); setRoleConfirm(null); await fetchMembers() }
  }

  const ROLE_BADGE: Record<string, 'navy' | 'blue' | 'gray'> = { owner: 'navy', admin: 'blue', member: 'gray' }

  return (
    <>
      <Modal open title={`Members — ${org.name}`} onClose={onClose} maxWidth={580}
        footer={<button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>}
      >
        <div className="flex flex-col gap-4">
          {/* Add member */}
          <div className="bg-[#f8f9fb] rounded-lg p-4">
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add Existing User</div>
            <div className="flex gap-2 items-end">
              <div style={{ flex: 1 }}>
                <input className="input" type="email" placeholder="user@company.com" value={addEmail} onChange={e => setAddEmail(e.target.value)} />
              </div>
              <select className="input" value={addRole} onChange={e => setAddRole(e.target.value)} style={{ width: 110 }}>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
              <Button size="sm" onClick={handleAdd} disabled={adding || !addEmail.trim()}>
                {adding ? 'Adding…' : 'Add'}
              </Button>
            </div>
          </div>

          {/* Members list */}
          {loading ? (
            <div className="text-sm text-[#64748b] py-4 text-center">Loading…</div>
          ) : members.length === 0 ? (
            <div className="text-sm text-[#64748b] py-4 text-center">No members yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e8e3ea' }}>
                  <th style={{ padding: '8px 0', textAlign: 'left', fontWeight: 600, color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' }}>User</th>
                  <th style={{ padding: '8px 0', textAlign: 'left', fontWeight: 600, color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' }}>Role</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f1edf2' }}>
                    <td style={{ padding: '10px 0' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{m.name || '—'}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{m.email}</div>
                    </td>
                    <td style={{ padding: '10px 0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Badge variant={ROLE_BADGE[m.role] ?? 'gray'}>{m.role}</Badge>
                        <select
                          value={m.role}
                          onChange={e => setRoleConfirm({ member: m, newRole: e.target.value })}
                          style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #e8e3ea', cursor: 'pointer' }}
                        >
                          <option value="owner">owner</option>
                          <option value="admin">admin</option>
                          <option value="member">member</option>
                        </select>
                      </div>
                    </td>
                    <td style={{ padding: '10px 0', textAlign: 'right' }}>
                      <Button size="xs" variant="destructive" onClick={() => setRemoveTarget(m)}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove member"
        message={`Remove ${removeTarget?.email ?? ''} from ${org.name}? They will lose access immediately.`}
        confirmLabel="Remove"
        onConfirm={() => removeTarget && handleRemove(removeTarget)}
        onCancel={() => setRemoveTarget(null)}
      />

      <ConfirmDialog
        open={!!roleConfirm}
        title="Change role"
        message={`Change ${roleConfirm?.member.email}'s role to "${roleConfirm?.newRole}"?`}
        confirmLabel="Change role"
        onConfirm={() => roleConfirm && handleRoleChange(roleConfirm.member, roleConfirm.newRole)}
        onCancel={() => setRoleConfirm(null)}
      />
    </>
  )
}

// ── Main view ────────────────────────────────────────────────────
export function AdminOrgsView() {
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [membersOrg, setMembersOrg] = useState<OrgRow | null>(null)
  const [statusConfirm, setStatusConfirm] = useState<OrgRow | null>(null)
  const [planConfirm, setPlanConfirm] = useState<{ org: OrgRow; plan: 'free' | 'trial' | 'paid' } | null>(null)
  const { setImpersonatedOrg } = useAdminStore()

  const fetchOrgs = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('organizations')
      .select('*, organization_members(count)')
      .order('created_at', { ascending: false })
    if (error) toast('error', error.message)
    else setOrgs((data ?? []) as OrgRow[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  async function confirmToggleStatus(org: OrgRow) {
    const newStatus = org.status === 'active' ? 'suspended' : 'active'
    const { error } = await supabase.from('organizations').update({ status: newStatus }).eq('id', org.id)
    if (error) toast('error', error.message)
    else { toast('success', `${org.name} ${newStatus}`); setOrgs(orgs.map(o => o.id === org.id ? { ...o, status: newStatus } : o)) }
    setStatusConfirm(null)
  }

  async function confirmPlanChange() {
    if (!planConfirm) return
    const { error } = await supabase.from('organizations').update({ plan: planConfirm.plan }).eq('id', planConfirm.org.id)
    if (error) toast('error', error.message)
    else { toast('success', `Plan updated to ${planConfirm.plan}`); setOrgs(orgs.map(o => o.id === planConfirm.org.id ? { ...o, plan: planConfirm.plan } : o)) }
    setPlanConfirm(null)
  }

  function impersonate(org: OrgRow) {
    const data: OrgData = { orgId: org.id, slug: org.slug, name: org.name, plan: org.plan, status: org.status }
    setImpersonatedOrg(data)
    toast('info', `Impersonating ${org.name}`)
  }

  const memberCount = (org: OrgRow) => {
    const c = org.organization_members?.[0]?.count
    return typeof c === 'number' ? c : 0
  }

  return (
    <>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', fontFamily: 'Manrope, sans-serif', margin: 0 }}>Organizations</h1>
            <p className="text-sm text-[#64748b] mt-1">{orgs.length} total workspaces</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>+ New Organization</Button>
        </div>

        <div className="bg-white rounded-xl border border-[#e8e3ea] overflow-hidden">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-[#64748b]">Loading…</div>
          ) : orgs.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-[#64748b]">No organizations yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ borderBottom: '1px solid #e8e3ea', background: '#f8f9fb' }}>
                <tr>
                  <TH>Organization</TH>
                  <TH>Slug</TH>
                  <TH>Plan</TH>
                  <TH>Status</TH>
                  <TH>Members</TH>
                  <TH>Created</TH>
                  <TH>Actions</TH>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org, i) => (
                  <tr key={org.id} style={{ borderBottom: i < orgs.length - 1 ? '1px solid #f1edf2' : undefined }}>
                    <td style={{ padding: '13px 16px', fontWeight: 600, color: '#0f172a' }}>{org.name}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, color: '#475569' }}>{org.slug}</code>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Badge variant={PLAN_BADGE[org.plan]}>{org.plan}</Badge>
                        <select
                          value={org.plan}
                          onChange={e => setPlanConfirm({ org, plan: e.target.value as 'free' | 'trial' | 'paid' })}
                          style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #e8e3ea', cursor: 'pointer' }}
                        >
                          <option value="free">free</option>
                          <option value="trial">trial</option>
                          <option value="paid">paid</option>
                        </select>
                      </div>
                    </td>
                    <td style={{ padding: '13px 16px' }}><Badge variant={STATUS_BADGE[org.status]}>{org.status}</Badge></td>
                    <td style={{ padding: '13px 16px' }}>
                      <button
                        onClick={() => setMembersOrg(org)}
                        style={{ fontWeight: 600, color: '#0f172a', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}
                      >
                        {memberCount(org)}
                      </button>
                    </td>
                    <td style={{ padding: '13px 16px', color: '#94a3b8', fontSize: 12 }}>{new Date(org.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button size="xs" variant="outline" onClick={() => setMembersOrg(org)}>Members</Button>
                        <Button size="xs" variant="outline" onClick={() => impersonate(org)}>Impersonate</Button>
                        <Button size="xs" variant={org.status === 'active' ? 'destructive' : 'outline'} onClick={() => setStatusConfirm(org)}>
                          {org.status === 'active' ? 'Suspend' : 'Reactivate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showCreate && <CreateOrgModal onClose={() => setShowCreate(false)} onCreated={fetchOrgs} />}
      {membersOrg && <OrgMembersModal org={membersOrg} onClose={() => setMembersOrg(null)} />}

      <ConfirmDialog
        open={!!statusConfirm}
        title={statusConfirm?.status === 'active' ? 'Suspend organization' : 'Reactivate organization'}
        message={
          statusConfirm?.status === 'active'
            ? `Suspend "${statusConfirm.name}"? All users will be blocked from accessing the workspace.`
            : `Reactivate "${statusConfirm?.name}"? Users will regain access immediately.`
        }
        confirmLabel={statusConfirm?.status === 'active' ? 'Suspend' : 'Reactivate'}
        onConfirm={() => statusConfirm && confirmToggleStatus(statusConfirm)}
        onCancel={() => setStatusConfirm(null)}
      />

      <ConfirmDialog
        open={!!planConfirm}
        title="Change plan"
        message={`Change "${planConfirm?.org.name}" from ${planConfirm?.org.plan} to ${planConfirm?.plan}?`}
        confirmLabel="Change plan"
        onConfirm={confirmPlanChange}
        onCancel={() => setPlanConfirm(null)}
      />
    </>
  )
}
