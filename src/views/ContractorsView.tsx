import { useEffect, useState } from 'react'
import { useContractorsStore, type Contractor } from '../stores/contractors'
import { toast } from '../lib/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageHeader } from '../components/PageHeader'

const ROLES = ['Developer', 'Designer', 'Copywriter', 'SEO', 'Marketing', 'PM', 'Consultant', 'Photographer', 'Videographer', 'Other']

type FormState = {
  name: string
  role: string
  email: string
  phone: string
  website: string
  notes: string
  status: 'active' | 'inactive'
}

const EMPTY_FORM: FormState = { name: '', role: '', email: '', phone: '', website: '', notes: '', status: 'active' }

export function ContractorsView() {
  const store = useContractorsStore()
  const [showModal, setShowModal]       = useState(false)
  const [editTarget, setEditTarget]     = useState<Contractor | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Contractor | null>(null)
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [, setDeleting]                  = useState(false)
  const [search, setSearch]             = useState('')
  const [roleFilter, setRoleFilter]     = useState('all')

  useEffect(() => { store.fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd() {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(c: Contractor) {
    setEditTarget(c)
    setForm({
      name:    c.name,
      role:    c.role ?? '',
      email:   c.email ?? '',
      phone:   c.phone ?? '',
      website: c.website ?? '',
      notes:   c.notes ?? '',
      status:  c.status,
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name:    form.name.trim(),
        role:    form.role || null,
        email:   form.email || null,
        phone:   form.phone || null,
        website: form.website || null,
        notes:   form.notes || null,
        status:  form.status,
      }
      if (editTarget) {
        await store.update(editTarget.id, payload)
        toast('success', 'Contractor updated')
      } else {
        await store.add(payload)
        toast('success', 'Contractor added')
      }
      setShowModal(false)
    } catch {
      toast('error', 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await store.remove(deleteTarget.id)
      toast('success', 'Contractor removed')
      setDeleteTarget(null)
    } catch {
      toast('error', 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  const allRoles = [...new Set(store.contractors.map(c => c.role).filter(Boolean))] as string[]

  const filtered = store.contractors.filter(c => {
    if (roleFilter !== 'all' && c.role !== roleFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.name.toLowerCase().includes(q) && !(c.email ?? '').toLowerCase().includes(q) && !(c.role ?? '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const activeCount = store.contractors.filter(c => c.status === 'active').length

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Contractors" subtitle="External collaborators and freelancers">
        <Button onClick={openAdd}>+ Add Contractor</Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 px-6 pt-5 pb-1">
        <div className="bg-white rounded-[10px] border border-border p-4">
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-1">Total</div>
          <div className="text-[26px] font-extrabold">{store.contractors.length}</div>
          <div className="text-xs text-muted-foreground">contractors</div>
        </div>
        <div className="bg-white rounded-[10px] border border-border p-4">
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-1">Active</div>
          <div className="text-[26px] font-extrabold text-[#16a34a]">{activeCount}</div>
          <div className="text-xs text-muted-foreground">currently working</div>
        </div>
        <div className="bg-white rounded-[10px] border border-border p-4">
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-1">Roles</div>
          <div className="text-[26px] font-extrabold">{allRoles.length}</div>
          <div className="text-xs text-muted-foreground">distinct roles</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3">
        <input
          className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white w-48 focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none"
        >
          <option value="all">All Roles</option>
          {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} contractors</span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {store.loading ? (
          <div className="text-center text-muted-foreground py-10">Loading…</div>
        ) : filtered.length === 0 ? (
          <Card>
            <div className="text-center py-14 px-5">
              <div className="text-3xl mb-2">👷</div>
              <div className="font-bold text-[15px] text-[#374151] mb-1">No contractors yet</div>
              <div className="text-sm text-muted-foreground mb-4">Add your first external collaborator</div>
              <Button size="sm" onClick={openAdd}>+ Add Contractor</Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filtered.map(c => (
              <Card key={c.id}>
                <CardContent className="p-0">
                  <div className="flex items-start justify-between p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-full bg-[#f0f4ff] flex items-center justify-center text-[14px] font-extrabold text-[#1d4ed8] shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[14px]">{c.name}</span>
                          {c.role && <Badge variant="blue">{c.role}</Badge>}
                          {c.status === 'inactive' && <Badge variant="gray">Inactive</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                          {c.email && (
                            <a href={`mailto:${c.email}`} className="text-[13px] text-[#E85C1A] hover:underline">{c.email}</a>
                          )}
                          {c.phone && <span className="text-[13px] text-muted-foreground">{c.phone}</span>}
                          {c.website && (
                            <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer" className="text-[13px] text-muted-foreground hover:underline">
                              {c.website.replace(/^https?:\/\//, '')}
                            </a>
                          )}
                        </div>
                        {c.notes && <div className="text-[12px] text-muted-foreground mt-1.5 italic">{c.notes}</div>}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button variant="outline" size="xs" onClick={() => openEdit(c)}>Edit</Button>
                      <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeleteTarget(c)}>Delete</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      <Modal
        open={showModal}
        title={editTarget ? 'Edit Contractor' : 'New Contractor'}
        onClose={() => setShowModal(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : editTarget ? 'Save' : 'Add Contractor'}
            </Button>
          </>
        }
      >
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="w-full">
              <option value="">— None —</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Status</label>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 mt-0.5">
              {(['active', 'inactive'] as const).map(s => (
                <button key={s} type="button" onClick={() => setForm(f => ({ ...f, status: s }))}
                  className={`flex-1 py-1.5 rounded text-[13px] border-none cursor-pointer font-inherit transition-all ${
                    form.status === s ? `bg-white shadow-sm font-bold ${s === 'active' ? 'text-[#16a34a]' : 'text-muted-foreground'}` : 'bg-transparent font-medium text-muted-foreground'
                  }`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Phone</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+386 …" />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Website</label>
          <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://…" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Skills, rates, preferences…" rows={3} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Contractor"
        message={`Remove ${deleteTarget?.name} from contractors?`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
