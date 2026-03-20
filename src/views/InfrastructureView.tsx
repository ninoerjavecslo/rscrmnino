import { useEffect, useState } from 'react'
import { useInfraStore } from '../stores/infrastructure'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { HostingClient } from '../lib/types'
import { hostingAnnualValue } from '../lib/types'
import { Select } from '../components/Select'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toFixed(2).replace(/\.00$/, '') + ' €' }

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
  const [form, setForm] = useState({
    client_id: '', project_pn: '', description: '', provider: '',
    cycle: 'monthly' as 'monthly' | 'yearly',
    amount: '', billing_since: '', next_invoice_date: '',
    invoice_month: '', already_billed: false, contract_id: '', contract_expiry: '',
  })
  function set(field: string, val: string | boolean) { setForm(f => ({ ...f, [field]: val })) }
  function reset() {
    setForm({
      client_id: '', project_pn: '', description: '', provider: '',
      cycle: 'monthly', amount: '', billing_since: '', next_invoice_date: '',
      invoice_month: '', already_billed: false, contract_id: '', contract_expiry: '',
    })
  }
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

// ── Billing status per hosting client ─────────────────────────────────────────

interface BillingEntry { status: 'billed' | 'planned'; rowId?: string }

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

  const [_billingStatus, setBillingStatus] = useState<Map<string, BillingEntry>>(new Map())
  const [showAddCost, setShowAddCost] = useState(false)
  const [costForm, setCostForm] = useState({ provider: '', description: '', amount: '', cycle: 'monthly' as 'monthly' | 'yearly' })
  const [cancelTarget, setCancelTarget] = useState<HostingClient | null>(null)
  const [cancelFromMonth, setCancelFromMonth] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<HostingClient | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [cancelCostTarget, setCancelCostTarget] = useState<import('../lib/types').InfrastructureCost | null>(null)
  const [cancelCostMonth, setCancelCostMonth] = useState('')
  const [cancellingCost, setCancellingCost] = useState(false)

  useEffect(() => { store.fetchAll(); cStore.fetchAll(); pStore.fetchAll() }, [])

  useEffect(() => {
    if (!store.hostingClients.length) return
    fetchBillingStatus()
  }, [store.hostingClients, pStore.projects])

  async function fetchBillingStatus() {
    // Billing status only matters for yearly clients — check their next_invoice_date month
    const yearlyClients = store.hostingClients.filter(
      h => h.status === 'active' && h.cycle === 'yearly' && h.next_invoice_date
    )
    if (yearlyClients.length === 0) { setBillingStatus(new Map()); return }

    const months = [...new Set(yearlyClients.map(h => h.next_invoice_date!.slice(0, 7) + '-01'))]

    const { data: rows } = await supabase
      .from('revenue_planner')
      .select('id, hosting_client_id, status, month')
      .not('hosting_client_id', 'is', null)
      .in('month', months)

    const map = new Map<string, BillingEntry>()
    for (const h of yearlyClients) {
      const invoiceMonth = h.next_invoice_date!.slice(0, 7) + '-01'
      const row = (rows ?? []).find(r => r.hosting_client_id === h.id && r.month === invoiceMonth)
      if (row) {
        map.set(h.id, {
          status: row.status === 'paid' || row.status === 'issued' ? 'billed' : 'planned',
          rowId: row.id,
        })
      }
    }
    setBillingStatus(map)
  }

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

  const totalRevenuePerYear = store.hostingClients.reduce((s, h) => s + hostingAnnualValue(h), 0)
  const yearlyDueSoon = store.yearlyDueSoon()

  // A cost counts in totals if active, OR if cancelled but cancelled_from is in the future
  const today = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  function costCountsNow(c: import('../lib/types').InfrastructureCost) {
    return c.status === 'active' || (c.status === 'inactive' && !!c.cancelled_from && currentMonth < c.cancelled_from)
  }
  // Prorated annual cost for the current year
  function costAnnualValue(c: import('../lib/types').InfrastructureCost): number {
    const year = today.getFullYear()
    const yearStart = `${year}-01-01`
    const yearEnd   = `${year}-12-01`
    if (c.status === 'active') return c.monthly_cost * 12
    if (c.status === 'inactive' && c.cancelled_from) {
      if (c.cancelled_from <= yearStart) return 0
      const effEnd = c.cancelled_from < yearEnd ? c.cancelled_from : yearEnd
      const [sy, sm] = yearStart.split('-').map(Number)
      const [ey, em] = effEnd.split('-').map(Number)
      return Math.max(0, (ey - sy) * 12 + (em - sm)) * c.monthly_cost
    }
    return 0
  }

  async function handleAddHosting() {
    if (!hosting.form.client_id || !hosting.form.project_pn || !hosting.form.amount) return
    setSaving(true)
    try {
      const { data: newHost, error: insertError } = await supabase
        .from('hosting_clients')
        .insert({
          client_id:         hosting.form.client_id,
          project_pn:        hosting.form.project_pn,
          description:       hosting.form.description || null,
          provider:          hosting.form.provider || null,
          cycle:             hosting.form.cycle,
          amount:            parseFloat(hosting.form.amount),
          billing_since:     hosting.form.billing_since || null,
          next_invoice_date: hosting.form.cycle === 'yearly' ? (hosting.form.next_invoice_date || null) : null,
          status:            'active',
          accounting_email:  false,
          notes:             null,
          contract_id:       hosting.form.contract_id || null,
          contract_expiry:   hosting.form.contract_expiry ? hosting.form.contract_expiry + '-01' : null,
        })
        .select('id')
        .single()
      if (insertError) throw insertError
      await store.fetchAll()

      const hostingClientId = newHost.id
      const amount = parseFloat(hosting.form.amount)
      const desc = hosting.form.description || `Hosting — ${hosting.form.project_pn}`
      const invoiceMonth = hosting.form.cycle === 'yearly'
        ? (hosting.form.next_invoice_date?.slice(0, 7) || hosting.form.billing_since?.slice(0, 7) || '')
        : (hosting.form.invoice_month || hosting.form.billing_since?.slice(0, 7) || '')
      const alreadyBilled = hosting.form.already_billed

      if (invoiceMonth) {
        if (hosting.form.cycle === 'monthly') {
          const [y, m] = invoiceMonth.split('-').map(Number)
          const expiryStr = hosting.form.contract_expiry  // YYYY-MM
          const rows = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(y, m - 1 + i, 1)
            const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
            // Stop at contract expiry
            if (expiryStr && monthStr > expiryStr + '-01') return null
            return {
              hosting_client_id: hostingClientId,
              month:          monthStr,
              planned_amount: amount,
              actual_amount:  alreadyBilled && i === 0 ? amount : null,
              status:         alreadyBilled && i === 0 ? 'issued' : 'planned',
              notes:          desc,
              probability:    100,
            }
          }).filter(Boolean)
          if (rows.length > 0) await supabase.from('revenue_planner').insert(rows)
        } else {
          const monthVal = hosting.form.next_invoice_date || hosting.form.billing_since || (invoiceMonth + '-01')
          await supabase.from('revenue_planner').insert({
            hosting_client_id: hostingClientId,
            month:          monthVal.length === 7 ? monthVal + '-01' : monthVal,
            planned_amount: amount,
            actual_amount:  alreadyBilled ? amount : null,
            status:         alreadyBilled ? 'issued' : 'planned',
            notes:          desc,
            probability:    100,
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

  async function handleCancelHosting() {
    if (!cancelTarget || !cancelFromMonth) return
    setCancelling(true)
    try {
      const fromDate = cancelFromMonth + '-01'
      // Only delete rows explicitly linked to this hosting client
      await supabase
        .from('revenue_planner')
        .delete()
        .eq('hosting_client_id', cancelTarget.id)
        .eq('status', 'planned')
        .gte('month', fromDate)
      await store.updateHostingClient(cancelTarget.id, { status: 'cancelled', cancelled_from: cancelFromMonth + '-01' })
      toast('success', `Hosting cancelled from ${cancelFromMonth}. Past invoices preserved.`)
      setCancelTarget(null)
      setCancelFromMonth('')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setCancelling(false)
    }
  }

  async function handleDeleteHosting() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await supabase.from('revenue_planner').delete().eq('hosting_client_id', deleteTarget.id)
      await supabase.from('hosting_clients').delete().eq('id', deleteTarget.id)
      await store.fetchAll()
      toast('success', 'Hosting client deleted')
      setDeleteTarget(null)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  async function handleAddCost() {
    if (!costForm.provider || !costForm.amount) return
    setSaving(true)
    try {
      const raw = parseFloat(costForm.amount)
      const monthly_cost = costForm.cycle === 'yearly' ? raw / 12 : raw
      await store.addInfraCost({
        provider: costForm.provider.trim(),
        description: costForm.description.trim() || null,
        monthly_cost,
        billing_cycle: costForm.cycle === 'yearly' ? 'annual' : 'monthly',
        status: 'active',
        notes: null,
      })
      toast('success', 'Cost added')
      setCostForm({ provider: '', description: '', amount: '', cycle: 'monthly' })
      setShowAddCost(false)
    } catch (e) {
      toast('error', (e as Error).message)
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
        provider:          h.provider || null,
        cycle:             h.cycle,
        amount:            h.amount,
        billing_since:     h.billing_since,
        next_invoice_date: h.cycle === 'yearly' ? h.next_invoice_date : null,
        billing_month:     h.cycle === 'yearly' ? (h.billing_month ?? null) : null,
        status:            h.status,
        accounting_email:  h.accounting_email,
        contract_id:       h.contract_id || null,
        contract_expiry:   h.contract_expiry || null,
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

      <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat-card" style={{ '--left-color': 'var(--green)' } as React.CSSProperties}>
          <div className="stat-card-label">TOTAL REVENUE / YEAR</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>{totalRevenuePerYear.toLocaleString('en-EU', { maximumFractionDigits: 2 })} €</div>
          <div className="stat-card-sub">all clients this year</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--red)' } as React.CSSProperties}>
          <div className="stat-card-label">TOTAL COST / YEAR</div>
          <div className="stat-card-value" style={{ color: 'var(--red)' }}>
            {store.infraCosts.reduce((s,c) => s + costAnnualValue(c), 0).toLocaleString('en-EU', { maximumFractionDigits: 2 })} €
          </div>
          <div className="stat-card-sub">active infra costs</div>
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
                  <th>Client</th>
                  <th>Project #</th>
                  <th>Contract ID</th>
                  <th>Description</th>
                  <th>Provider</th>
                  <th>Type</th>
                  <th className="th-right">Amount</th>
                  <th>Occurrence</th>
                  <th className="th-right">Total / yr</th>
                  <th>Contract Expiry</th>
                  <th>Status</th>
                  <th style={{width:110}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {store.hostingClients.map((h: HostingClient) => {
                  const annualTotal = hostingAnnualValue(h)
                  const isStandalone = !h.maintenance_id
                  return (
                    <tr key={h.id}>
                      <td style={{fontWeight:700}}>{h.client?.name ?? h.client_id}</td>
                      <td><span className="badge badge-gray">{h.project_pn}</span></td>
                      <td className="text-sm" style={{color:'var(--c3)'}}>{h.contract_id ?? '—'}</td>
                      <td className="text-sm">{h.description ?? '—'}</td>
                      <td className="text-sm" style={{color:'var(--c3)'}}>{h.provider ?? '—'}</td>
                      <td style={{fontSize:12, fontWeight:600, color: isStandalone ? 'var(--c1)' : 'var(--blue)'}}>
                        {isStandalone ? 'Standalone' : 'In contract'}
                      </td>
                      <td className="td-right text-mono" style={{fontWeight:700,color:'var(--green)'}}>
                        {fmt(h.amount)}<span className="text-xs">/{h.cycle === 'monthly' ? 'mo' : 'yr'}</span>
                      </td>
                      <td>
                        <span className={`badge badge-${h.cycle === 'monthly' ? 'green' : 'amber'}`}>
                          {h.cycle === 'monthly' ? 'Monthly' : 'Yearly'}
                        </span>
                      </td>
                      <td className="td-right text-mono" style={{color:'var(--c2)'}}>
                        {annualTotal % 1 === 0 ? annualTotal.toFixed(0) : annualTotal.toFixed(2)} €
                      </td>
                      <td className="text-sm" style={{color: h.contract_expiry ? 'var(--c2)' : 'var(--c4)'}}>
                        {h.contract_expiry
                          ? new Date(h.contract_expiry + 'T00:00:00').toLocaleDateString('sl-SI', {month:'short', year:'numeric'})
                          : '—'}
                      </td>
                      <td>
                        {h.status === 'cancelled' && h.cancelled_from ? (
                          <div>
                            <span className="badge badge-gray">Cancelled</span>
                            <div style={{fontSize:11,color:'var(--c3)',marginTop:2}}>
                              from {new Date(h.cancelled_from + 'T00:00:00').toLocaleString('en', {month:'short',year:'numeric'})}
                            </div>
                          </div>
                        ) : (
                          <span className={`badge badge-${h.status === 'active' ? 'green' : 'gray'}`}>{h.status}</span>
                        )}
                      </td>
                      <td>
                        <div style={{display:'flex',gap:4,alignItems:'center'}}>
                          {h.status !== 'cancelled' && (
                            <button className="btn btn-secondary btn-xs" onClick={() => editHosting.open(h)}>Edit</button>
                          )}
                          {h.status === 'active' && (
                            <button className="btn btn-xs" style={{background:'var(--red)',color:'#fff',border:'none'}}
                              onClick={() => { setCancelTarget(h); setCancelFromMonth('') }}>
                              Cancel
                            </button>
                          )}
                          <button className="btn btn-ghost btn-xs" onClick={() => setDeleteTarget(h)} title="Delete" style={{color:'var(--red)'}}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={10}></td>
                  <td style={{textAlign:'right',fontSize:10,fontWeight:700,color:'var(--c3)',textTransform:'uppercase',letterSpacing:'0.6px',whiteSpace:'nowrap'}}>Total revenue / year</td>
                  <td className="td-right text-mono" style={{fontSize:15,fontWeight:800,color:'var(--green)',whiteSpace:'nowrap'}}>{totalRevenuePerYear.toLocaleString('en-EU', {maximumFractionDigits:2})} €<span className="text-xs">/yr</span></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="info-box" style={{marginTop: 16}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Active hosting clients auto-generate monthly invoice rows in the Revenue Planner under their linked Project #.
        </div>

        {/* ── Costs ───────────────────────────────────────── */}
        <div className="section-bar" style={{marginTop: 32, marginBottom: 10}}>
          <h2>Costs <span className="text-xs" style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>· what you pay providers</span></h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddCost(true)}>+ Add Cost</button>
        </div>
        <div className="card">
          {store.infraCosts.length === 0 ? (
            <div style={{padding:'28px 20px',textAlign:'center',color:'var(--c4)',fontSize:13}}>No infrastructure costs recorded yet.</div>
          ) : (
            <table style={{tableLayout:'fixed'}}>
              <colgroup>
                <col style={{width:'160px'}} />
                <col />
                <col style={{width:'130px'}} />
                <col style={{width:'110px'}} />
                <col style={{width:'120px'}} />
                <col style={{width:'100px'}} />
                <col style={{width:'100px'}} />
              </colgroup>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Description</th>
                  <th className="th-right">Amount</th>
                  <th>Cycle</th>
                  <th className="th-right">Total / yr</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {store.infraCosts.map(c => {
                  const isYearly = c.billing_cycle === 'annual'
                  const displayAmt = isYearly ? c.monthly_cost * 12 : c.monthly_cost
                  const isCancelled = c.status === 'inactive'
                  const stillCounting = costCountsNow(c)
                  const annualCost = costAnnualValue(c)
                  return (
                    <tr key={c.id} style={isCancelled && !stillCounting ? {opacity:0.5} : undefined}>
                      <td style={{fontWeight:700}}>{c.provider}</td>
                      <td className="text-sm" style={{color:'var(--c2)'}}>{c.description ?? '—'}</td>
                      <td className="td-right text-mono" style={{color: isCancelled ? 'var(--c4)' : 'var(--red)',fontWeight:600}}>
                        {displayAmt.toLocaleString('en-EU', {maximumFractionDigits:2})} €
                      </td>
                      <td><span className={`badge badge-${isYearly ? 'amber' : 'green'}`}>{isYearly ? 'Yearly' : 'Monthly'}</span></td>
                      <td className="td-right text-mono" style={{color: annualCost === 0 ? 'var(--c4)' : 'var(--red)',fontSize:13}}>
                        {annualCost === 0 ? '—' : `${annualCost.toLocaleString('en-EU', {maximumFractionDigits:2})} €`}
                      </td>
                      <td>
                        {isCancelled ? (
                          <div>
                            <span className="badge badge-gray">Cancelled</span>
                            {c.cancelled_from && (
                              <div style={{fontSize:11,color:'var(--c3)',marginTop:2}}>
                                from {new Date(c.cancelled_from + 'T00:00:00').toLocaleString('en', {month:'short',year:'numeric'})}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="badge badge-green">Active</span>
                        )}
                      </td>
                      <td>
                        <div style={{display:'flex',gap:4,alignItems:'center'}}>
                          {!isCancelled && (
                            <button className="btn btn-xs" style={{background:'var(--red)',color:'#fff',border:'none'}}
                              onClick={() => { setCancelCostTarget(c); setCancelCostMonth('') }}>
                              Cancel
                            </button>
                          )}
                          <button className="btn btn-ghost btn-xs" style={{color:'var(--red)'}} title="Delete"
                            onClick={async () => {
                              if (!confirm(`Delete cost "${c.provider}"?`)) return
                              try { await store.removeCost(c.id); toast('success', 'Cost deleted') }
                              catch (e) { toast('error', (e as Error).message) }
                            }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}></td>
                  <td className="td-right" style={{fontSize:10,fontWeight:700,color:'var(--c3)',textTransform:'uppercase',letterSpacing:'0.6px'}}>Total / yr</td>
                  <td className="td-right text-mono" style={{fontSize:15,fontWeight:800,color:'var(--red)'}}>
                    {store.infraCosts.reduce((s,c) => s + costAnnualValue(c), 0).toLocaleString('en-EU', {maximumFractionDigits:2})} €
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Add Hosting Client modal */}
      <Modal open={showAddHosting} title="Add Hosting Client" maxWidth={580} onClose={() => setShowAddHosting(false)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddHosting(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleAddHosting} disabled={saving || !hosting.form.client_id || !hosting.form.project_pn || !hosting.form.amount}>{saving ? <span className="spinner"/> : null} Add client</button>
        </>}>
        <div className="form-row" style={{marginBottom:14}}>
          <div className="form-group">
            <label className="form-label">Client <span style={{color:'var(--red)'}}>*</span></label>
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
            <label className="form-label">Project # <span style={{color:'var(--red)'}}>*</span></label>
            <input placeholder="RS-2026-001" value={hosting.form.project_pn} onChange={e => hosting.set('project_pn', e.target.value)} />
          </div>
        </div>
        <div className="form-row" style={{marginBottom:14}}>
          <div className="form-group" style={{flex:2}}>
            <label className="form-label">Service description</label>
            <input placeholder="VPS + cPanel hosting" value={hosting.form.description} onChange={e => hosting.set('description', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Provider <span className="form-hint" style={{display:'inline',marginLeft:4}}>optional</span></label>
            <Select
              value={hosting.form.provider}
              onChange={val => hosting.set('provider', val)}
              placeholder="— Select provider —"
              options={[...new Set(store.infraCosts.map(c => c.provider))].map(p => ({ value: p, label: p }))}
            />
          </div>
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
          <div className="form-group"><label className="form-label">Amount (€) <span style={{color:'var(--red)'}}>*</span></label><input type="number" placeholder="120" value={hosting.form.amount} onChange={e => hosting.set('amount', e.target.value)} /></div>
        </div>
        <div className="form-row" style={{marginBottom:16}}>
          <div className="form-group"><label className="form-label">Billing since</label><input type="month" value={hosting.form.billing_since?.slice(0,7) ?? ''} onChange={e => {
            const val = e.target.value
            hosting.set('billing_since', val ? val + '-01' : '')
            if (!hosting.form.invoice_month) hosting.set('invoice_month', val)
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

        {/* Contract ID + Expiry */}
        <div className="form-row" style={{marginBottom:14}}>
          <div className="form-group">
            <label className="form-label">Contract / Order ID <span className="form-hint" style={{display:'inline',marginLeft:4}}>optional</span></label>
            <input placeholder="e.g. PO-2026-042" value={hosting.form.contract_id ?? ''} onChange={e => hosting.set('contract_id', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Contract expiry <span className="form-hint" style={{display:'inline',marginLeft:4}}>optional</span></label>
            <input type="month" value={hosting.form.contract_expiry ?? ''} onChange={e => hosting.set('contract_expiry', e.target.value)} />
          </div>
        </div>

        {/* Invoice planning */}
        <div style={{borderTop:'1px solid var(--c6)',paddingTop:14}}>
          <div style={{fontSize:12,fontWeight:700,color:'var(--c3)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>Invoice planning</div>
          {hosting.form.cycle === 'monthly' && (
            <div className="form-row" style={{marginBottom:8}}>
              <div className="form-group">
                <label className="form-label">Start from month</label>
                <input type="month"
                  value={hosting.form.invoice_month}
                  onChange={e => hosting.set('invoice_month', e.target.value)}
                />
              </div>
            </div>
          )}
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
            <input type="checkbox" checked={hosting.form.already_billed} onChange={e => hosting.set('already_billed', e.target.checked)} />
            Already billed{hosting.form.cycle === 'monthly' ? ' for this month' : ' (mark as issued)'}
          </label>
          {(hosting.form.cycle === 'monthly' ? hosting.form.invoice_month : hosting.form.next_invoice_date) && (
            <div className="form-hint" style={{marginTop:6}}>
              {hosting.form.cycle === 'monthly'
                ? `Will create ${hosting.form.contract_expiry ? 'rows' : '12'} monthly rows from ${hosting.form.invoice_month}${hosting.form.contract_expiry ? ` until ${hosting.form.contract_expiry}` : ''}${hosting.form.already_billed ? ' (first marked as issued)' : ''}`
                : `Will create 1 invoice row for ${hosting.form.next_invoice_date?.slice(0,7)}${hosting.form.already_billed ? ' (marked as issued)' : ''}`
              }
            </div>
          )}
        </div>
      </Modal>

      {/* Cancel Hosting modal */}
      <Modal
        open={!!cancelTarget}
        title="Cancel Hosting"
        maxWidth={420}
        onClose={() => { setCancelTarget(null); setCancelFromMonth('') }}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => { setCancelTarget(null); setCancelFromMonth('') }}>Back</button>
          <button className="btn btn-sm" style={{background:'var(--red)',color:'#fff',border:'none'}} onClick={handleCancelHosting} disabled={!cancelFromMonth || cancelling}>
            {cancelling ? '…' : 'Confirm cancellation'}
          </button>
        </>}
      >
        {cancelTarget && (
          <div>
            <p style={{margin:'0 0 16px',fontSize:14,color:'var(--c2)'}}>
              Cancelling <strong>{cancelTarget.client?.name}</strong> — {cancelTarget.description || cancelTarget.project_pn} ({fmt(cancelTarget.amount)}/{cancelTarget.cycle === 'monthly' ? 'mo' : 'yr'})
            </p>
            <div className="form-group" style={{marginBottom:12}}>
              <label className="form-label">Cancel from month</label>
              <input type="month" value={cancelFromMonth} onChange={e => setCancelFromMonth(e.target.value)} autoFocus />
              <div className="form-hint">All planned invoice rows from this month onwards will be removed. Past billed rows are preserved. E.g. if you cancel from June, March–May rows stay in the invoice planner.</div>
            </div>
            {cancelFromMonth && (
              <div className="alert alert-red" style={{fontSize:13}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>This will remove planned rows from <strong>{cancelFromMonth}</strong> onwards and mark this client as cancelled.</span>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Hosting modal */}
      {deleteTarget && (
        <Modal open title="Delete hosting client" maxWidth={420} onClose={() => setDeleteTarget(null)}
          footer={<>
            <button className="btn btn-secondary btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn btn-sm" style={{background:'var(--red)',color:'#fff',border:'none'}} onClick={handleDeleteHosting} disabled={deleting}>
              {deleting ? '…' : 'Delete'}
            </button>
          </>}>
          <p style={{margin:'0 0 8px',fontSize:14}}>
            Delete <strong>{deleteTarget.description || deleteTarget.project_pn}</strong> for <strong>{deleteTarget.client?.name}</strong>?
          </p>
          <p style={{margin:0,fontSize:13,color:'var(--c3)'}}>
            This will also delete all invoice plan rows linked to this hosting client.
          </p>
        </Modal>
      )}

      {/* Add Infrastructure Cost modal */}
      <Modal open={showAddCost} title="Add Infrastructure Cost" maxWidth={460} onClose={() => setShowAddCost(false)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddCost(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleAddCost} disabled={saving || !costForm.provider || !costForm.amount}>
            {saving ? <span className="spinner"/> : null} Add cost
          </button>
        </>}>
        <div className="form-row" style={{marginBottom:14}}>
          <div className="form-group">
            <label className="form-label">Provider <span style={{color:'var(--red)'}}>*</span></label>
            <input placeholder="e.g. Hetzner, AWS, DigitalOcean" value={costForm.provider} onChange={e => setCostForm(f => ({...f, provider: e.target.value}))} autoFocus />
          </div>
        </div>
        <div className="form-group" style={{marginBottom:14}}>
          <label className="form-label">Description <span className="form-hint" style={{display:'inline',marginLeft:4}}>optional</span></label>
          <input placeholder="e.g. VPS server, CDN, Storage" value={costForm.description} onChange={e => setCostForm(f => ({...f, description: e.target.value}))} />
        </div>
        <div className="form-row" style={{marginBottom:14}}>
          <div className="form-group">
            <label className="form-label">Billing cycle</label>
            <Select value={costForm.cycle} onChange={val => setCostForm(f => ({...f, cycle: val as 'monthly' | 'yearly'}))}
              options={[{value:'monthly',label:'Monthly'},{value:'yearly',label:'Yearly'}]} />
          </div>
          <div className="form-group">
            <label className="form-label">Amount (€) <span style={{color:'var(--red)'}}>*</span></label>
            <input type="number" placeholder={costForm.cycle === 'yearly' ? '1200' : '100'} value={costForm.amount} onChange={e => setCostForm(f => ({...f, amount: e.target.value}))} />
          </div>
        </div>
        {costForm.amount && (
          <div className="form-hint">
            Monthly equivalent: {(costForm.cycle === 'yearly' ? parseFloat(costForm.amount||'0')/12 : parseFloat(costForm.amount||'0')).toFixed(2)} €/mo
          </div>
        )}
      </Modal>

      {/* Cancel Infrastructure Cost modal */}
      <Modal open={!!cancelCostTarget} title="Cancel Infrastructure Cost" maxWidth={420}
        onClose={() => { setCancelCostTarget(null); setCancelCostMonth('') }}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => { setCancelCostTarget(null); setCancelCostMonth('') }}>Back</button>
          <button className="btn btn-sm" style={{background:'var(--red)',color:'#fff',border:'none'}}
            onClick={async () => {
              if (!cancelCostTarget || !cancelCostMonth) return
              setCancellingCost(true)
              try {
                await store.cancelCost(cancelCostTarget.id, cancelCostMonth + '-01')
                toast('success', 'Cost cancelled')
                setCancelCostTarget(null); setCancelCostMonth('')
              } catch (e) { toast('error', (e as Error).message) }
              finally { setCancellingCost(false) }
            }}
            disabled={!cancelCostMonth || cancellingCost}>
            {cancellingCost ? '…' : 'Confirm cancellation'}
          </button>
        </>}>
        {cancelCostTarget && (
          <div>
            <p style={{margin:'0 0 16px',fontSize:14,color:'var(--c2)'}}>
              Cancelling <strong>{cancelCostTarget.provider}</strong>{cancelCostTarget.description ? ` — ${cancelCostTarget.description}` : ''}
            </p>
            <div className="form-group" style={{marginBottom:12}}>
              <label className="form-label">Cancel from month</label>
              <input type="month" value={cancelCostMonth} onChange={e => setCancelCostMonth(e.target.value)} autoFocus />
              <div className="form-hint">The cost will be marked as inactive from this month onwards.</div>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Hosting Client modal */}
      <Modal open={!!editHosting.form} title="Edit Hosting Client" onClose={editHosting.close}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={editHosting.close}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSaveEditHosting} disabled={saving}>{saving ? <span className="spinner"/> : null} Save</button>
        </>}>
        {editHosting.form && (
          <>
            {/* Read-only info */}
            <div className="form-row" style={{marginBottom:14}}>
              <div className="form-group">
                <label className="form-label">Client</label>
                <input disabled value={cStore.clients.find(c => c.id === editHosting.form!.client_id)?.name ?? editHosting.form.client_id} style={{background:'var(--c7)',color:'var(--c3)'}} />
              </div>
              <div className="form-group">
                <label className="form-label">Billing cycle</label>
                <input disabled value={editHosting.form.cycle === 'monthly' ? 'Monthly' : 'Yearly'} style={{background:'var(--c7)',color:'var(--c3)'}} />
              </div>
            </div>
            <div className="form-row" style={{marginBottom:14}}>
              <div className="form-group">
                <label className="form-label">Amount</label>
                <input disabled value={`${editHosting.form.amount} €/${editHosting.form.cycle === 'monthly' ? 'mo' : 'yr'}`} style={{background:'var(--c7)',color:'var(--c3)'}} />
              </div>
              <div className="form-group">
                <label className="form-label">Billing since</label>
                <input disabled value={editHosting.form.billing_since?.slice(0,7) ?? '—'} style={{background:'var(--c7)',color:'var(--c3)'}} />
              </div>
            </div>
            {/* Editable fields */}
            <div className="form-row" style={{marginBottom:14}}>
              <div className="form-group">
                <label className="form-label">Project #</label>
                <input placeholder="RS-2026-001" value={editHosting.form.project_pn} onChange={e => editHosting.set('project_pn', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Contract / Order ID <span className="form-hint" style={{display:'inline',marginLeft:4}}>optional</span></label>
                <input placeholder="e.g. PO-2026-042" value={editHosting.form.contract_id ?? ''} onChange={e => editHosting.set('contract_id', e.target.value)} />
              </div>
            </div>
            <div className="form-row" style={{marginBottom:14}}>
              <div className="form-group">
                <label className="form-label">Provider</label>
                <Select
                  value={editHosting.form.provider ?? ''}
                  onChange={val => editHosting.set('provider', val)}
                  options={[
                    { value: '', label: '— None —' },
                    ...[...new Set(store.infraCosts.map(c => c.provider))].map(p => ({ value: p, label: p })),
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Contract expiry</label>
                <input disabled value={editHosting.form.contract_expiry?.slice(0,7) ?? '—'} style={{background:'var(--c7)',color:'var(--c3)'}} />
              </div>
            </div>
            <div className="form-row" style={{marginBottom:14}}>
              {editHosting.form.cycle === 'yearly' && (
                <div className="form-group">
                  <label className="form-label">Billing month</label>
                  <select value={editHosting.form.billing_month ?? ''} onChange={e => editHosting.set('billing_month', Number(e.target.value) || 0)}>
                    <option value="">— Select month —</option>
                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map((name, i) => (
                      <option key={i+1} value={i+1}>{name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
