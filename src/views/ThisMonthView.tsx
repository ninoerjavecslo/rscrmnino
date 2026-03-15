import React, { useEffect, useRef, useState } from 'react'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useInfraStore } from '../stores/infrastructure'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { RevenuePlanner, Project, HostingClient } from '../lib/types'

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

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleString('en', { month: 'short', year: 'numeric' })
}

// ── Status helpers ─────────────────────────────────────────────────────────────

type PlannerStatus = RevenuePlanner['status']

function statusBadge(status: PlannerStatus): React.ReactElement {
  if (status === 'paid') return <span className="badge badge-green">Paid</span>
  if (status === 'issued') return <span className="badge badge-blue">Issued</span>
  if (status === 'deferred' || status === 'retainer') return <span className="badge badge-red">Not issued</span>
  return <span className="badge badge-amber">Not issued</span>
}

// ── Plan invoice inline form ───────────────────────────────────────────────────

interface PlanFormProps {
  project: Project
  month: string
  onSave: (amount: number) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function PlanForm({ project, month, onSave, onCancel, saving }: PlanFormProps) {
  const [amount, setAmount] = useState<string>(
    project.contract_value ? String(project.contract_value) : ''
  )
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (!isNaN(parsed) && parsed > 0) {
      await onSave(parsed)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
    >
      <span style={{ fontSize: 12, color: 'var(--c3)', fontWeight: 600, flexShrink: 0 }}>
        Plan {fmtMonthLabel(month)} for {project.name}:
      </span>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <span style={{
          position: 'absolute',
          left: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--c3)',
          fontSize: 13,
          pointerEvents: 'none',
        }}>€</span>
        <input
          ref={inputRef}
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0"
          min="0"
          step="any"
          style={{
            width: 110,
            padding: '6px 8px 6px 20px',
            border: '1.5px solid var(--navy)',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            outline: 'none',
          }}
          onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        />
      </div>
      <button
        type="submit"
        className="btn btn-primary btn-xs"
        disabled={saving || !amount}
      >
        {saving ? <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} /> : null}
        Save
      </button>
      <button type="button" className="btn btn-secondary btn-xs" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

// ── Actual amount cell (static display only) ────────────────────────────────

function ActualAmountCell({ row }: { row: RevenuePlanner }) {
  if (row.status === 'deferred' || row.status === 'retainer' || row.status === 'planned') {
    return <span style={{ color: 'var(--c5)' }}>—</span>
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

  // Month offset for navigation
  const [monthOffset, setMonthOffset] = useState(0)
  const currentMonth = getMonthStr(monthOffset)
  const monthLabel = fmtMonthLabel(currentMonth)

  // Local optimistic state: track actual_amount / status overrides for rows
  const [localOverrides, setLocalOverrides] = useState<
    Record<string, { actual_amount?: number; status?: PlannerStatus }>
  >({})

  // Plan form state: projectId → open or closed
  const [planFormOpen, setPlanFormOpen] = useState<string | null>(null)

  // Status update loading
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null)

  // Probability popover

  // Confirm invoice modal
  const [confirmModal, setConfirmModal] = useState<RevenuePlanner | null>(null)
  const [confirmActual, setConfirmActual] = useState('')
  const [confirmNote, setConfirmNote] = useState('')
  const [confirmSaving, setConfirmSaving] = useState(false)

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

  // Hosting confirmation
  const [hostingConfirming, setHostingConfirming] = useState<string | null>(null)

  // Fetch on mount and when month changes
  useEffect(() => {
    rStore.fetchByMonths([currentMonth])
    // Reset local overrides when month changes
    setLocalOverrides({})
    setPlanFormOpen(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth])

  useEffect(() => {
    if (pStore.projects.length === 0) pStore.fetchAll()
    if (cStore.clients.length === 0) cStore.fetchAll()
    infraStore.fetchAll()
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
    .filter(r => r.maintenance_id != null && r.domain_id == null)
    .reduce((s, r) => {
      const h = infraStore.hostingClients.find(h => h.maintenance_id === r.maintenance_id && h.cycle === 'monthly' && h.status === 'active')
      return s + (h?.amount ?? 0)
    }, 0)
  const standaloneHostingTotal = infraStore.hostingClients
    .filter(h => h.status === 'active' && h.cycle === 'monthly' && !h.maintenance_id)
    .reduce((s, h) => s + h.amount, 0)

  // Yearly hosting: look for revenue_planner rows this month with a yearly hosting client
  const yearlyHostingItems = rows
    .filter(r => r.hosting_client_id != null)
    .map(r => {
      const h = infraStore.hostingClients.find(h => h.id === r.hosting_client_id && h.cycle === 'yearly')
      return h ? { row: r, h } : null
    })
    .filter((x): x is { row: RevenuePlanner; h: HostingClient } => x != null)

  // Set of hosting_client_ids already confirmed (issued) this month in revenue_planner
  const confirmedHostingIds = new Set(
    rStore.rows
      .filter(r => r.hosting_client_id != null && r.month === currentMonth && (r.status === 'issued' || r.status === 'paid'))
      .map(r => r.hosting_client_id as string)
  )

  const yearlyHostingTotal = yearlyHostingItems.reduce((s, x) => s + (x.row.planned_amount ?? 0), 0)
  const plannedTotal = nonHostingRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0) + maintenanceHostingExtra + standaloneHostingTotal + yearlyHostingTotal

  const issuedRows = nonHostingRows.filter(r => r.status === 'issued' || r.status === 'paid')
  const confirmedStandaloneHostingTotal = infraStore.hostingClients
    .filter(h => h.status === 'active' && h.cycle === 'monthly' && !h.maintenance_id && confirmedHostingIds.has(h.id))
    .reduce((s, h) => s + h.amount, 0)
  const confirmedYearlyHostingTotal = yearlyHostingItems
    .filter(x => x.row.status === 'issued' || x.row.status === 'paid')
    .reduce((s, x) => s + (x.row.actual_amount ?? x.row.planned_amount ?? 0), 0)
  const issuedTotal = issuedRows.reduce((s, r) => s + (r.actual_amount ?? r.planned_amount ?? 0), 0) + confirmedStandaloneHostingTotal + confirmedYearlyHostingTotal

  const notYetIssuedRows = nonHostingRows.filter(r => r.status === 'planned' && r.domain_id == null)
  const notYetIssuedMaintHostingExtra = notYetIssuedRows
    .filter(r => r.maintenance_id != null)
    .reduce((s, r) => {
      const h = infraStore.hostingClients.find(h => h.maintenance_id === r.maintenance_id && h.cycle === 'monthly' && h.status === 'active')
      return s + (h?.amount ?? 0)
    }, 0)
  const notYetIssuedStandaloneHosting = infraStore.hostingClients
    .filter(h => h.status === 'active' && h.cycle === 'monthly' && !h.maintenance_id && !confirmedHostingIds.has(h.id))
    .reduce((s, h) => s + h.amount, 0)
  const notYetIssuedYearlyHosting = yearlyHostingItems
    .filter(x => x.row.status === 'planned')
    .reduce((s, x) => s + (x.row.planned_amount ?? 0), 0)
  const notYetIssuedTotal = notYetIssuedRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0) + notYetIssuedMaintHostingExtra + notYetIssuedStandaloneHosting + notYetIssuedYearlyHosting

  const delta = issuedTotal - plannedTotal

  // ── Active projects without a planner row this month ────────────────────────

  const activeProjects = pStore.projects.filter(p => p.status === 'active')
  const plannedProjectIds = new Set(rows.map(r => r.project_id))
  const unplannedProjects = activeProjects.filter(p => !plannedProjectIds.has(p.id))

  // ── Hosting revenue this month ───────────────────────────────────────────────

  const monthlyHosting = infraStore.hostingClients.filter(h =>
    h.status === 'active' && h.cycle === 'monthly' && !h.maintenance_id
  )

  // ── Row separation ────────────────────────────────────────────────────────────

  const domainRows = rows.filter(r => r.domain_id != null)
  const maintenanceRows = rows.filter(r => r.maintenance_id != null && r.domain_id == null)
  const costRows = rows.filter(r => r.status === 'cost')
  const invoiceRows = rows.filter(r => r.project_id != null && r.domain_id == null && r.maintenance_id == null && r.hosting_client_id == null && r.status !== 'cost')

  // ── Status update helpers ───────────────────────────────────────────────────

  function openConfirmModal(row: RevenuePlanner) {
    setConfirmModal(row)
    const linkedHosting = row.maintenance_id
      ? infraStore.hostingClients.find(h => h.maintenance_id === row.maintenance_id && h.cycle === 'monthly' && h.status === 'active')
      : undefined
    const total = (row.planned_amount ?? 0) + (linkedHosting?.amount ?? 0)
    setConfirmActual(String(total))
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
      toast('success', 'Invoice confirmed')
      setConfirmModal(null)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setConfirmSaving(false)
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

  // ── Plan invoice handler ────────────────────────────────────────────────────

  async function handlePlanInvoice(project: Project, amount: number) {
    const defaultProb = project.type === 'fixed' ? 100 : 75
    await rStore.upsert(project.id, currentMonth, amount, defaultProb)
    setPlanFormOpen(null)
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
              <div className="form-group">
                <label className="form-label">Move to month <span className="form-hint" style={{ display: 'inline' }}>optional — leave blank to just mark deferred</span></label>
                <input type="month" value={deferMonth} onChange={e => setDeferMonth(e.target.value)} />
              </div>
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
                {parseFloat(confirmActual) > (confirmModal.planned_amount ?? 0) && (
                  <div className="form-hint" style={{ color: 'var(--blue)' }}>
                    Extra above planned: +{fmtEuro(parseFloat(confirmActual) - (confirmModal.planned_amount ?? 0))}
                  </div>
                )}
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
          <div className="stat-card-sub">{rows.length} invoice{rows.length !== 1 ? 's' : ''} planned</div>
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
            ) : invoiceRows.length === 0 ? (
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
                  {invoiceRows.map(row => {
                    const isMaintenance = !!row.maintenance_id
                    const displayName = row.project?.name ?? row.maintenance?.name ?? '—'
                    const displaySub  = row.project?.pn ?? (isMaintenance ? row.maintenance?.client?.name : null)
                    const isUpdating  = statusUpdating === row.id
                    const isPending   = row.status === 'planned'
                    const isDeferred  = row.status === 'deferred' || row.status === 'retainer'

                    return (
                      <tr key={row.id} style={isDeferred ? { background: 'rgba(239,68,68,0.04)' } : undefined}>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--c0)', fontSize: 14 }} className="table-link">
                            {displayName}
                          </div>
                          {displaySub && (
                            <div style={{ fontSize: 11, color: 'var(--c4)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                              {displaySub}
                            </div>
                          )}
                        </td>

                        <td>
                          <span style={{ fontSize: 12, color: 'var(--c3)' }}>
                            {row.notes ?? '—'}
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
                            const linkedHosting = infraStore.hostingClients.find(h => h.maintenance_id === row.maintenance_id && h.cycle === 'monthly' && h.status === 'active')
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
        {(monthlyHosting.length > 0 || yearlyHostingItems.length > 0) && (
          <div>
            <div className="section-bar">
              <h2>Hosting Revenue — {monthLabel}</h2>
            </div>

            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Description</th>
                    <th className="th-right">Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyHosting.map(h => {
                    const confirmed = confirmedHostingIds.has(h.id)
                    return (
                      <tr key={h.id}>
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
                              onClick={() => confirmHosting(h.id, h.amount)}
                              disabled={hostingConfirming === h.id}
                            >
                              {hostingConfirming === h.id ? 'Saving…' : 'Confirm'}
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
                              onClick={() => confirmHosting(h.id, row.planned_amount ?? h.amount)}
                              disabled={hostingConfirming === h.id}
                            >
                              {hostingConfirming === h.id ? 'Saving…' : 'Confirm'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Domain renewals this month ────────────────────────────────────── */}
        {domainRows.length > 0 && (
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

        {/* ── Active projects with no invoice planned ───────────────────────── */}
        {unplannedProjects.length > 0 && (
          <div>
            <div className="section-bar" style={{ paddingBottom: 8 }}>
              <h2 style={{ color: 'var(--c3)', fontStyle: 'italic', fontSize: 13, fontWeight: 600 }}>
                Active — no invoice planned this month
              </h2>
            </div>

            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Client</th>
                    <th>Last invoiced</th>
                    <th className="th-right">Plan invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {unplannedProjects.map(project => {
                    const isOpen = planFormOpen === project.id
                    const clientId = project.client_id ?? project.client?.id
                    const cName = project.client?.name ?? clientName(clientId)

                    return (
                      <tr key={project.id}>
                        <td>
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c1)' }}>
                            {project.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--c4)', marginTop: 2 }}>
                            {project.pn}
                          </div>
                        </td>

                        <td>
                          <span style={{ color: 'var(--c2)', fontSize: 13 }}>
                            {cName}
                          </span>
                        </td>

                        <td>
                          <span className="text-muted" style={{ fontSize: 13 }}>
                            {fmtDate(project.end_date)}
                          </span>
                        </td>

                        <td className="td-right">
                          {isOpen ? (
                            <PlanForm
                              project={project}
                              month={currentMonth}
                              saving={rStore.saving}
                              onSave={amount => handlePlanInvoice(project, amount)}
                              onCancel={() => setPlanFormOpen(null)}
                            />
                          ) : (
                            <button
                              className="btn btn-secondary btn-xs"
                              onClick={() => setPlanFormOpen(project.id)}
                            >
                              + Plan invoice
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
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
