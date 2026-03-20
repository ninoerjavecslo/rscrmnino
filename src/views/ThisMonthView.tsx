import React, { useEffect, useState } from 'react'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { RevenuePlanner, HostingClient } from '../lib/types'
import { hostingActiveInMonth } from '../lib/types'
import { Select } from '../components/Select'

// ── Probability helpers ───────────────────────────────────────────────────────


function probLabel(p: number): string {
  if (p === 100) return 'Confirmed'
  if (p === 75)  return 'Likely'
  if (p === 50)  return 'Maybe'
  return 'Unlikely'
}

function probColors(p: number) {
  if (p === 100) return { bg: '#f0fdf4', text: '#15803d', border: '#86efac' }
  if (p === 75)  return { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' }
  if (p === 50)  return { bg: '#fffbeb', text: '#92400e', border: '#fde68a' }
  return           { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' }
}

// ── Month helpers ──────────────────────────────────────────────────────────────

function getMonthStr(offset = 0): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function fmtMonthLabel(monthStr: string): string {
  const d = new Date(monthStr + 'T00:00:00')
  return d.toLocaleString('en', { month: 'long', year: 'numeric' })
}

function fmtEuro(n: number): string {
  return n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}


// ── Status helpers ─────────────────────────────────────────────────────────────

type PlannerStatus = RevenuePlanner['status']

function statusBadge(status: PlannerStatus): React.ReactElement {
  if (status === 'paid') return <span className="badge badge-green">Paid</span>
  if (status === 'issued') return <span className="badge badge-blue">Issued</span>
  if (status === 'deferred' || status === 'retainer') return <span className="badge badge-red">Not issued</span>
  return <span className="badge badge-amber">Not issued</span>
}

// ── Actual amount cell (static display only) ────────────────────────────────

function ActualAmountCell({ row }: { row: RevenuePlanner }) {
  if (row.status === 'planned' || row.status === 'deferred' || row.status === 'retainer') {
    return <span style={{ fontWeight: 700, color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>0 €</span>
  }
  // issued or paid
  const amount = row.actual_amount ?? row.planned_amount
  if (!amount) return <span style={{ color: 'var(--c5)' }}>—</span>
  const color = row.status === 'paid' ? 'var(--green)' : 'var(--blue)'
  return (
    <span style={{ fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
      {fmtEuro(amount)}
    </span>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────────

export function ThisMonthView() {
  const rStore = useRevenuePlannerStore()
  const pStore = useProjectsStore()
  const cStore = useClientsStore()
  const infraStore = useInfraStore()
  const domainsStore = useDomainsStore()

  // Month offset for navigation
  const [monthOffset, setMonthOffset] = useState(0)
  const currentMonth = getMonthStr(monthOffset)
  const monthLabel = fmtMonthLabel(currentMonth)

  // Local optimistic state: track actual_amount / status overrides for rows
  const [localOverrides, setLocalOverrides] = useState<
    Record<string, { actual_amount?: number; status?: PlannerStatus }>
  >({})

  // Plan form state: projectId → open or closed
  const [_planFormOpen, setPlanFormOpen] = useState<string | null>(null)

  // Status update loading
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null)

  // Probability popover

  // Confirm invoice modal
  const [confirmModal, setConfirmModal] = useState<RevenuePlanner | null>(null)
  const [confirmActual, setConfirmActual] = useState('')
  const [confirmNote, setConfirmNote] = useState('')
  const [confirmSaving, setConfirmSaving] = useState(false)
  const [confirmOverageType, setConfirmOverageType] = useState<'cr' | 'overshoot'>('cr')
  const [confirmPlannedTotal, setConfirmPlannedTotal] = useState(0) // includes linked hosting
  const crStore = useChangeRequestsStore()

  // Add Cost modal
  const [showAddCost, setShowAddCost] = useState(false)
  const [addCostProject, setAddCostProject] = useState('')
  const [addCostDesc, setAddCostDesc] = useState('')
  const [addCostAmount, setAddCostAmount] = useState('')
  const [addCostSaving, setAddCostSaving] = useState(false)

  // Add Invoice modal
  const [showAddInvoice, setShowAddInvoice] = useState(false)
  const [addInvClient, setAddInvClient] = useState('')
  const [addInvNewClient, setAddInvNewClient] = useState('')
  const [addInvProject, setAddInvProject] = useState('')
  const [addInvPN, setAddInvPN] = useState('')
  const [addInvAmount, setAddInvAmount] = useState('')
  const [addInvSaving, setAddInvSaving] = useState(false)

  // "Not Invoiced" defer modal
  const [deferRow, setDeferRow] = useState<RevenuePlanner | null>(null)
  const [deferNote, setDeferNote] = useState('')
  const [deferMonth, setDeferMonth] = useState('')
  const [deferSaving, setDeferSaving] = useState(false)

  // Domain group defer modal
  const [deferDomainGroup, setDeferDomainGroup] = useState<{ clientName: string; rows: RevenuePlanner[] } | null>(null)
  const [deferDomainNote, setDeferDomainNote] = useState('')
  const [deferDomainMonth, setDeferDomainMonth] = useState('')
  const [deferDomainSaving, setDeferDomainSaving] = useState(false)

  // Hosting confirmation modal
  const [hostingConfirming, setHostingConfirming] = useState<string | null>(null)
  const [hostingConfirmModal, setHostingConfirmModal] = useState<{ id: string; clientName: string; amount: number } | null>(null)

  // Batch hosting confirm
  const [batchSelectedHosting, setBatchSelectedHosting] = useState<Set<string>>(new Set())
  const [batchConfirmingHosting, setBatchConfirmingHosting] = useState(false)

  // Domain renewal confirming (from domainsStore)
  const [domainConfirming, setDomainConfirming] = useState<string | null>(null)

  // Fetch on mount and when month changes
  useEffect(() => {
    rStore.fetchByMonths([currentMonth])
    // Reset local overrides when month changes
    setLocalOverrides({})
    setPlanFormOpen(null)
    setBatchSelectedHosting(new Set())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth])

  useEffect(() => {
    if (pStore.projects.length === 0) pStore.fetchAll()
    if (cStore.clients.length === 0) cStore.fetchAll()
    infraStore.fetchAll()
    domainsStore.fetchAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Merge store rows with local overrides ───────────────────────────────────

  const rows: RevenuePlanner[] = rStore.rows.map(r => {
    const ov = localOverrides[r.id]
    if (!ov) return r
    return { ...r, ...ov }
  })

  // ── Stats calculations ──────────────────────────────────────────────────────

  const nonHostingRows = rows.filter(r => r.hosting_client_id == null && r.status !== 'cost' && (r.project_id != null || r.maintenance_id != null || r.domain_id != null))

  const maintenanceHostingExtra = rows
    .filter(r => r.maintenance_id != null && r.domain_id == null && r.status !== 'cost' && !r.notes?.startsWith('CR:'))
    .reduce((s, r) => {
      const h = infraStore.hostingClients.find(h => h.maintenance_id === r.maintenance_id && h.cycle === 'monthly' && hostingActiveInMonth(h, currentMonth))
      return s + (h?.amount ?? 0)
    }, 0)
  const standaloneHostingTotal = infraStore.hostingClients
    .filter(h => hostingActiveInMonth(h, currentMonth) && h.cycle === 'monthly' && !h.maintenance_id)
    .reduce((s, h) => s + h.amount, 0)

  const currentMonthNum = parseInt(currentMonth.slice(5, 7))

  // Yearly hosting: look for revenue_planner rows this month with a yearly hosting client
  // Only show if the hosting client's billing_month matches the current month
  const yearlyHostingItems = rows
    .filter(r => r.hosting_client_id != null)
    .map(r => {
      const h = infraStore.hostingClients.find(h =>
        h.id === r.hosting_client_id &&
        h.cycle === 'yearly' &&
        h.billing_month === currentMonthNum
      )
      return h ? { row: r, h } : null
    })
    .filter((x): x is { row: RevenuePlanner; h: HostingClient } => x != null)

  // Yearly hosting clients due this month but missing an rp row (e.g. not yet planned)
  const yearlyHostingItemIds = new Set(yearlyHostingItems.map(x => x.h.id))
  const yearlyHostingDue = infraStore.hostingClients.filter(h =>
    h.cycle === 'yearly' &&
    h.billing_month === currentMonthNum &&
    hostingActiveInMonth(h, currentMonth) &&
    !h.maintenance_id &&
    !yearlyHostingItemIds.has(h.id)
  )

  // Set of hosting_client_ids already confirmed (issued) this month in revenue_planner
  const confirmedHostingIds = new Set(
    rStore.rows
      .filter(r => r.hosting_client_id != null && r.month === currentMonth && (r.status === 'issued' || r.status === 'paid'))
      .map(r => r.hosting_client_id as string)
  )

  const yearlyHostingTotal = yearlyHostingItems.reduce((s, x) => s + (x.row.planned_amount ?? 0), 0)
    + yearlyHostingDue.reduce((s, h) => s + h.amount, 0)

  // ── Domains due this month but not yet in revenue_planner ────────────────────

  const domainRpIds = new Set(rows.filter(r => r.domain_id != null).map(r => r.domain_id as string))
  const domainsDue = domainsStore.domains.filter(d => {
    if (d.archived || !d.billable || !d.yearly_amount) return false
    const billingRef = d.registered_date ?? d.expiry_date
    if (!billingRef) return false
    const billingMonthNum = parseInt(billingRef.slice(5, 7))
    return billingMonthNum === currentMonthNum && !domainRpIds.has(d.id)
  })
  const domainsDueTotal = domainsDue.reduce((s, d) => s + (d.yearly_amount ?? 0), 0)

  const plannedTotal = nonHostingRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0) + maintenanceHostingExtra + standaloneHostingTotal + yearlyHostingTotal + domainsDueTotal

  const issuedRows = nonHostingRows.filter(r => r.status === 'issued' || r.status === 'paid')
  const confirmedStandaloneHostingTotal = infraStore.hostingClients
    .filter(h => hostingActiveInMonth(h, currentMonth) && h.cycle === 'monthly' && !h.maintenance_id && confirmedHostingIds.has(h.id))
    .reduce((s, h) => s + h.amount, 0)
  const confirmedYearlyHostingTotal = yearlyHostingItems
    .filter(x => x.row.status === 'issued' || x.row.status === 'paid')
    .reduce((s, x) => s + (x.row.actual_amount ?? x.row.planned_amount ?? 0), 0)
  const issuedTotal = issuedRows.reduce((s, r) => s + (r.actual_amount ?? r.planned_amount ?? 0), 0) + confirmedStandaloneHostingTotal + confirmedYearlyHostingTotal

  const notYetIssuedRows = nonHostingRows.filter(r => r.status === 'planned' && r.domain_id == null)
  const notYetIssuedMaintHostingExtra = notYetIssuedRows
    .filter(r => r.maintenance_id != null && !r.notes?.startsWith('CR:'))
    .reduce((s, r) => {
      const h = infraStore.hostingClients.find(h => h.maintenance_id === r.maintenance_id && h.cycle === 'monthly' && hostingActiveInMonth(h, currentMonth))
      return s + (h?.amount ?? 0)
    }, 0)
  const notYetIssuedStandaloneHosting = infraStore.hostingClients
    .filter(h => hostingActiveInMonth(h, currentMonth) && h.cycle === 'monthly' && !h.maintenance_id && !confirmedHostingIds.has(h.id))
    .reduce((s, h) => s + h.amount, 0)
  const notYetIssuedYearlyHosting = yearlyHostingItems
    .filter(x => x.row.status === 'planned')
    .reduce((s, x) => s + (x.row.planned_amount ?? 0), 0)
  const notYetIssuedTotal = notYetIssuedRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0) + notYetIssuedMaintHostingExtra + notYetIssuedStandaloneHosting + notYetIssuedYearlyHosting + domainsDueTotal

  const delta = issuedTotal - plannedTotal

  const activeProjects = pStore.projects.filter(p => p.status === 'active')

  // ── Hosting revenue this month ───────────────────────────────────────────────

  const monthlyHosting = infraStore.hostingClients.filter(h =>
    hostingActiveInMonth(h, currentMonth) && h.cycle === 'monthly' && !h.maintenance_id
  )
  const unconfirmedMonthlyHosting = monthlyHosting.filter(h => !confirmedHostingIds.has(h.id))

  // ── Row separation ────────────────────────────────────────────────────────────

  const domainRows = rows.filter(r => r.domain_id != null)
  const maintenanceRows = rows.filter(r => r.maintenance_id != null && r.domain_id == null && r.status !== 'cost' && !r.notes?.startsWith('CR:'))
  const maintenanceCRRows = rows.filter(r => r.maintenance_id != null && r.domain_id == null && r.status !== 'cost' && r.notes?.startsWith('CR:'))
  const costRows = rows.filter(r => r.status === 'cost')
  const invoiceRows = rows.filter(r => r.project_id != null && r.domain_id == null && r.maintenance_id == null && r.hosting_client_id == null && r.status !== 'cost')

  // ── Status update helpers ───────────────────────────────────────────────────

  function openConfirmModal(row: RevenuePlanner) {
    setConfirmModal(row)
    const isCR = row.notes?.startsWith('CR:')
    const linkedHosting = (!isCR && row.maintenance_id)
      ? infraStore.hostingClients.find(h => h.maintenance_id === row.maintenance_id && h.cycle === 'monthly' && hostingActiveInMonth(h, currentMonth))
      : undefined
    const total = (row.planned_amount ?? 0) + (linkedHosting?.amount ?? 0)
    setConfirmActual(String(total))
    setConfirmPlannedTotal(total)
    setConfirmNote(row.notes ?? '')
  }

  async function handleConfirmSubmit() {
    if (!confirmModal) return
    setConfirmSaving(true)
    try {
      const actual = parseFloat(confirmActual) || (confirmModal.planned_amount ?? 0)
      const { error } = await supabase
        .from('revenue_planner')
        .update({ status: 'issued', actual_amount: actual, notes: confirmNote || confirmModal.notes })
        .eq('id', confirmModal.id)
      if (error) throw error
      setLocalOverrides(prev => ({ ...prev, [confirmModal.id]: { ...prev[confirmModal.id], status: 'issued', actual_amount: actual } }))
      // Auto-create approved CR for project overage (same logic as ProjectDetailView)
      // Use confirmPlannedTotal so linked hosting is NOT counted as overage
      const extra = actual - confirmPlannedTotal
      if (extra > 0 && confirmModal.project_id && confirmOverageType === 'cr') {
        await crStore.add({
          project_id: confirmModal.project_id,
          title: `Extra: ${fmtMonthLabel(confirmModal.month)}`,
          description: confirmNote.trim() || 'Extra above planned',
          status: 'approved',
          amount: extra,
          probability: 100,
          deal_type: 'one_time',
          notes: 'auto_extra',
          expected_month: null,
          expected_end_month: null,
          monthly_schedule: null,
        })
      }
      toast('success', 'Invoice confirmed')
      setConfirmModal(null)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setConfirmSaving(false)
    }
  }

  async function handleAddCost() {
    if (!addCostProject || !addCostAmount) return
    setAddCostSaving(true)
    try {
      const { error } = await supabase
        .from('revenue_planner')
        .insert({
          project_id: addCostProject,
          month: currentMonth + '-01',
          notes: addCostDesc || null,
          planned_amount: null,
          actual_amount: Number(addCostAmount),
          status: 'cost' as const,
          probability: 100,
        })
      if (error) throw error
      await rStore.fetchByMonths([currentMonth])
      toast('success', 'Cost added')
      setShowAddCost(false)
      setAddCostProject(''); setAddCostDesc(''); setAddCostAmount('')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setAddCostSaving(false)
    }
  }

  async function handleAddInvoice() {
    if (!addInvProject.trim() || !addInvAmount) return
    setAddInvSaving(true)
    try {
      let clientId: string | null = addInvClient && addInvClient !== '__new__' ? addInvClient : null
      if (addInvClient === '__new__' && addInvNewClient.trim()) {
        const { data, error } = await supabase
          .from('clients').insert({ name: addInvNewClient.trim() }).select('id').single()
        if (error) throw error
        clientId = data.id
        await cStore.fetchAll()
      }
      const pn = addInvPN.trim() || `OT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`
      const { data: proj, error: projErr } = await supabase
        .from('projects')
        .insert({ client_id: clientId, pn, name: addInvProject.trim(), type: 'fixed', status: 'active', currency: 'EUR', contract_value: Number(addInvAmount), initial_contract_value: Number(addInvAmount) })
        .select('id').single()
      if (projErr) throw projErr
      const { error: rpErr } = await supabase
        .from('revenue_planner')
        .insert({ project_id: proj.id, month: currentMonth + '-01', planned_amount: Number(addInvAmount), actual_amount: Number(addInvAmount), status: 'issued' as const, probability: 100 })
      if (rpErr) throw rpErr
      await Promise.all([rStore.fetchByMonths([currentMonth]), pStore.fetchAll()])
      toast('success', 'Invoice added')
      setShowAddInvoice(false)
      setAddInvClient(''); setAddInvNewClient(''); setAddInvProject(''); setAddInvPN(''); setAddInvAmount('')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setAddInvSaving(false)
    }
  }

  async function handleConfirm(row: RevenuePlanner) {
    // Used only for domain rows (direct confirm, no amount entry needed)
    setStatusUpdating(row.id)
    try {
      const { error } = await supabase
        .from('revenue_planner')
        .update({ status: 'issued', actual_amount: row.planned_amount })
        .eq('id', row.id)
      if (error) throw error
      setLocalOverrides(prev => ({ ...prev, [row.id]: { ...prev[row.id], status: 'issued' } }))
      toast('success', 'Invoice marked as issued')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setStatusUpdating(null)
    }
  }

  function handleNotInvoiced(row: RevenuePlanner) {
    setDeferRow(row)
    setDeferNote(row.notes ?? '')
    setDeferMonth('')
  }

  async function handleDeferConfirm() {
    if (!deferRow) return
    setDeferSaving(true)
    try {
      // Mark current row as deferred
      const { error } = await supabase
        .from('revenue_planner')
        .update({ status: 'deferred', notes: deferNote || deferRow.notes })
        .eq('id', deferRow.id)
      if (error) throw error
      setLocalOverrides(prev => ({ ...prev, [deferRow.id]: { ...prev[deferRow.id], status: 'deferred' } }))

      // If user picked a new month, upsert a planned entry there (handles existing row)
      if (deferMonth) {
        const { error: ie } = await supabase.from('revenue_planner').upsert({
          project_id:     deferRow.project_id,
          month:          deferMonth + '-01',
          planned_amount: deferRow.planned_amount,
          actual_amount:  null,
          status:         'planned',
          notes:          deferNote || deferRow.notes,
          probability:    deferRow.probability ?? 100,
        }, { onConflict: 'project_id,month' })
        if (ie) throw ie
        await rStore.fetchByMonths([currentMonth])
      }

      toast('info', deferMonth ? `Deferred to ${deferMonth}` : 'Marked as not invoiced')
      setDeferRow(null)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setDeferSaving(false)
    }
  }

  async function handleDomainDeferConfirm() {
    if (!deferDomainGroup) return
    setDeferDomainSaving(true)
    const pendingRows = deferDomainGroup.rows.filter(r => r.status === 'planned')
    try {
      for (const row of pendingRows) {
        const { error } = await supabase
          .from('revenue_planner')
          .update({ status: 'deferred', notes: deferDomainNote || row.notes })
          .eq('id', row.id)
        if (error) throw error
        setLocalOverrides(prev => ({ ...prev, [row.id]: { ...prev[row.id], status: 'deferred' } }))

        if (deferDomainMonth) {
          const { error: ie } = await supabase.from('revenue_planner').upsert({
            domain_id:      row.domain_id,
            month:          deferDomainMonth + '-01',
            planned_amount: row.planned_amount,
            actual_amount:  null,
            status:         'planned',
            notes:          deferDomainNote || row.notes,
            probability:    100,
          }, { onConflict: 'domain_id,month' })
          if (ie) throw ie
        }
      }
      if (deferDomainMonth) await rStore.fetchByMonths([currentMonth])
      toast('info', deferDomainMonth ? `Deferred to ${deferDomainMonth}` : 'Marked as not invoiced')
      setDeferDomainGroup(null)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setDeferDomainSaving(false)
    }
  }

  // ── Hosting confirmation ─────────────────────────────────────────────────────

  async function confirmHosting(hostingId: string, amount: number) {
    setHostingConfirming(hostingId)
    try {
      // Try updating an existing planned row first
      const { data: existing } = await supabase
        .from('revenue_planner')
        .select('id')
        .eq('hosting_client_id', hostingId)
        .eq('month', currentMonth)
        .single()

      if (existing) {
        const { error } = await supabase.from('revenue_planner')
          .update({ status: 'issued', actual_amount: amount })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('revenue_planner').insert({
          hosting_client_id: hostingId,
          month: currentMonth,
          planned_amount: amount,
          actual_amount: amount,
          status: 'issued' as const,
          probability: 100,
        })
        if (error) throw error
      }
      await rStore.fetchByMonths([currentMonth])
      toast('success', 'Hosting invoice confirmed')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setHostingConfirming(null)
    }
  }

  // ── Batch hosting confirm ────────────────────────────────────────────────────

  async function confirmHostingBatch(ids: string[]) {
    if (ids.length === 0) return
    setBatchConfirmingHosting(true)
    try {
      for (const id of ids) {
        const h = monthlyHosting.find(h => h.id === id)
        if (!h) continue
        const { data: existing } = await supabase
          .from('revenue_planner')
          .select('id')
          .eq('hosting_client_id', id)
          .eq('month', currentMonth)
          .single()
        if (existing) {
          const { error } = await supabase.from('revenue_planner')
            .update({ status: 'issued', actual_amount: h.amount })
            .eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('revenue_planner').insert({
            hosting_client_id: id,
            month: currentMonth,
            planned_amount: h.amount,
            actual_amount: h.amount,
            status: 'issued' as const,
            probability: 100,
          })
          if (error) throw error
        }
      }
      await rStore.fetchByMonths([currentMonth])
      setBatchSelectedHosting(new Set())
      toast('success', `Confirmed ${ids.length} hosting invoice${ids.length !== 1 ? 's' : ''}`)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBatchConfirmingHosting(false)
    }
  }

  // ── Confirm domain renewal (from domainsStore — no existing rp row) ─────────

  async function confirmDomainDue(domainId: string, amount: number) {
    setDomainConfirming(domainId)
    try {
      const { error } = await supabase.from('revenue_planner').insert({
        domain_id: domainId,
        month: currentMonth,
        planned_amount: amount,
        actual_amount: amount,
        status: 'issued' as const,
        probability: 100,
      })
      if (error) throw error
      await rStore.fetchByMonths([currentMonth])
      toast('success', 'Domain renewal confirmed')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setDomainConfirming(null)
    }
  }

  // ── Client lookup ───────────────────────────────────────────────────────────

  function clientName(clientId: string | null | undefined): string {
    if (!clientId) return '—'
    const c = cStore.clients.find(cl => cl.id === clientId)
    return c?.name ?? '—'
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const isLoading = rStore.loading || (pStore.loading && activeProjects.length === 0)

  return (
    <div>
      {/* ── Defer / Not Invoiced modal ─────────────────────────────────────── */}
      {deferRow && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeferRow(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2>Not Invoiced — {deferRow.project?.name}</h2>
              <button className="modal-close" onClick={() => setDeferRow(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Reason / note <span className="form-hint" style={{ display: 'inline' }}>optional</span></label>
                <input value={deferNote} onChange={e => setDeferNote(e.target.value)} placeholder="e.g. Client requested delay" autoFocus />
              </div>
              {!deferRow.maintenance_id && (
                <div className="form-group">
                  <label className="form-label">Move to month <span className="form-hint" style={{ display: 'inline' }}>optional — leave blank to just mark deferred</span></label>
                  <input type="month" value={deferMonth} onChange={e => setDeferMonth(e.target.value)} />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setDeferRow(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleDeferConfirm} disabled={deferSaving}>
                {deferSaving ? <span className="spinner" /> : null}
                {deferMonth ? 'Defer to selected month' : 'Mark not invoiced'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Domain defer modal ──────────────────────────────────────────────── */}
      {deferDomainGroup && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeferDomainGroup(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2>Not Invoiced — {deferDomainGroup.clientName}</h2>
              <button className="modal-close" onClick={() => setDeferDomainGroup(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Reason / note <span className="form-hint" style={{ display: 'inline' }}>optional</span></label>
                <input value={deferDomainNote} onChange={e => setDeferDomainNote(e.target.value)} placeholder="e.g. Client requested delay" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Move to month <span className="form-hint" style={{ display: 'inline' }}>optional — leave blank to just mark deferred</span></label>
                <input type="month" value={deferDomainMonth} onChange={e => setDeferDomainMonth(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setDeferDomainGroup(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleDomainDeferConfirm} disabled={deferDomainSaving}>
                {deferDomainSaving ? <span className="spinner" /> : null}
                {deferDomainMonth ? 'Defer to selected month' : 'Mark not invoiced'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm invoice modal ───────────────────────────────────────────── */}
      {confirmModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setConfirmModal(null)}>
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Confirm Invoice</h2>
              <button className="modal-close" onClick={() => setConfirmModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--c2)' }}>
                <strong>{confirmModal.maintenance?.name ?? confirmModal.project?.name ?? '—'}</strong>
                {' · '}{fmtMonthLabel(confirmModal.month)}
                {' · '}planned {fmtEuro(confirmModal.planned_amount ?? 0)}
              </p>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Actual amount (€)</label>
                <input
                  type="number"
                  value={confirmActual}
                  onChange={e => setConfirmActual(e.target.value)}
                  autoFocus
                />
                {parseFloat(confirmActual) > confirmPlannedTotal && (() => {
                  const extra = parseFloat(confirmActual) - confirmPlannedTotal
                  return (
                    <div style={{ marginTop: 8 }}>
                      <div className="form-hint" style={{ color: 'var(--amber)', fontWeight: 600, marginBottom: 8 }}>
                        +{fmtEuro(extra)} above planned
                      </div>
                      {confirmModal.project_id && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                            <input type="radio" name="overage" checked={confirmOverageType === 'cr'} onChange={() => setConfirmOverageType('cr')} style={{ marginTop: 2 }} />
                            <span><strong>Change request</strong> — extra work, auto-creates approved CR (+{fmtEuro(extra)})</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                            <input type="radio" name="overage" checked={confirmOverageType === 'overshoot'} onChange={() => setConfirmOverageType('overshoot')} style={{ marginTop: 2 }} />
                            <span><strong>Overshoot</strong> — invoiced more upfront, will invoice less later</span>
                          </label>
                        </div>
                      )}
                      {!confirmModal.project_id && (
                        <div className="form-hint">Extra will be recorded on the invoice. Add a change request manually if needed.</div>
                      )}
                    </div>
                  )
                })()}
              </div>
              <div className="form-group">
                <label className="form-label">Note <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
                <input value={confirmNote} onChange={e => setConfirmNote(e.target.value)} placeholder="e.g. extra hours, change request…" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmModal(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleConfirmSubmit} disabled={confirmSaving}>
                {confirmSaving ? <span className="spinner" /> : null} Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Cost modal ───────────────────────────────────────────────────── */}
      {showAddCost && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddCost(false)}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Add Cost</h2>
              <button className="modal-close" onClick={() => setShowAddCost(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Project</label>
                <select value={addCostProject} onChange={e => setAddCostProject(e.target.value)} autoFocus>
                  <option value="">— select project —</option>
                  {pStore.projects.filter(p => p.status === 'active').map(p => (
                    <option key={p.id} value={p.id}>{p.name} <span style={{opacity:.6}}>({p.pn})</span></option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input value={addCostDesc} onChange={e => setAddCostDesc(e.target.value)} placeholder="e.g. Subcontractor, license…" />
              </div>
              <div className="form-group">
                <label className="form-label">Amount (€)</label>
                <input type="number" value={addCostAmount} onChange={e => setAddCostAmount(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddCost(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAddCost} disabled={addCostSaving || !addCostProject || !addCostAmount}>
                {addCostSaving ? <span className="spinner" /> : null} Add Cost
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Invoice modal ─────────────────────────────────────────────────── */}
      {showAddInvoice && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddInvoice(false)}>
          <div className="modal-box" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2>Add One-Time Invoice</h2>
              <button className="modal-close" onClick={() => setShowAddInvoice(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Client</label>
                <Select
                  value={addInvClient}
                  onChange={v => setAddInvClient(v)}
                  placeholder="— select client —"
                  options={[
                    ...cStore.clients.map(c => ({ value: c.id, label: c.name })),
                    { value: '__new__', label: '+ New client…' },
                  ]}
                />
              </div>
              {addInvClient === '__new__' && (
                <div className="form-group">
                  <label className="form-label">New client name</label>
                  <input value={addInvNewClient} onChange={e => setAddInvNewClient(e.target.value)} placeholder="Client name" />
                </div>
              )}
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Project / description</label>
                  <input value={addInvProject} onChange={e => setAddInvProject(e.target.value)} placeholder="e.g. Website redesign" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Project № <span className="form-hint" style={{ display: 'inline' }}>optional</span></label>
                  <input value={addInvPN} onChange={e => setAddInvPN(e.target.value)} placeholder="RS-2026-…" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Revenue (€)</label>
                <input type="number" value={addInvAmount} onChange={e => setAddInvAmount(e.target.value)} placeholder="0" />
              </div>
              <p className="form-hint" style={{ marginTop: 8 }}>Creates a project and marks the invoice as issued for {monthLabel}.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAddInvoice(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAddInvoice} disabled={addInvSaving || !addInvProject.trim() || !addInvAmount}>
                {addInvSaving ? <span className="spinner" /> : null} Add Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hosting confirm modal ────────────────────────────────────────────── */}
      {hostingConfirmModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setHostingConfirmModal(null)}>
          <div className="modal-box" style={{ maxWidth: 360 }}>
            <div className="modal-header">
              <h2>Confirm Hosting Invoice</h2>
              <button className="modal-close" onClick={() => setHostingConfirmModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 4px', fontSize: 14 }}>
                <strong>{hostingConfirmModal.clientName}</strong>
              </p>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--c2)' }}>
                Amount: <strong>{fmtEuro(hostingConfirmModal.amount)}</strong>
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setHostingConfirmModal(null)}>Cancel</button>
              <button
                className="btn btn-primary btn-sm"
                disabled={hostingConfirming === hostingConfirmModal.id}
                onClick={async () => {
                  await confirmHosting(hostingConfirmModal.id, hostingConfirmModal.amount)
                  setHostingConfirmModal(null)
                }}
              >
                {hostingConfirming === hostingConfirmModal.id ? <span className="spinner" /> : null} Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>{monthLabel} — Invoices</h1>
          <p>Confirm or defer planned invoices</p>
        </div>

        {/* Month navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setMonthOffset(o => o - 1)}
            style={{ padding: '0 12px' }}
            aria-label="Previous month"
          >
            &#8249;
          </button>
          <span style={{
            fontWeight: 700,
            fontSize: 14,
            color: 'var(--c1)',
            minWidth: 120,
            textAlign: 'center',
          }}>
            {monthLabel}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setMonthOffset(o => o + 1)}
            style={{ padding: '0 12px' }}
            aria-label="Next month"
          >
            &#8250;
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => rStore.fetchByMonths([currentMonth])}
            disabled={rStore.loading}
            style={{ marginLeft: 8 }}
          >
            {rStore.loading ? (
              <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2, borderTopColor: 'var(--c3)', borderColor: 'var(--c5)' }} />
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15" />
              </svg>
            )}
            Refresh
          </button>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => setShowAddCost(true)}>+ Add Cost</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddInvoice(true)}>+ Add Invoice</button>
        </div>
      </div>

      {/* ── Error banners ────────────────────────────────────────────────────── */}
      {(rStore.error || pStore.error) && (
        <div className="alert alert-red" style={{ margin: '16px 28px 0' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Failed to load data. Please check your connection.</span>
        </div>
      )}

      {/* ── Stats strip ─────────────────────────────────────────────────────── */}
      <div className="stats-strip">
        <div className="stat-card" style={{ '--left-color': 'var(--c5)' } as React.CSSProperties}>
          <div className="stat-card-label">Planned this month</div>
          <div className="stat-card-value text-mono">{fmtEuro(plannedTotal)}</div>
          <div className="stat-card-sub">{invoiceRows.length + maintenanceRows.length + domainRows.length} invoice{invoiceRows.length + maintenanceRows.length + domainRows.length !== 1 ? 's' : ''} planned</div>
        </div>

        <div className="stat-card" style={{ '--left-color': 'var(--navy)' } as React.CSSProperties}>
          <div className="stat-card-label">Issued</div>
          <div className="stat-card-value text-mono" style={{ color: 'var(--navy)' }}>
            {fmtEuro(issuedTotal)}
          </div>
          <div className="stat-card-sub">{issuedRows.length} invoice{issuedRows.length !== 1 ? 's' : ''}</div>
        </div>

        <div className="stat-card" style={{ '--left-color': 'var(--amber)' } as React.CSSProperties}>
          <div className="stat-card-label">Not yet issued</div>
          <div className="stat-card-value text-mono" style={{ color: 'var(--amber)' }}>
            {fmtEuro(notYetIssuedTotal)}
          </div>
          <div className="stat-card-sub">{notYetIssuedRows.length} pending</div>
        </div>

        <div className="stat-card" style={{ '--left-color': '#7c3aed' } as React.CSSProperties}>
          <div className="stat-card-label">Delta plan vs actual</div>
          <div
            className="stat-card-value text-mono"
            style={{ color: delta >= 0 ? 'var(--navy)' : 'var(--red)' }}
          >
            {delta >= 0 ? '+' : ''}{fmtEuro(delta)}
          </div>
          <div className="stat-card-sub">issued minus planned</div>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Invoice table ─────────────────────────────────────────────────── */}
        <div>
          <div className="section-bar">
            <h2>Planned invoices — {monthLabel}</h2>
          </div>

          <div className="card">
            {isLoading ? (
              <div className="card-body" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--c4)' }}>
                <span className="spinner" style={{ width: 26, height: 26, borderWidth: 3, borderTopColor: 'var(--navy)', borderColor: 'var(--c5)', display: 'inline-block', marginBottom: 12 }} />
                <div style={{ fontWeight: 600, marginTop: 12 }}>Loading invoices…</div>
              </div>
            ) : invoiceRows.length === 0 && maintenanceCRRows.length === 0 ? (
              <div className="card-body" style={{ textAlign: 'center', padding: '48px 20px' }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🗂</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c2)', marginBottom: 5 }}>
                  No planned invoices for {monthLabel}
                </div>
                <div className="text-sm">Plan an invoice for a project below to get started.</div>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Description</th>
                    <th className="th-right">Planned</th>
                    <th className="th-right">Actual Amount</th>
                    <th>Status</th>
                    <th>Probability</th>
                    <th className="th-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[...invoiceRows, ...maintenanceCRRows].map(row => {
                    const isMaintenance = !!row.maintenance_id
                    const displayName = row.project?.name ?? row.maintenance?.name ?? '—'
                    const displaySub  = row.project
                      ? clientName(row.project.client_id)
                      : (isMaintenance ? row.maintenance?.client?.name : null)
                    const isUpdating  = statusUpdating === row.id
                    const isPending   = row.status === 'planned'
                    const isDeferred  = row.status === 'deferred' || row.status === 'retainer'
                    const isCRRow = row.notes?.startsWith('CR:')
                    const crTitle = isCRRow ? row.notes!.slice(3).trim() : null

                    return (
                      <tr key={row.id} style={isDeferred ? { background: 'rgba(239,68,68,0.04)' } : undefined}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ fontWeight: 700, color: 'var(--c0)', fontSize: 14 }} className="table-link">
                              {displayName}
                            </div>
                            {isCRRow && <span className="badge badge-navy" style={{ fontSize: 10 }}>CR</span>}
                          </div>
                          {displaySub && (
                            <div style={{ fontSize: 11, color: 'var(--c4)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                              {displaySub}
                            </div>
                          )}
                        </td>

                        <td>
                          <span style={{ fontSize: 12, color: 'var(--c3)' }}>
                            {crTitle ?? row.notes ?? '—'}
                          </span>
                        </td>

                        <td className="td-right">
                          <span className="text-muted text-mono">
                            {row.planned_amount != null ? fmtEuro(row.planned_amount) : '—'}
                          </span>
                        </td>

                        <td className="td-right">
                          <ActualAmountCell row={row} />
                        </td>

                        <td>{statusBadge(row.status)}</td>

                        {/* Probability */}
                        <td>
                          {(row.probability != null && row.probability !== 100) ? (
                            <span style={{
                              display: 'inline-block',
                              fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                              background: probColors(row.probability).bg,
                              color: probColors(row.probability).text,
                              border: `1px solid ${probColors(row.probability).border}`,
                            }}>
                              {row.probability}% · {probLabel(row.probability)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
                          )}
                        </td>

                        <td className="td-right">
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            {isPending && (
                              <>
                                <button
                                  className="btn btn-primary btn-xs"
                                  onClick={() => openConfirmModal(row)}
                                  disabled={isUpdating}
                                >
                                  Confirm
                                </button>
                                <button
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => handleNotInvoiced(row)}
                                  disabled={isUpdating}
                                >
                                  Not Invoiced
                                </button>
                              </>
                            )}
                            {!isPending && (
                              <span style={{ fontSize: 12, color: 'var(--c4)', fontStyle: 'italic' }}>
                                {row.status === 'paid' ? 'Paid' : (row.status === 'deferred' || row.status === 'retainer') ? 'Not issued' : 'Issued'}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Maintenance invoices this month ──────────────────────────────── */}
        {maintenanceRows.length > 0 && (
          <div>
            <div className="section-bar">
              <h2>Maintenance Invoices — {monthLabel}</h2>
            </div>
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Client</th>
                    <th className="th-right">Retainer</th>
                    <th className="th-right">Actual</th>
                    <th>Status</th>
                    <th className="th-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenanceRows.map(row => {
                    const isPending = row.status === 'planned'
                    return (
                      <tr key={row.id}>
                        <td style={{ fontWeight: 700, fontSize: 14 }}>{row.maintenance?.name ?? '—'}</td>
                        <td style={{ fontSize: 13, color: 'var(--c2)' }}>{row.maintenance?.client?.name ?? '—'}</td>
                        <td className="td-right text-mono">
                          {(() => {
                            const linkedHosting = infraStore.hostingClients.find(h => h.maintenance_id === row.maintenance_id && h.cycle === 'monthly' && hostingActiveInMonth(h, currentMonth))
                            const total = (row.planned_amount ?? 0) + (linkedHosting?.amount ?? 0)
                            return <>
                              {fmtEuro(total)}
                              {linkedHosting && (
                                <div style={{ fontSize: 10, color: 'var(--c4)', fontWeight: 400 }}>
                                  {fmtEuro(row.planned_amount ?? 0)} + {fmtEuro(linkedHosting.amount)}
                                </div>
                              )}
                            </>
                          })()}
                        </td>
                        <td className="td-right">
                          <ActualAmountCell row={row} />
                        </td>
                        <td>{statusBadge(row.status)}</td>
                        <td className="td-right">
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            {isPending && (
                              <>
                                <button className="btn btn-primary btn-xs" onClick={() => openConfirmModal(row)}>Confirm</button>
                                <button className="btn btn-secondary btn-xs" onClick={() => handleNotInvoiced(row)}>Not Invoiced</button>
                              </>
                            )}
                            {!isPending && (
                              <span style={{ fontSize: 12, color: 'var(--c4)', fontStyle: 'italic' }}>
                                {row.status === 'paid' ? 'Paid' : 'Issued'}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Hosting revenue this month ────────────────────────────────────── */}
        {(monthlyHosting.length > 0 || yearlyHostingItems.length > 0 || yearlyHostingDue.length > 0) && (
          <div>
            <div className="section-bar">
              <h2>Hosting Revenue — {monthLabel}</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {batchSelectedHosting.size > 0 && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => confirmHostingBatch([...batchSelectedHosting])}
                    disabled={batchConfirmingHosting}
                  >
                    {batchConfirmingHosting ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> : null}
                    Confirm selected ({batchSelectedHosting.size})
                  </button>
                )}
                {unconfirmedMonthlyHosting.length > 1 && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => confirmHostingBatch(unconfirmedMonthlyHosting.map(h => h.id))}
                    disabled={batchConfirmingHosting}
                  >
                    {batchConfirmingHosting ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> : null}
                    Confirm all ({unconfirmedMonthlyHosting.length})
                  </button>
                )}
              </div>
            </div>

            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}></th>
                    <th>Client</th>
                    <th>Description</th>
                    <th className="th-right">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyHosting.map(h => {
                    const confirmed = confirmedHostingIds.has(h.id)
                    const selected = batchSelectedHosting.has(h.id)
                    return (
                      <tr key={h.id}>
                        <td style={{ paddingLeft: 12 }}>
                          {!confirmed && (
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={e => {
                                setBatchSelectedHosting(prev => {
                                  const next = new Set(prev)
                                  if (e.target.checked) next.add(h.id)
                                  else next.delete(h.id)
                                  return next
                                })
                              }}
                              style={{ cursor: 'pointer', width: 14, height: 14 }}
                            />
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--c0)', fontSize: 14 }}>
                            {h.client?.name ?? '—'}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 13, color: 'var(--c3)' }}>
                            {h.description ?? '—'}
                          </span>
                        </td>
                        <td className="td-right">
                          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--c1)' }}>
                            {h.amount.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €<span style={{ fontWeight: 400, color: 'var(--c4)', fontSize: 12 }}>/mo</span>
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {confirmed ? (
                            <span className="badge badge-green">Issued</span>
                          ) : (
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={() => setHostingConfirmModal({ id: h.id, clientName: h.client?.name ?? '—', amount: h.amount })}
                            >
                              Confirm
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {yearlyHostingItems.map(({ row, h }) => {
                    const confirmed = row.status === 'issued' || row.status === 'paid'
                    return (
                      <tr key={h.id}>
                        <td></td>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--c0)', fontSize: 14 }}>
                            {h.client?.name ?? '—'}
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: 13, color: 'var(--c3)' }}>
                            {h.description ?? '—'}<span style={{ marginLeft: 6, fontSize: 11, color: 'var(--c4)' }}>yearly</span>
                          </span>
                        </td>
                        <td className="td-right">
                          <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--c1)' }}>
                            {(row.planned_amount ?? h.amount).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €<span style={{ fontWeight: 400, color: 'var(--c4)', fontSize: 12 }}>/yr</span>
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {confirmed ? (
                            <span className="badge badge-green">Issued</span>
                          ) : (
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={() => setHostingConfirmModal({ id: h.id, clientName: h.client?.name ?? '—', amount: row.planned_amount ?? h.amount })}
                            >
                              Confirm
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {yearlyHostingDue.map(h => (
                    <tr key={h.id}>
                      <td></td>
                      <td><div style={{ fontWeight: 700, color: 'var(--c0)', fontSize: 14 }}>{h.client?.name ?? '—'}</div></td>
                      <td><span style={{ fontSize: 13, color: 'var(--c3)' }}>{h.description ?? '—'}<span style={{ marginLeft: 6, fontSize: 11, color: 'var(--c4)' }}>yearly</span></span></td>
                      <td className="td-right">
                        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--c1)' }}>
                          {h.amount.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €<span style={{ fontWeight: 400, color: 'var(--c4)', fontSize: 12 }}>/yr</span>
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-primary btn-xs" onClick={() => setHostingConfirmModal({ id: h.id, clientName: h.client?.name ?? '—', amount: h.amount })}>
                          Confirm
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Domain renewals this month ────────────────────────────────────── */}
        {(domainRows.length > 0 || domainsDue.length > 0) && (
          <div>
            <div className="section-bar">
              <h2>Domain Renewals — {monthLabel}</h2>
            </div>

            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Domains</th>
                    <th className="th-right">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {domainsDue.map(d => (
                    <tr key={`due-${d.id}`}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--c0)', fontSize: 14 }}>
                          {d.client?.name ?? '—'}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          <span style={{
                            fontSize: 12, color: 'var(--c2)', background: 'var(--c7)',
                            border: '1px solid var(--c6)', borderRadius: 4, padding: '2px 7px',
                            fontFamily: 'monospace',
                          }}>
                            {d.domain_name}
                          </span>
                        </div>
                      </td>
                      <td className="td-right">
                        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--c1)' }}>
                          {fmtEuro(d.yearly_amount ?? 0)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-primary btn-xs"
                          onClick={() => confirmDomainDue(d.id, d.yearly_amount ?? 0)}
                          disabled={domainConfirming === d.id}
                        >
                          {domainConfirming === d.id ? 'Saving…' : 'Confirm'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(() => {
                    // Group by client id
                    const groups = new Map<string, { clientName: string; rows: RevenuePlanner[] }>()
                    for (const row of domainRows) {
                      const key = row.domain?.client?.id ?? '__unknown'
                      const name = row.domain?.client?.name ?? '—'
                      if (!groups.has(key)) groups.set(key, { clientName: name, rows: [] })
                      groups.get(key)!.rows.push(row)
                    }
                    return Array.from(groups.entries()).map(([key, group]) => {
                      const allIssued = group.rows.every(r => r.status !== 'planned')
                      const anyUpdating = group.rows.some(r => statusUpdating === r.id)
                      const total = group.rows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
                      return (
                        <tr key={key}>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--c0)', fontSize: 14 }}>
                              {group.clientName}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {group.rows.map(r => (
                                <span key={r.id} style={{
                                  fontSize: 12, color: 'var(--c2)', background: 'var(--c7)',
                                  border: '1px solid var(--c6)', borderRadius: 4, padding: '2px 7px',
                                  fontFamily: 'monospace',
                                }}>
                                  {r.domain?.domain_name ?? '—'}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="td-right">
                            <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--c1)' }}>
                              {fmtEuro(total)}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {allIssued ? (
                              <span className="badge badge-green">Issued</span>
                            ) : (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-primary btn-xs"
                                  onClick={async () => {
                                    for (const r of group.rows.filter(r => r.status === 'planned')) {
                                      await handleConfirm(r)
                                    }
                                  }}
                                  disabled={anyUpdating}
                                >
                                  {anyUpdating ? 'Saving…' : 'Confirm'}
                                </button>
                                <button
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => {
                                    setDeferDomainGroup(group)
                                    setDeferDomainNote('')
                                    setDeferDomainMonth('')
                                  }}
                                  disabled={anyUpdating}
                                >
                                  Not Invoiced
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Costs this month ─────────────────────────────────────────────── */}
        <div>
          <div className="section-bar">
            <h2>Costs this month</h2>
          </div>

          <div className="card">
            {costRows.length === 0 ? (
              <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
                No costs recorded this month.
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>PROJECT</th>
                    <th>DESCRIPTION</th>
                    <th className="th-right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {costRows.map(r => {
                    const proj = pStore.projects.find(p => p.id === r.project_id)
                    const maint = r.maintenance_id ? maintenanceRows.find(m => m.maintenance_id === r.maintenance_id) : null
                    return (
                      <tr key={r.id}>
                        <td style={{ fontSize: 13, color: 'var(--c2)' }}>
                          {proj?.name ?? (maint ? 'Maintenance' : <span className="text-muted">—</span>)}
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--c1)' }}>
                          {r.notes ?? <span className="text-muted">—</span>}
                        </td>
                        <td className="td-right text-mono" style={{ fontWeight: 600, color: 'var(--red)', fontSize: 13 }}>
                          {r.actual_amount != null ? fmtEuro(r.actual_amount) : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                    <td colSpan={2} style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)', letterSpacing: '0.05em' }}>TOTAL COSTS</td>
                    <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--red)', fontSize: 14 }}>
                      {fmtEuro(costRows.reduce((s, r) => s + (r.actual_amount ?? 0), 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
