import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMaintenancesStore } from '../stores/maintenances'
import { useSettingsStore } from '../stores/settings'
import type { HostingPayload } from '../stores/maintenances'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { Maintenance } from '../lib/types'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

function fmtEuro(n: number) {
  return n.toLocaleString('en-EU') + ' €'
}
function fmtDate(d?: string | null) {
  if (!d) return 'Open-ended'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function daysUntil(d: string) {
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
}

const STATUS_BADGE: Record<string, 'green' | 'amber' | 'red'> = {
  active: 'green',
  paused: 'amber',
  cancelled: 'red',
}


interface FormState {
  client_id: string
  project_pn: string
  name: string
  monthly_retainer: string
  billing_cycle: 'monthly' | 'annual'
  billing_month: string
  help_requests_included: string
  hours_included: string
  contract_start: string
  contract_duration_months: string  // '' = open-ended
  contract_url: string
  status: 'active' | 'paused' | 'cancelled'
  notes: string
  cms: string
  // Hosting
  hosting_enabled: boolean
  hosting_project_pn: string
  hosting_description: string
  hosting_cycle: 'monthly' | 'yearly'
  hosting_amount: string
  hosting_billing_since: string
}

const EMPTY_FORM: FormState = {
  client_id: '', project_pn: '', name: '', monthly_retainer: '', billing_cycle: 'monthly', billing_month: '1',
  help_requests_included: '', hours_included: '',
  contract_start: '', contract_duration_months: '', contract_url: '',
  status: 'active', notes: '', cms: '',
  hosting_enabled: false,
  hosting_project_pn: '', hosting_description: '',
  hosting_cycle: 'monthly', hosting_amount: '', hosting_billing_since: '',
}

function computeContractEnd(start: string, durationMonths: string): string | null {
  if (!start || !durationMonths) return null
  const n = parseInt(durationMonths)
  if (!n || n <= 0) return null
  const [y, m] = start.split('-').map(Number)
  const d = new Date(y, m - 1 + n - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fmtYearMonth(isoDate: string) {
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleString('en', { month: 'short', year: 'numeric' })
}

export function MaintenancesView() {
  const store = useMaintenancesStore()
  const cStore = useClientsStore()
  const pStore = useProjectsStore()
  const settingsStore = useSettingsStore()
  const navigate = useNavigate()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Maintenance | null>(null)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Maintenance | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function init() {
      await store.fetchAll()
      await cStore.fetchAll()
      await pStore.fetchAll()
      // Deep-link: ?edit=<id> from ClientDetailView
      const params = new URLSearchParams(window.location.search)
      const editId = params.get('edit')
      if (editId) {
        const m = store.maintenances.find(m => m.id === editId)
        if (m) openEdit(m)
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const active = store.maintenances.filter(m => m.status === 'active')
  const totalMonthly = active.reduce((s, m) => s + m.monthly_retainer, 0)
  const totalHours = active.reduce((s, m) => s + m.hours_included, 0)
  const expiringSoon = store.maintenances.filter(m =>
    m.status === 'active' && m.contract_end && daysUntil(m.contract_end) <= 30
  ).length

  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setShowModal(true)
  }

  async function openEdit(m: Maintenance) {
    setEditing(m)
    // Check for linked hosting — first by maintenance_id, then fall back to client_id
    let { data: hosting } = await supabase
      .from('hosting_clients')
      .select('*')
      .eq('maintenance_id', m.id)
      .maybeSingle()
    if (!hosting) {
      const { data: fallback } = await supabase
        .from('hosting_clients')
        .select('*')
        .eq('client_id', m.client_id)
        .is('maintenance_id', null)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      hosting = fallback
    }

    setForm({
      client_id: m.client_id,
      project_pn: m.project_pn ?? '',
      name: m.name,
      monthly_retainer: String(m.monthly_retainer),
      billing_cycle: m.billing_cycle ?? 'monthly',
      billing_month: String(m.billing_month ?? 1),
      help_requests_included: String(m.help_requests_included),
      hours_included: String(m.hours_included),
      contract_start: m.contract_start.slice(0, 7),
      contract_duration_months: (() => {
        if (!m.contract_end) return ''
        const from = new Date(m.contract_start + 'T00:00:00')
        const to = new Date(m.contract_end + 'T00:00:00')
        return String((to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1)
      })(),
      contract_url: m.contract_url ?? '',
      status: m.status,
      notes: m.notes ?? '',
      cms: m.cms ?? '',
      hosting_enabled: !!hosting,
      hosting_project_pn: hosting?.project_pn ?? '',
      hosting_description: hosting?.description ?? '',
      hosting_cycle: hosting?.cycle ?? 'monthly',
      hosting_amount: hosting ? String(hosting.amount) : '',
      hosting_billing_since: hosting?.billing_since ? hosting.billing_since.slice(0, 7) : '',
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm({ ...EMPTY_FORM })
  }

  const f = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [k]: e.target.value }))

  async function save() {
    if (!form.client_id || !form.name || !form.monthly_retainer || !form.contract_start) return
    if (form.hosting_enabled && form.hosting_amount && !form.hosting_billing_since) {
      toast('error', 'Billing since is required when hosting is included')
      return
    }
    setSaving(true)
    try {
      const payload = {
        client_id: form.client_id,
        project_pn: form.project_pn.trim() || null,
        name: form.name.trim(),
        monthly_retainer: Number(form.monthly_retainer),
        billing_cycle: form.billing_cycle,
        billing_month: form.billing_cycle === 'annual' ? Number(form.billing_month) || 1 : null,
        help_requests_included: Number(form.help_requests_included) || 0,
        hours_included: Number(form.hours_included) || 0,
        contract_start: form.contract_start + '-01',
        contract_end: computeContractEnd(form.contract_start, form.contract_duration_months),
        contract_url: form.contract_url.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
        cms: form.cms.trim() || null,
      }

      const hosting: HostingPayload | null = form.hosting_enabled && form.hosting_project_pn && form.hosting_amount
        ? {
            project_pn: form.hosting_project_pn,
            description: form.hosting_description.trim(),
            cycle: form.hosting_cycle,
            amount: Number(form.hosting_amount),
            billing_since: form.hosting_billing_since ? form.hosting_billing_since + '-01' : null,
          }
        : null

      if (editing) {
        await store.update(editing.id, payload, hosting)
        toast('success', 'Maintenance contract updated')
      } else {
        await store.add(payload, hosting)
        toast('success', 'Maintenance contract added')
      }
      closeModal()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await store.remove(deleteTarget.id)
      toast('success', 'Contract deleted')
      setDeleteTarget(null)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  const computedEnd = computeContractEnd(form.contract_start, form.contract_duration_months)

  return (
    <div>
      <Modal
        open={showModal}
        title={editing ? 'Edit Maintenance Contract' : 'New Maintenance Contract'}
        onClose={closeModal}
        maxWidth={640}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={closeModal}>Cancel</Button>
            <Button
              size="sm"
              onClick={save}
              disabled={saving || !form.client_id || !form.name || !form.monthly_retainer || !form.contract_start}
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create contract'}
            </Button>
          </>
        }
      >
        {/* Row 1: Client + Status */}
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Client</label>
            <Select
              value={form.client_id}
              onChange={val => setForm(prev => ({ ...prev, client_id: val }))}
              placeholder="Select client…"
              options={cStore.clients.map(c => ({ value: c.id, label: c.name }))}
            />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Status</label>
            <Select
              value={form.status}
              onChange={val => setForm(prev => ({ ...prev, status: val as FormState['status'] }))}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
          </div>
        </div>

        {/* Contract name + Project # */}
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div className="mb-4" style={{ flex: 2 }}>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Contract name</label>
            <input value={form.name} onChange={f('name')} placeholder="e.g. Website Support" autoFocus={!editing} />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Project # <span className="text-xs text-muted-foreground mt-1 ml-1">optional</span>
            </label>
            <input value={form.project_pn} onChange={f('project_pn')} placeholder="e.g. RS-2026-001" />
          </div>
        </div>

        {/* Row 2: Retainer + Requests + Hours */}
        <div className="grid grid-cols-3 gap-4 mb-3">
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              {form.billing_cycle === 'annual' ? 'Annual retainer (€)' : 'Monthly retainer (€)'}
            </label>
            <div className="flex gap-2 mt-1">
              <input type="number" value={form.monthly_retainer} onChange={f('monthly_retainer')} placeholder="500" className="flex-1 mt-0" />
              <div className="flex rounded border border-border overflow-hidden text-[11px] font-bold shrink-0 self-start">
                <button type="button" onClick={() => setForm(p => ({ ...p, billing_cycle: 'monthly' }))}
                  className={`px-2 py-[7px] ${form.billing_cycle === 'monthly' ? 'bg-primary text-white' : 'bg-white text-muted-foreground'}`}>
                  Mo
                </button>
                <button type="button" onClick={() => setForm(p => ({ ...p, billing_cycle: 'annual' }))}
                  className={`px-2 py-[7px] border-l border-border ${form.billing_cycle === 'annual' ? 'bg-primary text-white' : 'bg-white text-muted-foreground'}`}>
                  Yr
                </button>
              </div>
            </div>
            {form.billing_cycle === 'annual' && (
              <div className="mt-2">
                <label className="text-xs text-muted-foreground mb-1 block">Bill in month</label>
                <select value={form.billing_month} onChange={f('billing_month')} className="w-full">
                  {['January','February','March','April','May','June','July','August','September','October','November','December'].map((mo, i) => (
                    <option key={i+1} value={String(i+1)}>{mo}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Help requests / mo <span className="text-xs text-muted-foreground mt-1 ml-1">optional</span>
            </label>
            <input type="number" value={form.help_requests_included} onChange={f('help_requests_included')} placeholder="5" />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Hours / mo <span className="text-xs text-muted-foreground mt-1 ml-1">optional</span>
            </label>
            <input type="number" step="0.5" value={form.hours_included} onChange={f('hours_included')} placeholder="4" />
          </div>
        </div>

        {/* Row 3: Start + Duration */}
        <div className="grid grid-cols-2 gap-4 mb-1.5">
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Contract start</label>
            <input type="month" value={form.contract_start} onChange={f('contract_start')} placeholder="e.g. 2026-01" />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
              Duration <span className="text-xs text-muted-foreground mt-1 ml-1">months, optional</span>
            </label>
            <input type="number" min="1" value={form.contract_duration_months} onChange={f('contract_duration_months')} placeholder="e.g. 12" />
          </div>
        </div>

        {computedEnd && (
          <div className="text-xs text-primary bg-[var(--navy-light)] border border-[var(--navy-muted,#c7d2fe)] rounded px-3 py-1.5 mb-3">
            <strong>{form.contract_duration_months} months</strong>
            {' · Ends: '}<strong>{fmtYearMonth(computedEnd)}</strong>
            {form.monthly_retainer ? ` · Total: ${fmtEuro(form.billing_cycle === 'annual' ? Math.ceil(parseInt(form.contract_duration_months) / 12) * Number(form.monthly_retainer) : parseInt(form.contract_duration_months) * Number(form.monthly_retainer))}` : ''}
          </div>
        )}
        {!computedEnd && <div className="mb-3" />}

        {/* CMS + Contract URL + Notes */}
        <div className="mb-3">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            CMS / Technology <span className="text-xs text-muted-foreground mt-1 ml-1">optional</span>
          </label>
          <Select
            value={form.cms}
            onChange={val => setForm(prev => ({ ...prev, cms: val }))}
            placeholder="— None —"
            options={[{ value: '', label: '— None —' }, ...settingsStore.cmsOptions.map(c => ({ value: c, label: c }))]}
          />
        </div>
        <div className="mb-3">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Contract URL <span className="text-xs text-muted-foreground mt-1 ml-1">optional</span>
          </label>
          <input value={form.contract_url} onChange={f('contract_url')} placeholder="https://..." type="url" />
        </div>
        <div className="mb-5">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Notes <span className="text-xs text-muted-foreground mt-1 ml-1">optional</span>
          </label>
          <textarea value={form.notes} onChange={f('notes')} rows={2} placeholder="Any additional notes…" className="w-full" style={{ resize: 'vertical' }} />
        </div>

        {/* Hosting toggle */}
        <div className="border-t border-border pt-4">
          <label className="flex items-center gap-2.5 cursor-pointer select-none" style={{ marginBottom: form.hosting_enabled ? 14 : 0 }}>
            <input
              type="checkbox"
              checked={form.hosting_enabled}
              onChange={e => setForm(prev => ({ ...prev, hosting_enabled: e.target.checked }))}
              className="w-4 h-4 cursor-pointer"
            />
            <span className="font-semibold text-[13px] text-[var(--c1)]">Include hosting in this contract</span>
            <span className="text-xs text-muted-foreground mt-1">client pays for hosting as part of maintenance</span>
          </label>

          {form.hosting_enabled && (
            <div>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Project #</label>
                  <input value={form.hosting_project_pn} onChange={f('hosting_project_pn')} placeholder="e.g. RS-2026-00223" />
                </div>
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Billing cycle</label>
                  <Select
                    value={form.hosting_cycle}
                    onChange={val => setForm(prev => ({ ...prev, hosting_cycle: val as FormState['hosting_cycle'] }))}
                    options={[
                      { value: 'monthly', label: 'Monthly' },
                      { value: 'yearly', label: 'Yearly' },
                    ]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Hosting amount (€)</label>
                  <input type="number" value={form.hosting_amount} onChange={f('hosting_amount')} placeholder="120" />
                </div>
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Billing since</label>
                  <input type="month" value={form.hosting_billing_since} onChange={f('hosting_billing_since')} required />
                </div>
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                  Hosting description <span className="text-xs text-muted-foreground mt-1 ml-1">optional</span>
                </label>
                <input value={form.hosting_description} onChange={f('hosting_description')} placeholder="e.g. VPS + cPanel hosting" />
              </div>
            </div>
          )}
        </div>
      </Modal>

      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Maintenances</h1>
          <p className="text-muted-foreground text-[13px] m-0">Technical support retainer contracts</p>
        </div>
        <Button size="sm" onClick={openAdd}>+ New Contract</Button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4 px-6 pt-6">
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">ACTIVE CONTRACTS</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{active.length}</div>
          <div className="text-xs text-muted-foreground mt-1">{store.maintenances.length} total</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">MONTHLY RETAINER</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#16a34a]">{fmtEuro(totalMonthly)}</div>
          <div className="text-xs text-muted-foreground mt-1">active contracts</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">HOURS INCLUDED / MO</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{totalHours}h</div>
          <div className="text-xs text-muted-foreground mt-1">across active contracts</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">EXPIRING SOON</div>
          <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${expiringSoon > 0 ? 'text-[#d97706]' : 'text-foreground'}`}>
            {expiringSoon}
          </div>
          <div className="text-xs text-muted-foreground mt-1">within 30 days</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="flex items-center justify-between mb-2.5">
          <h2>Contracts</h2>
        </div>
        <Card>
          {store.loading ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">Loading…</div>
          ) : store.maintenances.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">
              No maintenance contracts yet.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>CLIENT</th>
                  <th>CONTRACT</th>
                  <th className="text-right">REQUESTS</th>
                  <th className="text-right">HOURS</th>
                  <th>START</th>
                  <th>END</th>
                  <th>HOSTING</th>
                  <th>STATUS</th>
                  <th className="text-right">RETAINER / MO</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {store.maintenances.map((m: Maintenance) => {
                  const expiring = m.contract_end && m.status === 'active' && daysUntil(m.contract_end) <= 30
                  const hasHosting = m.hosting_clients && m.hosting_clients.length > 0
                  return (
                    <tr key={m.id}>
                      <td className="text-[13px] text-[var(--c1)] font-semibold">{m.client?.name ?? '—'}</td>
                      <td className="font-bold">
                        <span className="font-medium text-primary hover:underline cursor-pointer" onClick={() => navigate(`/maintenances/${m.id}`)}>{m.name}</span>
                      </td>
                      <td className="text-right text-[#374151]">{m.help_requests_included}</td>
                      <td className="text-right text-[#374151]">{m.hours_included}h</td>
                      <td className="text-[13px] text-muted-foreground">{fmtDate(m.contract_start)}</td>
                      <td className={`text-[13px] ${expiring ? 'text-[#d97706] font-bold' : 'text-muted-foreground'}`}>
                        {fmtDate(m.contract_end)}
                      </td>
                      <td>
                        {hasHosting
                          ? <Badge variant="green">Yes</Badge>
                          : <Badge variant="gray">No</Badge>
                        }
                      </td>
                      <td>
                        <Badge variant={STATUS_BADGE[m.status] ?? 'gray'}>
                          {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="text-right font-semibold text-[#16a34a]">
                        {fmtEuro(m.monthly_retainer)}
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">{m.billing_cycle === 'annual' ? '/yr' : '/mo'}</span>
                      </td>
                      <td className="flex gap-1 items-center">
                        <Button variant="outline" size="xs" onClick={() => openEdit(m)}>Edit</Button>
                        <Button variant="destructive" size="xs" onClick={() => setDeleteTarget(m)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Contract"
        message={deleteTarget ? `This will permanently delete "${deleteTarget.name}" and all associated revenue planner entries.` : ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
      />
    </div>
  )
}
