import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { useSettingsStore } from '../stores/settings'
import { useResourceStore } from '../stores/resource'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { RevenuePlanner, Project, ChangeRequest, ProjectDeliverable, ResourceAllocation, ProjectOrder } from '../lib/types'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import { Button } from '@/components/ui/button'
import { Badge, badgeVariants } from '@/components/ui/badge'
import type { VariantProps } from 'class-variance-authority'
type BadgeVariant = VariantProps<typeof badgeVariants>['variant']
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ToolsTab } from '../components/ToolsTab'

function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return /^https?:\/\//i.test(url) ? url : undefined
}

// ── helpers ───────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, BadgeVariant> = {
  fixed: 'blue',
  maintenance: 'amber',
  variable: 'green',
}
const RP_STATUS_BADGE: Record<string, BadgeVariant> = {
  paid: 'green',
  issued: 'blue',
  planned: 'amber',
  retainer: 'navy',
  cost: 'red',
}

const CR_PROB_OPTS = [
  { value: '25', label: '25%' },
  { value: '50', label: '50%' },
  { value: '100', label: '100%' },
]
function fmtMonth(m: string) {
  const d = new Date(m + 'T00:00:00')
  return d.toLocaleString('en', { month: 'short', year: 'numeric' })
}

function fmt(n?: number | null) {
  return n != null ? n.toLocaleString() + ' €' : '—'
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── state types ───────────────────────────────────────────────────────────────

interface InvoicePlanRow {
  month: string
  description: string
  planned_amount: string
  probability: string
}

interface CostForm {
  month_from: string
  month_to: string
  description: string
  amount: string
}

interface EditCostForm {
  month: string
  description: string
  amount: string
}

interface EditForm {
  month: string
  description: string
  planned_amount: string
  actual_amount: string
  status: string
  probability: string
}

interface ProjectEditForm {
  pn: string
  name: string
  client_id: string
  pm: string
  value: string
  status: string
  start_month: string
  end_month: string
  contract_url: string
  notes: string
  is_maintenance: boolean
  cms: string
}

interface ScheduleRow { month: string; amount: string }

interface CRForm {
  title: string
  status: ChangeRequest['status']
  amount: string
  description: string
  probability: string
  deal_type: 'one_time' | 'monthly' | 'fixed'
  expected_month: string
  expected_end_month: string
  schedule: ScheduleRow[]
}

interface MoveForm {
  month: string
}

// ── CRModalFields shared form body ────────────────────────────────────────────

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
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Status</label>
          <div className="flex gap-0.5 bg-[var(--c7)] rounded-lg p-[3px]">
            {(['pending', 'approved'] as const).map(s => (
              <button key={s} type="button" onClick={() => setForm(f => ({ ...f, status: s }))}
                className={`flex-1 py-1.5 rounded border-none font-[inherit] text-[13px] cursor-pointer transition-all ${
                  form.status === s
                    ? `bg-white font-bold shadow-sm ${s === 'approved' ? 'text-[#16a34a]' : 'text-[#d97706]'}`
                    : 'bg-transparent font-medium text-muted-foreground'
                }`}>
                {s === 'pending' ? 'Pending' : 'Approved'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Probability</label>
          <Select value={form.probability} onChange={v => setForm(f => ({ ...f, probability: v }))} options={CR_PROB_OPTS} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€) <span className="text-xs text-muted-foreground ml-1">optional</span></label>
          <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
        </div>
        <div>
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

// ── component ─────────────────────────────────────────────────────────────────

export function ProjectDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const pStore = useProjectsStore()
  const cStore = useClientsStore()
  const crStore = useChangeRequestsStore()
  const settingsStore = useSettingsStore()
  const { deliverables, fetchDeliverables, addDeliverable, updateDeliverable, removeDeliverable, members, fetchMembers, teams, fetchTeams } = useResourceStore()
  const pmOptions = settingsStore.projectManagers.map(m => ({ value: m, label: m }))

  // revenue_planner rows fetched directly
  const [rpRows, setRpRows] = useState<RevenuePlanner[]>([])
  const [rpLoading, setRpLoading] = useState(false)

  // modals
  const [showAddPlan, setShowAddPlan] = useState(false)
  const defaultPlanDescription = () => project?.type === 'variable' ? (project?.name ?? '') : ''
  const [planRows, setPlanRows] = useState<InvoicePlanRow[]>([{ month: '', description: '', planned_amount: '', probability: '100' }])
  const [planSaving, setPlanSaving] = useState(false)
  const [planYear, setPlanYear] = useState<number>(new Date().getFullYear())

  const [showAddCost, setShowAddCost] = useState(false)
  const [costForm, setCostForm] = useState<CostForm>({ month_from: '', month_to: '', description: '', amount: '' })
  const [costSaving, setCostSaving] = useState(false)

  const [showEditCost, setShowEditCost] = useState(false)
  const [editCostRow, setEditCostRow] = useState<RevenuePlanner | null>(null)
  const [editCostForm, setEditCostForm] = useState<EditCostForm>({ month: '', description: '', amount: '' })
  const [editCostSaving, setEditCostSaving] = useState(false)

  const [deleteCostId, setDeleteCostId] = useState<string | null>(null)
  const [deletePlanTarget, setDeletePlanTarget] = useState<RevenuePlanner | null>(null)
  const [deleteCRTarget, setDeleteCRTarget] = useState<ChangeRequest | null>(null)

  const [showEdit, setShowEdit] = useState(false)
  const [editRow, setEditRow] = useState<RevenuePlanner | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ month: '', description: '', planned_amount: '', actual_amount: '', status: 'planned', probability: '100' })
  const [editSaving, setEditSaving] = useState(false)

  const [quickUpdateRow, setQuickUpdateRow] = useState<RevenuePlanner | null>(null)
  const [quickUpdateAmount, setQuickUpdateAmount] = useState('')
  const [quickUpdateSaving, setQuickUpdateSaving] = useState(false)

  // project edit modal
  const [showProjectEdit, setShowProjectEdit] = useState(false)
  const [projectEditForm, setProjectEditForm] = useState<ProjectEditForm>({ pn: '', name: '', client_id: '', pm: '', value: '', status: 'active', start_month: '', end_month: '', contract_url: '', notes: '', is_maintenance: false, cms: '' })
  const [projectEditSaving, setProjectEditSaving] = useState(false)

  // inline status change
  const [statusSaving, setStatusSaving] = useState(false)

  // confirm-issue popup
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmRow, setConfirmRow] = useState<RevenuePlanner | null>(null)
  const [confirmActual, setConfirmActual] = useState('')
  const [confirmNote, setConfirmNote] = useState('')
  const [confirmSaving, setConfirmSaving] = useState(false)


  // move invoice month modal
  const [showMove, setShowMove] = useState(false)
  const [moveRow, setMoveRow] = useState<RevenuePlanner | null>(null)
  const [moveForm, setMoveForm] = useState<MoveForm>({ month: '' })
  const [moveSaving, setMoveSaving] = useState(false)

  // plan again modal (restore deferred to a chosen month)
  const [showPlanAgain, setShowPlanAgain] = useState(false)
  const [planAgainRow, setPlanAgainRow] = useState<RevenuePlanner | null>(null)
  const [planAgainMonth, setPlanAgainMonth] = useState('')
  const [planAgainAmount, setPlanAgainAmount] = useState('')
  const [planAgainSaving, setPlanAgainSaving] = useState(false)

  // change requests
  const [showAddCR, setShowAddCR] = useState(false)
  const [showEditCR, setShowEditCR] = useState(false)
  const [editCRTarget, setEditCRTarget] = useState<ChangeRequest | null>(null)
  const [crForm, setCrForm] = useState<CRForm>({ title: '', status: 'pending', amount: '', description: '', probability: '50', deal_type: 'one_time', expected_month: '', expected_end_month: '', schedule: [] })
  const [crSaving, setCrSaving] = useState(false)

  // plan CR invoice
  const [showPlanCR, setShowPlanCR] = useState(false)
  const [planCRTarget, setPlanCRTarget] = useState<ChangeRequest | null>(null)
  const [planCRMonth, setPlanCRMonth] = useState('')
  const [planCRAmount, setPlanCRAmount] = useState('')
  const [planCRSaving, setPlanCRSaving] = useState(false)

  // deliverables
  const [showDeliverableModal, setShowDeliverableModal] = useState(false)
  const [delTitle, setDelTitle] = useState('')
  const [delDue, setDelDue] = useState('')
  const [delStartDate, setDelStartDate] = useState('')
  const [delHours, setDelHours] = useState<number | ''>('')
  const [delTeam, setDelTeam] = useState<string[]>([])
  const [delTeamHours, setDelTeamHours] = useState<Record<string, number>>({})
  const [delMemberPercentages, setDelMemberPercentages] = useState<Record<string, number>>({})
  const [editDeliverableTarget, setEditDeliverableTarget] = useState<import('../lib/types').ProjectDeliverable | null>(null)

  // orders (variable projects)
  const [orders, setOrders] = useState<ProjectOrder[]>([])
  const [showAddOrder, setShowAddOrder] = useState(false)
  const [orderForm, setOrderForm] = useState({ offer_ref: '', po_number: '', description: '', amount: '', month: '' })
  const [orderSaving, setOrderSaving] = useState(false)
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<ProjectOrder | null>(null)

  // project team members
  const [projectMembers, setProjectMembers] = useState<Array<{ id: string; member_id: string; member: { id: string; name: string } }>>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [addMemberIds, setAddMemberIds] = useState<string[]>([])
  const [addMemberSaving, setAddMemberSaving] = useState(false)
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ id: string; name: string } | null>(null)

  // tabs
  const [tab, setTab] = useState<'overview' | 'invoice' | 'orders' | 'resource' | 'tools'>('overview')

  // project allocations (for resource planning tab)
  const [projectAllocations, setProjectAllocations] = useState<ResourceAllocation[]>([])

  useEffect(() => {
    pStore.fetchAll()
    cStore.fetchAll()
    settingsStore.fetch()
    fetchTeams()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRpRows = (projectId: string) => {
    setRpLoading(true)
    supabase
      .from('revenue_planner')
      .select('*, project:projects(id, pn, name, type)')
      .eq('project_id', projectId)
      .order('month')
      .then(({ data, error }) => {
        if (error && import.meta.env.DEV) console.error('revenue_planner fetch:', error.message)
        setRpRows((data ?? []) as RevenuePlanner[])
        setRpLoading(false)
      })
  }

  const fetchProjectMembers = (projectId: string) => {
    supabase
      .from('member_projects')
      .select('id, member_id, member:team_members(id, name)')
      .eq('project_id', projectId)
      .then(({ data, error }) => {
        if (error) { console.error('fetchProjectMembers:', error); toast('error', error.message); return }
        setProjectMembers((data ?? []) as unknown as Array<{ id: string; member_id: string; member: { id: string; name: string } }>)
      })
  }

  const fetchOrders = (projectId: string) => {
    supabase
      .from('project_orders')
      .select('*')
      .eq('project_id', projectId)
      .order('month', { ascending: false })
      .then(({ data }) => setOrders((data ?? []) as ProjectOrder[]))
  }

  useEffect(() => {
    if (!id) return
    fetchRpRows(id)
    crStore.fetchByProject(id)
    fetchDeliverables(id)
    fetchProjectMembers(id)
    fetchMembers()
    fetchOrders(id)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return
    const onFocus = () => fetchRpRows(id)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return
    supabase
      .from('resource_allocations')
      .select('*, member:team_members(id, name)')
      .eq('project_id', id)
      .order('date')
      .then(({ data }) => setProjectAllocations((data ?? []) as ResourceAllocation[]))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const project = pStore.projects.find(p => p.id === id)
  const client = project?.client
    ? cStore.clients.find(c => c.id === project.client_id) ?? project.client
    : null

  // ── derived ────────────────────────────────────────────────────────────────
  const invoiceRows = rpRows.filter(r => r.status !== 'cost')
  const costRows = rpRows.filter(r => r.status === 'cost')

  const totalInvoiced = invoiceRows.reduce((s, r) => s + (r.actual_amount ?? 0), 0)
  const totalCosts = costRows.reduce((s, r) => s + (r.actual_amount ?? 0), 0)
  const contractVal = project?.contract_value ?? null

  function crEffectiveAmount(cr: { amount?: number | null; deal_type?: string | null; monthly_schedule?: Array<{ amount: number }> | null }) {
    if (cr.deal_type === 'fixed' && cr.monthly_schedule) return cr.monthly_schedule.reduce((s, r) => s + r.amount, 0)
    return cr.amount ?? 0
  }
  const crTotal = crStore.changeRequests.reduce((s, cr) => s + crEffectiveAmount(cr), 0)
  const crApprovedTotal = crStore.changeRequests.filter(cr => cr.status === 'approved').reduce((s, cr) => s + crEffectiveAmount(cr), 0)

  // Regular rows = invoice rows that are NOT change requests
  const regularInvoiceRows = invoiceRows.filter(r => !r.notes?.includes('CR:'))

  // Effective budget differs by type:
  // - variable/maintenance: sum of regular (non-CR) planned rows only
  // - fixed: initial_contract_value or contract_value
  const variablePlannedTotal = project?.type === 'variable'
    ? regularInvoiceRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
    : null
  const maintenancePlannedTotal = project?.type === 'maintenance' && regularInvoiceRows.length > 0
    ? regularInvoiceRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
    : null
  const fixedPlannedTotal = project?.type === 'fixed' && regularInvoiceRows.length > 0
    ? regularInvoiceRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
    : null
  const effectiveBudget = project?.type === 'variable'
    ? variablePlannedTotal
    : project?.type === 'maintenance' && maintenancePlannedTotal != null
      ? maintenancePlannedTotal
      : project?.type === 'fixed' && fixedPlannedTotal != null
        ? fixedPlannedTotal
        : contractVal
  // Left to invoice = total value minus what's already been invoiced
  const leftToInvoice = Math.max(0, (effectiveBudget ?? 0) + crApprovedTotal - totalInvoiced)

  const totalValue = (effectiveBudget ?? 0) + crApprovedTotal

  const invoicedPct = totalValue > 0 && totalInvoiced
    ? Math.round((totalInvoiced / totalValue) * 100)
    : null

  // ── handlers ──────────────────────────────────────────────────────────────
  async function savePlan() {
    if (!id) return
    const valid = planRows.filter(r => r.month)
    if (valid.length === 0) return
    setPlanSaving(true)
    try {
      const { data, error } = await supabase
        .from('revenue_planner')
        .insert(valid.map(r => ({
          project_id: id,
          month: r.month + '-01',
          notes: r.description || null,
          planned_amount: r.planned_amount ? Number(r.planned_amount) : null,
          actual_amount: null,
          status: 'planned' as const,
          probability: r.probability ? Number(r.probability) : 100,
        })))
        .select('*, project:projects(id, pn, name, type)')
      if (error) throw error
      if (data) {
        setRpRows(prev => [...prev, ...(data as RevenuePlanner[])].sort((a, b) => a.month.localeCompare(b.month)))
        // Switch to the year of the first saved row so the user sees it
        const savedYear = parseInt((data as RevenuePlanner[])[0].month.slice(0, 4))
        if (!isNaN(savedYear)) setPlanYear(savedYear)
      }
      setShowAddPlan(false)
      setPlanRows([{ month: '', description: defaultPlanDescription(), planned_amount: '', probability: '100' }])
      toast('success', `${valid.length} invoice plan${valid.length !== 1 ? 's' : ''} added`)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setPlanSaving(false)
    }
  }

  async function saveCost() {
    if (!id || !costForm.month_from) return
    setCostSaving(true)
    try {
      // Generate all months in range
      const months: string[] = []
      const from = new Date(costForm.month_from + '-01T00:00:00')
      const to = costForm.month_to ? new Date(costForm.month_to + '-01T00:00:00') : from
      const cur = new Date(from)
      while (cur <= to) {
        months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-01`)
        cur.setMonth(cur.getMonth() + 1)
      }
      const { data, error } = await supabase
        .from('revenue_planner')
        .insert(months.map(month => ({
          project_id: id,
          month,
          notes: costForm.description || null,
          planned_amount: null,
          actual_amount: costForm.amount ? Number(costForm.amount) : null,
          status: 'cost' as const,
          probability: 100,
        })))
        .select('*, project:projects(id, pn, name, type)')
      if (error) throw error
      if (data) setRpRows(prev => [...prev, ...(data as RevenuePlanner[])].sort((a, b) => a.month.localeCompare(b.month)))
      setShowAddCost(false)
      setCostForm({ month_from: '', month_to: '', description: '', amount: '' })
    } finally {
      setCostSaving(false)
    }
  }

  function openEditCost(r: RevenuePlanner) {
    setEditCostRow(r)
    setEditCostForm({
      month: r.month.slice(0, 7),
      description: r.notes ?? '',
      amount: r.actual_amount != null ? String(r.actual_amount) : '',
    })
    setShowEditCost(true)
  }

  async function saveEditCost() {
    if (!editCostRow) return
    setEditCostSaving(true)
    try {
      const { data } = await supabase
        .from('revenue_planner')
        .update({
          month: editCostForm.month + '-01',
          notes: editCostForm.description || null,
          actual_amount: editCostForm.amount ? Number(editCostForm.amount) : null,
        })
        .eq('id', editCostRow.id)
        .select('*, project:projects(id, pn, name, type)')
      if (data && data.length > 0) {
        setRpRows(prev => prev.map(r => r.id === editCostRow.id ? (data[0] as RevenuePlanner) : r).sort((a, b) => a.month.localeCompare(b.month)))
      }
      setShowEditCost(false)
      setEditCostRow(null)
    } finally {
      setEditCostSaving(false)
    }
  }

  async function deleteInvoicePlan(r: RevenuePlanner) {
    const { error } = await supabase.from('revenue_planner').delete().eq('id', r.id)
    if (error) { toast('error', error.message); return }
    setRpRows(prev => prev.filter(row => row.id !== r.id))
    setDeletePlanTarget(null)
    toast('success', 'Invoice plan deleted')
  }

  async function deleteCost(id: string) {
    await supabase.from('revenue_planner').delete().eq('id', id)
    setRpRows(prev => prev.filter(r => r.id !== id))
    setDeleteCostId(null)
    toast('success', 'Cost deleted')
  }

  function openEdit(r: RevenuePlanner) {
    setEditRow(r)
    setEditForm({
      month: r.month.slice(0, 7),
      description: r.notes ?? '',
      planned_amount: r.planned_amount != null ? String(r.planned_amount) : '',
      actual_amount: r.actual_amount != null ? String(r.actual_amount) : '',
      status: r.status,
      probability: r.probability != null ? String(r.probability) : '100',
    })
    setShowEdit(true)
  }

  async function saveEdit() {
    if (!editRow) return
    setEditSaving(true)
    try {
      const { data } = await supabase
        .from('revenue_planner')
        .update({
          month: editForm.month + '-01',
          notes: editForm.description || null,
          planned_amount: editForm.planned_amount ? Number(editForm.planned_amount) : null,
          actual_amount: editForm.actual_amount ? Number(editForm.actual_amount) : null,
          status: editForm.status as RevenuePlanner['status'],
          probability: editForm.probability ? Number(editForm.probability) : null,
        })
        .eq('id', editRow.id)
        .select('*, project:projects(id, pn, name, type)')
      if (data && data.length > 0) {
        setRpRows(prev => prev.map(r => r.id === editRow.id ? (data[0] as RevenuePlanner) : r))
      }
      setShowEdit(false)
      setEditRow(null)
    } finally {
      setEditSaving(false)
    }
  }

  async function saveQuickUpdate() {
    if (!quickUpdateRow) return
    setQuickUpdateSaving(true)
    try {
      const { data } = await supabase
        .from('revenue_planner')
        .update({ planned_amount: quickUpdateAmount ? Number(quickUpdateAmount) : null })
        .eq('id', quickUpdateRow.id)
        .select('*, project:projects(id, pn, name, type)')
      if (data && data.length > 0) {
        setRpRows(prev => prev.map(r => r.id === quickUpdateRow.id ? (data[0] as RevenuePlanner) : r))
      }
      setQuickUpdateRow(null)
      setQuickUpdateAmount('')
      toast('success', 'Estimate updated')
    } catch {
      toast('error', 'Failed to update')
    } finally {
      setQuickUpdateSaving(false)
    }
  }

  function openConfirm(r: RevenuePlanner) {
    setConfirmRow(r)
    setConfirmActual(r.planned_amount != null ? String(r.planned_amount) : r.actual_amount != null ? String(r.actual_amount) : '')
    setConfirmNote('')
    setShowConfirm(true)
  }

  async function saveConfirm() {
    if (!confirmRow || !id) return
    if (!confirmNote.trim()) {
      toast('error', 'Note is required')
      return
    }
    setConfirmSaving(true)
    try {
      const actual = confirmActual ? Number(confirmActual) : (confirmRow.planned_amount ?? confirmRow.actual_amount ?? 0)
      const { data } = await supabase
        .from('revenue_planner')
        .update({ status: 'issued', actual_amount: actual })
        .eq('id', confirmRow.id)
        .select('*, project:projects(id, pn, name, type)')
      if (data && data.length > 0) {
        setRpRows(prev => prev.map(row => row.id === confirmRow.id ? (data[0] as RevenuePlanner) : row))
      }
      // Auto-mark linked CR as billed if notes match "CR: <title>"
      if (confirmRow.notes?.startsWith('CR: ')) {
        const crTitle = confirmRow.notes.slice(4)
        const linkedCR = crStore.changeRequests.find(cr => cr.title === crTitle && cr.status === 'approved')
        if (linkedCR) {
          await crStore.update(linkedCR.id, { status: 'billed' })
        }
      }
      // Auto-create approved CR for overage
      const extra = confirmRow.planned_amount != null ? actual - confirmRow.planned_amount : 0
      if (extra > 0) {
        await crStore.add({
          project_id: id,
          title: `Extra: ${fmtMonth(confirmRow.month)}`,
          description: confirmNote.trim(),
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
      setShowConfirm(false)
      setConfirmRow(null)
    } finally {
      setConfirmSaving(false)
    }
  }




  function openProjectEdit() {
    if (!project) return
    setProjectEditForm({
      pn:           project.pn ?? '',
      name:         project.name,
      client_id:    project.client_id ?? '',
      pm:           project.pm ?? '',
      value:        project.contract_value != null ? String(project.contract_value) : '',
      status:       project.status,
      start_month:  project.start_date ? project.start_date.slice(0, 7) : '',
      end_month:    project.end_date   ? project.end_date.slice(0, 7)   : '',
      contract_url:    project.contract_url ?? '',
      notes:           project.notes ?? '',
      is_maintenance:  project.is_maintenance ?? false,
      cms:             project.cms ?? '',
    })
    setShowProjectEdit(true)
  }

  async function saveProjectEdit() {
    if (!project) return
    setProjectEditSaving(true)
    try {
      await pStore.update(project.id, {
        pn:             projectEditForm.pn.trim() || project.pn,
        name:           projectEditForm.name.trim(),
        client_id:      projectEditForm.client_id || null,
        pm:             projectEditForm.pm || null,
        contract_value: projectEditForm.value ? parseFloat(projectEditForm.value) : null,
        status:         projectEditForm.status as Project['status'],
        start_date:     projectEditForm.start_month ? projectEditForm.start_month + '-01' : null,
        end_date:       projectEditForm.end_month   ? projectEditForm.end_month   + '-01' : null,
        contract_url:   projectEditForm.contract_url.trim() || null,
        notes:          projectEditForm.notes.trim() || null,
        is_maintenance: projectEditForm.is_maintenance,
        cms:            projectEditForm.cms.trim() || null,
      })
      setShowProjectEdit(false)
    } catch (e) { alert((e as Error).message) }
    finally { setProjectEditSaving(false) }
  }

  async function saveStatus(val: string) {
    if (!project) return
    setStatusSaving(true)
    try {
      await pStore.update(project.id, { status: val as Project['status'] })
      toast('success', 'Status updated')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setStatusSaving(false) }
  }


  // ── move invoice month ────────────────────────────────────────────────────
  function openMove(r: RevenuePlanner) {
    setMoveRow(r)
    setMoveForm({ month: r.month.slice(0, 7) })
    setShowMove(true)
  }

  async function saveMove() {
    if (!moveRow || !moveForm.month) return
    setMoveSaving(true)
    const targetMonth = moveForm.month + '-01'
    try {
      const { data } = await supabase
        .from('revenue_planner')
        .update({ month: targetMonth })
        .eq('id', moveRow.id)
        .select('*, project:projects(id, pn, name, type)')
      if (data && data.length > 0) {
        setRpRows(prev => prev.map(r => r.id === moveRow.id ? (data[0] as RevenuePlanner) : r).sort((a, b) => a.month.localeCompare(b.month)))
      }
      setShowMove(false)
      setMoveRow(null)
      toast('success', 'Invoice moved')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setMoveSaving(false) }
  }

  async function savePlanAgain() {
    if (!planAgainRow || !planAgainMonth) return
    setPlanAgainSaving(true)
    const amount = planAgainAmount ? Number(planAgainAmount) : (planAgainRow.planned_amount ?? 0)
    try {
      const { data, error } = await supabase
        .from('revenue_planner')
        .update({ status: 'planned', month: planAgainMonth + '-01', planned_amount: amount, actual_amount: null })
        .eq('id', planAgainRow.id)
        .select('*, project:projects(id, pn, name, type)')
      if (error) { toast('error', error.message); return }
      if (data && data.length > 0) {
        setRpRows(prev => prev.map(r => r.id === planAgainRow.id ? (data[0] as RevenuePlanner) : r).sort((a, b) => a.month.localeCompare(b.month)))
      }
      setShowPlanAgain(false)
      setPlanAgainRow(null)
      setPlanAgainAmount('')
      toast('success', 'Invoice restored to planned')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setPlanAgainSaving(false) }
  }

  // ── change request handlers ───────────────────────────────────────────────
  function openAddCR() {
    setCrForm({ title: '', status: 'pending', amount: '', description: '', probability: '50', deal_type: 'one_time', expected_month: '', expected_end_month: '', schedule: [] })
    setShowAddCR(true)
  }

  async function saveAddCR() {
    if (!id || !crForm.title.trim()) return
    setCrSaving(true)
    try {
      await crStore.add({
        project_id: id,
        title: crForm.title.trim(),
        status: crForm.status,
        amount: crForm.amount ? parseFloat(crForm.amount) : null,
        description: crForm.description.trim() || null,
        probability: parseInt(crForm.probability),
        deal_type: 'one_time',
        expected_month: crForm.expected_month ? crForm.expected_month + '-01' : null,
        expected_end_month: null,
        monthly_schedule: null,
      })
      setShowAddCR(false)
      toast('success', 'Change request added')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setCrSaving(false) }
  }

  function openEditCR(cr: ChangeRequest) {
    setEditCRTarget(cr)
    setCrForm({
      title: cr.title,
      status: cr.status === 'billed' ? 'approved' : cr.status,
      amount: cr.amount != null ? String(cr.amount) : '',
      description: cr.description ?? '',
      probability: cr.probability != null ? String(cr.probability) : '75',
      deal_type: 'one_time',
      expected_month: cr.expected_month ? cr.expected_month.slice(0, 7) : '',
      expected_end_month: '',
      schedule: [],
    })
    setShowEditCR(true)
  }

  async function saveEditCR() {
    if (!editCRTarget) return
    setCrSaving(true)
    try {
      await crStore.update(editCRTarget.id, {
        title: crForm.title.trim(),
        status: crForm.status,
        amount: crForm.amount ? parseFloat(crForm.amount) : null,
        description: crForm.description.trim() || null,
        probability: parseInt(crForm.probability),
        deal_type: 'one_time',
        expected_month: crForm.expected_month ? crForm.expected_month + '-01' : null,
        expected_end_month: null,
        monthly_schedule: null,
      })
      setShowEditCR(false)
      setEditCRTarget(null)
      toast('success', 'Change request updated')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setCrSaving(false) }
  }

  async function saveEditCRAndPlan() {
    if (!editCRTarget || !id) return
    setCrSaving(true)
    const title = crForm.title.trim()
    const crNote = `CR: ${title}`
    try {
      await crStore.update(editCRTarget.id, {
        title,
        status: 'approved',
        amount: crForm.amount ? parseFloat(crForm.amount) : null,
        description: crForm.description.trim() || null,
        probability: parseInt(crForm.probability),
        deal_type: 'one_time',
        expected_month: crForm.expected_month ? crForm.expected_month + '-01' : null,
        expected_end_month: null,
        monthly_schedule: null,
      })

      // Build rows to plan
      type PlanRow = { month: string; amount: number | null }
      const planRows: PlanRow[] = crForm.expected_month
        ? [{ month: crForm.expected_month + '-01', amount: crForm.amount ? parseFloat(crForm.amount) : null }]
        : []

      for (const row of planRows) {
        const { data, error } = await supabase.from('revenue_planner')
          .insert({ project_id: id, month: row.month, notes: crNote, planned_amount: row.amount, actual_amount: null, status: 'planned' as const, probability: 100 })
          .select('*, project:projects(id, pn, name, type)')
        if (error) { toast('error', error.message); return }
        if (data) setRpRows(prev => [...prev, ...(data as RevenuePlanner[])].sort((a, b) => a.month.localeCompare(b.month)))
      }

      // Upsert pipeline entry as won if we planned
      if (planRows.length > 0 && project?.client_id) {
        const { data: existing } = await supabase.from('pipeline_items')
          .select('id').eq('title', title).eq('client_id', project.client_id).limit(1)
        if (existing && existing.length > 0) {
          await supabase.from('pipeline_items').update({ status: 'won' }).eq('id', existing[0].id)
        } else {
          await supabase.from('pipeline_items').insert({
            client_id: project.client_id,
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

      setShowEditCR(false)
      setEditCRTarget(null)
      toast('success', planRows.length > 0 ? 'Saved & added to invoice plan + pipeline' : 'Change request updated')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setCrSaving(false) }
  }

  async function deleteCR(cr: ChangeRequest) {
    try {
      await crStore.remove(cr.id)
      setDeleteCRTarget(null)
      toast('success', 'Change request deleted')
    } catch (e) { toast('error', (e as Error).message) }
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
      const { data, error } = await supabase
        .from('revenue_planner')
        .insert({
          project_id: id,
          month: planCRMonth + '-01',
          notes: `CR: ${planCRTarget.title}`,
          planned_amount: planCRAmount ? Number(planCRAmount) : null,
          actual_amount: null,
          status: 'planned' as const,
          probability: 100,
        })
        .select('*, project:projects(id, pn, name, type)')
      if (error) { toast('error', error.message); return }
      if (data) setRpRows(prev => [...prev, ...(data as RevenuePlanner[])].sort((a, b) => a.month.localeCompare(b.month)))
      // Upsert pipeline entry as won (planned = confirmed)
      if (project?.client_id) {
        const { data: existing } = await supabase.from('pipeline_items')
          .select('id').eq('title', planCRTarget.title).eq('client_id', project.client_id).limit(1)
        if (existing && existing.length > 0) {
          await supabase.from('pipeline_items').update({ status: 'won' }).eq('id', existing[0].id)
        } else {
          await supabase.from('pipeline_items').insert({
            client_id: project.client_id,
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
      toast('success', 'Added to Invoice Plan & Pipeline')
      setShowPlanCR(false)
      setPlanCRTarget(null)
      setPlanCRAmount('')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setPlanCRSaving(false) }
  }

  // ── loading / not found ────────────────────────────────────────────────────
  if (pStore.loading) {
    return (
      <div className="flex-1 overflow-auto p-6 text-center pt-16 text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex-1 overflow-auto p-6 pt-10">
        <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c]">Project not found.</div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/projects')}>
          ← Back to Projects
        </Button>
      </div>
    )
  }

  const clientLink = client
    ? <Link to={`/clients/${project.client_id}`} className="font-semibold text-primary no-underline">{client.name}</Link>
    : <span className="text-muted-foreground">—</span>

  const TYPE_LABEL: Record<string, string> = { fixed: 'Fixed', maintenance: 'Recurring', variable: 'Variable' }
  const typeBadge = (
    <Badge variant={TYPE_BADGE[project.type] ?? 'gray'}>
      {TYPE_LABEL[project.type] ?? cap(project.type)}
    </Badge>
  )

  const valueLabel = project.type === 'variable'
    ? fmt(variablePlannedTotal)
    : project.type === 'maintenance'
      ? (maintenancePlannedTotal != null ? fmt(maintenancePlannedTotal) : contractVal != null ? `${contractVal.toLocaleString()} €/mo` : '—')
      : (project.initial_contract_value ?? contractVal) != null ? fmt(project.initial_contract_value ?? contractVal) : '—'

  // ── deliverable helpers ───────────────────────────────────────────────────
  const computeDelHours = (teamList: string[], teamHrs: Record<string, number>, fallback: number | '') => {
    if (teamList.length > 1) {
      const sum = teamList.reduce((s, t) => s + (teamHrs[t] ?? 0), 0)
      return sum || null
    }
    return (fallback as number) || null
  }

  const resetDelForm = () => {
    setDelTitle(''); setDelDue(''); setDelStartDate(''); setDelHours(''); setDelTeam([]); setDelTeamHours({}); setDelMemberPercentages({})
  }

  const openEditDeliverable = (d: import('../lib/types').ProjectDeliverable) => {
    setEditDeliverableTarget(d)
    setDelTitle(d.title)
    setDelDue(d.due_date)
    setDelStartDate(d.start_date ?? '')
    setDelHours(d.estimated_hours ?? '')
    const savedTeam = d.team ? d.team.split(',').map(t => t.trim()) : []
    setDelTeam(savedTeam)
    setDelTeamHours((d.team_hours as Record<string, number>) ?? {})
    setDelMemberPercentages((d.member_percentages as Record<string, number>) ?? {})
    setShowDeliverableModal(true)
  }

  // ── deliverable handlers ──────────────────────────────────────────────────
  const handleAddDeliverable = async () => {
    const teamHrsPayload = delTeam.length > 1 ? delTeamHours : null
    const totalHours = computeDelHours(delTeam, delTeamHours, delHours)
    try {
      await addDeliverable({
        project_id: id!,
        title: delTitle.trim(),
        due_date: delDue,
        start_date: delStartDate || null,
        estimated_hours: totalHours,
        team: delTeam.length > 0 ? delTeam.join(', ') : null,
        team_hours: teamHrsPayload,
        member_percentages: Object.keys(delMemberPercentages).length > 0 ? delMemberPercentages : null,
        status: 'active',
        notes: null,
      })
      toast('success', 'Deliverable added')
      setShowDeliverableModal(false)
      resetDelForm()
    } catch { toast('error', 'Failed to add deliverable') }
  }

  const handleSaveDeliverable = async () => {
    if (!editDeliverableTarget) return
    const teamHrsPayload = delTeam.length > 1 ? delTeamHours : null
    const totalHours = computeDelHours(delTeam, delTeamHours, delHours)
    try {
      await updateDeliverable(editDeliverableTarget.id, {
        title: delTitle.trim(),
        due_date: delDue,
        start_date: delStartDate || null,
        estimated_hours: totalHours,
        team: delTeam.length > 0 ? delTeam.join(', ') : null,
        team_hours: teamHrsPayload,
        member_percentages: Object.keys(delMemberPercentages).length > 0 ? delMemberPercentages : null,
      })
      toast('success', 'Deliverable updated')
      setShowDeliverableModal(false)
      setEditDeliverableTarget(null)
      resetDelForm()
    } catch { toast('error', 'Failed to update deliverable') }
  }

  const handleToggleDeliverable = async (d: ProjectDeliverable) => {
    try {
      await updateDeliverable(d.id, { status: d.status === 'completed' ? 'active' : 'completed' })
      toast('success', d.status === 'completed' ? 'Reopened' : 'Marked complete')
    } catch { toast('error', 'Failed to update') }
  }

  const handleRemoveDeliverable = async (delId: string) => {
    try {
      await removeDeliverable(delId)
      toast('success', 'Deliverable removed')
    } catch { toast('error', 'Failed to remove') }
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  async function handleAddOrder() {
    if (!id || !project) return
    if (!orderForm.offer_ref.trim() || !orderForm.amount || !orderForm.month) return
    setOrderSaving(true)
    try {
      const month = orderForm.month + '-01'
      // Insert revenue_planner row first
      const { data: rpRow, error: rpErr } = await supabase
        .from('revenue_planner')
        .insert({
          project_id: id,
          month,
          notes: `${orderForm.offer_ref}${orderForm.po_number ? ` · PO: ${orderForm.po_number}` : ''} — ${orderForm.description}`,
          planned_amount: parseFloat(orderForm.amount),
          actual_amount: null,
          status: 'planned' as const,
          probability: 100,
        })
        .select('id')
        .single()
      if (rpErr) throw rpErr
      // Insert order row linked to RP row
      const { data: orderRow, error: orderErr } = await supabase
        .from('project_orders')
        .insert({
          project_id: id,
          offer_ref: orderForm.offer_ref.trim(),
          po_number: orderForm.po_number.trim() || null,
          description: orderForm.description.trim(),
          amount: parseFloat(orderForm.amount),
          month,
          revenue_planner_id: rpRow.id,
        })
        .select('*')
        .single()
      if (orderErr) throw orderErr
      setOrders(prev => [orderRow as ProjectOrder, ...prev])
      setRpRows(prev => [...prev].sort((a, b) => a.month.localeCompare(b.month)))
      fetchRpRows(id)
      setShowAddOrder(false)
      setOrderForm({ offer_ref: '', po_number: '', description: '', amount: '', month: '' })
      toast('success', 'Order added to invoice plan')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setOrderSaving(false)
    }
  }

  async function handleDeleteOrder(order: ProjectOrder) {
    try {
      if (order.revenue_planner_id) {
        await supabase.from('revenue_planner').delete().eq('id', order.revenue_planner_id)
      }
      await supabase.from('project_orders').delete().eq('id', order.id)
      setOrders(prev => prev.filter(o => o.id !== order.id))
      if (id) fetchRpRows(id)
      setDeleteOrderTarget(null)
      toast('success', 'Order deleted')
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  return (
    <div>
      {/* ── Project edit modal ── */}
      {showProjectEdit && (
        <Modal title="Edit Project" onClose={() => setShowProjectEdit(false)}>
          <div className="grid grid-cols-2 gap-3 mb-4" style={{ gridTemplateColumns: '130px 1fr' }}>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project #</label>
              <input value={projectEditForm.pn} onChange={e => setProjectEditForm(f => ({ ...f, pn: e.target.value }))} className="font-mono" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project name</label>
              <input value={projectEditForm.name} onChange={e => setProjectEditForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
          </div>
          {project?.type !== 'internal' && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Client</label>
              <Select
                value={projectEditForm.client_id}
                onChange={val => setProjectEditForm(f => ({ ...f, client_id: val }))}
                placeholder="— No client —"
                options={cStore.clients.map(c => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project Manager</label>
              <Select
                value={projectEditForm.pm}
                onChange={val => setProjectEditForm(f => ({ ...f, pm: val }))}
                options={pmOptions}
              />
            </div>
          </div>
          )}
          {project?.type === 'internal' && (
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project Manager</label>
            <Select
              value={projectEditForm.pm}
              onChange={val => setProjectEditForm(f => ({ ...f, pm: val }))}
              options={pmOptions}
            />
          </div>
          )}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {project?.type !== 'internal' && (
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Value (€)</label>
              <input type="number" value={projectEditForm.value} onChange={e => setProjectEditForm(f => ({ ...f, value: e.target.value }))} />
            </div>
            )}
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Status</label>
              <Select
                value={projectEditForm.status}
                onChange={val => setProjectEditForm(f => ({ ...f, status: val }))}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'paused', label: 'Paused' },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Start month</label>
              <input type="month" value={projectEditForm.start_month} onChange={e => setProjectEditForm(f => ({ ...f, start_month: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">End month</label>
              <input type="month" value={projectEditForm.end_month} onChange={e => setProjectEditForm(f => ({ ...f, end_month: e.target.value }))} />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Contract URL <span className="text-xs text-muted-foreground ml-1">optional</span></label>
            <input type="url" value={projectEditForm.contract_url} onChange={e => setProjectEditForm(f => ({ ...f, contract_url: e.target.value }))} placeholder="https://..." />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">CMS / Technology <span className="text-xs text-muted-foreground ml-1">optional</span></label>
            <Select
              value={projectEditForm.cms}
              onChange={val => setProjectEditForm(f => ({ ...f, cms: val }))}
              placeholder="— Select CMS —"
              options={[{ value: '', label: '— None —' }, ...settingsStore.cmsOptions.map(c => ({ value: c, label: c }))]}
            />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Notes <span className="text-xs text-muted-foreground ml-1">optional</span></label>
            <textarea rows={3} value={projectEditForm.notes} onChange={e => setProjectEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any internal notes about this project…" className="w-full resize-y" />
          </div>
          {project?.type !== 'internal' && (
            <label className="flex items-center gap-2.5 mb-5 cursor-pointer">
              <input type="checkbox" checked={projectEditForm.is_maintenance} onChange={e => setProjectEditForm(f => ({ ...f, is_maintenance: e.target.checked }))} style={{ width: 16, height: 16, accentColor: 'var(--navy)' }} />
              <div>
                <div className="text-[13px] font-semibold">Is Maintenance</div>
                <div className="text-xs text-muted-foreground">Include this project in maintenance planning</div>
              </div>
            </label>
          )}
          <div className="flex gap-2 justify-end mt-6">
            <Button variant="outline" size="sm" onClick={() => setShowProjectEdit(false)}>Cancel</Button>
            <Button size="sm" onClick={saveProjectEdit} disabled={projectEditSaving}>
              {projectEditSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Confirm issue modal ── */}
      {showConfirm && confirmRow && (
        <Modal title="Confirm Invoice Issued" onClose={() => { setShowConfirm(false); setConfirmRow(null) }}>
          <p className="text-[13px] text-[#374151] mb-4">
            Mark this invoice as <strong>issued</strong> and record the actual amount invoiced.
          </p>
          <div className="bg-[#f9fafb] border border-border rounded-lg px-4 py-3 mb-5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Month</div>
                <div className="text-sm font-semibold">{fmtMonth(confirmRow.month)}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">Planned</div>
                <div className="text-sm font-semibold">{confirmRow.planned_amount != null ? fmt(confirmRow.planned_amount) : '—'}</div>
              </div>
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Actual amount invoiced (€)</label>
            <input
              type="number"
              value={confirmActual}
              onChange={e => setConfirmActual(e.target.value)}
              autoFocus
            />
            {confirmRow.planned_amount != null && Number(confirmActual) > confirmRow.planned_amount && (
              <div className="mt-1.5 px-2.5 py-1.5 bg-[rgba(245,180,50,0.12)] border border-[var(--amber)] rounded text-xs text-foreground">
                +{fmt(Number(confirmActual) - confirmRow.planned_amount)} over planned — will auto-create an approved change request
              </div>
            )}
          </div>
          <div className="mb-5">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Note <span className="text-[#dc2626]">*</span></label>
            <input
              type="text"
              placeholder="e.g. Extra scope added, client approved verbally"
              value={confirmNote}
              onChange={e => setConfirmNote(e.target.value)}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setShowConfirm(false); setConfirmRow(null) }}>Cancel</Button>
            <Button size="sm" onClick={saveConfirm} disabled={confirmSaving || !confirmNote.trim()}>
              {confirmSaving ? 'Saving…' : '✓ Confirm Issued'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Add invoice plan modal ── */}
      {showAddPlan && (
        <Modal title="Add Invoice Plans" maxWidth={760} onClose={() => { setShowAddPlan(false); setPlanRows([{ month: '', description: defaultPlanDescription(), planned_amount: '', probability: '100' }]) }}>
          {/* column headers */}
          <div className="grid gap-x-2 gap-y-1 mb-1" style={{ gridTemplateColumns: '130px 1fr 100px 110px 28px' }}>
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Month</span>
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Description</span>
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Amount (€)</span>
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">Issue likelihood</span>
            <span />
          </div>
          {planRows.map((row, i) => (
            <div key={i} className="grid gap-x-2 items-center mb-1.5" style={{ gridTemplateColumns: '130px 1fr 100px 110px 28px' }}>
              <input
                type="month"
                value={row.month}
                onChange={e => setPlanRows(rows => rows.map((r, idx) => idx === i ? { ...r, month: e.target.value } : r))}
              />
              <input
                placeholder="Invoice #1 — Design"
                value={row.description}
                onChange={e => setPlanRows(rows => rows.map((r, idx) => idx === i ? { ...r, description: e.target.value } : r))}
              />
              <input
                type="number"
                placeholder="0"
                value={row.planned_amount}
                onChange={e => setPlanRows(rows => rows.map((r, idx) => idx === i ? { ...r, planned_amount: e.target.value } : r))}
              />
              <Select
                value={row.probability}
                onChange={val => setPlanRows(rows => rows.map((r, idx) => idx === i ? { ...r, probability: val } : r))}
                options={[
                  { value: '25', label: '25%' },
                  { value: '50', label: '50%' },
                  { value: '100', label: '100%' },
                ]}
              />
              <button
                type="button"
                onClick={() => setPlanRows(rows => rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows)}
                disabled={planRows.length === 1}
                className={`bg-transparent border-none cursor-pointer text-[#dc2626] text-lg leading-none p-0 ${planRows.length === 1 ? 'opacity-30' : ''}`}
              >×</button>
            </div>
          ))}
          <Button variant="ghost" size="xs" type="button" className="mt-1 mb-3"
            onClick={() => setPlanRows(rows => [...rows, { month: '', description: defaultPlanDescription(), planned_amount: '', probability: '100' }])}
          >
            + Add row
          </Button>
          {leftToInvoice != null && (() => {
            const adding = planRows.reduce((s, r) => s + (parseFloat(r.planned_amount) || 0), 0)
            const remaining = leftToInvoice - adding
            const isOver = remaining < 0
            return adding > 0 ? (
              <div className={`flex justify-between items-center rounded px-3 py-2 text-xs mb-4 border ${isOver ? 'bg-[rgba(220,53,69,0.07)] border-[var(--red)]' : 'bg-[rgba(0,0,0,0.03)] border-border'}`}>
                <span className="text-muted-foreground">
                  Adding: <strong className="text-foreground">{fmt(adding)}</strong>
                  <span className="mx-2 text-[var(--c5)]">·</span>
                  Already invoiced: <strong className="text-foreground">{fmt(totalInvoiced)}</strong>
                </span>
                <span className={`font-bold ${isOver ? 'text-[#dc2626]' : 'text-primary'}`}>
                  {isOver ? `${fmt(Math.abs(remaining))} over budget` : `${fmt(remaining)} left after`}
                </span>
              </div>
            ) : null
          })()}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setShowAddPlan(false); setPlanRows([{ month: '', description: defaultPlanDescription(), planned_amount: '', probability: '100' }]) }}>Cancel</Button>
            <Button size="sm" onClick={savePlan} disabled={planSaving || planRows.every(r => !r.month)}>
              {planSaving ? 'Saving…' : `Save ${planRows.filter(r => r.month).length || ''} plan${planRows.filter(r => r.month).length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Add cost modal ── */}
      {showAddCost && (
        <Modal title="Add Cost" onClose={() => { setShowAddCost(false); setCostForm({ month_from: '', month_to: '', description: '', amount: '' }) }}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">From month</label>
              <input
                type="month"
                value={costForm.month_from}
                onChange={e => setCostForm(f => ({ ...f, month_from: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">
                To month <span className="text-xs text-muted-foreground ml-1">optional — for recurring</span>
              </label>
              <input
                type="month"
                value={costForm.month_to}
                onChange={e => setCostForm(f => ({ ...f, month_to: e.target.value }))}
              />
            </div>
          </div>
          {costForm.month_from && costForm.month_to && costForm.month_to > costForm.month_from && (
            <div className="rounded-lg border border-[#fcd34d] bg-[#fef9ee] px-3 py-2 text-xs text-[#92400e] mb-4">
              Will create one cost entry per month from {costForm.month_from} to {costForm.month_to}
            </div>
          )}
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Description</label>
            <input
              placeholder="e.g. Freelancer payment"
              value={costForm.description}
              onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€) per month</label>
            <input
              type="number"
              placeholder="0"
              value={costForm.amount}
              onChange={e => setCostForm(f => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="outline" size="sm" onClick={() => { setShowAddCost(false); setCostForm({ month_from: '', month_to: '', description: '', amount: '' }) }}>Cancel</Button>
            <Button size="sm" onClick={saveCost} disabled={costSaving || !costForm.month_from}>
              {costSaving ? 'Saving…' : 'Add Cost'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Delete cost confirm ── */}
      <ConfirmDialog
        open={!!deleteCostId}
        title="Delete Cost"
        message="Are you sure you want to delete this cost? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteCostId && deleteCost(deleteCostId)}
        onCancel={() => setDeleteCostId(null)}
      />

      {/* ── Delete invoice plan confirm ── */}
      <ConfirmDialog
        open={!!deletePlanTarget}
        title="Delete invoice plan"
        message={deletePlanTarget ? `Delete ${fmtMonth(deletePlanTarget.month)}${deletePlanTarget.notes ? ` — ${deletePlanTarget.notes}` : ''}${deletePlanTarget.planned_amount != null ? ` (${fmt(deletePlanTarget.planned_amount)})` : ''}? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={() => deletePlanTarget && deleteInvoicePlan(deletePlanTarget)}
        onCancel={() => setDeletePlanTarget(null)}
      />

      {/* ── Delete CR confirm ── */}
      <ConfirmDialog
        open={!!deleteCRTarget}
        title="Delete change request"
        message={deleteCRTarget ? `Delete "${deleteCRTarget.title}"${deleteCRTarget.amount != null ? ` (${fmt(deleteCRTarget.amount)})` : ''}? This cannot be undone.` : ''}
        confirmLabel="Delete"
        onConfirm={() => deleteCRTarget && deleteCR(deleteCRTarget)}
        onCancel={() => setDeleteCRTarget(null)}
      />

      {/* ── Edit cost modal ── */}
      {showEditCost && editCostRow && (
        <Modal title="Edit Cost" onClose={() => { setShowEditCost(false); setEditCostRow(null) }}>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Month</label>
            <input
              type="month"
              value={editCostForm.month}
              onChange={e => setEditCostForm(f => ({ ...f, month: e.target.value }))}
            />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Description</label>
            <input
              value={editCostForm.description}
              onChange={e => setEditCostForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Freelancer payment"
            />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€)</label>
            <input
              type="number"
              value={editCostForm.amount}
              onChange={e => setEditCostForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0"
            />
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="outline" size="sm" onClick={() => { setShowEditCost(false); setEditCostRow(null) }}>Cancel</Button>
            <Button size="sm" onClick={saveEditCost} disabled={editCostSaving}>
              {editCostSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Quick update estimate modal ── */}
      {quickUpdateRow && (
        <Modal title="Update estimate" onClose={() => { setQuickUpdateRow(null); setQuickUpdateAmount('') }} maxWidth={360}>
          <div className="text-[13px] text-muted-foreground mb-1.5">
            {fmtMonth(quickUpdateRow.month)}
          </div>
          <div className="mb-5">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€)</label>
            <input
              type="number"
              value={quickUpdateAmount}
              onChange={e => setQuickUpdateAmount(e.target.value)}
              autoFocus
              placeholder="0"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setQuickUpdateRow(null); setQuickUpdateAmount('') }}>Cancel</Button>
            <Button size="sm" onClick={saveQuickUpdate} disabled={quickUpdateSaving}>
              {quickUpdateSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Edit invoice row modal ── */}
      {showEdit && editRow && (
        <Modal title="Edit Invoice Row" onClose={() => { setShowEdit(false); setEditRow(null) }}>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Month</label>
            <input
              type="month"
              value={editForm.month}
              onChange={e => setEditForm(f => ({ ...f, month: e.target.value }))}
            />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Notes / description</label>
            <input
              value={editForm.description}
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Planned (€)</label>
              <input
                type="number"
                value={editForm.planned_amount}
                onChange={e => setEditForm(f => ({ ...f, planned_amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Actual (€)</label>
              <input
                type="number"
                value={editForm.actual_amount}
                onChange={e => setEditForm(f => ({ ...f, actual_amount: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Status</label>
              <Select
                value={editForm.status}
                onChange={val => setEditForm(f => ({ ...f, status: val }))}
                options={[
                  { value: 'planned', label: 'Planned' },
                  { value: 'issued', label: 'Issued' },
                  { value: 'paid', label: 'Paid' },
                ]}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Issue likelihood</label>
              <Select value={editForm.probability} onChange={val => setEditForm(f => ({ ...f, probability: val }))} options={CR_PROB_OPTS} />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="outline" size="sm" onClick={() => { setShowEdit(false); setEditRow(null) }}>Cancel</Button>
            <Button size="sm" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Plan again modal ── */}
      {showPlanAgain && planAgainRow && (
        <Modal title="Plan Again" onClose={() => { setShowPlanAgain(false); setPlanAgainRow(null) }}>
          <p className="text-[13px] text-[#374151] mb-4">
            Restore <strong>{planAgainRow.notes ?? fmtMonth(planAgainRow.month)}</strong> to planned. Choose the target month:
          </p>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Invoice month</label>
            <input type="month" value={planAgainMonth} onChange={e => setPlanAgainMonth(e.target.value)} autoFocus />
          </div>
          <div className="mb-5">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€)</label>
            <input type="number" value={planAgainAmount} onChange={e => setPlanAgainAmount(e.target.value)} placeholder={planAgainRow.planned_amount?.toString() ?? ''} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setShowPlanAgain(false); setPlanAgainRow(null) }}>Cancel</Button>
            <Button size="sm" onClick={savePlanAgain} disabled={planAgainSaving || !planAgainMonth}>
              {planAgainSaving ? 'Saving…' : 'Restore to planned'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Move invoice month modal ── */}
      {showMove && moveRow && (
        <Modal title="Move Invoice to Another Month" onClose={() => { setShowMove(false); setMoveRow(null) }}>
          <p className="text-[13px] text-[#374151] mb-4">
            Current month: <strong>{fmtMonth(moveRow.month)}</strong>
          </p>
          <div className="mb-5">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">New month</label>
            <input type="month" value={moveForm.month} onChange={e => setMoveForm({ month: e.target.value })} autoFocus />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => { setShowMove(false); setMoveRow(null) }}>Cancel</Button>
            <Button size="sm" onClick={saveMove} disabled={moveSaving || !moveForm.month || moveForm.month === moveRow.month.slice(0, 7)}>
              {moveSaving ? 'Saving…' : 'Move'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Add change request modal ── */}
      {showAddCR && (
        <Modal title="Add Change Request" onClose={() => setShowAddCR(false)}>
          <CRModalFields form={crForm} setForm={setCrForm} autoFocus />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowAddCR(false)}>Cancel</Button>
            <Button size="sm" onClick={saveAddCR} disabled={crSaving || !crForm.title.trim()}>
              {crSaving ? 'Saving…' : 'Add Change Request'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Edit change request modal ── */}
      {showEditCR && editCRTarget && (
        <Modal title="Edit Change Request" onClose={() => { setShowEditCR(false); setEditCRTarget(null) }}>
          <CRModalFields form={crForm} setForm={setCrForm} />
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

      {/* ── Plan CR invoice modal ── */}
      {showPlanCR && planCRTarget && (
        <Modal title="Plan Invoice" onClose={() => { setShowPlanCR(false); setPlanCRTarget(null) }}>
          <p className="text-[13px] text-[#374151] mb-4">
            Adding invoice plan for change request: <strong>{planCRTarget.title}</strong>
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Invoice month <span className="text-[#dc2626]">*</span></label>
              <input type="month" value={planCRMonth} onChange={e => setPlanCRMonth(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€)</label>
              <input type="number" value={planCRAmount} onChange={e => setPlanCRAmount(e.target.value)} placeholder="0" />
            </div>
          </div>
          {planCRMonth && (
            <div className="rounded-lg border border-[#fcd34d] bg-[#fef9ee] px-3 py-2 text-xs text-[#92400e] mb-1">
              Will add a planned invoice row for {fmtMonth(planCRMonth + '-01')} — {planCRAmount ? fmt(Number(planCRAmount)) : 'no amount set'}
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

      {/* ── Page header ── */}
      <div className="flex items-start justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.4px]">{project.name}</h1>
            {project.pn && <Badge variant="gray" className="text-xs">{project.pn}</Badge>}
            {typeBadge}
            {project.is_maintenance && <Badge variant="amber">Maintenance</Badge>}
            <Badge variant={project.status === 'active' ? 'green' : project.status === 'paused' ? 'amber' : 'gray'}>
              {cap(project.status)}
            </Badge>
          </div>
          <div className="mt-1 text-[13px] text-muted-foreground">{clientLink}</div>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex gap-0.5 bg-[var(--c7)] rounded-lg p-[3px]">
            {(['active', 'paused', 'completed'] as const).map(s => {
              const isSelected = project.status === s
              const activeColor = s === 'active' ? 'text-[#16a34a]' : s === 'paused' ? 'text-[#d97706]' : 'text-muted-foreground'
              return (
                <button
                  key={s}
                  disabled={statusSaving}
                  onClick={() => { if (!isSelected) saveStatus(s) }}
                  className={`px-3 py-1.5 rounded border-none font-[inherit] text-xs transition-all ${
                    isSelected
                      ? `bg-white font-bold shadow-sm ${activeColor}`
                      : 'bg-transparent font-medium text-muted-foreground cursor-pointer'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              )
            })}
          </div>
          <Button variant="outline" size="sm" onClick={openProjectEdit}>Edit Project</Button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="px-7">
        {project.type === 'internal' ? (
          <div className="grid gap-4 mb-6 py-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {(() => {
              const activeDelivs = deliverables.filter(d => d.status !== 'completed')
              const estHours = activeDelivs.reduce((s, d) => s + (d.estimated_hours ?? 0), 0)
              const internalRate = settingsStore.internalHourlyRate ?? 0
              const internalCost = estHours * internalRate
              return (<>
                <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
                  <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Estimated Hours</div>
                  <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{estHours > 0 ? `${estHours}h` : '—'}</div>
                  <div className="text-xs text-muted-foreground mt-1">active deliverables</div>
                </div>
                <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
                  <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Internal Cost</div>
                  <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{internalCost > 0 ? `${internalCost.toLocaleString()} €` : '—'}</div>
                  <div className="text-xs text-muted-foreground mt-1">{internalRate > 0 ? `${internalRate} €/h` : 'set rate in settings'}</div>
                </div>
                <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
                  <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Deliverables</div>
                  <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{deliverables.length > 0 ? deliverables.length : '—'}</div>
                  <div className="text-xs text-muted-foreground mt-1">{activeDelivs.length} active</div>
                </div>
              </>)
            })()}
          </div>
        ) : (
        <div className="grid gap-4 mb-6 py-4" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Initial Value</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{valueLabel}</div>
            {project.type === 'fixed' && project.initial_contract_value != null && contractVal != null && project.initial_contract_value !== contractVal && (
              <div className={`text-xs mt-1 ${contractVal > project.initial_contract_value ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>
                current: {fmt(contractVal)}
              </div>
            )}
            {project.type === 'maintenance' && maintenancePlannedTotal != null && regularInvoiceRows.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                {Math.round(maintenancePlannedTotal / regularInvoiceRows.length).toLocaleString()} €/mo avg × {regularInvoiceRows.length} mo
              </div>
            )}
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Total Value</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-primary">{totalValue > 0 ? fmt(totalValue) : '—'}</div>
            <div className="text-xs text-muted-foreground mt-1">{project.type === 'fixed' ? 'initial + approved CRs' : 'planned + approved CRs'}</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Actual Invoiced</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#16a34a]">{totalInvoiced > 0 ? fmt(totalInvoiced) : '—'}</div>
            {invoicedPct != null && <div className="text-xs text-muted-foreground mt-1">{invoicedPct}% of total</div>}
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Change Requests</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{crTotal > 0 ? fmt(crTotal) : '—'}</div>
            {crApprovedTotal > 0 && <div className="text-xs text-muted-foreground mt-1">{fmt(crApprovedTotal)} approved</div>}
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Costs</div>
            <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${totalCosts > 0 ? 'text-[#dc2626]' : 'text-foreground'}`}>{totalCosts > 0 ? fmt(totalCosts) : '—'}</div>
          </div>
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Left to Invoice</div>
            <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${leftToInvoice > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{leftToInvoice > 0 ? fmt(leftToInvoice) : '—'}</div>
            <div className="text-xs text-muted-foreground mt-1">planned, not yet issued</div>
          </div>
        </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="px-7 flex mt-1">
        {([
          ['overview', 'Overview'],
          ...(project.type !== 'internal' ? [['invoice', 'Invoice Planning']] as const : []),
          ...(project.type === 'variable' ? [['orders', 'Orders']] as const : []),
          ['resource', 'Resource Planning'],
          ['tools', 'Tools'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 border-none bg-transparent cursor-pointer font-[inherit] text-[13px] transition-all -mb-0.5 ${
              tab === key
                ? 'font-bold text-primary border-b-2 border-primary'
                : 'font-medium text-muted-foreground border-b-2 border-transparent'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <div className="grid gap-6 items-start" style={{ gridTemplateColumns: '1fr 260px' }}>
            {/* Left column */}
            <div>
              {/* Project Details */}
              <Card className="mb-5">
                <div className="px-5 py-3.5 border-b border-border">
                  <h3 className="m-0 text-[15px] font-bold">Project Details</h3>
                </div>
                <div className="p-5 grid gap-x-8 gap-y-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  {project.pn && (
                    <div className="col-span-2 pb-4 border-b border-border">
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Project #</div>
                      <div className="text-xl font-extrabold text-foreground">{project.pn}</div>
                    </div>
                  )}
                  <div>
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Client</div>
                    <div className="text-sm font-semibold">{clientLink}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Project Manager</div>
                    <div className="text-sm">{project.pm ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Initial Value</div>
                    <div className="text-sm font-bold text-primary">{valueLabel}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Start Month</div>
                    <div className="text-sm">{project.start_date ? fmtMonth(project.start_date.slice(0, 7) + '-01') : '—'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Est. Launch</div>
                    <div className="text-sm">{project.end_date ? fmtMonth(project.end_date.slice(0, 7) + '-01') : '—'}</div>
                  </div>
                  {project.contract_url && (
                    <div>
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Contract</div>
                      <a
                        href={safeUrl(project.contract_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] text-primary inline-flex items-center gap-1"
                      >
                        View Contract
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    </div>
                  )}
                  {project.notes && (
                    <div className="col-span-2">
                      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Notes</div>
                      <div className="text-[13px] text-[#374151] whitespace-pre-wrap leading-relaxed">{project.notes}</div>
                    </div>
                  )}
                </div>
              </Card>

              {/* Budget Utilization */}
              {project.type !== 'internal' && <Card className="mb-5">
                <div className="px-5 py-3.5 border-b border-border">
                  <h3 className="m-0 text-[15px] font-bold">Budget Utilization</h3>
                </div>
                <div className="p-5">
                  {totalValue > 0 ? (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[13px] text-muted-foreground">{invoicedPct ?? 0}% invoiced</span>
                        <span className="text-[13px] font-bold">{fmt(totalInvoiced)} / {fmt(totalValue)}</span>
                      </div>
                      <div className="bg-border rounded h-2 overflow-hidden mb-5">
                        <div className="h-full bg-primary rounded" style={{ width: `${Math.min(100, invoicedPct ?? 0)}%` }} />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Total Value</div>
                          <div className="text-base font-bold">{fmt(totalValue)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Invoiced</div>
                          <div className="text-base font-bold text-[#16a34a]">{fmt(totalInvoiced)}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Remaining</div>
                          <div className={`text-base font-bold ${leftToInvoice > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{fmt(leftToInvoice)}</div>
                        </div>
                      </div>
                      {totalCosts > 0 && (
                        <div className="mt-4 pt-4 border-t border-border flex justify-between text-[13px]">
                          <span className="text-muted-foreground">Project costs</span>
                          <span className="text-[#dc2626] font-bold">{fmt(totalCosts)}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-muted-foreground text-[13px] text-center py-3">No invoice data yet</div>
                  )}
                </div>
              </Card>}

              {/* Team Allocation */}
              <Card>
                <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                  <h3 className="m-0 text-[15px] font-bold">Team</h3>
                  <Button size="sm" onClick={() => { setAddMemberIds([]); setShowAddMember(true) }}>+ Add</Button>
                </div>
                <div className="px-5 py-4">
                  {projectMembers.length === 0 ? (
                    <p className="text-muted-foreground text-[13px] m-0 text-center">No team members assigned yet</p>
                  ) : (
                    <div className="flex flex-wrap gap-2.5">
                      {projectMembers.map(pm => (
                        <div key={pm.id} className="flex items-center gap-2 bg-[var(--c7)] rounded-lg pl-1.5 pr-2.5 py-1.5">
                          <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
                            {pm.member.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[13px] font-semibold">{pm.member.name}</span>
                          <button
                            onClick={() => setRemoveMemberTarget({ id: pm.id, name: pm.member.name })}
                            className="bg-transparent border-none cursor-pointer text-muted-foreground text-sm leading-none pl-0.5 flex items-center"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4">
              {/* Quick Actions */}
              <Card className="bg-[#0f172a] border-none">
                <div className="p-5">
                  <div className="text-[11px] font-bold text-[#64748b] uppercase tracking-[0.08em] mb-4">Quick Actions</div>
                  <div className="flex flex-col gap-2">
                    {project.type !== 'internal' && (
                    <button
                      onClick={() => { setPlanRows([{ month: '', description: defaultPlanDescription(), planned_amount: '', probability: '100' }]); setShowAddPlan(true) }}
                      className="flex items-center gap-3 bg-white/[0.07] border-none rounded-lg px-3 py-2.5 cursor-pointer w-full text-white font-[inherit] text-[13px] font-medium text-left"
                    >
                      <div className="w-7 h-7 rounded bg-[rgba(99,102,241,0.3)] flex items-center justify-center shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </div>
                      Add Invoice Plan
                    </button>
                    )}
                    {project.type !== 'internal' && (
                    <button
                      onClick={openAddCR}
                      className="flex items-center gap-3 bg-white/[0.07] border-none rounded-lg px-3 py-2.5 cursor-pointer w-full text-white font-[inherit] text-[13px] font-medium text-left"
                    >
                      <div className="w-7 h-7 rounded bg-[rgba(245,158,11,0.3)] flex items-center justify-center shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      </div>
                      Add Change Request
                    </button>
                    )}
                    <button
                      onClick={() => setShowAddCost(true)}
                      className="flex items-center gap-3 bg-white/[0.07] border-none rounded-lg px-3 py-2.5 cursor-pointer w-full text-white font-[inherit] text-[13px] font-medium text-left"
                    >
                      <div className="w-7 h-7 rounded bg-[rgba(239,68,68,0.3)] flex items-center justify-center shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                      </div>
                      Add Cost
                    </button>
                    <button
                      onClick={openProjectEdit}
                      className="flex items-center gap-3 bg-white/[0.07] border-none rounded-lg px-3 py-2.5 cursor-pointer w-full text-white font-[inherit] text-[13px] font-medium text-left"
                    >
                      <div className="w-7 h-7 rounded bg-[rgba(100,116,139,0.4)] flex items-center justify-center shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </div>
                      Edit Project
                    </button>
                  </div>
                </div>
              </Card>

            </div>
          </div>
        )}

        {/* ── Invoice Planning tab ── */}
        {tab === 'invoice' && project.type !== 'internal' && (
          <>
        {/* ── Invoice Plans section ── */}
        {(() => {
          const planYears = [...new Set(invoiceRows.map(r => parseInt(r.month.slice(0, 4))))].sort()
          const availYears = planYears.length > 0 ? planYears : [new Date().getFullYear()]
          const currentYear = availYears.includes(planYear) ? planYear : availYears[availYears.length - 1]
          const yearInvoiceRows = invoiceRows.filter(r => r.month.startsWith(String(currentYear)))
          return (<>
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-3">
            <h2>Invoice Plans</h2>
            <span className="text-muted-foreground text-xs">← synced with planning grid</span>
          </div>
          <div className="flex items-center gap-1.5">
            {availYears.map(y => (
              <Button key={y} size="xs" variant={currentYear === y ? 'default' : 'outline'} onClick={() => setPlanYear(y)}>{y}</Button>
            ))}
            <Button size="sm" className="ml-1" onClick={() => { setPlanRows([{ month: '', description: defaultPlanDescription(), planned_amount: '', probability: '100' }]); setShowAddPlan(true) }}>
              + Add planned invoice
            </Button>
          </div>
        </div>
        {project.type === 'fixed' && contractVal != null && (() => {
          const activePlanTotal = invoiceRows
            .filter(r => r.status !== 'deferred')
            .reduce((s, r) => s + (r.planned_amount ?? 0), 0)
          if (activePlanTotal < contractVal) {
            return (
              <div className="rounded-lg border border-[#fcd34d] bg-[#fef9ee] px-3 py-2 text-[13px] text-[#92400e] mb-3">
                Invoice plan total ({activePlanTotal.toLocaleString()} €) is less than contract value ({contractVal.toLocaleString()} €) — consider adding more invoice plans.
              </div>
            )
          }
          return null
        })()}
        <Card className="mb-6">
          {rpLoading ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">
              Loading…
            </div>
          ) : invoiceRows.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">
              No invoice plans yet.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>MONTH</th>
                  <th>DESCRIPTION</th>
                  <th className="text-right">PLANNED</th>
                  <th className="text-right">ACTUAL</th>
                  <th>LIKELIHOOD</th>
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {yearInvoiceRows.map(r => {
                  const isSettled = r.status === 'issued' || r.status === 'paid'
                  const isPending = r.status === 'planned' || r.status === 'retainer'
                  const isDeferred = r.status === 'deferred'
                  const rowBgClass = isDeferred ? 'bg-[rgba(239,68,68,0.06)]' : isPending ? 'bg-[rgba(245,180,50,0.07)]' : ''
                  const actualColorClass = r.status === 'paid' ? 'text-[#16a34a]' : r.status === 'issued' ? 'text-primary' : 'text-muted-foreground'

                  return (
                    <tr key={r.id} className={rowBgClass}>
                      <td className={`text-[13px] ${isDeferred ? 'text-muted-foreground' : 'text-[#374151]'}`}>
                        {fmtMonth(r.month)}
                      </td>
                      <td className={`text-[13px] ${isDeferred ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {r.notes ?? (project?.type === 'variable' ? <span className="text-muted-foreground">{project.name}</span> : <span className="text-muted-foreground">—</span>)}
                      </td>
                      <td className={`text-right text-[13px] ${isDeferred ? 'text-muted-foreground line-through' : 'text-muted-foreground'}`}>
                        {r.planned_amount != null ? fmt(r.planned_amount) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-right text-[13px]">
                        <span className={`font-semibold tabular-nums ${actualColorClass}`}>
                          {r.actual_amount != null ? fmt(r.actual_amount) : <span className="text-muted-foreground">—</span>}
                        </span>
                        {r.actual_amount != null && r.planned_amount != null && r.actual_amount > r.planned_amount && (
                          <span className="ml-1.5 text-[11px] font-bold text-[#d97706] bg-[rgba(245,180,50,0.15)] border border-[var(--amber)] rounded px-1 py-0.5">
                            +{fmt(r.actual_amount - r.planned_amount)}
                          </span>
                        )}
                      </td>
                      <td className="text-xs text-muted-foreground tabular-nums">
                        {r.probability != null ? `${r.probability}%` : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td>
                        {isDeferred
                          ? <Badge variant="red">Deferred</Badge>
                          : isPending
                            ? <Badge variant="amber">Not issued</Badge>
                            : <Badge variant={RP_STATUS_BADGE[r.status] ?? 'gray'}>{cap(r.status)}</Badge>
                        }
                      </td>
                      <td>
                        <div className="flex gap-1.5 justify-end">
                          {isPending && (
                            <>
                              <Button size="xs" onClick={() => openConfirm(r)}>Confirm</Button>
                              {project?.type === 'fixed' && (
                                <Button variant="ghost" size="xs" onClick={() => openMove(r)} title="Move to another month">Move</Button>
                              )}
                            </>
                          )}
                          {isPending && (
                            <Button variant="outline" size="xs" onClick={() => { setQuickUpdateRow(r); setQuickUpdateAmount(r.planned_amount != null ? String(r.planned_amount) : '') }}>
                              Update estimate
                            </Button>
                          )}
                          {isDeferred && (
                            <Button variant="ghost" size="xs" className="text-primary"
                              onClick={() => { setPlanAgainRow(r); setPlanAgainMonth(r.month.slice(0, 7)); setPlanAgainAmount(r.planned_amount?.toString() ?? ''); setShowPlanAgain(true) }}
                            >
                              Plan again
                            </Button>
                          )}
                          {isSettled && (
                            <Button variant="outline" size="xs" onClick={() => openEdit(r)}>Edit</Button>
                          )}
                          <Button variant="ghost" size="xs" className="text-[#dc2626]"
                            onClick={() => setDeletePlanTarget(r)}
                            title="Delete invoice plan"
                          >
                            ✕
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {invoiceRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-border bg-[#f9fafb]">
                    <td colSpan={2} className="px-4 py-2 font-bold text-xs text-[#374151] uppercase tracking-wide">Total</td>
                    <td className="text-right text-[13px] font-bold text-primary px-4 py-2">
                      {fmt(invoiceRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0))}
                    </td>
                    <td className="text-right text-[13px] font-bold text-[#16a34a] px-4 py-2">
                      {invoiceRows.some(r => r.actual_amount != null)
                        ? fmt(invoiceRows.reduce((s, r) => s + (r.actual_amount ?? 0), 0))
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </Card>
        </>)})()}

        {/* ── Change Requests section ── */}
        <div className="flex items-center justify-between mb-2.5">
          <h2>Change Requests</h2>
          <Button variant="outline" size="sm" onClick={openAddCR}>
            + Add change request
          </Button>
        </div>
        <Card className="mb-6">
          {crStore.changeRequests.length === 0 ? (
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
                {crStore.changeRequests.map(cr => {
                  const isAuto = cr.notes === 'auto_extra'
                  const isPending = cr.status === 'pending'
                  const isApproved = cr.status === 'approved'
                  const alreadyPlanned = rpRows.some(r => r.notes?.includes(`CR: ${cr.title}`) && r.status !== 'deferred')
                  const crDisplayAmount = cr.deal_type === 'fixed' && cr.monthly_schedule
                    ? cr.monthly_schedule.reduce((s, r) => s + r.amount, 0)
                    : cr.amount
                  const canPlan = !isAuto && isApproved && crDisplayAmount != null && crDisplayAmount > 0 && !alreadyPlanned
                  const crStatusBadge = cr.status === 'billed'
                    ? <Badge variant="navy">Billed</Badge>
                    : isApproved
                      ? <Badge variant="green">Approved</Badge>
                      : <Badge variant="amber">Pending</Badge>
                  return (
                    <tr key={cr.id}>
                      <td>
                        {crStatusBadge}
                        {isAuto && <Badge variant="gray" className="ml-1">Auto</Badge>}
                      </td>
                      <td className="text-[13px] font-semibold text-foreground">{cr.title}</td>
                      <td className="text-xs text-muted-foreground max-w-[200px]">{cr.description ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="text-right text-[13px] text-[#374151]">
                        {crDisplayAmount != null ? fmt(crDisplayAmount) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {cr.probability != null ? `${cr.probability}%` : '—'}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {cr.expected_month ? fmtMonth(cr.expected_month) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td>
                        <div className="flex gap-1.5 justify-end">
                          {isPending && !isAuto && (
                            <Button size="xs"
                              onClick={async () => {
                                await crStore.update(cr.id, { status: 'approved' })
                                // Auto-plan if expected_month is set
                                if (cr.expected_month && cr.amount && !alreadyPlanned) {
                                  const { data } = await supabase.from('revenue_planner')
                                    .insert({
                                      project_id: id,
                                      month: cr.expected_month,
                                      notes: `CR: ${cr.title}`,
                                      planned_amount: cr.amount,
                                      actual_amount: null,
                                      status: 'planned' as const,
                                      probability: cr.probability ?? 100,
                                    })
                                    .select('*, project:projects(id, pn, name, type)')
                                  if (data) setRpRows(prev => [...prev, ...(data as RevenuePlanner[])].sort((a, b) => a.month.localeCompare(b.month)))
                                }
                                if (project?.client_id) {
                                  const { data: existing } = await supabase.from('pipeline_items')
                                    .select('id').eq('title', cr.title).eq('client_id', project.client_id).limit(1)
                                  if (existing && existing.length > 0) {
                                    await supabase.from('pipeline_items').update({ status: 'won' }).eq('id', existing[0].id)
                                  } else if (cr.expected_month && cr.amount) {
                                    await supabase.from('pipeline_items').insert({
                                      client_id: project.client_id,
                                      title: cr.title,
                                      description: cr.description ?? null,
                                      estimated_amount: cr.amount,
                                      probability: cr.probability ?? 100,
                                      deal_type: cr.deal_type ?? 'one_time',
                                      expected_month: cr.expected_month,
                                      status: 'won' as const,
                                      notes: null,
                                    })
                                  }
                                }
                                toast('success', cr.expected_month ? 'Approved & added to plan' : 'Approved')
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
                          {!isAuto && isPending && (
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
                <tr className="bg-[var(--c7)] border-t-2 border-border">
                  <td colSpan={3} className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Total</td>
                  <td className="text-right font-bold text-[#2563eb]">
                    {fmt(crStore.changeRequests.reduce((s, cr) => s + (cr.amount ?? 0), 0))}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>

        {/* ── Project Costs section ── */}
        <div className="flex items-center justify-between mb-2.5">
          <h2>Project Costs</h2>
          <Button variant="outline" size="sm" onClick={() => setShowAddCost(true)}>
            + Add cost
          </Button>
        </div>
        <Card className="mb-6">
          {costRows.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">
              No costs recorded for this project.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>MONTH</th>
                  <th>DESCRIPTION</th>
                  <th className="text-right">AMOUNT</th>
                  <th className="text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {costRows.map(r => (
                  <tr key={r.id}>
                    <td className="text-[13px] text-[#374151]">
                      {fmtMonth(r.month)}
                    </td>
                    <td className="text-[13px] text-foreground">
                      {r.notes ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-right font-semibold text-[#dc2626] text-[13px]">
                      {r.actual_amount != null ? fmt(r.actual_amount) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-right">
                      <div className="flex gap-1.5 justify-end">
                        <Button variant="outline" size="xs" onClick={() => openEditCost(r)}>Edit</Button>
                        <Button variant="destructive" size="xs" onClick={() => setDeleteCostId(r.id)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-[var(--c7)] border-t-2 border-border">
                  <td colSpan={2} className="font-bold text-xs text-muted-foreground tracking-wide">
                    TOTAL COSTS
                  </td>
                  <td className="text-right font-bold text-[#dc2626] text-sm">
                    {fmt(totalCosts)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </Card>

          </>
        )}

        {/* ── Orders tab ── */}
        {tab === 'orders' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-[15px] font-bold text-primary m-0">Orders</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Each order creates an invoice plan entry automatically.</p>
              </div>
              <Button size="sm" onClick={() => setShowAddOrder(true)}>+ Add Order</Button>
            </div>
            {orders.length === 0 ? (
              <Card>
                <div className="p-8 text-center text-sm text-muted-foreground">No orders yet. Add the first one.</div>
              </Card>
            ) : (
              <Card>
                <table>
                  <thead>
                    <tr>
                      <th>Offer ref</th>
                      <th>PO number</th>
                      <th>Description</th>
                      <th>Month</th>
                      <th className="text-right">Amount</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id}>
                        <td className="font-mono text-xs font-semibold">{o.offer_ref}</td>
                        <td className="text-xs text-muted-foreground">{o.po_number ?? '—'}</td>
                        <td className="text-sm">{o.description}</td>
                        <td className="text-xs text-muted-foreground tabular-nums">
                          {new Date(o.month + 'T00:00:00').toLocaleDateString('sl-SI', { month: 'short', year: 'numeric' })}
                        </td>
                        <td className="text-right font-semibold tabular-nums text-sm">
                          {o.amount.toLocaleString('sl-SI', { minimumFractionDigits: 2 })} €
                        </td>
                        <td className="text-right">
                          <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeleteOrderTarget(o)}>Del</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[var(--c7)] border-t-2 border-border">
                      <td colSpan={4} className="font-bold text-xs text-[#374151] uppercase tracking-wide">Total</td>
                      <td className="text-right font-bold tabular-nums">
                        {orders.reduce((s, o) => s + o.amount, 0).toLocaleString('sl-SI', { minimumFractionDigits: 2 })} €
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </Card>
            )}
          </div>
        )}

        {/* ── Resource Planning tab ── */}
        {tab === 'resource' && (
          <div>
            {/* Actual allocations from grid */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <h2>Resource Allocations</h2>
                <span className="text-xs text-muted-foreground">synced from Allocation Grid</span>
              </div>
              <Button variant="outline" size="sm" asChild><Link to="/resource-planning">Open Grid →</Link></Button>
            </div>
            {projectAllocations.length === 0 ? (
              <Card className="mb-6">
                <div className="p-8 text-center text-muted-foreground text-[13px]">
                  No allocations recorded for this project yet. Allocate time in the <Link to="/resource-planning" className="text-primary">Allocation Grid</Link>.
                </div>
              </Card>
            ) : (() => {
              const byMember = projectAllocations.reduce<Record<string, { name: string; totalHours: number; entries: ResourceAllocation[] }>>((acc, a) => {
                const mid = a.member_id
                const name = (a.member as unknown as { name: string } | null)?.name ?? mid
                if (!acc[mid]) acc[mid] = { name, totalHours: 0, entries: [] }
                acc[mid].totalHours += a.hours
                acc[mid].entries.push(a)
                return acc
              }, {})
              return (
                <Card className="mb-6">
                  <table>
                    <thead>
                      <tr>
                        <th>TEAM MEMBER</th>
                        <th className="text-right">TOTAL HOURS</th>
                        <th className="text-right">ENTRIES</th>
                        <th className="text-right">DATE RANGE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(byMember).sort((a, b) => b.totalHours - a.totalHours).map(({ name, totalHours, entries }) => {
                        const dates = entries.map(e => e.date).sort()
                        const fromDate = dates[0]
                        const toDate = dates[dates.length - 1]
                        return (
                          <tr key={name}>
                            <td className="font-semibold text-sm">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold shrink-0">
                                  {name.charAt(0).toUpperCase()}
                                </div>
                                {name}
                              </div>
                            </td>
                            <td className="text-right font-bold text-primary text-sm">{totalHours}h</td>
                            <td className="text-right text-muted-foreground text-[13px]">{entries.length}</td>
                            <td className="text-right text-muted-foreground text-xs">
                              {fromDate === toDate ? fromDate : `${fromDate} — ${toDate}`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-[var(--c7)] border-t-2 border-border">
                        <td className="font-bold text-xs text-[#374151] uppercase tracking-wide">Total</td>
                        <td className="text-right font-bold text-primary">
                          {projectAllocations.reduce((s, a) => s + a.hours, 0)}h
                        </td>
                        <td className="text-right text-muted-foreground text-[13px]">{projectAllocations.length}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </Card>
              )
            })()}

            {/* Deliverables / estimates */}
            <div className="flex items-center justify-between mb-4">
              <h2>Deliverables &amp; Estimates</h2>
              <Button size="sm" onClick={() => { resetDelForm(); setEditDeliverableTarget(null); setShowDeliverableModal(true) }}>+ Add</Button>
            </div>
            <Card className="mb-6">
              {deliverables.length === 0 ? (
                <div className="p-7 text-center text-muted-foreground text-[13px]">
                  No deliverables yet. Add deliverables with team assignments and estimated hours to plan resource requirements.
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>DELIVERABLE</th>
                      <th>TEAM</th>
                      <th className="text-right">EST. HOURS</th>
                      <th>DUE DATE</th>
                      <th>STATUS</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliverables.map(d => {
                      const isOverdue = d.status === 'active' && d.due_date < new Date().toISOString().slice(0, 10)
                      return (
                        <tr key={d.id}>
                          <td className="font-semibold text-sm">{d.title}</td>
                          <td>{d.team ? <Badge variant="gray">{d.team}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                          <td className={`text-right font-bold ${d.estimated_hours ? 'text-primary' : 'text-muted-foreground'}`}>
                            {d.estimated_hours ? `${d.estimated_hours}h` : '—'}
                          </td>
                          <td className={`text-[13px] ${isOverdue ? 'text-[#dc2626] font-bold' : 'text-[#374151]'}`}>
                            {new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-GB')}
                            {isOverdue && ' ⚠'}
                          </td>
                          <td>
                            <Badge variant={d.status === 'completed' ? 'green' : isOverdue ? 'red' : 'blue'}>
                              {d.status === 'active' && isOverdue ? 'Overdue' : d.status === 'completed' ? 'Done' : 'Active'}
                            </Badge>
                          </td>
                          <td>
                            <div className="flex gap-1.5 justify-end">
                              <Button variant="ghost" size="xs" onClick={() => openEditDeliverable(d)}>Edit</Button>
                              <Button variant="ghost" size="xs" onClick={() => handleToggleDeliverable(d)}>
                                {d.status === 'completed' ? 'Reopen' : 'Complete'}
                              </Button>
                              <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => handleRemoveDeliverable(d.id)}>Del</Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {deliverables.some(d => d.estimated_hours) && (
                    <tfoot>
                      <tr className="bg-[var(--c7)] border-t-2 border-border">
                        <td colSpan={2} className="font-bold text-xs text-[#374151] uppercase tracking-wide">Total</td>
                        <td className="text-right font-bold text-primary">
                          {deliverables.reduce((s, d) => s + (d.estimated_hours ?? 0), 0)}h
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </Card>
          </div>
        )}

        {/* ── Tools tab ── */}
        {tab === 'tools' && project && (
          <ToolsTab projectId={project.id} />
        )}

        {/* ── Remove Team Member Confirm ─── */}
        <ConfirmDialog
          open={!!removeMemberTarget}
          title="Remove from project?"
          message={removeMemberTarget ? `Remove ${removeMemberTarget.name} from this project?` : ''}
          confirmLabel="Remove"
          onConfirm={async () => {
            if (!removeMemberTarget) return
            await supabase.from('member_projects').delete().eq('id', removeMemberTarget.id)
            if (id) fetchProjectMembers(id)
            setRemoveMemberTarget(null)
          }}
          onCancel={() => setRemoveMemberTarget(null)}
        />

        {/* ── Add Team Member Modal ─── */}
        {showAddMember && (
          <Modal title="Add Team Members" maxWidth={560} onClose={() => setShowAddMember(false)}>
            {(() => {
              const available = members.filter(m => !projectMembers.some(pm => pm.member_id === m.id))
              if (available.length === 0) return (
                <p className="text-muted-foreground text-[13px] m-0">All team members are already assigned to this project.</p>
              )
              return (
                <div className="grid grid-cols-2 gap-2">
                  {available.map(m => {
                    const checked = addMemberIds.includes(m.id)
                    return (
                      <label
                        key={m.id}
                        onClick={() => setAddMemberIds(prev => checked ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg cursor-pointer border-2 transition-all ${checked ? 'border-primary bg-primary/5' : 'border-border bg-white'}`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0 ${checked ? 'bg-primary' : 'bg-[var(--c5)]'}`}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-foreground">{m.name}</div>
                          {m.role && <div className="text-[11px] text-muted-foreground">{m.role}</div>}
                        </div>
                        {checked && (
                          <div className="ml-auto text-primary">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>
                        )}
                      </label>
                    )
                  })}
                </div>
              )
            })()}
            <div className="flex gap-2 justify-end mt-5">
              <Button variant="outline" size="sm" onClick={() => setShowAddMember(false)}>Cancel</Button>
              <Button size="sm"
                disabled={addMemberIds.length === 0 || addMemberSaving}
                onClick={async () => {
                  if (!id || addMemberIds.length === 0) return
                  setAddMemberSaving(true)
                  try {
                    const { error } = await supabase.from('member_projects').insert(addMemberIds.map(mid => ({ project_id: id, member_id: mid })))
                    if (error) { toast('error', error.message); return }
                    fetchProjectMembers(id)
                    setShowAddMember(false)
                    setAddMemberIds([])
                    toast('success', 'Team members added')
                  } finally {
                    setAddMemberSaving(false)
                  }
                }}
              >
                {addMemberSaving ? 'Adding…' : `Add${addMemberIds.length > 0 ? ` ${addMemberIds.length}` : ''}`}
              </Button>
            </div>
          </Modal>
        )}

        {/* ── Add / Edit Deliverable Modal ─── */}
        {showDeliverableModal && (
          <Modal title={editDeliverableTarget ? 'Edit Deliverable' : 'Add Deliverable'} maxWidth={620} onClose={() => { setShowDeliverableModal(false); setEditDeliverableTarget(null); resetDelForm() }}>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Title</label>
              <input value={delTitle} onChange={e => setDelTitle(e.target.value)} placeholder="e.g. UX/UI Design delivery" autoFocus />
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Start Date <span className="font-normal text-muted-foreground">(optional)</span></label>
                <input type="date" value={delStartDate} onChange={e => setDelStartDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Due Date</label>
                <input type="date" value={delDue} onChange={e => setDelDue(e.target.value)} />
              </div>
              {delTeam.length <= 1 && (
                <div>
                  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Estimated Hours</label>
                  <input type="number" value={delHours} onChange={e => setDelHours(e.target.value ? Number(e.target.value) : '')} min={0} step={1} placeholder="40" />
                </div>
              )}
            </div>
            <div className={`mb-4 ${delTeam.length > 1 ? '' : ''}`}>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Team</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {(teams.length > 0 ? teams : []).map(t => {
                  const sel = delTeam.includes(t.name)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDelTeam(prev => sel ? prev.filter(x => x !== t.name) : [...prev, t.name])}
                      className={`px-3.5 py-1 rounded-full border-2 font-semibold text-[13px] cursor-pointer uppercase tracking-wide transition-all ${sel ? 'border-primary bg-primary text-white' : 'border-[var(--c5)] bg-white text-[#374151]'}`}
                    >
                      {t.name}
                    </button>
                  )
                })}
              </div>
            </div>
            {delTeam.length > 1 && (
              <div className="bg-[var(--c7)] rounded-lg px-4 py-3 mb-4">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2.5">Hours per Team</div>
                <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
                  {delTeam.map(tName => (
                    <div key={tName}>
                      <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">{tName}</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder="0"
                        value={delTeamHours[tName] ?? ''}
                        onChange={e => setDelTeamHours(prev => ({ ...prev, [tName]: e.target.value ? Number(e.target.value) : 0 }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Total: <strong>{delTeam.reduce((s, t) => s + (delTeamHours[t] ?? 0), 0)}h</strong>
                </div>
              </div>
            )}
            {(() => {
              if (delTeam.length === 0) return null
              const assignedIds = new Set(projectMembers.map(pm => pm.member_id))
              // Group by team: for each selected team, find project-assigned members in that team
              const teamGroups = delTeam.map(teamName => {
                const teamMembersFull = members.filter(m =>
                  assignedIds.has(m.id) &&
                  (m.team as { name?: string } | null | undefined)?.name === teamName
                )
                return { teamName, members: teamMembersFull }
              }).filter(g => g.members.length > 0)
              if (teamGroups.length === 0) return null
              return (
                <div className="bg-[var(--c7)] rounded-lg px-4 py-3 mb-4">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2.5">Member Allocation (% of team hours)</div>
                  {teamGroups.map(({ teamName, members: tMembers }) => {
                    const teamHrs = delTeamHours[teamName] ?? 0
                    const totalPct = tMembers.reduce((s, m) => s + (delMemberPercentages[m.id] ?? 0), 0)
                    const equalPct = tMembers.length > 0 ? Math.round(100 / tMembers.length) : 0
                    return (
                      <div key={teamName} className="mb-3 last:mb-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">{teamName}</span>
                          {teamHrs > 0 && (
                            <button
                              type="button"
                              className="text-[10px] text-primary cursor-pointer border-none bg-transparent p-0 underline"
                              onClick={() => {
                                const newPct: Record<string, number> = { ...delMemberPercentages }
                                tMembers.forEach((m, i) => {
                                  newPct[m.id] = i < tMembers.length - 1 ? equalPct : 100 - equalPct * (tMembers.length - 1)
                                })
                                setDelMemberPercentages(newPct)
                              }}
                            >
                              Equal split
                            </button>
                          )}
                        </div>
                        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                          {tMembers.map(m => {
                            const pct = delMemberPercentages[m.id] ?? 0
                            const hrs = teamHrs > 0 ? Math.round((pct / 100) * teamHrs * 10) / 10 : null
                            return (
                              <div key={m.id}>
                                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">
                                  {m.name}{hrs != null ? ` · ${hrs}h` : ''}
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  placeholder="0"
                                  value={delMemberPercentages[m.id] ?? ''}
                                  onChange={e => setDelMemberPercentages(prev => ({ ...prev, [m.id]: e.target.value ? Number(e.target.value) : 0 }))}
                                />
                              </div>
                            )
                          })}
                        </div>
                        <div className={`mt-1.5 text-xs ${totalPct !== 100 && totalPct > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          Total: <strong>{totalPct}%</strong>{totalPct !== 100 && totalPct > 0 ? ' (should sum to 100%)' : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
            <div className="flex gap-2 justify-end mt-5">
              <Button variant="outline" size="sm" onClick={() => { setShowDeliverableModal(false); setEditDeliverableTarget(null); resetDelForm() }}>Cancel</Button>
              <Button size="sm"
                disabled={!delTitle.trim() || !delDue}
                onClick={editDeliverableTarget ? handleSaveDeliverable : handleAddDeliverable}
              >
                {editDeliverableTarget ? 'Save' : 'Add'}
              </Button>
            </div>
          </Modal>
        )}

      {/* ── Add Order modal ── */}
      {showAddOrder && (
        <Modal title="Add Order" maxWidth={480} onClose={() => setShowAddOrder(false)}
          footer={<>
            <Button variant="outline" size="sm" onClick={() => setShowAddOrder(false)}>Cancel</Button>
            <Button size="sm" disabled={orderSaving || !orderForm.offer_ref.trim() || !orderForm.amount || !orderForm.month} onClick={handleAddOrder}>
              {orderSaving ? 'Adding…' : 'Add Order'}
            </Button>
          </>}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Offer ref</label>
              <input value={orderForm.offer_ref} onChange={e => setOrderForm(f => ({ ...f, offer_ref: e.target.value }))} placeholder="e.g. 26_07_Telekom-USIMM-2983" autoFocus />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">PO number <span className="font-normal">optional</span></label>
              <input value={orderForm.po_number} onChange={e => setOrderForm(f => ({ ...f, po_number: e.target.value }))} placeholder="e.g. 4501108633" />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Description</label>
            <input value={orderForm.description} onChange={e => setOrderForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Aktivnosti SUPR font 03/2026" />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€)</label>
              <input type="number" value={orderForm.amount} onChange={e => setOrderForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Invoice month</label>
              <input type="month" value={orderForm.month} onChange={e => setOrderForm(f => ({ ...f, month: e.target.value }))} />
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Order confirm ── */}
      <ConfirmDialog
        open={!!deleteOrderTarget}
        title="Delete order?"
        message={deleteOrderTarget ? `Delete "${deleteOrderTarget.offer_ref}"? This will also remove it from the invoice plan.` : ''}
        confirmLabel="Delete"
        onConfirm={() => deleteOrderTarget && handleDeleteOrder(deleteOrderTarget)}
        onCancel={() => setDeleteOrderTarget(null)}
      />

      </div>
    </div>
  )
}
