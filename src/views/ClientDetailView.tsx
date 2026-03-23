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
import { hostingAnnualValue } from '../lib/types'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '../components/ConfirmDialog'

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
  active: 'green',
  paused: 'amber',
  completed: 'gray',
  cancelled: 'red',
}
const TYPE_BADGE: Record<string, string> = {
  fixed: 'blue',
  maintenance: 'amber',
  variable: 'green',
  internal: 'gray',
}
const TYPE_LABEL: Record<string, string> = {
  fixed: 'Fixed',
  maintenance: 'Recurring',
  variable: 'Variable',
  internal: 'Internal',
}
const RP_STATUS_BADGE: Record<string, string> = {
  paid: 'green',
  issued: 'blue',
  planned: 'amber',
  retainer: 'navy',
  cost: 'red',
}
const PIPELINE_STATUS_BADGE: Record<string, string> = {
  proposal: 'amber',
  won: 'green',
  lost: 'red',
}
const PIPELINE_STATUS_LABELS: Record<string, string> = {
  proposal: 'Proposal',
  won: 'Won',
  lost: 'Lost',
}

// ── sub-components ────────────────────────────────────────────────────────────


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
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-2">Project type</div>
      <div className="flex gap-2">
        {types.map(t => (
          <div key={t.key} onClick={() => onChange(t.key)}
            className={`flex-1 rounded border-2 px-[10px] py-3 cursor-pointer text-center transition-all ${value === t.key ? 'border-primary bg-blue-50' : 'border-border bg-white'}`}>
            <div className="flex justify-center mb-1.5">{t.icon}</div>
            <div className={`font-bold text-[13px] ${value === t.key ? 'text-primary' : 'text-foreground'}`}>{t.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{t.sub}</div>
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
      <div className="grid mb-1" style={{ gridTemplateColumns: '2fr 130px 130px 90px 32px', gap: '4px 8px' }}>
        <span className="text-[11px] text-muted-foreground font-semibold">Domain</span>
        <span className="text-[11px] text-muted-foreground font-semibold">Registered</span>
        <span className="text-[11px] text-muted-foreground font-semibold">Expiry</span>
        <span className="text-[11px] text-muted-foreground font-semibold">€/yr</span>
        <span />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid mb-2 items-center" style={{ gridTemplateColumns: '2fr 130px 130px 90px 32px', gap: '4px 8px' }}>
          <input placeholder="example.si" value={r.domain_name} onChange={e => update(i, 'domain_name', e.target.value)} />
          <input placeholder="DD/MM/YYYY" value={isoToDMY(r.registered_date)} onChange={e => update(i, 'registered_date', parseDMY(e.target.value))} />
          <input placeholder="DD/MM/YYYY" value={isoToDMY(r.expiry_date)} onChange={e => update(i, 'expiry_date', parseDMY(e.target.value))} />
          <input placeholder="25" type="number" value={r.yearly_amount} onChange={e => update(i, 'yearly_amount', e.target.value)} />
          <button type="button" onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            className="bg-transparent border-none cursor-pointer text-[#dc2626] text-lg leading-none">×</button>
        </div>
      ))}
      <Button variant="outline" size="sm" type="button" onClick={() => onChange([...rows, { domain_name: '', registered_date: '', expiry_date: '', yearly_amount: '' }])} className="mt-1">
        + Add domain
      </Button>
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
  const [aiTrigger, setAiTrigger]   = useState(0)

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
    if (!client || !id || aiLoading) return
    const cacheKey = `ai_client_summary_v4_${id}`
    if (aiTrigger === 0) {
      // Initial load: use cache if fresh
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
    } else {
      // Manual regenerate: already cleared in button handler
    }

    async function generate() {
      setAiLoading(true)
      try {
        const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/pixel-chat`
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
        const clientProjects = pStore.projects.filter(p => p.client_id === id)
        const clientMaint = mStore.maintenances.filter(m => m.client_id === id)
        const projLines = clientProjects.map(p => `${p.name} (${p.status}${p.value ? `, value: ${p.value}€` : ''}${p.type ? `, type: ${p.type}` : ''})`).join(', ') || 'none'
        const maintLines = clientMaint.map(m => `${m.name} (${m.status}, ${m.monthly_retainer}€/mo)`).join(', ') || 'none'
        const builtWebsite = clientMaint.length > 0 || clientProjects.some(p => p.type === 'fixed')
        const prompt = `You are a strategic account manager at a digital agency called Renderspace. Based on this client profile, respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{"summary":"3-4 sentence strategic account summary focused on business health and relationship quality","ideas":[{"title":"short title","description":"one sentence specific suggestion"},{"title":"short title","description":"one sentence specific suggestion"}]}

Agency context: Renderspace is a digital agency. A maintenance/retainer contract always means Renderspace previously built (or significantly refreshed) the client's website or digital product. Do not suggest building or auditing their website if they already have a maintenance contract — they already use Renderspace for ongoing support.

Client profile:
- Name: ${client!.name}
- Website: ${client!.website || 'unknown'}
- Renderspace built their website: ${builtWebsite ? 'yes' : 'unknown'}
- Projects (all): ${projLines}
- Maintenance/retainer contracts: ${maintLines}
- Hosting entries: ${infraStore.hostingClients.filter(h => h.client_id === id).length}
- Domains: ${dStore.domains.filter(d => d.client_id === id && !d.archived).length}
- Invoiced YTD: ${invoicedYTD}€
- Invoiced last year: ${prevYearInvoiced}€
- Total lifetime value: ${pStore.projects.filter(p => p.client_id === id).reduce((s, p) => s + (p.value ?? 0), 0)}€
- Open pipeline value: ${pipelineTotal}€`

        const res = await fetch(edgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}`, 'apikey': anonKey },
          body: JSON.stringify({ message: prompt, conversation_id: null, history: [] }),
        })
        const json = await res.json()
        const content = json.message ?? json.reply ?? json.content ?? ''
        const parsed = JSON.parse(content)
        setAiSummary(parsed.summary ?? '')
        setAiIdeas(parsed.ideas ?? [])
        localStorage.setItem(`ai_client_summary_v4_${id}`, JSON.stringify({ text: parsed.summary, ideas: parsed.ideas, ts: Date.now() }))
      } catch {
        setAiSummary('Unable to generate summary. Check client data and try again.')
      } finally {
        setAiLoading(false)
      }
    }
    // Only generate once stores have loaded data
    if (pStore.projects.length === 0 && mStore.maintenances.length === 0) return
    generate()
  }, [client?.id, aiTrigger, pStore.projects.length, mStore.maintenances.length]) // eslint-disable-line react-hooks/exhaustive-deps
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
  const hostingAnnual = hostingRows.filter(h => !h.maintenance_id).reduce((s, h) => s + hostingAnnualValue(h), 0)
  const domainsAnnual = clientDomains.filter(d => !d.archived).reduce((s, d) => s + (d.yearly_amount ?? 0), 0)
  // Maintenance annual = retainer × months + linked hosting annual value
  const maintAnnual = maintenances.filter(m => m.status === 'active').reduce((s, m) => {
    const linkedHosting = infraStore.hostingClients.find(h => h.maintenance_id === m.id)
    const hostingExtra = linkedHosting ? hostingAnnualValue(linkedHosting) : 0
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
      .filter(r => r.project_id != null && !r.maintenance_id && !r.hosting_client_id && !r.domain_id && r.project?.name === 'Other Income')
      .sort((a, b) => b.month.localeCompare(a.month)),
    [allClientRpRows])

  // ── pipeline stats ───────────────────────────────────────────────────────
  const activePipelineItems = pipelineItems.filter(i => i.status !== 'won' && i.status !== 'lost')
  const pipelineTotal = activePipelineItems.reduce((s, i) => s + dealTotal(i), 0)

  // ── expiry alerts ────────────────────────────────────────────────────────
  const expiringDomains = clientDomains.filter(d => daysUntil(d.expiry_date) <= 30 && daysUntil(d.expiry_date) >= 0)
  const endingMaintenances = maintenances.filter(m => m.status === 'active' && m.contract_end && daysUntil(m.contract_end) <= 30 && daysUntil(m.contract_end) >= 0)

  const activeCount =
    activeProjects.length +
    maintenances.filter(m => m.status === 'active').length +
    hostingRows.length +
    clientDomains.length +
    otherIncomeRows.length +
    activePipelineItems.length

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
    return <div className="flex-1 overflow-auto p-6 text-center text-muted-foreground pt-[60px]">Loading…</div>
  }
  if (!client) {
    return (
      <div className="flex-1 overflow-auto p-6 pt-10">
        <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c]">Client not found.</div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('/clients')}>← Back to Clients</Button>
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
      <div className="flex flex-col gap-4">
        {/* Alerts */}
        {(expiringDomains.length > 0 || endingMaintenances.length > 0) && (
          <div className="flex flex-col gap-1.5">
            {expiringDomains.map(d => (
              <div key={d.id} className="rounded-lg border border-[#fcd34d] bg-[#fef9ee] px-3 py-2 text-sm text-[#92400e]">
                Domain <strong>{d.domain_name}</strong> expires in {daysUntil(d.expiry_date)} days ({fmtDate(d.expiry_date)})
              </div>
            ))}
            {endingMaintenances.map(m => (
              <div key={m.id} className="rounded-lg border border-[#fcd34d] bg-[#fef9ee] px-3 py-2 text-sm text-[#92400e]">
                Maintenance <strong>{m.name}</strong> ends in {daysUntil(m.contract_end!)} days
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 min-w-0 items-start" style={{ gridTemplateColumns: '1fr 270px' }}>

          {/* ── Left column ── */}
          <div className="flex flex-col gap-[14px] min-w-0">

            {/* Strategic Intelligence – light bg section */}
            <div className="bg-[#f5f3ff] rounded-[14px] px-5 py-[18px]">
              <div className="flex items-center gap-2 mb-[14px]">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/></svg>
                <span className="text-[15px] font-bold text-foreground">Strategic Intelligence</span>
                <span className="flex items-center gap-[5px] text-[10px] font-bold px-[10px] py-[3px] rounded-full border border-[rgba(99,102,241,0.35)] text-[#6366f1] bg-[rgba(99,102,241,0.08)] ml-0.5">
                  <svg width="7" height="7" viewBox="0 0 24 24" fill="#6366f1"><circle cx="12" cy="12" r="12"/></svg>
                  AI ENGINE ONLINE
                </span>
              </div>
              {/* AI Account Summary white card */}
              <div className="bg-white rounded-[10px] px-[18px] py-4">
                <div className="flex items-center gap-1.5 mb-[10px]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/></svg>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.08em]">AI Account Summary</span>
                </div>
                {aiLoading ? (
                  <div className="flex items-center gap-2 text-[13px] text-muted-foreground py-1">
                    <span className="spinner" style={{ borderTopColor: '#6366f1', width: 13, height: 13 }} />
                    Generating account summary…
                  </div>
                ) : aiSummary ? (
                  <p className="m-0 text-[13px] leading-[1.7] text-[#374151]">{aiSummary}</p>
                ) : (
                  <p className="m-0 text-[13px] text-muted-foreground">No summary yet.</p>
                )}
                <button
                  onClick={() => { localStorage.removeItem(`ai_client_summary_v4_${id}`); setAiSummary(null); setAiIdeas([]); setAiTrigger(t => t + 1) }}
                  className="mt-[10px] bg-transparent border-none cursor-pointer text-[11px] text-muted-foreground p-0"
                >↻ Regenerate</button>
              </div>
            </div>

            {/* Growth Metrics */}
            <Card>
              <CardContent className="px-5 py-4">
                <div className="flex items-center gap-1.5 mb-[14px]">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
                  <span className="text-xs font-bold text-[#374151]">Growth Metrics</span>
                </div>
                <div className="flex flex-col gap-[10px]">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground">Revenue YoY</span>
                    {yoyChange !== null
                      ? <span className={`font-bold ${yoyChange >= 0 ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}>{yoyChange >= 0 ? '+' : ''}{yoyChange}% vs {CURRENT_YEAR - 1}</span>
                      : <span className="text-muted-foreground font-medium">No prior year data</span>}
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground">Invoice consistency</span>
                    <span className={`font-bold ${invoiceConsistency >= 80 ? 'text-[#16a34a]' : invoiceConsistency >= 50 ? 'text-[#d97706]' : 'text-[#dc2626]'}`}>{invoiceConsistency}% of months billed</span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground">Active services</span>
                    <span className="font-bold">{activeProjects.length} projects · {maintenances.filter(m => m.status === 'active').length} maintenances · {hostingRows.length} hosting</span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-muted-foreground">Domains</span>
                    <span className={`font-bold ${expiringDomains.length > 0 ? 'text-[#d97706]' : ''}`}>
                      {clientDomains.length}{expiringDomains.length > 0 ? ` · ${expiringDomains.length} expiring` : ''}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Growth Opportunities */}
            {aiIdeas.length > 0 && (
              <Card>
                <CardContent className="px-5 py-4">
                  <div className="flex items-center gap-1.5 mb-[14px]">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/></svg>
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.07em]">Growth Opportunities</span>
                  </div>
                  <div className="grid grid-cols-2 gap-[10px]">
                    {aiIdeas.map((idea, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg px-[14px] py-3">
                        <div className="font-bold text-[11px] text-foreground uppercase tracking-[0.05em] mb-[5px]">{idea.title}</div>
                        <div className="text-xs text-[#374151] leading-[1.55]">{idea.description}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Billing */}
            <Card>
              <CardContent className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-[#374151]">Recent Billing</span>
                  <Button variant="ghost" size="xs" onClick={() => setActiveTab('invoices')}>All history →</Button>
                </div>
                {fullInvoiceHistory.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-3">No invoices yet</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {fullInvoiceHistory.slice(0, 5).map(r => (
                      <div key={r.id} className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] text-muted-foreground uppercase tracking-[0.04em] mb-px">{fmtMonthShort(r.month)}</div>
                          <div className="text-xs text-[#374151] truncate">
                            {r.notes || (r.maintenance_id ? 'Retainer' : r.project_id ? 'Project invoice' : 'Other')}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[13px] font-bold text-[#16a34a]">{fmtEuro(r.actual_amount ?? r.planned_amount)}</div>
                          <Badge variant={(STATUS_BADGE[r.status] ?? 'gray') as Parameters<typeof Badge>[0]['variant']}>{r.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right column: Quick Actions (dark navy) ── */}
          <div className="bg-primary rounded-[14px] p-5 sticky top-5">
            <div className="flex items-center gap-2 mb-4">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#f59e0b"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span className="text-[15px] font-bold text-white">Quick Actions</span>
            </div>
            <div className="flex flex-col gap-2">
              {quickActions.map((action, i) => (
                <button key={i} onClick={action.onClick}
                  className="flex items-center gap-3 bg-white/[0.06] border-none rounded-[10px] px-[14px] py-3 cursor-pointer w-full text-left hover:bg-white/[0.11] transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: action.bg }}>
                    {action.icon}
                  </div>
                  <div>
                    <div className="font-bold text-[13px] text-white mb-px">{action.label}</div>
                    <div className="text-[11px] text-white/40">{action.sub}</div>
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
        <div className="flex items-center justify-between mb-3">
          <h2>Projects</h2>
          <Button size="sm" onClick={() => setShowAddProject(true)}>+ New Project</Button>
        </div>
        <Card>
          {projects.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">No projects for this client yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>PROJECT #</th>
                  <th>PROJECT</th>
                  <th style={{ width: 120 }}>TYPE</th>
                  <th className="text-right">TOTAL VALUE</th>
                  <th className="text-right">INVOICED</th>
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
                        <span className="text-[11px] text-muted-foreground bg-gray-50 border border-border rounded px-1.5 py-0.5 whitespace-nowrap">{p.pn}</span>
                      </td>
                      <td className="font-bold">
                        <Link to={`/projects/${p.id}`} className="font-medium text-primary hover:underline cursor-pointer">
                          {p.name}
                        </Link>
                      </td>
                      <td><Badge variant={(TYPE_BADGE[p.type] ?? 'gray') as Parameters<typeof Badge>[0]['variant']}>{TYPE_LABEL[p.type] ?? p.type}</Badge></td>
                      <td className="text-right font-semibold">
                        {totalProjectValue > 0 ? fmtEuro(totalProjectValue) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-right font-semibold text-[#16a34a]">
                        {projInvoiced ? fmtEuro(projInvoiced) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td><Badge variant={(STATUS_BADGE[p.status] ?? 'gray') as Parameters<typeof Badge>[0]['variant']}>{p.status.charAt(0).toUpperCase() + p.status.slice(1)}</Badge></td>
                      <td><Button variant="outline" size="xs" onClick={() => navigate(`/projects/${p.id}`)}>View</Button></td>
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
                    <tr className="bg-gray-50 border-t-2 border-border">
                      <td colSpan={3} className="font-bold text-xs text-muted-foreground tracking-[0.05em]">TOTAL</td>
                      <td className="text-right font-bold text-primary text-sm">{totalVal > 0 ? fmtEuro(totalVal) : '—'}</td>
                      <td className="text-right font-bold text-[#16a34a] text-sm">{totalInvoiced > 0 ? fmtEuro(totalInvoiced) : '—'}</td>
                      <td colSpan={2} />
                    </tr>
                  )
                })()}
              </tfoot>
            </table>
          )}
        </Card>
      </div>
    )
  }

  function renderInfra() {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2>Domains &amp; Hosting</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/infrastructure')}>Go to Hosting</Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/domains')}>Go to Domains</Button>
          </div>
        </div>
        <Card>
          {hostingRows.length === 0 && clientDomains.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">No hosting or domain entries for this client.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>TYPE</th><th>PROJECT #</th><th>DESCRIPTION</th>
                  <th className="text-right">AMOUNT</th><th>OCCURRENCE</th>
                  <th className="text-right">TOTAL VALUE</th><th>NEXT BILLING</th><th>CONTRACT EXPIRY</th><th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {hostingRows.map((h: HostingClient) => {
                  const totalVal = hostingAnnualValue(h)
                  return (
                    <tr key={h.id}>
                      <td><Badge variant="blue">Hosting</Badge></td>
                      <td><Badge variant="gray">{h.project_pn}</Badge></td>
                      <td className="text-[13px]">{h.description ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="text-right font-semibold text-[13px]">{h.amount.toLocaleString()} €</td>
                      <td className="text-xs text-muted-foreground">{h.cycle === 'monthly' ? 'Monthly' : 'Yearly'}</td>
                      <td className="text-right font-semibold text-[13px]">{fmtEuro(totalVal)}</td>
                      <td className="text-[13px] text-[#374151]">{h.cycle === 'monthly' ? nextMonthLabel() : fmtDate(h.next_invoice_date)}</td>
                      <td className="text-[13px]">
                        {h.contract_expiry
                          ? <span className={daysUntil(h.contract_expiry) <= 30 ? 'text-[#dc2626] font-bold' : 'text-[#374151]'}>{fmtDate(h.contract_expiry)}</span>
                          : <span className="text-muted-foreground text-xs">No expiration</span>
                        }
                      </td>
                      <td><Badge variant={(STATUS_BADGE[h.status] ?? 'gray') as Parameters<typeof Badge>[0]['variant']}>{h.status.charAt(0).toUpperCase() + h.status.slice(1)}</Badge></td>
                    </tr>
                  )
                })}
                {clientDomains.map((d: Domain) => {
                  const days = daysUntil(d.expiry_date)
                  const domainStatus = days < 0
                    ? <Badge variant="red">Expired</Badge>
                    : days <= 30 ? <Badge variant="red">Expires soon</Badge>
                    : <Badge variant="green">Active</Badge>
                  return (
                    <tr key={d.id}>
                      <td><Badge variant="navy">Domain</Badge></td>
                      <td><Badge variant="gray">{d.project_pn}</Badge></td>
                      <td className="text-[13px]">{d.domain_name}</td>
                      <td className="text-right font-semibold text-[13px]">
                        {d.yearly_amount ? `${d.yearly_amount.toLocaleString()} €` : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-xs text-muted-foreground">Yearly</td>
                      <td className="text-right font-semibold text-[13px]">
                        {d.yearly_amount ? fmtEuro(d.yearly_amount) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className={`text-[13px] ${days <= 30 ? 'text-[#dc2626] font-bold' : 'text-[#374151]'}`}>{fmtDate(d.expiry_date)}</td>
                      <td><span className="text-muted-foreground text-xs">—</span></td>
                      <td>{domainStatus}</td>
                    </tr>
                  )
                })}
                {(hostingRows.length > 0 || clientDomains.length > 0) && (
                  <tr className="bg-gray-50 border-t-2 border-border">
                    <td colSpan={5} className="font-bold text-xs text-muted-foreground tracking-[0.05em]">TOTAL VALUE / YEAR</td>
                    <td className="text-right font-bold text-primary text-sm">{fmtEuro(hostingRows.reduce((s, h) => s + hostingAnnualValue(h), 0) + domainsAnnual)}</td>
                    <td colSpan={3} />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    )
  }

  function renderMaintenances() {
    const retainerValue = maintenances.filter(m => m.status === 'active').reduce((s, m) => s + m.monthly_retainer * maintMonthsThisYear(m), 0)
    const hostingValue = maintenances.filter(m => m.status === 'active').reduce((s, m) => {
      const linked = infraStore.hostingClients.find(h => h.maintenance_id === m.id)
      return s + (linked ? hostingAnnualValue(linked) : 0)
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
        <div className="flex items-center justify-between mb-3">
          <h2>Maintenance Contracts</h2>
        </div>
        {maintenances.length > 0 && (
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">TOTAL VALUE {CURRENT_YEAR}</div>
              <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-primary">{totalMaintValue > 0 ? fmtEuro(totalMaintValue) : '—'}</div>
              <div className="text-xs text-muted-foreground mt-1">retainer + hosting + extra</div>
            </div>
            <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">RETAINER VALUE</div>
              <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{retainerValue > 0 ? fmtEuro(retainerValue) : '—'}</div>
              <div className="text-xs text-muted-foreground mt-1">base retainer × months</div>
            </div>
            <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">HOSTING</div>
              <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${hasLinkedHosting ? 'text-[#2563eb]' : 'text-muted-foreground'}`}>
                {hasLinkedHosting ? fmtEuro(hostingValue) : 'No'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{hasLinkedHosting ? 'linked hosting / year' : 'no linked hosting'}</div>
            </div>
            <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">EXTRA BILLED</div>
              <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${extraBilled > 0 ? 'text-[#16a34a]' : 'text-muted-foreground'}`}>
                {extraBilled > 0 ? fmtEuro(extraBilled) : '—'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">above retainer + hosting</div>
            </div>
          </div>
        )}
        <Card>
          {maintenances.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">
              No maintenance contracts for this client.
              <div className="mt-2">
                <Button variant="outline" size="sm" onClick={() => navigate('/maintenances')}>Go to Maintenances</Button>
              </div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>NAME</th>
                  <th className="text-right" style={{ width: 120 }}>RETAINER/MO</th>
                  <th className="text-right" style={{ width: 110 }}>HOSTING/MO</th>
                  <th className="text-right" style={{ width: 100 }}>HOURS/MO</th>
                  <th className="text-right" style={{ width: 110 }}>REQUESTS/MO</th>
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
                        <div className="font-bold text-sm">{m.name}</div>
                        {m.notes && <div className="text-xs text-muted-foreground mt-0.5">{m.notes}</div>}
                      </td>
                      <td className="text-right font-bold text-primary">{fmtEuro(m.monthly_retainer)}</td>
                      <td className="text-right">
                        {linkedHosting ? (
                          <span className="font-semibold text-[#2563eb]">{fmtEuro(linkedHosting.amount)}</span>
                        ) : (
                          <Badge variant="gray">No</Badge>
                        )}
                      </td>
                      <td className="text-right">{m.hours_included}h</td>
                      <td className="text-right">{m.help_requests_included}</td>
                      <td>
                        <div className={`text-[13px] ${ending ? 'text-[#dc2626] font-bold' : 'text-[#374151]'}`}>
                          {fmtDate(m.contract_start)} → {m.contract_end ? fmtDate(m.contract_end) : 'Open-ended'}
                        </div>
                        {m.contract_url && (
                          <a href={safeUrl(m.contract_url)} target="_blank" rel="noreferrer" className="text-[11px] text-primary inline-flex items-center gap-[3px] mt-0.5">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            Contract
                          </a>
                        )}
                        {ending && <div className="text-[11px] text-[#dc2626] mt-0.5">Ends in {daysUntil(m.contract_end!)}d</div>}
                      </td>
                      <td><Badge variant={(STATUS_BADGE[m.status] ?? 'gray') as Parameters<typeof Badge>[0]['variant']}>{m.status.charAt(0).toUpperCase() + m.status.slice(1)}</Badge></td>
                      <td>
                        <Button variant="outline" size="xs" onClick={() => navigate(`/maintenances?edit=${m.id}`)}>Edit</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-border">
                  <td className="font-bold text-xs text-muted-foreground tracking-[0.05em]">TOTAL / YEAR {CURRENT_YEAR}</td>
                  <td className="text-right font-bold text-primary text-sm">
                    {fmtEuro(maintenances.reduce((s, m) => s + m.monthly_retainer * maintMonthsThisYear(m), 0))}
                  </td>
                  <td colSpan={6} />
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      </div>
    )
  }


  function renderOtherIncome() {
    const total = otherIncomeRows.reduce((s, r) => s + (r.actual_amount ?? r.planned_amount ?? 0), 0)
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2>Other Income <span className="font-normal text-[13px] normal-case tracking-normal">· {otherIncomeRows.length} entries</span></h2>
          <Button size="sm" onClick={openAddOtherIncome}>+ Add invoice</Button>
        </div>
        <Card>
          {otherIncomeRows.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">
              No one-time invoices yet. Add ad-hoc charges, one-off services, or project billing.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>MONTH</th>
                  <th>PROJECT</th>
                  <th>DESCRIPTION</th>
                  <th className="text-right">AMOUNT</th>
                  <th>STATUS</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {otherIncomeRows.map(r => {
                  const amtClass = r.status === 'paid' ? 'text-[#16a34a]' : r.status === 'issued' ? 'text-primary' : 'text-[#374151]'
                  return (
                    <tr key={r.id}>
                      <td className="text-[13px] text-[#374151]">{fmtMonth(r.month)}</td>
                      <td className="text-[13px] text-muted-foreground">{r.project?.name ?? '—'}</td>
                      <td className="text-[13px] text-foreground">{r.notes || <span className="text-muted-foreground">—</span>}</td>
                      <td className={`text-right font-semibold text-[13px] ${amtClass}`}>{fmtEuro(r.actual_amount ?? r.planned_amount)}</td>
                      <td><Badge variant={(RP_STATUS_BADGE[r.status] ?? 'gray') as Parameters<typeof Badge>[0]['variant']}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Badge></td>
                      <td>
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="xs" onClick={() => openEditOtherIncome(r)}>Edit</Button>
                          <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeleteOtherIncomeTarget(r)}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-border">
                  <td colSpan={3} className="font-bold text-xs text-muted-foreground tracking-[0.05em]">TOTAL</td>
                  <td className="text-right font-extrabold text-primary text-sm">{fmtEuro(total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      </div>
    )
  }

  function renderInvoices() {
    function getCategoryBadge(r: RevenuePlanner) {
      if (r.maintenance_id) return <Badge variant="amber">Maintenance</Badge>
      if (r.hosting_client_id) return <Badge variant="blue">Hosting</Badge>
      if (r.domain_id) return <Badge variant="navy">Domain</Badge>
      return <Badge variant="gray">Project</Badge>
    }
    function getDescription(r: RevenuePlanner) {
      if (r.maintenance_id) return r.maintenance?.name ?? '—'
      if (r.hosting_client_id) return r.hosting?.description ?? '—'
      if (r.domain_id) return r.domain?.domain_name ?? '—'
      return r.project?.name ?? '—'
    }

    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2>Invoice History <span className="font-normal text-[13px] normal-case tracking-normal">· {fullInvoiceHistory.length} entries</span></h2>
        </div>
        <Card>
          {fullInvoiceHistory.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">No invoiced entries for this client yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>MONTH</th><th>CATEGORY</th><th>DESCRIPTION</th>
                  <th className="text-right">AMOUNT</th><th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {fullInvoiceHistory.map((r: RevenuePlanner) => {
                  const amtClass = r.status === 'paid' ? 'text-[#16a34a]' : r.status === 'issued' ? 'text-primary' : 'text-[#374151]'
                  return (
                    <tr key={r.id}>
                      <td className="text-[13px] text-[#374151]">{fmtMonth(r.month)}</td>
                      <td>{getCategoryBadge(r)}</td>
                      <td className="text-[13px] text-foreground">{getDescription(r)}</td>
                      <td className={`text-right font-semibold text-[13px] ${amtClass}`}>{fmtEuro(r.actual_amount ?? r.planned_amount)}</td>
                      <td><Badge variant={(RP_STATUS_BADGE[r.status] ?? 'gray') as Parameters<typeof Badge>[0]['variant']}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Badge></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    )
  }

  function renderPipeline() {
    const totalAmount = activePipelineItems.reduce((s, i) => s + dealTotal(i), 0)
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2>Pipeline &amp; Offers</h2>
          <Button size="sm" onClick={openAddPipeline}>+ Add</Button>
        </div>
        <Card className="mb-6">
          {pipelineItems.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">
              No pipeline items yet. Add prospects, proposals, and ongoing negotiations.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: 120 }}>STATUS</th>
                  <th>TITLE</th>
                  <th className="text-right" style={{ width: 120 }}>AMOUNT</th>
                  <th style={{ width: 110 }}>PROBABILITY</th>
                  <th style={{ width: 130 }}>EXPECTED MONTH</th>
                  <th style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {pipelineItems.map((item: PipelineItem) => (
                  <tr key={item.id} className={(item.status === 'won' || item.status === 'lost') ? 'opacity-60' : ''}>
                    <td><Badge variant={(PIPELINE_STATUS_BADGE[item.status] ?? 'gray') as Parameters<typeof Badge>[0]['variant']}>{PIPELINE_STATUS_LABELS[item.status]}</Badge></td>
                    <td>
                      <div className="font-semibold">{item.title}</div>
                      {item.description && <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>}
                    </td>
                    <td className="text-right font-semibold">
                      {fmtEuro(dealTotal(item))}
                      {item.deal_type === 'monthly' && <span className="text-[11px] text-muted-foreground ml-[3px]">/mo</span>}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1 bg-border rounded-sm">
                          <div className="h-full bg-primary rounded-sm" style={{ width: `${item.probability}%` }} />
                        </div>
                        <span className="text-xs font-bold text-[#374151] min-w-[32px]">{item.probability}%</span>
                      </div>
                    </td>
                    <td className="text-[13px] text-[#374151]">
                      {item.expected_month ? fmtMonthShort(item.expected_month) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="xs" onClick={() => openEditPipeline(item)}>Edit</Button>
                        <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeletePipelineTarget(item)}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Pipeline Forecast */}
        {pipelineForecast.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2>Pipeline Forecast</h2>
            </div>
            <Card>
              <table>
                <thead>
                  <tr>
                    <th>MONTH</th>
                    <th>ITEMS</th>
                    <th className="text-right">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelineForecast.map(([month, g]) => (
                    <tr key={month}>
                      <td className="font-semibold">
                        {month === 'unscheduled' ? <span className="text-muted-foreground italic">Unscheduled</span> : fmtMonthShort(month)}
                      </td>
                      <td className="text-xs text-muted-foreground">
                        {g.items.map(i => i.title).join(', ')}
                      </td>
                      <td className="text-right font-semibold">{fmtEuro(g.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-border">
                    <td colSpan={2} className="font-bold text-xs text-muted-foreground tracking-[0.05em]">TOTAL PIPELINE</td>
                    <td className="text-right font-extrabold text-primary text-sm">{fmtEuro(totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
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
          <div className="grid grid-cols-2 gap-4 mb-[14px]">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Name</label>
              <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Email</label>
              <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-[14px]">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Phone</label>
              <input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">VAT ID</label>
              <input value={editForm.vat_id} onChange={e => setEditForm(f => ({ ...f, vat_id: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-[14px]">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Address</label>
              <input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Website</label>
              <input type="url" placeholder="https://example.com" value={editForm.website} onChange={e => setEditForm(f => ({ ...f, website: e.target.value }))} />
            </div>
          </div>
          <div className="border-t border-border pt-[14px] mb-[14px]">
            <p className="m-0 mb-3 text-xs font-bold text-muted-foreground uppercase tracking-[0.5px]">Contact Person</p>
            <div className="grid grid-cols-2 gap-4 mb-[14px]">
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Name</label>
                <input value={editForm.contact_person} onChange={e => setEditForm(f => ({ ...f, contact_person: e.target.value }))} placeholder="e.g. Ana Novak" />
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Email</label>
                <input type="email" value={editForm.contact_email} onChange={e => setEditForm(f => ({ ...f, contact_email: e.target.value }))} />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Phone</label>
              <input type="tel" value={editForm.contact_phone} onChange={e => setEditForm(f => ({ ...f, contact_phone: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="outline" size="sm" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button size="sm" onClick={saveEdit} disabled={editSaving || !editForm.name.trim()}>
              {editSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Delete client confirm ── */}
      <ConfirmDialog
        open={showDeleteClient}
        title="Delete client"
        message={
          <div>
            <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c] mb-3">
              <strong>This action is permanent and cannot be undone.</strong>
            </div>
            <p className="mb-3 text-sm">Deleting <strong>{client!.name}</strong> will permanently remove:</p>
            <ul className="mb-5 pl-5 text-[13px] leading-[1.8] text-[#374151]">
              {projects.length > 0 && <li><strong>{projects.length}</strong> project{projects.length !== 1 ? 's' : ''}: {projects.map(p => p.name).join(', ')}</li>}
              {maintenances.length > 0 && <li><strong>{maintenances.length}</strong> maintenance contract{maintenances.length !== 1 ? 's' : ''}: {maintenances.map(m => m.name).join(', ')}</li>}
              {hostingRows.length > 0 && <li><strong>{hostingRows.length}</strong> hosting client{hostingRows.length !== 1 ? 's' : ''}</li>}
              {clientDomains.length > 0 && <li><strong>{clientDomains.length}</strong> domain{clientDomains.length !== 1 ? 's' : ''}: {clientDomains.map(d => d.domain_name).join(', ')}</li>}
              {plStore.items.filter(i => i.client_id === id).length > 0 && <li><strong>{plStore.items.filter(i => i.client_id === id).length}</strong> pipeline item{plStore.items.filter(i => i.client_id === id).length !== 1 ? 's' : ''}</li>}
              <li>All related invoice planning rows</li>
            </ul>
          </div>
        }
        confirmLabel={deleteClientSaving ? 'Deleting…' : `Delete ${client!.name}`}
        onConfirm={deleteClient}
        onCancel={() => setShowDeleteClient(false)}
      />

      {/* ── New project modal ── */}
      {showAddProject && (
        <Modal title="New Project" onClose={() => { setShowAddProject(false); setProjForm(EMPTY_PROJ) }}>
          <TypePills value={projForm.type} onChange={v => setProjForm(f => ({ ...f, type: v }))} />
          <div className="grid grid-cols-2 gap-4 mb-[14px]">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project name</label>
              <input placeholder="e.g. Petrol — Prenova" value={projForm.name} onChange={e => setProjForm(f => ({ ...f, name: e.target.value }))} autoFocus />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project Manager</label>
              <Select value={projForm.pm} onChange={val => setProjForm(f => ({ ...f, pm: val }))}
                options={pmOptions} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-[14px]">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">
                {projForm.type === 'maintenance' ? 'Monthly amount (€)' : projForm.type === 'variable' ? 'Est. monthly (€)' : 'Project value (€)'}
              </label>
              <input type="number" value={projForm.contract_value} onChange={e => setProjForm(f => ({ ...f, contract_value: e.target.value }))} placeholder={projForm.type === 'fixed' ? '45000' : '2000'} />
            </div>
          </div>
          {projForm.type === 'maintenance' && (
            <div className="grid grid-cols-2 gap-4 mb-1">
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Starting from</label>
                <input type="month" value={projForm.starting_from} onChange={e => setProjForm(f => ({ ...f, starting_from: e.target.value }))} />
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">End month <span className="text-xs text-muted-foreground inline ml-1.5">optional</span></label>
                <input type="month" value={projForm.end_month} onChange={e => setProjForm(f => ({ ...f, end_month: e.target.value }))} />
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="outline" size="sm" onClick={() => { setShowAddProject(false); setProjForm(EMPTY_PROJ) }}>Cancel</Button>
            <Button size="sm" onClick={saveProject} disabled={projSaving || !projForm.name.trim()}>
              {projSaving ? <span className="spinner" style={{ borderTopColor: '#fff' }} /> : null} Create project
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Add hosting modal ── */}
      {showAddHosting && (
        <Modal title="Add Hosting" onClose={() => setShowAddHosting(false)}>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project #</label>
              <input placeholder="RS-2026-001" value={hostingForm.project_pn} onChange={e => setHostingForm(f => ({ ...f, project_pn: e.target.value }))} autoFocus />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Billing cycle</label>
              <Select value={hostingForm.cycle} onChange={val => {
                setHostingForm(f => ({ ...f, cycle: val as 'monthly' | 'yearly', next_invoice_date: val === 'yearly' && f.billing_since ? f.billing_since : '' }))
              }} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Service description</label>
            <input placeholder="VPS + cPanel hosting" value={hostingForm.description} onChange={e => setHostingForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€)</label>
              <input type="number" value={hostingForm.amount} onChange={e => setHostingForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Billing since</label>
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
            <div className="mb-3">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Invoice month (yearly)</label>
              <input type="month" value={hostingForm.next_invoice_date?.slice(0, 7) ?? ''} onChange={e => setHostingForm(f => ({ ...f, next_invoice_date: e.target.value ? e.target.value + '-01' : '' }))} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Contract / Order ID <span className="text-xs text-muted-foreground inline ml-1">optional</span></label>
              <input placeholder="e.g. PO-2026-042" value={hostingForm.contract_id} onChange={e => setHostingForm(f => ({ ...f, contract_id: e.target.value }))} />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Contract expiry <span className="text-xs text-muted-foreground inline ml-1">optional</span></label>
              <input type="month" value={hostingForm.contract_expiry} onChange={e => setHostingForm(f => ({ ...f, contract_expiry: e.target.value }))} />
            </div>
          </div>
          <div className="border-t border-border pt-3 mb-3">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.05em] mb-[10px]">Invoice planning</div>
            {hostingForm.cycle === 'monthly' && (
              <div className="mb-[10px]">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Start from month</label>
                <input type="month" value={hostingForm.invoice_month} onChange={e => setHostingForm(f => ({ ...f, invoice_month: e.target.value }))} />
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer text-[13px]">
              <input type="checkbox" checked={hostingForm.already_billed} onChange={e => setHostingForm(f => ({ ...f, already_billed: e.target.checked }))} />
              Already billed{hostingForm.cycle === 'monthly' ? ' for this month' : ' (mark as issued)'}
            </label>
            {(hostingForm.cycle === 'monthly' ? hostingForm.invoice_month : hostingForm.next_invoice_date) && (
              <div className="text-xs text-muted-foreground mt-1.5">
                {hostingForm.cycle === 'monthly'
                  ? `Will create 12 monthly rows from ${hostingForm.invoice_month}${hostingForm.already_billed ? ' (first marked as issued)' : ''}`
                  : `Will create 1 invoice row for ${hostingForm.next_invoice_date?.slice(0, 7)}${hostingForm.already_billed ? ' (marked as issued)' : ''}`
                }
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddHosting(false)}>Cancel</Button>
            <Button size="sm" onClick={saveHosting} disabled={hostingSaving || !hostingForm.amount}>
              {hostingSaving ? 'Saving…' : 'Add Hosting'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Add domains modal ── */}
      {showAddDomain && (
        <Modal title="Add Domains" onClose={() => setShowAddDomain(false)}>
          <div className="grid grid-cols-2 gap-4 mb-[14px]">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project #</label>
              <input placeholder="e.g. 1159" value={domainPn} onChange={e => setDomainPn(e.target.value)} autoFocus />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Contract / Order ID <span className="text-xs text-muted-foreground inline ml-1">optional</span></label>
              <input placeholder="e.g. PO-2026-042" value={domainContractId} onChange={e => setDomainContractId(e.target.value)} />
            </div>
          </div>
          <div className="border-t border-border pt-[14px]">
            <p className="m-0 mb-[10px] font-bold text-[15px] text-foreground">Domains</p>
            <DomainRowInputs rows={domainRows} onChange={setDomainRows} />
          </div>
          <div className="border-t border-border pt-[14px] mt-[14px]">
            <p className="m-0 mb-3 font-bold text-[13px] text-foreground">
              Billing <span className="font-normal text-[11px] text-muted-foreground">— optional</span>
            </p>
            <label className="flex items-center gap-2 cursor-pointer mb-3 text-[13px] font-medium">
              <input type="checkbox" checked={domainAlreadyBilled} onChange={e => {
                setDomainAlreadyBilled(e.target.checked)
                if (!domainInvoiceMonth) {
                  const now = new Date()
                  setDomainInvoiceMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
                }
              }} className="w-[15px] h-[15px]" />
              Already billed
            </label>
            <div className="mb-0 max-w-[200px]">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">{domainAlreadyBilled ? 'Billed in which month?' : 'Add to invoice month'}</label>
              <input type="month" value={domainInvoiceMonth} onChange={e => setDomainInvoiceMonth(e.target.value)} />
            </div>
            {!domainAlreadyBilled && !domainInvoiceMonth && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">Leave empty to skip — you can invoice from the table later.</p>
            )}
          </div>
          <div className="flex gap-2 justify-end mt-5">
            <Button variant="outline" size="sm" onClick={() => setShowAddDomain(false)}>Cancel</Button>
            <Button size="sm" onClick={saveDomains} disabled={domainSaving || !domainPn}>
              {domainSaving ? 'Saving…' : 'Save Domains'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Pipeline add/edit modal ── */}
      {showPipeline && (
        <Modal title={editPipelineTarget ? 'Edit Pipeline Item' : 'Add Pipeline Item'} onClose={() => setShowPipeline(false)}>
          <div className="mb-[14px]">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Title <span className="text-[#dc2626]">*</span></label>
            <input value={pipelineForm.title} onChange={e => setPipelineForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Website redesign proposal" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-[14px]">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Status</label>
              <Select value={pipelineForm.status} onChange={val => setPipelineForm(f => ({ ...f, status: val as PipelineItem['status'] }))} options={PIPELINE_STATUS_OPTS} />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Probability</label>
              <Select value={pipelineForm.probability} onChange={val => setPipelineForm(f => ({ ...f, probability: val }))} options={PIPELINE_PROB_OPTS} />
            </div>
          </div>
          <div className="mb-[14px]">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Deal type</label>
            <Select value={pipelineForm.deal_type} onChange={val => setPipelineForm(f => ({ ...f, deal_type: val as 'one_time' | 'monthly' | 'fixed' }))} options={PIPELINE_TYPE_OPTS} />
          </div>
          {pipelineForm.deal_type !== 'fixed' && (
            <div className="grid grid-cols-2 gap-4 mb-[14px]">
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">{pipelineForm.deal_type === 'monthly' ? 'Amount / month (€)' : 'Amount (€)'}</label>
                <input type="number" value={pipelineForm.estimated_amount} onChange={e => setPipelineForm(f => ({ ...f, estimated_amount: e.target.value }))} placeholder="0" />
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">{pipelineForm.deal_type === 'monthly' ? 'Start month' : 'Expected month'}</label>
                <input type="month" value={pipelineForm.expected_month} onChange={e => setPipelineForm(f => ({ ...f, expected_month: e.target.value }))} />
              </div>
            </div>
          )}
          {pipelineForm.deal_type === 'monthly' && (
            <div className="mb-[14px]">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">End month</label>
              <input type="month" value={pipelineForm.expected_end_month} onChange={e => setPipelineForm(f => ({ ...f, expected_end_month: e.target.value }))} />
              {pipelineForm.expected_month && pipelineForm.expected_end_month && (() => {
                const count = plMonthCount(pipelineForm.expected_month + '-01', pipelineForm.expected_end_month + '-01')
                const total = Number(pipelineForm.estimated_amount || 0) * count
                return <div className="text-xs text-muted-foreground mt-1">{count} month{count !== 1 ? 's' : ''} · total {fmtEuro(total)}</div>
              })()}
            </div>
          )}
          {pipelineForm.deal_type === 'fixed' && (
            <div className="mb-[14px]">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Payment schedule</label>
                <Button variant="outline" size="xs" onClick={addScheduleRow} type="button">+ Add month</Button>
              </div>
              {pipelineForm.schedule.length === 0 && (
                <div className="text-xs text-muted-foreground py-[10px]">No payments added yet.</div>
              )}
              {pipelineForm.schedule.map((row, i) => (
                <div key={i} className="flex gap-2 items-center mb-1.5">
                  <input type="month" value={row.month} onChange={e => updateScheduleRow(i, 'month', e.target.value)} className="flex-1" />
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[13px] pointer-events-none">€</span>
                    <input type="number" value={row.amount} onChange={e => updateScheduleRow(i, 'amount', e.target.value)} placeholder="0" className="w-full pl-[22px]" />
                  </div>
                  <button type="button" onClick={() => removeScheduleRow(i)} className="bg-transparent border-none cursor-pointer text-muted-foreground text-base px-1 leading-none">×</button>
                </div>
              ))}
              {pipelineForm.schedule.length > 0 && (
                <div className="text-xs text-muted-foreground mt-1 text-right">Total: {fmtEuro(fixedScheduleTotal())}</div>
              )}
            </div>
          )}
          <div className="mb-[14px]">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Notes <span className="text-xs text-muted-foreground inline">optional</span></label>
            <textarea value={pipelineForm.notes} onChange={e => setPipelineForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ resize: 'vertical' }} />
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" size="sm" onClick={() => setShowPipeline(false)}>Cancel</Button>
            <Button size="sm" onClick={savePipeline} disabled={pipelineSaving || !pipelineForm.title.trim()}>
              {pipelineSaving ? 'Saving…' : editPipelineTarget ? 'Save changes' : 'Add to pipeline'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Delete pipeline confirm ── */}
      <ConfirmDialog
        open={!!deletePipelineTarget}
        title="Remove pipeline item"
        message={`Remove "${deletePipelineTarget?.title}" from the pipeline?`}
        confirmLabel="Remove"
        onConfirm={() => deletePipelineTarget && deletePipeline(deletePipelineTarget)}
        onCancel={() => setDeletePipelineTarget(null)}
      />

      {/* ── Other income modal ── */}
      {showOtherIncome && (
        <Modal title={editOtherIncomeTarget ? 'Edit invoice' : 'Add one-time invoice'} onClose={() => setShowOtherIncome(false)}>
          <div className="mb-[14px]">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Description</label>
            <input autoFocus value={otherIncomeForm.notes} onChange={e => setOtherIncomeForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Consultation fee, ad-hoc design work…" />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-[14px]">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Month</label>
              <input type="month" value={otherIncomeForm.month} onChange={e => setOtherIncomeForm(f => ({ ...f, month: e.target.value }))} />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Amount (€)</label>
              <input type="number" min="0" step="0.01" value={otherIncomeForm.amount} onChange={e => setOtherIncomeForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="mb-5">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Status</label>
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
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowOtherIncome(false)}>Cancel</Button>
            <Button size="sm" disabled={otherIncomeSaving || !otherIncomeForm.month || !otherIncomeForm.amount} onClick={saveOtherIncome}>
              {otherIncomeSaving ? 'Saving…' : editOtherIncomeTarget ? 'Save changes' : 'Add invoice'}
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteOtherIncomeTarget}
        title="Remove invoice"
        message={`Remove this invoice entry of ${fmtEuro(deleteOtherIncomeTarget?.actual_amount ?? deleteOtherIncomeTarget?.planned_amount)}?`}
        confirmLabel="Remove"
        onConfirm={() => deleteOtherIncomeTarget && deleteOtherIncome(deleteOtherIncomeTarget)}
        onCancel={() => setDeleteOtherIncomeTarget(null)}
      />

      {/* ── Page header ── */}
      <div className="flex flex-col px-6 pt-4 bg-background border-b border-border">
        <div className="flex items-start justify-between w-full pb-[14px]">
          <div>
            <button onClick={() => navigate('/clients')} className="bg-transparent border-none cursor-pointer text-muted-foreground text-xs p-0 flex items-center gap-1 mb-1.5 font-semibold">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
              Clients
            </button>
            <div className="flex items-center gap-[10px] mb-2">
              <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.4px]">{client.name}</h1>
              <span className={`text-[11px] font-bold px-2 py-[2px] rounded-full border ${activeCount > 0 ? 'bg-[rgba(22,163,74,0.1)] text-[#16a34a] border-[rgba(22,163,74,0.25)]' : 'bg-gray-50 text-muted-foreground border-border'}`}>
                {activeCount > 0 ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[13px] text-muted-foreground flex-wrap">
              {client.email && (
                <a href={`mailto:${client.email}`} className="flex items-center gap-1 text-muted-foreground no-underline">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  {client.email}
                </a>
              )}
              {client.phone && (
                <a href={`tel:${client.phone}`} className="flex items-center gap-1 text-muted-foreground no-underline">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
                  {client.phone}
                </a>
              )}
              {client.website && (
                <a href={safeUrl(client.website)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary no-underline font-medium">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                  {client.website.replace(/^https?:\/\//, '')}
                </a>
              )}
              {client.contact_person && (
                <span className="flex items-center gap-1">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  {client.contact_person}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={openEdit}>Edit</Button>
            <Button size="sm" onClick={() => setShowAddProject(true)}>+ New Project</Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-t border-border w-full -mx-6 px-6">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`bg-transparent border-none cursor-pointer px-4 py-[10px] font-semibold text-[13px] whitespace-nowrap -mb-px transition-colors ${activeTab === tab.id ? 'border-b-2 border-primary text-primary' : 'border-b-2 border-transparent text-muted-foreground'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats strip (Overview only, outside page-content to avoid double padding) ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-4 gap-3 px-6 pt-4 mb-2">
          {/* ACTIVE PROJECTS */}
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="flex justify-between items-start mb-[14px]">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">ACTIVE PROJECTS</div>
              <div className="w-[38px] h-[38px] rounded-[10px] bg-[rgba(139,92,246,0.1)] flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{projects.length}</div>
              <span className="text-[10px] font-bold text-primary uppercase tracking-[0.06em]">IN DELIVERY</span>
            </div>
          </div>
          {/* TOTAL VALUE */}
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="flex justify-between items-start mb-[14px]">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">TOTAL VALUE</div>
              <div className="w-[38px] h-[38px] rounded-[10px] bg-[rgba(16,185,129,0.1)] flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-primary">{totalValue ? totalValue.toLocaleString() + ' €' : '—'}</div>
              <span className="text-[10px] font-bold text-[#16a34a] uppercase tracking-[0.06em]">LIFETIME</span>
            </div>
          </div>
          {/* INVOICED YTD */}
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="flex justify-between items-start mb-[14px]">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">INVOICED YTD</div>
              <div className="w-[38px] h-[38px] rounded-[10px] bg-[rgba(59,130,246,0.1)] flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#16a34a]">{invoicedYTD ? invoicedYTD.toLocaleString() + ' €' : '—'}</div>
              <span className="text-[10px] font-bold text-[#16a34a] uppercase tracking-[0.06em]">COLLECTED</span>
            </div>
          </div>
          {/* PIPELINE */}
          <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="flex justify-between items-start mb-[14px]">
              <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">PIPELINE</div>
              <div className="w-[38px] h-[38px] rounded-[10px] bg-[rgba(245,158,11,0.1)] flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="12" y1="7" x2="5" y2="17"/><line x1="12" y1="7" x2="19" y2="17"/><line x1="5" y1="19" x2="19" y2="19"/></svg>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${pipelineTotal > 0 ? 'text-[#f59e0b]' : 'text-foreground'}`}>{pipelineTotal > 0 ? pipelineTotal.toLocaleString() + ' €' : '—'}</div>
              <span className="text-[10px] font-bold text-[#f59e0b] uppercase tracking-[0.06em]">PENDING</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-auto p-6">
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
