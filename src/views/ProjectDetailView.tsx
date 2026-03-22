import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { useSettingsStore } from '../stores/settings'
import { useResourceStore } from '../stores/resource'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { RevenuePlanner, Project, ChangeRequest, ProjectDeliverable, ResourceAllocation } from '../lib/types'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'

function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return /^https?:\/\//i.test(url) ? url : undefined
}

// ── helpers ───────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, string> = {
  fixed: 'badge-blue',
  maintenance: 'badge-amber',
  variable: 'badge-green',
}
const RP_STATUS_BADGE: Record<string, string> = {
  paid: 'badge-green',
  issued: 'badge-blue',
  planned: 'badge-amber',
  retainer: 'badge-navy',
  cost: 'badge-red',
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
  const [projectEditForm, setProjectEditForm] = useState<ProjectEditForm>({ pn: '', name: '', client_id: '', pm: '', value: '', status: 'active', start_month: '', end_month: '', contract_url: '', notes: '' })
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
  const [editDeliverableTarget, setEditDeliverableTarget] = useState<import('../lib/types').ProjectDeliverable | null>(null)

  // project team members
  const [projectMembers, setProjectMembers] = useState<Array<{ id: string; member_id: string; member: { id: string; name: string } }>>([])
  const [showAddMember, setShowAddMember] = useState(false)
  const [addMemberIds, setAddMemberIds] = useState<string[]>([])
  const [addMemberSaving, setAddMemberSaving] = useState(false)
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ id: string; name: string } | null>(null)

  // tabs
  const [tab, setTab] = useState<'overview' | 'invoice' | 'resource'>('overview')

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

  useEffect(() => {
    if (!id) return
    fetchRpRows(id)
    crStore.fetchByProject(id)
    fetchDeliverables(id)
    fetchProjectMembers(id)
    fetchMembers()
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
      contract_url: project.contract_url ?? '',
      notes:        project.notes ?? '',
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
      <div className="page-content" style={{ textAlign: 'center', paddingTop: 60, color: 'var(--c4)' }}>
        Loading…
      </div>
    )
  }

  if (!project) {
    return (
      <div className="page-content" style={{ paddingTop: 40 }}>
        <div className="alert alert-red">Project not found.</div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => navigate('/projects')}>
          ← Back to Projects
        </button>
      </div>
    )
  }

  const clientLink = client
    ? <Link to={`/clients/${project.client_id}`} style={{ color: 'var(--navy)', fontWeight: 600, textDecoration: 'none' }}>{client.name}</Link>
    : <span className="text-muted">—</span>

  const TYPE_LABEL: Record<string, string> = { fixed: 'Fixed', maintenance: 'Recurring', variable: 'Variable' }
  const typeBadge = (
    <span className={`badge ${TYPE_BADGE[project.type] ?? 'badge-gray'}`}>
      {TYPE_LABEL[project.type] ?? cap(project.type)}
    </span>
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
    setDelTitle(''); setDelDue(''); setDelStartDate(''); setDelHours(''); setDelTeam([]); setDelTeamHours({})
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

  return (
    <div>
      {/* ── Project edit modal ── */}
      {showProjectEdit && (
        <Modal title="Edit Project" onClose={() => setShowProjectEdit(false)}>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Project #</label>
              <input value={projectEditForm.pn} onChange={e => setProjectEditForm(f => ({ ...f, pn: e.target.value }))} className="text-mono" />
            </div>
            <div className="form-group">
              <label className="form-label">Project name</label>
              <input value={projectEditForm.name} onChange={e => setProjectEditForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Client</label>
              <Select
                value={projectEditForm.client_id}
                onChange={val => setProjectEditForm(f => ({ ...f, client_id: val }))}
                placeholder="— No client —"
                options={cStore.clients.map(c => ({ value: c.id, label: c.name }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Project Manager</label>
              <Select
                value={projectEditForm.pm}
                onChange={val => setProjectEditForm(f => ({ ...f, pm: val }))}
                options={pmOptions}
              />
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Value (€)</label>
              <input type="number" value={projectEditForm.value} onChange={e => setProjectEditForm(f => ({ ...f, value: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
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
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Start month</label>
              <input type="month" value={projectEditForm.start_month} onChange={e => setProjectEditForm(f => ({ ...f, start_month: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">End month</label>
              <input type="month" value={projectEditForm.end_month} onChange={e => setProjectEditForm(f => ({ ...f, end_month: e.target.value }))} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Contract URL <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
            <input type="url" value={projectEditForm.contract_url} onChange={e => setProjectEditForm(f => ({ ...f, contract_url: e.target.value }))} placeholder="https://..." />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Notes <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
            <textarea rows={3} value={projectEditForm.notes} onChange={e => setProjectEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any internal notes about this project…" style={{ width: '100%', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 24 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowProjectEdit(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveProjectEdit} disabled={projectEditSaving}>
              {projectEditSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Confirm issue modal ── */}
      {showConfirm && confirmRow && (
        <Modal title="Confirm Invoice Issued" onClose={() => { setShowConfirm(false); setConfirmRow(null) }}>
          <p style={{ fontSize: 13, color: 'var(--c2)', marginBottom: 16 }}>
            Mark this invoice as <strong>issued</strong> and record the actual amount invoiced.
          </p>
          <div style={{ background: 'var(--c8)', border: '1px solid var(--c6)', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Month</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMonth(confirmRow.month)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Planned</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{confirmRow.planned_amount != null ? fmt(confirmRow.planned_amount) : '—'}</div>
              </div>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Actual amount invoiced (€)</label>
            <input
              className="form-input"
              type="number"
              value={confirmActual}
              onChange={e => setConfirmActual(e.target.value)}
              autoFocus
            />
            {confirmRow.planned_amount != null && Number(confirmActual) > confirmRow.planned_amount && (
              <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(245,180,50,0.12)', border: '1px solid var(--amber)', borderRadius: 6, fontSize: 12, color: 'var(--c1)' }}>
                +{fmt(Number(confirmActual) - confirmRow.planned_amount)} over planned — will auto-create an approved change request
              </div>
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Note <span style={{ color: 'var(--red)' }}>*</span></label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. Extra scope added, client approved verbally"
              value={confirmNote}
              onChange={e => setConfirmNote(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowConfirm(false); setConfirmRow(null) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveConfirm} disabled={confirmSaving || !confirmNote.trim()}>
              {confirmSaving ? 'Saving…' : '✓ Confirm Issued'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add invoice plan modal ── */}
      {showAddPlan && (
        <Modal title="Add Invoice Plans" maxWidth={760} onClose={() => { setShowAddPlan(false); setPlanRows([{ month: '', description: defaultPlanDescription(), planned_amount: '', probability: '100' }]) }}>
          {/* column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 100px 110px 28px', gap: '4px 8px', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Month</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount (€)</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Issue likelihood</span>
            <span />
          </div>
          {planRows.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 100px 110px 28px', gap: '6px 8px', alignItems: 'center', marginBottom: 6 }}>
              <input
                className="form-input"
                type="month"
                value={row.month}
                onChange={e => setPlanRows(rows => rows.map((r, idx) => idx === i ? { ...r, month: e.target.value } : r))}
              />
              <input
                className="form-input"
                placeholder="Invoice #1 — Design"
                value={row.description}
                onChange={e => setPlanRows(rows => rows.map((r, idx) => idx === i ? { ...r, description: e.target.value } : r))}
              />
              <input
                className="form-input"
                type="number"
                placeholder="0"
                value={row.planned_amount}
                onChange={e => setPlanRows(rows => rows.map((r, idx) => idx === i ? { ...r, planned_amount: e.target.value } : r))}
              />
              <Select
                value={row.probability}
                onChange={val => setPlanRows(rows => rows.map((r, idx) => idx === i ? { ...r, probability: val } : r))}
                style={{ fontSize: 13 }}
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 18, lineHeight: 1, padding: 0, opacity: planRows.length === 1 ? 0.3 : 1 }}
              >×</button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={() => setPlanRows(rows => [...rows, { month: '', description: defaultPlanDescription(), planned_amount: '', probability: '100' }])}
            style={{ marginTop: 4, marginBottom: 12 }}
          >
            + Add row
          </button>
          {leftToInvoice != null && (() => {
            const adding = planRows.reduce((s, r) => s + (parseFloat(r.planned_amount) || 0), 0)
            const remaining = leftToInvoice - adding
            const isOver = remaining < 0
            return adding > 0 ? (
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: isOver ? 'rgba(220,53,69,0.07)' : 'rgba(0,0,0,0.03)',
                border: `1px solid ${isOver ? 'var(--red)' : 'var(--c6)'}`,
                borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 16,
              }}>
                <span style={{ color: 'var(--c3)' }}>
                  Adding: <strong style={{ color: 'var(--c1)' }}>{fmt(adding)}</strong>
                  <span style={{ margin: '0 8px', color: 'var(--c5)' }}>·</span>
                  Already invoiced: <strong style={{ color: 'var(--c1)' }}>{fmt(totalInvoiced)}</strong>
                </span>
                <span style={{ fontWeight: 700, color: isOver ? 'var(--red)' : 'var(--navy)' }}>
                  {isOver ? `${fmt(Math.abs(remaining))} over budget` : `${fmt(remaining)} left after`}
                </span>
              </div>
            ) : null
          })()}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddPlan(false); setPlanRows([{ month: '', description: defaultPlanDescription(), planned_amount: '', probability: '100' }]) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={savePlan} disabled={planSaving || planRows.every(r => !r.month)}>
              {planSaving ? 'Saving…' : `Save ${planRows.filter(r => r.month).length || ''} plan${planRows.filter(r => r.month).length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add cost modal ── */}
      {showAddCost && (
        <Modal title="Add Cost" onClose={() => { setShowAddCost(false); setCostForm({ month_from: '', month_to: '', description: '', amount: '' }) }}>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">From month</label>
              <input
                type="month"
                value={costForm.month_from}
                onChange={e => setCostForm(f => ({ ...f, month_from: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">
                To month
                <span className="form-hint" style={{ display: 'inline', marginLeft: 6 }}>optional — for recurring</span>
              </label>
              <input
                type="month"
                value={costForm.month_to}
                onChange={e => setCostForm(f => ({ ...f, month_to: e.target.value }))}
              />
            </div>
          </div>
          {costForm.month_from && costForm.month_to && costForm.month_to > costForm.month_from && (
            <div className="alert alert-amber" style={{ marginBottom: 14, fontSize: 12 }}>
              Will create one cost entry per month from {costForm.month_from} to {costForm.month_to}
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Description</label>
            <input
              placeholder="e.g. Freelancer payment"
              value={costForm.description}
              onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Amount (€) per month</label>
            <input
              type="number"
              placeholder="0"
              value={costForm.amount}
              onChange={e => setCostForm(f => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddCost(false); setCostForm({ month_from: '', month_to: '', description: '', amount: '' }) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveCost} disabled={costSaving || !costForm.month_from}>
              {costSaving ? 'Saving…' : 'Add Cost'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete cost confirm ── */}
      {deleteCostId && (
        <div className="modal-overlay" onClick={() => setDeleteCostId(null)}>
          <div className="modal-box" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Delete Cost</div>
              <button className="modal-close" onClick={() => setDeleteCostId(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: 14, color: 'var(--c1)' }}>Are you sure you want to delete this cost? This cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setDeleteCostId(null)}>Cancel</button>
              <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={() => deleteCost(deleteCostId)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete invoice plan confirm ── */}
      {deletePlanTarget && (
        <Modal title="Delete invoice plan" onClose={() => setDeletePlanTarget(null)}>
          <p style={{ margin: '0 0 20px', fontSize: 14 }}>
            Delete <strong>{fmtMonth(deletePlanTarget.month)}</strong>
            {deletePlanTarget.notes ? ` — ${deletePlanTarget.notes}` : ''}
            {deletePlanTarget.planned_amount != null ? ` (${fmt(deletePlanTarget.planned_amount)})` : ''}?
            This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setDeletePlanTarget(null)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={() => deleteInvoicePlan(deletePlanTarget)}>Delete</button>
          </div>
        </Modal>
      )}

      {/* ── Delete CR confirm ── */}
      {deleteCRTarget && (
        <Modal title="Delete change request" onClose={() => setDeleteCRTarget(null)}>
          <p style={{ margin: '0 0 20px', fontSize: 14 }}>
            Delete <strong>{deleteCRTarget.title}</strong>
            {deleteCRTarget.amount != null ? ` (${fmt(deleteCRTarget.amount)})` : ''}?
            This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setDeleteCRTarget(null)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', border: 'none' }} onClick={() => deleteCR(deleteCRTarget)}>Delete</button>
          </div>
        </Modal>
      )}

      {/* ── Edit cost modal ── */}
      {showEditCost && editCostRow && (
        <Modal title="Edit Cost" onClose={() => { setShowEditCost(false); setEditCostRow(null) }}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Month</label>
            <input
              type="month"
              value={editCostForm.month}
              onChange={e => setEditCostForm(f => ({ ...f, month: e.target.value }))}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Description</label>
            <input
              value={editCostForm.description}
              onChange={e => setEditCostForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Freelancer payment"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Amount (€)</label>
            <input
              type="number"
              value={editCostForm.amount}
              onChange={e => setEditCostForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="0"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowEditCost(false); setEditCostRow(null) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveEditCost} disabled={editCostSaving}>
              {editCostSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Quick update estimate modal ── */}
      {quickUpdateRow && (
        <Modal title="Update estimate" onClose={() => { setQuickUpdateRow(null); setQuickUpdateAmount('') }} maxWidth={360}>
          <div style={{ marginBottom: 6, color: 'var(--c3)', fontSize: 13 }}>
            {fmtMonth(quickUpdateRow.month)}
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Amount (€)</label>
            <input
              type="number"
              value={quickUpdateAmount}
              onChange={e => setQuickUpdateAmount(e.target.value)}
              autoFocus
              placeholder="0"
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setQuickUpdateRow(null); setQuickUpdateAmount('') }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveQuickUpdate} disabled={quickUpdateSaving}>
              {quickUpdateSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Edit invoice row modal ── */}
      {showEdit && editRow && (
        <Modal title="Edit Invoice Row" onClose={() => { setShowEdit(false); setEditRow(null) }}>
          <div className="form-group">
            <label className="form-label">Month</label>
            <input
              className="form-input"
              type="month"
              value={editForm.month}
              onChange={e => setEditForm(f => ({ ...f, month: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Notes / description</label>
            <input
              className="form-input"
              value={editForm.description}
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Planned (€)</label>
              <input
                className="form-input"
                type="number"
                value={editForm.planned_amount}
                onChange={e => setEditForm(f => ({ ...f, planned_amount: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Actual (€)</label>
              <input
                className="form-input"
                type="number"
                value={editForm.actual_amount}
                onChange={e => setEditForm(f => ({ ...f, actual_amount: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Status</label>
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
            <div className="form-group">
              <label className="form-label">Issue likelihood</label>
              <Select value={editForm.probability} onChange={val => setEditForm(f => ({ ...f, probability: val }))} options={CR_PROB_OPTS} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowEdit(false); setEditRow(null) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Plan again modal ── */}
      {showPlanAgain && planAgainRow && (
        <Modal title="Plan Again" onClose={() => { setShowPlanAgain(false); setPlanAgainRow(null) }}>
          <p style={{ fontSize: 13, color: 'var(--c2)', marginBottom: 16 }}>
            Restore <strong>{planAgainRow.notes ?? fmtMonth(planAgainRow.month)}</strong> to planned. Choose the target month:
          </p>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Invoice month</label>
            <input type="month" value={planAgainMonth} onChange={e => setPlanAgainMonth(e.target.value)} autoFocus />
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Amount (€)</label>
            <input type="number" value={planAgainAmount} onChange={e => setPlanAgainAmount(e.target.value)} placeholder={planAgainRow.planned_amount?.toString() ?? ''} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowPlanAgain(false); setPlanAgainRow(null) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={savePlanAgain} disabled={planAgainSaving || !planAgainMonth}>
              {planAgainSaving ? 'Saving…' : 'Restore to planned'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Move invoice month modal ── */}
      {showMove && moveRow && (
        <Modal title="Move Invoice to Another Month" onClose={() => { setShowMove(false); setMoveRow(null) }}>
          <p style={{ fontSize: 13, color: 'var(--c2)', marginBottom: 16 }}>
            Current month: <strong>{fmtMonth(moveRow.month)}</strong>
          </p>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">New month</label>
            <input type="month" value={moveForm.month} onChange={e => setMoveForm({ month: e.target.value })} autoFocus />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowMove(false); setMoveRow(null) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveMove} disabled={moveSaving || !moveForm.month || moveForm.month === moveRow.month.slice(0, 7)}>
              {moveSaving ? 'Saving…' : 'Move'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add change request modal ── */}
      {showAddCR && (
        <Modal title="Add Change Request" onClose={() => setShowAddCR(false)}>
          <CRModalFields form={crForm} setForm={setCrForm} autoFocus />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddCR(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveAddCR} disabled={crSaving || !crForm.title.trim()}>
              {crSaving ? 'Saving…' : 'Add Change Request'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Edit change request modal ── */}
      {showEditCR && editCRTarget && (
        <Modal title="Edit Change Request" onClose={() => { setShowEditCR(false); setEditCRTarget(null) }}>
          <CRModalFields form={crForm} setForm={setCrForm} />
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

      {/* ── Plan CR invoice modal ── */}
      {showPlanCR && planCRTarget && (
        <Modal title="Plan Invoice" onClose={() => { setShowPlanCR(false); setPlanCRTarget(null) }}>
          <p style={{ fontSize: 13, color: 'var(--c2)', marginBottom: 16 }}>
            Adding invoice plan for change request: <strong>{planCRTarget.title}</strong>
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
              Will add a planned invoice row for {fmtMonth(planCRMonth + '-01')} — {planCRAmount ? fmt(Number(planCRAmount)) : 'no amount set'}
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

      {/* ── Page header ── */}
      <div className="page-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>{project.name}</h1>
            {project.pn && <span className="badge badge-gray" style={{ fontFamily: 'monospace', fontSize: 12 }}>{project.pn}</span>}
            {typeBadge}
            <span className={`badge ${project.status === 'active' ? 'badge-green' : project.status === 'paused' ? 'badge-amber' : 'badge-gray'}`}>
              {cap(project.status)}
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--c3)' }}>{clientLink}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 2, background: 'var(--c7)', borderRadius: 8, padding: 3 }}>
            {(['active', 'paused', 'completed'] as const).map(s => {
              const isSelected = project.status === s
              const color = s === 'active' ? 'var(--green)' : s === 'paused' ? 'var(--amber)' : 'var(--c3)'
              return (
                <button
                  key={s}
                  disabled={statusSaving}
                  onClick={() => { if (!isSelected) saveStatus(s) }}
                  style={{
                    padding: '5px 12px', borderRadius: 6, border: 'none',
                    background: isSelected ? '#fff' : 'transparent',
                    color: isSelected ? color : 'var(--c4)',
                    fontWeight: isSelected ? 700 : 500,
                    fontSize: 12,
                    cursor: isSelected ? 'default' : 'pointer',
                    boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    fontFamily: 'inherit',
                    transition: 'all 0.1s',
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              )
            })}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={openProjectEdit}>Edit Project</button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div style={{ padding: '0 28px' }}>
        <div className="stats-strip" style={{ padding: '16px 0', gridTemplateColumns: 'repeat(6, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-card-label">Initial Value</div>
            <div className="stat-card-value">{valueLabel}</div>
            {project.type === 'fixed' && project.initial_contract_value != null && contractVal != null && project.initial_contract_value !== contractVal && (
              <div className="stat-card-sub" style={{ color: contractVal > project.initial_contract_value ? 'var(--green)' : 'var(--red)' }}>
                current: {fmt(contractVal)}
              </div>
            )}
            {project.type === 'maintenance' && maintenancePlannedTotal != null && regularInvoiceRows.length > 0 && (
              <div className="stat-card-sub">
                {Math.round(maintenancePlannedTotal / regularInvoiceRows.length).toLocaleString()} €/mo avg × {regularInvoiceRows.length} mo
              </div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Total Value</div>
            <div className="stat-card-value" style={{ color: 'var(--navy)' }}>{totalValue > 0 ? fmt(totalValue) : '—'}</div>
            <div className="stat-card-sub">{project.type === 'fixed' ? 'initial + approved CRs' : 'planned + approved CRs'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Actual Invoiced</div>
            <div className="stat-card-value" style={{ color: 'var(--green)' }}>{totalInvoiced > 0 ? fmt(totalInvoiced) : '—'}</div>
            {invoicedPct != null && <div className="stat-card-sub">{invoicedPct}% of total</div>}
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Change Requests</div>
            <div className="stat-card-value">{crTotal > 0 ? fmt(crTotal) : '—'}</div>
            {crApprovedTotal > 0 && <div className="stat-card-sub">{fmt(crApprovedTotal)} approved</div>}
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Costs</div>
            <div className="stat-card-value" style={{ color: totalCosts > 0 ? 'var(--red)' : undefined }}>{totalCosts > 0 ? fmt(totalCosts) : '—'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Left to Invoice</div>
            <div className="stat-card-value" style={{ color: leftToInvoice > 0 ? 'var(--navy)' : 'var(--c4)' }}>{leftToInvoice > 0 ? fmt(leftToInvoice) : '—'}</div>
            <div className="stat-card-sub">planned, not yet issued</div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ padding: '0 28px', display: 'flex', gap: 0, marginTop: 4 }}>
        {([
          ['overview', 'Overview'],
          ['invoice', 'Invoice Planning'],
          ['resource', 'Resource Planning'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: tab === key ? 700 : 500,
              color: tab === key ? 'var(--navy)' : 'var(--c3)',
              borderBottom: tab === key ? '2px solid var(--navy)' : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.1s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="page-content">

        {/* ── Overview tab ── */}
        {tab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 24, alignItems: 'start' }}>
            {/* Left column */}
            <div>
              {/* Project Details */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--c6)' }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Project Details</h3>
                </div>
                <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 32px' }}>
                  {project.pn && (
                    <div style={{ gridColumn: '1 / -1', paddingBottom: 16, borderBottom: '1px solid var(--c6)', marginBottom: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Project #</div>
                      <div className="text-mono" style={{ fontSize: 20, fontWeight: 800, color: 'var(--c0)' }}>{project.pn}</div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Client</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{clientLink}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Project Manager</div>
                    <div style={{ fontSize: 14 }}>{project.pm ?? '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Initial Value</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>{valueLabel}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Start Month</div>
                    <div style={{ fontSize: 14 }}>{(project as any).start_month ? fmtMonth((project as any).start_month) : '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Est. Launch</div>
                    <div style={{ fontSize: 14 }}>{(project as any).end_month ? fmtMonth((project as any).end_month) : '—'}</div>
                  </div>
                  {project.contract_url && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Contract</div>
                      <a
                        href={safeUrl(project.contract_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 13, color: 'var(--navy)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        View Contract
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </a>
                    </div>
                  )}
                  {project.notes && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Notes</div>
                      <div style={{ fontSize: 13, color: 'var(--c2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{project.notes}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Budget Utilization */}
              <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--c6)' }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Budget Utilization</h3>
                </div>
                <div style={{ padding: '20px' }}>
                  {totalValue > 0 ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--c3)' }}>{invoicedPct ?? 0}% invoiced</span>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(totalInvoiced)} / {fmt(totalValue)}</span>
                      </div>
                      <div style={{ background: 'var(--c6)', borderRadius: 6, height: 8, overflow: 'hidden', marginBottom: 20 }}>
                        <div style={{ width: `${Math.min(100, invoicedPct ?? 0)}%`, height: '100%', background: 'var(--navy)', borderRadius: 6 }} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Value</div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(totalValue)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Invoiced</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--green)' }}>{fmt(totalInvoiced)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Remaining</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: leftToInvoice > 0 ? 'var(--navy)' : 'var(--c4)' }}>{fmt(leftToInvoice)}</div>
                        </div>
                      </div>
                      {totalCosts > 0 && (
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--c6)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: 'var(--c3)' }}>Project costs</span>
                          <span style={{ color: 'var(--red)', fontWeight: 700 }}>{fmt(totalCosts)}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: 'var(--c4)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>No invoice data yet</div>
                  )}
                </div>
              </div>

              {/* Team Allocation */}
              <div className="card">
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--c6)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Team</h3>
                  <button className="btn btn-primary btn-sm" onClick={() => { setAddMemberIds([]); setShowAddMember(true) }}>+ Add</button>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  {projectMembers.length === 0 ? (
                    <p style={{ color: 'var(--c4)', fontSize: 13, margin: 0, textAlign: 'center' }}>No team members assigned yet</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {projectMembers.map(pm => (
                        <div key={pm.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--c7)', borderRadius: 8, padding: '6px 10px 6px 6px' }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                            {pm.member.name.charAt(0).toUpperCase()}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c1)' }}>{pm.member.name}</span>
                          <button
                            onClick={() => setRemoveMemberTarget({ id: pm.id, name: pm.member.name })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c4)', fontSize: 14, lineHeight: 1, padding: '0 0 0 2px', display: 'flex', alignItems: 'center' }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Quick Actions */}
              <div className="card" style={{ background: '#0f172a', border: 'none' }}>
                <div style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Quick Actions</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      onClick={() => { setPlanRows([{ month: '', description: defaultPlanDescription(), planned_amount: '', probability: '100' }]); setShowAddPlan(true) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', width: '100%', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, textAlign: 'left' }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      </div>
                      Add Invoice Plan
                    </button>
                    <button
                      onClick={openAddCR}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', width: '100%', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, textAlign: 'left' }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      </div>
                      Add Change Request
                    </button>
                    <button
                      onClick={() => setShowAddCost(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', width: '100%', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, textAlign: 'left' }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                      </div>
                      Add Cost
                    </button>
                    <button
                      onClick={openProjectEdit}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', width: '100%', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 500, textAlign: 'left' }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(100,116,139,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </div>
                      Edit Project
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── Invoice Planning tab ── */}
        {tab === 'invoice' && (
          <>
        {/* ── Invoice Plans section ── */}
        {(() => {
          const planYears = [...new Set(invoiceRows.map(r => parseInt(r.month.slice(0, 4))))].sort()
          const availYears = planYears.length > 0 ? planYears : [new Date().getFullYear()]
          const currentYear = availYears.includes(planYear) ? planYear : availYears[availYears.length - 1]
          const yearInvoiceRows = invoiceRows.filter(r => r.month.startsWith(String(currentYear)))
          return (<>
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2>Invoice Plans</h2>
            <span className="text-muted text-sm" style={{ fontSize: 12 }}>← synced with planning grid</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {availYears.map(y => (
              <button key={y} className={`btn btn-xs ${currentYear === y ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPlanYear(y)}>{y}</button>
            ))}
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 4 }} onClick={() => { setPlanRows([{ month: '', description: defaultPlanDescription(), planned_amount: '', probability: '100' }]); setShowAddPlan(true) }}>
              + Add planned invoice
            </button>
          </div>
        </div>
        {project.type === 'fixed' && contractVal != null && (() => {
          const activePlanTotal = invoiceRows
            .filter(r => r.status !== 'deferred')
            .reduce((s, r) => s + (r.planned_amount ?? 0), 0)
          if (activePlanTotal < contractVal) {
            return (
              <div className="alert alert-amber" style={{ marginBottom: 12, fontSize: 13 }}>
                Invoice plan total ({activePlanTotal.toLocaleString()} €) is less than contract value ({contractVal.toLocaleString()} €) — consider adding more invoice plans.
              </div>
            )
          }
          return null
        })()}
        <div className="card" style={{ marginBottom: 24 }}>
          {rpLoading ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              Loading…
            </div>
          ) : invoiceRows.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              No invoice plans yet.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>MONTH</th>
                  <th>DESCRIPTION</th>
                  <th className="th-right">PLANNED</th>
                  <th className="th-right">ACTUAL</th>
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
                  const rowBg = isDeferred ? 'rgba(239,68,68,0.06)' : isPending ? 'rgba(245, 180, 50, 0.07)' : undefined

                  const actualColor =
                    r.status === 'paid' ? 'var(--green)'
                    : r.status === 'issued' ? 'var(--navy)'
                    : 'var(--c3)'

                  return (
                    <tr key={r.id} style={{ background: rowBg }}>
                      <td className="text-mono" style={{ fontSize: 13, color: 'var(--c2)' }}>
                        {fmtMonth(r.month)}
                      </td>
                      <td style={{ fontSize: 13, color: isDeferred ? 'var(--c4)' : 'var(--c1)', textDecoration: isDeferred ? 'line-through' : undefined }}>
                        {r.notes ?? (project?.type === 'variable' ? <span style={{ color: 'var(--c3)' }}>{project.name}</span> : <span className="text-muted">—</span>)}
                      </td>
                      <td className="td-right text-mono" style={{ fontSize: 13, color: isDeferred ? 'var(--c4)' : 'var(--c3)', textDecoration: isDeferred ? 'line-through' : undefined }}>
                        {r.planned_amount != null ? fmt(r.planned_amount) : <span className="text-muted">—</span>}
                      </td>
                      <td className="td-right" style={{ fontSize: 13 }}>
                        <span style={{ color: actualColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {r.actual_amount != null ? fmt(r.actual_amount) : <span className="text-muted">—</span>}
                        </span>
                        {r.actual_amount != null && r.planned_amount != null && r.actual_amount > r.planned_amount && (
                          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: 'var(--amber)', background: 'rgba(245,180,50,0.15)', border: '1px solid var(--amber)', borderRadius: 4, padding: '1px 5px' }}>
                            +{fmt(r.actual_amount - r.planned_amount)}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--c3)', fontVariantNumeric: 'tabular-nums' }}>
                        {r.probability != null ? `${r.probability}%` : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        {isDeferred
                          ? <span className="badge badge-red">Deferred</span>
                          : isPending
                            ? <span className="badge badge-amber">Not issued</span>
                            : <span className={`badge ${RP_STATUS_BADGE[r.status] ?? 'badge-gray'}`}>{cap(r.status)}</span>
                        }
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {isPending && (
                            <>
                              <button className="btn btn-primary btn-xs" onClick={() => openConfirm(r)}>Confirm</button>
                              {project?.type === 'fixed' && (
                                <button className="btn btn-ghost btn-xs" onClick={() => openMove(r)} title="Move to another month">Move</button>
                              )}
                            </>
                          )}
                          {isPending && (
                            <button className="btn btn-secondary btn-xs" onClick={() => { setQuickUpdateRow(r); setQuickUpdateAmount(r.planned_amount != null ? String(r.planned_amount) : '') }}>
                              Update estimate
                            </button>
                          )}
                          {isDeferred && (
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={() => { setPlanAgainRow(r); setPlanAgainMonth(r.month.slice(0, 7)); setPlanAgainAmount(r.planned_amount?.toString() ?? ''); setShowPlanAgain(true) }}
                              style={{ color: 'var(--navy)' }}
                            >
                              Plan again
                            </button>
                          )}
                          {isSettled && (
                            <button className="btn btn-secondary btn-xs" onClick={() => openEdit(r)}>Edit</button>
                          )}
                          <button
                            className="btn btn-ghost btn-xs"
                            onClick={() => setDeletePlanTarget(r)}
                            style={{ color: 'var(--red)' }}
                            title="Delete invoice plan"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {invoiceRows.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--c6)', background: '#f9fafb' }}>
                    <td colSpan={2} style={{ padding: '8px 16px', fontWeight: 700, fontSize: 12, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</td>
                    <td className="td-right text-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', padding: '8px 16px' }}>
                      {fmt(invoiceRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0))}
                    </td>
                    <td className="td-right text-mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', padding: '8px 16px' }}>
                      {invoiceRows.some(r => r.actual_amount != null)
                        ? fmt(invoiceRows.reduce((s, r) => s + (r.actual_amount ?? 0), 0))
                        : <span className="text-muted">—</span>}
                    </td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
        </>)})()}

        {/* ── Change Requests section ── */}
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Change Requests</h2>
          <button className="btn btn-secondary btn-sm" onClick={openAddCR}>
            + Add change request
          </button>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          {crStore.changeRequests.length === 0 ? (
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
                    ? <span className="badge badge-navy">Billed</span>
                    : isApproved
                      ? <span className="badge badge-green">Approved</span>
                      : <span className="badge badge-amber">Pending</span>
                  return (
                    <tr key={cr.id}>
                      <td>
                        {crStatusBadge}
                        {isAuto && <span className="badge badge-gray" style={{ marginLeft: 4 }}>Auto</span>}
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--c0)' }}>{cr.title}</td>
                      <td style={{ fontSize: 12, color: 'var(--c3)', maxWidth: 200 }}>{cr.description ?? <span className="text-muted">—</span>}</td>
                      <td className="td-right text-mono" style={{ fontSize: 13, color: 'var(--c2)' }}>
                        {crDisplayAmount != null ? fmt(crDisplayAmount) : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--c3)' }}>
                        {cr.probability != null ? `${cr.probability}%` : '—'}
                      </td>
                      <td className="text-mono" style={{ fontSize: 12, color: 'var(--c3)' }}>
                        {cr.expected_month ? fmtMonth(cr.expected_month) : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {isPending && !isAuto && (
                            <button
                              className="btn btn-primary btn-xs"
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
                            </button>
                          )}
                          {canPlan && (
                            <button className="btn btn-secondary btn-xs" onClick={() => openPlanCR(cr)}>
                              + Plan Invoice
                            </button>
                          )}
                          {!isAuto && isPending && (
                            <button className="btn btn-secondary btn-xs" onClick={() => openEditCR(cr)}>Edit</button>
                          )}
                          {!isAuto && !alreadyPlanned && (
                            <button className="btn btn-ghost btn-xs" onClick={() => setDeleteCRTarget(cr)} style={{ color: 'var(--red)' }}>
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
                  <td colSpan={3} style={{ fontSize: 10, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</td>
                  <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--blue)' }}>
                    {fmt(crStore.changeRequests.reduce((s, cr) => s + (cr.amount ?? 0), 0))}
                  </td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* ── Project Costs section ── */}
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Project Costs</h2>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAddCost(true)}>
            + Add cost
          </button>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          {costRows.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              No costs recorded for this project.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>MONTH</th>
                  <th>DESCRIPTION</th>
                  <th className="th-right">AMOUNT</th>
                  <th className="th-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {costRows.map(r => (
                  <tr key={r.id}>
                    <td className="text-mono" style={{ fontSize: 13, color: 'var(--c2)' }}>
                      {fmtMonth(r.month)}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--c1)' }}>
                      {r.notes ?? <span className="text-muted">—</span>}
                    </td>
                    <td className="td-right text-mono" style={{ fontWeight: 600, color: 'var(--red)', fontSize: 13 }}>
                      {r.actual_amount != null ? fmt(r.actual_amount) : <span className="text-muted">—</span>}
                    </td>
                    <td className="td-right">
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-xs" onClick={() => openEditCost(r)}>Edit</button>
                        <button className="btn btn-xs" style={{ color: 'var(--red)', border: '1px solid var(--red)', background: 'transparent' }} onClick={() => setDeleteCostId(r.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                  <td colSpan={2} style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)', letterSpacing: '0.05em' }}>
                    TOTAL COSTS
                  </td>
                  <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--red)', fontSize: 14 }}>
                    {fmt(totalCosts)}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </div>

          </>
        )}

        {/* ── Resource Planning tab ── */}
        {tab === 'resource' && (
          <div>
            {/* Actual allocations from grid */}
            <div className="section-bar" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2>Resource Allocations</h2>
                <span style={{ fontSize: 12, color: 'var(--c4)' }}>synced from Allocation Grid</span>
              </div>
              <Link to="/resource-planning" className="btn btn-secondary btn-sm">Open Grid →</Link>
            </div>
            {projectAllocations.length === 0 ? (
              <div className="card" style={{ marginBottom: 24 }}>
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
                  No allocations recorded for this project yet. Allocate time in the <Link to="/resource-planning" style={{ color: 'var(--navy)' }}>Allocation Grid</Link>.
                </div>
              </div>
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
                <div className="card" style={{ marginBottom: 24 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>TEAM MEMBER</th>
                        <th className="th-right">TOTAL HOURS</th>
                        <th className="th-right">ENTRIES</th>
                        <th className="th-right">DATE RANGE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(byMember).sort((a, b) => b.totalHours - a.totalHours).map(({ name, totalHours, entries }) => {
                        const dates = entries.map(e => e.date).sort()
                        const fromDate = dates[0]
                        const toDate = dates[dates.length - 1]
                        return (
                          <tr key={name}>
                            <td style={{ fontWeight: 600, fontSize: 14 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                                  {name.charAt(0).toUpperCase()}
                                </div>
                                {name}
                              </div>
                            </td>
                            <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>{totalHours}h</td>
                            <td className="td-right" style={{ color: 'var(--c3)', fontSize: 13 }}>{entries.length}</td>
                            <td className="td-right" style={{ color: 'var(--c3)', fontSize: 12, fontFamily: 'monospace' }}>
                              {fromDate === toDate ? fromDate : `${fromDate} — ${toDate}`}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                        <td style={{ fontWeight: 700, fontSize: 12, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</td>
                        <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>
                          {projectAllocations.reduce((s, a) => s + a.hours, 0)}h
                        </td>
                        <td className="td-right" style={{ color: 'var(--c3)', fontSize: 13 }}>{projectAllocations.length}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })()}

            {/* Deliverables / estimates */}
            <div className="section-bar" style={{ marginBottom: 16 }}>
              <h2>Deliverables &amp; Estimates</h2>
              <button className="btn btn-primary btn-sm" onClick={() => { resetDelForm(); setEditDeliverableTarget(null); setShowDeliverableModal(true) }}>+ Add</button>
            </div>
            <div className="card" style={{ marginBottom: 24 }}>
              {deliverables.length === 0 ? (
                <div style={{ padding: '28px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
                  No deliverables yet. Add deliverables with team assignments and estimated hours to plan resource requirements.
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>DELIVERABLE</th>
                      <th>TEAM</th>
                      <th className="th-right">EST. HOURS</th>
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
                          <td style={{ fontWeight: 600, fontSize: 14 }}>{d.title}</td>
                          <td>{d.team ? <span className="badge badge-gray">{d.team}</span> : <span className="text-muted">—</span>}</td>
                          <td className="td-right text-mono" style={{ fontWeight: 700, color: d.estimated_hours ? 'var(--navy)' : 'var(--c4)' }}>
                            {d.estimated_hours ? `${d.estimated_hours}h` : '—'}
                          </td>
                          <td style={{ fontSize: 13, color: isOverdue ? 'var(--red)' : 'var(--c2)', fontWeight: isOverdue ? 700 : undefined }}>
                            {new Date(d.due_date + 'T00:00:00').toLocaleDateString('en-GB')}
                            {isOverdue && ' ⚠'}
                          </td>
                          <td>
                            <span className={`badge ${d.status === 'completed' ? 'badge-green' : isOverdue ? 'badge-red' : 'badge-blue'}`}>
                              {d.status === 'active' && isOverdue ? 'Overdue' : d.status === 'completed' ? 'Done' : 'Active'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn btn-ghost btn-xs" onClick={() => openEditDeliverable(d)}>Edit</button>
                              <button className="btn btn-ghost btn-xs" onClick={() => handleToggleDeliverable(d)}>
                                {d.status === 'completed' ? 'Reopen' : 'Complete'}
                              </button>
                              <button className="btn btn-ghost btn-xs" onClick={() => handleRemoveDeliverable(d.id)} style={{ color: 'var(--red)' }}>Del</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {deliverables.some(d => d.estimated_hours) && (
                    <tfoot>
                      <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                        <td colSpan={2} style={{ fontWeight: 700, fontSize: 12, color: 'var(--c2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</td>
                        <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>
                          {deliverables.reduce((s, d) => s + (d.estimated_hours ?? 0), 0)}h
                        </td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Remove Team Member Confirm ─── */}
        {removeMemberTarget && (
          <div className="modal-overlay" onClick={() => setRemoveMemberTarget(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
              <div className="modal-header">
                <div className="modal-title">Remove from project?</div>
                <button className="modal-close" onClick={() => setRemoveMemberTarget(null)}>×</button>
              </div>
              <div className="modal-body">
                <p style={{ margin: 0, fontSize: 14, color: 'var(--c1)' }}>
                  Remove <strong>{removeMemberTarget.name}</strong> from this project?
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={() => setRemoveMemberTarget(null)}>Cancel</button>
                <button
                  className="btn btn-sm"
                  style={{ background: 'var(--red)', color: '#fff', border: 'none' }}
                  onClick={async () => {
                    await supabase.from('member_projects').delete().eq('id', removeMemberTarget.id)
                    if (id) fetchProjectMembers(id)
                    setRemoveMemberTarget(null)
                  }}
                >Remove</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Add Team Member Modal ─── */}
        {showAddMember && (
          <div className="modal-overlay" onClick={() => setShowAddMember(false)}>
            <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
              <div className="modal-header">
                <h3>Add Team Members</h3>
                <button className="modal-close" onClick={() => setShowAddMember(false)}>&times;</button>
              </div>
              <div className="modal-body">
                {(() => {
                  const available = members.filter(m => !projectMembers.some(pm => pm.member_id === m.id))
                  if (available.length === 0) return (
                    <p style={{ color: 'var(--c4)', fontSize: 13, margin: 0 }}>All team members are already assigned to this project.</p>
                  )
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {available.map(m => {
                        const checked = addMemberIds.includes(m.id)
                        return (
                          <label
                            key={m.id}
                            onClick={() => setAddMemberIds(prev => checked ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                              border: `2px solid ${checked ? 'var(--navy)' : 'var(--c6)'}`,
                              background: checked ? 'rgba(15,23,42,0.05)' : '#fff',
                              transition: 'all 0.1s',
                            }}
                          >
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: checked ? 'var(--navy)' : 'var(--c5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                              {m.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c0)' }}>{m.name}</div>
                              {m.role && <div style={{ fontSize: 11, color: 'var(--c4)' }}>{m.role}</div>}
                            </div>
                            {checked && (
                              <div style={{ marginLeft: 'auto', color: 'var(--navy)' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              </div>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={() => setShowAddMember(false)}>Cancel</button>
                <button
                  className="btn btn-primary btn-sm"
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
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Add / Edit Deliverable Modal ─── */}
        {showDeliverableModal && (
          <div className="modal-overlay" onClick={() => { setShowDeliverableModal(false); setEditDeliverableTarget(null); resetDelForm() }}>
            <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
              <div className="modal-header">
                <h3>{editDeliverableTarget ? 'Edit Deliverable' : 'Add Deliverable'}</h3>
                <button className="modal-close" onClick={() => { setShowDeliverableModal(false); setEditDeliverableTarget(null); resetDelForm() }}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="form-group" style={{ marginBottom: 16 }}>
                  <label className="form-label">Title</label>
                  <input value={delTitle} onChange={e => setDelTitle(e.target.value)} placeholder="e.g. UX/UI Design delivery" autoFocus />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Start Date <span style={{ fontWeight: 400, color: 'var(--c4)' }}>(optional)</span></label>
                    <input type="date" value={delStartDate} onChange={e => setDelStartDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Due Date</label>
                    <input type="date" value={delDue} onChange={e => setDelDue(e.target.value)} />
                  </div>
                  {delTeam.length <= 1 && (
                    <div className="form-group">
                      <label className="form-label">Estimated Hours</label>
                      <input type="number" value={delHours} onChange={e => setDelHours(e.target.value ? Number(e.target.value) : '')} min={0} step={1} placeholder="40" />
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ marginBottom: delTeam.length > 1 ? 16 : 0 }}>
                  <label className="form-label">Team</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {(teams.length > 0 ? teams : []).map(t => {
                      const sel = delTeam.includes(t.name)
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setDelTeam(prev => sel ? prev.filter(x => x !== t.name) : [...prev, t.name])}
                          style={{
                            padding: '5px 14px',
                            borderRadius: 20,
                            border: sel ? '2px solid var(--navy)' : '2px solid var(--c5)',
                            background: sel ? 'var(--navy)' : '#fff',
                            color: sel ? '#fff' : 'var(--c2)',
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {t.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {delTeam.length > 1 && (
                  <div style={{ background: 'var(--c7)', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Hours per Team</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                      {delTeam.map(tName => (
                        <div key={tName} className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" style={{ fontSize: 12 }}>{tName}</label>
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
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--c3)' }}>
                      Total: <strong>{delTeam.reduce((s, t) => s + (delTeamHours[t] ?? 0), 0)}h</strong>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={() => { setShowDeliverableModal(false); setEditDeliverableTarget(null); resetDelForm() }}>Cancel</button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!delTitle.trim() || !delDue}
                  onClick={editDeliverableTarget ? handleSaveDeliverable : handleAddDeliverable}
                >
                  {editDeliverableTarget ? 'Save' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
