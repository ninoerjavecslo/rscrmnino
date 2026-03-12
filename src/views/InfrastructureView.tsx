import { useEffect, useState } from 'react'
import { useInfraStore } from '../stores/infrastructure'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { HostingClient, InfrastructureCost } from '../lib/types'

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

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="stat-card" style={{ '--left-color': color } as React.CSSProperties}>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  )
}

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
  const [form, setForm] = useState({ client_id: '', project_pn: '', description: '', cycle: 'monthly' as 'monthly' | 'yearly', amount: '', billing_since: '', next_invoice_date: '' })
  function set(field: string, val: string) { setForm(f => ({ ...f, [field]: val })) }
  function reset() { setForm({ client_id: '', project_pn: '', description: '', cycle: 'monthly', amount: '', billing_since: '', next_invoice_date: '' }) }
  return { form, set, reset }
}

function useProviderForm() {
  const [form, setForm] = useState({ provider: '', description: '', monthly_cost: '', billing_cycle: 'monthly' as 'monthly' | 'annual' | 'variable' })
  function set(field: string, val: string) { setForm(f => ({ ...f, [field]: val })) }
  function reset() { setForm({ provider: '', description: '', monthly_cost: '', billing_cycle: 'monthly' }) }
  return { form, set, reset }
}

// ── Edit hosting form state ───────────────────────────────────────────────────

function useEditHostingForm() {
  const [form, setForm] = useState<HostingClient | null>(null)
  function open(h: HostingClient) { setForm({ ...h }) }
  function set(field: string, val: string | number) { setForm(f => f ? { ...f, [field]: val } : f) }
  function close() { setForm(null) }
  return { form, open, set, close }
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function InfrastructureView() {
  const store = useInfraStore()
  const [showAddHosting, setShowAddHosting]   = useState(false)
  const [showAddProvider, setShowAddProvider] = useState(false)
  const [saving, setSaving] = useState(false)
  const hosting = useHostingForm()
  const provider = useProviderForm()
  const editHosting = useEditHostingForm()

  const cStore = useClientsStore()
  const pStore = useProjectsStore()
  useEffect(() => { store.fetchAll(); cStore.fetchAll(); pStore.fetchAll() }, [])

  const totalRevenue = store.monthlyRevenueEquiv()
  const totalCost    = store.totalMonthlyCost()
  const margin       = store.margin()
  const marginPct    = store.marginPct()
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
        notes:             null,
      })

      // Auto-create revenue_planner entries
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

  async function handleAddProvider() {
    if (!provider.form.provider || !provider.form.monthly_cost) return
    setSaving(true)
    try {
      await store.addInfraCost({
        provider:      provider.form.provider,
        description:   provider.form.description || null,
        monthly_cost:  parseFloat(provider.form.monthly_cost),
        billing_cycle: provider.form.billing_cycle,
        status:        'active',
        notes:         null,
      })
      toast('success', 'Provider added')
      provider.reset()
      setShowAddProvider(false)
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
      })
      toast('success', 'Hosting client updated')
      editHosting.close()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (store.loading && store.hostingClients.length === 0) {
    return (
      <div>
        <div className="page-header"><div><h1>Infrastructure</h1><p>Loading…</p></div></div>
        <div className="page-content" style={{textAlign: 'center', paddingTop: 60, color: 'var(--c4)'}}>Loading data from Supabase…</div>
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>Infrastructure</h1>
          <p>Client hosting revenue &amp; provider costs</p>
        </div>
      </div>

      {/* Error banner */}
      {store.error && (
        <div className="alert alert-red" style={{margin: '12px 28px 0'}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Failed to load infrastructure data. Please check your connection.</span>
        </div>
      )}

      {/* Stats strip */}
      <div className="stats-strip">
        <StatCard label="Monthly Revenue"  value={`€${totalRevenue.toFixed(0)}`}  sub="from hosting clients"   color="var(--green)" />
        <StatCard label="Monthly Costs"    value={`€${totalCost.toFixed(2)}`}      sub="to providers"           color="var(--red)" />
        <StatCard label="Net Margin"       value={`€${margin.toFixed(0)}/mo`}      sub="revenue minus costs"    color="var(--navy)" />
        <StatCard label="Margin %"         value={`${marginPct}%`}                 sub="healthy above 70%"      color="var(--green)" />
      </div>

      <div className="page-content">

        {/* ── Client Hosting Revenue ── */}
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
            <button className="btn btn-secondary btn-xs" style={{marginLeft: 'auto'}}>Create invoices</button>
          </div>
        )}

        <div className="card" style={{marginBottom: 28}}>
          {store.hostingClients.length === 0 ? (
            <div style={{padding: '40px 20px', textAlign: 'center', color: 'var(--c4)'}}>
              <div style={{fontSize: 28, marginBottom: 8}}>🖥️</div>
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
                    <td className="table-link" style={{fontWeight:700}}>{h.client?.name ?? h.client_id}</td>
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
                  <td colSpan={4} style={{textAlign:'right',fontSize:10,fontWeight:700,color:'var(--c3)',textTransform:'uppercase',letterSpacing:'0.6px'}}>Monthly equiv. revenue</td>
                  <td className="td-right text-mono" style={{fontSize:17,fontWeight:800,color:'var(--green)'}}>€{totalRevenue.toFixed(0)}<span className="text-xs">/mo</span></td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* ── Infrastructure Costs ── */}
        <div className="section-bar">
          <h2>Infrastructure Costs <span className="text-xs" style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>· what you pay providers</span></h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddProvider(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Provider
          </button>
        </div>

        <div className="card" style={{borderRadius:'var(--r) var(--r) 0 0',marginBottom:0}}>
          {store.infraCosts.length === 0 ? (
            <div style={{padding:'40px 20px',textAlign:'center',color:'var(--c4)'}}>
              <div style={{fontWeight:600,color:'var(--c3)',marginBottom:4}}>No provider costs yet</div>
              <div className="text-sm">Add your hosting providers and services</div>
            </div>
          ) : (
            <table>
              <thead><tr><th>Provider</th><th>Description</th><th className="th-right">Monthly €</th><th style={{width:60}}></th></tr></thead>
              <tbody>
                {store.infraCosts.map((c: InfrastructureCost) => (
                  <tr key={c.id}>
                    <td style={{fontWeight:700}}>{c.provider}</td>
                    <td className="text-sm">{c.description ?? '—'}</td>
                    <td className="td-right text-mono" style={{fontWeight:700}}>{fmt(c.monthly_cost)}</td>
                    <td><button className="btn btn-secondary btn-xs">Edit</button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{textAlign:'right',fontSize:10,fontWeight:700,color:'var(--c3)',textTransform:'uppercase',letterSpacing:'0.6px'}}>Total / month</td>
                  <td className="td-right text-mono" style={{fontSize:17,fontWeight:800,color:'var(--red)'}}>€{totalCost.toFixed(2)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Margin strip */}
        <div style={{background:'#fff',border:'1px solid var(--c6)',borderTop:'2px dashed var(--c6)',borderRadius:'0 0 var(--r) var(--r)',padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
          <span className="text-label">Margin · hosting revenue minus infrastructure costs</span>
          <div className="flex-center gap-8">
            <span style={{fontSize:20,fontWeight:800,color:'var(--green)',fontVariantNumeric:'tabular-nums'}}>€{margin.toFixed(0)} / month</span>
            <span className="text-xs">({marginPct}% margin)</span>
          </div>
        </div>

        <div className="info-box">
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
            <select value={hosting.form.client_id} onChange={e => hosting.set('client_id', e.target.value)}>
              <option value="">— Select client —</option>
              {cStore.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Project #</label>
            <select value={hosting.form.project_pn} onChange={e => hosting.set('project_pn', e.target.value)}>
              <option value="">— Select project —</option>
              {pStore.projects.map(p => <option key={p.pn} value={p.pn}>{p.pn} — {p.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group" style={{marginBottom:14}}>
          <label className="form-label">Service description</label>
          <input placeholder="VPS + cPanel hosting" value={hosting.form.description} onChange={e => hosting.set('description', e.target.value)} />
        </div>
        <div className="form-row" style={{marginBottom:14}}>
          <div className="form-group">
            <label className="form-label">Billing cycle</label>
            <select value={hosting.form.cycle} onChange={e => {
              hosting.set('cycle', e.target.value)
              if (e.target.value === 'yearly' && hosting.form.billing_since) {
                hosting.set('next_invoice_date', hosting.form.billing_since)
              }
            }}>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
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
      </Modal>

      {/* Add Provider modal */}
      <Modal open={showAddProvider} title="Add Provider Cost" maxWidth={460} onClose={() => setShowAddProvider(false)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddProvider(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleAddProvider} disabled={saving}>{saving ? <span className="spinner"/> : null} Add provider</button>
        </>}>
        <div className="form-group" style={{marginBottom:14}}>
          <label className="form-label">Provider name</label>
          <input placeholder="e.g. Hetzner, Cloudflare, AWS" value={provider.form.provider} onChange={e => provider.set('provider', e.target.value)} />
        </div>
        <div className="form-group" style={{marginBottom:14}}>
          <label className="form-label">Service description</label>
          <input placeholder="VPS CX31 — 3 instances" value={provider.form.description} onChange={e => provider.set('description', e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group"><label className="form-label">Monthly cost (€)</label><input type="number" placeholder="29.70" value={provider.form.monthly_cost} onChange={e => provider.set('monthly_cost', e.target.value)} /></div>
          <div className="form-group">
            <label className="form-label">Billing cycle</label>
            <select value={provider.form.billing_cycle} onChange={e => provider.set('billing_cycle', e.target.value)}>
              <option value="monthly">Monthly</option><option value="annual">Annual ÷ 12</option><option value="variable">Variable (avg)</option>
            </select>
          </div>
        </div>
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
                <select value={editHosting.form.client_id} onChange={e => editHosting.set('client_id', e.target.value)}>
                  {cStore.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Project #</label>
                <select value={editHosting.form.project_pn} onChange={e => editHosting.set('project_pn', e.target.value)}>
                  <option value="">— Select project —</option>
                  {pStore.projects.map(p => <option key={p.pn} value={p.pn}>{p.pn} — {p.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group" style={{marginBottom:14}}>
              <label className="form-label">Service description</label>
              <input value={editHosting.form.description ?? ''} onChange={e => editHosting.set('description', e.target.value)} />
            </div>
            <div className="form-row" style={{marginBottom:14}}>
              <div className="form-group">
                <label className="form-label">Billing cycle</label>
                <select value={editHosting.form.cycle} onChange={e => editHosting.set('cycle', e.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
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
              <select value={editHosting.form.status} onChange={e => editHosting.set('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
