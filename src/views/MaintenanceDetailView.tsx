import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMaintenancesStore } from '../stores/maintenances'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { RevenuePlanner, Maintenance, HostingClient, ChangeRequest } from '../lib/types'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'

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
  planned:  'badge-amber',
  issued:   'badge-blue',
  paid:     'badge-green',
  retainer: 'badge-gray',
  cost:     'badge-red',
}

const MAINT_STATUS_BADGE: Record<string, string> = {
  active:    'badge-green',
  paused:    'badge-amber',
  cancelled: 'badge-red',
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

interface CRForm {
  title: string
  status: string
  amount: string
  description: string
  probability: string
  expected_month: string
}

const CR_PROB_OPTS = [
  { value: '25',  label: '25%' },
  { value: '50',  label: '50%' },
  { value: '100', label: '100%' },
]

function CRModalFields({ form, setForm, autoFocus }: {
  form: CRForm
  setForm: React.Dispatch<React.SetStateAction<CRForm>>
  autoFocus?: boolean
}) {
  return (
    <>
      <div className="form-group" style={{ marginBottom: 14 }}>
        <label className="form-label">Title</label>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Add CRM integration" autoFocus={autoFocus} />
      </div>
      <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div className="form-group">
          <label className="form-label">Status</label>
          <div style={{ display: 'flex', gap: 2, background: 'var(--c7)', borderRadius: 8, padding: 3 }}>
            {(['pending', 'approved'] as const).map(s => (
              <button key={s} type="button" onClick={() => setForm(f => ({ ...f, status: s }))}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', fontFamily: 'inherit',
                  background: form.status === s ? '#fff' : 'transparent',
                  color: form.status === s ? (s === 'approved' ? 'var(--green)' : 'var(--amber)') : 'var(--c4)',
                  fontWeight: form.status === s ? 700 : 500, fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: form.status === s ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}>
                {s === 'pending' ? 'Pending' : 'Approved'}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Probability</label>
          <Select value={form.probability} onChange={v => setForm(f => ({ ...f, probability: v }))} options={CR_PROB_OPTS} />
        </div>
      </div>
      <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div className="form-group">
          <label className="form-label">Amount (€) <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
          <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
        </div>
        <div className="form-group">
          <label className="form-label">Expected month</label>
          <input type="month" value={form.expected_month} onChange={e => setForm(f => ({ ...f, expected_month: e.target.value }))} />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 20 }}>
        <label className="form-label">Description <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
        <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this change involve?" style={{ width: '100%', resize: 'vertical' }} />
      </div>
    </>
  )
}

function computeContractEnd(start: string, months: number): string {
  if (!start || !months) return ''
  const d = new Date(start + 'T00:00:00')
  d.setMonth(d.getMonth() + months - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const defaultCRForm = (): CRForm => ({
  title: '', status: 'pending', amount: '', description: '', probability: '75', expected_month: '',
})

// ── Main view ─────────────────────────────────────────────────────────────────

export function MaintenanceDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const store = useMaintenancesStore()
  const crStore = useChangeRequestsStore()

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

  // Plan again / delete for not-billed rows
  const [planAgainRow, setPlanAgainRow] = useState<RevenuePlanner | null>(null)
  const [deleteNotBilledRow, setDeleteNotBilledRow] = useState<RevenuePlanner | null>(null)

  // Add cost modal
  const [showAddCost, setShowAddCost] = useState(false)
  const [costForm, setCostForm] = useState({ month: '', description: '', amount: '' })

  // Delete cost confirmation
  const [deleteCostRow, setDeleteCostRow] = useState<RevenuePlanner | null>(null)

  // Create invoice
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)
  const [createInvoiceMonth, setCreateInvoiceMonth] = useState('')
  const [createInvoiceAmount, setCreateInvoiceAmount] = useState('')

  // Change requests
  const [showAddCR, setShowAddCR] = useState(false)
  const [showEditCR, setShowEditCR] = useState(false)
  const [editCRTarget, setEditCRTarget] = useState<ChangeRequest | null>(null)
  const [deleteCRTarget, setDeleteCRTarget] = useState<ChangeRequest | null>(null)
  const [crForm, setCRForm] = useState<CRForm>(defaultCRForm())
  const [crSaving, setCRSaving] = useState(false)

  // Plan CR
  const [showPlanCR, setShowPlanCR] = useState(false)
  const [planCRTarget, setPlanCRTarget] = useState<ChangeRequest | null>(null)
  const [planCRMonth, setPlanCRMonth] = useState('')
  const [planCRAmount, setPlanCRAmount] = useState('')
  const [planCRSaving, setPlanCRSaving] = useState(false)

  useEffect(() => {
    if (!store.maintenances.length) store.fetchAll()
  }, [])

  useEffect(() => {
    if (id) {
      fetchRows()
      crStore.fetchByMaintenance(id)
    }
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

  // Invoice plan pagination + year filter
  const [planYear, setPlanYear] = useState<number>(new Date().getFullYear())
  const [planPage, setPlanPage] = useState(0)

  // Derived data
  const invoiceRows = rpRows.filter(r => r.status !== 'cost')
  const costRows    = rpRows.filter(r => r.status === 'cost')
  const notBilledRows = invoiceRows.filter(r => r.status === 'retainer')

  const totalInvoiced = invoiceRows
    .filter(r => r.status === 'paid' || r.status === 'issued')
    .reduce((s, r) => s + (r.actual_amount ?? 0), 0)
  const hostingMonthlyAmt = hosting?.cycle === 'monthly' ? (hosting.amount ?? 0) : 0
  const extraBilledRetainers = invoiceRows
    .filter(r => !r.notes?.startsWith('CR:') && (r.status === 'paid' || r.status === 'issued') && (r.actual_amount ?? 0) > (r.planned_amount ?? 0) + hostingMonthlyAmt)
    .reduce((s, r) => s + Math.max(0, (r.actual_amount ?? 0) - (r.planned_amount ?? 0) - hostingMonthlyAmt), 0)
  const extraBilledCRs = invoiceRows
    .filter(r => r.notes?.startsWith('CR:') && (r.status === 'paid' || r.status === 'issued'))
    .reduce((s, r) => s + (r.actual_amount ?? r.planned_amount ?? 0), 0)
  const extraBilled = extraBilledRetainers + extraBilledCRs
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
    const isCR = !!row.notes?.startsWith('CR:')
    const hostingAdd = (!isCR && hosting?.cycle === 'monthly') ? hosting.amount : 0
    setConfirmActual(String((row.planned_amount ?? 0) + hostingAdd))
    setConfirmNote(row.notes ?? '')
  }

  async function handleConfirm() {
    if (!confirmRow || !id) return
    setSaving(true)
    try {
      const actual = parseFloat(confirmActual) || (confirmRow.planned_amount ?? 0)
      const { error } = await supabase
        .from('revenue_planner')
        .update({ status: 'issued', actual_amount: actual, notes: confirmNote || confirmRow.notes })
        .eq('id', confirmRow.id)
      if (error) throw error

      // Auto-create approved CR for overage above retainer + hosting
      const extra = actual - (confirmRow.planned_amount ?? 0) - hostingMonthlyAmt
      if (extra > 0) {
        await crStore.add({
          maintenance_id: id,
          project_id: null,
          title: `Extra: ${fmtMonth(confirmRow.month)}`,
          description: confirmNote.trim() || null,
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

  // ── Plan again (reset not-billed row back to planned) ─────────────────────

  async function handlePlanAgain() {
    if (!planAgainRow) return
    setSaving(true)
    try {
      await supabase
        .from('revenue_planner')
        .update({ status: 'planned', actual_amount: null, notes: null })
        .eq('id', planAgainRow.id)
      await fetchRows()
      setPlanAgainRow(null)
      toast('success', 'Restored to planned')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete not-billed row ─────────────────────────────────────────────────

  async function handleDeleteNotBilled() {
    if (!deleteNotBilledRow) return
    setSaving(true)
    try {
      await supabase.from('revenue_planner').delete().eq('id', deleteNotBilledRow.id)
      await fetchRows()
      setDeleteNotBilledRow(null)
      toast('success', 'Row deleted')
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
      const { error: insertErr } = await supabase.from('revenue_planner').insert({
        maintenance_id: id!,
        month:          costForm.month + '-01',
        planned_amount: null,
        actual_amount:  parseFloat(costForm.amount),
        status:         'cost',
        probability:    100,
        notes:          costForm.description || null,
      })
      if (insertErr) throw insertErr
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

  // ── Change Requests ─────────────────────────────────────────────────────────

  async function saveAddCR() {
    if (!id || !crForm.title.trim()) return
    setCRSaving(true)
    try {
      await crStore.add({
        maintenance_id: id,
        project_id: null,
        title: crForm.title.trim(),
        status: crForm.status as ChangeRequest['status'],
        amount: crForm.amount ? parseFloat(crForm.amount) : null,
        description: crForm.description.trim() || null,
        probability: parseInt(crForm.probability),
        deal_type: 'one_time',
        expected_month: crForm.expected_month ? crForm.expected_month + '-01' : null,
        expected_end_month: null,
        monthly_schedule: null,
        notes: null,
      })
      setShowAddCR(false)
      setCRForm(defaultCRForm())
      toast('success', 'Change request added')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setCRSaving(false) }
  }

  function openEditCR(cr: ChangeRequest) {
    setEditCRTarget(cr)
    setCRForm({
      title: cr.title,
      status: cr.status === 'billed' ? 'approved' : cr.status,
      amount: cr.amount != null ? String(cr.amount) : '',
      description: cr.description ?? '',
      probability: cr.probability != null ? String(cr.probability) : '75',
      expected_month: cr.expected_month ? cr.expected_month.slice(0, 7) : '',
    })
    setShowEditCR(true)
  }

  async function saveEditCR() {
    if (!editCRTarget) return
    setCRSaving(true)
    try {
      await crStore.update(editCRTarget.id, {
        title: crForm.title.trim(),
        status: crForm.status as ChangeRequest['status'],
        amount: crForm.amount ? parseFloat(crForm.amount) : null,
        description: crForm.description.trim() || null,
        probability: parseInt(crForm.probability),
        expected_month: crForm.expected_month ? crForm.expected_month + '-01' : null,
      })
      setShowEditCR(false)
      setEditCRTarget(null)
      toast('success', 'Change request updated')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setCRSaving(false) }
  }

  async function saveEditCRAndPlan() {
    if (!editCRTarget || !id) return
    setCRSaving(true)
    const title = crForm.title.trim()
    const crNote = `CR: ${title}`
    try {
      await crStore.update(editCRTarget.id, {
        title,
        status: 'approved' as ChangeRequest['status'],
        amount: crForm.amount ? parseFloat(crForm.amount) : null,
        description: crForm.description.trim() || null,
        probability: parseInt(crForm.probability),
        expected_month: crForm.expected_month ? crForm.expected_month + '-01' : null,
      })
      if (crForm.expected_month) {
        const { error } = await supabase.from('revenue_planner').insert({
          maintenance_id: id,
          month: crForm.expected_month + '-01',
          notes: crNote,
          planned_amount: crForm.amount ? parseFloat(crForm.amount) : null,
          actual_amount: null,
          status: 'planned' as const,
          probability: 100,
        })
        if (error) { toast('error', error.message); return }
        // Upsert pipeline entry as won (planned = confirmed)
        if (maint?.client_id) {
          const { data: existing } = await supabase.from('pipeline_items')
            .select('id').eq('title', title).eq('client_id', maint.client_id).limit(1)
          if (existing && existing.length > 0) {
            await supabase.from('pipeline_items').update({ status: 'won' }).eq('id', existing[0].id)
          } else {
            await supabase.from('pipeline_items').insert({
              client_id: maint.client_id,
              title,
              description: crForm.description.trim() || null,
              estimated_amount: crForm.amount ? parseFloat(crForm.amount) : null,
              probability: parseInt(crForm.probability),
              deal_type: 'one_time' as const,
              expected_month: crForm.expected_month + '-01',
              status: 'won' as const,
              notes: null,
            })
          }
        }
        await fetchRows()
      }
      setShowEditCR(false)
      setEditCRTarget(null)
      toast('success', crForm.expected_month ? 'Saved & added to invoice plan + pipeline' : 'Change request updated')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setCRSaving(false) }
  }

  function openPlanCR(cr: ChangeRequest) {
    setPlanCRTarget(cr)
    const defaultMonth = cr.expected_month
      ? cr.expected_month.slice(0, 7)
      : (() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` })()
    setPlanCRMonth(defaultMonth)
    setPlanCRAmount(cr.amount != null ? String(cr.amount) : '')
    setShowPlanCR(true)
  }

  async function savePlanCR() {
    if (!id || !planCRTarget || !planCRMonth) return
    setPlanCRSaving(true)
    try {
      const { error } = await supabase.from('revenue_planner').insert({
        maintenance_id: id,
        month: planCRMonth + '-01',
        notes: `CR: ${planCRTarget.title}`,
        planned_amount: planCRAmount ? Number(planCRAmount) : null,
        actual_amount: null,
        status: 'planned' as const,
        probability: 100,
      })
      if (error) { toast('error', error.message); return }
      // Upsert pipeline entry as won (planned = confirmed)
      if (maint?.client_id) {
        const { data: existing } = await supabase.from('pipeline_items')
          .select('id').eq('title', planCRTarget.title).eq('client_id', maint.client_id).limit(1)
        if (existing && existing.length > 0) {
          await supabase.from('pipeline_items').update({ status: 'won' }).eq('id', existing[0].id)
        } else {
          await supabase.from('pipeline_items').insert({
            client_id: maint.client_id,
            title: planCRTarget.title,
            description: planCRTarget.description ?? null,
            estimated_amount: planCRAmount ? Number(planCRAmount) : (planCRTarget.amount ?? null),
            probability: planCRTarget.probability ?? 100,
            deal_type: planCRTarget.deal_type ?? 'one_time',
            expected_month: planCRMonth + '-01',
            status: 'won' as const,
            notes: null,
          })
        }
      }
      await fetchRows()
      toast('success', 'Added to Invoice Plan & Pipeline')
      setShowPlanCR(false)
      setPlanCRTarget(null)
      setPlanCRAmount('')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setPlanCRSaving(false) }
  }

  async function deleteCR(cr: ChangeRequest) {
    try {
      await crStore.remove(cr.id)
      setDeleteCRTarget(null)
      toast('success', 'Change request deleted')
    } catch (e) { toast('error', (e as Error).message) }
  }

  // ── Create invoice row ──────────────────────────────────────────────────────

  async function handleCreateInvoice() {
    if (!createInvoiceMonth || !id) return
    setSaving(true)
    try {
      const amount = parseFloat(createInvoiceAmount) || (maint?.monthly_retainer ?? 0)
      const { error } = await supabase.from('revenue_planner').insert({
        maintenance_id: id,
        month: createInvoiceMonth + '-01',
        planned_amount: amount,
        actual_amount: null,
        status: 'planned' as const,
        probability: 100,
        notes: null,
      })
      if (error) throw error
      await fetchRows()
      setShowCreateInvoice(false)
      setCreateInvoiceMonth('')
      setCreateInvoiceAmount('')
      toast('success', 'Invoice row added to plan')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setSaving(false) }
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

  const maintenanceCRs = crStore.maintenanceCRs

  return (
    <div>
      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div className="page-header" style={{ alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <h1 style={{ margin: 0 }}>{maint.name}</h1>
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
                style={{ cursor: 'pointer', fontSize: 11 }}
                onClick={() => setEditingStatus(true)}
                title="Click to change status"
              >
                {maint.status.toUpperCase()}
              </span>
            )}
            {expiringSoon && (
              <span style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: 'var(--red)' }}>
                ⚠ Expires in {daysUntilEnd}d
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--c3)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Contract Period: {fmtDate(maint.contract_start)} — {maint.contract_end ? fmtDate(maint.contract_end) : 'Open-ended'}
            {maint.contract_url && (
              <>
                <span style={{ color: 'var(--c5)' }}>·</span>
                <a href={safeUrl(maint.contract_url)} target="_blank" rel="noreferrer" style={{ color: 'var(--navy)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  View contract
                </a>
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={openEdit}>Edit Contract</button>
        </div>
      </div>

      {/* ── KPI cards + terms section (padded to match page-header/page-content) */}
      <div style={{ padding: '0 28px 20px' }}>

      {/* ── KPI cards ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
        {/* Total Invoiced */}
        <div className="card">
          <div className="card-body" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c3)' }}>Total Invoiced</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Manrope, sans-serif', color: totalInvoiced > 0 ? 'var(--green)' : 'var(--c1)', marginBottom: 4 }}>{fmtEuro(totalInvoiced)}</div>
            <div style={{ fontSize: 11, color: 'var(--c4)' }}>{totalInvoiced > 0 ? 'issued + paid' : 'No invoices issued yet'}</div>
          </div>
        </div>

        {/* Total / Mo */}
        <div className="card">
          <div className="card-body" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c3)' }}>{hosting ? 'Total / Mo (Incl. Hosting)' : 'Monthly Retainer'}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Manrope, sans-serif', color: 'var(--c1)', marginBottom: 4 }}>
              {fmtEuro(maint.monthly_retainer + (hosting?.cycle === 'monthly' ? hosting.amount : 0))}
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--c4)', marginLeft: 2 }}>/mo</span>
            </div>
            <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>→ {hosting ? 'Incl. Hosting' : 'Fixed Monthly'}</div>
          </div>
        </div>

        {/* Extra Billed */}
        <div className="card">
          <div className="card-body" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c3)' }}>Extra Billed</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Manrope, sans-serif', color: extraBilled > 0 ? 'var(--blue)' : 'var(--c1)', marginBottom: 4 }}>{fmtEuro(extraBilled)}</div>
            <div style={{ fontSize: 11, color: 'var(--c4)' }}>{extraBilled > 0 ? 'above retainer' : 'No extra items added'}</div>
          </div>
        </div>

        {/* Total Costs */}
        <div className="card">
          <div className="card-body" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c3)' }}>Total Costs</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Manrope, sans-serif', color: totalCosts > 0 ? 'var(--red)' : 'var(--c1)', marginBottom: 4 }}>{fmtEuro(totalCosts)}</div>
            <div style={{ fontSize: 11, color: 'var(--c4)' }}>{totalCosts > 0 ? 'project expenses' : 'Tracking cumulative spend'}</div>
          </div>
        </div>
      </div>

      {/* ── Maintenance Terms + Hosting (two-column) ──────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: hosting ? '1fr 280px' : '1fr', gap: 16, marginBottom: 20, minWidth: 0 }}>
        {/* Maintenance Terms card */}
        <div className="card">
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Maintenance Terms</h2>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--c4)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            {/* Metric chips */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
              <div style={{ background: 'var(--c7)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--c2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}><circle cx="12" cy="12" r="10"/><path d="M14.31 8a4 4 0 0 0-4.62 0C8.01 9.06 8 11 8 12s.01 2.94 1.69 4a4 4 0 0 0 4.62 0"/><line x1="12" y1="6" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="18"/></svg>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c3)', marginBottom: 4 }}>Monthly Total</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Manrope, sans-serif', color: 'var(--c0)' }}>
                  {fmtEuro(maint.monthly_retainer)}
                </div>
              </div>
              <div style={{ background: 'var(--c7)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--c2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c3)', marginBottom: 4 }}>Hours / Mo</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Manrope, sans-serif', color: 'var(--c0)' }}>{maint.hours_included}h</div>
              </div>
              <div style={{ background: 'var(--c7)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--c2)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c3)', marginBottom: 4 }}>Requests / Mo</div>
                <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Manrope, sans-serif', color: 'var(--c0)' }}>{maint.help_requests_included}</div>
              </div>
            </div>

            {/* Contract Details */}
            <div style={{ borderTop: '1px solid var(--c6)', paddingTop: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--c1)', marginBottom: 10 }}>Contract Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--c3)' }}>Client Name</span>
                  <span
                    style={{ fontWeight: 700, color: 'var(--navy)', cursor: 'pointer' }}
                    onClick={() => maint.client?.id && navigate(`/clients/${maint.client.id}`)}
                  >{maint.client?.name ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--c3)' }}>Contract Start</span>
                  <span style={{ fontWeight: 700 }}>{fmtDate(maint.contract_start)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--c3)' }}>Contract End</span>
                  <span style={{ fontWeight: 700, color: expiringSoon ? 'var(--red)' : undefined }}>
                    {maint.contract_end ? fmtDate(maint.contract_end) : 'Open-ended'}
                  </span>
                </div>
                {maint.notes && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, alignItems: 'flex-start', gap: 16 }}>
                    <span style={{ color: 'var(--c3)', flexShrink: 0 }}>Notes</span>
                    <span style={{ fontWeight: 500, color: 'var(--c2)', textAlign: 'right' }}>{maint.notes}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Hosting Attachment card */}
        {hosting && (
          <div style={{ background: 'linear-gradient(145deg, #4f46e5 0%, #3b82f6 100%)', borderRadius: 12, padding: '20px 22px', color: '#fff', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Hosting Attachment</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>Active Project</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: 'Manrope, sans-serif', marginBottom: 4 }}>
                {hosting.description || (hosting.project_pn ? `Project #${hosting.project_pn}` : '—')}
              </div>
              {hosting.project_pn && (
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace' }}>PN #{hosting.project_pn}</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>Service Amount</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Manrope, sans-serif' }}>
                  {fmtEuro(hosting.amount)}
                  <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>/ {hosting.cycle}</span>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: 12 }}
                  onClick={() => navigate('/infrastructure')}
                >
                  Manage
                </button>
              </div>
            </div>

            {(hosting.billing_since || hosting.contract_id) && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {hosting.billing_since && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>Billing since</span>
                    <span style={{ fontWeight: 600 }}>{fmtDate(hosting.billing_since)}</span>
                  </div>
                )}
                {hosting.contract_id && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>Contract ID</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{hosting.contract_id}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      </div>{/* end padded wrapper */}

      <div className="page-content">

        {/* Not-billed alert */}
        {notBilledRows.length > 0 && (
          <div className="alert alert-amber" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 13 }}>
              <strong>{notBilledRows.length} month{notBilledRows.length > 1 ? 's' : ''} not billed:</strong>{' '}
              {notBilledRows.map(r => fmtMonth(r.month)).join(', ')}
              <span style={{ color: 'var(--c3)', marginLeft: 8, fontSize: 12 }}>
                — {fmtEuro(notBilledRows.reduce((s, r) => s + (r.planned_amount ?? 0) + hostingMonthlyAmt, 0))} not collected
              </span>
            </div>
          </div>
        )}

        {/* Invoice Plans */}
        {(() => {
          const PAGE_SIZE = 12
          const planYears = [...new Set(invoiceRows.map(r => parseInt(r.month.slice(0, 4))))].sort()
          const availYears = planYears.length > 0 ? planYears : [new Date().getFullYear()]
          const currentYear = availYears.includes(planYear) ? planYear : availYears[availYears.length - 1]
          const yearRows = invoiceRows.filter(r => parseInt(r.month.slice(0, 4)) === currentYear)
          const totalPages = Math.ceil(yearRows.length / PAGE_SIZE)
          const page = Math.min(planPage, Math.max(0, totalPages - 1))
          const pagedRows = yearRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
          const yearInvoiced = yearRows.filter(r => r.status === 'paid' || r.status === 'issued').reduce((s, r) => s + (r.actual_amount ?? 0), 0)
          const yearPlanned = yearRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
          const yearExtra = yearRows.filter(r => r.status === 'paid' || r.status === 'issued').reduce((s, r) => s + Math.max(0, (r.actual_amount ?? 0) - (r.planned_amount ?? 0) - hostingMonthlyAmt), 0)
          const yearNotBilled = yearRows.filter(r => r.status === 'retainer').length

          return (
            <>
              <div className="section-bar" style={{ marginBottom: 10 }}>
                <h2>
                  Invoice Plans
                  {yearNotBilled > 0 && (
                    <span className="badge badge-amber" style={{ marginLeft: 8, fontSize: 11 }}>
                      {yearNotBilled} not billed
                    </span>
                  )}
                </h2>
                <div style={{ display: 'flex', gap: 4 }}>
                  {availYears.map(y => (
                    <button
                      key={y}
                      className={`btn btn-xs ${currentYear === y ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => { setPlanYear(y); setPlanPage(0) }}
                    >{y}</button>
                  ))}
                </div>
              </div>

              <div className="card" style={{ marginBottom: 20 }}>
                {loading ? (
                  <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>Loading…</div>
                ) : yearRows.length === 0 ? (
                  <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>No invoice rows for {currentYear}.</div>
                ) : (
                  <>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 120 }}>MONTH</th>
                          <th style={{ width: 120 }}>TYPE</th>
                          <th className="th-right" style={{ width: 110 }}>AMOUNT</th>
                          <th className="th-right" style={{ width: 110 }}>ACTUAL</th>
                          <th className="th-right" style={{ width: 100 }}>EXTRA</th>
                          <th>NOTES</th>
                          <th style={{ width: 110 }}>STATUS</th>
                          <th className="th-right" style={{ width: 200 }}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedRows.map(row => {
                          const isPending   = row.status === 'planned'
                          const isNotBilled = row.status === 'retainer'
                          const isSettled   = row.status === 'paid' || row.status === 'issued'
                          const isCR        = !!row.notes?.startsWith('CR:')
                          const rowHosting  = isCR ? 0 : hostingMonthlyAmt
                          const extra       = isSettled ? Math.max(0, (row.actual_amount ?? 0) - (row.planned_amount ?? 0) - rowHosting) : 0
                          return (
                            <tr key={row.id} style={{ background: isNotBilled ? 'rgba(255, 193, 7, 0.06)' : isPending ? 'var(--amber-bg, #fffbf0)' : undefined }}>
                              <td style={{ fontWeight: 600 }}>{fmtMonth(row.month)}</td>
                              <td>
                                {isCR
                                  ? <span className="badge badge-navy" style={{ fontSize: 10 }}>Change Request</span>
                                  : <span style={{ fontSize: 12, color: 'var(--c4)' }}>Retainer</span>}
                              </td>
                              <td className="td-right text-mono">
                                {fmtEuro((row.planned_amount ?? 0) + (isCR ? 0 : (hosting?.cycle === 'monthly' ? hosting.amount : 0)))}
                                {!isCR && hosting?.cycle === 'monthly' && (
                                  <div style={{ fontSize: 10, color: 'var(--c4)', fontWeight: 400 }}>
                                    {fmtEuro(row.planned_amount ?? 0)} + {fmtEuro(hosting.amount)}
                                  </div>
                                )}
                              </td>
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
                                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                  {isPending && (
                                    <>
                                      <button className="btn btn-primary btn-xs" onClick={() => openConfirm(row)}>Confirm</button>
                                      <button className="btn btn-secondary btn-xs" onClick={() => openNotBilled(row)}>Not billed</button>
                                    </>
                                  )}
                                  {isNotBilled && (
                                    <>
                                      <button className="btn btn-secondary btn-xs" onClick={() => setPlanAgainRow(row)} style={{ color: 'var(--navy)' }}>Plan again</button>
                                      <button className="btn btn-ghost btn-xs" onClick={() => setDeleteNotBilledRow(row)} style={{ color: 'var(--red)' }}>Delete</button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                          <td colSpan={2} style={{ fontSize: 10, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{currentYear} total</td>
                          <td className="td-right text-mono" style={{ fontWeight: 700 }}>
                            {fmtEuro(yearPlanned + (hosting?.cycle === 'monthly' ? hosting.amount * yearRows.filter(r => !r.notes?.startsWith('CR:')).length : 0))}
                          </td>
                          <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--green)' }}>{yearInvoiced > 0 ? fmtEuro(yearInvoiced) : '—'}</td>
                          <td className="td-right text-mono" style={{ color: 'var(--blue)', fontWeight: 700 }}>{yearExtra > 0 ? `+${fmtEuro(yearExtra)}` : '—'}</td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                    {totalPages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px', borderTop: '1px solid var(--c6)', background: 'var(--c7)' }}>
                        <span style={{ fontSize: 12, color: 'var(--c3)' }}>
                          Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, yearRows.length)} of {yearRows.length}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-secondary btn-xs" onClick={() => setPlanPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prev</button>
                          {Array.from({ length: totalPages }, (_, i) => (
                            <button key={i} className={`btn btn-xs ${page === i ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPlanPage(i)}>{i + 1}</button>
                          ))}
                          <button className="btn btn-secondary btn-xs" onClick={() => setPlanPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>Next →</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )
        })()}

        {/* Change Requests */}
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Change Requests
            {maintenanceCRs.length > 0 && (
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--c4)', marginLeft: 8 }}>
                {fmtEuro(maintenanceCRs.reduce((s, cr) => s + (cr.amount ?? 0), 0))} total
              </span>
            )}
          </h2>
          <button className="btn btn-secondary btn-sm" onClick={() => { setCRForm(defaultCRForm()); setShowAddCR(true) }}>
            + Add change request
          </button>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          {maintenanceCRs.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              No change requests yet.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 160 }}>STATUS</th>
                  <th>TITLE</th>
                  <th>DESCRIPTION</th>
                  <th className="th-right" style={{ width: 100 }}>AMOUNT</th>
                  <th style={{ width: 70 }}>PROB.</th>
                  <th style={{ width: 100 }}>EXPECTED</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {maintenanceCRs.map(cr => {
                  const isAuto = cr.notes === 'auto_extra'
                  const isPending = cr.status === 'pending'
                  const isApproved = cr.status === 'approved'
                  const alreadyPlanned = invoiceRows.some(r => r.notes?.includes(`CR: ${cr.title}`) && r.status !== 'deferred')
                  const canPlan = !isAuto && isApproved && cr.amount != null && cr.amount > 0 && !alreadyPlanned
                  const crStatusBadge = cr.status === 'billed'
                    ? <span className="badge badge-navy">Billed</span>
                    : isApproved
                      ? <span className="badge badge-green">Approved</span>
                      : <span className="badge badge-amber">Pending</span>
                  return (
                    <tr key={cr.id}>
                      <td>
                        {crStatusBadge}
                        {isAuto && <span className="badge badge-gray" style={{ marginLeft: 4, fontSize: 10 }}>Auto</span>}
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--c0)' }}>{cr.title}</td>
                      <td style={{ fontSize: 12, color: 'var(--c3)', maxWidth: 200 }}>{cr.description ?? <span style={{ color: 'var(--c5)' }}>—</span>}</td>
                      <td className="td-right text-mono" style={{ fontSize: 13, color: 'var(--c2)' }}>
                        {cr.amount != null ? fmtEuro(cr.amount) : <span style={{ color: 'var(--c5)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--c3)' }}>
                        {cr.probability != null ? `${cr.probability}%` : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--c3)' }}>
                        {cr.expected_month ? fmtMonth(cr.expected_month) : <span style={{ color: 'var(--c5)' }}>—</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {isPending && !isAuto && (
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={async () => {
                                await crStore.update(cr.id, { status: 'approved' })
                                if (maint?.client_id) {
                                  await supabase.from('pipeline_items')
                                    .update({ status: 'won' })
                                    .eq('title', cr.title)
                                    .eq('client_id', maint.client_id)
                                }
                                toast('success', 'Approved')
                              }}
                            >
                              Approve
                            </button>
                          )}
                          {canPlan && (
                            <button className="btn btn-secondary btn-xs" onClick={() => openPlanCR(cr)}>
                              + Plan Invoice
                            </button>
                          )}
                          {isPending && !isAuto && (
                            <button className="btn btn-secondary btn-xs" onClick={() => openEditCR(cr)}>Edit</button>
                          )}
                          {!isAuto && !alreadyPlanned && (
                            <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => setDeleteCRTarget(cr)}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                  <td colSpan={3} style={{ fontSize: 10, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total extra billed</td>
                  <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--blue)' }}>
                    {fmtEuro(maintenanceCRs.reduce((s, cr) => s + (cr.amount ?? 0), 0))}
                  </td>
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
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => setDeleteCostRow(row)}>Remove</button>
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

      {/* Create Invoice modal */}
      <Modal open={showCreateInvoice} title="Create Invoice" maxWidth={380} onClose={() => setShowCreateInvoice(false)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowCreateInvoice(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleCreateInvoice} disabled={saving || !createInvoiceMonth}>
            {saving ? <span className="spinner" /> : null} Add to Plan
          </button>
        </>}>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Month</label>
          <input type="month" value={createInvoiceMonth} onChange={e => setCreateInvoiceMonth(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Amount (€)</label>
          <input type="number" value={createInvoiceAmount} onChange={e => setCreateInvoiceAmount(e.target.value)} placeholder={String(maint.monthly_retainer)} />
          <div className="form-hint">Defaults to monthly retainer ({fmtEuro(maint.monthly_retainer)})</div>
        </div>
      </Modal>

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
                <div style={{ height: 42, display: 'flex', alignItems: 'center', padding: '0 12px', background: 'var(--c7)', border: '1px solid var(--c6)', borderRadius: 8, fontSize: 14, fontWeight: 600, color: 'var(--c1)' }}>
                  {editForm.monthly_retainer} €
                </div>
                <div className="form-hint">Contact support to change retainer amount</div>
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
                <div style={{ height: 42, display: 'flex', alignItems: 'center', padding: '0 12px', background: 'var(--c7)', border: '1px solid var(--c6)', borderRadius: 8, fontSize: 14, color: 'var(--c1)' }}>
                  {editForm.contract_start ? fmtMonth(editForm.contract_start + '-01') : '—'}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Duration (months)</label>
                <div style={{ height: 42, display: 'flex', alignItems: 'center', padding: '0 12px', background: 'var(--c7)', border: '1px solid var(--c6)', borderRadius: 8, fontSize: 14, color: 'var(--c1)' }}>
                  {editForm.contract_duration_months} months
                </div>
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
              {hosting?.cycle === 'monthly' && (
                <span style={{ color: 'var(--c4)', fontSize: 13 }}> + hosting {fmtEuro(hosting.amount)} = <strong>{fmtEuro((confirmRow.planned_amount ?? 0) + hosting.amount)}</strong></span>
              )}
            </p>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Actual amount (€)</label>
              <input type="number" value={confirmActual} onChange={e => setConfirmActual(e.target.value)} autoFocus />
              {parseFloat(confirmActual) > (confirmRow.planned_amount ?? 0) + (hosting?.cycle === 'monthly' ? (hosting.amount ?? 0) : 0) && (
                <div className="form-hint" style={{ color: 'var(--blue)' }}>
                  Extra above retainer: +{fmtEuro(parseFloat(confirmActual) - (confirmRow.planned_amount ?? 0) - (hosting?.cycle === 'monthly' ? (hosting.amount ?? 0) : 0))}
                  <span style={{ marginLeft: 6, color: 'var(--c4)' }}>→ auto-added as change request</span>
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

      {/* Plan again modal */}
      <Modal open={!!planAgainRow} title="Restore to Planned" maxWidth={380} onClose={() => setPlanAgainRow(null)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setPlanAgainRow(null)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handlePlanAgain} disabled={saving}>Plan again</button>
        </>}>
        {planAgainRow && (
          <p style={{ margin: 0, color: 'var(--c2)', fontSize: 14 }}>
            Restore <strong>{fmtMonth(planAgainRow.month)}</strong> back to <em>planned</em> status so it can be confirmed or re-marked as not billed.
          </p>
        )}
      </Modal>

      {/* Delete not-billed row confirmation */}
      <Modal open={!!deleteNotBilledRow} title="Delete Row" maxWidth={380} onClose={() => setDeleteNotBilledRow(null)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setDeleteNotBilledRow(null)}>Cancel</button>
          <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} onClick={handleDeleteNotBilled} disabled={saving}>Delete</button>
        </>}>
        {deleteNotBilledRow && (
          <p style={{ margin: 0, color: 'var(--c2)', fontSize: 14 }}>
            Permanently delete the not-billed row for <strong>{fmtMonth(deleteNotBilledRow.month)}</strong>?
            <br /><br />
            <span style={{ color: 'var(--c4)', fontSize: 13 }}>
              This removes {fmtEuro((deleteNotBilledRow.planned_amount ?? 0) + hostingMonthlyAmt)} from the planned total for this contract.
            </span>
          </p>
        )}
      </Modal>

      {/* Add change request modal */}
      {showAddCR && (
        <Modal open={showAddCR} title="Add Change Request" maxWidth={480} onClose={() => setShowAddCR(false)}>
          <CRModalFields form={crForm} setForm={setCRForm} autoFocus />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddCR(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveAddCR} disabled={crSaving || !crForm.title.trim()}>
              {crSaving ? 'Saving…' : 'Add Change Request'}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit change request modal */}
      {showEditCR && editCRTarget && (
        <Modal open={showEditCR} title="Edit Change Request" maxWidth={480} onClose={() => { setShowEditCR(false); setEditCRTarget(null) }}>
          <CRModalFields form={crForm} setForm={setCRForm} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowEditCR(false); setEditCRTarget(null) }}>Cancel</button>
            <button className="btn btn-secondary btn-sm" onClick={saveEditCR} disabled={crSaving || !crForm.title.trim()}>
              {crSaving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={saveEditCRAndPlan} disabled={crSaving || !crForm.title.trim()}>
              {crSaving ? 'Saving…' : 'Save & Add to Plan'}
            </button>
          </div>
        </Modal>
      )}

      {/* Plan CR invoice modal */}
      {showPlanCR && planCRTarget && (
        <Modal open={showPlanCR} title="Plan Invoice" maxWidth={440} onClose={() => { setShowPlanCR(false); setPlanCRTarget(null) }}>
          <p style={{ fontSize: 13, color: 'var(--c2)', marginBottom: 16 }}>
            Adding invoice plan for: <strong>{planCRTarget.title}</strong>
          </p>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Invoice month <span style={{ color: 'var(--red)' }}>*</span></label>
              <input type="month" value={planCRMonth} onChange={e => setPlanCRMonth(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Amount (€)</label>
              <input type="number" value={planCRAmount} onChange={e => setPlanCRAmount(e.target.value)} placeholder="0" />
            </div>
          </div>
          {planCRMonth && (
            <div className="alert alert-amber" style={{ fontSize: 12, marginBottom: 4 }}>
              Will add a planned invoice row for {fmtMonth(planCRMonth + '-01')} — {planCRAmount ? fmtEuro(Number(planCRAmount)) : 'no amount set'}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowPlanCR(false); setPlanCRTarget(null) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={savePlanCR} disabled={planCRSaving || !planCRMonth}>
              {planCRSaving ? 'Saving…' : '+ Add to Invoice Plan'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete CR confirmation */}
      <Modal open={!!deleteCRTarget} title="Delete Change Request" maxWidth={380} onClose={() => setDeleteCRTarget(null)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setDeleteCRTarget(null)}>Cancel</button>
          <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} onClick={() => deleteCRTarget && deleteCR(deleteCRTarget)}>Delete</button>
        </>}>
        {deleteCRTarget && (
          <p style={{ margin: 0, color: 'var(--c2)', fontSize: 14 }}>
            Delete change request "<strong>{deleteCRTarget.title}</strong>"? This cannot be undone.
          </p>
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

      {/* Delete cost confirmation */}
      <Modal open={!!deleteCostRow} title="Remove Cost" maxWidth={380} onClose={() => setDeleteCostRow(null)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setDeleteCostRow(null)}>Cancel</button>
          <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff' }} onClick={async () => {
            if (!deleteCostRow) return
            await handleDeleteCost(deleteCostRow.id)
            setDeleteCostRow(null)
          }}>Remove</button>
        </>}>
        <p style={{ margin: 0, color: 'var(--c2)', fontSize: 14 }}>
          Are you sure you want to remove this cost entry
          {deleteCostRow?.notes ? <> "<strong>{deleteCostRow.notes}</strong>"</> : ''}?
          This cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
