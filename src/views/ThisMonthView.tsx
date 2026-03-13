import React, { useEffect, useRef, useState } from 'react'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useInfraStore } from '../stores/infrastructure'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { RevenuePlanner, Project } from '../lib/types'

// ── Probability helpers ───────────────────────────────────────────────────────

const PROB_OPTIONS = [100, 75, 50, 25] as const

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
  return '€' + n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
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
  if (status === 'retainer') return <span className="badge badge-gray">Not Invoiced</span>
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

// ── Actual amount inline editor ────────────────────────────────────────────────

interface ActualAmountCellProps {
  row: RevenuePlanner
  onSaved: (id: string, actualAmount: number) => void
}

function ActualAmountCell({ row, onSaved }: ActualAmountCellProps) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isPending = row.status === 'planned'

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function startEdit() {
    setInput(row.actual_amount != null ? String(row.actual_amount) : String(row.planned_amount ?? ''))
    setEditing(true)
  }

  async function commit() {
    const parsed = parseFloat(input)
    if (!isNaN(parsed) && parsed >= 0) {
      setSaving(true)
      try {
        const { error } = await supabase
          .from('revenue_planner')
          .update({ actual_amount: parsed })
          .eq('id', row.id)
        if (!error) {
          onSaved(row.id, parsed)
        }
      } finally {
        setSaving(false)
        setEditing(false)
      }
    } else {
      setEditing(false)
    }
  }

  if (isPending && editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={input}
        onChange={e => setInput(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        disabled={saving}
        placeholder="0"
        style={{
          width: 110,
          border: '2px solid var(--navy)',
          borderRadius: 6,
          padding: '5px 8px',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
          outline: 'none',
          color: 'var(--navy)',
        }}
      />
    )
  }

  if (isPending) {
    return (
      <button
        onClick={startEdit}
        title="Click to enter actual invoice amount"
        style={{
          border: '1.5px dashed var(--c5)',
          borderRadius: 6,
          padding: '5px 10px',
          background: 'transparent',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 400,
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--c4)',
          whiteSpace: 'nowrap',
        }}
      >
        {row.actual_amount != null ? fmtEuro(row.actual_amount) : 'Enter amount'}
      </button>
    )
  }

  // issued or paid
  const amount = row.actual_amount ?? row.planned_amount ?? 0
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
  const [probPopover, setProbPopover] = useState<string | null>(null)

  // "Not Invoiced" defer modal
  const [deferRow, setDeferRow] = useState<RevenuePlanner | null>(null)
  const [deferNote, setDeferNote] = useState('')
  const [deferMonth, setDeferMonth] = useState('')
  const [deferSaving, setDeferSaving] = useState(false)

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

  const plannedTotal = rows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)

  const issuedRows = rows.filter(r => r.status === 'issued' || r.status === 'paid')
  const issuedTotal = issuedRows.reduce((s, r) => s + (r.actual_amount ?? r.planned_amount ?? 0), 0)

  const notYetIssuedRows = rows.filter(r => r.status === 'planned' || r.status === 'retainer')
  const notYetIssuedTotal = notYetIssuedRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)

  const delta = issuedTotal - plannedTotal

  // ── Active projects without a planner row this month ────────────────────────

  const activeProjects = pStore.projects.filter(p => p.status === 'active')
  const plannedProjectIds = new Set(rows.map(r => r.project_id))
  const unplannedProjects = activeProjects.filter(p => !plannedProjectIds.has(p.id))

  // ── Hosting revenue this month ───────────────────────────────────────────────

  // Build a set of project_pn values that already have a revenue_planner row this month
  const monthlyHosting = infraStore.hostingClients.filter(h =>
    h.status === 'active' && h.cycle === 'monthly'
  )

  // ── Status update helpers ───────────────────────────────────────────────────

  async function handleConfirm(row: RevenuePlanner) {
    setStatusUpdating(row.id)
    try {
      const { error } = await supabase
        .from('revenue_planner')
        .update({ status: 'issued' })
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
      // Mark current row as retainer (deferred)
      const { error } = await supabase
        .from('revenue_planner')
        .update({ status: 'retainer', notes: deferNote || deferRow.notes })
        .eq('id', deferRow.id)
      if (error) throw error
      setLocalOverrides(prev => ({ ...prev, [deferRow.id]: { ...prev[deferRow.id], status: 'retainer' } }))

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

  function handleActualSaved(id: string, actualAmount: number) {
    setLocalOverrides(prev => ({
      ...prev,
      [id]: { ...prev[id], actual_amount: actualAmount },
    }))
  }

  // ── Plan invoice handler ────────────────────────────────────────────────────

  async function handlePlanInvoice(project: Project, amount: number) {
    const defaultProb = project.type === 'fixed' ? 100 : 75
    await rStore.upsert(project.id, currentMonth, amount, defaultProb)
    setPlanFormOpen(null)
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
            ) : rows.length === 0 ? (
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
                    <th className="th-right">Planned</th>
                    <th className="th-right">Actual Amount</th>
                    <th>Status</th>
                    <th>Probability</th>
                    <th className="th-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const projectName = row.project?.name ?? '—'
                    const isUpdating = statusUpdating === row.id
                    const isPending = row.status === 'planned'

                    return (
                      <tr key={row.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--c0)', fontSize: 14 }} className="table-link">
                            {projectName}
                          </div>
                          {row.project?.pn && (
                            <div style={{ fontSize: 11, color: 'var(--c4)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                              {row.project.pn}
                            </div>
                          )}
                        </td>

                        <td className="td-right">
                          <span className="text-muted text-mono">
                            {row.planned_amount != null ? fmtEuro(row.planned_amount) : '—'}
                          </span>
                        </td>

                        <td className="td-right">
                          <ActualAmountCell row={row} onSaved={handleActualSaved} />
                        </td>

                        <td>{statusBadge(row.status)}</td>

                        {/* Probability */}
                        <td>
                          {isPending ? (
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              <span
                                onClick={() => setProbPopover(probPopover === row.id ? null : row.id)}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                                  cursor: 'pointer', userSelect: 'none',
                                  background: probColors(row.probability ?? 100).bg,
                                  color: probColors(row.probability ?? 100).text,
                                  border: `1px solid ${probColors(row.probability ?? 100).border}`,
                                }}
                              >
                                {row.probability ?? 100}% · {probLabel(row.probability ?? 100)}
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                              </span>
                              {probPopover === row.id && (
                                <div style={{
                                  position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 10,
                                  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
                                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 6,
                                  display: 'flex', flexDirection: 'column', gap: 3, minWidth: 140,
                                }}>
                                  {PROB_OPTIONS.map(p => (
                                    <button
                                      key={p}
                                      onClick={async () => {
                                        await rStore.updateProbability(row.id, p)
                                        setProbPopover(null)
                                      }}
                                      style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '5px 8px', borderRadius: 5, border: 'none', cursor: 'pointer',
                                        fontFamily: 'inherit', gap: 8,
                                        background: (row.probability ?? 100) === p ? probColors(p).bg : 'transparent',
                                        fontWeight: (row.probability ?? 100) === p ? 700 : 400,
                                      }}
                                    >
                                      <span style={{ fontSize: 12, color: probColors(p).text, fontWeight: 700 }}>{p}%</span>
                                      <span style={{ fontSize: 12, color: '#6b7280' }}>{probLabel(p)}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
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
                                  onClick={() => handleConfirm(row)}
                                  disabled={isUpdating}
                                  title="Mark as issued"
                                >
                                  {isUpdating ? (
                                    <span className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
                                  ) : '✓'}
                                  Confirm
                                </button>
                                <button
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => handleNotInvoiced(row)}
                                  disabled={isUpdating}
                                  title="Mark as not invoiced (retainer)"
                                >
                                  Not Invoiced
                                </button>
                              </>
                            )}
                            {!isPending && (
                              <span style={{ fontSize: 12, color: 'var(--c4)', fontStyle: 'italic' }}>
                                {row.status === 'paid' ? 'Paid' : row.status === 'retainer' ? 'Deferred' : 'Issued'}
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

        {/* ── Hosting revenue this month ────────────────────────────────────── */}
        {monthlyHosting.length > 0 && (
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
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyHosting.map(h => (
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
                          €{h.amount.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}<span style={{ fontWeight: 400, color: 'var(--c4)', fontSize: 12 }}>/mo</span>
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-green">Active</span>
                      </td>
                    </tr>
                  ))}
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

        {/* ── Costs this month (placeholder) ────────────────────────────────── */}
        <div>
          <div className="section-bar">
            <h2>Costs this month</h2>
            <button className="btn btn-secondary btn-sm">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add cost
            </button>
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Description</th>
                  <th className="th-right">Planned</th>
                  <th className="th-right">Actual</th>
                  <th className="th-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5}>
                    <div style={{
                      textAlign: 'center',
                      padding: '36px 20px',
                      color: 'var(--c4)',
                    }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: 0.4 }}>
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                      </svg>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--c3)', marginBottom: 4 }}>
                        No costs recorded this month
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--c4)' }}>
                        Click "+ Add cost" to track a project cost.
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}
