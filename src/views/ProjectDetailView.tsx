import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { RevenuePlanner, Project, ChangeRequest } from '../lib/types'
import { Select } from '../components/Select'

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

// ── local Modal ───────────────────────────────────────────────────────────────

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 10, padding: '28px 32px',
          maxWidth: 560, width: '100%',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--c3)', fontSize: 20, lineHeight: 1, padding: 0,
            }}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
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

interface CRForm {
  title: string
  status: ChangeRequest['status']
  amount: string
  description: string
}

interface MoveForm {
  month: string
}

// ── component ─────────────────────────────────────────────────────────────────

export function ProjectDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const pStore = useProjectsStore()
  const cStore = useClientsStore()
  const crStore = useChangeRequestsStore()

  // revenue_planner rows fetched directly
  const [rpRows, setRpRows] = useState<RevenuePlanner[]>([])
  const [rpLoading, setRpLoading] = useState(false)

  // modals
  const [showAddPlan, setShowAddPlan] = useState(false)
  const [planRows, setPlanRows] = useState<InvoicePlanRow[]>([{ month: '', description: '', planned_amount: '', probability: '100' }])
  const [planSaving, setPlanSaving] = useState(false)

  const [showAddCost, setShowAddCost] = useState(false)
  const [costForm, setCostForm] = useState<CostForm>({ month_from: '', month_to: '', description: '', amount: '' })
  const [costSaving, setCostSaving] = useState(false)

  const [showEditCost, setShowEditCost] = useState(false)
  const [editCostRow, setEditCostRow] = useState<RevenuePlanner | null>(null)
  const [editCostForm, setEditCostForm] = useState<EditCostForm>({ month: '', description: '', amount: '' })
  const [editCostSaving, setEditCostSaving] = useState(false)

  const [showEdit, setShowEdit] = useState(false)
  const [editRow, setEditRow] = useState<RevenuePlanner | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ month: '', description: '', planned_amount: '', actual_amount: '', status: 'planned' })
  const [editSaving, setEditSaving] = useState(false)

  // project edit modal
  const [showProjectEdit, setShowProjectEdit] = useState(false)
  const [projectEditForm, setProjectEditForm] = useState<ProjectEditForm>({ pn: '', name: '', client_id: '', pm: '', value: '', status: 'active', start_month: '', end_month: '', contract_url: '', notes: '' })
  const [projectEditSaving, setProjectEditSaving] = useState(false)

  // inline status change
  const [statusSaving, setStatusSaving] = useState(false)

  // contract & notes modal
  const [showContractEdit, setShowContractEdit] = useState(false)
  const [contractForm, setContractForm] = useState({ contract_url: '', notes: '' })
  const [contractSaving, setContractSaving] = useState(false)

  // confirm-issue popup
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmRow, setConfirmRow] = useState<RevenuePlanner | null>(null)
  const [confirmActual, setConfirmActual] = useState('')
  const [confirmSaving, setConfirmSaving] = useState(false)

  // inline actual-amount edit for planned/retainer rows
  const [inlineEdits, setInlineEdits] = useState<Record<string, string>>({})

  // move invoice month modal
  const [showMove, setShowMove] = useState(false)
  const [moveRow, setMoveRow] = useState<RevenuePlanner | null>(null)
  const [moveForm, setMoveForm] = useState<MoveForm>({ month: '' })
  const [moveSaving, setMoveSaving] = useState(false)

  // change requests
  const [showAddCR, setShowAddCR] = useState(false)
  const [showEditCR, setShowEditCR] = useState(false)
  const [editCRTarget, setEditCRTarget] = useState<ChangeRequest | null>(null)
  const [crForm, setCrForm] = useState<CRForm>({ title: '', status: 'pending', amount: '', description: '' })
  const [crSaving, setCrSaving] = useState(false)

  useEffect(() => {
    pStore.fetchAll()
    cStore.fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id) return
    setRpLoading(true)
    supabase
      .from('revenue_planner')
      .select('*, project:projects(id, pn, name, type)')
      .eq('project_id', id)
      .order('month')
      .then(({ data, error }) => {
        if (error && import.meta.env.DEV) console.error('revenue_planner fetch:', error.message)
        setRpRows((data ?? []) as RevenuePlanner[])
        setRpLoading(false)
      })
    crStore.fetchByProject(id)
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

  const invoicedPct = contractVal && totalInvoiced
    ? Math.round((totalInvoiced / contractVal) * 100)
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
      if (data) setRpRows(prev => [...prev, ...(data as RevenuePlanner[])].sort((a, b) => a.month.localeCompare(b.month)))
      setShowAddPlan(false)
      setPlanRows([{ month: '', description: '', planned_amount: '', probability: '100' }])
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

  function openEdit(r: RevenuePlanner) {
    setEditRow(r)
    setEditForm({
      month: r.month.slice(0, 7),
      description: r.notes ?? '',
      planned_amount: r.planned_amount != null ? String(r.planned_amount) : '',
      actual_amount: r.actual_amount != null ? String(r.actual_amount) : '',
      status: r.status,
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

  function openConfirm(r: RevenuePlanner) {
    setConfirmRow(r)
    setConfirmActual(r.planned_amount != null ? String(r.planned_amount) : r.actual_amount != null ? String(r.actual_amount) : '')
    setShowConfirm(true)
  }

  async function saveConfirm() {
    if (!confirmRow) return
    setConfirmSaving(true)
    try {
      const actual = confirmActual ? Number(confirmActual) : (confirmRow.planned_amount ?? confirmRow.actual_amount)
      const { data } = await supabase
        .from('revenue_planner')
        .update({ status: 'issued', actual_amount: actual })
        .eq('id', confirmRow.id)
        .select('*, project:projects(id, pn, name, type)')
      if (data && data.length > 0) {
        setRpRows(prev => prev.map(row => row.id === confirmRow.id ? (data[0] as RevenuePlanner) : row))
      }
      setShowConfirm(false)
      setConfirmRow(null)
    } finally {
      setConfirmSaving(false)
    }
  }

  async function saveInlineActual(r: RevenuePlanner) {
    const val = inlineEdits[r.id]
    if (val === undefined) return
    const num = val === '' ? null : Number(val)
    const { data } = await supabase
      .from('revenue_planner')
      .update({ actual_amount: num })
      .eq('id', r.id)
      .select('*, project:projects(id, pn, name, type)')
    if (data && data.length > 0) {
      setRpRows(prev => prev.map(row => row.id === r.id ? (data[0] as RevenuePlanner) : row))
    }
    setInlineEdits(prev => {
      const next = { ...prev }
      delete next[r.id]
      return next
    })
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

  function openContractEdit() {
    if (!project) return
    setContractForm({ contract_url: project.contract_url ?? '', notes: project.notes ?? '' })
    setShowContractEdit(true)
  }

  async function saveContractEdit() {
    if (!project) return
    setContractSaving(true)
    try {
      await pStore.update(project.id, {
        contract_url: contractForm.contract_url.trim() || null,
        notes:        contractForm.notes.trim() || null,
      })
      setShowContractEdit(false)
      toast('success', 'Saved')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setContractSaving(false) }
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
    try {
      const { data } = await supabase
        .from('revenue_planner')
        .update({ month: moveForm.month + '-01' })
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

  // ── change request handlers ───────────────────────────────────────────────
  function openAddCR() {
    setCrForm({ title: '', status: 'pending', amount: '', description: '' })
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
      status: cr.status,
      amount: cr.amount != null ? String(cr.amount) : '',
      description: cr.description ?? '',
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
      })
      setShowEditCR(false)
      setEditCRTarget(null)
      toast('success', 'Change request updated')
    } catch (e) { toast('error', (e as Error).message) }
    finally { setCrSaving(false) }
  }

  async function deleteCR(cr: ChangeRequest) {
    if (!confirm(`Delete change request "${cr.title}"?`)) return
    try {
      await crStore.remove(cr.id)
      toast('success', 'Deleted')
    } catch (e) { toast('error', (e as Error).message) }
  }

  async function addCRToInvoicePlan(cr: ChangeRequest) {
    if (!id || !cr.amount) return
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    try {
      const { data, error } = await supabase
        .from('revenue_planner')
        .insert({
          project_id: id,
          month,
          notes: `CR: ${cr.title}`,
          planned_amount: cr.amount,
          actual_amount: null,
          status: 'planned' as const,
          probability: 100,
        })
        .select('*, project:projects(id, pn, name, type)')
      if (error) throw error
      if (data) setRpRows(prev => [...prev, ...(data as RevenuePlanner[])].sort((a, b) => a.month.localeCompare(b.month)))
      toast('success', 'Added to Invoice Plan')
    } catch (e) { toast('error', (e as Error).message) }
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

  const typeBadge = (
    <span className={`badge ${TYPE_BADGE[project.type] ?? 'badge-gray'}`}>
      {cap(project.type)}
    </span>
  )

  const isRecurring = project.type === 'maintenance' || project.type === 'variable'
  const valueLabel = contractVal != null
    ? isRecurring
      ? `${contractVal.toLocaleString()} €/mo`
      : fmt(contractVal)
    : '—'
  const plannedTotal = isRecurring && contractVal && invoiceRows.length > 0
    ? contractVal * invoiceRows.length
    : null

  return (
    <div>
      {/* ── Contract & notes modal ── */}
      {showContractEdit && (
        <Modal title="Contract & Notes" onClose={() => setShowContractEdit(false)}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Contract URL</label>
            <input value={contractForm.contract_url} onChange={e => setContractForm(f => ({ ...f, contract_url: e.target.value }))} placeholder="https://…" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea rows={4} value={contractForm.notes} onChange={e => setContractForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any internal notes about this project…" style={{ width: '100%', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowContractEdit(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveContractEdit} disabled={contractSaving}>
              {contractSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

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
                options={[
                  { value: 'Nino', label: 'Nino' },
                  { value: 'Ana', label: 'Ana' },
                  { value: 'Maja', label: 'Maja' },
                ]}
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
                  { value: 'cancelled', label: 'Cancelled' },
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
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Actual amount invoiced (€)</label>
            <input
              className="form-input"
              type="number"
              value={confirmActual}
              onChange={e => setConfirmActual(e.target.value)}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowConfirm(false); setConfirmRow(null) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveConfirm} disabled={confirmSaving}>
              {confirmSaving ? 'Saving…' : '✓ Confirm Issued'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add invoice plan modal ── */}
      {showAddPlan && (
        <Modal title="Add Invoice Plans" onClose={() => { setShowAddPlan(false); setPlanRows([{ month: '', description: '', planned_amount: '', probability: '100' }]) }}>
          {/* column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 100px 80px 28px', gap: '4px 8px', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Month</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount (€)</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Probability</span>
            <span />
          </div>
          {planRows.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 100px 80px 28px', gap: '6px 8px', alignItems: 'center', marginBottom: 6 }}>
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
                  { value: '75', label: '75%' },
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
            onClick={() => setPlanRows(rows => [...rows, { month: '', description: '', planned_amount: '', probability: '100' }])}
            style={{ marginTop: 4, marginBottom: 20 }}
          >
            + Add row
          </button>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddPlan(false); setPlanRows([{ month: '', description: '', planned_amount: '', probability: '100' }]) }}>Cancel</button>
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
          <div className="form-group">
            <label className="form-label">Status</label>
            <Select
              value={editForm.status}
              onChange={val => setEditForm(f => ({ ...f, status: val }))}
              options={[
                { value: 'planned', label: 'Planned' },
                { value: 'issued', label: 'Issued' },
                { value: 'paid', label: 'Paid' },
                { value: 'variable', label: 'Variable' },
              ]}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowEdit(false); setEditRow(null) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Save'}
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
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Title</label>
            <input value={crForm.title} onChange={e => setCrForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Add CRM integration" autoFocus />
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <Select value={crForm.status} onChange={val => setCrForm(f => ({ ...f, status: val as ChangeRequest['status'] }))} options={[
                { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' },
                { value: 'in_progress', label: 'In Progress' }, { value: 'completed', label: 'Completed' },
                { value: 'rejected', label: 'Rejected' },
              ]} />
            </div>
            <div className="form-group">
              <label className="form-label">Amount (€) <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
              <input type="number" value={crForm.amount} onChange={e => setCrForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Description <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
            <textarea rows={3} value={crForm.description} onChange={e => setCrForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this change involve?" style={{ width: '100%', resize: 'vertical' }} />
          </div>
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
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Title</label>
            <input value={crForm.title} onChange={e => setCrForm(f => ({ ...f, title: e.target.value }))} autoFocus />
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <Select value={crForm.status} onChange={val => setCrForm(f => ({ ...f, status: val as ChangeRequest['status'] }))} options={[
                { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' },
                { value: 'in_progress', label: 'In Progress' }, { value: 'completed', label: 'Completed' },
                { value: 'rejected', label: 'Rejected' },
              ]} />
            </div>
            <div className="form-group">
              <label className="form-label">Amount (€) <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
              <input type="number" value={crForm.amount} onChange={e => setCrForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Description <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
            <textarea rows={3} value={crForm.description} onChange={e => setCrForm(f => ({ ...f, description: e.target.value }))} style={{ width: '100%', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowEditCR(false); setEditCRTarget(null) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveEditCR} disabled={crSaving || !crForm.title.trim()}>
              {crSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <button
              onClick={() => navigate('/projects')}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--c3)', fontSize: 13, padding: 0,
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Projects
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0 }}>{project.name}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 13, color: 'var(--c3)' }}>
            {clientLink}
            <span>·</span>
            {typeBadge}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={project.status}
            disabled={statusSaving}
            onChange={e => saveStatus(e.target.value)}
            style={{
              fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 6,
              border: '1px solid var(--c5)', background: 'var(--c7)', cursor: 'pointer',
              color: project.status === 'active' ? 'var(--green)' : project.status === 'paused' ? 'var(--amber)' : project.status === 'cancelled' ? 'var(--red)' : 'var(--c3)',
            }}
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={openContractEdit}>
            Contract & notes
          </button>
          <button className="btn btn-secondary btn-sm" onClick={openProjectEdit}>
            Edit
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddPlan(true)}>
            + Add invoice plan
          </button>
        </div>
      </div>

      <div className="page-content">

        {/* ── Info cards ── */}
        <div className="card" style={{ marginBottom: 24, padding: '20px 24px' }}>
          <div className="grid-3" style={{ gap: '16px 24px' }}>
            {/* Row 1 */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Client</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{clientLink}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Project Manager</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--c1)' }}>{project.pm ?? <span className="text-muted">—</span>}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Type</div>
              <div>{typeBadge}</div>
            </div>

            {/* Row 2 */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Value</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', fontVariantNumeric: 'tabular-nums' }}>
                {valueLabel}
                {plannedTotal != null && (
                  <span style={{ fontSize: 12, color: 'var(--c3)', fontWeight: 500, marginLeft: 6 }}>
                    × {invoiceRows.length} mo = {fmt(plannedTotal)}
                  </span>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Invoiced</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>
                {totalInvoiced > 0
                  ? <>
                      {fmt(totalInvoiced)}
                      {invoicedPct != null && (
                        <span style={{ fontSize: 12, color: 'var(--c3)', fontWeight: 500, marginLeft: 6 }}>({invoicedPct}%)</span>
                      )}
                    </>
                  : '—'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Costs</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>
                {totalCosts > 0 ? fmt(totalCosts) : '—'}
              </div>
            </div>

            {/* Contract URL + Notes (only if set) */}
            {project.contract_url && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Contract</div>
                <a
                  href={project.contract_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: 'var(--navy)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {project.contract_url.replace(/^https?:\/\//, '').slice(0, 60)}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              </div>
            )}
            {project.notes && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Notes</div>
                <div style={{ fontSize: 13, color: 'var(--c2)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{project.notes}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Invoice Plans section ── */}
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2>Invoice Plans</h2>
            <span className="text-muted text-sm" style={{ fontSize: 12 }}>← synced with planning grid</span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddPlan(true)}>
            + Add planned invoice
          </button>
        </div>
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
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoiceRows.map(r => {
                  const isSettled = r.status === 'issued' || r.status === 'paid'
                  const isPending = r.status === 'planned' || r.status === 'retainer'
                  const rowBg = isPending ? 'rgba(245, 180, 50, 0.07)' : undefined

                  const actualColor =
                    r.status === 'paid' ? 'var(--green)'
                    : r.status === 'issued' ? 'var(--navy)'
                    : 'var(--c3)'

                  const inlineVal = inlineEdits[r.id]

                  return (
                    <tr key={r.id} style={{ background: rowBg }}>
                      <td className="text-mono" style={{ fontSize: 13, color: 'var(--c2)' }}>
                        {fmtMonth(r.month)}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--c1)' }}>
                        {r.notes ?? <span className="text-muted">—</span>}
                      </td>
                      <td className="td-right text-mono" style={{ fontSize: 13, color: 'var(--c3)' }}>
                        {r.planned_amount != null ? fmt(r.planned_amount) : <span className="text-muted">—</span>}
                      </td>
                      <td className="td-right" style={{ fontSize: 13 }}>
                        {isPending ? (
                          <input
                            type="number"
                            value={inlineVal !== undefined ? inlineVal : (r.actual_amount != null ? String(r.actual_amount) : '')}
                            placeholder="—"
                            onChange={e => setInlineEdits(prev => ({ ...prev, [r.id]: e.target.value }))}
                            onBlur={() => saveInlineActual(r)}
                            onKeyDown={e => { if (e.key === 'Enter') saveInlineActual(r) }}
                            style={{
                              width: 90, textAlign: 'right', fontSize: 13,
                              border: '1px solid var(--c6)', borderRadius: 4,
                              padding: '3px 6px', fontVariantNumeric: 'tabular-nums',
                              color: 'var(--c1)',
                            }}
                          />
                        ) : (
                          <span style={{ color: actualColor, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                            {r.actual_amount != null ? fmt(r.actual_amount) : <span className="text-muted">—</span>}
                          </span>
                        )}
                      </td>
                      <td>
                        {isPending
                          ? <span className="badge badge-amber">Not issued</span>
                          : <span className={`badge ${RP_STATUS_BADGE[r.status] ?? 'badge-gray'}`}>{cap(r.status)}</span>
                        }
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {isPending && (
                            <>
                              <button
                                className="btn btn-primary btn-xs"
                                onClick={() => openConfirm(r)}
                              >
                                ✓ Confirm
                              </button>
                              <button
                                className="btn btn-ghost btn-xs"
                                onClick={() => openMove(r)}
                                title="Move to another month"
                              >
                                Move
                              </button>
                            </>
                          )}
                          {isSettled && (
                            <button
                              className="btn btn-secondary btn-xs"
                              onClick={() => openEdit(r)}
                            >
                              Edit
                            </button>
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
                  <th>STATUS</th>
                  <th>TITLE</th>
                  <th className="th-right">AMOUNT</th>
                  <th>DESCRIPTION</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {crStore.changeRequests.map(cr => {
                  const CR_BADGE: Record<string, string> = {
                    pending: 'badge-amber', approved: 'badge-blue',
                    in_progress: 'badge-navy', completed: 'badge-green', rejected: 'badge-gray',
                  }
                  const CR_LABEL: Record<string, string> = {
                    pending: 'Pending', approved: 'Approved',
                    in_progress: 'In Progress', completed: 'Completed', rejected: 'Rejected',
                  }
                  const canPlan = (cr.status === 'approved' || cr.status === 'in_progress') && cr.amount != null
                  return (
                    <tr key={cr.id}>
                      <td><span className={`badge ${CR_BADGE[cr.status] ?? 'badge-gray'}`}>{CR_LABEL[cr.status] ?? cr.status}</span></td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--c0)' }}>{cr.title}</td>
                      <td className="td-right text-mono" style={{ fontSize: 13, color: 'var(--c2)' }}>
                        {cr.amount != null ? fmt(cr.amount) : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--c3)', maxWidth: 300 }}>{cr.description ?? <span className="text-muted">—</span>}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          {canPlan && (
                            <button className="btn btn-ghost btn-xs" onClick={() => addCRToInvoicePlan(cr)} title="Add to invoice plan">
                              + Plan
                            </button>
                          )}
                          <button className="btn btn-secondary btn-xs" onClick={() => openEditCR(cr)}>Edit</button>
                          <button className="btn btn-ghost btn-xs" onClick={() => deleteCR(cr)} style={{ color: 'var(--red)' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
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
                  <th></th>
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
                    <td>
                      <button className="btn btn-secondary btn-xs" onClick={() => openEditCost(r)}>Edit</button>
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
                </tr>
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
