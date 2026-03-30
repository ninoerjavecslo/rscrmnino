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
import { Modal } from '../components/Modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
  d.setDate(1)  // Set to 1st before changing month to avoid rollover
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
  if (status === 'paid') return <Badge variant="green">Paid</Badge>
  if (status === 'issued') return <Badge variant="blue">Issued</Badge>
  if (status === 'deferred' || status === 'retainer') return <Badge variant="red">Not issued</Badge>
  return <Badge variant="amber">Not issued</Badge>
}

// ── Actual amount cell (static display only) ────────────────────────────────

function ActualAmountCell({ row }: { row: RevenuePlanner }) {
  if (row.status === 'planned' || row.status === 'deferred' || row.status === 'retainer') {
    return <span className="font-bold text-[#dc2626] tabular-nums">0 €</span>
  }
  // issued or paid
  const amount = row.actual_amount ?? row.planned_amount
  if (!amount) return <span className="text-border">—</span>
  const colorClass = row.status === 'paid' ? 'text-[#16a34a]' : 'text-[#2563eb]'
  return (
    <span className={`font-bold tabular-nums ${colorClass}`}>
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
      <Modal open={!!deferRow} title={`Not Invoiced — ${deferRow?.project?.name ?? ''}`} maxWidth={440} onClose={() => setDeferRow(null)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setDeferRow(null)}>Cancel</Button>
          <Button size="sm" onClick={handleDeferConfirm} disabled={deferSaving}>
            {deferMonth ? 'Defer to selected month' : 'Mark not invoiced'}
          </Button>
        </>}>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Reason / note <span className="text-xs text-muted-foreground ml-1">optional</span></label>
          <input value={deferNote} onChange={e => setDeferNote(e.target.value)} placeholder="e.g. Client requested delay" autoFocus />
        </div>
        {!deferRow?.maintenance_id && (
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Move to month <span className="text-xs text-muted-foreground ml-1">optional — leave blank to just mark deferred</span></label>
            <input type="month" value={deferMonth} onChange={e => setDeferMonth(e.target.value)} />
          </div>
        )}
      </Modal>

      {/* ── Domain defer modal ──────────────────────────────────────────────── */}
      <Modal open={!!deferDomainGroup} title={`Not Invoiced — ${deferDomainGroup?.clientName ?? ''}`} maxWidth={440} onClose={() => setDeferDomainGroup(null)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setDeferDomainGroup(null)}>Cancel</Button>
          <Button size="sm" onClick={handleDomainDeferConfirm} disabled={deferDomainSaving}>
            {deferDomainMonth ? 'Defer to selected month' : 'Mark not invoiced'}
          </Button>
        </>}>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Reason / note <span className="text-xs text-muted-foreground ml-1">optional</span></label>
          <input value={deferDomainNote} onChange={e => setDeferDomainNote(e.target.value)} placeholder="e.g. Client requested delay" autoFocus />
        </div>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Move to month <span className="text-xs text-muted-foreground ml-1">optional — leave blank to just mark deferred</span></label>
          <input type="month" value={deferDomainMonth} onChange={e => setDeferDomainMonth(e.target.value)} />
        </div>
      </Modal>

      {/* ── Confirm invoice modal ───────────────────────────────────────────── */}
      <Modal open={!!confirmModal} title="Confirm Invoice" maxWidth={420} onClose={() => setConfirmModal(null)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setConfirmModal(null)}>Cancel</Button>
          <Button size="sm" onClick={handleConfirmSubmit} disabled={confirmSaving}>Confirm</Button>
        </>}>
        {confirmModal && (
          <>
            <p className="text-sm text-[#374151] mb-4">
              <strong>{confirmModal.maintenance?.name ?? confirmModal.project?.name ?? '—'}</strong>
              {' · '}{fmtMonthLabel(confirmModal.month)}
              {' · '}planned {fmtEuro(confirmModal.planned_amount ?? 0)}
            </p>
            <div className="mb-3">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Actual amount (€)</label>
              <input
                type="number"
                value={confirmActual}
                onChange={e => setConfirmActual(e.target.value)}
                autoFocus
              />
              {parseFloat(confirmActual) > confirmPlannedTotal && (() => {
                const extra = parseFloat(confirmActual) - confirmPlannedTotal
                return (
                  <div className="mt-2">
                    <div className="text-xs font-semibold text-[#d97706] mb-2">
                      +{fmtEuro(extra)} above planned
                    </div>
                    {confirmModal.project_id && (
                        <div className="flex flex-col gap-1.5">
                          <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                            <input type="radio" name="overage" checked={confirmOverageType === 'cr'} onChange={() => setConfirmOverageType('cr')} className="mt-0.5" />
                            <span><strong>Change request</strong> — extra work, auto-creates approved CR (+{fmtEuro(extra)})</span>
                          </label>
                          <label className="flex items-start gap-2 text-[13px] cursor-pointer">
                            <input type="radio" name="overage" checked={confirmOverageType === 'overshoot'} onChange={() => setConfirmOverageType('overshoot')} className="mt-0.5" />
                            <span><strong>Overshoot</strong> — invoiced more upfront, will invoice less later</span>
                          </label>
                        </div>
                      )}
                      {!confirmModal.project_id && (
                        <div className="text-xs text-muted-foreground mt-1">Extra will be recorded on the invoice. Add a change request manually if needed.</div>
                      )}
                    </div>
                  )
                })()}
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Note <span className="text-xs text-muted-foreground ml-1">optional</span></label>
                <input value={confirmNote} onChange={e => setConfirmNote(e.target.value)} placeholder="e.g. extra hours, change request…" />
              </div>
          </>
        )}
      </Modal>

      {/* ── Add Cost modal ───────────────────────────────────────────────────── */}
      <Modal open={showAddCost} title="Add Cost" maxWidth={400} onClose={() => setShowAddCost(false)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setShowAddCost(false)}>Cancel</Button>
          <Button size="sm" onClick={handleAddCost} disabled={addCostSaving || !addCostProject || !addCostAmount}>Add Cost</Button>
        </>}>
        <>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project</label>
            <select value={addCostProject} onChange={e => setAddCostProject(e.target.value)} autoFocus>
              <option value="">— select project —</option>
              {pStore.projects.filter(p => p.status === 'active').map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.pn})</option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Description</label>
            <input value={addCostDesc} onChange={e => setAddCostDesc(e.target.value)} placeholder="e.g. Subcontractor, license…" />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€)</label>
            <input type="number" value={addCostAmount} onChange={e => setAddCostAmount(e.target.value)} placeholder="0" />
          </div>
        </>
      </Modal>

      {/* ── Add Invoice modal ─────────────────────────────────────────────────── */}
      <Modal open={showAddInvoice} title="Add One-Time Invoice" maxWidth={440} onClose={() => setShowAddInvoice(false)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setShowAddInvoice(false)}>Cancel</Button>
          <Button size="sm" onClick={handleAddInvoice} disabled={addInvSaving || !addInvProject.trim() || !addInvAmount}>Add Invoice</Button>
        </>}>
        <>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Client</label>
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
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">New client name</label>
              <input value={addInvNewClient} onChange={e => setAddInvNewClient(e.target.value)} placeholder="Client name" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="mb-4 col-span-2 sm:col-span-1 flex-[2]">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project / description</label>
              <input value={addInvProject} onChange={e => setAddInvProject(e.target.value)} placeholder="e.g. Website redesign" />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project № <span className="text-xs text-muted-foreground ml-1">optional</span></label>
              <input value={addInvPN} onChange={e => setAddInvPN(e.target.value)} placeholder="RS-2026-…" />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Revenue (€)</label>
            <input type="number" value={addInvAmount} onChange={e => setAddInvAmount(e.target.value)} placeholder="0" />
          </div>
          <p className="text-xs text-muted-foreground mt-2">Creates a project and marks the invoice as issued for {monthLabel}.</p>
        </>
      </Modal>

      {/* ── Hosting confirm modal ────────────────────────────────────────────── */}
      <Modal open={!!hostingConfirmModal} title="Confirm Hosting Invoice" maxWidth={360} onClose={() => setHostingConfirmModal(null)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setHostingConfirmModal(null)}>Cancel</Button>
          <Button
            size="sm"
            disabled={!!(hostingConfirmModal && hostingConfirming === hostingConfirmModal.id)}
            onClick={async () => {
              if (!hostingConfirmModal) return
              await confirmHosting(hostingConfirmModal.id, hostingConfirmModal.amount)
              setHostingConfirmModal(null)
            }}
          >
            Confirm
          </Button>
        </>}>
        {hostingConfirmModal && (
          <>
            <p className="text-sm font-bold mb-1"><strong>{hostingConfirmModal.clientName}</strong></p>
            <p className="text-sm text-[#374151]">Amount: <strong>{fmtEuro(hostingConfirmModal.amount)}</strong></p>
          </>
        )}
      </Modal>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>{monthLabel} — Invoices</h1>
          <p>Confirm or defer planned invoices</p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setMonthOffset(o => o - 1)} aria-label="Previous month">&#8249;</Button>
          <span className="font-bold text-sm min-w-[120px] text-center">{monthLabel}</span>
          <Button variant="outline" size="sm" onClick={() => setMonthOffset(o => o + 1)} aria-label="Next month">&#8250;</Button>
          <Button variant="outline" size="sm" onClick={() => rStore.fetchByMonths([currentMonth])} disabled={rStore.loading} className="ml-2">
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="ml-2" onClick={() => setShowAddCost(true)}>+ Add Cost</Button>
          <Button size="sm" onClick={() => setShowAddInvoice(true)}>+ Add Invoice</Button>
        </div>
      </div>

      {/* ── Error banners ────────────────────────────────────────────────────── */}
      {(rStore.error || pStore.error) && (
        <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c] mx-7 mt-4 flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Failed to load data. Please check your connection.</span>
        </div>
      )}

      {/* ── Stats strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-4 px-6 pt-5">
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Planned this month</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtEuro(plannedTotal)}</div>
          <div className="text-xs text-muted-foreground mt-1">{invoiceRows.length + maintenanceRows.length + domainRows.length} invoice{invoiceRows.length + maintenanceRows.length + domainRows.length !== 1 ? 's' : ''} planned</div>
        </div>

        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Issued</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-primary">{fmtEuro(issuedTotal)}</div>
          <div className="text-xs text-muted-foreground mt-1">{issuedRows.length} invoice{issuedRows.length !== 1 ? 's' : ''}</div>
        </div>

        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Not yet issued</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#d97706]">{fmtEuro(notYetIssuedTotal)}</div>
          <div className="text-xs text-muted-foreground mt-1">{notYetIssuedRows.length} pending</div>
        </div>

        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Delta plan vs actual</div>
          <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${delta >= 0 ? 'text-primary' : 'text-[#dc2626]'}`}>
            {delta >= 0 ? '+' : ''}{fmtEuro(delta)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">issued minus planned</div>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 flex flex-col gap-6">

        {/* ── Invoice table ─────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2>Planned invoices — {monthLabel}</h2>
          </div>

          <div className="card">
            {isLoading ? (
              <div className="text-center px-5 py-12 text-muted-foreground">
                <span className="spinner" style={{ width: 26, height: 26, borderWidth: 3, borderTopColor: 'var(--navy)', borderColor: 'var(--c5)', display: 'inline-block', marginBottom: 12 }} />
                <div className="font-semibold mt-3">Loading invoices…</div>
              </div>
            ) : invoiceRows.length === 0 && maintenanceCRRows.length === 0 ? (
              <div className="text-center px-5 py-12">
                <div className="text-[28px] mb-2.5">🗂</div>
                <div className="font-bold text-[15px] text-[#374151] mb-1">
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
                    <th className="text-right">Planned</th>
                    <th className="text-right">Actual Amount</th>
                    <th>Status</th>
                    <th>Probability</th>
                    <th className="text-right">Actions</th>
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
                          <div className="flex items-center gap-1.5">
                            <div className="font-medium text-primary hover:underline cursor-pointer font-bold">
                              {displayName}
                            </div>
                            {isCRRow && <Badge variant="navy" className="text-[10px]">CR</Badge>}
                          </div>
                          {displaySub && (
                            <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                              {displaySub}
                            </div>
                          )}
                        </td>

                        <td>
                          <span className="text-xs text-muted-foreground">
                            {crTitle ?? row.notes ?? '—'}
                          </span>
                        </td>

                        <td className="text-right">
                          <span className="text-muted-foreground">
                            {row.planned_amount != null ? fmtEuro(row.planned_amount) : '—'}
                          </span>
                        </td>

                        <td className="text-right">
                          <ActualAmountCell row={row} />
                        </td>

                        <td>{statusBadge(row.status)}</td>

                        {/* Probability */}
                        <td>
                          {(row.probability != null && row.probability !== 100) ? (
                            <span className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full" style={{
                              background: probColors(row.probability).bg,
                              color: probColors(row.probability).text,
                              border: `1px solid ${probColors(row.probability).border}`,
                            }}>
                              {row.probability}% · {probLabel(row.probability)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="text-right">
                          <div className="flex gap-1.5 justify-end items-center">
                            {isPending && (
                              <>
                                <Button
                                  size="xs"
                                  onClick={() => openConfirmModal(row)}
                                  disabled={isUpdating}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => handleNotInvoiced(row)}
                                  disabled={isUpdating}
                                >
                                  Not Invoiced
                                </Button>
                              </>
                            )}
                            {!isPending && (
                              <span className="text-xs text-muted-foreground italic">
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
            <div className="flex items-center justify-between mb-3">
              <h2>Maintenance Invoices — {monthLabel}</h2>
            </div>
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Client</th>
                    <th className="text-right">Retainer</th>
                    <th className="text-right">Actual</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenanceRows.map(row => {
                    const isPending = row.status === 'planned'
                    return (
                      <tr key={row.id}>
                        <td className="font-bold text-sm">{row.maintenance?.name ?? '—'}</td>
                        <td className="text-[13px] text-[#374151]">{row.maintenance?.client?.name ?? '—'}</td>
                        <td className="text-right">
                          {(() => {
                            const linkedHosting = infraStore.hostingClients.find(h => h.maintenance_id === row.maintenance_id && h.cycle === 'monthly' && hostingActiveInMonth(h, currentMonth))
                            const total = (row.planned_amount ?? 0) + (linkedHosting?.amount ?? 0)
                            return <>
                              {fmtEuro(total)}
                              {linkedHosting && (
                                <div className="text-[10px] text-muted-foreground font-normal">
                                  {fmtEuro(row.planned_amount ?? 0)} + {fmtEuro(linkedHosting.amount)}
                                </div>
                              )}
                            </>
                          })()}
                        </td>
                        <td className="text-right">
                          <ActualAmountCell row={row} />
                        </td>
                        <td>{statusBadge(row.status)}</td>
                        <td className="text-right">
                          <div className="flex gap-1.5 justify-end">
                            {isPending && (
                              <>
                                <Button size="xs" onClick={() => openConfirmModal(row)}>Confirm</Button>
                                <Button variant="outline" size="xs" onClick={() => handleNotInvoiced(row)}>Not Invoiced</Button>
                              </>
                            )}
                            {!isPending && (
                              <span className="text-xs text-muted-foreground italic">
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
            <div className="flex items-center justify-between mb-3">
              <h2>Hosting Revenue — {monthLabel}</h2>
              <div className="flex gap-2 items-center">
                {batchSelectedHosting.size > 0 && (
                  <Button
                    size="sm"
                    onClick={() => confirmHostingBatch([...batchSelectedHosting])}
                    disabled={batchConfirmingHosting}
                  >
                    Confirm selected ({batchSelectedHosting.size})
                  </Button>
                )}
                {unconfirmedMonthlyHosting.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => confirmHostingBatch(unconfirmedMonthlyHosting.map(h => h.id))}
                    disabled={batchConfirmingHosting}
                  >
                    Confirm all ({unconfirmedMonthlyHosting.length})
                  </Button>
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
                    <th className="text-right">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyHosting.map(h => {
                    const confirmed = confirmedHostingIds.has(h.id)
                    const selected = batchSelectedHosting.has(h.id)
                    return (
                      <tr key={h.id}>
                        <td className="pl-3">
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
                              className="cursor-pointer w-3.5 h-3.5"
                            />
                          )}
                        </td>
                        <td>
                          <div className="font-bold text-sm">
                            {h.client?.name ?? '—'}
                          </div>
                        </td>
                        <td>
                          <span className="text-[13px] text-muted-foreground">
                            {h.description ?? '—'}
                          </span>
                        </td>
                        <td className="text-right">
                          <span className="font-bold tabular-nums">
                            {h.amount.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €<span className="font-normal text-muted-foreground text-xs">/mo</span>
                          </span>
                        </td>
                        <td className="text-right">
                          {confirmed ? (
                            <Badge variant="green">Issued</Badge>
                          ) : (
                            <Button
                              size="xs"
                              onClick={() => setHostingConfirmModal({ id: h.id, clientName: h.client?.name ?? '—', amount: h.amount })}
                            >
                              Confirm
                            </Button>
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
                          <div className="font-bold text-sm">
                            {h.client?.name ?? '—'}
                          </div>
                        </td>
                        <td>
                          <span className="text-[13px] text-muted-foreground">
                            {h.description ?? '—'}<span className="ml-1.5 text-[11px] text-muted-foreground">yearly</span>
                          </span>
                        </td>
                        <td className="text-right">
                          <span className="font-bold tabular-nums">
                            {(row.planned_amount ?? h.amount).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €<span className="font-normal text-muted-foreground text-xs">/yr</span>
                          </span>
                        </td>
                        <td className="text-right">
                          {confirmed ? (
                            <Badge variant="green">Issued</Badge>
                          ) : (
                            <Button
                              size="xs"
                              onClick={() => setHostingConfirmModal({ id: h.id, clientName: h.client?.name ?? '—', amount: row.planned_amount ?? h.amount })}
                            >
                              Confirm
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {yearlyHostingDue.map(h => (
                    <tr key={h.id}>
                      <td></td>
                      <td><div className="font-bold text-sm">{h.client?.name ?? '—'}</div></td>
                      <td><span className="text-[13px] text-muted-foreground">{h.description ?? '—'}<span className="ml-1.5 text-[11px] text-muted-foreground">yearly</span></span></td>
                      <td className="text-right">
                        <span className="font-bold tabular-nums">
                          {h.amount.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €<span className="font-normal text-muted-foreground text-xs">/yr</span>
                        </span>
                      </td>
                      <td className="text-right">
                        <Button size="xs" onClick={() => setHostingConfirmModal({ id: h.id, clientName: h.client?.name ?? '—', amount: h.amount })}>
                          Confirm
                        </Button>
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
            <div className="flex items-center justify-between mb-3">
              <h2>Domain Renewals — {monthLabel}</h2>
            </div>

            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Domains</th>
                    <th className="text-right">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {domainsDue.map(d => (
                    <tr key={`due-${d.id}`}>
                      <td>
                        <div className="font-bold text-sm">
                          {d.client?.name ?? '—'}
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <span className="text-xs text-[#374151] bg-gray-50 border border-border rounded px-[7px] py-0.5">
                            {d.domain_name}
                          </span>
                        </div>
                      </td>
                      <td className="text-right">
                        <span className="font-bold tabular-nums">
                          {fmtEuro(d.yearly_amount ?? 0)}
                        </span>
                      </td>
                      <td className="text-right">
                        <Button
                          size="xs"
                          onClick={() => confirmDomainDue(d.id, d.yearly_amount ?? 0)}
                          disabled={domainConfirming === d.id}
                        >
                          {domainConfirming === d.id ? 'Saving…' : 'Confirm'}
                        </Button>
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
                            <div className="font-bold text-sm">
                              {group.clientName}
                            </div>
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {group.rows.map(r => (
                                <span key={r.id} className="text-xs text-[#374151] bg-gray-50 border border-border rounded px-[7px] py-0.5">
                                  {r.domain?.domain_name ?? '—'}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="text-right">
                            <span className="font-bold tabular-nums">
                              {fmtEuro(total)}
                            </span>
                          </td>
                          <td className="text-right">
                            {allIssued ? (
                              <Badge variant="green">Issued</Badge>
                            ) : (
                              <div className="flex gap-1.5 justify-end">
                                <Button
                                  size="xs"
                                  onClick={async () => {
                                    for (const r of group.rows.filter(r => r.status === 'planned')) {
                                      await handleConfirm(r)
                                    }
                                  }}
                                  disabled={anyUpdating}
                                >
                                  {anyUpdating ? 'Saving…' : 'Confirm'}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="xs"
                                  onClick={() => {
                                    setDeferDomainGroup(group)
                                    setDeferDomainNote('')
                                    setDeferDomainMonth('')
                                  }}
                                  disabled={anyUpdating}
                                >
                                  Not Invoiced
                                </Button>
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
          <div className="flex items-center justify-between mb-3">
            <h2>Costs this month</h2>
          </div>

          <div className="card">
            {costRows.length === 0 ? (
              <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">
                No costs recorded this month.
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>PROJECT</th>
                    <th>DESCRIPTION</th>
                    <th className="text-right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {costRows.map(r => {
                    const proj = pStore.projects.find(p => p.id === r.project_id)
                    const maint = r.maintenance_id ? maintenanceRows.find(m => m.maintenance_id === r.maintenance_id) : null
                    return (
                      <tr key={r.id}>
                        <td className="text-[13px] text-[#374151]">
                          {proj?.name ?? (maint ? 'Maintenance' : <span className="text-muted-foreground">—</span>)}
                        </td>
                        <td className="text-[13px]">
                          {r.notes ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-right font-semibold text-[#dc2626] text-[13px]">
                          {r.actual_amount != null ? fmtEuro(r.actual_amount) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="bg-gray-50 border-t-2 border-border">
                    <td colSpan={2} className="font-bold text-xs text-muted-foreground tracking-[0.05em]">TOTAL COSTS</td>
                    <td className="text-right font-bold text-[#dc2626] text-sm">
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
