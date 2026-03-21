import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { useDomainsStore } from '../stores/domains'
import { useInfraStore } from '../stores/infrastructure'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useMaintenancesStore } from '../stores/maintenances'
import { usePipelineStore } from '../stores/pipeline'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { useSettingsStore } from '../stores/settings'
import { toast } from '../lib/toast'
import type { Project, Domain, HostingClient, RevenuePlanner, Maintenance, PipelineItem } from '../lib/types'
import { hostingContractValue } from '../lib/types'
import { Select } from '../components/Select'

// ── helpers ──────────────────────────────────────────────────────────────────

function monthCount(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1)
}

function dealTotal(item: PipelineItem): number {
  if (item.deal_type === 'fixed' && item.monthly_schedule?.length) {
    return item.monthly_schedule.reduce((s, r) => s + r.amount, 0)
  }
  const amt = item.estimated_amount ?? 0
  if (item.deal_type === 'monthly' && item.expected_month && item.expected_end_month) {
    return amt * monthCount(item.expected_month, item.expected_end_month)
  }
  return amt
}

function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return /^https?:\/\//i.test(url) ? url : undefined
}

const CURRENT_YEAR = new Date().getFullYear()

// How many months of a maintenance contract fall within the current year
function maintMonthsThisYear(m: { contract_start?: string | null; contract_end?: string | null }): number {
  const yearStart = `${CURRENT_YEAR}-01`
  const yearEnd   = `${CURRENT_YEAR}-12`
  const cStart = m.contract_start ? m.contract_start.slice(0, 7) : yearStart
  const cEnd   = m.contract_end   ? m.contract_end.slice(0, 7)   : yearEnd
  const effStart = cStart > yearStart ? cStart : yearStart
  const effEnd   = cEnd   < yearEnd   ? cEnd   : yearEnd
  if (effStart > effEnd) return 0
  const [sy, sm] = effStart.split('-').map(Number)
  const [ey, em] = effEnd.split('-').map(Number)
  return (ey - sy) * 12 + (em - sm) + 1
}

function clientMonths(): string[] {
  const months: string[] = []
  for (let y = CURRENT_YEAR - 2; y <= CURRENT_YEAR + 1; y++) {
    for (let m = 1; m <= 12; m++) {
      months.push(`${y}-${String(m).padStart(2, '0')}-01`)
    }
  }
  return months
}

function currentYearMonths(): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return `${CURRENT_YEAR}-${m}-01`
  })
}

function daysUntil(d: string) {
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
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

function fmtMonthShort(m: string) {
  const dt = new Date(m + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

function nextMonthLabel() {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function fmtEuro(n?: number | null) {
  if (n == null) return '—'
  return n.toLocaleString('en-EU') + ' €'
}

function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
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
const TYPE_LABEL: Record<string, string> = {
  fixed: 'Fixed',
  maintenance: 'Recurring',
  variable: 'Variable',
}
const RP_STATUS_BADGE: Record<string, string> = {
  paid: 'badge-green',
  issued: 'badge-blue',
  planned: 'badge-amber',
  retainer: 'badge-navy',
  cost: 'badge-red',
}
const PIPELINE_STATUS_BADGE: Record<string, string> = {
  proposal: 'badge-amber',
  won: 'badge-green',
  lost: 'badge-red',
}
const PIPELINE_STATUS_LABELS: Record<string, string> = {
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
}

// ── sub-components ────────────────────────────────────────────────────────────

function Modal({
  title, onClose, children, maxWidth = 560,
}: {
  title: string; onClose: () => void; children: React.ReactNode; maxWidth?: number
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 10, padding: '28px 32px', maxWidth, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c3)', fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
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

interface DomainRowData { domain_name: string; registered_date: string; expiry_date: string; yearly_amount: string }

function isoToDMY(s: string): string {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  return `${d}/${m}/${y}`
}
function parseDMY(s: string): string {
  const parts = s.split('/')
  if (parts.length !== 3 || parts[2].length !== 4) return s
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
}

function DomainRowInputs({ rows, onChange }: { rows: DomainRowData[]; onChange: (rows: DomainRowData[]) => void }) {
  function update(i: number, field: keyof DomainRowData, val: string) {
    onChange(rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 130px 130px 90px 32px', gap: '4px 8px', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--c4)', fontWeight: 600 }}>Domain</span>
        <span style={{ fontSize: 11, color: 'var(--c4)', fontWeight: 600 }}>Registered</span>
        <span style={{ fontSize: 11, color: 'var(--c4)', fontWeight: 600 }}>Expiry</span>
        <span style={{ fontSize: 11, color: 'var(--c4)', fontWeight: 600 }}>€/yr</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 130px 130px 90px 32px', gap: '4px 8px', marginBottom: 8, alignItems: 'center' }}>
          <input placeholder="example.si" value={r.domain_name} onChange={e => update(i, 'domain_name', e.target.value)} />
          <input placeholder="DD/MM/YYYY" value={isoToDMY(r.registered_date)} onChange={e => update(i, 'registered_date', parseDMY(e.target.value))} />
          <input placeholder="DD/MM/YYYY" value={isoToDMY(r.expiry_date)} onChange={e => update(i, 'expiry_date', parseDMY(e.target.value))} />
          <input placeholder="25" type="number" value={r.yearly_amount} onChange={e => update(i, 'yearly_amount', e.target.value)} />
          <button type="button" onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      ))}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...rows, { domain_name: '', registered_date: '', expiry_date: '', yearly_amount: '' }])} style={{ marginTop: 4 }}>
        + Add domain
      </button>
    </div>
  )
}

// ── form interfaces ───────────────────────────────────────────────────────────

interface EditFormState {
  name: string; email: string; phone: string; address: string; vat_id: string
  website: string
  contact_person: string; contact_email: string; contact_phone: string
}

interface ProjFormState {
  name: string; pm: string; type: ProjectType; contract_value: string
  start_month: string; end_month: string; starting_from: string; probability: string
}

const EMPTY_PROJ: ProjFormState = {
  name: '', pm: 'Nino', type: 'fixed', contract_value: '',
  start_month: '', end_month: '', starting_from: '', probability: '70',
}

interface PipelineScheduleRow { month: string; amount: string }
interface PipelineFormState {
  title: string; status: PipelineItem['status']; estimated_amount: string
  probability: string; expected_month: string; expected_end_month: string
  deal_type: 'one_time' | 'monthly' | 'fixed'
  description: string; notes: string; schedule: PipelineScheduleRow[]
}

const EMPTY_PIPELINE: PipelineFormState = {
  title: '', status: 'proposal', estimated_amount: '',
  probability: '75', expected_month: '', expected_end_month: '',
  deal_type: 'one_time', description: '', notes: '', schedule: [],
}

const PIPELINE_STATUS_OPTS = [
  { value: 'proposal', label: 'Proposal' },
  { value: 'won',      label: 'Won' },
  { value: 'lost',     label: 'Lost' },
]
const PIPELINE_PROB_OPTS = [
  { value: '10', label: '10%' }, { value: '25', label: '25%' },
  { value: '50', label: '50%' }, { value: '75', label: '75%' },
  { value: '90', label: '90%' }, { value: '100', label: '100%' },
]
const PIPELINE_TYPE_OPTS = [
  { value: 'one_time', label: 'One-time payment' },
  { value: 'monthly',  label: 'Monthly recurring' },
  { value: 'fixed',    label: 'Fixed — plan by month' },
]
function plMonthCount(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00'), e = new Date(end + 'T00:00:00')
  return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1)
}

type TabId = 'overview' | 'projects' | 'infra' | 'maintenances' | 'other-income' | 'invoices' | 'pipeline'

// ── component ─────────────────────────────────────────────────────────────────

export function ClientDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const cStore = useClientsStore()
  const pStore = useProjectsStore()
  const dStore = useDomainsStore()
  const infraStore = useInfraStore()
  const rpStore = useRevenuePlannerStore()
  const mStore = useMaintenancesStore()
  const plStore = usePipelineStore()
  const crStore = useChangeRequestsStore()
  const settingsStore = useSettingsStore()
  const pmOptions = settingsStore.projectManagers.map(m => ({ value: m, label: m }))

  const allMonths = useMemo(() => clientMonths(), [])
  const yearMonths = useMemo(() => currentYearMonths(), [])

  // ── tab ──────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  // ── edit client modal ────────────────────────────────────────────────────
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteClient, setShowDeleteClient] = useState(false)
  const [deleteClientSaving, setDeleteClientSaving] = useState(false)
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '', email: '', phone: '', address: '', vat_id: '', website: '',
    contact_person: '', contact_email: '', contact_phone: '',
  })
  const [editSaving, setEditSaving] = useState(false)

  // ── add project modal ────────────────────────────────────────────────────
  const [showAddProject, setShowAddProject] = useState(false)
  const [projForm, setProjForm] = useState<ProjFormState>({ ...EMPTY_PROJ })
  const [projSaving, setProjSaving] = useState(false)

  // ── add domain modal ─────────────────────────────────────────────────────
  const [showAddDomain, setShowAddDomain] = useState(false)
  const [domainRows, setDomainRows] = useState<DomainRowData[]>([{ domain_name: '', registered_date: '', expiry_date: '', yearly_amount: '' }])
  const [domainPn, setDomainPn] = useState('')
  const [domainInvoiceMonth, setDomainInvoiceMonth] = useState('')
  const [domainAlreadyBilled, setDomainAlreadyBilled] = useState(false)
  const [domainSaving, setDomainSaving] = useState(false)

  // ── add hosting modal ────────────────────────────────────────────────────
  const [showAddHosting, setShowAddHosting] = useState(false)
  const [hostingForm, setHostingForm] = useState({
    project_pn: '', description: '', cycle: 'monthly' as 'monthly' | 'yearly',
    amount: '', billing_since: '', next_invoice_date: '',
    invoice_month: '', already_billed: false, contract_id: '', contract_expiry: '',
  })
  const [hostingSaving, setHostingSaving] = useState(false)

  // ── add domain extra fields ───────────────────────────────────────────────
  const [domainContractId, setDomainContractId] = useState('')

  // ── pipeline modal ───────────────────────────────────────────────────────
  const [showPipeline, setShowPipeline] = useState(false)
  const [editPipelineTarget, setEditPipelineTarget] = useState<PipelineItem | null>(null)
  const [pipelineForm, setPipelineForm] = useState<PipelineFormState>({ ...EMPTY_PIPELINE })
  const [pipelineSaving, setPipelineSaving] = useState(false)
  const [deletePipelineTarget, setDeletePipelineTarget] = useState<PipelineItem | null>(null)

  // ── AI summary ───────────────────────────────────────────────────────────
  const [aiSummary, setAiSummary]   = useState<string | null>(null)
  const [aiIdeas, setAiIdeas]       = useState<{ title: string; description: string }[]>([])
  const [aiLoading, setAiLoading]   = useState(false)

  // ── other income modal ───────────────────────────────────────────────────
  const [showOtherIncome, setShowOtherIncome] = useState(false)
  const [editOtherIncomeTarget, setEditOtherIncomeTarget] = useState<RevenuePlanner | null>(null)
  const [otherIncomeForm, setOtherIncomeForm] = useState({ month: '', amount: '', notes: '', status: 'planned' as RevenuePlanner['status'] })
  const [otherIncomeSaving, setOtherIncomeSaving] = useState(false)
  const [deleteOtherIncomeTarget, setDeleteOtherIncomeTarget] = useState<RevenuePlanner | null>(null)

  useEffect(() => {
    cStore.fetchAll()
    pStore.fetchAll()
    dStore.fetchAll()
    infraStore.fetchAll()
    rpStore.fetchByMonths(allMonths)
    mStore.fetchAll()
    if (id) plStore.fetchAll()
    crStore.fetchAllApproved()
    settingsStore.fetch()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const client = cStore.clients.find(c => c.id === id)

  // ── AI summary generation (cached 24h in localStorage) ───────────────────
  useEffect(() => {
    if (!client || !id || aiLoading || aiSummary) return
    const cacheKey = `ai_client_summary_${id}`
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      try {
        const { text, ideas, ts } = JSON.parse(cached)
        if (Date.now() - ts < 86_400_000) {
          setAiSummary(text)
          setAiIdeas(ideas ?? [])
          return
        }
      } catch { /* stale, regenerate */ }
    }

    async function generate() {
      setAiLoading(true)
      try {
        const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pixel-chat`
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
        const activeProj = pStore.projects.filter(p => p.client_id === id && p.status === 'active').map(p => p.name)
        const activeMaint = mStore.maintenances.filter(m => m.client_id === id && m.status === 'active').map(m => m.name)
        const prompt = `You are a strategic account manager at a digital agency. Based on this client profile, respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{"summary":"3-4 sentence strategic account summary focused on business health and relationship quality","ideas":[{"title":"short title","description":"one sentence specific suggestion"},{"title":"short title","description":"one sentence specific suggestion"}]}

Client profile:
- Name: ${client!.name}
- Website: ${client!.website || 'unknown'}
- Active projects: ${activeProj.length > 0 ? activeProj.join(', ') : 'none'}
- Active maintenance contracts: ${activeMaint.length > 0 ? activeMaint.join(', ') : 'none'}
- Hosting entries: ${infraStore.hostingClients.filter(h => h.client_id === id).length}
- Domains: ${dStore.domains.filter(d => d.client_id === id && !d.archived).length}
- Revenue YTD: ${invoicedYTD}€
- Revenue last year: ${prevYearInvoiced}€
- Open pipeline value: ${pipelineTotal}€`

        const res = await fetch(edgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey },
          body: JSON.stringify({ message: prompt, conversation_id: null, history: [] }),
        })
        const json = await res.json()
        const content = json.reply ?? json.content ?? ''
        const parsed = JSON.parse(content)
        setAiSummary(parsed.summary ?? '')
        setAiIdeas(parsed.ideas ?? [])
        localStorage.setItem(`ai_client_summary_${id}`, JSON.stringify({ text: parsed.summary, ideas: parsed.ideas, ts: Date.now() }))
      } catch {
        setAiSummary('Unable to generate summary. Check client data and try again.')
      } finally {
        setAiLoading(false)
      }
    }
    generate()
  }, [client?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const projects = pStore.projects.filter(p => p.client_id === id)
  const projectIds = new Set(projects.map(p => p.id))
  const hostingRows = infraStore.hostingClients.filter(h => h.client_id === id)
  const clientDomains = dStore.domains.filter(d => d.client_id === id && !d.archived)
  const maintenances = mStore.maintenances.filter(m => m.client_id === id)
  const pipelineItems = plStore.items.filter(i =>
    i.client_id === id ||
    (!i.client_id && i.company_name && client?.name &&
      i.company_name.toLowerCase() === client.name.toLowerCase())
  )

  // ── revenue planner rows ─────────────────────────────────────────────────
  const clientMaintIds = useMemo(() => new Set(maintenances.map(m => m.id)), [maintenances])
  const clientHostingIds = useMemo(() => new Set(hostingRows.map(h => h.id)), [hostingRows])
  const clientDomainIds = useMemo(() => new Set(clientDomains.map(d => d.id)), [clientDomains])

  const allClientRpRows = useMemo(() => rpStore.rows.filter(r =>
    (r.project_id != null && projectIds.has(r.project_id)) ||
    (r.maintenance_id != null && clientMaintIds.has(r.maintenance_id)) ||
    (r.hosting_client_id != null && clientHostingIds.has(r.hosting_client_id)) ||
    (r.domain_id != null && clientDomainIds.has(r.domain_id))
  ), [rpStore.rows, projectIds, clientMaintIds, clientHostingIds, clientDomainIds])

  // ── stats ────────────────────────────────────────────────────────────────
  const activeProjects = projects.filter(p => p.status === 'active')
  // Standalone hosting only — maintenance-linked hosting is counted inside maintAnnual
  const hostingAnnual = hostingRows.filter(h => !h.maintenance_id).reduce((s, h) => s + hostingContractValue(h), 0)
  const domainsAnnual = clientDomains.filter(d => !d.archived).reduce((s, d) => s + (d.yearly_amount ?? 0), 0)
  // Maintenance annual = retainer × months + linked hosting annual value
  const maintAnnual = maintenances.filter(m => m.status === 'active').reduce((s, m) => {
    const linkedHosting = infraStore.hostingClients.find(h => h.maintenance_id === m.id)
    const hostingExtra = linkedHosting ? hostingContractValue(linkedHosting) : 0
    return s + m.monthly_retainer * maintMonthsThisYear(m) + hostingExtra
  }, 0)
  const projectRegularRpSum = allClientRpRows
    .filter(r => r.project_id != null && projectIds.has(r.project_id) && r.status !== 'cost' && !r.notes?.startsWith('CR:'))
    .reduce((s, r) => s + (r.planned_amount ?? 0), 0)
  const projectApprovedCRSum = crStore.approvedCRs
    .filter(cr => cr.project_id != null && projectIds.has(cr.project_id))
    .reduce((s, cr) => s + (cr.amount ?? 0), 0)
  // Extra invoiced above retainer + linked hosting (overages on confirmed maintenance invoices)
  const maintOverages = allClientRpRows
    .filter(r => r.maintenance_id != null && (r.status === 'issued' || r.status === 'paid'))
    .reduce((s, r) => {
      const linkedHosting = infraStore.hostingClients.find(h => h.maintenance_id === r.maintenance_id)
      const hostingAmt = linkedHosting?.amount ?? 0
      return s + Math.max(0, (r.actual_amount ?? 0) - (r.planned_amount ?? 0) - hostingAmt)
    }, 0)
  const totalValue = projectRegularRpSum + projectApprovedCRSum + hostingAnnual + domainsAnnual + maintAnnual + maintOverages

  const invoicedYTD = allClientRpRows
    .filter(r => yearMonths.some(m => m === r.month) && (r.status === 'issued' || r.status === 'paid'))
    .reduce((s, r) => s + (r.actual_amount ?? r.planned_amount ?? 0), 0)

  const prevYearInvoiced = allClientRpRows
    .filter(r => r.month.startsWith(`${CURRENT_YEAR - 1}-`) && (r.status === 'issued' || r.status === 'paid'))
    .reduce((s, r) => s + (r.actual_amount ?? r.planned_amount ?? 0), 0)

  const invoiceConsistency = useMemo(() => {
    const monthsElapsed = new Date().getMonth() + 1
    const monthsWithInvoice = new Set(
      allClientRpRows
        .filter(r => r.month.startsWith(`${CURRENT_YEAR}-`) && (r.status === 'issued' || r.status === 'paid'))
        .map(r => r.month.slice(0, 7))
    ).size
    return monthsElapsed > 0 ? Math.round((monthsWithInvoice / monthsElapsed) * 100) : 0
  }, [allClientRpRows])

  const invoicedByProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of allClientRpRows) {
      if (r.actual_amount && r.project_id) {
        map.set(r.project_id, (map.get(r.project_id) ?? 0) + r.actual_amount)
      }
    }
    return map
  }, [allClientRpRows])

  const fullInvoiceHistory: RevenuePlanner[] = useMemo(() =>
    [...allClientRpRows]
      .filter(r => (r.status === 'issued' || r.status === 'paid') && (r.actual_amount ?? r.planned_amount ?? 0) > 0)
      .sort((a, b) => b.month.localeCompare(a.month)),
    [allClientRpRows])

  const otherIncomeRows = useMemo(() =>
    [...allClientRpRows]
      .filter(r => r.project_id != null && !r.maintenance_id && !r.hosting_client_id && !r.domain_id)
      .sort((a, b) => b.month.localeCompare(a.month)),
    [allClientRpRows])

  // ── pipeline stats ───────────────────────────────────────────────────────
  const activePipelineItems = pipelineItems.filter(i => i.status !== 'won' && i.status !== 'lost')
  const pipelineTotal = activePipelineItems.reduce((s, i) => s + dealTotal(i), 0)

  // ── expiry alerts ────────────────────────────────────────────────────────
  const expiringDomains = clientDomains.filter(d => daysUntil(d.expiry_date) <= 30 && daysUntil(d.expiry_date) >= 0)
  const endingMaintenances = maintenances.filter(m => m.status === 'active' && m.contract_end && daysUntil(m.contract_end) <= 30 && daysUntil(m.contract_end) >= 0)

  const activeCount = activeProjects.length

  // ── pipeline forecast grouping ────────────────────────────────────────────
  const pipelineForecast = useMemo(() => {
    const groups = new Map<string, { items: PipelineItem[]; total: number; weighted: number }>()

    const addToMonth = (key: string, item: PipelineItem, amt: number) => {
      if (!groups.has(key)) groups.set(key, { items: [], total: 0, weighted: 0 })
      const g = groups.get(key)!
      if (!g.items.includes(item)) g.items.push(item)
      g.total += amt
      g.weighted += amt * item.probability / 100
    }

    for (const item of activePipelineItems) {
      if (item.deal_type === 'fixed' && item.monthly_schedule?.length) {
        for (const row of item.monthly_schedule) {
          const key = row.month.length === 7 ? row.month + '-01' : row.month
          addToMonth(key, item, row.amount)
        }
      } else if (item.deal_type === 'monthly' && item.expected_month && item.expected_end_month) {
        const amt = item.estimated_amount ?? 0
        const cur = new Date(item.expected_month + 'T00:00:00')
        const end = new Date(item.expected_end_month + 'T00:00:00')
        while (cur <= end) {
          const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-01`
          addToMonth(key, item, amt)
          cur.setMonth(cur.getMonth() + 1)
        }
      } else {
        const key = item.expected_month ?? 'unscheduled'
        addToMonth(key, item, item.estimated_amount ?? 0)
      }
    }

    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [activePipelineItems])

  // ── handlers ─────────────────────────────────────────────────────────────

  function openEdit() {
    if (!client) return
    setEditForm({
      name: client.name ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      address: client.address ?? '',
      vat_id: client.vat_id ?? '',
      website: client.website ?? '',
      contact_person: client.contact_person ?? '',
      contact_email: client.contact_email ?? '',
      contact_phone: client.contact_phone ?? '',
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
        website: editForm.website || null,
        contact_person: editForm.contact_person || null,
        contact_email: editForm.contact_email || null,
        contact_phone: editForm.contact_phone || null,
      })
      toast('success', 'Client updated')
      setShowEdit(false)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setEditSaving(false)
    }
  }

  async function deleteClient() {
    if (!id) return
    setDeleteClientSaving(true)
    try {
      // Delete revenue_planner rows linked to this client's data
      const projectIds = projects.map(p => p.id)
      const maintIds = maintenances.map(m => m.id)
      const hostingIds = hostingRows.map(h => h.id)
      const domainIds = clientDomains.map(d => d.id)
      if (projectIds.length) await supabase.from('revenue_planner').delete().in('project_id', projectIds)
      if (maintIds.length) await supabase.from('revenue_planner').delete().in('maintenance_id', maintIds)
      if (hostingIds.length) await supabase.from('revenue_planner').delete().in('hosting_client_id', hostingIds)
      if (domainIds.length) await supabase.from('revenue_planner').delete().in('domain_id', domainIds)
      // Delete related records
      await supabase.from('pipeline_items').delete().eq('client_id', id)
      await supabase.from('domains').delete().eq('client_id', id)
      await supabase.from('hosting_clients').delete().eq('client_id', id)
      await supabase.from('maintenances').delete().eq('client_id', id)
      await supabase.from('projects').delete().eq('client_id', id)
      // Delete client
      await supabase.from('clients').delete().eq('id', id)
      await cStore.fetchAll()
      toast('success', 'Client deleted')
      navigate('/clients')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setDeleteClientSaving(false)
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
      toast('success', 'Project created')
      setShowAddProject(false)
      setProjForm({ ...EMPTY_PROJ })
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setProjSaving(false)
    }
  }

  async function saveDomains() {
    if (!id) return
    setDomainSaving(true)
    try {
      const filled = domainRows.filter(r => r.domain_name.trim() && r.expiry_date)
      const planMonth = domainInvoiceMonth
      const planStatus = domainAlreadyBilled ? 'issued' : (planMonth ? 'planned' : null)
      const inserted = await dStore.addDomains(id, domainPn, filled.map(r => ({
        domain_name: r.domain_name.trim(),
        registered_date: r.registered_date || undefined,
        expiry_date: r.expiry_date,
        yearly_amount: r.yearly_amount ? Number(r.yearly_amount) : undefined,
        contract_id: domainContractId.trim() || undefined,
      })))
      if (planMonth && planStatus) {
        const planRows = inserted.map((d: { id: string; yearly_amount?: number | null }) => ({
          domain_id: d.id,
          month: planMonth + '-01',
          planned_amount: d.yearly_amount ?? null,
          actual_amount: null,
          status: planStatus,
          probability: 100,
          notes: null,
        }))
        const { error: pe } = await supabase.from('revenue_planner').insert(planRows)
        if (pe) throw pe
        await rpStore.fetchByMonths(allMonths)
      }
      toast('success', 'Domains added')
      setShowAddDomain(false)
      setDomainRows([{ domain_name: '', registered_date: '', expiry_date: '', yearly_amount: '' }])
      setDomainPn('')
      setDomainContractId('')
      setDomainInvoiceMonth('')
      setDomainAlreadyBilled(false)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setDomainSaving(false)
    }
  }

  async function saveHosting() {
    if (!id || !hostingForm.amount) return
    setHostingSaving(true)
    try {
      const { data: newHost, error: insertErr } = await supabase
        .from('hosting_clients')
        .insert({
          client_id: id,
          project_pn: hostingForm.project_pn.trim() || '—',
          description: hostingForm.description.trim() || null,
          cycle: hostingForm.cycle,
          amount: Number(hostingForm.amount),
          billing_since: hostingForm.billing_since || null,
          next_invoice_date: hostingForm.cycle === 'yearly' ? (hostingForm.next_invoice_date || null) : null,
          status: 'active',
          notes: null,
          contract_id: hostingForm.contract_id.trim() || null,
          contract_expiry: hostingForm.contract_expiry ? hostingForm.contract_expiry + '-01' : null,
        })
        .select('id')
        .single()
      if (insertErr) throw insertErr
      await infraStore.fetchAll()

      // create revenue_planner rows
      const amount = Number(hostingForm.amount)
      const desc = hostingForm.description.trim() || `Hosting — ${hostingForm.project_pn || '—'}`
      const invoiceMonth = hostingForm.cycle === 'yearly'
        ? (hostingForm.next_invoice_date?.slice(0, 7) || hostingForm.billing_since?.slice(0, 7) || '')
        : (hostingForm.invoice_month || hostingForm.billing_since?.slice(0, 7) || '')

      if (invoiceMonth && newHost) {
        if (hostingForm.cycle === 'monthly') {
          const [y, m] = invoiceMonth.split('-').map(Number)
          const rows = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(y, m - 1 + i, 1)
            return {
              hosting_client_id: newHost.id,
              month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
              planned_amount: amount,
              actual_amount: hostingForm.already_billed && i === 0 ? amount : null,
              status: hostingForm.already_billed && i === 0 ? 'issued' : 'planned',
              notes: desc,
              probability: 100,
            }
          })
          await supabase.from('revenue_planner').insert(rows)
        } else {
          const monthVal = (hostingForm.next_invoice_date || hostingForm.billing_since || invoiceMonth + '-01')
          await supabase.from('revenue_planner').insert({
            hosting_client_id: newHost.id,
            month: monthVal.length === 7 ? monthVal + '-01' : monthVal,
            planned_amount: amount,
            actual_amount: hostingForm.already_billed ? amount : null,
            status: hostingForm.already_billed ? 'issued' : 'planned',
            notes: desc,
            probability: 100,
          })
        }
      }

      toast('success', 'Hosting added')
      setShowAddHosting(false)
      setHostingForm({ project_pn: '', description: '', cycle: 'monthly', amount: '', billing_since: '', next_invoice_date: '', invoice_month: '', already_billed: false, contract_id: '', contract_expiry: '' })
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setHostingSaving(false)
    }
  }

  function openAddPipeline() {
    setEditPipelineTarget(null)
    setPipelineForm({ ...EMPTY_PIPELINE, expected_month: getCurrentMonth() + '-01' })
    setShowPipeline(true)
  }

  function openEditPipeline(item: PipelineItem) {
    setEditPipelineTarget(item)
    setPipelineForm({
      title: item.title,
      status: item.status,
      deal_type: item.deal_type ?? 'one_time',
      estimated_amount: item.estimated_amount != null ? String(item.estimated_amount) : '',
      probability: String(item.probability),
      expected_month: item.expected_month ? item.expected_month.slice(0, 7) : '',
      expected_end_month: item.expected_end_month ? item.expected_end_month.slice(0, 7) : '',
      description: item.description ?? '',
      notes: item.notes ?? '',
      schedule: item.monthly_schedule?.map(r => ({ month: r.month.slice(0, 7), amount: String(r.amount) })) ?? [],
    })
    setShowPipeline(true)
  }

  async function savePipeline() {
    if (!id || !pipelineForm.title.trim()) return
    setPipelineSaving(true)
    try {
      const schedule = pipelineForm.deal_type === 'fixed' && pipelineForm.schedule.length > 0
        ? pipelineForm.schedule.filter(r => r.month && r.amount).map(r => ({ month: r.month + '-01', amount: Number(r.amount) }))
        : null
      const data = {
        client_id: id,
        title: pipelineForm.title.trim(),
        status: pipelineForm.status,
        deal_type: pipelineForm.deal_type,
        estimated_amount: pipelineForm.deal_type !== 'fixed' && pipelineForm.estimated_amount ? parseFloat(pipelineForm.estimated_amount) : null,
        probability: parseInt(pipelineForm.probability),
        expected_month: pipelineForm.deal_type !== 'fixed' && pipelineForm.expected_month ? pipelineForm.expected_month + '-01' : null,
        expected_end_month: pipelineForm.deal_type === 'monthly' && pipelineForm.expected_end_month ? pipelineForm.expected_end_month + '-01' : null,
        monthly_schedule: schedule,
        description: pipelineForm.description.trim() || null,
        notes: pipelineForm.notes.trim() || null,
      }
      if (editPipelineTarget) {
        await plStore.update(editPipelineTarget.id, data)
        toast('success', 'Pipeline item updated')
      } else {
        await plStore.add(data)
        toast('success', 'Pipeline item added')
      }
      setShowPipeline(false)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setPipelineSaving(false)
    }
  }

  function addScheduleRow() {
    setPipelineForm(f => ({ ...f, schedule: [...f.schedule, { month: '', amount: '' }] }))
  }
  function updateScheduleRow(i: number, key: 'month' | 'amount', val: string) {
    setPipelineForm(f => {
      const s = [...f.schedule]; s[i] = { ...s[i], [key]: val }; return { ...f, schedule: s }
    })
  }
  function removeScheduleRow(i: number) {
    setPipelineForm(f => ({ ...f, schedule: f.schedule.filter((_, idx) => idx !== i) }))
  }
  function fixedScheduleTotal() {
    return pipelineForm.schedule.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  }

  async function deletePipeline(item: PipelineItem) {
    try {
      await plStore.remove(item.id)
      toast('success', 'Pipeline item removed')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setDeletePipelineTarget(null)
    }
  }

  // ── other income CRUD ────────────────────────────────────────────────────
  function openAddOtherIncome() {
    setEditOtherIncomeTarget(null)
    setOtherIncomeForm({ month: getCurrentMonth(), amount: '', notes: '', status: 'planned' })
    setShowOtherIncome(true)
  }

  function openEditOtherIncome(row: RevenuePlanner) {
    setEditOtherIncomeTarget(row)
    setOtherIncomeForm({
      month: row.month.slice(0, 7),
      amount: String(row.actual_amount ?? row.planned_amount ?? ''),
      notes: row.notes ?? '',
      status: row.status,
    })
    setShowOtherIncome(true)
  }

  async function saveOtherIncome() {
    if (!otherIncomeForm.month || !otherIncomeForm.amount) return
    setOtherIncomeSaving(true)
    const amt = parseFloat(otherIncomeForm.amount)
    const month = otherIncomeForm.month + '-01'
    try {
      if (editOtherIncomeTarget) {
        const { error } = await supabase.from('revenue_planner').update({
          month,
          planned_amount: amt,
          actual_amount: ['issued', 'paid'].includes(otherIncomeForm.status) ? amt : null,
          status: otherIncomeForm.status,
          notes: otherIncomeForm.notes.trim() || null,
        }).eq('id', editOtherIncomeTarget.id)
        if (error) throw error
        toast('success', 'Invoice updated')
      } else {
        // Find or create a shared "Other Income" project for this client
        let projectId: string
        const existing = projects.find(p => p.name === 'Other Income' && p.client_id === client?.id)
        if (existing) {
          projectId = existing.id
        } else {
          const { data: newProj, error: pe } = await supabase.from('projects').insert({
            client_id: client?.id ?? null,
            pn: `OI-${new Date().getFullYear()}`,
            name: 'Other Income',
            type: 'fixed',
            status: 'active',
            currency: 'EUR',
          }).select('id').single()
          if (pe) throw pe
          projectId = newProj.id
          await pStore.fetchAll()
        }
        const { error } = await supabase.from('revenue_planner').insert({
          project_id: projectId,
          month,
          planned_amount: amt,
          actual_amount: ['issued', 'paid'].includes(otherIncomeForm.status) ? amt : null,
          status: otherIncomeForm.status,
          probability: 100,
          notes: otherIncomeForm.notes.trim() || null,
        })
        if (error) throw error
        toast('success', 'Invoice added')
      }
      await rpStore.fetchByMonths(allMonths)
      setShowOtherIncome(false)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setOtherIncomeSaving(false)
    }
  }

  async function deleteOtherIncome(row: RevenuePlanner) {
    try {
      const { error } = await supabase.from('revenue_planner').delete().eq('id', row.id)
      if (error) throw error
      await rpStore.fetchByMonths(allMonths)
      toast('success', 'Invoice removed')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setDeleteOtherIncomeTarget(null)
    }
  }

  // ── loading / not found ───────────────────────────────────────────────────
  if (cStore.loading) {
    return <div className="page-content" style={{ textAlign: 'center', paddingTop: 60, color: 'var(--c4)' }}>Loading…</div>
  }
  if (!client) {
    return (
      <div className="page-content" style={{ paddingTop: 40 }}>
        <div className="alert alert-red">Client not found.</div>
        <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => navigate('/clients')}>← Back to Clients</button>
      </div>
    )
  }

  // ── tab content ──────────────────────────────────────────────────────────

  function renderOverview() {
    const yoyChange = prevYearInvoiced > 0
      ? Math.round(((invoicedYTD - prevYearInvoiced) / prevYearInvoiced) * 100)
      : null

    const quickActions = [
      {
        label: 'Issue one-time invoice', sub: 'Add billing entry', bg: '#6366f1',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
        onClick: () => setShowOtherIncome(true),
      },
      {
        label: 'View pipeline', sub: 'Open proposals', bg: '#10b981',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="12" y1="7" x2="5" y2="17"/><line x1="12" y1="7" x2="19" y2="17"/><line x1="5" y1="19" x2="19" y2="19"/></svg>,
        onClick: () => setActiveTab('pipeline'),
      },
      {
        label: 'Edit client', sub: 'Update details', bg: '#3b82f6',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
        onClick: openEdit,
      },
      {
        label: 'Delete client', sub: 'Remove permanently', bg: '#ef4444',
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
        onClick: () => setShowDeleteClient(true),
      },
    ]

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Alerts */}
        {(expiringDomains.length > 0 || endingMaintenances.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {expiringDomains.map(d => (
              <div key={d.id} className="alert alert-amber" style={{ margin: 0 }}>
                Domain <strong>{d.domain_name}</strong> expires in {daysUntil(d.expiry_date)} days ({fmtDate(d.expiry_date)})
              </div>
            ))}
            {endingMaintenances.map(m => (
              <div key={m.id} className="alert alert-amber" style={{ margin: 0 }}>
                Maintenance <strong>{m.name}</strong> ends in {daysUntil(m.contract_end!)} days
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 270px', gap: 16, minWidth: 0, alignItems: 'start' }}>

          {/* ── Left column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>

            {/* Strategic Intelligence – light bg section */}
            <div style={{ background: '#f5f3ff', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/></svg>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--c0)' }}>Strategic Intelligence</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, border: '1px solid rgba(99,102,241,0.35)', color: '#6366f1', background: 'rgba(99,102,241,0.08)', marginLeft: 2 }}>
                  <svg width="7" height="7" viewBox="0 0 24 24" fill="#6366f1"><circle cx="12" cy="12" r="12"/></svg>
                  AI ENGINE ONLINE
                </span>
              </div>
              {/* AI Account Summary white card */}
              <div style={{ background: '#fff', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/></svg>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI Account Summary</span>
                </div>
                {aiLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c4)', padding: '4px 0' }}>
                    <span className="spinner" style={{ borderTopColor: '#6366f1', width: 13, height: 13 }} />
                    Generating account summary…
                  </div>
                ) : aiSummary ? (
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--c1)' }}>{aiSummary}</p>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--c4)' }}>No summary yet.</p>
                )}
                <button
                  onClick={() => { localStorage.removeItem(`ai_client_summary_${id}`); setAiSummary(null); setAiIdeas([]) }}
                  style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--c4)', padding: 0 }}
                >↻ Regenerate</button>
              </div>
            </div>

            {/* Growth Metrics */}
            <div className="card">
              <div className="card-body" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c2)' }}>Growth Metrics</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--c3)' }}>Revenue YoY</span>
                    {yoyChange !== null
                      ? <span style={{ fontWeight: 700, color: yoyChange >= 0 ? 'var(--green)' : 'var(--red)' }}>{yoyChange >= 0 ? '+' : ''}{yoyChange}% vs {CURRENT_YEAR - 1}</span>
                      : <span style={{ color: 'var(--c4)', fontWeight: 500 }}>No prior year data</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--c3)' }}>Invoice consistency</span>
                    <span style={{ fontWeight: 700, color: invoiceConsistency >= 80 ? 'var(--green)' : invoiceConsistency >= 50 ? 'var(--amber)' : 'var(--red)' }}>{invoiceConsistency}% of months billed</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--c3)' }}>Active services</span>
                    <span style={{ fontWeight: 700 }}>{activeProjects.length} projects · {maintenances.filter(m => m.status === 'active').length} maintenances · {hostingRows.length} hosting</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--c3)' }}>Domains</span>
                    <span style={{ fontWeight: 700, color: expiringDomains.length > 0 ? 'var(--amber)' : undefined }}>
                      {clientDomains.length}{expiringDomains.length > 0 ? ` · ${expiringDomains.length} expiring` : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Growth Opportunities */}
            {aiIdeas.length > 0 && (
              <div className="card">
                <div className="card-body" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/></svg>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Growth Opportunities</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {aiIdeas.map((idea, i) => (
                      <div key={i} style={{ background: 'var(--c7)', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--c0)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{idea.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--c2)', lineHeight: 1.55 }}>{idea.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Recent Billing */}
            <div className="card">
              <div className="card-body" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c2)' }}>Recent Billing</span>
                  <button className="btn btn-ghost btn-xs" onClick={() => setActiveTab('invoices')}>All history →</button>
                </div>
                {fullInvoiceHistory.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--c4)', textAlign: 'center', padding: '12px 0' }}>No invoices yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {fullInvoiceHistory.slice(0, 5).map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 11, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 1 }}>{fmtMonthShort(r.month)}</div>
                          <div style={{ fontSize: 12, color: 'var(--c2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {r.notes || (r.maintenance_id ? 'Retainer' : r.project_id ? 'Project invoice' : 'Other')}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{fmtEuro(r.actual_amount ?? r.planned_amount)}</div>
                          <span className={`badge ${STATUS_BADGE[r.status] ?? 'badge-gray'}`} style={{ fontSize: 10 }}>{r.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right column: Quick Actions (dark navy) ── */}
          <div style={{ background: 'var(--navy)', borderRadius: 14, padding: '20px', position: 'sticky', top: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#f59e0b"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Quick Actions</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {quickActions.map((action, i) => (
                <button key={i} onClick={action.onClick}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', width: '100%', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.11)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: action.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {action.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 1 }}>{action.label}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{action.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  function renderProjects() {
    return (
      <div>
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Projects</h2>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddProject(true)}>+ New Project</button>
        </div>
        <div className="card">
          {projects.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>No projects for this client yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>PROJECT #</th>
                  <th>PROJECT</th>
                  <th style={{ width: 120 }}>TYPE</th>
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
                  const projRpRows = allClientRpRows.filter(r => r.project_id === p.id)
                  const projRegularRows = projRpRows.filter(r => !r.notes?.startsWith('CR:') && r.status !== 'cost')
                  const projCRTotal = crStore.approvedCRs.filter(cr => cr.project_id === p.id).reduce((s, cr) => s + (cr.amount ?? 0), 0)
                  const baseValue = isRecurring
                    ? projRegularRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
                    : (p.initial_contract_value ?? p.contract_value ?? 0)
                  const totalProjectValue = baseValue + projCRTotal
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="text-mono" style={{ fontSize: 11, color: 'var(--c3)', background: 'var(--c7)', border: '1px solid var(--c6)', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>{p.pn}</span>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        <Link to={`/projects/${p.id}`} className="table-link" style={{ color: 'var(--c0)', textDecoration: 'none', fontWeight: 700 }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--navy)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--c0)')}>
                          {p.name}
                        </Link>
                      </td>
                      <td><span className={`badge ${TYPE_BADGE[p.type] ?? 'badge-gray'}`}>{TYPE_LABEL[p.type] ?? p.type}</span></td>
                      <td className="td-right text-mono" style={{ fontWeight: 600 }}>
                        {totalProjectValue > 0 ? fmtEuro(totalProjectValue) : <span className="text-muted">—</span>}
                      </td>
                      <td className="td-right text-mono" style={{ color: 'var(--green)', fontWeight: 600 }}>
                        {projInvoiced ? fmtEuro(projInvoiced) : <span className="text-muted">—</span>}
                      </td>
                      <td><span className={`badge ${STATUS_BADGE[p.status] ?? 'badge-gray'}`}>{p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span></td>
                      <td><button className="btn btn-secondary btn-xs" onClick={() => navigate(`/projects/${p.id}`)}>View</button></td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                {(() => {
                  const totalVal = projects.reduce((s, p) => {
                    const isRecurring = p.type === 'maintenance' || p.type === 'variable'
                    const projRegularRows = allClientRpRows.filter(r => r.project_id === p.id && !r.notes?.startsWith('CR:') && r.status !== 'cost')
                    const projCRTotal = crStore.approvedCRs.filter(cr => cr.project_id === p.id).reduce((a, cr) => a + (cr.amount ?? 0), 0)
                    const base = isRecurring
                      ? projRegularRows.reduce((r, row) => r + (row.planned_amount ?? 0), 0)
                      : (p.initial_contract_value ?? p.contract_value ?? 0)
                    return s + base + projCRTotal
                  }, 0)
                  const totalInvoiced = projects.reduce((s, p) => s + (invoicedByProject.get(p.id) ?? 0), 0)
                  return (
                    <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                      <td colSpan={3} style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)', letterSpacing: '0.05em' }}>TOTAL</td>
                      <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>{totalVal > 0 ? fmtEuro(totalVal) : '—'}</td>
                      <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--green)', fontSize: 14 }}>{totalInvoiced > 0 ? fmtEuro(totalInvoiced) : '—'}</td>
                      <td colSpan={2} />
                    </tr>
                  )
                })()}
              </tfoot>
            </table>
          )}
        </div>
      </div>
    )
  }

  function renderInfra() {
    return (
      <div>
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Domains &amp; Hosting</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/infrastructure')}>Go to Hosting</button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/domains')}>Go to Domains</button>
          </div>
        </div>
        <div className="card">
          {hostingRows.length === 0 && clientDomains.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>No hosting or domain entries for this client.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>TYPE</th><th>PROJECT #</th><th>DESCRIPTION</th>
                  <th className="th-right">AMOUNT</th><th>OCCURRENCE</th>
                  <th className="th-right">TOTAL VALUE</th><th>NEXT BILLING</th><th>CONTRACT EXPIRY</th><th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {hostingRows.map((h: HostingClient) => {
                  const totalVal = hostingContractValue(h)
                  return (
                    <tr key={h.id}>
                      <td><span className="badge badge-blue">Hosting</span></td>
                      <td><span className="badge badge-gray text-mono" style={{ fontSize: 11 }}>{h.project_pn}</span></td>
                      <td style={{ fontSize: 13 }}>{h.description ?? <span className="text-muted">—</span>}</td>
                      <td className="td-right text-mono" style={{ fontWeight: 600, fontSize: 13 }}>{h.amount.toLocaleString()} €</td>
                      <td style={{ fontSize: 12, color: 'var(--c3)' }}>{h.cycle === 'monthly' ? 'Monthly' : 'Yearly'}</td>
                      <td className="td-right text-mono" style={{ fontWeight: 600, fontSize: 13 }}>{fmtEuro(totalVal)}</td>
                      <td style={{ fontSize: 13, color: 'var(--c2)' }}>{h.cycle === 'monthly' ? nextMonthLabel() : fmtDate(h.next_invoice_date)}</td>
                      <td style={{ fontSize: 13 }}>
                        {h.contract_expiry
                          ? <span style={{ color: daysUntil(h.contract_expiry) <= 30 ? 'var(--red)' : 'var(--c2)', fontWeight: daysUntil(h.contract_expiry) <= 30 ? 700 : 400 }}>{fmtDate(h.contract_expiry)}</span>
                          : <span className="text-muted" style={{ fontSize: 12 }}>No expiration</span>
                        }
                      </td>
                      <td><span className={`badge ${STATUS_BADGE[h.status] ?? 'badge-gray'}`}>{h.status.charAt(0).toUpperCase() + h.status.slice(1)}</span></td>
                    </tr>
                  )
                })}
                {clientDomains.map((d: Domain) => {
                  const days = daysUntil(d.expiry_date)
                  const expiryColor = days <= 30 ? 'var(--red)' : undefined
                  const domainStatus = days < 0
                    ? <span className="badge badge-red">Expired</span>
                    : days <= 30 ? <span className="badge badge-red">Expires soon</span>
                    : <span className="badge badge-green">Active</span>
                  return (
                    <tr key={d.id}>
                      <td><span className="badge" style={{ background: 'var(--navy)', color: '#fff', fontSize: 11, padding: '2px 7px', borderRadius: 4 }}>Domain</span></td>
                      <td><span className="badge badge-gray text-mono" style={{ fontSize: 11 }}>{d.project_pn}</span></td>
                      <td style={{ fontSize: 13 }}>{d.domain_name}</td>
                      <td className="td-right text-mono" style={{ fontWeight: 600, fontSize: 13 }}>
                        {d.yearly_amount ? `${d.yearly_amount.toLocaleString()} €` : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--c3)' }}>Yearly</td>
                      <td className="td-right text-mono" style={{ fontWeight: 600, fontSize: 13 }}>
                        {d.yearly_amount ? fmtEuro(d.yearly_amount) : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ fontSize: 13, color: expiryColor ?? 'var(--c2)', fontWeight: expiryColor ? 700 : 400 }}>{fmtDate(d.expiry_date)}</td>
                      <td><span className="text-muted" style={{ fontSize: 12 }}>—</span></td>
                      <td>{domainStatus}</td>
                    </tr>
                  )
                })}
                {(hostingRows.length > 0 || clientDomains.length > 0) && (
                  <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                    <td colSpan={5} style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)', letterSpacing: '0.05em' }}>TOTAL VALUE / YEAR</td>
                    <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>{fmtEuro(hostingRows.reduce((s, h) => s + hostingContractValue(h), 0) + domainsAnnual)}</td>
                    <td colSpan={3} />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  function renderMaintenances() {
    const retainerValue = maintenances.filter(m => m.status === 'active').reduce((s, m) => s + m.monthly_retainer * maintMonthsThisYear(m), 0)
    const hostingValue = maintenances.filter(m => m.status === 'active').reduce((s, m) => {
      const linked = infraStore.hostingClients.find(h => h.maintenance_id === m.id)
      return s + (linked ? hostingContractValue(linked) : 0)
    }, 0)
    const extraBilled = allClientRpRows
      .filter(r => r.maintenance_id != null && (r.status === 'issued' || r.status === 'paid'))
      .reduce((s, r) => {
        const linked = infraStore.hostingClients.find(h => h.maintenance_id === r.maintenance_id)
        return s + Math.max(0, (r.actual_amount ?? 0) - (r.planned_amount ?? 0) - (linked?.amount ?? 0))
      }, 0)
    const totalMaintValue = retainerValue + hostingValue + extraBilled
    const hasLinkedHosting = maintenances.some(m => infraStore.hostingClients.some(h => h.maintenance_id === m.id))
    return (
      <div>
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Maintenance Contracts</h2>
        </div>
        {maintenances.length > 0 && (
          <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
            <div className="stat-card" style={{ '--left-color': 'var(--navy)' } as React.CSSProperties}>
              <div className="stat-card-label">TOTAL VALUE {CURRENT_YEAR}</div>
              <div className="stat-card-value text-mono" style={{ color: 'var(--navy)' }}>{totalMaintValue > 0 ? fmtEuro(totalMaintValue) : '—'}</div>
              <div className="stat-card-sub">retainer + hosting + extra</div>
            </div>
            <div className="stat-card" style={{ '--left-color': 'var(--c4)' } as React.CSSProperties}>
              <div className="stat-card-label">RETAINER VALUE</div>
              <div className="stat-card-value text-mono">{retainerValue > 0 ? fmtEuro(retainerValue) : '—'}</div>
              <div className="stat-card-sub">base retainer × months</div>
            </div>
            <div className="stat-card" style={{ '--left-color': hasLinkedHosting ? 'var(--blue)' : 'var(--c5)' } as React.CSSProperties}>
              <div className="stat-card-label">HOSTING</div>
              <div className="stat-card-value text-mono" style={{ color: hasLinkedHosting ? 'var(--blue)' : 'var(--c4)', fontSize: 18 }}>
                {hasLinkedHosting ? fmtEuro(hostingValue) : 'No'}
              </div>
              <div className="stat-card-sub">{hasLinkedHosting ? 'linked hosting / year' : 'no linked hosting'}</div>
            </div>
            <div className="stat-card" style={{ '--left-color': extraBilled > 0 ? 'var(--green)' : 'var(--c5)' } as React.CSSProperties}>
              <div className="stat-card-label">EXTRA BILLED</div>
              <div className="stat-card-value text-mono" style={{ color: extraBilled > 0 ? 'var(--green)' : 'var(--c4)', fontSize: extraBilled === 0 ? 18 : undefined }}>
                {extraBilled > 0 ? fmtEuro(extraBilled) : '—'}
              </div>
              <div className="stat-card-sub">above retainer + hosting</div>
            </div>
          </div>
        )}
        <div className="card">
          {maintenances.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              No maintenance contracts for this client.
              <div style={{ marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/maintenances')}>Go to Maintenances</button>
              </div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>NAME</th>
                  <th className="th-right" style={{ width: 120 }}>RETAINER/MO</th>
                  <th className="th-right" style={{ width: 110 }}>HOSTING/MO</th>
                  <th className="th-right" style={{ width: 100 }}>HOURS/MO</th>
                  <th className="th-right" style={{ width: 110 }}>REQUESTS/MO</th>
                  <th style={{ width: 200 }}>CONTRACT</th>
                  <th style={{ width: 100 }}>STATUS</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {maintenances.map((m: Maintenance) => {
                  const ending = m.contract_end && daysUntil(m.contract_end) <= 30 && daysUntil(m.contract_end) >= 0
                  const linkedHosting = infraStore.hostingClients.find(h => h.maintenance_id === m.id)
                  return (
                    <tr key={m.id}>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
                        {m.notes && <div style={{ fontSize: 12, color: 'var(--c3)', marginTop: 2 }}>{m.notes}</div>}
                      </td>
                      <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmtEuro(m.monthly_retainer)}</td>
                      <td className="td-right">
                        {linkedHosting ? (
                          <span className="text-mono" style={{ fontWeight: 600, color: 'var(--blue)' }}>{fmtEuro(linkedHosting.amount)}</span>
                        ) : (
                          <span className="badge badge-gray" style={{ fontSize: 10 }}>No</span>
                        )}
                      </td>
                      <td className="td-right text-mono">{m.hours_included}h</td>
                      <td className="td-right text-mono">{m.help_requests_included}</td>
                      <td>
                        <div style={{ fontSize: 13, color: ending ? 'var(--red)' : 'var(--c2)', fontWeight: ending ? 700 : 400 }}>
                          {fmtDate(m.contract_start)} → {m.contract_end ? fmtDate(m.contract_end) : 'Open-ended'}
                        </div>
                        {m.contract_url && (
                          <a href={safeUrl(m.contract_url)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--navy)', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            Contract
                          </a>
                        )}
                        {ending && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>Ends in {daysUntil(m.contract_end!)}d</div>}
                      </td>
                      <td><span className={`badge ${STATUS_BADGE[m.status] ?? 'badge-gray'}`}>{m.status.charAt(0).toUpperCase() + m.status.slice(1)}</span></td>
                      <td>
                        <button className="btn btn-secondary btn-xs" onClick={() => navigate(`/maintenances?edit=${m.id}`)}>Edit</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                  <td style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)', letterSpacing: '0.05em' }}>TOTAL / YEAR {CURRENT_YEAR}</td>
                  <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)', fontSize: 14 }}>
                    {fmtEuro(maintenances.reduce((s, m) => s + m.monthly_retainer * maintMonthsThisYear(m), 0))}
                  </td>
                  <td colSpan={6} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    )
  }


  function renderOtherIncome() {
    const total = otherIncomeRows.reduce((s, r) => s + (r.actual_amount ?? r.planned_amount ?? 0), 0)
    return (
      <div>
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Other Income <span style={{ fontWeight: 400, fontSize: 13, textTransform: 'none', letterSpacing: 0 }}>· {otherIncomeRows.length} entries</span></h2>
          <button className="btn btn-primary btn-sm" onClick={openAddOtherIncome}>+ Add invoice</button>
        </div>
        <div className="card">
          {otherIncomeRows.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              No one-time invoices yet. Add ad-hoc charges, one-off services, or project billing.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>MONTH</th>
                  <th>PROJECT</th>
                  <th>DESCRIPTION</th>
                  <th className="th-right">AMOUNT</th>
                  <th>STATUS</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {otherIncomeRows.map(r => {
                  const amtColor = r.status === 'paid' ? 'var(--green)' : r.status === 'issued' ? 'var(--navy)' : 'var(--c2)'
                  return (
                    <tr key={r.id}>
                      <td className="text-mono" style={{ fontSize: 13, color: 'var(--c2)' }}>{fmtMonth(r.month)}</td>
                      <td style={{ fontSize: 13, color: 'var(--c3)' }}>{r.project?.name ?? '—'}</td>
                      <td style={{ fontSize: 13, color: 'var(--c1)' }}>{r.notes || <span style={{ color: 'var(--c4)' }}>—</span>}</td>
                      <td className="td-right text-mono" style={{ color: amtColor, fontWeight: 600, fontSize: 13 }}>{fmtEuro(r.actual_amount ?? r.planned_amount)}</td>
                      <td><span className={`badge ${RP_STATUS_BADGE[r.status] ?? 'badge-gray'}`}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEditOtherIncome(r)}>Edit</button>
                          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => setDeleteOtherIncomeTarget(r)}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                  <td colSpan={3} style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)', letterSpacing: '0.05em' }}>TOTAL</td>
                  <td className="td-right text-mono" style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 14 }}>{fmtEuro(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    )
  }

  function renderInvoices() {
    function getCategoryBadge(r: RevenuePlanner) {
      if (r.maintenance_id) return <span className="badge badge-amber">Maintenance</span>
      if (r.hosting_client_id) return <span className="badge badge-blue">Hosting</span>
      if (r.domain_id) return <span className="badge" style={{ background: 'var(--navy)', color: '#fff' }}>Domain</span>
      return <span className="badge badge-gray">Project</span>
    }
    function getDescription(r: RevenuePlanner) {
      if (r.maintenance_id) return r.maintenance?.name ?? '—'
      if (r.hosting_client_id) return r.hosting?.description ?? '—'
      if (r.domain_id) return r.domain?.domain_name ?? '—'
      return r.project?.name ?? '—'
    }

    return (
      <div>
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Invoice History <span style={{ fontWeight: 400, fontSize: 13, textTransform: 'none', letterSpacing: 0 }}>· {fullInvoiceHistory.length} entries</span></h2>
        </div>
        <div className="card">
          {fullInvoiceHistory.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>No invoiced entries for this client yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>MONTH</th><th>CATEGORY</th><th>DESCRIPTION</th>
                  <th className="th-right">AMOUNT</th><th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {fullInvoiceHistory.map((r: RevenuePlanner) => {
                  const amtColor = r.status === 'paid' ? 'var(--green)' : r.status === 'issued' ? 'var(--navy)' : 'var(--c2)'
                  return (
                    <tr key={r.id}>
                      <td className="text-mono" style={{ fontSize: 13, color: 'var(--c2)' }}>{fmtMonth(r.month)}</td>
                      <td>{getCategoryBadge(r)}</td>
                      <td style={{ fontSize: 13, color: 'var(--c1)' }}>{getDescription(r)}</td>
                      <td className="td-right text-mono" style={{ color: amtColor, fontWeight: 600, fontSize: 13 }}>{fmtEuro(r.actual_amount ?? r.planned_amount)}</td>
                      <td><span className={`badge ${RP_STATUS_BADGE[r.status] ?? 'badge-gray'}`}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  function renderPipeline() {
    const totalAmount = activePipelineItems.reduce((s, i) => s + dealTotal(i), 0)
    return (
      <div>
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Pipeline &amp; Offers</h2>
          <button className="btn btn-primary btn-sm" onClick={openAddPipeline}>+ Add</button>
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          {pipelineItems.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              No pipeline items yet. Add prospects, proposals, and ongoing negotiations.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>STATUS</th>
                  <th>TITLE</th>
                  <th className="th-right" style={{ width: 120 }}>AMOUNT</th>
                  <th style={{ width: 110 }}>PROBABILITY</th>
                  <th style={{ width: 130 }}>EXPECTED MONTH</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {pipelineItems.map((item: PipelineItem) => (
                  <tr key={item.id} style={{ opacity: item.status === 'won' || item.status === 'lost' ? 0.6 : 1 }}>
                    <td><span className={`badge ${PIPELINE_STATUS_BADGE[item.status] ?? 'badge-gray'}`}>{PIPELINE_STATUS_LABELS[item.status]}</span></td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.title}</div>
                      {item.description && <div style={{ fontSize: 12, color: 'var(--c3)', marginTop: 2 }}>{item.description}</div>}
                    </td>
                    <td className="td-right text-mono" style={{ fontWeight: 600 }}>
                      {fmtEuro(dealTotal(item))}
                      {item.deal_type === 'monthly' && <span style={{ fontSize: 11, color: 'var(--c3)', marginLeft: 3 }}>/mo</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 4, background: 'var(--c6)', borderRadius: 2 }}>
                          <div style={{ width: `${item.probability}%`, height: '100%', background: 'var(--navy)', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c2)', minWidth: 32 }}>{item.probability}%</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--c2)' }}>
                      {item.expected_month ? fmtMonthShort(item.expected_month) : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => openEditPipeline(item)}>Edit</button>
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => setDeletePipelineTarget(item)}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pipeline Forecast */}
        {pipelineForecast.length > 0 && (
          <>
            <div className="section-bar" style={{ marginBottom: 10 }}>
              <h2>Pipeline Forecast</h2>
            </div>
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>MONTH</th>
                    <th>ITEMS</th>
                    <th className="th-right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelineForecast.map(([month, g]) => (
                    <tr key={month}>
                      <td style={{ fontWeight: 600 }}>
                        {month === 'unscheduled' ? <span style={{ color: 'var(--c3)', fontStyle: 'italic' }}>Unscheduled</span> : fmtMonthShort(month)}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--c3)' }}>
                        {g.items.map(i => i.title).join(', ')}
                      </td>
                      <td className="td-right text-mono" style={{ fontWeight: 600 }}>{fmtEuro(g.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                    <td colSpan={2} style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)', letterSpacing: '0.05em' }}>TOTAL PIPELINE</td>
                    <td className="td-right text-mono" style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 14 }}>{fmtEuro(totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    )
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'projects', label: `Projects${projects.length > 0 ? ` (${projects.length})` : ''}` },
    { id: 'infra', label: 'Domains & Hosting' },
    { id: 'maintenances', label: `Maintenances${maintenances.length > 0 ? ` (${maintenances.length})` : ''}` },
    { id: 'other-income', label: `Other Income${otherIncomeRows.length > 0 ? ` (${otherIncomeRows.length})` : ''}` },
    { id: 'invoices', label: 'Invoices' },
    { id: 'pipeline', label: `Pipeline${activePipelineItems.length > 0 ? ` (${activePipelineItems.length})` : ''}` },
  ]

  return (
    <div>
      {/* ── Edit client modal ── */}
      {showEdit && (
        <Modal title="Edit client" onClose={() => setShowEdit(false)}>
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">VAT ID</label>
              <input value={editForm.vat_id} onChange={e => setEditForm(f => ({ ...f, vat_id: e.target.value }))} />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Address</label>
              <input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Website</label>
              <input type="url" placeholder="https://example.com" value={editForm.website} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} />
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--c6)', paddingTop: 14, marginBottom: 14 }}>
            <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Contact Person</p>
            <div className="form-row" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Name</label>
                <input value={editForm.contact_person} onChange={e => setEditForm(f => ({ ...f, contact_person: e.target.value }))} placeholder="e.g. Ana Novak" />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" value={editForm.contact_email} onChange={e => setEditForm(f => ({ ...f, contact_email: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Phone</label>
              <input type="tel" value={editForm.contact_phone} onChange={e => setEditForm(f => ({ ...f, contact_phone: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowEdit(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={editSaving || !editForm.name.trim()}>
              {editSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete client confirm ── */}
      {showDeleteClient && (
        <Modal title="Delete client" onClose={() => setShowDeleteClient(false)}>
          <div className="alert alert-red" style={{ marginBottom: 16 }}>
            <strong>This action is permanent and cannot be undone.</strong>
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 14 }}>
            Deleting <strong>{client!.name}</strong> will permanently remove:
          </p>
          <ul style={{ margin: '0 0 20px', padding: '0 0 0 20px', fontSize: 13, lineHeight: 1.8, color: 'var(--c2)' }}>
            {projects.length > 0 && <li><strong>{projects.length}</strong> project{projects.length !== 1 ? 's' : ''}: {projects.map(p => p.name).join(', ')}</li>}
            {maintenances.length > 0 && <li><strong>{maintenances.length}</strong> maintenance contract{maintenances.length !== 1 ? 's' : ''}: {maintenances.map(m => m.name).join(', ')}</li>}
            {hostingRows.length > 0 && <li><strong>{hostingRows.length}</strong> hosting client{hostingRows.length !== 1 ? 's' : ''}</li>}
            {clientDomains.length > 0 && <li><strong>{clientDomains.length}</strong> domain{clientDomains.length !== 1 ? 's' : ''}: {clientDomains.map(d => d.domain_name).join(', ')}</li>}
            {plStore.items.filter(i => i.client_id === id).length > 0 && <li><strong>{plStore.items.filter(i => i.client_id === id).length}</strong> pipeline item{plStore.items.filter(i => i.client_id === id).length !== 1 ? 's' : ''}</li>}
            <li>All related invoice planning rows</li>
          </ul>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowDeleteClient(false)}>Cancel</button>
            <button
              className="btn btn-sm"
              style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
              onClick={deleteClient}
              disabled={deleteClientSaving}
            >
              {deleteClientSaving ? 'Deleting…' : `Delete ${client!.name}`}
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
              <input placeholder="e.g. Petrol — Prenova" value={projForm.name} onChange={e => setProjForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Project Manager</label>
              <Select value={projForm.pm} onChange={val => setProjForm(f => ({ ...f, pm: val }))}
                options={pmOptions} />
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
            <div className="form-row" style={{ marginBottom: 4 }}>
              <div className="form-group">
                <label className="form-label">Starting from</label>
                <input type="month" value={projForm.starting_from} onChange={e => setProjForm(f => ({ ...f, starting_from: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">End month <span className="form-hint" style={{ display: 'inline', marginLeft: 6 }}>optional</span></label>
                <input type="month" value={projForm.end_month} onChange={e => setProjForm(f => ({ ...f, end_month: e.target.value }))} />
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddProject(false); setProjForm(EMPTY_PROJ) }}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveProject} disabled={projSaving || !projForm.name.trim()}>
              {projSaving ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : null} Create project
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
              <input placeholder="RS-2026-001" value={hostingForm.project_pn} onChange={e => setHostingForm(f => ({ ...f, project_pn: e.target.value }))} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Billing cycle</label>
              <Select value={hostingForm.cycle} onChange={val => {
                setHostingForm(f => ({ ...f, cycle: val as 'monthly' | 'yearly', next_invoice_date: val === 'yearly' && f.billing_since ? f.billing_since : '' }))
              }} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Service description</label>
            <input placeholder="VPS + cPanel hosting" value={hostingForm.description} onChange={e => setHostingForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="form-row" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label className="form-label">Amount (€)</label>
              <input type="number" value={hostingForm.amount} onChange={e => setHostingForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Billing since</label>
              <input type="month" value={hostingForm.billing_since?.slice(0, 7) ?? ''} onChange={e => {
                const val = e.target.value
                const since = val ? val + '-01' : ''
                setHostingForm(f => ({
                  ...f,
                  billing_since: since,
                  invoice_month: f.invoice_month || val,
                  next_invoice_date: f.cycle === 'yearly' && val ? val + '-01' : f.next_invoice_date,
                }))
              }} />
            </div>
          </div>
          {hostingForm.cycle === 'yearly' && (
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Invoice month (yearly)</label>
              <input type="month" value={hostingForm.next_invoice_date?.slice(0, 7) ?? ''} onChange={e => setHostingForm(f => ({ ...f, next_invoice_date: e.target.value ? e.target.value + '-01' : '' }))} />
            </div>
          )}
          <div className="form-row" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label className="form-label">Contract / Order ID <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
              <input placeholder="e.g. PO-2026-042" value={hostingForm.contract_id} onChange={e => setHostingForm(f => ({ ...f, contract_id: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Contract expiry <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
              <input type="month" value={hostingForm.contract_expiry} onChange={e => setHostingForm(f => ({ ...f, contract_expiry: e.target.value }))} />
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--c6)', paddingTop: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Invoice planning</div>
            {hostingForm.cycle === 'monthly' && (
              <div className="form-group" style={{ marginBottom: 10 }}>
                <label className="form-label">Start from month</label>
                <input type="month" value={hostingForm.invoice_month} onChange={e => setHostingForm(f => ({ ...f, invoice_month: e.target.value }))} />
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={hostingForm.already_billed} onChange={e => setHostingForm(f => ({ ...f, already_billed: e.target.checked }))} />
              Already billed{hostingForm.cycle === 'monthly' ? ' for this month' : ' (mark as issued)'}
            </label>
            {(hostingForm.cycle === 'monthly' ? hostingForm.invoice_month : hostingForm.next_invoice_date) && (
              <div className="form-hint" style={{ marginTop: 6 }}>
                {hostingForm.cycle === 'monthly'
                  ? `Will create 12 monthly rows from ${hostingForm.invoice_month}${hostingForm.already_billed ? ' (first marked as issued)' : ''}`
                  : `Will create 1 invoice row for ${hostingForm.next_invoice_date?.slice(0, 7)}${hostingForm.already_billed ? ' (marked as issued)' : ''}`
                }
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
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
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Project #</label>
              <input placeholder="e.g. 1159" value={domainPn} onChange={e => setDomainPn(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Contract / Order ID <span className="form-hint" style={{ display: 'inline', marginLeft: 4 }}>optional</span></label>
              <input placeholder="e.g. PO-2026-042" value={domainContractId} onChange={e => setDomainContractId(e.target.value)} />
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--c6)', paddingTop: 14 }}>
            <p style={{ margin: '0 0 10px', fontWeight: 700, fontSize: 15, color: 'var(--c0)' }}>Domains</p>
            <DomainRowInputs rows={domainRows} onChange={setDomainRows} />
          </div>
          <div style={{ borderTop: '1px solid var(--c6)', paddingTop: 14, marginTop: 14 }}>
            <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: 13, color: 'var(--c0)' }}>
              Billing <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--c4)' }}>— optional</span>
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12, fontSize: 13, fontWeight: 500 }}>
              <input type="checkbox" checked={domainAlreadyBilled} onChange={e => {
                setDomainAlreadyBilled(e.target.checked)
                if (!domainInvoiceMonth) {
                  const now = new Date()
                  setDomainInvoiceMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
                }
              }} style={{ width: 15, height: 15 }} />
              Already billed
            </label>
            <div className="form-group" style={{ marginBottom: 0, maxWidth: 200 }}>
              <label className="form-label">{domainAlreadyBilled ? 'Billed in which month?' : 'Add to invoice month'}</label>
              <input type="month" value={domainInvoiceMonth} onChange={e => setDomainInvoiceMonth(e.target.value)} />
            </div>
            {!domainAlreadyBilled && !domainInvoiceMonth && (
              <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--c4)' }}>Leave empty to skip — you can invoice from the table later.</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddDomain(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveDomains} disabled={domainSaving || !domainPn}>
              {domainSaving ? 'Saving…' : 'Save Domains'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Pipeline add/edit modal ── */}
      {showPipeline && (
        <Modal title={editPipelineTarget ? 'Edit Pipeline Item' : 'Add Pipeline Item'} onClose={() => setShowPipeline(false)}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Title <span style={{ color: 'var(--red)' }}>*</span></label>
            <input value={pipelineForm.title} onChange={e => setPipelineForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Website redesign proposal" autoFocus />
          </div>
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <Select value={pipelineForm.status} onChange={val => setPipelineForm(f => ({ ...f, status: val as PipelineItem['status'] }))} options={PIPELINE_STATUS_OPTS} />
            </div>
            <div className="form-group">
              <label className="form-label">Probability</label>
              <Select value={pipelineForm.probability} onChange={val => setPipelineForm(f => ({ ...f, probability: val }))} options={PIPELINE_PROB_OPTS} />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Deal type</label>
            <Select value={pipelineForm.deal_type} onChange={val => setPipelineForm(f => ({ ...f, deal_type: val as 'one_time' | 'monthly' | 'fixed' }))} options={PIPELINE_TYPE_OPTS} />
          </div>
          {pipelineForm.deal_type !== 'fixed' && (
            <div className="form-row" style={{ marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">{pipelineForm.deal_type === 'monthly' ? 'Amount / month (€)' : 'Amount (€)'}</label>
                <input type="number" value={pipelineForm.estimated_amount} onChange={e => setPipelineForm(f => ({ ...f, estimated_amount: e.target.value }))} placeholder="0" />
              </div>
              <div className="form-group">
                <label className="form-label">{pipelineForm.deal_type === 'monthly' ? 'Start month' : 'Expected month'}</label>
                <input type="month" value={pipelineForm.expected_month} onChange={e => setPipelineForm(f => ({ ...f, expected_month: e.target.value }))} />
              </div>
            </div>
          )}
          {pipelineForm.deal_type === 'monthly' && (
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">End month</label>
              <input type="month" value={pipelineForm.expected_end_month} onChange={e => setPipelineForm(f => ({ ...f, expected_end_month: e.target.value }))} />
              {pipelineForm.expected_month && pipelineForm.expected_end_month && (() => {
                const count = plMonthCount(pipelineForm.expected_month + '-01', pipelineForm.expected_end_month + '-01')
                const total = Number(pipelineForm.estimated_amount || 0) * count
                return <div className="form-hint">{count} month{count !== 1 ? 's' : ''} · total {fmtEuro(total)}</div>
              })()}
            </div>
          )}
          {pipelineForm.deal_type === 'fixed' && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label className="form-label" style={{ margin: 0 }}>Payment schedule</label>
                <button className="btn btn-secondary btn-xs" onClick={addScheduleRow} type="button">+ Add month</button>
              </div>
              {pipelineForm.schedule.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--c4)', padding: '10px 0' }}>No payments added yet.</div>
              )}
              {pipelineForm.schedule.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <input type="month" value={row.month} onChange={e => updateScheduleRow(i, 'month', e.target.value)} style={{ flex: 1 }} />
                  <div style={{ position: 'relative', flex: 1 }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--c3)', fontSize: 13, pointerEvents: 'none' }}>€</span>
                    <input type="number" value={row.amount} onChange={e => updateScheduleRow(i, 'amount', e.target.value)} placeholder="0" style={{ paddingLeft: 22, width: '100%' }} />
                  </div>
                  <button type="button" onClick={() => removeScheduleRow(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c4)', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>×</button>
                </div>
              ))}
              {pipelineForm.schedule.length > 0 && (
                <div className="form-hint" style={{ textAlign: 'right' }}>Total: {fmtEuro(fixedScheduleTotal())}</div>
              )}
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Notes <span className="form-hint" style={{ display: 'inline' }}>optional</span></label>
            <textarea value={pipelineForm.notes} onChange={e => setPipelineForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowPipeline(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={savePipeline} disabled={pipelineSaving || !pipelineForm.title.trim()}>
              {pipelineSaving ? 'Saving…' : editPipelineTarget ? 'Save changes' : 'Add to pipeline'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete pipeline confirm ── */}
      {deletePipelineTarget && (
        <Modal title="Remove pipeline item" onClose={() => setDeletePipelineTarget(null)}>
          <p style={{ margin: '0 0 20px', fontSize: 14 }}>Remove <strong>{deletePipelineTarget.title}</strong> from the pipeline?</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setDeletePipelineTarget(null)}>Cancel</button>
            <button className="btn btn-primary btn-sm" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => deletePipeline(deletePipelineTarget)}>Remove</button>
          </div>
        </Modal>
      )}

      {/* ── Other income modal ── */}
      {showOtherIncome && (
        <Modal title={editOtherIncomeTarget ? 'Edit invoice' : 'Add one-time invoice'} onClose={() => setShowOtherIncome(false)}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Description</label>
            <input autoFocus value={otherIncomeForm.notes} onChange={e => setOtherIncomeForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Consultation fee, ad-hoc design work…" />
          </div>
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Month</label>
              <input type="month" value={otherIncomeForm.month} onChange={e => setOtherIncomeForm(f => ({ ...f, month: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Amount (€)</label>
              <input type="number" min="0" step="0.01" value={otherIncomeForm.amount} onChange={e => setOtherIncomeForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Status</label>
            <Select
              value={otherIncomeForm.status}
              onChange={v => setOtherIncomeForm(f => ({ ...f, status: v as RevenuePlanner['status'] }))}
              options={[
                { value: 'planned', label: 'Planned' },
                { value: 'issued',  label: 'Issued' },
                { value: 'paid',    label: 'Paid' },
              ]}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowOtherIncome(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={otherIncomeSaving || !otherIncomeForm.month || !otherIncomeForm.amount} onClick={saveOtherIncome}>
              {otherIncomeSaving ? 'Saving…' : editOtherIncomeTarget ? 'Save changes' : 'Add invoice'}
            </button>
          </div>
        </Modal>
      )}

      {deleteOtherIncomeTarget && (
        <Modal title="Remove invoice" onClose={() => setDeleteOtherIncomeTarget(null)}>
          <p style={{ margin: '0 0 20px', fontSize: 14 }}>Remove this invoice entry of <strong>{fmtEuro(deleteOtherIncomeTarget.actual_amount ?? deleteOtherIncomeTarget.planned_amount)}</strong>?</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setDeleteOtherIncomeTarget(null)}>Cancel</button>
            <button className="btn btn-primary btn-sm" style={{ background: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => deleteOtherIncome(deleteOtherIncomeTarget)}>Remove</button>
          </div>
        </Modal>
      )}

      {/* ── Page header ── */}
      <div className="page-header" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 0, paddingBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%', paddingBottom: 14 }}>
          <div>
            <button onClick={() => navigate('/clients')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c3)', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, fontFamily: 'Manrope, sans-serif', fontWeight: 600 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Clients
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <h1 style={{ margin: 0 }}>{client.name}</h1>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: activeCount > 0 ? 'rgba(22,163,74,0.1)' : 'var(--c7)', color: activeCount > 0 ? 'var(--green)' : 'var(--c4)', border: `1px solid ${activeCount > 0 ? 'rgba(22,163,74,0.25)' : 'var(--c6)'}` }}>
                {activeCount > 0 ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 13, color: 'var(--c3)', flexWrap: 'wrap' }}>
              {client.email && (
                <a href={`mailto:${client.email}`} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--c3)', textDecoration: 'none' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  {client.email}
                </a>
              )}
              {client.phone && (
                <a href={`tel:${client.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--c3)', textDecoration: 'none' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
                  {client.phone}
                </a>
              )}
              {client.website && (
                <a href={safeUrl(client.website)} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--navy)', textDecoration: 'none', fontWeight: 500 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                  {client.website.replace(/^https?:\/\//, '')}
                </a>
              )}
              {client.contact_person && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  {client.contact_person}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-secondary btn-sm" onClick={openEdit}>Edit</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddProject(true)}>+ New Project</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--c6)', width: '100%', marginLeft: -28, paddingLeft: 28, marginRight: -28 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--navy)' : '2px solid transparent',
                cursor: 'pointer', padding: '10px 16px',
                fontFamily: 'inherit', fontWeight: 600, fontSize: 13,
                color: activeTab === tab.id ? 'var(--navy)' : 'var(--c3)',
                transition: 'color .12s', whiteSpace: 'nowrap', marginBottom: -1,
              }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats strip (Overview only, outside page-content to avoid double padding) ── */}
      {activeTab === 'overview' && (
        <div className="stats-strip">
          {/* ACTIVE PROJECTS */}
          <div className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div className="stat-card-label">ACTIVE PROJECTS</div>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div className="stat-card-value">{projects.length}</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--navy)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>IN DELIVERY</span>
            </div>
          </div>
          {/* TOTAL VALUE */}
          <div className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div className="stat-card-label">TOTAL VALUE</div>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div className="stat-card-value" style={{ color: 'var(--navy)' }}>{totalValue ? totalValue.toLocaleString() + ' €' : '—'}</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>LIFETIME</span>
            </div>
          </div>
          {/* INVOICED YTD */}
          <div className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div className="stat-card-label">INVOICED YTD</div>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div className="stat-card-value" style={{ color: 'var(--green)' }}>{invoicedYTD ? invoicedYTD.toLocaleString() + ' €' : '—'}</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>COLLECTED</span>
            </div>
          </div>
          {/* PIPELINE */}
          <div className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div className="stat-card-label">PIPELINE</div>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="12" y1="7" x2="5" y2="17"/><line x1="12" y1="7" x2="19" y2="17"/><line x1="5" y1="19" x2="19" y2="19"/></svg>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <div className="stat-card-value" style={{ color: pipelineTotal > 0 ? '#f59e0b' : undefined }}>{pipelineTotal > 0 ? pipelineTotal.toLocaleString() + ' €' : '—'}</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>PENDING</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab content ── */}
      <div className="page-content">
        {activeTab === 'overview'     && renderOverview()}
        {activeTab === 'projects'     && renderProjects()}
        {activeTab === 'infra'        && renderInfra()}
        {activeTab === 'maintenances' && renderMaintenances()}
        {activeTab === 'other-income' && renderOtherIncome()}
        {activeTab === 'invoices'     && renderInvoices()}
        {activeTab === 'pipeline'     && renderPipeline()}
      </div>
    </div>
  )
}
