import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useMaintenancesStore } from '../stores/maintenances'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { useResourceStore } from '../stores/resource'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { RevenuePlanner, Maintenance, HostingClient, ChangeRequest } from '../lib/types'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { UsageTab } from './maintenance/UsageTab'
import { ReportsTab } from './maintenance/ReportsTab'

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

const STATUS_BADGE_VARIANT: Record<string, 'amber' | 'blue' | 'green' | 'gray' | 'red'> = {
  planned:  'amber',
  issued:   'blue',
  paid:     'green',
  retainer: 'gray',
  cost:     'red',
}

const MAINT_STATUS_BADGE_VARIANT: Record<string, 'green' | 'amber' | 'red'> = {
  active:    'green',
  paused:    'amber',
  cancelled: 'red',
}

// ── Edit form type ────────────────────────────────────────────────────────────

interface EditForm {
  name: string
  monthly_retainer: string
  billing_cycle: 'monthly' | 'annual'
  billing_month: string
  hours_included: string
  help_requests_included: string
  contract_start: string
  contract_duration_months: string
  contract_url: string
  notes: string
  status: string
  jira_project_key: string
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
      <div className="mb-4">
        <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Title</label>
        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Add CRM integration" autoFocus={autoFocus} />
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Status</label>
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {(['pending', 'approved'] as const).map(s => (
              <button key={s} type="button" onClick={() => setForm(f => ({ ...f, status: s }))}
                className={`flex-1 py-1.5 rounded text-[13px] border-none cursor-pointer font-inherit transition-all ${
                  form.status === s
                    ? `bg-white shadow-sm font-bold ${s === 'approved' ? 'text-[#16a34a]' : 'text-[#d97706]'}`
                    : 'bg-transparent font-medium text-muted-foreground'
                }`}>
                {s === 'pending' ? 'Pending' : 'Approved'}
              </button>
            ))}
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Probability</label>
          <Select value={form.probability} onChange={v => setForm(f => ({ ...f, probability: v }))} options={CR_PROB_OPTS} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€) <span className="text-xs text-muted-foreground ml-1">optional</span></label>
          <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
        </div>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Expected month</label>
          <input type="month" value={form.expected_month} onChange={e => setForm(f => ({ ...f, expected_month: e.target.value }))} />
        </div>
      </div>
      <div className="mb-5">
        <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Description <span className="text-xs text-muted-foreground ml-1">optional</span></label>
        <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this change involve?" className="w-full resize-y" />
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
  const { teams, fetchTeams } = useResourceStore()

  const [rpRows, setRpRows] = useState<RevenuePlanner[]>([])
  const [hosting, setHosting] = useState<HostingClient | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Edit maintenance modal
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [editTeamHours, setEditTeamHours] = useState<Record<string, number>>({})

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

  const [activeTab, setActiveTab] = useState<'overview' | 'invoice-planning' | 'usage' | 'reports'>('overview')

  // Plan CR
  const [showPlanCR, setShowPlanCR] = useState(false)
  const [planCRTarget, setPlanCRTarget] = useState<ChangeRequest | null>(null)
  const [planCRMonth, setPlanCRMonth] = useState('')
  const [planCRAmount, setPlanCRAmount] = useState('')
  const [planCRSaving, setPlanCRSaving] = useState(false)

  useEffect(() => {
    if (!store.maintenances.length) store.fetchAll()
    fetchTeams()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      billing_cycle:          maint.billing_cycle ?? 'monthly',
      billing_month:          String(maint.billing_month ?? 1),
      hours_included:         String(maint.hours_included),
      help_requests_included: String(maint.help_requests_included),
      contract_start:         maint.contract_start?.slice(0, 7) ?? '',
      contract_duration_months: String(duration),
      contract_url:           maint.contract_url ?? '',
      notes:                  maint.notes ?? '',
      status:                 maint.status,
      jira_project_key:       maint.jira_project_key ?? '',
    })
    setEditTeamHours(maint.team_hours ?? {})
    setShowEdit(true)
  }

  async function handleSaveEdit() {
    if (!maint || !editForm) return
    setSaving(true)
    try {
      const start = editForm.contract_start ? editForm.contract_start + '-01' : maint.contract_start
      const durationMonths = parseInt(editForm.contract_duration_months) || 12
      const end = start ? computeContractEnd(start, durationMonths) : null
      // Only include team_hours entries with value > 0
      const filteredTeamHours = Object.fromEntries(
        Object.entries(editTeamHours).filter(([, v]) => v > 0)
      )
      await store.update(maint.id, {
        name:                   editForm.name,
        client_id:              maint.client_id,
        monthly_retainer:       parseFloat(editForm.monthly_retainer) || 0,
        billing_cycle:          editForm.billing_cycle,
        billing_month:          editForm.billing_cycle === 'annual' ? Number(editForm.billing_month) || 1 : null,
        hours_included:         parseInt(editForm.hours_included) || 0,
        help_requests_included: parseInt(editForm.help_requests_included) || 0,
        contract_start:         start ?? maint.contract_start,
        contract_end:           end || null,
        contract_url:           editForm.contract_url || null,
        notes:                  editForm.notes || null,
        status:                 editForm.status as Maintenance['status'],
        team_hours:             Object.keys(filteredTeamHours).length > 0 ? filteredTeamHours : null,
        jira_project_key:       editForm.jira_project_key.trim() || null,
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
      <div className="p-10 text-center text-muted-foreground">
        Contract not found. <Button variant="ghost" size="sm" onClick={() => navigate('/maintenances')}>Back to Maintenances</Button>
      </div>
    )
  }

  if (!maint) return <div className="p-10 text-center text-muted-foreground">Loading…</div>

  const daysUntilEnd = maint.contract_end
    ? Math.ceil((new Date(maint.contract_end).getTime() - Date.now()) / 86_400_000)
    : null
  const expiringSoon = daysUntilEnd !== null && daysUntilEnd <= 30 && daysUntilEnd >= 0

  const maintenanceCRs = crStore.maintenanceCRs

  return (
    <div>
      {/* ── Page header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between px-6 py-4 bg-background border-b border-border mb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.4px]">{maint.name}</h1>
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
              <Badge
                variant={MAINT_STATUS_BADGE_VARIANT[maint.status] ?? 'gray'}
                className="cursor-pointer text-[11px]"
                onClick={() => setEditingStatus(true)}
                title="Click to change status"
              >
                {maint.status.toUpperCase()}
              </Badge>
            )}
            {expiringSoon && (
              <span className="bg-red-100 border border-red-300 rounded px-2 py-0.5 text-[11px] font-bold text-[#dc2626]">
                Expires in {daysUntilEnd}d
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Contract Period: {fmtDate(maint.contract_start)} — {maint.contract_end ? fmtDate(maint.contract_end) : 'Open-ended'}
            {maint.contract_url && (
              <>
                <span className="text-border">·</span>
                <a href={safeUrl(maint.contract_url)} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  View contract
                </a>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openEdit}>Edit Contract</Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border px-6 bg-white">
        {(['overview', 'invoice-planning', 'usage', 'reports'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'overview' ? 'Overview'
              : tab === 'invoice-planning' ? 'Invoice Planning'
              : tab === 'usage' ? 'Usage'
              : 'Reports'}
          </button>
        ))}
      </div>

      {/* ── KPI cards + terms section (padded to match page-header/page-content) */}
      {activeTab === 'overview' && <div className="px-7 pb-5">

      {/* ── KPI cards ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {/* Total Invoiced */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground">Total Invoiced</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-border" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div className={`text-[26px] font-extrabold mb-1 ${totalInvoiced > 0 ? 'text-[#16a34a]' : 'text-foreground'}`}>{fmtEuro(totalInvoiced)}</div>
            <div className="text-[11px] text-muted-foreground">{totalInvoiced > 0 ? 'issued + paid' : 'No invoices issued yet'}</div>
          </CardContent>
        </Card>

        {/* Total / Mo */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground">{hosting ? 'Total / Mo (Incl. Hosting)' : 'Monthly Retainer'}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-border" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
            </div>
            <div className="text-[26px] font-extrabold text-foreground mb-1">
              {maint.billing_cycle === 'annual'
                ? fmtEuro(Math.round(maint.monthly_retainer / 12) + (hosting?.cycle === 'monthly' ? hosting.amount : 0))
                : fmtEuro(maint.monthly_retainer + (hosting?.cycle === 'monthly' ? hosting.amount : 0))
              }
              <span className="text-sm font-medium text-muted-foreground ml-0.5">/mo</span>
            </div>
            <div className="text-[11px] text-[#6366f1] font-semibold">
              {maint.billing_cycle === 'annual' ? `→ Billed yearly (${fmtEuro(maint.monthly_retainer)}/yr)` : `→ ${hosting ? 'Incl. Hosting' : 'Fixed Monthly'}`}
            </div>
          </CardContent>
        </Card>

        {/* Extra Billed */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground">Extra Billed</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-border" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            </div>
            <div className={`text-[26px] font-extrabold mb-1 ${extraBilled > 0 ? 'text-[#2563eb]' : 'text-foreground'}`}>{fmtEuro(extraBilled)}</div>
            <div className="text-[11px] text-muted-foreground">{extraBilled > 0 ? 'above retainer' : 'No extra items added'}</div>
          </CardContent>
        </Card>

        {/* Total Costs */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground">Total Costs</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-border" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>
            </div>
            <div className={`text-[26px] font-extrabold mb-1 ${totalCosts > 0 ? 'text-[#dc2626]' : 'text-foreground'}`}>{fmtEuro(totalCosts)}</div>
            <div className="text-[11px] text-muted-foreground">{totalCosts > 0 ? 'project expenses' : 'Tracking cumulative spend'}</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Maintenance Terms + Hosting (two-column) ──────────────────────────── */}
      <div className={`grid gap-4 mb-5 min-w-0 ${hosting ? 'grid-cols-[1fr_280px]' : 'grid-cols-1'}`}>
        {/* Maintenance Terms card */}
        <Card>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <h2 className="m-0 text-[15px] font-bold">Maintenance Terms</h2>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            {/* Metric chips */}
            <div className="grid grid-cols-3 gap-2.5 mb-5">
              <div className="bg-gray-50 rounded-xl p-3.5 text-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[#374151] mb-2 mx-auto" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14.31 8a4 4 0 0 0-4.62 0C8.01 9.06 8 11 8 12s.01 2.94 1.69 4a4 4 0 0 0 4.62 0"/><line x1="12" y1="6" x2="12" y2="7"/><line x1="12" y1="17" x2="12" y2="18"/></svg>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
                  {maint.billing_cycle === 'annual' ? 'Annual Total' : 'Monthly Total'}
                </div>
                <div className="text-[20px] font-extrabold text-foreground">
                  {fmtEuro(maint.monthly_retainer)}
                </div>
                {maint.billing_cycle === 'annual' && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">{fmtEuro(Math.round(maint.monthly_retainer / 12))}/mo</div>
                )}
              </div>
              <div className="bg-gray-50 rounded-xl p-3.5 text-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[#374151] mb-2 mx-auto" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Hours / Mo</div>
                <div className="text-[20px] font-extrabold text-foreground">{maint.hours_included}h</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3.5 text-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[#374151] mb-2 mx-auto" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">Requests / Mo</div>
                <div className="text-[20px] font-extrabold text-foreground">{maint.help_requests_included}</div>
              </div>
            </div>

            {/* Contract Details */}
            <div className="border-t border-border pt-3.5">
              <div className="font-bold text-[13px] text-foreground mb-2.5">Contract Details</div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Client Name</span>
                  <span
                    className="font-bold text-primary cursor-pointer"
                    onClick={() => maint.client?.id && navigate(`/clients/${maint.client.id}`)}
                  >{maint.client?.name ?? '—'}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Contract Start</span>
                  <span className="font-bold">{fmtDate(maint.contract_start)}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">Contract End</span>
                  <span className={`font-bold ${expiringSoon ? 'text-[#dc2626]' : ''}`}>
                    {maint.contract_end ? fmtDate(maint.contract_end) : 'Open-ended'}
                  </span>
                </div>
                {maint.notes && (
                  <div className="flex justify-between text-[13px] items-start gap-4">
                    <span className="text-muted-foreground shrink-0">Notes</span>
                    <span className="font-medium text-[#374151] text-right">{maint.notes}</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hosting Attachment card */}
        {hosting && (
          <div className="rounded-xl px-[22px] py-5 text-white flex flex-col gap-4" style={{ background: 'linear-gradient(145deg, #4f46e5 0%, #3b82f6 100%)' }}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-[15px]">Hosting Attachment</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
            </div>

            <div className="rounded-lg px-[14px] py-3" style={{ background: 'rgba(255,255,255,0.12)' }}>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Active Project</div>
              <div className="text-[18px] font-extrabold mb-1">
                {hosting.description || (hosting.project_pn ? `Project #${hosting.project_pn}` : '—')}
              </div>
              {hosting.project_pn && (
                <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>PN #{hosting.project_pn}</div>
              )}
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] mb-1.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Service Amount</div>
              <div className="flex items-center justify-between">
                <div className="text-[22px] font-extrabold">
                  {fmtEuro(hosting.amount)}
                  <span className="text-[13px] font-normal ml-1" style={{ color: 'rgba(255,255,255,0.5)' }}>/ {hosting.cycle}</span>
                </div>
                <Button variant="outline" size="sm" className="text-[12px]" onClick={() => navigate('/infrastructure')}>
                  Manage
                </Button>
              </div>
            </div>

            {(hosting.billing_since || hosting.contract_id) && (
              <div className="flex flex-col gap-1.5 border-t pt-3" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                {hosting.billing_since && (
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>Billing since</span>
                    <span className="font-semibold">{fmtDate(hosting.billing_since)}</span>
                  </div>
                )}
                {hosting.contract_id && (
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}>Contract ID</span>
                    <span className="text-[11px]">{hosting.contract_id}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      </div>}{/* end padded wrapper */}

      {activeTab === 'overview' && <div className="flex-1 overflow-auto p-6">

        {/* Not-billed alert */}
        {notBilledRows.length > 0 && (
          <div className="rounded-lg border border-[#fcd34d] bg-[#fef9ee] px-3 py-2 text-sm text-[#92400e] mb-4 flex items-center justify-between gap-3">
            <div className="text-[13px]">
              <strong>{notBilledRows.length} month{notBilledRows.length > 1 ? 's' : ''} not billed:</strong>{' '}
              {notBilledRows.map(r => fmtMonth(r.month)).join(', ')}
              <span className="text-muted-foreground ml-2 text-xs">
                — {fmtEuro(notBilledRows.reduce((s, r) => s + (r.planned_amount ?? 0) + hostingMonthlyAmt, 0))} not collected
              </span>
            </div>
          </div>
        )}

        {/* Team Hours / Month */}
        {maint.team_hours && Object.keys(maint.team_hours).length > 0 && teams.length > 0 && (
          <Card className="mb-6">
            <CardContent className="p-5">
              <div className="font-bold text-[14px] text-foreground mb-3">Team Hours / Month</div>
              <div className="flex flex-col gap-2">
                {teams.filter(t => (maint.team_hours as Record<string, number>)[t.name] > 0).map(t => {
                  const hrs = (maint.team_hours as Record<string, number>)[t.name]
                  return (
                    <div key={t.id} className="flex items-center justify-between text-[13px]">
                      <div className="flex items-center gap-2">
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                        <span className="font-medium text-foreground">{t.name}</span>
                      </div>
                      <span className="font-bold text-foreground">{hrs}h / mo</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Change Requests */}
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="flex items-center gap-2">
            Change Requests
            {maintenanceCRs.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                {fmtEuro(maintenanceCRs.reduce((s, cr) => s + (cr.amount ?? 0), 0))} total
              </span>
            )}
          </h2>
          <Button variant="outline" size="sm" onClick={() => { setCRForm(defaultCRForm()); setShowAddCR(true) }}>
            + Add change request
          </Button>
        </div>

        <Card className="mb-5">
          {maintenanceCRs.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">
              No change requests yet.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 160 }}>STATUS</th>
                  <th>TITLE</th>
                  <th>DESCRIPTION</th>
                  <th className="text-right" style={{ width: 100 }}>AMOUNT</th>
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
                    ? <Badge variant="navy">Billed</Badge>
                    : isApproved
                      ? <Badge variant="green">Approved</Badge>
                      : <Badge variant="amber">Pending</Badge>
                  return (
                    <tr key={cr.id}>
                      <td>
                        {crStatusBadge}
                        {isAuto && <Badge variant="gray" className="ml-1 text-[10px]">Auto</Badge>}
                      </td>
                      <td className="text-[13px] font-semibold">{cr.title}</td>
                      <td className="text-xs text-muted-foreground max-w-[200px]">{cr.description ?? <span className="text-border">—</span>}</td>
                      <td className="text-right text-[13px] text-[#374151]">
                        {cr.amount != null ? fmtEuro(cr.amount) : <span className="text-border">—</span>}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {cr.probability != null ? `${cr.probability}%` : '—'}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {cr.expected_month ? fmtMonth(cr.expected_month) : <span className="text-border">—</span>}
                      </td>
                      <td>
                        <div className="flex gap-1.5 justify-end">
                          {isPending && !isAuto && (
                            <Button
                              size="xs"
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
                            </Button>
                          )}
                          {canPlan && (
                            <Button variant="outline" size="xs" onClick={() => openPlanCR(cr)}>
                              + Plan Invoice
                            </Button>
                          )}
                          {isPending && !isAuto && (
                            <Button variant="outline" size="xs" onClick={() => openEditCR(cr)}>Edit</Button>
                          )}
                          {!isAuto && !alreadyPlanned && (
                            <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeleteCRTarget(cr)}>
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
                <tr className="bg-gray-50 border-t-2 border-border">
                  <td colSpan={3} className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.05em]">Total extra billed</td>
                  <td className="text-right font-bold text-[#2563eb]">
                    {fmtEuro(maintenanceCRs.reduce((s, cr) => s + (cr.amount ?? 0), 0))}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>

        {/* Costs */}
        <div className="flex items-center justify-between mb-2.5">
          <h2>Costs</h2>
          <Button variant="outline" size="sm" onClick={() => setShowAddCost(true)}>+ Add cost</Button>
        </div>

        <Card className="mb-5">
          {costRows.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">No costs recorded.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Description</th>
                  <th className="text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {costRows.map(row => (
                  <tr key={row.id}>
                    <td className="font-semibold">{fmtMonth(row.month)}</td>
                    <td className="text-[13px] text-[#374151]">{row.notes ?? '—'}</td>
                    <td className="text-right text-[#dc2626] font-bold">{fmtEuro(row.actual_amount ?? 0)}</td>
                    <td>
                      <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeleteCostRow(row)}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.05em]">Total costs</td>
                  <td className="text-right font-bold text-[#dc2626]">{fmtEuro(totalCosts)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      </div>}

      {activeTab === 'invoice-planning' && <div className="flex-1 overflow-auto p-6">
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
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="flex items-center gap-2">
                  Invoice Plans
                  {yearNotBilled > 0 && (
                    <Badge variant="amber" className="text-[11px]">
                      {yearNotBilled} not billed
                    </Badge>
                  )}
                </h2>
                <div className="flex gap-1">
                  {availYears.map(y => (
                    <Button
                      key={y}
                      size="xs"
                      variant={currentYear === y ? 'default' : 'outline'}
                      onClick={() => { setPlanYear(y); setPlanPage(0) }}
                    >{y}</Button>
                  ))}
                </div>
              </div>

              <Card className="mb-5">
                {loading ? (
                  <div className="p-7 text-center text-muted-foreground text-[13px]">Loading…</div>
                ) : yearRows.length === 0 ? (
                  <div className="p-7 text-center text-muted-foreground text-[13px]">No invoice rows for {currentYear}.</div>
                ) : (
                  <>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 120 }}>MONTH</th>
                          <th style={{ width: 120 }}>TYPE</th>
                          <th className="text-right" style={{ width: 110 }}>AMOUNT</th>
                          <th className="text-right" style={{ width: 110 }}>ACTUAL</th>
                          <th className="text-right" style={{ width: 100 }}>EXTRA</th>
                          <th>NOTES</th>
                          <th style={{ width: 110 }}>STATUS</th>
                          <th className="text-right" style={{ width: 200 }}>ACTIONS</th>
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
                                  ? <Badge variant="navy" className="text-[10px]">Change Request</Badge>
                                  : <span className="text-xs text-muted-foreground">Retainer</span>}
                              </td>
                              <td className="text-right">
                                {fmtEuro((row.planned_amount ?? 0) + (isCR ? 0 : (hosting?.cycle === 'monthly' ? hosting.amount : 0)))}
                                {!isCR && hosting?.cycle === 'monthly' && (
                                  <div className="text-[10px] text-muted-foreground font-normal">
                                    {fmtEuro(row.planned_amount ?? 0)} + {fmtEuro(hosting.amount)}
                                  </div>
                                )}
                              </td>
                              <td className={`text-right ${isSettled ? 'font-bold text-[#16a34a]' : 'text-muted-foreground'}`}>
                                {isSettled ? fmtEuro(row.actual_amount ?? 0) : '—'}
                              </td>
                              <td className={`text-right text-[#2563eb] ${extra > 0 ? 'font-bold' : ''}`}>
                                {extra > 0 ? `+${fmtEuro(extra)}` : <span className="text-border">—</span>}
                              </td>
                              <td className="text-xs text-muted-foreground">
                                {row.notes
                                  ? <span className={isNotBilled ? 'text-muted-foreground' : extra > 0 ? 'text-[#2563eb]' : 'text-muted-foreground'}>{row.notes}</span>
                                  : <span className="text-border">—</span>}
                              </td>
                              <td>
                                <Badge variant={STATUS_BADGE_VARIANT[row.status] ?? 'gray'}>
                                  {row.status === 'retainer' ? 'Not billed' : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                                </Badge>
                              </td>
                              <td className="text-right">
                                <div className="flex gap-1.5 justify-end">
                                  {isPending && (
                                    <>
                                      <Button size="xs" onClick={() => openConfirm(row)}>Confirm</Button>
                                      <Button size="xs" variant="outline" onClick={() => openNotBilled(row)}>Not billed</Button>
                                    </>
                                  )}
                                  {isNotBilled && (
                                    <>
                                      <Button size="xs" variant="outline" className="text-primary" onClick={() => setPlanAgainRow(row)}>Plan again</Button>
                                      <Button size="xs" variant="ghost" className="text-[#dc2626]" onClick={() => setDeleteNotBilledRow(row)}>Delete</Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-border">
                          <td colSpan={2} className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.05em]">{currentYear} total</td>
                          <td className="text-right font-bold">
                            {fmtEuro(yearPlanned + (hosting?.cycle === 'monthly' ? hosting.amount * yearRows.filter(r => !r.notes?.startsWith('CR:')).length : 0))}
                          </td>
                          <td className="text-right font-bold text-[#16a34a]">{yearInvoiced > 0 ? fmtEuro(yearInvoiced) : '—'}</td>
                          <td className="text-right font-bold text-[#2563eb]">{yearExtra > 0 ? `+${fmtEuro(yearExtra)}` : '—'}</td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-5 py-2.5 border-t border-border bg-gray-50">
                        <span className="text-xs text-muted-foreground">
                          Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, yearRows.length)} of {yearRows.length}
                        </span>
                        <div className="flex gap-1">
                          <Button size="xs" variant="outline" onClick={() => setPlanPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prev</Button>
                          {Array.from({ length: totalPages }, (_, i) => (
                            <Button key={i} size="xs" variant={page === i ? 'default' : 'outline'} onClick={() => setPlanPage(i)}>{i + 1}</Button>
                          ))}
                          <Button size="xs" variant="outline" onClick={() => setPlanPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>Next →</Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </>
          )
        })()}
      </div>}

      {activeTab === 'usage' && maint && <UsageTab maintenance={maint} />}
      {activeTab === 'reports' && maint && <ReportsTab maintenance={maint} />}

      {/* Create Invoice modal */}
      <Modal open={showCreateInvoice} title="Create Invoice" maxWidth={380} onClose={() => setShowCreateInvoice(false)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setShowCreateInvoice(false)}>Cancel</Button>
          <Button size="sm" onClick={handleCreateInvoice} disabled={saving || !createInvoiceMonth}>Add to Plan</Button>
        </>}>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Month</label>
          <input type="month" value={createInvoiceMonth} onChange={e => setCreateInvoiceMonth(e.target.value)} />
        </div>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€)</label>
          <input type="number" value={createInvoiceAmount} onChange={e => setCreateInvoiceAmount(e.target.value)} placeholder={String(maint.monthly_retainer)} />
          <div className="text-xs text-muted-foreground mt-1">Defaults to monthly retainer ({fmtEuro(maint.monthly_retainer)})</div>
        </div>
      </Modal>

      {/* Edit Contract modal */}
      <Modal open={showEdit} title="Edit Contract" maxWidth={560} onClose={() => setShowEdit(false)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setShowEdit(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSaveEdit} disabled={saving}>Save</Button>
        </>}>
        {editForm && (
          <div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Contract name</label>
                <input value={editForm.name} onChange={e => setEditForm(f => f ? { ...f, name: e.target.value } : f)} placeholder="e.g. Vzdrževanje spletne strani" />
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Status</label>
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
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Monthly retainer (€)</label>
                <div className="h-[42px] flex items-center px-3 bg-gray-50 border border-border rounded-lg text-sm font-semibold">
                  {editForm.monthly_retainer} €
                </div>
                <div className="text-xs text-muted-foreground mt-1">Contact support to change retainer amount</div>
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Hours / mo</label>
                <input type="number" value={editForm.hours_included} onChange={e => setEditForm(f => f ? { ...f, hours_included: e.target.value } : f)} placeholder="10" />
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Requests / mo</label>
                <input type="number" value={editForm.help_requests_included} onChange={e => setEditForm(f => f ? { ...f, help_requests_included: e.target.value } : f)} placeholder="5" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Contract start</label>
                <div className="h-[42px] flex items-center px-3 bg-gray-50 border border-border rounded-lg text-sm">
                  {editForm.contract_start ? fmtMonth(editForm.contract_start + '-01') : '—'}
                </div>
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Duration (months)</label>
                <div className="h-[42px] flex items-center px-3 bg-gray-50 border border-border rounded-lg text-sm">
                  {editForm.contract_duration_months} months
                </div>
                {editForm.contract_start && editForm.contract_duration_months && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Ends: {fmtMonth(computeContractEnd(editForm.contract_start + '-01', parseInt(editForm.contract_duration_months) || 12))}
                    {' · '}Total: {fmtEuro((parseInt(editForm.contract_duration_months) || 12) * (parseFloat(editForm.monthly_retainer) || 0))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Contract URL <span className="text-xs text-muted-foreground ml-1">optional</span></label>
                <input value={editForm.contract_url} onChange={e => setEditForm(f => f ? { ...f, contract_url: e.target.value } : f)} placeholder="https://..." />
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">
                  Jira Project Key <span className="text-xs text-muted-foreground ml-1">optional</span>
                </label>
                <input
                  value={editForm?.jira_project_key ?? ''}
                  onChange={e => setEditForm(f => f ? { ...f, jira_project_key: e.target.value.toUpperCase() } : f)}
                  placeholder="e.g. ACME"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Notes <span className="text-xs text-muted-foreground ml-1">optional</span></label>
              <textarea value={editForm.notes} onChange={e => setEditForm(f => f ? { ...f, notes: e.target.value } : f)} rows={3} placeholder="Internal notes about this contract…" />
            </div>
            {teams.length > 0 && (
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">
                  Team hours / month
                  <span className="text-xs normal-case text-muted-foreground ml-1">for resource planning</span>
                </label>
                <div className="bg-[#f8f8fa] rounded-lg border border-border p-3 flex flex-col gap-2">
                  {teams.map(t => (
                    <div key={t.id} className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 w-28 shrink-0">
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color }} />
                        <span className="text-[13px] font-medium text-[var(--c1)]">{t.name}</span>
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={editTeamHours[t.name] ?? ''}
                        onChange={e => setEditTeamHours(prev => ({ ...prev, [t.name]: parseInt(e.target.value) || 0 }))}
                        placeholder="0"
                        style={{ width: 72, textAlign: 'right' }}
                      />
                      <span className="text-xs text-muted-foreground">h / mo</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm invoice modal */}
      <Modal open={!!confirmRow} title="Confirm Invoice" maxWidth={420} onClose={() => setConfirmRow(null)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setConfirmRow(null)}>Cancel</Button>
          <Button size="sm" onClick={handleConfirm} disabled={saving}>Confirm</Button>
        </>}>
        {confirmRow && (
          <div>
            <p className="text-sm text-[#374151] mb-4">
              <strong>{fmtMonth(confirmRow.month)}</strong> — retainer {fmtEuro(confirmRow.planned_amount ?? 0)}
              {hosting?.cycle === 'monthly' && (
                <span className="text-muted-foreground text-[13px]"> + hosting {fmtEuro(hosting.amount)} = <strong>{fmtEuro((confirmRow.planned_amount ?? 0) + hosting.amount)}</strong></span>
              )}
            </p>
            <div className="mb-3">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Actual amount (€)</label>
              <input type="number" value={confirmActual} onChange={e => setConfirmActual(e.target.value)} autoFocus />
              {parseFloat(confirmActual) > (confirmRow.planned_amount ?? 0) + (hosting?.cycle === 'monthly' ? (hosting.amount ?? 0) : 0) && (
                <div className="text-xs text-[#2563eb] mt-1">
                  Extra above retainer: +{fmtEuro(parseFloat(confirmActual) - (confirmRow.planned_amount ?? 0) - (hosting?.cycle === 'monthly' ? (hosting.amount ?? 0) : 0))}
                  <span className="ml-1.5 text-muted-foreground">→ auto-added as change request</span>
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Note <span className="text-xs text-muted-foreground ml-1">optional</span></label>
              <input value={confirmNote} onChange={e => setConfirmNote(e.target.value)} placeholder="e.g. extra hours in March" />
            </div>
          </div>
        )}
      </Modal>

      {/* Not billed modal */}
      <Modal open={!!notBilledRow} title="Mark as Not Billed" maxWidth={400} onClose={() => setNotBilledRow(null)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setNotBilledRow(null)}>Cancel</Button>
          <Button size="sm" onClick={handleNotBilled} disabled={saving}>Confirm</Button>
        </>}>
        {notBilledRow && (
          <div>
            <p className="text-sm text-[#374151] mb-4">
              Mark <strong>{fmtMonth(notBilledRow.month)}</strong> as not billed. The row will remain in the plan with €0 actual.
            </p>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Reason <span className="text-xs text-muted-foreground ml-1">optional</span></label>
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
          <Button variant="outline" size="sm" onClick={() => setPlanAgainRow(null)}>Cancel</Button>
          <Button size="sm" onClick={handlePlanAgain} disabled={saving}>Plan again</Button>
        </>}>
        {planAgainRow && (
          <p className="text-sm text-[#374151]">
            Restore <strong>{fmtMonth(planAgainRow.month)}</strong> back to <em>planned</em> status so it can be confirmed or re-marked as not billed.
          </p>
        )}
      </Modal>

      {/* Delete not-billed row confirmation */}
      <ConfirmDialog
        open={!!deleteNotBilledRow}
        title="Delete Row"
        message={deleteNotBilledRow ? `Permanently delete the not-billed row for ${fmtMonth(deleteNotBilledRow.month)}? This removes ${fmtEuro((deleteNotBilledRow.planned_amount ?? 0) + hostingMonthlyAmt)} from the planned total.` : ''}
        confirmLabel="Delete"
        onConfirm={handleDeleteNotBilled}
        onCancel={() => setDeleteNotBilledRow(null)}
      />

      {/* Add change request modal */}
      {showAddCR && (
        <Modal open={showAddCR} title="Add Change Request" maxWidth={480} onClose={() => setShowAddCR(false)}>
          <CRModalFields form={crForm} setForm={setCRForm} autoFocus />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowAddCR(false)}>Cancel</Button>
            <Button size="sm" onClick={saveAddCR} disabled={crSaving || !crForm.title.trim()}>
              {crSaving ? 'Saving…' : 'Add Change Request'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Edit change request modal */}
      {showEditCR && editCRTarget && (
        <Modal open={showEditCR} title="Edit Change Request" maxWidth={480} onClose={() => { setShowEditCR(false); setEditCRTarget(null) }}>
          <CRModalFields form={crForm} setForm={setCRForm} />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setShowEditCR(false); setEditCRTarget(null) }}>Cancel</Button>
            <Button variant="outline" size="sm" onClick={saveEditCR} disabled={crSaving || !crForm.title.trim()}>
              {crSaving ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" onClick={saveEditCRAndPlan} disabled={crSaving || !crForm.title.trim()}>
              {crSaving ? 'Saving…' : 'Save & Add to Plan'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Plan CR invoice modal */}
      {showPlanCR && planCRTarget && (
        <Modal open={showPlanCR} title="Plan Invoice" maxWidth={440} onClose={() => { setShowPlanCR(false); setPlanCRTarget(null) }}>
          <p className="text-[13px] text-[#374151] mb-4">
            Adding invoice plan for: <strong>{planCRTarget.title}</strong>
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Invoice month <span className="text-[#dc2626]">*</span></label>
              <input type="month" value={planCRMonth} onChange={e => setPlanCRMonth(e.target.value)} autoFocus />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€)</label>
              <input type="number" value={planCRAmount} onChange={e => setPlanCRAmount(e.target.value)} placeholder="0" />
            </div>
          </div>
          {planCRMonth && (
            <div className="rounded-lg border border-[#fcd34d] bg-[#fef9ee] px-3 py-2 text-sm text-[#92400e] text-[12px] mb-1">
              Will add a planned invoice row for {fmtMonth(planCRMonth + '-01')} — {planCRAmount ? fmtEuro(Number(planCRAmount)) : 'no amount set'}
            </div>
          )}
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="outline" size="sm" onClick={() => { setShowPlanCR(false); setPlanCRTarget(null) }}>Cancel</Button>
            <Button size="sm" onClick={savePlanCR} disabled={planCRSaving || !planCRMonth}>
              {planCRSaving ? 'Saving…' : '+ Add to Invoice Plan'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Delete CR confirmation */}
      <ConfirmDialog
        open={!!deleteCRTarget}
        title="Delete Change Request"
        message={deleteCRTarget ? `Delete change request "${deleteCRTarget.title}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={() => deleteCRTarget && deleteCR(deleteCRTarget)}
        onCancel={() => setDeleteCRTarget(null)}
      />

      {/* Add cost modal */}
      <Modal open={showAddCost} title="Add Cost" maxWidth={400} onClose={() => setShowAddCost(false)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setShowAddCost(false)}>Cancel</Button>
          <Button size="sm" onClick={handleAddCost} disabled={!costForm.month || !costForm.amount || saving}>Add</Button>
        </>}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Month</label>
            <input type="month" value={costForm.month} onChange={e => setCostForm(f => ({ ...f, month: e.target.value }))} autoFocus />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€)</label>
            <input type="number" value={costForm.amount} onChange={e => setCostForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Description</label>
          <input value={costForm.description} onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. SSL certificate, plugin license…" />
        </div>
      </Modal>

      {/* Delete cost confirmation */}
      <ConfirmDialog
        open={!!deleteCostRow}
        title="Remove Cost"
        message={`Are you sure you want to remove this cost entry${deleteCostRow?.notes ? ` "${deleteCostRow.notes}"` : ''}? This cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!deleteCostRow) return
          await handleDeleteCost(deleteCostRow.id)
          setDeleteCostRow(null)
        }}
        onCancel={() => setDeleteCostRow(null)}
      />
    </div>
  )
}
