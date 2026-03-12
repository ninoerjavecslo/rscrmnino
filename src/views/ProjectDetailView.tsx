import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { supabase } from '../lib/supabase'
import type { RevenuePlanner, Project } from '../lib/types'

// ── helpers ───────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, string> = {
  fixed: 'badge-blue',
  maintenance: 'badge-amber',
  variable: 'badge-green',
}
const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green',
  paused: 'badge-amber',
  completed: 'badge-gray',
  cancelled: 'badge-red',
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
  return n != null ? `€${n.toLocaleString()}` : '—'
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
}

interface CostForm {
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
}

// ── component ─────────────────────────────────────────────────────────────────

export function ProjectDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const pStore = useProjectsStore()
  const cStore = useClientsStore()

  // revenue_planner rows fetched directly
  const [rpRows, setRpRows] = useState<RevenuePlanner[]>([])
  const [rpLoading, setRpLoading] = useState(false)

  // modals
  const [showAddPlan, setShowAddPlan] = useState(false)
  const [planRows, setPlanRows] = useState<InvoicePlanRow[]>([{ month: '', description: '', planned_amount: '' }])
  const [planSaving, setPlanSaving] = useState(false)

  const [showAddCost, setShowAddCost] = useState(false)
  const [costForm, setCostForm] = useState<CostForm>({ month: '', description: '', amount: '' })
  const [costSaving, setCostSaving] = useState(false)

  const [showEdit, setShowEdit] = useState(false)
  const [editRow, setEditRow] = useState<RevenuePlanner | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({ month: '', description: '', planned_amount: '', actual_amount: '', status: 'planned' })
  const [editSaving, setEditSaving] = useState(false)

  // project edit modal
  const [showProjectEdit, setShowProjectEdit] = useState(false)
  const [projectEditForm, setProjectEditForm] = useState<ProjectEditForm>({ pn: '', name: '', client_id: '', pm: '', value: '', status: 'active', start_month: '', end_month: '' })
  const [projectEditSaving, setProjectEditSaving] = useState(false)

  // confirm-issue popup
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmRow, setConfirmRow] = useState<RevenuePlanner | null>(null)
  const [confirmActual, setConfirmActual] = useState('')
  const [confirmSaving, setConfirmSaving] = useState(false)

  // inline actual-amount edit for planned/retainer rows
  const [inlineEdits, setInlineEdits] = useState<Record<string, string>>({})

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
  }, [id])

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
        })))
        .select('*, project:projects(id, pn, name, type)')
      if (error) throw error
      if (data) setRpRows(prev => [...prev, ...(data as RevenuePlanner[])].sort((a, b) => a.month.localeCompare(b.month)))
      setShowAddPlan(false)
      setPlanRows([{ month: '', description: '', planned_amount: '' }])
    } finally {
      setPlanSaving(false)
    }
  }

  async function saveCost() {
    if (!id) return
    setCostSaving(true)
    try {
      const { data, error } = await supabase
        .from('revenue_planner')
        .insert({
          project_id: id,
          month: costForm.month + '-01',
          notes: costForm.description || null,
          planned_amount: null,
          actual_amount: costForm.amount ? Number(costForm.amount) : null,
          status: 'cost',
        })
        .select('*, project:projects(id, pn, name, type)')
      if (error) throw error
      if (data) setRpRows(prev => [...prev, ...(data as RevenuePlanner[])].sort((a, b) => a.month.localeCompare(b.month)))
      setShowAddCost(false)
      setCostForm({ month: '', description: '', amount: '' })
    } finally {
      setCostSaving(false)
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
      pn:          project.pn ?? '',
      name:        project.name,
      client_id:   project.client_id ?? '',
      pm:          project.pm ?? '',
      value:       project.contract_value != null ? String(project.contract_value) : '',
      status:      project.status,
      start_month: project.start_date ? project.start_date.slice(0, 7) : '',
      end_month:   project.end_date   ? project.end_date.slice(0, 7)   : '',
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
      })
      setShowProjectEdit(false)
    } catch (e) { alert((e as Error).message) }
    finally { setProjectEditSaving(false) }
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
      ? `€${contractVal.toLocaleString()}/mo`
      : fmt(contractVal)
    : '—'
  const plannedTotal = isRecurring && contractVal && invoiceRows.length > 0
    ? contractVal * invoiceRows.length
    : null

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
              <select value={projectEditForm.client_id} onChange={e => setProjectEditForm(f => ({ ...f, client_id: e.target.value }))}>
                <option value="">— No client —</option>
                {cStore.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Project Manager</label>
              <select value={projectEditForm.pm} onChange={e => setProjectEditForm(f => ({ ...f, pm: e.target.value }))}>
                <option>Nino</option><option>Ana</option><option>Maja</option>
              </select>
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Value (€)</label>
              <input type="number" value={projectEditForm.value} onChange={e => setProjectEditForm(f => ({ ...f, value: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select value={projectEditForm.status} onChange={e => setProjectEditForm(f => ({ ...f, status: e.target.value }))}>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Start month</label>
              <input type="month" value={projectEditForm.start_month} onChange={e => setProjectEditForm(f => ({ ...f, start_month: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">End month</label>
              <input type="month" value={projectEditForm.end_month} onChange={e => setProjectEditForm(f => ({ ...f, end_month: e.target.value }))} />
            </div>
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
        <Modal title="Add Invoice Plans" onClose={() => { setShowAddPlan(false); setPlanRows([{ month: '', description: '', planned_amount: '' }]) }}>
          {/* column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 110px 28px', gap: '4px 8px', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Month</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount (€)</span>
            <span />
          </div>
          {planRows.map((row, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 110px 28px', gap: '6px 8px', alignItems: 'center', marginBottom: 6 }}>
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
            onClick={() => setPlanRows(rows => [...rows, { month: '', description: '', planned_amount: '' }])}
            style={{ marginTop: 4, marginBottom: 20 }}
          >
            + Add row
          </button>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddPlan(false); setPlanRows([{ month: '', description: '', planned_amount: '' }]) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={savePlan} disabled={planSaving || planRows.every(r => !r.month)}>
              {planSaving ? 'Saving…' : `Save ${planRows.filter(r => r.month).length || ''} plan${planRows.filter(r => r.month).length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add cost modal ── */}
      {showAddCost && (
        <Modal title="Add Cost" onClose={() => setShowAddCost(false)}>
          <div className="form-group">
            <label className="form-label">Month</label>
            <input
              className="form-input"
              type="month"
              value={costForm.month}
              onChange={e => setCostForm(f => ({ ...f, month: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input
              className="form-input"
              placeholder="e.g. Freelancer payment"
              value={costForm.description}
              onChange={e => setCostForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Amount (€)</label>
            <input
              className="form-input"
              type="number"
              placeholder="0"
              value={costForm.amount}
              onChange={e => setCostForm(f => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddCost(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveCost} disabled={costSaving || !costForm.month}>
              {costSaving ? 'Saving…' : 'Add Cost'}
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
            <select
              className="form-input"
              value={editForm.status}
              onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
            >
              <option value="planned">Planned</option>
              <option value="issued">Issued</option>
              <option value="paid">Paid</option>
              <option value="variable">Variable</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowEdit(false); setEditRow(null) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Save'}
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
          <span className={`badge ${STATUS_BADGE[project.status] ?? 'badge-gray'}`} style={{ marginRight: 4 }}>
            {cap(project.status)}
          </span>
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
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={() => openConfirm(r)}
                            >
                              ✓ Confirm
                            </button>
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
