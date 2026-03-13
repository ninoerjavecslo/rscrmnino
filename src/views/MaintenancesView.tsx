import { useEffect, useState } from 'react'
import { useMaintenancesStore } from '../stores/maintenances'
import type { HostingPayload } from '../stores/maintenances'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { Maintenance } from '../lib/types'

function fmtEuro(n: number) {
  return '€' + n.toLocaleString('en-EU')
}
function fmtDate(d?: string | null) {
  if (!d) return 'Open-ended'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function daysUntil(d: string) {
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
}

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green',
  paused: 'badge-amber',
  cancelled: 'badge-red',
}

function Modal({ open, title, onClose, children, footer }: {
  open: boolean; title: string
  onClose: () => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

interface FormState {
  client_id: string
  name: string
  monthly_retainer: string
  help_requests_included: string
  hours_included: string
  contract_start: string
  contract_end: string
  status: 'active' | 'paused' | 'cancelled'
  notes: string
  // Hosting
  hosting_enabled: boolean
  hosting_project_pn: string
  hosting_description: string
  hosting_cycle: 'monthly' | 'yearly'
  hosting_amount: string
  hosting_billing_since: string
}

const EMPTY_FORM: FormState = {
  client_id: '', name: '', monthly_retainer: '',
  help_requests_included: '', hours_included: '',
  contract_start: '', contract_end: '',
  status: 'active', notes: '',
  hosting_enabled: false,
  hosting_project_pn: '', hosting_description: '',
  hosting_cycle: 'monthly', hosting_amount: '', hosting_billing_since: '',
}

export function MaintenancesView() {
  const store = useMaintenancesStore()
  const cStore = useClientsStore()
  const pStore = useProjectsStore()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Maintenance | null>(null)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    store.fetchAll()
    cStore.fetchAll()
    pStore.fetchAll()
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
    // Check for linked hosting
    const { data: hosting } = await supabase
      .from('hosting_clients')
      .select('*')
      .eq('maintenance_id', m.id)
      .maybeSingle()

    setForm({
      client_id: m.client_id,
      name: m.name,
      monthly_retainer: String(m.monthly_retainer),
      help_requests_included: String(m.help_requests_included),
      hours_included: String(m.hours_included),
      contract_start: m.contract_start.slice(0, 7),
      contract_end: m.contract_end ? m.contract_end.slice(0, 7) : '',
      status: m.status,
      notes: m.notes ?? '',
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
    setSaving(true)
    try {
      const payload = {
        client_id: form.client_id,
        name: form.name.trim(),
        monthly_retainer: Number(form.monthly_retainer),
        help_requests_included: Number(form.help_requests_included) || 0,
        hours_included: Number(form.hours_included) || 0,
        contract_start: form.contract_start + '-01',
        contract_end: form.contract_end ? form.contract_end + '-01' : null,
        status: form.status,
        notes: form.notes.trim() || null,
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

  // Duration preview
  const durationMonths = (() => {
    if (!form.contract_start || !form.contract_end) return null
    const from = new Date(form.contract_start + '-01T00:00:00')
    const to = new Date(form.contract_end + '-01T00:00:00')
    if (to < from) return null
    return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1
  })()

  return (
    <div>
      <Modal
        open={showModal}
        title={editing ? 'Edit Maintenance Contract' : 'New Maintenance Contract'}
        onClose={closeModal}
        footer={
          <>
            <button className="btn btn-secondary btn-sm" onClick={closeModal}>Cancel</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={save}
              disabled={saving || !form.client_id || !form.name || !form.monthly_retainer || !form.contract_start}
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create contract'}
            </button>
          </>
        }
      >
        {/* Row 1: Client + Status */}
        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label">Client</label>
            <select value={form.client_id} onChange={f('client_id')}>
              <option value="">Select client…</option>
              {cStore.clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select value={form.status} onChange={f('status')}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Contract name */}
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Contract name</label>
          <input value={form.name} onChange={f('name')} placeholder="e.g. Website Support" autoFocus={!editing} />
        </div>

        {/* Row 2: Retainer + Requests + Hours */}
        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label">Monthly retainer (€)</label>
            <input type="number" value={form.monthly_retainer} onChange={f('monthly_retainer')} placeholder="500" />
          </div>
          <div className="form-group">
            <label className="form-label">Help requests / mo <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
            <input type="number" value={form.help_requests_included} onChange={f('help_requests_included')} placeholder="5" />
          </div>
          <div className="form-group">
            <label className="form-label">Hours / mo <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
            <input type="number" step="0.5" value={form.hours_included} onChange={f('hours_included')} placeholder="4" />
          </div>
        </div>

        {/* Row 3: Start + End */}
        <div className="form-row" style={{ marginBottom: durationMonths ? 6 : 14 }}>
          <div className="form-group">
            <label className="form-label">Contract start</label>
            <input type="month" value={form.contract_start} onChange={f('contract_start')} />
          </div>
          <div className="form-group">
            <label className="form-label">Contract end <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
            <input type="month" value={form.contract_end} onChange={f('contract_end')} />
          </div>
        </div>

        {durationMonths && (
          <div style={{ fontSize: 12, color: 'var(--navy)', background: 'var(--navy-light)', border: '1px solid var(--navy-muted, #c7d2fe)', borderRadius: 6, padding: '7px 12px', marginBottom: 14 }}>
            <strong>{durationMonths} months</strong>
            {form.monthly_retainer ? ` · Total: ${fmtEuro(durationMonths * Number(form.monthly_retainer))}` : ''}
          </div>
        )}

        {/* Notes */}
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label className="form-label">Notes <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
          <textarea value={form.notes} onChange={f('notes')} rows={2} placeholder="Any additional notes…" style={{ width: '100%', resize: 'vertical' }} />
        </div>

        {/* Hosting toggle */}
        <div style={{ borderTop: '1px solid var(--c6)', paddingTop: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', marginBottom: form.hosting_enabled ? 14 : 0 }}>
            <input
              type="checkbox"
              checked={form.hosting_enabled}
              onChange={e => setForm(prev => ({ ...prev, hosting_enabled: e.target.checked }))}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--c1)' }}>Include hosting in this contract</span>
            <span className="form-hint" style={{ fontSize: 12 }}>client pays for hosting as part of maintenance</span>
          </label>

          {form.hosting_enabled && (
            <div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Project #</label>
                  <select value={form.hosting_project_pn} onChange={f('hosting_project_pn')}>
                    <option value="">— Select project —</option>
                    {pStore.projects.map(p => <option key={p.pn} value={p.pn}>{p.pn} — {p.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Billing cycle</label>
                  <select value={form.hosting_cycle} onChange={f('hosting_cycle')}>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label">Hosting amount (€)</label>
                  <input type="number" value={form.hosting_amount} onChange={f('hosting_amount')} placeholder="120" />
                </div>
                <div className="form-group">
                  <label className="form-label">Billing since <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
                  <input type="month" value={form.hosting_billing_since} onChange={f('hosting_billing_since')} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Hosting description <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
                <input value={form.hosting_description} onChange={f('hosting_description')} placeholder="e.g. VPS + cPanel hosting" />
              </div>
            </div>
          )}
        </div>
      </Modal>

      <div className="page-header">
        <div>
          <h1>Maintenances</h1>
          <p style={{ color: 'var(--c3)', fontSize: 13, margin: 0 }}>Technical support retainer contracts</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ New Contract</button>
      </div>

      <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat-card" style={{ '--left-color': 'var(--navy)' } as React.CSSProperties}>
          <div className="stat-card-label">ACTIVE CONTRACTS</div>
          <div className="stat-card-value">{active.length}</div>
          <div className="stat-card-sub">{store.maintenances.length} total</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--green)' } as React.CSSProperties}>
          <div className="stat-card-label">MONTHLY RETAINER</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>{fmtEuro(totalMonthly)}</div>
          <div className="stat-card-sub">active contracts</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--blue)' } as React.CSSProperties}>
          <div className="stat-card-label">HOURS INCLUDED / MO</div>
          <div className="stat-card-value">{totalHours}h</div>
          <div className="stat-card-sub">across active contracts</div>
        </div>
        <div className="stat-card" style={{ '--left-color': expiringSoon > 0 ? 'var(--amber)' : 'var(--c4)' } as React.CSSProperties}>
          <div className="stat-card-label">EXPIRING SOON</div>
          <div className="stat-card-value" style={{ color: expiringSoon > 0 ? 'var(--amber)' : undefined }}>
            {expiringSoon}
          </div>
          <div className="stat-card-sub">within 30 days</div>
        </div>
      </div>

      <div className="page-content">
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Contracts</h2>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ New Contract</button>
        </div>
        <div className="card">
          {store.loading ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>Loading…</div>
          ) : store.maintenances.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              No maintenance contracts yet.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>CLIENT</th>
                  <th>CONTRACT</th>
                  <th className="th-right">RETAINER / MO</th>
                  <th className="th-right">REQUESTS</th>
                  <th className="th-right">HOURS</th>
                  <th>START</th>
                  <th>END</th>
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {store.maintenances.map((m: Maintenance) => {
                  const expiring = m.contract_end && m.status === 'active' && daysUntil(m.contract_end) <= 30
                  return (
                    <tr key={m.id}>
                      <td style={{ fontSize: 13, color: 'var(--c1)', fontWeight: 600 }}>{m.client?.name ?? '—'}</td>
                      <td style={{ fontWeight: 700 }}>{m.name}</td>
                      <td className="td-right text-mono" style={{ fontWeight: 600, color: 'var(--green)' }}>
                        {fmtEuro(m.monthly_retainer)}
                      </td>
                      <td className="td-right text-mono" style={{ color: 'var(--c2)' }}>{m.help_requests_included}</td>
                      <td className="td-right text-mono" style={{ color: 'var(--c2)' }}>{m.hours_included}h</td>
                      <td style={{ fontSize: 13, color: 'var(--c3)' }}>{fmtDate(m.contract_start)}</td>
                      <td style={{ fontSize: 13, color: expiring ? 'var(--amber)' : 'var(--c3)', fontWeight: expiring ? 700 : 400 }}>
                        {fmtDate(m.contract_end)}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[m.status] ?? 'badge-gray'}`}>
                          {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-xs" onClick={() => openEdit(m)}>Edit</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
