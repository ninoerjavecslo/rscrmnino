import { useEffect, useState } from 'react'
import { useInfraStore } from '../stores/infrastructure'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { HostingClient } from '../lib/types'
import { hostingAnnualValue } from '../lib/types'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toFixed(2).replace(/\.00$/, '') + ' €' }

// ── Sub-components ────────────────────────────────────────────────────────────

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
  const [deleteCostTarget, setDeleteCostTarget] = useState<import('../lib/types').InfrastructureCost | null>(null)

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
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Hosting</h1>
          <p>Client hosting revenue</p>
        </div>
      </div>

      {store.error && (
        <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c] mx-7 mt-3 flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>Failed to load hosting data.</span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4 px-6 pt-4">
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">TOTAL REVENUE / YEAR</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#16a34a]">{totalRevenuePerYear.toLocaleString('en-EU', { maximumFractionDigits: 2 })} €</div>
          <div className="text-xs text-muted-foreground mt-1">all clients this year</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">TOTAL COST / YEAR</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#dc2626]">
            {store.infraCosts.reduce((s,c) => s + costAnnualValue(c), 0).toLocaleString('en-EU', { maximumFractionDigits: 2 })} €
          </div>
          <div className="text-xs text-muted-foreground mt-1">active infra costs</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">YEARLY RENEWING SOON</div>
          <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${yearlyDueSoon.length > 0 ? 'text-[#d97706]' : 'text-foreground'}`}>{yearlyDueSoon.length}</div>
          <div className="text-xs text-muted-foreground mt-1">within 60 days</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-3">
          <h2>Client Hosting Revenue <span className="text-xs font-normal normal-case tracking-normal">· what clients pay you</span></h2>
          <Button variant="outline" size="sm" onClick={() => setShowAddHosting(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Client
          </Button>
        </div>

        {yearlyDueSoon.length > 0 && (
          <div className="rounded-lg border border-[#fcd34d] bg-[#fef9ee] px-3 py-2 text-sm text-[#92400e] mb-3 flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>
              <strong>{yearlyDueSoon.length} yearly client{yearlyDueSoon.length > 1 ? 's' : ''} renewing soon:</strong>{' '}
              {yearlyDueSoon.map((h: HostingClient) => h.client?.name ?? h.client_id).join(', ')}
            </span>
          </div>
        )}

        <Card>
          {store.hostingClients.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground">
              <div className="font-semibold text-[#374151] mb-1">No hosting clients yet</div>
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
                  <th className="text-right">Amount</th>
                  <th>Occurrence</th>
                  <th className="text-right">Total / yr</th>
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
                      <td className="font-bold">{h.client?.name ?? h.client_id}</td>
                      <td><Badge variant="gray">{h.project_pn}</Badge></td>
                      <td className="text-sm text-muted-foreground">{h.contract_id ?? '—'}</td>
                      <td className="text-sm">{h.description ?? '—'}</td>
                      <td className="text-sm text-muted-foreground">{h.provider ?? '—'}</td>
                      <td className={`text-xs font-semibold ${isStandalone ? 'text-foreground' : 'text-[#2563eb]'}`}>
                        {isStandalone ? 'Standalone' : 'In contract'}
                      </td>
                      <td className="text-right font-bold text-[#16a34a]">
                        {fmt(h.amount)}<span className="text-xs">/{h.cycle === 'monthly' ? 'mo' : 'yr'}</span>
                      </td>
                      <td>
                        <Badge variant={h.cycle === 'monthly' ? 'green' : 'amber'}>
                          {h.cycle === 'monthly' ? 'Monthly' : 'Yearly'}
                        </Badge>
                      </td>
                      <td className="text-right text-[#374151]">
                        {annualTotal % 1 === 0 ? annualTotal.toFixed(0) : annualTotal.toFixed(2)} €
                      </td>
                      <td className={`text-sm ${h.contract_expiry ? 'text-[#374151]' : 'text-muted-foreground'}`}>
                        {h.contract_expiry
                          ? new Date(h.contract_expiry + 'T00:00:00').toLocaleDateString('sl-SI', {month:'short', year:'numeric'})
                          : '—'}
                      </td>
                      <td>
                        {h.status === 'cancelled' && h.cancelled_from ? (
                          <div>
                            <Badge variant="gray">Cancelled</Badge>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              from {new Date(h.cancelled_from + 'T00:00:00').toLocaleString('en', {month:'short',year:'numeric'})}
                            </div>
                          </div>
                        ) : (
                          <Badge variant={h.status === 'active' ? 'green' : 'gray'}>{h.status}</Badge>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1 items-center">
                          {h.status !== 'cancelled' && isStandalone && (
                            <Button variant="outline" size="xs" onClick={() => editHosting.open(h)}>Edit</Button>
                          )}
                          {h.status === 'active' && isStandalone && (
                            <Button variant="destructive" size="xs"
                              onClick={() => { setCancelTarget(h); setCancelFromMonth('') }}>
                              Cancel
                            </Button>
                          )}
                          {isStandalone && (
                            <Button variant="ghost" size="xs" onClick={() => setDeleteTarget(h)} title="Delete" className="text-[#dc2626]">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={10}></td>
                  <td className="text-right text-[10px] font-bold text-muted-foreground uppercase tracking-[0.6px] whitespace-nowrap">Total revenue / year</td>
                  <td className="text-right text-[15px] font-extrabold text-[#16a34a] whitespace-nowrap">{totalRevenuePerYear.toLocaleString('en-EU', {maximumFractionDigits:2})} €<span className="text-xs">/yr</span></td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>

        <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 text-sm text-[#2563eb] mt-4 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Active hosting clients auto-generate monthly invoice rows in the Revenue Planner under their linked Project #.
        </div>

        {/* ── Costs ───────────────────────────────────────── */}
        <div className="flex items-center justify-between mt-8 mb-[10px]">
          <h2>Costs <span className="text-xs font-normal normal-case tracking-normal">· what you pay providers</span></h2>
          <Button variant="outline" size="sm" onClick={() => setShowAddCost(true)}>+ Add Cost</Button>
        </div>
        <Card>
          {store.infraCosts.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">No infrastructure costs recorded yet.</div>
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
                  <th className="text-right">Amount</th>
                  <th>Cycle</th>
                  <th className="text-right">Total / yr</th>
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
                    <tr key={c.id} className={isCancelled && !stillCounting ? 'opacity-50' : ''}>
                      <td className="font-bold">{c.provider}</td>
                      <td className="text-sm text-[#374151]">{c.description ?? '—'}</td>
                      <td className={`text-right font-semibold ${isCancelled ? 'text-muted-foreground' : 'text-[#dc2626]'}`}>
                        {displayAmt.toLocaleString('en-EU', {maximumFractionDigits:2})} €
                      </td>
                      <td><Badge variant={isYearly ? 'amber' : 'green'}>{isYearly ? 'Yearly' : 'Monthly'}</Badge></td>
                      <td className={`text-right text-[13px] ${annualCost === 0 ? 'text-muted-foreground' : 'text-[#dc2626]'}`}>
                        {annualCost === 0 ? '—' : `${annualCost.toLocaleString('en-EU', {maximumFractionDigits:2})} €`}
                      </td>
                      <td>
                        {isCancelled ? (
                          <div>
                            <Badge variant="gray">Cancelled</Badge>
                            {c.cancelled_from && (
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                from {new Date(c.cancelled_from + 'T00:00:00').toLocaleString('en', {month:'short',year:'numeric'})}
                              </div>
                            )}
                          </div>
                        ) : (
                          <Badge variant="green">Active</Badge>
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1 items-center">
                          {!isCancelled && (
                            <Button variant="destructive" size="xs"
                              onClick={() => { setCancelCostTarget(c); setCancelCostMonth('') }}>
                              Cancel
                            </Button>
                          )}
                          <Button variant="ghost" size="xs" className="text-[#dc2626]" title="Delete"
                            onClick={() => setDeleteCostTarget(c)}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}></td>
                  <td className="text-right text-[10px] font-bold text-muted-foreground uppercase tracking-[0.6px]">Total / yr</td>
                  <td className="text-right text-[15px] font-extrabold text-[#dc2626]">
                    {store.infraCosts.reduce((s,c) => s + costAnnualValue(c), 0).toLocaleString('en-EU', {maximumFractionDigits:2})} €
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      </div>

      {/* Add Hosting Client modal */}
      <Modal open={showAddHosting} title="Add Hosting Client" maxWidth={580} onClose={() => setShowAddHosting(false)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setShowAddHosting(false)}>Cancel</Button>
          <Button size="sm" onClick={handleAddHosting} disabled={saving || !hosting.form.client_id || !hosting.form.project_pn || !hosting.form.amount}>{saving ? <span className="spinner"/> : null} Add client</Button>
        </>}>
        <div className="grid grid-cols-2 gap-4 mb-[14px]">
          <div className="mb-4">
            <label className="form-label">Client <span className="text-[#dc2626]">*</span></label>
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
              <div className="flex gap-2 mt-1.5">
                <input
                  placeholder="Client name"
                  value={newClientName}
                  onChange={e => setNewClientName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleQuickAddClient()}
                  className="flex-1"
                  autoFocus
                />
                <Button size="sm" onClick={handleQuickAddClient} disabled={addingClient || !newClientName.trim()}>
                  {addingClient ? '…' : 'Add'}
                </Button>
              </div>
            )}
          </div>
          <div className="mb-4">
            <label className="form-label">Project # <span className="text-[#dc2626]">*</span></label>
            <input placeholder="RS-2026-001" value={hosting.form.project_pn} onChange={e => hosting.set('project_pn', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-[14px]">
          <div className="mb-4" style={{flex:2}}>
            <label className="form-label">Service description</label>
            <input placeholder="VPS + cPanel hosting" value={hosting.form.description} onChange={e => hosting.set('description', e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="form-label">Provider <span className="text-xs text-muted-foreground ml-1">optional</span></label>
            <Select
              value={hosting.form.provider}
              onChange={val => hosting.set('provider', val)}
              placeholder="— Select provider —"
              options={[...new Set(store.infraCosts.map(c => c.provider))].map(p => ({ value: p, label: p }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-[14px]">
          <div className="mb-4">
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
          <div className="mb-4"><label className="form-label">Amount (€) <span className="text-[#dc2626]">*</span></label><input type="number" placeholder="120" value={hosting.form.amount} onChange={e => hosting.set('amount', e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="mb-4"><label className="form-label">Billing since</label><input type="month" value={hosting.form.billing_since?.slice(0,7) ?? ''} onChange={e => {
            const val = e.target.value
            hosting.set('billing_since', val ? val + '-01' : '')
            if (!hosting.form.invoice_month) hosting.set('invoice_month', val)
            if (hosting.form.cycle === 'yearly' && val) {
              hosting.set('next_invoice_date', val + '-01')
            }
          }} /></div>
          {hosting.form.cycle === 'yearly' && (
            <div className="mb-4">
              <label className="form-label">Invoice month</label>
              <input type="month" value={hosting.form.next_invoice_date?.slice(0,7) ?? ''} onChange={e => hosting.set('next_invoice_date', e.target.value ? e.target.value + '-01' : '')} />
            </div>
          )}
        </div>

        {/* Contract ID + Expiry */}
        <div className="grid grid-cols-2 gap-4 mb-[14px]">
          <div className="mb-4">
            <label className="form-label">Contract / Order ID <span className="text-xs text-muted-foreground ml-1">optional</span></label>
            <input placeholder="e.g. PO-2026-042" value={hosting.form.contract_id ?? ''} onChange={e => hosting.set('contract_id', e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="form-label">Contract expiry <span className="text-xs text-muted-foreground ml-1">optional</span></label>
            <input type="month" value={hosting.form.contract_expiry ?? ''} onChange={e => hosting.set('contract_expiry', e.target.value)} />
          </div>
        </div>

        {/* Invoice planning */}
        <div className="border-t border-border pt-[14px]">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-[0.05em] mb-[10px]">Invoice planning</div>
          {hosting.form.cycle === 'monthly' && (
            <div className="grid grid-cols-2 gap-4 mb-2">
              <div className="mb-4">
                <label className="form-label">Start from month</label>
                <input type="month"
                  value={hosting.form.invoice_month}
                  onChange={e => hosting.set('invoice_month', e.target.value)}
                />
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer text-[13px]">
            <input type="checkbox" checked={hosting.form.already_billed} onChange={e => hosting.set('already_billed', e.target.checked)} />
            Already billed{hosting.form.cycle === 'monthly' ? ' for this month' : ' (mark as issued)'}
          </label>
          {(hosting.form.cycle === 'monthly' ? hosting.form.invoice_month : hosting.form.next_invoice_date) && (
            <div className="text-xs text-muted-foreground mt-1">
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
          <Button variant="outline" size="sm" onClick={() => { setCancelTarget(null); setCancelFromMonth('') }}>Back</Button>
          <Button variant="destructive" size="sm" onClick={handleCancelHosting} disabled={!cancelFromMonth || cancelling}>
            {cancelling ? '…' : 'Confirm cancellation'}
          </Button>
        </>}
      >
        {cancelTarget && (
          <div>
            <p className="mb-4 text-sm text-[#374151]">
              Cancelling <strong>{cancelTarget.client?.name}</strong> — {cancelTarget.description || cancelTarget.project_pn} ({fmt(cancelTarget.amount)}/{cancelTarget.cycle === 'monthly' ? 'mo' : 'yr'})
            </p>
            <div className="mb-3">
              <label className="form-label">Cancel from month</label>
              <input type="month" value={cancelFromMonth} onChange={e => setCancelFromMonth(e.target.value)} autoFocus />
              <div className="text-xs text-muted-foreground mt-1">All planned invoice rows from this month onwards will be removed. Past billed rows are preserved. E.g. if you cancel from June, March–May rows stay in the invoice planner.</div>
            </div>
            {cancelFromMonth && (
              <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c] flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>This will remove planned rows from <strong>{cancelFromMonth}</strong> onwards and mark this client as cancelled.</span>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Hosting modal */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete hosting client"
        message={deleteTarget ? `Delete ${deleteTarget.description || deleteTarget.project_pn} for ${deleteTarget.client?.name}? This will also delete all invoice plan rows linked to this hosting client.` : ''}
        confirmLabel={deleting ? '…' : 'Delete'}
        onConfirm={handleDeleteHosting}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Add Infrastructure Cost modal */}
      <Modal open={showAddCost} title="Add Infrastructure Cost" maxWidth={460} onClose={() => setShowAddCost(false)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setShowAddCost(false)}>Cancel</Button>
          <Button size="sm" onClick={handleAddCost} disabled={saving || !costForm.provider || !costForm.amount}>
            {saving ? <span className="spinner"/> : null} Add cost
          </Button>
        </>}>
        <div className="mb-[14px]">
          <label className="form-label">Provider <span className="text-[#dc2626]">*</span></label>
          <input placeholder="e.g. Hetzner, AWS, DigitalOcean" value={costForm.provider} onChange={e => setCostForm(f => ({...f, provider: e.target.value}))} autoFocus />
        </div>
        <div className="mb-[14px]">
          <label className="form-label">Description <span className="text-xs text-muted-foreground ml-1">optional</span></label>
          <input placeholder="e.g. VPS server, CDN, Storage" value={costForm.description} onChange={e => setCostForm(f => ({...f, description: e.target.value}))} />
        </div>
        <div className="grid grid-cols-2 gap-4 mb-[14px]">
          <div className="mb-4">
            <label className="form-label">Billing cycle</label>
            <Select value={costForm.cycle} onChange={val => setCostForm(f => ({...f, cycle: val as 'monthly' | 'yearly'}))}
              options={[{value:'monthly',label:'Monthly'},{value:'yearly',label:'Yearly'}]} />
          </div>
          <div className="mb-4">
            <label className="form-label">Amount (€) <span className="text-[#dc2626]">*</span></label>
            <input type="number" placeholder={costForm.cycle === 'yearly' ? '1200' : '100'} value={costForm.amount} onChange={e => setCostForm(f => ({...f, amount: e.target.value}))} />
          </div>
        </div>
        {costForm.amount && (
          <div className="text-xs text-muted-foreground mt-1">
            Monthly equivalent: {(costForm.cycle === 'yearly' ? parseFloat(costForm.amount||'0')/12 : parseFloat(costForm.amount||'0')).toFixed(2)} €/mo
          </div>
        )}
      </Modal>

      {/* Cancel Infrastructure Cost modal */}
      <Modal open={!!cancelCostTarget} title="Cancel Infrastructure Cost" maxWidth={420}
        onClose={() => { setCancelCostTarget(null); setCancelCostMonth('') }}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => { setCancelCostTarget(null); setCancelCostMonth('') }}>Back</Button>
          <Button variant="destructive" size="sm"
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
          </Button>
        </>}>
        {cancelCostTarget && (
          <div>
            <p className="mb-4 text-sm text-[#374151]">
              Cancelling <strong>{cancelCostTarget.provider}</strong>{cancelCostTarget.description ? ` — ${cancelCostTarget.description}` : ''}
            </p>
            <div className="mb-3">
              <label className="form-label">Cancel from month</label>
              <input type="month" value={cancelCostMonth} onChange={e => setCancelCostMonth(e.target.value)} autoFocus />
              <div className="text-xs text-muted-foreground mt-1">The cost will be marked as inactive from this month onwards.</div>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Hosting Client modal */}
      <Modal open={!!editHosting.form} title="Edit Hosting Client" onClose={editHosting.close}
        footer={<>
          <Button variant="outline" size="sm" onClick={editHosting.close}>Cancel</Button>
          <Button size="sm" onClick={handleSaveEditHosting} disabled={saving}>{saving ? <span className="spinner"/> : null} Save</Button>
        </>}>
        {editHosting.form && (
          <>
            {/* Read-only info */}
            <div className="grid grid-cols-2 gap-4 mb-[14px]">
              <div className="mb-4">
                <label className="form-label">Client</label>
                <input disabled value={cStore.clients.find(c => c.id === editHosting.form!.client_id)?.name ?? editHosting.form.client_id} className="bg-[var(--c7)] text-muted-foreground" />
              </div>
              <div className="mb-4">
                <label className="form-label">Billing cycle</label>
                <input disabled value={editHosting.form.cycle === 'monthly' ? 'Monthly' : 'Yearly'} className="bg-[var(--c7)] text-muted-foreground" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-[14px]">
              <div className="mb-4">
                <label className="form-label">Amount</label>
                <input disabled value={`${editHosting.form.amount} €/${editHosting.form.cycle === 'monthly' ? 'mo' : 'yr'}`} className="bg-[var(--c7)] text-muted-foreground" />
              </div>
              <div className="mb-4">
                <label className="form-label">Billing since</label>
                <input disabled value={editHosting.form.billing_since?.slice(0,7) ?? '—'} className="bg-[var(--c7)] text-muted-foreground" />
              </div>
            </div>
            {/* Editable fields */}
            <div className="grid grid-cols-2 gap-4 mb-[14px]">
              <div className="mb-4">
                <label className="form-label">Project #</label>
                <input placeholder="RS-2026-001" value={editHosting.form.project_pn} onChange={e => editHosting.set('project_pn', e.target.value)} />
              </div>
              <div className="mb-4">
                <label className="form-label">Contract / Order ID <span className="text-xs text-muted-foreground ml-1">optional</span></label>
                <input placeholder="e.g. PO-2026-042" value={editHosting.form.contract_id ?? ''} onChange={e => editHosting.set('contract_id', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-[14px]">
              <div className="mb-4">
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
              <div className="mb-4">
                <label className="form-label">Contract expiry</label>
                <input disabled value={editHosting.form.contract_expiry?.slice(0,7) ?? '—'} className="bg-[var(--c7)] text-muted-foreground" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-[14px]">
              {editHosting.form.cycle === 'yearly' && (
                <div className="mb-4">
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

      {/* Delete Cost confirm */}
      <ConfirmDialog
        open={!!deleteCostTarget}
        title="Delete cost"
        message={deleteCostTarget ? `Delete cost "${deleteCostTarget.provider}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleteCostTarget) return
          try { await store.removeCost(deleteCostTarget.id); toast('success', 'Cost deleted') }
          catch (e) { toast('error', (e as Error).message) }
          finally { setDeleteCostTarget(null) }
        }}
        onCancel={() => setDeleteCostTarget(null)}
      />
    </div>
  )
}
