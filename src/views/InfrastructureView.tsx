import { useEffect, useState } from 'react'
import { useInfraStore } from '../stores/infrastructure'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { HostingClient } from '../lib/types'
import { Select } from '../components/Select'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return '€' + n.toFixed(2).replace(/\.00$/, '') }
function fmtDate(d?: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Modal({ open, title, maxWidth = 540, onClose, children, footer }: {
  open: boolean; title: string; maxWidth?: number
  onClose: () => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth }}>
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

// ── Add hosting form state ────────────────────────────────────────────────────

function useHostingForm() {
  const [form, setForm] = useState({ client_id: '', project_pn: '', description: '', cycle: 'monthly' as 'monthly' | 'yearly', amount: '', billing_since: '', next_invoice_date: '', accounting_email: false })
  function set(field: string, val: string | boolean) { setForm(f => ({ ...f, [field]: val })) }
  function reset() { setForm({ client_id: '', project_pn: '', description: '', cycle: 'monthly', amount: '', billing_since: '', next_invoice_date: '', accounting_email: false }) }
  return { form, set, reset }
}

// ── Edit hosting form state ───────────────────────────────────────────────────

function useEditHostingForm() {
  const [form, setForm] = useState<HostingClient | null>(null)
  function open(h: HostingClient) { setForm({ ...h }) }
  function set(field: string, val: string | number | boolean) { setForm(f => f ? { ...f, [field]: val } : f) }
  function close() { setForm(null) }
  return { form, open, set, close }
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function InfrastructureView() {
  const store = useInfraStore()
  const [showAddHosting, setShowAddHosting] = useState(false)
  const [saving, setSaving] = useState(false)
  const hosting = useHostingForm()
  const editHosting = useEditHostingForm()

  const cStore = useClientsStore()
  const pStore = useProjectsStore()
  const [newClientName, setNewClientName] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [addingClient, setAddingClient] = useState(false)
  useEffect(() => { store.fetchAll(); cStore.fetchAll(); pStore.fetchAll() }, [])

  async function handleQuickAddClient() {
    if (!newClientName.trim()) return
    setAddingClient(true)
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert({ name: newClientName.trim() })
        .select('id')
        .single()
      if (error) throw error
      await cStore.fetchAll()
      hosting.set('client_id', data.id)
      setNewClientName('')
      setShowNewClient(false)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setAddingClient(false)
    }
  }

  const totalRevenue = store.monthlyRevenueEquiv()
  const yearlyDueSoon = store.yearlyDueSoon()

  async function handleAddHosting() {
    if (!hosting.form.client_id || !hosting.form.project_pn || !hosting.form.amount) return
    setSaving(true)
    try {
      await store.addHostingClient({
        client_id:         hosting.form.client_id,
        project_pn:        hosting.form.project_pn,
        description:       hosting.form.description || null,
        cycle:             hosting.form.cycle,
        amount:            parseFloat(hosting.form.amount),
        billing_since:     hosting.form.billing_since || null,
        next_invoice_date: hosting.form.cycle === 'yearly' ? (hosting.form.next_invoice_date || null) : null,
        status:            'active',
        accounting_email:  hosting.form.accounting_email,
        notes:             null,
      })

      const project = pStore.projects.find(p => p.pn === hosting.form.project_pn)
      if (project && hosting.form.billing_since) {
        const amount = parseFloat(hosting.form.amount)
        const desc = hosting.form.description || `Hosting — ${hosting.form.project_pn}`
        if (hosting.form.cycle === 'monthly') {
          const [y, m] = hosting.form.billing_since.slice(0, 7).split('-').map(Number)
          const rows = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(y, m - 1 + i, 1)
            return {
              project_id:     project.id,
              month:          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
              planned_amount: amount,
              actual_amount:  null,
              status:         'planned',
              notes:          desc,
            }
          })
          await supabase.from('revenue_planner').insert(rows)
        } else {
          const invoiceMonth = hosting.form.next_invoice_date || hosting.form.billing_since
          await supabase.from('revenue_planner').insert({
            project_id:     project.id,
            month:          invoiceMonth,
            planned_amount: amount,
            actual_amount:  null,
            status:         'planned',
            notes:          desc,
          })
        }
      }

      toast('success', 'Hosting client added')
      hosting.reset()
      setShowAddHosting(false)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEditHosting() {
    const h = editHosting.form
    if (!h) return
    setSaving(true)
    try {
      await store.updateHostingClient(h.id, {
        client_id:         h.client_id,
        project_pn:        h.project_pn,
        description:       h.description,
        cycle:             h.cycle,
        amount:            h.amount,
        billing_since:     h.billing_since,
        next_invoice_date: h.cycle === 'yearly' ? h.next_invoice_date : null,
        status:            h.status,
        accounting_email:  h.accounting_email,
      })
      toast('success', 'Hosting client updated')
      editHosting.close()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Hosting</h1>
          <p>Client hosting revenue</p>
        </div>
      </div>

      {store.error && (
        <div className="alert alert-red" style={{margin: '12px 28px 0'}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Failed to load hosting data.</span>
        </div>
      )}

      <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
        <div className="stat-card" style={{ '--left-color': 'var(--green)' } as React.CSSProperties}>
          <div className="stat-card-label">MONTHLY REVENUE</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>€{totalRevenue.toFixed(0)}</div>
          <div className="stat-card-sub">from hosting clients</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--amber)' } as React.CSSProperties}>
          <div className="stat-card-label">YEARLY RENEWING SOON</div>
          <div className="stat-card-value" style={{ color: yearlyDueSoon.length > 0 ? 'var(--amber)' : undefined }}>{yearlyDueSoon.length}</div>
          <div className="stat-card-sub">within 60 days</div>
        </div>
      </div>

      <div className="page-content">
        <div className="section-bar">
          <h2>Client Hosting Revenue <span className="text-xs" style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>· what clients pay you</span></h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddHosting(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Client
          </button>
        </div>

        {yearlyDueSoon.length > 0 && (
          <div className="alert alert-amber" style={{marginBottom: 12}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>
              <strong>{yearlyDueSoon.length} yearly client{yearlyDueSoon.length > 1 ? 's' : ''} renewing soon:</strong>{' '}
              {yearlyDueSoon.map((h: HostingClient) => h.client?.name ?? h.client_id).join(', ')}
            </span>
          </div>
        )}

        <div className="card">
          {store.hostingClients.length === 0 ? (
            <div style={{padding: '40px 20px', textAlign: 'center', color: 'var(--c4)'}}>
              <div style={{fontWeight: 600, color: 'var(--c3)', marginBottom: 4}}>No hosting clients yet</div>
              <div className="text-sm">Add your first client to start tracking revenue</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client</th><th>Project #</th><th>Description</th><th>Cycle</th>
                  <th className="th-right">Amount</th><th>Billing since</th><th>Next invoice</th>
                  <th>Status</th><th style={{width:60}}></th>
                </tr>
              </thead>
              <tbody>
                {store.hostingClients.map((h: HostingClient) => (
                  <tr key={h.id}>
                    <td className="table-link" style={{fontWeight:700}}>
                      {h.client?.name ?? h.client_id}
                      {h.accounting_email && !h.maintenance_id && <span className="badge badge-amber" style={{marginLeft:6,fontSize:10}}>ACCT</span>}
                    </td>
                    <td><span className="badge badge-gray">{h.project_pn}</span></td>
                    <td className="text-sm">{h.description ?? '—'}</td>
                    <td><span className={`badge badge-${h.cycle === 'monthly' ? 'green' : 'amber'}`}>{h.cycle === 'monthly' ? 'Monthly' : 'Yearly'}</span></td>
                    <td className="td-right text-mono" style={{fontWeight:700,color:'var(--green)'}}>
                      {fmt(h.amount)}<span className="text-xs">/{h.cycle === 'monthly' ? 'mo' : 'yr'}</span>
                    </td>
                    <td className="text-xs">{fmtDate(h.billing_since)}</td>
                    <td>
                      {h.cycle === 'yearly' && h.next_invoice_date ? (
                        <span style={{background:'var(--amber-bg)',color:'var(--amber-text)',padding:'3px 8px',borderRadius:100,fontSize:11,fontWeight:700}}>
                          ⚠ {fmtDate(h.next_invoice_date)} · {daysUntil(h.next_invoice_date)}d
                        </span>
                      ) : <span className="text-xs">—</span>}
                    </td>
                    <td><span className={`badge badge-${h.status === 'active' ? 'green' : 'gray'}`}>{h.status}</span></td>
                    <td><button className="btn btn-secondary btn-xs" onClick={() => editHosting.open(h)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} style={{textAlign:'right',fontSize:10,fontWeight:700,color:'var(--c3)',textTransform:'uppercase',letterSpacing:'0.6px'}}>Monthly revenue</td>
                  <td className="td-right text-mono" style={{fontSize:17,fontWeight:800,color:'var(--green)'}}>€{totalRevenue.toFixed(0)}<span className="text-xs">/mo</span></td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="info-box" style={{marginTop: 16}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Active hosting clients auto-generate monthly invoice rows in the Revenue Planner under their linked Project #.
        </div>
      </div>

      {/* Add Hosting Client modal */}
      <Modal open={showAddHosting} title="Add Hosting Client" onClose={() => setShowAddHosting(false)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddHosting(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleAddHosting} disabled={saving}>{saving ? <span className="spinner"/> : null} Add client</button>
        </>}>
        <div className="form-row" style={{marginBottom:14}}>
          <div className="form-group">
            <label className="form-label">Client</label>
            <Select
              value={showNewClient ? '__new__' : hosting.form.client_id}
              onChange={val => {
                if (val === '__new__') { setShowNewClient(true); setNewClientName('') }
                else { setShowNewClient(false); hosting.set('client_id', val) }
              }}
              placeholder="— Select client —"
              options={[
                ...cStore.clients.map(c => ({ value: c.id, label: c.name })),
                { value: '__new__', label: '+ New client…' },
              ]}
            />
            {showNewClient && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input
                  placeholder="Client name"
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleQuickAddClient()}
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button className="btn btn-primary btn-sm" onClick={handleQuickAddClient} disabled={addingClient || !newClientName.trim()}>
                  {addingClient ? '…' : 'Add'}
                </button>
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Project #</label>
            <input placeholder="RS-2026-001" value={hosting.form.project_pn} onChange={e => hosting.set('project_pn', e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{marginBottom:14}}>
          <label className="form-label">Service description</label>
          <input placeholder="VPS + cPanel hosting" value={hosting.form.description} onChange={e => hosting.set('description', e.target.value)} />
        </div>
        <div className="form-row" style={{marginBottom:14}}>
          <div className="form-group">
            <label className="form-label">Billing cycle</label>
            <Select
              value={hosting.form.cycle}
              onChange={val => {
                hosting.set('cycle', val)
                if (val === 'yearly' && hosting.form.billing_since) {
                  hosting.set('next_invoice_date', hosting.form.billing_since)
                }
              }}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'yearly', label: 'Yearly' },
              ]}
            />
          </div>
          <div className="form-group"><label className="form-label">Amount (€)</label><input type="number" placeholder="120" value={hosting.form.amount} onChange={e => hosting.set('amount', e.target.value)} /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Billing since</label><input type="month" value={hosting.form.billing_since?.slice(0,7) ?? ''} onChange={e => {
            const val = e.target.value
            hosting.set('billing_since', val ? val + '-01' : '')
            if (hosting.form.cycle === 'yearly' && val) {
              hosting.set('next_invoice_date', val + '-01')
            }
          }} /></div>
          {hosting.form.cycle === 'yearly' && (
            <div className="form-group">
              <label className="form-label">Invoice month</label>
              <input type="month" value={hosting.form.next_invoice_date?.slice(0,7) ?? ''} onChange={e => hosting.set('next_invoice_date', e.target.value ? e.target.value + '-01' : '')} />
            </div>
          )}
        </div>
        {!hosting.form.client_id || true ? (
          <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid var(--c6)'}}>
            <label className="toggle-label">
              <input type="checkbox" checked={hosting.form.accounting_email} onChange={e => hosting.set('accounting_email', e.target.checked)} />
              <span className="toggle-track"/>
              <span style={{fontSize:14,fontWeight:600,color:'var(--c1)'}}>Send to accounting</span>
              <span className="text-xs" style={{color:'var(--c4)'}}>invoice via email to accounting dept</span>
            </label>
          </div>
        ) : null}
      </Modal>

      {/* Edit Hosting Client modal */}
      <Modal open={!!editHosting.form} title="Edit Hosting Client" onClose={editHosting.close}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={editHosting.close}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSaveEditHosting} disabled={saving}>{saving ? <span className="spinner"/> : null} Save</button>
        </>}>
        {editHosting.form && (
          <>
            <div className="form-row" style={{marginBottom:14}}>
              <div className="form-group">
                <label className="form-label">Client</label>
                <Select
                  value={editHosting.form.client_id}
                  onChange={val => editHosting.set('client_id', val)}
                  options={cStore.clients.map(c => ({ value: c.id, label: c.name }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Project #</label>
                <input placeholder="RS-2026-001" value={editHosting.form.project_pn} onChange={e => editHosting.set('project_pn', e.target.value)} />
              </div>
            </div>
            <div className="form-group" style={{marginBottom:14}}>
              <label className="form-label">Service description</label>
              <input value={editHosting.form.description ?? ''} onChange={e => editHosting.set('description', e.target.value)} />
            </div>
            <div className="form-row" style={{marginBottom:14}}>
              <div className="form-group">
                <label className="form-label">Billing cycle</label>
                <Select
                  value={editHosting.form.cycle}
                  onChange={val => editHosting.set('cycle', val)}
                  options={[
                    { value: 'monthly', label: 'Monthly' },
                    { value: 'yearly', label: 'Yearly' },
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Amount (€)</label>
                <input type="number" value={editHosting.form.amount} onChange={e => editHosting.set('amount', parseFloat(e.target.value) || 0)} />
              </div>
            </div>
            <div className="form-row" style={{marginBottom:14}}>
              <div className="form-group">
                <label className="form-label">Billing since</label>
                <input type="month" value={editHosting.form.billing_since?.slice(0,7) ?? ''} onChange={e => {
                  const val = e.target.value
                  editHosting.set('billing_since', val ? val + '-01' : '')
                  if (editHosting.form!.cycle === 'yearly' && val && !editHosting.form!.next_invoice_date) {
                    editHosting.set('next_invoice_date', val + '-01')
                  }
                }} />
              </div>
              {editHosting.form.cycle === 'yearly' && (
                <div className="form-group">
                  <label className="form-label">Next invoice month</label>
                  <input type="month" value={editHosting.form.next_invoice_date?.slice(0,7) ?? ''} onChange={e => editHosting.set('next_invoice_date', e.target.value ? e.target.value + '-01' : '')} />
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <Select
                value={editHosting.form.status}
                onChange={val => editHosting.set('status', val)}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'paused', label: 'Paused' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            </div>
            {!editHosting.form.maintenance_id && (
              <div style={{paddingTop:14,borderTop:'1px solid var(--c6)'}}>
                <label className="toggle-label">
                  <input type="checkbox" checked={!!editHosting.form.accounting_email} onChange={e => editHosting.set('accounting_email', e.target.checked)} />
                  <span className="toggle-track"/>
                  <span style={{fontSize:14,fontWeight:600,color:'var(--c1)'}}>Send to accounting</span>
                  <span className="text-xs" style={{color:'var(--c4)'}}>invoice via email to accounting dept</span>
                </label>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  )
}
