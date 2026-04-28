import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAdminStore } from '../stores/admin'
import type { OrgData } from '../contexts/OrgContext'

interface OrgRow {
  id: string
  slug: string
  name: string
  plan: 'free' | 'trial' | 'paid'
  status: 'active' | 'suspended'
  created_at: string
  organization_members: { count: number }[]
}

const PLAN_VARIANTS: Record<string, 'green' | 'amber' | 'gray'> = {
  paid: 'green',
  trial: 'amber',
  free: 'gray',
}

const STATUS_VARIANTS: Record<string, 'green' | 'red'> = {
  active: 'green',
  suspended: 'red',
}

export function AdminView() {
  const [orgs, setOrgs] = useState<OrgRow[]>([])
  const [loading, setLoading] = useState(true)
  const { setImpersonatedOrg } = useAdminStore()

  // Create form state
  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [plan, setPlan] = useState<'free' | 'trial' | 'paid'>('trial')
  const [saving, setSaving] = useState(false)

  async function fetchOrgs() {
    setLoading(true)
    const { data, error } = await supabase
      .from('organizations')
      .select('*, organization_members(count)')
      .order('created_at', { ascending: false })
    if (error) {
      toast('error', error.message)
    } else {
      setOrgs((data ?? []) as OrgRow[])
    }
    setLoading(false)
  }

  useEffect(() => { fetchOrgs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!slug.trim() || !name.trim()) return
    setSaving(true)
    const { error } = await supabase
      .from('organizations')
      .insert({ slug: slug.trim(), name: name.trim(), plan, status: 'active' })
    if (error) {
      toast('error', error.message)
    } else {
      toast('success', `Organization "${name}" created`)
      setSlug('')
      setName('')
      setPlan('trial')
      await fetchOrgs()
    }
    setSaving(false)
  }

  async function handleToggleStatus(org: OrgRow) {
    const newStatus = org.status === 'active' ? 'suspended' : 'active'
    const { error } = await supabase
      .from('organizations')
      .update({ status: newStatus })
      .eq('id', org.id)
    if (error) {
      toast('error', error.message)
    } else {
      toast('success', `Organization ${newStatus}`)
      setOrgs(orgs.map(o => o.id === org.id ? { ...o, status: newStatus } : o))
    }
  }

  async function handlePlanChange(org: OrgRow, newPlan: 'free' | 'trial' | 'paid') {
    const { error } = await supabase
      .from('organizations')
      .update({ plan: newPlan })
      .eq('id', org.id)
    if (error) {
      toast('error', error.message)
    } else {
      toast('success', `Plan updated to ${newPlan}`)
      setOrgs(orgs.map(o => o.id === org.id ? { ...o, plan: newPlan } : o))
    }
  }

  function handleImpersonate(org: OrgRow) {
    const orgData: OrgData = {
      orgId: org.id,
      slug: org.slug,
      name: org.name,
      plan: org.plan,
      status: org.status,
    }
    setImpersonatedOrg(orgData)
    toast('info', `Impersonating ${org.name}`)
  }

  const memberCount = (org: OrgRow) => {
    const c = org.organization_members?.[0]?.count
    return typeof c === 'number' ? c : 0
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between px-0 py-0 mb-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--c0)', margin: 0 }}>Admin Console</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage organizations and billing</p>
        </div>
      </div>

      {/* Organizations table */}
      <div className="bg-white rounded-[10px] border border-border mb-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c0)', margin: 0 }}>Organizations</h2>
          <span className="text-sm text-muted-foreground">{orgs.length} total</span>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : orgs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No organizations yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e8e3ea' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, color: 'var(--c3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Slug</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, color: 'var(--c3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, color: 'var(--c3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, color: 'var(--c3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, color: 'var(--c3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Members</th>
                <th style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 600, color: 'var(--c3)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map(org => (
                <tr key={org.id} style={{ borderBottom: '1px solid #f1edf2' }}>
                  <td style={{ padding: '12px 20px', fontFamily: 'monospace', color: 'var(--c2)' }}>{org.slug}</td>
                  <td style={{ padding: '12px 20px', fontWeight: 600, color: 'var(--c0)' }}>{org.name}</td>
                  <td style={{ padding: '12px 20px' }}>
                    <select
                      value={org.plan}
                      onChange={e => handlePlanChange(org, e.target.value as 'free' | 'trial' | 'paid')}
                      style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: '1px solid #e8e3ea', cursor: 'pointer' }}
                    >
                      <option value="free">free</option>
                      <option value="trial">trial</option>
                      <option value="paid">paid</option>
                    </select>
                    <Badge variant={PLAN_VARIANTS[org.plan]} className="ml-2">{org.plan}</Badge>
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <Badge variant={STATUS_VARIANTS[org.status]}>{org.status}</Badge>
                  </td>
                  <td style={{ padding: '12px 20px', color: 'var(--c3)' }}>{memberCount(org)}</td>
                  <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Button size="xs" variant="outline" onClick={() => handleImpersonate(org)}>
                        Impersonate
                      </Button>
                      <Button
                        size="xs"
                        variant={org.status === 'active' ? 'destructive' : 'outline'}
                        onClick={() => handleToggleStatus(org)}
                      >
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

      {/* Create org form */}
      <div className="bg-white rounded-[10px] border border-border">
        <div className="px-5 py-4 border-b border-border">
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--c0)', margin: 0 }}>Create Organization</h2>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--c2)', display: 'block', marginBottom: 4 }}>Slug</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. renderspace"
                value={slug}
                onChange={e => setSlug(e.target.value)}
              />
              <div className="text-xs text-muted-foreground mt-1">Lowercase, no spaces. Used in subdomain.</div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--c2)', display: 'block', marginBottom: 4 }}>Name</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Renderspace"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="mb-4">
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--c2)', display: 'block', marginBottom: 4 }}>Plan</label>
            <select
              className="input"
              value={plan}
              onChange={e => setPlan(e.target.value as 'free' | 'trial' | 'paid')}
              style={{ width: 200 }}
            >
              <option value="free">Free</option>
              <option value="trial">Trial</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <Button onClick={handleCreate} disabled={saving || !slug.trim() || !name.trim()}>
            {saving ? 'Creating…' : 'Create Organization'}
          </Button>
        </div>
      </div>
    </div>
  )
}
