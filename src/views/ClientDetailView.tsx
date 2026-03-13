import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { useDomainsStore } from '../stores/domains'
import { useInfraStore } from '../stores/infrastructure'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import type { Project, Domain, HostingClient, RevenuePlanner } from '../lib/types'
import { Select } from '../components/Select'

// ── helpers ──────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

function currentYearMonths(): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return `${CURRENT_YEAR}-${m}-01`
  })
}

function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtMonth(m: string) {
  const dt = new Date(m + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function nextMonthLabel() {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function fmtEuro(n?: number | null) {
  if (n == null) return '—'
  return `€${n.toLocaleString('en-EU')}`
}

// ── badge maps ───────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green',
  paused: 'badge-amber',
  completed: 'badge-gray',
  cancelled: 'badge-red',
}
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

// ── local sub-components ─────────────────────────────────────────────────────

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

type ProjectType = 'fixed' | 'maintenance' | 'variable'

function TypePills({ value, onChange }: { value: ProjectType; onChange: (v: ProjectType) => void }) {
  const types = [
    { key: 'fixed' as ProjectType, label: 'Fixed', sub: 'Known total',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> },
    { key: 'maintenance' as ProjectType, label: 'Recurring', sub: 'Monthly recurring',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg> },
    { key: 'variable' as ProjectType, label: 'Variable', sub: 'Hourly / usage-based',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg> },
  ]
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="form-label" style={{ marginBottom: 8 }}>Project type</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {types.map(t => (
          <div key={t.key} onClick={() => onChange(t.key)}
            style={{ flex: 1, border: `2px solid ${value === t.key ? 'var(--navy)' : 'var(--c6)'}`, borderRadius: 'var(--r)', padding: '12px 10px', cursor: 'pointer', background: value === t.key ? 'var(--navy-light)' : '#fff', textAlign: 'center', transition: 'all .12s' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>{t.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: value === t.key ? 'var(--navy)' : 'var(--c1)' }}>{t.label}</div>
            <div style={{ fontSize: 11, color: 'var(--c4)', marginTop: 2 }}>{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface DomainRowData {
  domain_name: string
  expiry_date: string
  yearly_amount: string
}

function DomainRowInputs({
  rows,
  onChange,
}: {
  rows: DomainRowData[]
  onChange: (rows: DomainRowData[]) => void
}) {
  function update(i: number, field: keyof DomainRowData, val: string) {
    const next = rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r)
    onChange(next)
  }
  function addRow() {
    onChange([...rows, { domain_name: '', expiry_date: '', yearly_amount: '' }])
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 110px 32px', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          <input
            className="form-input"
            placeholder="domain.com"
            value={r.domain_name}
            onChange={e => update(i, 'domain_name', e.target.value)}
          />
          <input
            className="form-input"
            type="date"
            value={r.expiry_date}
            onChange={e => update(i, 'expiry_date', e.target.value)}
          />
          <input
            className="form-input"
            placeholder="€/yr"
            type="number"
            value={r.yearly_amount}
            onChange={e => update(i, 'yearly_amount', e.target.value)}
          />
          <button
            type="button"
            onClick={() => removeRow(i)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={addRow} style={{ marginTop: 4 }}>
        + Add domain
      </button>
    </div>
  )
}

// ── component ─────────────────────────────────────────────────────────────────

interface EditFormState {
  name: string
  email: string
  phone: string
  address: string
  vat_id: string
}

interface ProjFormState {
  name: string
  pm: string
  type: ProjectType
  contract_value: string
  start_month: string
  end_month: string
  starting_from: string
  probability: string
}

const EMPTY_PROJ: ProjFormState = {
  name: '', pm: 'Nino', type: 'fixed',
  contract_value: '', start_month: '', end_month: '',
  starting_from: '', probability: '70',
}

export function ClientDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const cStore = useClientsStore()
  const pStore = useProjectsStore()
  const dStore = useDomainsStore()
  const infraStore = useInfraStore()
  const rpStore = useRevenuePlannerStore()

  const months = useMemo(() => currentYearMonths(), [])

  // ── modal state ──────────────────────────────────────────────────────────
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '', email: '', phone: '', address: '', vat_id: '',
  })
  const [editSaving, setEditSaving] = useState(false)

  const [showAddProject, setShowAddProject] = useState(false)
  const [projForm, setProjForm] = useState<ProjFormState>({ ...EMPTY_PROJ })
  const [projSaving, setProjSaving] = useState(false)

  const [showAddDomain, setShowAddDomain] = useState(false)
  const [domainRows, setDomainRows] = useState<DomainRowData[]>([
    { domain_name: '', expiry_date: '', yearly_amount: '' },
  ])
  const [domainPn, setDomainPn] = useState('')
  const [domainSaving, setDomainSaving] = useState(false)

  const [showAddHosting, setShowAddHosting] = useState(false)
  const [hostingForm, setHostingForm] = useState({
    project_pn: '', description: '', cycle: 'monthly' as 'monthly' | 'yearly', amount: '', billing_since: '', next_invoice_date: '',
  })
  const [hostingSaving, setHostingSaving] = useState(false)

  useEffect(() => {
    cStore.fetchAll()
    pStore.fetchAll()
    dStore.fetchAll()
    infraStore.fetchAll()
    rpStore.fetchByMonths(months)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const client = cStore.clients.find(c => c.id === id)
  const projects = pStore.projects.filter(p => p.client_id === id)
  const projectIds = new Set(projects.map(p => p.id))

  // ── revenue planner rows for this client ─────────────────────────────────
  const rpRows = rpStore.rows.filter(r => r.project?.client_id === id || (r.project_id != null && projectIds.has(r.project_id)))

  // ── stats ────────────────────────────────────────────────────────────────
  const activeProjects = projects.filter(p => p.status === 'active')

  // ── infra / domains ───────────────────────────────────────────────────────
  const hostingRows = infraStore.hostingClients.filter(h => h.client_id === id)
  const clientDomains = dStore.domains.filter(d => d.client_id === id)

  const contractsValue = activeProjects.reduce((s, p) => s + (p.contract_value ?? 0), 0)
  const hostingAnnual = hostingRows.reduce((s, h) => s + (h.cycle === 'monthly' ? h.amount * 12 : h.amount), 0)
  const domainsAnnual = clientDomains.reduce((s, d) => s + (d.yearly_amount ?? 0), 0)
  const totalValue = contractsValue + hostingAnnual + domainsAnnual

  const invoicedYTD = rpRows
    .filter(r => months.some(m => m === r.month))
    .reduce((s, r) => s + (r.actual_amount ?? 0), 0)

  // ── per-project invoiced amounts ──────────────────────────────────────────
  const invoicedByProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rpRows) {
      if (r.actual_amount && r.project_id) {
        map.set(r.project_id, (map.get(r.project_id) ?? 0) + r.actual_amount)
      }
    }
    return map
  }, [rpRows])

  // ── invoice history: only rows that have been actually invoiced ────────────
  const invoiceHistory: RevenuePlanner[] = useMemo(() => {
    return [...rpRows]
      .filter(r => r.actual_amount != null && r.actual_amount > 0)
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 20)
  }, [rpRows])


  // ── derived subtitle ──────────────────────────────────────────────────────
  const clientSince = client ? new Date(client.created_at).getFullYear() : null
  const activeCount = activeProjects.length

  // ── handlers ─────────────────────────────────────────────────────────────
  function openEdit() {
    if (!client) return
    setEditForm({
      name: client.name ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      address: client.address ?? '',
      vat_id: client.vat_id ?? '',
    })
    setShowEdit(true)
  }

  async function saveEdit() {
    if (!id) return
    setEditSaving(true)
    try {
      await cStore.update(id, {
        name: editForm.name,
        email: editForm.email || null,
        phone: editForm.phone || null,
        address: editForm.address || null,
        vat_id: editForm.vat_id || null,
      })
      setShowEdit(false)
    } finally {
      setEditSaving(false)
    }
  }

  async function saveProject() {
    if (!id) return
    setProjSaving(true)
    try {
      await pStore.add({
        client_id: id,
        pn: `RS-${new Date().getFullYear()}-???`,
        name: projForm.name.trim(),
        type: projForm.type,
        status: 'active',
        pm: projForm.pm || null,
        contract_value: projForm.contract_value ? Number(projForm.contract_value) : null,
        start_date: projForm.start_month ? projForm.start_month + '-01' : null,
        end_date: projForm.end_month ? projForm.end_month + '-01' : null,
        currency: 'EUR',
        notes: null,
      })
      setShowAddProject(false)
      setProjForm({ ...EMPTY_PROJ })
    } finally {
      setProjSaving(false)
    }
  }

  async function saveDomains() {
    if (!id) return
    setDomainSaving(true)
    try {
      const filled = domainRows.filter(r => r.domain_name.trim() && r.expiry_date)
      await dStore.addDomains(
        id,
        domainPn,
        filled.map(r => ({
          domain_name: r.domain_name.trim(),
          expiry_date: r.expiry_date,
          yearly_amount: r.yearly_amount ? Number(r.yearly_amount) : undefined,
        })),
      )
      setShowAddDomain(false)
      setDomainRows([{ domain_name: '', expiry_date: '', yearly_amount: '' }])
      setDomainPn('')
    } finally {
      setDomainSaving(false)
    }
  }

  async function saveHosting() {
    if (!id || !hostingForm.amount) return
    setHostingSaving(true)
    try {
      await infraStore.addHostingClient({
        client_id: id,
        project_pn: hostingForm.project_pn.trim() || '—',
        description: hostingForm.description.trim() || null,
        cycle: hostingForm.cycle,
        amount: Number(hostingForm.amount),
        billing_since: hostingForm.billing_since || null,
        next_invoice_date: hostingForm.next_invoice_date || null,
        status: 'active',
        notes: null,
      })
      setShowAddHosting(false)
      setHostingForm({ project_pn: '', description: '', cycle: 'monthly', amount: '', billing_since: '', next_invoice_date: '' })
    } catch (e) { alert((e as Error).message) }
    finally { setHostingSaving(false) }
  }

  // ── loading / not found ───────────────────────────────────────────────────
  if (cStore.loading) {
    return (
      <div className="page-content" style={{ textAlign: 'center', paddingTop: 60, color: 'var(--c4)' }}>
        Loading…
      </div>
    )
  }

  if (!client) {
    return (
      <div className="page-content" style={{ paddingTop: 40 }}>
        <div className="alert alert-red">Client not found.</div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => navigate('/clients')}>
          ← Back to Clients
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* ── Edit client modal ── */}
      {showEdit && (
        <Modal title="Edit client" onClose={() => setShowEdit(false)}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input
              className="form-input"
              value={editForm.name}
              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowEdit(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={editSaving || !editForm.name.trim()}>
              {editSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── New project modal ── */}
      {showAddProject && (
        <Modal title="New Project" onClose={() => { setShowAddProject(false); setProjForm(EMPTY_PROJ) }}>
          <TypePills value={projForm.type} onChange={v => setProjForm(f => ({ ...f, type: v }))} />

          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Project name</label>
              <input
                placeholder="e.g. Petrol — Prenova"
                value={projForm.name}
                onChange={e => setProjForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Project Manager</label>
              <Select
                value={projForm.pm}
                onChange={val => setProjForm(f => ({ ...f, pm: val }))}
                options={[
                  { value: 'Nino', label: 'Nino' },
                  { value: 'Ana', label: 'Ana' },
                  { value: 'Maja', label: 'Maja' },
                ]}
              />
            </div>
          </div>

          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">
                {projForm.type === 'maintenance' ? 'Monthly amount (€)' : projForm.type === 'variable' ? 'Est. monthly (€)' : 'Project value (€)'}
              </label>
              <input type="number" value={projForm.contract_value} onChange={e => setProjForm(f => ({ ...f, contract_value: e.target.value }))} placeholder={projForm.type === 'fixed' ? '45000' : '2000'} />
            </div>
          </div>


          {projForm.type === 'maintenance' && (
            <>
              <div className="form-row" style={{ marginBottom: 4 }}>
                <div className="form-group">
                  <label className="form-label">Starting from</label>
                  <input type="month" value={projForm.starting_from} onChange={e => setProjForm(f => ({ ...f, starting_from: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    End month
                    <span className="form-hint" style={{ display: 'inline', marginLeft: 6 }}>optional</span>
                  </label>
                  <input type="month" value={projForm.end_month} onChange={e => setProjForm(f => ({ ...f, end_month: e.target.value }))} />
                </div>
              </div>
              {projForm.starting_from && projForm.end_month && projForm.end_month >= projForm.starting_from && (() => {
                const from = new Date(projForm.starting_from + '-01T00:00:00')
                const to = new Date(projForm.end_month + '-01T00:00:00')
                const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1
                const total = projForm.contract_value ? months * Number(projForm.contract_value) : null
                return (
                  <div style={{ fontSize: 12, color: 'var(--navy)', background: 'var(--navy-light)', border: '1px solid var(--navy-muted, #c7d2fe)', borderRadius: 6, padding: '8px 12px', marginBottom: 8 }}>
                    <strong>{months} months</strong>{total ? ` · Total value: €${total.toLocaleString()}` : ''}
                  </div>
                )
              })()}
              <div className="info-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Invoice plans will be auto-generated for every future month.
              </div>
            </>
          )}

          {projForm.type === 'variable' && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Probability (%)</label>
                <input type="number" value={projForm.probability} onChange={e => setProjForm(f => ({ ...f, probability: e.target.value }))} placeholder="70" />
              </div>
              <div className="form-group">
                <label className="form-label">Starting from</label>
                <input type="month" value={projForm.starting_from} onChange={e => setProjForm(f => ({ ...f, starting_from: e.target.value }))} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddProject(false); setProjForm(EMPTY_PROJ) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveProject} disabled={projSaving || !projForm.name.trim()}>
              {projSaving ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : null}
              Create project
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add hosting modal ── */}
      {showAddHosting && (
        <Modal title="Add Hosting" onClose={() => setShowAddHosting(false)}>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label className="form-label">Project #</label>
              <input
                placeholder="RS-2026-001"
                value={hostingForm.project_pn}
                onChange={e => setHostingForm(f => ({ ...f, project_pn: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Billing cycle</label>
              <Select
                value={hostingForm.cycle}
                onChange={val => setHostingForm(f => ({ ...f, cycle: val as 'monthly' | 'yearly' }))}
                options={[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'yearly', label: 'Yearly' },
                ]}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input
              placeholder="e.g. Website hosting + SSL"
              value={hostingForm.description}
              onChange={e => setHostingForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label className="form-label">Amount (€)</label>
              <input type="number" placeholder={hostingForm.cycle === 'monthly' ? '120' : '1440'} value={hostingForm.amount} onChange={e => setHostingForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Billing since <span className="form-hint" style={{ display: 'inline' }}>optional</span></label>
              <input type="month" value={hostingForm.billing_since?.slice(0, 7) ?? ''} onChange={e => {
                const val = e.target.value
                const since = val ? val + '-01' : ''
                let next = hostingForm.next_invoice_date
                if (hostingForm.cycle === 'yearly' && val) {
                  const d = new Date(val + '-01T00:00:00')
                  d.setFullYear(d.getFullYear() + 1)
                  next = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
                }
                setHostingForm(f => ({ ...f, billing_since: since, next_invoice_date: next }))
              }} />
            </div>
          </div>
          {hostingForm.cycle === 'yearly' && (
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Next invoice month</label>
              <input type="month" value={hostingForm.next_invoice_date?.slice(0, 7) ?? ''} onChange={e => setHostingForm(f => ({ ...f, next_invoice_date: e.target.value ? e.target.value + '-01' : '' }))} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddHosting(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveHosting} disabled={hostingSaving || !hostingForm.amount}>
              {hostingSaving ? 'Saving…' : 'Add Hosting'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Add domains modal ── */}
      {showAddDomain && (
        <Modal title="Add Domains" onClose={() => setShowAddDomain(false)}>
          <div className="form-group">
            <label className="form-label">Project #</label>
            <input
              placeholder="RS-2026-001"
              value={domainPn}
              onChange={e => setDomainPn(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>
              Domains
              <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                domain name · expiry date · yearly amount
              </span>
            </label>
            <DomainRowInputs rows={domainRows} onChange={setDomainRows} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddDomain(false)}>Cancel</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={saveDomains}
              disabled={domainSaving || !domainPn}
            >
              {domainSaving ? 'Saving…' : 'Save Domains'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <button
              onClick={() => navigate('/clients')}
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
              Clients
            </button>
          </div>
          <h1>{client.name}</h1>
          <p style={{ color: 'var(--c3)', fontSize: 13, margin: 0 }}>
            Client since {clientSince} · {activeCount} active project{activeCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => openEdit()}>
            Edit
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddProject(true)}>
            + New Project
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="stats-strip">
        <div className="stat-card" style={{ '--left-color': 'var(--navy)' } as React.CSSProperties}>
          <div className="stat-card-label">PROJECTS</div>
          <div className="stat-card-value">{projects.length}</div>
          <div className="stat-card-sub">
            {activeCount === projects.length ? 'All active' : `${activeCount} active`}
          </div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--navy)' } as React.CSSProperties}>
          <div className="stat-card-label">TOTAL VALUE</div>
          <div className="stat-card-value" style={{ color: 'var(--navy)' }}>
            {totalValue ? fmtEuro(totalValue) : '—'}
          </div>
          <div className="stat-card-sub">active contracts</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--green)' } as React.CSSProperties}>
          <div className="stat-card-label">INVOICED YTD</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>
            {invoicedYTD ? fmtEuro(invoicedYTD) : '—'}
          </div>
          <div className="stat-card-sub">{CURRENT_YEAR} actual revenue</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--red)' } as React.CSSProperties}>
          <div className="stat-card-label">TOTAL COSTS</div>
          <div className="stat-card-value" style={{ color: 'var(--red)' }}>—</div>
          <div className="stat-card-sub">not tracked yet</div>
        </div>
      </div>

      <div className="page-content">

        {/* ── Projects section ── */}
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Projects</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddProject(true)}>+ New Project</button>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          {projects.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              No projects for this client yet.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>PROJECT #</th>
                  <th>PROJECT</th>
                  <th style={{ width: 120 }}>TYPE</th>
                  <th className="th-right" style={{ width: 130 }}>VALUE</th>
                  <th>OCCURRENCE</th>
                  <th className="th-right">TOTAL VALUE</th>
                  <th className="th-right">INVOICED</th>
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p: Project) => {
                  const projInvoiced = invoicedByProject.get(p.id)
                  const isRecurring = p.type === 'maintenance' || p.type === 'variable'
                  // total value: for recurring sum planned_amount from rpRows; for fixed use contract_value
                  const projRpRows = rpRows.filter(r => r.project_id === p.id)
                  const totalProjectValue = isRecurring
                    ? projRpRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
                    : p.contract_value ?? 0
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="text-mono" style={{ fontSize: 11, color: 'var(--c3)', background: 'var(--c7)', border: '1px solid var(--c6)', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                          {p.pn}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        <Link
                          to={`/projects/${p.id}`}
                          className="table-link"
                          style={{ color: 'var(--c0)', textDecoration: 'none', fontWeight: 700 }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--navy)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--c0)')}
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td>
                        <span className={`badge ${TYPE_BADGE[p.type] ?? 'badge-gray'}`}>
                          {p.type.charAt(0).toUpperCase() + p.type.slice(1)}
                        </span>
                      </td>
                      <td className="td-right text-mono" style={{ fontWeight: 600 }}>
                        {p.contract_value
                          ? isRecurring
                            ? `€${p.contract_value.toLocaleString()}/mo`
                            : fmtEuro(p.contract_value)
                          : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--c3)' }}>
                        {isRecurring ? 'Monthly' : 'One-time'}
                      </td>
                      <td className="td-right text-mono" style={{ fontWeight: 600 }}>
                        {totalProjectValue > 0
                          ? fmtEuro(totalProjectValue)
                          : <span className="text-muted">—</span>}
                      </td>
                      <td className="td-right text-mono" style={{ color: 'var(--green)', fontWeight: 600 }}>
                        {projInvoiced ? fmtEuro(projInvoiced) : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[p.status] ?? 'badge-gray'}`}>
                          {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => navigate(`/projects/${p.id}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Domains section ── */}
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Domains &amp; Hosting</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddHosting(true)}>+ Add hosting</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddDomain(true)}>+ Add domains</button>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          {hostingRows.length === 0 && clientDomains.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              No hosting or domain entries for this client.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>TYPE</th>
                  <th>PROJECT #</th>
                  <th>DESCRIPTION</th>
                  <th className="th-right">AMOUNT</th>
                  <th>OCCURRENCE</th>
                  <th className="th-right">TOTAL VALUE</th>
                  <th>NEXT BILLING</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {hostingRows.map((h: HostingClient) => {
                  const totalVal = h.cycle === 'monthly' ? h.amount * 12 : h.amount
                  return (
                    <tr key={h.id}>
                      <td>
                        <span className="badge badge-blue" style={{ cursor: 'default' }}>Hosting</span>
                      </td>
                      <td>
                        <span className="badge badge-gray text-mono" style={{ fontSize: 11 }}>{h.project_pn}</span>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--c1)' }}>
                        {h.description ?? <span className="text-muted">—</span>}
                      </td>
                      <td className="td-right text-mono" style={{ fontWeight: 600, fontSize: 13 }}>
                        €{h.amount.toLocaleString()}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--c3)' }}>
                        {h.cycle === 'monthly' ? 'Monthly' : 'Yearly'}
                      </td>
                      <td className="td-right text-mono" style={{ fontWeight: 600, fontSize: 13 }}>
                        {fmtEuro(totalVal)}
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--c2)' }}>
                        {h.cycle === 'monthly' ? nextMonthLabel() : fmtDate(h.next_invoice_date)}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[h.status] ?? 'badge-gray'}`}>
                          {h.status.charAt(0).toUpperCase() + h.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  )
                })}

                {clientDomains.map((d: Domain) => {
                  const days = daysUntil(d.expiry_date)
                  const expiryColor = days <= 30 ? 'var(--red)' : undefined
                  const domainStatus = days < 0
                    ? <span className="badge badge-red">Expired</span>
                    : days <= 30
                      ? <span className="badge badge-red">Expires soon</span>
                      : <span className="badge badge-green">Active</span>
                  return (
                    <tr key={d.id}>
                      <td>
                        <span className="badge" style={{ background: 'var(--navy)', color: '#fff', fontSize: 11, padding: '2px 7px', borderRadius: 4 }}>
                          Domain
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-gray text-mono" style={{ fontSize: 11 }}>{d.project_pn}</span>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--c1)' }}>{d.domain_name}</td>
                      <td className="td-right text-mono" style={{ fontWeight: 600, fontSize: 13 }}>
                        {d.yearly_amount ? `€${d.yearly_amount.toLocaleString()}` : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--c3)' }}>Yearly</td>
                      <td className="td-right text-mono" style={{ fontWeight: 600, fontSize: 13 }}>
                        {d.yearly_amount ? fmtEuro(d.yearly_amount) : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ fontSize: 13, color: expiryColor ?? 'var(--c2)', fontWeight: expiryColor ? 700 : 400 }}>
                        {fmtDate(d.expiry_date)}
                      </td>
                      <td>{domainStatus}</td>
                    </tr>
                  )
                })}

                {(hostingRows.length > 0 || clientDomains.length > 0) && (
                  <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                    <td colSpan={5} style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)', letterSpacing: '0.05em' }}>
                      TOTAL VALUE / YEAR
                    </td>
                    <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>
                      {fmtEuro(hostingAnnual + domainsAnnual)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Invoice History section ── */}
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Invoice History</h2>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          {invoiceHistory.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              No invoiced entries for this client yet.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>MONTH</th>
                  <th>PROJECT</th>
                  <th className="th-right">AMOUNT</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {invoiceHistory.map((r: RevenuePlanner) => {
                  const amtColor = r.status === 'paid' ? 'var(--green)' : r.status === 'issued' ? 'var(--navy)' : 'var(--c2)'
                  return (
                    <tr key={r.id}>
                      <td className="text-mono" style={{ fontSize: 13, color: 'var(--c2)' }}>
                        {fmtMonth(r.month)}
                      </td>
                      <td style={{ color: 'var(--c1)', fontSize: 13 }}>
                        {r.project?.name ?? <span className="text-muted">—</span>}
                      </td>
                      <td className="td-right text-mono" style={{ color: amtColor, fontWeight: 600, fontSize: 13 }}>
                        {fmtEuro(r.actual_amount)}
                      </td>
                      <td>
                        <span className={`badge ${RP_STATUS_BADGE[r.status] ?? 'badge-gray'}`}>
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
