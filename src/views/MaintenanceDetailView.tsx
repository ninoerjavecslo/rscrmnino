import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMaintenancesStore } from '../stores/maintenances'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { RevenuePlanner, Maintenance, HostingClient } from '../lib/types'
import { Select } from '../components/Select'

function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return /^https?:\/\//i.test(url) ? url : undefined
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEuro(n: number) {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}
function fmtDate(d?: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function fmtMonth(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleString('en', { month: 'short', year: 'numeric' })
}

const STATUS_BADGE: Record<string, string> = {
  planned: 'badge-amber',
  issued:  'badge-blue',
  paid:    'badge-green',
  retainer:'badge-gray',
  cost:    'badge-red',
}

const MAINT_STATUS_BADGE: Record<string, string> = {
  active:    'badge-green',
  paused:    'badge-amber',
  cancelled: 'badge-red',
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ open, title, maxWidth = 520, onClose, children, footer }: {
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

// ── Edit form type ────────────────────────────────────────────────────────────

interface EditForm {
  name: string
  monthly_retainer: string
  hours_included: string
  help_requests_included: string
  contract_start: string
  contract_duration_months: string
  contract_url: string
  notes: string
  status: string
}

function computeContractEnd(start: string, months: number): string {
  if (!start || !months) return ''
  const d = new Date(start + 'T00:00:00')
  d.setMonth(d.getMonth() + months - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function MaintenanceDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const store = useMaintenancesStore()

  const [rpRows, setRpRows] = useState<RevenuePlanner[]>([])
  const [hosting, setHosting] = useState<HostingClient | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Edit maintenance modal
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState<EditForm | null>(null)

  // Inline status edit
  const [editingStatus, setEditingStatus] = useState(false)

  // Confirm invoice modal
  const [confirmRow, setConfirmRow] = useState<RevenuePlanner | null>(null)
  const [confirmActual, setConfirmActual] = useState('')
  const [confirmNote, setConfirmNote] = useState('')

  // Not billed modal
  const [notBilledRow, setNotBilledRow] = useState<RevenuePlanner | null>(null)
  const [notBilledReason, setNotBilledReason] = useState('')

  // Add cost modal
  const [showAddCost, setShowAddCost] = useState(false)
  const [costForm, setCostForm] = useState({ month: '', description: '', amount: '' })

  useEffect(() => {
    if (!store.maintenances.length) store.fetchAll()
  }, [])

  useEffect(() => {
    if (id) fetchRows()
  }, [id])

  async function fetchRows() {
    setLoading(true)
    const [rpRes, hostingRes] = await Promise.all([
      supabase.from('revenue_planner').select('*').eq('maintenance_id', id!).order('month'),
      supabase.from('hosting_clients').select('*').eq('maintenance_id', id!).maybeSingle(),
    ])
    if (!rpRes.error) setRpRows((rpRes.data ?? []) as RevenuePlanner[])
    setHosting((hostingRes.data as HostingClient) ?? null)
    setLoading(false)
  }

  const maint = store.maintenances.find(m => m.id === id)

  // Derived data
  const invoiceRows = rpRows.filter(r => r.status !== 'cost')
  const costRows    = rpRows.filter(r => r.status === 'cost')

  const totalInvoiced = invoiceRows
    .filter(r => r.status === 'paid' || r.status === 'issued')
    .reduce((s, r) => s + (r.actual_amount ?? 0), 0)
  const totalPlanned  = invoiceRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
  const extraBilled   = invoiceRows
    .filter(r => (r.status === 'paid' || r.status === 'issued') && (r.actual_amount ?? 0) > (r.planned_amount ?? 0))
    .reduce((s, r) => s + Math.max(0, (r.actual_amount ?? 0) - (r.planned_amount ?? 0)), 0)
  const totalCosts    = costRows.reduce((s, r) => s + (r.actual_amount ?? 0), 0)

  // ── Status update ───────────────────────────────────────────────────────────

  async function handleStatusChange(newStatus: string) {
    if (!maint) return
    try {
      await store.update(maint.id, { ...maint, status: newStatus as Maintenance['status'] })
      setEditingStatus(false)
      toast('success', 'Status updated')
    } catch {
      toast('error', 'Failed to update status')
    }
  }

  // ── Edit maintenance ────────────────────────────────────────────────────────

  function openEdit() {
    if (!maint) return
    const start = maint.contract_start
    const end   = maint.contract_end
    let duration = 12
    if (start && end) {
      const s = new Date(start + 'T00:00:00')
      const e = new Date(end   + 'T00:00:00')
      duration = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1
    }
    setEditForm({
      name:                   maint.name,
      monthly_retainer:       String(maint.monthly_retainer),
      hours_included:         String(maint.hours_included),
      help_requests_included: String(maint.help_requests_included),
      contract_start:         maint.contract_start?.slice(0, 7) ?? '',
      contract_duration_months: String(duration),
      contract_url:           maint.contract_url ?? '',
      notes:                  maint.notes ?? '',
      status:                 maint.status,
    })
    setShowEdit(true)
  }

  async function handleSaveEdit() {
    if (!maint || !editForm) return
    setSaving(true)
    try {
      const start = editForm.contract_start ? editForm.contract_start + '-01' : maint.contract_start
      const durationMonths = parseInt(editForm.contract_duration_months) || 12
      const end = start ? computeContractEnd(start, durationMonths) : null
      await store.update(maint.id, {
        name:                   editForm.name,
        client_id:              maint.client_id,
        monthly_retainer:       parseFloat(editForm.monthly_retainer) || 0,
        hours_included:         parseInt(editForm.hours_included) || 0,
        help_requests_included: parseInt(editForm.help_requests_included) || 0,
        contract_start:         start ?? maint.contract_start,
        contract_end:           end || null,
        contract_url:           editForm.contract_url || null,
        notes:                  editForm.notes || null,
        status:                 editForm.status as Maintenance['status'],
      })
      await fetchRows()
      setShowEdit(false)
      toast('success', 'Contract updated')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Confirm invoice ─────────────────────────────────────────────────────────

  function openConfirm(row: RevenuePlanner) {
    setConfirmRow(row)
    setConfirmActual(String(row.planned_amount ?? ''))
    setConfirmNote(row.notes ?? '')
  }

  async function handleConfirm() {
    if (!confirmRow) return
    setSaving(true)
    try {
      const actual = parseFloat(confirmActual) || (confirmRow.planned_amount ?? 0)
      const { error } = await supabase
        .from('revenue_planner')
        .update({ status: 'issued', actual_amount: actual, notes: confirmNote || confirmRow.notes })
        .eq('id', confirmRow.id)
      if (error) throw error
      await fetchRows()
      setConfirmRow(null)
      toast('success', 'Invoice confirmed')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Not billed ──────────────────────────────────────────────────────────────

  function openNotBilled(row: RevenuePlanner) {
    setNotBilledRow(row)
    setNotBilledReason(row.notes ?? '')
  }

  async function handleNotBilled() {
    if (!notBilledRow) return
    setSaving(true)
    try {
      await supabase
        .from('revenue_planner')
        .update({ status: 'retainer', actual_amount: 0, notes: notBilledReason || null })
        .eq('id', notBilledRow.id)
      await fetchRows()
      setNotBilledRow(null)
      toast('success', 'Marked as not billed')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Add cost ────────────────────────────────────────────────────────────────

  async function handleAddCost() {
    if (!costForm.month || !costForm.amount) return
    setSaving(true)
    try {
      await supabase.from('revenue_planner').insert({
        maintenance_id: id!,
        month:          costForm.month + '-01',
        planned_amount: null,
        actual_amount:  parseFloat(costForm.amount),
        status:         'cost',
        probability:    100,
        notes:          costForm.description || null,
      })
      await fetchRows()
      setCostForm({ month: '', description: '', amount: '' })
      setShowAddCost(false)
      toast('success', 'Cost added')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteCost(rowId: string) {
    try {
      await supabase.from('revenue_planner').delete().eq('id', rowId)
      await fetchRows()
      toast('success', 'Cost removed')
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!store.loading && !maint) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--c3)' }}>
        Contract not found. <button className="btn btn-ghost btn-sm" onClick={() => navigate('/maintenances')}>Back to Maintenances</button>
      </div>
    )
  }

  if (!maint) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--c4)' }}>Loading…</div>

  const daysUntilEnd = maint.contract_end
    ? Math.ceil((new Date(maint.contract_end).getTime() - Date.now()) / 86_400_000)
    : null
  const expiringSoon = daysUntilEnd !== null && daysUntilEnd <= 30 && daysUntilEnd >= 0

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => navigate('/maintenances')}>
              ← Maintenances
            </button>
          </div>
          <h1 style={{ marginBottom: 4 }}>{maint.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="table-link"
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}
              onClick={() => maint.client?.id && navigate(`/clients/${maint.client.id}`)}
            >
              {maint.client?.name ?? '—'}
            </span>
            {editingStatus ? (
              <Select
                value={maint.status}
                onChange={val => { handleStatusChange(val); setEditingStatus(false) }}
                options={[
                  { value: 'active',    label: 'Active' },
                  { value: 'paused',    label: 'Paused' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            ) : (
              <span
                className={`badge ${MAINT_STATUS_BADGE[maint.status] ?? 'badge-gray'}`}
                style={{ cursor: 'pointer' }}
                onClick={() => setEditingStatus(true)}
                title="Click to change status"
              >
                {maint.status.charAt(0).toUpperCase() + maint.status.slice(1)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={openEdit}>Edit contract</button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat-card" style={{ '--left-color': 'var(--green)' } as React.CSSProperties}>
          <div className="stat-card-label">TOTAL INVOICED</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>{fmtEuro(totalInvoiced)}</div>
          <div className="stat-card-sub">issued + paid</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--navy)' } as React.CSSProperties}>
          <div className="stat-card-label">RETAINER VALUE</div>
          <div className="stat-card-value">{fmtEuro(maint.monthly_retainer)}<span style={{ fontSize: 13, fontWeight: 400, color: 'var(--c3)' }}>/mo</span></div>
          <div className="stat-card-sub">{fmtDate(maint.contract_start)} → {maint.contract_end ? fmtDate(maint.contract_end) : 'open-ended'}</div>
        </div>
        <div className="stat-card" style={{ '--left-color': extraBilled > 0 ? 'var(--blue)' : 'var(--c5)' } as React.CSSProperties}>
          <div className="stat-card-label">EXTRA BILLED</div>
          <div className="stat-card-value" style={{ color: extraBilled > 0 ? 'var(--blue)' : 'var(--c4)' }}>
            {extraBilled > 0 ? fmtEuro(extraBilled) : '—'}
          </div>
          <div className="stat-card-sub">above retainer</div>
        </div>
        <div className="stat-card" style={{ '--left-color': totalCosts > 0 ? 'var(--red)' : 'var(--c5)' } as React.CSSProperties}>
          <div className="stat-card-label">TOTAL COSTS</div>
          <div className="stat-card-value" style={{ color: totalCosts > 0 ? 'var(--red)' : 'var(--c4)' }}>
            {totalCosts > 0 ? fmtEuro(totalCosts) : '—'}
          </div>
          <div className="stat-card-sub">project expenses</div>
        </div>
      </div>

      <div className="page-content">
        {/* Info card */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 32px', fontSize: 13 }}>
              <div>
                <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Monthly retainer</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--green)' }}>{fmtEuro(maint.monthly_retainer)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Hours / mo</div>
                <div style={{ fontWeight: 600 }}>{maint.hours_included}h</div>
              </div>
              <div>
                <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Requests / mo</div>
                <div style={{ fontWeight: 600 }}>{maint.help_requests_included}</div>
              </div>
              <div>
                <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Contract start</div>
                <div>{fmtDate(maint.contract_start)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Contract end</div>
                <div style={{ color: expiringSoon ? 'var(--red)' : undefined, fontWeight: expiringSoon ? 700 : 400 }}>
                  {maint.contract_end ? fmtDate(maint.contract_end) : 'Open-ended'}
                  {expiringSoon && <span style={{ marginLeft: 8, fontSize: 11 }}>({daysUntilEnd}d)</span>}
                </div>
              </div>
              {maint.contract_url && (
                <div>
                  <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Contract</div>
                  <a href={safeUrl(maint.contract_url)} target="_blank" rel="noreferrer" style={{ color: 'var(--navy)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    View contract
                  </a>
                </div>
              )}
              {maint.notes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Notes</div>
                  <div style={{ color: 'var(--c2)', whiteSpace: 'pre-wrap' }}>{maint.notes}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Hosting info */}
        {hosting && (
          <>
            <div className="section-bar" style={{ marginBottom: 10 }}>
              <h2>Hosting</h2>
              <span style={{ fontSize: 12, color: 'var(--c4)' }}>Billed together with this maintenance contract</span>
            </div>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 32px', fontSize: 13 }}>
                  <div>
                    <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Project #</div>
                    <div style={{ fontWeight: 600 }}>{hosting.project_pn || '—'}</div>
                  </div>
                  {hosting.description && (
                    <div>
                      <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Description</div>
                      <div>{hosting.description}</div>
                    </div>
                  )}
                  <div>
                    <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Amount</div>
                    <div style={{ fontWeight: 700 }}>
                      {fmtEuro(hosting.amount)}
                      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--c4)', marginLeft: 4 }}>/ {hosting.cycle}</span>
                    </div>
                  </div>
                  {hosting.contract_id && (
                    <div>
                      <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Contract / Order ID</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{hosting.contract_id}</div>
                    </div>
                  )}
                  {hosting.billing_since && (
                    <div>
                      <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Billing since</div>
                      <div>{fmtDate(hosting.billing_since)}</div>
                    </div>
                  )}
                  <div>
                    <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Status</div>
                    <span className={`badge ${hosting.status === 'active' ? 'badge-green' : hosting.status === 'cancelled' ? 'badge-red' : 'badge-amber'}`} style={{ textTransform: 'capitalize' }}>
                      {hosting.cancelled_from
                        ? `Cancelled / from ${new Date(hosting.cancelled_from + 'T00:00:00').toLocaleString('en', { month: 'short', year: 'numeric' })}`
                        : hosting.status}
                    </span>
                  </div>
                  {hosting.notes && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ color: 'var(--c4)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Notes</div>
                      <div style={{ color: 'var(--c2)' }}>{hosting.notes}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Invoice Plans */}
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Invoice Plans</h2>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          {loading ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>Loading…</div>
          ) : invoiceRows.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>No invoice rows yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>MONTH</th>
                  <th className="th-right" style={{ width: 110 }}>RETAINER</th>
                  <th className="th-right" style={{ width: 110 }}>ACTUAL</th>
                  <th className="th-right" style={{ width: 100 }}>EXTRA</th>
                  <th>NOTES</th>
                  <th style={{ width: 110 }}>STATUS</th>
                  <th className="th-right" style={{ width: 180 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {invoiceRows.map(row => {
                  const isPending   = row.status === 'planned'
                  const isNotBilled = row.status === 'retainer'
                  const isSettled   = row.status === 'paid' || row.status === 'issued'
                  const extra       = isSettled ? Math.max(0, (row.actual_amount ?? 0) - (row.planned_amount ?? 0)) : 0
                  return (
                    <tr key={row.id} style={{ background: isPending ? 'var(--amber-bg, #fffbf0)' : undefined }}>
                      <td style={{ fontWeight: 600 }}>{fmtMonth(row.month)}</td>
                      <td className="td-right text-mono">{fmtEuro(row.planned_amount ?? 0)}</td>
                      <td className="td-right text-mono" style={{ fontWeight: isSettled ? 700 : 400, color: isSettled ? 'var(--green)' : 'var(--c3)' }}>
                        {isSettled ? fmtEuro(row.actual_amount ?? 0) : '—'}
                      </td>
                      <td className="td-right text-mono" style={{ color: 'var(--blue)', fontWeight: extra > 0 ? 700 : 400 }}>
                        {extra > 0 ? `+${fmtEuro(extra)}` : <span style={{ color: 'var(--c5)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--c3)' }}>
                        {row.notes
                          ? <span style={{ color: isNotBilled ? 'var(--c4)' : extra > 0 ? 'var(--blue)' : 'var(--c3)' }}>{row.notes}</span>
                          : <span style={{ color: 'var(--c6)' }}>—</span>}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[row.status] ?? 'badge-gray'}`}>
                          {row.status === 'retainer' ? 'Not billed' : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                        </span>
                      </td>
                      <td className="td-right">
                        {isPending && (
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button className="btn btn-primary btn-xs" onClick={() => openConfirm(row)}>Confirm</button>
                            <button className="btn btn-secondary btn-xs" onClick={() => openNotBilled(row)}>Not billed</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                  <td style={{ fontSize: 10, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</td>
                  <td className="td-right text-mono" style={{ fontWeight: 700 }}>{fmtEuro(totalPlanned)}</td>
                  <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--green)' }}>{totalInvoiced > 0 ? fmtEuro(totalInvoiced) : '—'}</td>
                  <td className="td-right text-mono" style={{ color: 'var(--blue)', fontWeight: 700 }}>{extraBilled > 0 ? `+${fmtEuro(extraBilled)}` : '—'}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Costs */}
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Costs</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddCost(true)}>+ Add cost</button>
        </div>

        <div className="card">
          {costRows.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>No costs recorded.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Description</th>
                  <th className="th-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {costRows.map(row => (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 600 }}>{fmtMonth(row.month)}</td>
                    <td style={{ fontSize: 13, color: 'var(--c2)' }}>{row.notes ?? '—'}</td>
                    <td className="td-right text-mono" style={{ color: 'var(--red)', fontWeight: 700 }}>{fmtEuro(row.actual_amount ?? 0)}</td>
                    <td>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => handleDeleteCost(row.id)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ fontSize: 10, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total costs</td>
                  <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--red)' }}>{fmtEuro(totalCosts)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Edit Contract modal */}
      <Modal open={showEdit} title="Edit Contract" maxWidth={560} onClose={() => setShowEdit(false)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowEdit(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={saving}>{saving ? <span className="spinner" /> : null} Save</button>
        </>}>
        {editForm && (
          <div>
            <div className="form-row" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Contract name</label>
                <input value={editForm.name} onChange={e => setEditForm(f => f ? { ...f, name: e.target.value } : f)} placeholder="e.g. Vzdrževanje spletne strani" />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <Select
                  value={editForm.status}
                  onChange={val => setEditForm(f => f ? { ...f, status: val } : f)}
                  options={[
                    { value: 'active',    label: 'Active' },
                    { value: 'paused',    label: 'Paused' },
                    { value: 'cancelled', label: 'Cancelled' },
                  ]}
                />
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Monthly retainer (€)</label>
                <input type="number" value={editForm.monthly_retainer} onChange={e => setEditForm(f => f ? { ...f, monthly_retainer: e.target.value } : f)} placeholder="500" />
              </div>
              <div className="form-group">
                <label className="form-label">Hours / mo</label>
                <input type="number" value={editForm.hours_included} onChange={e => setEditForm(f => f ? { ...f, hours_included: e.target.value } : f)} placeholder="10" />
              </div>
              <div className="form-group">
                <label className="form-label">Requests / mo</label>
                <input type="number" value={editForm.help_requests_included} onChange={e => setEditForm(f => f ? { ...f, help_requests_included: e.target.value } : f)} placeholder="5" />
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Contract start</label>
                <input type="month" value={editForm.contract_start} onChange={e => setEditForm(f => f ? { ...f, contract_start: e.target.value } : f)} />
              </div>
              <div className="form-group">
                <label className="form-label">Duration (months)</label>
                <input type="number" value={editForm.contract_duration_months} onChange={e => setEditForm(f => f ? { ...f, contract_duration_months: e.target.value } : f)} placeholder="12" />
                {editForm.contract_start && editForm.contract_duration_months && (
                  <div className="form-hint">
                    Ends: {fmtMonth(computeContractEnd(editForm.contract_start + '-01', parseInt(editForm.contract_duration_months) || 12))}
                    {' · '}Total: {fmtEuro((parseInt(editForm.contract_duration_months) || 12) * (parseFloat(editForm.monthly_retainer) || 0))}
                  </div>
                )}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Contract URL <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
              <input value={editForm.contract_url} onChange={e => setEditForm(f => f ? { ...f, contract_url: e.target.value } : f)} placeholder="https://..." />
            </div>
            <div className="form-group">
              <label className="form-label">Notes <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
              <textarea value={editForm.notes} onChange={e => setEditForm(f => f ? { ...f, notes: e.target.value } : f)} rows={3} placeholder="Internal notes about this contract…" />
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm invoice modal */}
      <Modal open={!!confirmRow} title="Confirm Invoice" maxWidth={420} onClose={() => setConfirmRow(null)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setConfirmRow(null)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleConfirm} disabled={saving}>{saving ? <span className="spinner" /> : null} Confirm</button>
        </>}>
        {confirmRow && (
          <div>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--c2)' }}>
              <strong>{fmtMonth(confirmRow.month)}</strong> — retainer {fmtEuro(confirmRow.planned_amount ?? 0)}
            </p>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Actual amount (€)</label>
              <input type="number" value={confirmActual} onChange={e => setConfirmActual(e.target.value)} autoFocus />
              {parseFloat(confirmActual) > (confirmRow.planned_amount ?? 0) && (
                <div className="form-hint" style={{ color: 'var(--blue)' }}>
                  Extra above retainer: +{fmtEuro(parseFloat(confirmActual) - (confirmRow.planned_amount ?? 0))}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Note <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
              <input value={confirmNote} onChange={e => setConfirmNote(e.target.value)} placeholder="e.g. extra hours in March" />
            </div>
          </div>
        )}
      </Modal>

      {/* Not billed modal */}
      <Modal open={!!notBilledRow} title="Mark as Not Billed" maxWidth={400} onClose={() => setNotBilledRow(null)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setNotBilledRow(null)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleNotBilled} disabled={saving}>Confirm</button>
        </>}>
        {notBilledRow && (
          <div>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--c2)' }}>
              Mark <strong>{fmtMonth(notBilledRow.month)}</strong> as not billed. The row will remain in the plan with €0 actual.
            </p>
            <div className="form-group">
              <label className="form-label">Reason <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
              <input
                value={notBilledReason}
                onChange={e => setNotBilledReason(e.target.value)}
                placeholder="e.g. Client on holiday, agreement not to bill…"
                autoFocus
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Add cost modal */}
      <Modal open={showAddCost} title="Add Cost" maxWidth={400} onClose={() => setShowAddCost(false)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddCost(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleAddCost} disabled={!costForm.month || !costForm.amount || saving}>Add</button>
        </>}>
        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label">Month</label>
            <input type="month" value={costForm.month} onChange={e => setCostForm(f => ({ ...f, month: e.target.value }))} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Amount (€)</label>
            <input type="number" value={costForm.amount} onChange={e => setCostForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input value={costForm.description} onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. SSL certificate, plugin license…" />
        </div>
      </Modal>
    </div>
  )
}
