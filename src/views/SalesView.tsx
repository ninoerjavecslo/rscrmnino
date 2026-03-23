import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePipelineStore } from '../stores/pipeline'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useSettingsStore } from '../stores/settings'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { PipelineItem } from '../lib/types'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

function fmtEuro(n?: number | null) {
  if (!n) return '—'
  return n.toLocaleString('en-EU') + ' €'
}

function fmtMonth(m?: string | null) {
  if (!m) return '—'
  const d = new Date(m + 'T00:00:00')
  return d.toLocaleString('en', { month: 'short', year: 'numeric' })
}

// Count months between two YYYY-MM-DD strings (inclusive)
function monthCount(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth() + 1)
}

// Total value of a deal
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

const STATUS_OPTS = [
  { value: 'proposal', label: 'Proposal' },
  { value: 'won',      label: 'Won' },
  { value: 'lost',     label: 'Lost' },
]

const PROB_OPTS = [
  { value: '10', label: '10%' },
  { value: '25', label: '25%' },
  { value: '50', label: '50%' },
  { value: '75', label: '75%' },
  { value: '90', label: '90%' },
  { value: '100', label: '100%' },
]

const TYPE_OPTS = [
  { value: 'one_time', label: 'One-time payment' },
  { value: 'monthly',  label: 'Monthly recurring' },
  { value: 'fixed',    label: 'Fixed — plan by month' },
]

const STATUS_BADGE_VARIANT: Record<string, 'amber' | 'green' | 'red' | 'gray'> = {
  proposal: 'amber',
  won:      'green',
  lost:     'red',
}

function dealToProjectType(dealType: string): 'fixed' | 'maintenance' | 'variable' {
  if (dealType === 'monthly') return 'maintenance'
  return 'fixed'
}

interface VarRow { month: string; amount: string; probability: string }
interface WonForm {
  pn: string; name: string; client_id: string; type: string; pm: string; value: string
  starting_from: string; num_months: string; start_month: string; end_month: string; probability: string
}
const WON_EMPTY: WonForm = { pn: '', name: '', client_id: '', type: 'fixed', pm: 'Nino', value: '', starting_from: '', num_months: '12', start_month: '', end_month: '', probability: '50' }

function buildVarRows(startMonth: string, endMonth: string, amt: string, prob: string): VarRow[] {
  const [sy, sm] = startMonth.split('-').map(Number)
  const [ey, em] = endMonth.split('-').map(Number)
  const rows: VarRow[] = []
  let y = sy, m = sm
  while ((y < ey || (y === ey && m <= em)) && rows.length < 60) {
    rows.push({ month: `${y}-${String(m).padStart(2, '0')}`, amount: amt, probability: prob })
    m++; if (m > 12) { m = 1; y++ }
  }
  return rows
}

function nextPn(projects: { pn: string }[]): string {
  const year = new Date().getFullYear()
  const prefix = `RS-${year}-`
  const nums = projects.map(p => p.pn).filter(pn => pn.startsWith(prefix)).map(pn => parseInt(pn.slice(prefix.length), 10)).filter(n => !isNaN(n))
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

function TypePills({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const types = [
    { key: 'fixed',       label: 'Fixed',      sub: 'Known total' },
    { key: 'maintenance', label: 'Recurring',   sub: 'Monthly recurring' },
    { key: 'variable',    label: 'Variable',    sub: 'Estimate per month' },
  ]
  return (
    <div className="mb-4">
      <div className="form-label mb-2">Project type</div>
      <div className="flex gap-2">
        {types.map(t => (
          <div key={t.key} onClick={() => onChange(t.key)}
            className={`flex-1 rounded border-2 p-[10px] cursor-pointer text-center transition-all ${value === t.key ? 'border-primary bg-[var(--navy-light)]' : 'border-border bg-white'}`}>
            <div className={`font-bold text-[13px] ${value === t.key ? 'text-primary' : 'text-foreground'}`}>{t.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}


interface ScheduleRow { month: string; amount: string }

interface FormState {
  company_name: string
  title: string
  description: string
  deal_type: 'one_time' | 'monthly' | 'fixed'
  estimated_amount: string
  probability: string
  expected_month: string
  expected_end_month: string
  status: PipelineItem['status']
  notes: string
  schedule: ScheduleRow[]
}

const EMPTY: FormState = {
  company_name: '', title: '', description: '',
  deal_type: 'monthly', estimated_amount: '',
  probability: '75', expected_month: '', expected_end_month: '',
  status: 'proposal', notes: '',
  schedule: [],
}

export function SalesView() {
  const store    = usePipelineStore()
  const pStore   = useProjectsStore()
  const cStore   = useClientsStore()
  const settings = useSettingsStore()
  const navigate = useNavigate()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PipelineItem | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('active')
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [deleteTarget, setDeleteTarget] = useState<PipelineItem | null>(null)

  // Won / Lost state
  const [wonTarget, setWonTarget] = useState<PipelineItem | null>(null)
  const [wonCreateProject, setWonCreateProject] = useState(true)
  const [wonForm, setWonForm] = useState<WonForm>({ ...WON_EMPTY })
  const [wonVarRows, setWonVarRows] = useState<VarRow[]>([])
  const [wonShowNewClient, setWonShowNewClient] = useState(false)
  const [wonNewClientName, setWonNewClientName] = useState('')
  const [wonSaving, setWonSaving] = useState(false)
  const [lostTarget, setLostTarget] = useState<PipelineItem | null>(null)

  const pmOptions = settings.projectManagers.map(m => ({ value: m, label: m }))

  useEffect(() => {
    store.fetchAll()
    pStore.fetchAll()
    cStore.fetchAll()
    settings.fetch()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd() {
    setEditing(null)
    setForm(EMPTY)
    setShowModal(true)
  }

  function openEdit(item: PipelineItem) {
    setEditing(item)
    setForm({
      company_name: item.company_name ?? item.client?.name ?? '',
      title: item.title,
      description: item.description ?? '',
      deal_type: item.deal_type ?? 'monthly',
      estimated_amount: item.estimated_amount != null ? String(item.estimated_amount) : '',
      probability: String(item.probability),
      expected_month: item.expected_month ? item.expected_month.slice(0, 7) : '',
      expected_end_month: item.expected_end_month ? item.expected_end_month.slice(0, 7) : '',
      status: item.status,
      notes: item.notes ?? '',
      schedule: item.monthly_schedule?.map(r => ({ month: r.month.slice(0, 7), amount: String(r.amount) })) ?? [],
    })
    setShowModal(true)
  }

  function f(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  function addScheduleRow() {
    setForm(p => ({ ...p, schedule: [...p.schedule, { month: '', amount: '' }] }))
  }

  function removeScheduleRow(i: number) {
    setForm(p => ({ ...p, schedule: p.schedule.filter((_, idx) => idx !== i) }))
  }

  function updateScheduleRow(i: number, field: 'month' | 'amount', value: string) {
    setForm(p => {
      const s = [...p.schedule]
      s[i] = { ...s[i], [field]: value }
      return { ...p, schedule: s }
    })
  }

  async function save() {
    if (!form.company_name || !form.title) return
    setSaving(true)
    try {
      const schedule = form.deal_type === 'fixed' && form.schedule.length > 0
        ? form.schedule
            .filter(r => r.month && r.amount)
            .map(r => ({ month: r.month + '-01', amount: Number(r.amount) }))
        : null

      const payload = {
        client_id: null,
        company_name: form.company_name.trim(),
        title: form.title.trim(),
        description: form.description.trim() || null,
        deal_type: form.deal_type,
        estimated_amount: form.deal_type !== 'fixed' && form.estimated_amount ? Number(form.estimated_amount) : null,
        probability: Number(form.probability),
        expected_month: form.deal_type !== 'fixed' && form.expected_month ? form.expected_month + '-01' : null,
        expected_end_month: form.deal_type === 'monthly' && form.expected_end_month
          ? form.expected_end_month + '-01' : null,
        monthly_schedule: schedule,
        status: form.status,
        notes: form.notes.trim() || null,
      }
      if (editing) {
        await store.update(editing.id, payload)
        toast('success', 'Deal updated')
      } else {
        await store.add(payload)
        toast('success', 'Deal added')
      }
      setShowModal(false)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await store.remove(deleteTarget.id)
      toast('success', 'Deal removed')
    } catch (err) {
      toast('error', (err as Error).message)
    }
    setDeleteTarget(null)
  }

  function setWonF(k: keyof WonForm, v: string) {
    setWonForm(f => {
      const next = { ...f, [k]: v }
      if (next.type === 'variable' && next.start_month && next.end_month &&
          (k === 'start_month' || k === 'end_month' || k === 'type')) {
        setWonVarRows(buildVarRows(next.start_month, next.end_month, next.value, next.probability))
      }
      return next
    })
  }

  function openWon(item: PipelineItem) {
    const type = dealToProjectType(item.deal_type ?? 'one_time')
    const value = item.deal_type === 'monthly'
      ? String(item.estimated_amount ?? '')
      : String(dealTotal(item) || item.estimated_amount || '')
    const startMonth = item.expected_month ? item.expected_month.slice(0, 7) : ''
    const endMonth = item.expected_end_month ? item.expected_end_month.slice(0, 7) : ''
    setWonTarget(item)
    setWonCreateProject(true)
    setWonShowNewClient(false)
    setWonNewClientName('')
    setWonVarRows([])
    setWonForm({
      pn: nextPn(pStore.projects),
      name: item.title,
      client_id: item.client_id ?? '',
      type,
      pm: 'Nino',
      value,
      starting_from: startMonth,
      num_months: item.deal_type === 'monthly' && startMonth && endMonth
        ? String(monthCount(startMonth + '-01', endMonth + '-01'))
        : '12',
      start_month: startMonth,
      end_month: endMonth,
      probability: String(item.probability ?? 50),
    })
  }

  async function confirmWon() {
    if (!wonTarget) return
    setWonSaving(true)
    try {
      await store.update(wonTarget.id, { status: 'won' })

      if (wonCreateProject && wonForm.name.trim()) {
        let clientId = wonForm.client_id || null
        if (wonShowNewClient && wonNewClientName.trim()) {
          const { data: nc, error: ce } = await supabase.from('clients').insert({ name: wonNewClientName.trim() }).select('id').single()
          if (ce) throw ce
          clientId = nc.id
          await cStore.fetchAll()
        }

        const pn = wonForm.pn.trim() || nextPn(pStore.projects)
        const val = wonForm.type === 'variable'
          ? (wonVarRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0) || null)
          : wonForm.value ? parseFloat(wonForm.value) : null
        const initialVal = wonForm.type === 'maintenance' && wonForm.value
          ? parseFloat(wonForm.value) * Math.max(1, Math.min(60, parseInt(wonForm.num_months) || 12))
          : val

        const { data: proj, error: pe } = await supabase.from('projects').insert({
          pn,
          name: wonForm.name.trim(),
          client_id: clientId,
          type: wonForm.type,
          status: 'active',
          pm: wonForm.pm || null,
          contract_value: val,
          initial_contract_value: initialVal,
          currency: 'EUR',
          start_date: wonForm.start_month ? wonForm.start_month + '-01' : null,
          end_date: wonForm.end_month ? wonForm.end_month + '-01' : null,
        }).select('id').single()
        if (pe) throw pe

        // Auto-generate invoice plan rows
        if (wonForm.type === 'maintenance' && wonForm.starting_from && wonForm.value) {
          const numMonths = Math.max(1, Math.min(60, parseInt(wonForm.num_months) || 12))
          const [y, m] = wonForm.starting_from.split('-').map(Number)
          const rows = Array.from({ length: numMonths }, (_, i) => {
            const d = new Date(y, m - 1 + i, 1)
            return { project_id: proj.id, month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, planned_amount: parseFloat(wonForm.value), actual_amount: null, status: 'planned', probability: 100, notes: wonForm.name.trim() || null }
          })
          await supabase.from('revenue_planner').insert(rows)
        } else if (wonForm.type === 'variable' && wonVarRows.length > 0) {
          const rows = wonVarRows.filter(r => r.amount && parseFloat(r.amount) > 0).map(r => ({
            project_id: proj.id, month: r.month + '-01', planned_amount: parseFloat(r.amount), actual_amount: null, status: 'planned', probability: Math.max(0, Math.min(100, parseInt(r.probability) || 50)), notes: null,
          }))
          if (rows.length > 0) await supabase.from('revenue_planner').insert(rows)
        }

        await pStore.fetchAll()
        toast('success', 'Deal won! Project created.')
        setWonTarget(null)
        navigate(`/projects/${proj.id}`)
      } else {
        toast('success', 'Deal marked as won')
        setWonTarget(null)
      }
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setWonSaving(false)
    }
  }

  async function confirmLost() {
    if (!lostTarget) return
    try {
      await store.update(lostTarget.id, { status: 'lost' })
      toast('success', 'Deal marked as lost')
    } catch (err) {
      toast('error', (err as Error).message)
    }
    setLostTarget(null)
  }

  const items = store.items
  const filtered = filter === 'active'
    ? items.filter(i => i.status !== 'won' && i.status !== 'lost')
    : filter === 'won'  ? items.filter(i => i.status === 'won')
    : filter === 'lost' ? items.filter(i => i.status === 'lost')
    : items

  const activeItems = items.filter(i => i.status !== 'won' && i.status !== 'lost')
  const totalFace = activeItems.reduce((s, i) => s + dealTotal(i), 0)
  // Scenario totals: probability = chance of winning client (full amount or nothing)
  const likelyItems = activeItems.filter(i => i.probability >= 50)
  const hopefulItems = activeItems.filter(i => i.probability >= 25)
  const totalLikely = likelyItems.reduce((s, i) => s + dealTotal(i), 0)
  const totalHopefully = hopefulItems.reduce((s, i) => s + dealTotal(i), 0)
  const totalWon = items.filter(i => i.status === 'won').reduce((s, i) => s + dealTotal(i), 0)

  // Forecast by month — two scenario columns
  const forecastMap = new Map<string, { face: number; likely: number; hopefully: number; count: number }>()
  for (const item of activeItems) {
    const isLikely = item.probability >= 50
    const isHopeful = item.probability >= 25

    const addToMonth = (key: string, amt: number) => {
      if (!forecastMap.has(key)) forecastMap.set(key, { face: 0, likely: 0, hopefully: 0, count: 0 })
      const g = forecastMap.get(key)!
      g.face += amt
      if (isLikely) g.likely += amt
      if (isHopeful) g.hopefully += amt
      g.count += 1
    }

    if (item.deal_type === 'fixed' && item.monthly_schedule?.length) {
      for (const row of item.monthly_schedule) {
        const key = row.month.length === 7 ? row.month + '-01' : row.month
        addToMonth(key, row.amount)
      }
    } else if (item.deal_type === 'monthly' && item.expected_month && item.expected_end_month) {
      const amt = item.estimated_amount ?? 0
      const s = new Date(item.expected_month + 'T00:00:00')
      const e = new Date(item.expected_end_month + 'T00:00:00')
      const cur = new Date(s)
      while (cur <= e) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-01`
        addToMonth(key, amt)
        cur.setMonth(cur.getMonth() + 1)
      }
    } else if (item.expected_month) {
      const amt = item.estimated_amount ?? 0
      const key = item.expected_month.length === 7 ? item.expected_month + '-01' : item.expected_month
      addToMonth(key, amt)
    }
  }
  const forecastRows = [...forecastMap.entries()].sort(([a], [b]) => a.localeCompare(b))

  // Fixed deal total from schedule
  function fixedScheduleTotal() {
    return form.schedule
      .filter(r => r.amount)
      .reduce((s, r) => s + Number(r.amount || 0), 0)
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Sales Pipeline</h1>
          <p className="text-muted-foreground text-[13px] m-0">Track pitches and proposals for revenue forecasting</p>
        </div>
        <Button size="sm" onClick={openAdd}>+ Add deal</Button>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4 px-6 pt-4">
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">ACTIVE DEALS</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{activeItems.length}</div>
          <div className="text-xs text-muted-foreground mt-1">{fmtEuro(totalFace)} face value</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">LIKELY SCENARIO</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-primary">{fmtEuro(totalLikely) || '—'}</div>
          <div className="text-xs text-muted-foreground mt-1">{likelyItems.length} deals at ≥50% probability</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">HOPEFULLY SCENARIO</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#2563eb]">{fmtEuro(totalHopefully) || '—'}</div>
          <div className="text-xs text-muted-foreground mt-1">{hopefulItems.length} deals at ≥25% probability</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">WON</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#16a34a]">{fmtEuro(totalWon) || '—'}</div>
          <div className="text-xs text-muted-foreground mt-1">{items.filter(i => i.status === 'won').length} deals closed</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1.5">
            {(['active', 'all', 'won', 'lost'] as const).map(opt => (
              <Button
                key={opt}
                size="sm"
                variant={filter === opt ? 'default' : 'outline'}
                onClick={() => setFilter(opt)}
                className="capitalize"
              >
                {opt}
              </Button>
            ))}
          </div>
          <div className="flex gap-1 bg-[var(--c7)] rounded-lg p-[3px]">
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`border-none cursor-pointer rounded px-[10px] py-[5px] transition-all ${viewMode === 'list' ? 'bg-white text-primary shadow-sm' : 'bg-transparent text-muted-foreground'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              title="Kanban view"
              className={`border-none cursor-pointer rounded px-[10px] py-[5px] transition-all ${viewMode === 'kanban' ? 'bg-white text-primary shadow-sm' : 'bg-transparent text-muted-foreground'}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="10" rx="1"/></svg>
            </button>
          </div>
        </div>

        {viewMode === 'kanban' ? (
          <div className="grid grid-cols-3 gap-4 items-start">
            {([
              { status: 'proposal', label: 'Proposal', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
              { status: 'won',      label: 'Won',      color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
              { status: 'lost',     label: 'Lost',     color: '#dc2626', bg: '#fff1f1', border: '#fecaca' },
            ] as const).map(col => {
              const colItems = items.filter(i => i.status === col.status)
              const colTotal = colItems.reduce((s, i) => s + dealTotal(i), 0)
              return (
                <div key={col.status}>
                  <div className="flex items-center justify-between px-[14px] py-[10px] rounded-t-lg border border-b-0" style={{ background: col.bg, borderColor: col.border }}>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[13px]" style={{ color: col.color }}>{col.label}</span>
                      <span className="text-[11px] font-semibold rounded-[10px] px-[7px] py-[1px]" style={{ color: col.color, background: col.border }}>{colItems.length}</span>
                    </div>
                    {colTotal > 0 && <span className="text-[11px] font-semibold text-muted-foreground">{fmtEuro(colTotal)}</span>}
                  </div>
                  <div className="rounded-b-lg border border-t-0 min-h-[80px] bg-[#fafafa]" style={{ borderColor: col.border }}>
                    {colItems.length === 0 ? (
                      <div className="px-[14px] py-6 text-center text-muted-foreground text-xs">No deals</div>
                    ) : colItems.map((item, idx) => {
                      const name = item.company_name ?? item.client?.name ?? '—'
                      const total = dealTotal(item)
                      return (
                        <div key={item.id} className={`px-[14px] py-3 bg-white ${idx < colItems.length - 1 ? 'border-b' : 'rounded-b-lg'}`} style={{ borderColor: col.border }}>
                          <div className="flex items-start justify-between gap-1.5 mb-1.5">
                            <div>
                              <div className="font-bold text-[13px] text-foreground leading-tight">{item.title}</div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">{name}</div>
                            </div>
                            <span className={`text-[11px] font-bold shrink-0 ${item.probability >= 75 ? 'text-[#16a34a]' : item.probability >= 50 ? 'text-primary' : 'text-[#d97706]'}`}>{item.probability}%</span>
                          </div>
                          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                            {item.deal_type === 'monthly'
                              ? <Badge variant="blue" className="text-[10px]">Monthly</Badge>
                              : item.deal_type === 'fixed'
                              ? <Badge variant="navy" className="text-[10px]">Fixed</Badge>
                              : <Badge variant="gray" className="text-[10px]">One-time</Badge>}
                            {total > 0 && <span className="text-xs font-bold text-foreground tabular-nums">
                              {item.deal_type === 'monthly' ? `${fmtEuro(item.estimated_amount)}/mo` : fmtEuro(total)}
                            </span>}
                            {item.expected_month && <span className="text-[11px] text-muted-foreground">{fmtMonth(item.expected_month)}</span>}
                          </div>
                          {item.description && <div className="text-[11px] text-muted-foreground mb-2 leading-snug">{item.description}</div>}
                          <div className="flex gap-1 flex-wrap">
                            {item.status !== 'won' && item.status !== 'lost' && (
                              <>
                                <Button size="xs" variant="outline" className="text-[#16a34a] border-[#16a34a] text-[10px] font-bold px-[7px] py-[2px]" onClick={() => openWon(item)}>Won ✓</Button>
                                <Button size="xs" variant="outline" className="text-[#dc2626] border-[#dc2626] text-[10px] font-bold px-[7px] py-[2px]" onClick={() => setLostTarget(item)}>Lost ✗</Button>
                              </>
                            )}
                            <Button variant="outline" size="xs" onClick={() => openEdit(item)}>Edit</Button>
                            <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setDeleteTarget(item)}>✕</Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
        <Card>
          {filtered.length === 0 ? (
            <CardContent className="py-8 text-center text-muted-foreground text-[13px]">
              No {filter === 'active' ? 'active ' : ''}deals.{' '}
              <span className="font-medium text-primary hover:underline cursor-pointer" onClick={openAdd}>Add one</span>
            </CardContent>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>STATUS</th>
                  <th>COMPANY</th>
                  <th>TITLE</th>
                  <th>TYPE</th>
                  <th className="text-right">AMOUNT</th>
                  <th className="text-right">PROB</th>
                  <th>SCENARIO</th>
                  <th>PERIOD</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const name = item.company_name ?? item.client?.name ?? '—'
                  const total = dealTotal(item)
                  const scenarioLabel = item.status === 'won' ? { label: 'Won', variant: 'green' as const }
                    : item.status === 'lost' ? { label: 'Lost', variant: 'red' as const }
                    : item.probability >= 50 ? { label: 'Likely', variant: 'navy' as const }
                    : item.probability >= 25 ? { label: 'Hopefully', variant: 'blue' as const }
                    : { label: 'Stretch', variant: 'gray' as const }
                  return (
                    <tr key={item.id}>
                      <td>
                        <Badge variant={STATUS_BADGE_VARIANT[item.status] ?? 'gray'} className="text-[10px] capitalize">
                          {item.status}
                        </Badge>
                      </td>
                      <td className="text-[13px] text-foreground font-semibold">{name}</td>
                      <td className="font-bold">
                        {item.title}
                        {item.description && (
                          <div className="text-[11px] text-muted-foreground font-normal mt-0.5">{item.description}</div>
                        )}
                      </td>
                      <td>
                        {item.deal_type === 'monthly'
                          ? <Badge variant="blue" className="text-[10px]">Monthly</Badge>
                          : item.deal_type === 'fixed'
                          ? <Badge variant="navy" className="text-[10px]">Fixed</Badge>
                          : <Badge variant="gray" className="text-[10px]">One-time</Badge>}
                      </td>
                      <td className="text-right">
                        {item.deal_type === 'fixed' && item.monthly_schedule?.length ? (
                          fmtEuro(total)
                        ) : item.estimated_amount ? (
                          item.deal_type === 'monthly'
                            ? <>{fmtEuro(item.estimated_amount)}<span className="text-muted-foreground text-[11px]">/mo</span></>
                            : fmtEuro(item.estimated_amount)
                        ) : '—'}
                      </td>
                      <td className="text-right">
                        <span className={`text-xs font-bold ${item.probability >= 75 ? 'text-[#16a34a]' : item.probability >= 50 ? 'text-primary' : 'text-[#d97706]'}`}>
                          {item.probability}%
                        </span>
                      </td>
                      <td>
                        <Badge variant={scenarioLabel.variant} className="text-[10px]">
                          {scenarioLabel.label}
                        </Badge>
                      </td>
                      <td className="text-xs text-[#374151]">
                        {item.deal_type === 'fixed' && item.monthly_schedule?.length ? (
                          <span className="text-[11px] text-muted-foreground">
                            {item.monthly_schedule.length} payment{item.monthly_schedule.length !== 1 ? 's' : ''}
                          </span>
                        ) : item.expected_month
                          ? item.deal_type === 'monthly' && item.expected_end_month
                            ? `${fmtMonth(item.expected_month)} – ${fmtMonth(item.expected_end_month)}`
                            : fmtMonth(item.expected_month)
                          : '—'}
                      </td>
                      <td>
                        <div className="flex gap-1.5 items-center flex-nowrap">
                          {item.status !== 'won' && item.status !== 'lost' && (
                            <>
                              <Button size="xs" variant="outline" className="text-[#16a34a] border-[#16a34a] font-bold text-[11px]" onClick={() => openWon(item)}>Won ✓</Button>
                              <Button size="xs" variant="outline" className="text-[#dc2626] border-[#dc2626] font-bold text-[11px]" onClick={() => setLostTarget(item)}>Lost ✗</Button>
                            </>
                          )}
                          <Button variant="outline" size="xs" onClick={() => openEdit(item)}>Edit</Button>
                          <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeleteTarget(item)}>✕</Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
        )}

        {/* Forecast by month */}
        {forecastRows.length > 0 && (
          <>
            <div className="flex items-center justify-between mt-6 mb-[10px]">
              <h2>Forecast by Month</h2>
              <span className="text-xs text-muted-foreground">active deals · scenario-based</span>
            </div>
            <Card>
              <table>
                <thead>
                  <tr>
                    <th>MONTH</th>
                    <th className="text-right">DEALS</th>
                    <th className="text-right">FACE VALUE</th>
                    <th className="text-right text-primary">LIKELY (≥50%)</th>
                    <th className="text-right text-[#2563eb]">HOPEFULLY (≥25%)</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastRows.map(([key, g]) => (
                    <tr key={key}>
                      <td className="font-semibold">{fmtMonth(key)}</td>
                      <td className="text-right text-muted-foreground">{g.count}</td>
                      <td className="text-right">{fmtEuro(g.face)}</td>
                      <td className="text-right text-primary font-bold">{g.likely > 0 ? fmtEuro(g.likely) : '—'}</td>
                      <td className="text-right text-[#2563eb] font-bold">{g.hopefully > 0 ? fmtEuro(g.hopefully) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--c7)] border-t-2 border-border">
                    <td className="font-bold text-xs text-muted-foreground uppercase tracking-[0.5px]">Total</td>
                    <td className="text-right text-muted-foreground">{activeItems.length}</td>
                    <td className="text-right font-bold">{fmtEuro(totalFace)}</td>
                    <td className="text-right font-bold text-primary">{fmtEuro(totalLikely) || '—'}</td>
                    <td className="text-right font-bold text-[#2563eb]">{fmtEuro(totalHopefully) || '—'}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          </>
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={showModal}
        title={editing ? 'Edit deal' : 'Add deal'}
        onClose={() => setShowModal(false)}
      >
        <div className="grid grid-cols-2 gap-4 mb-[14px]">
          <div className="mb-4">
            <label className="form-label">Company / Prospect <span className="text-[#dc2626]">*</span></label>
            <input value={form.company_name} onChange={f('company_name')} placeholder="e.g. Acme Corp" autoFocus={!editing} />
          </div>
          <div className="mb-4">
            <label className="form-label">Title <span className="text-[#dc2626]">*</span></label>
            <input value={form.title} onChange={f('title')} placeholder="e.g. Website redesign" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-[14px]">
          <div className="mb-4">
            <label className="form-label">Status</label>
            <Select
              value={form.status}
              onChange={v => setForm(p => ({ ...p, status: v as PipelineItem['status'] }))}
              options={STATUS_OPTS}
            />
          </div>
          <div className="mb-4">
            <label className="form-label">Probability</label>
            <Select
              value={form.probability}
              onChange={v => setForm(p => ({ ...p, probability: v }))}
              options={PROB_OPTS}
            />
          </div>
        </div>

        <div className="mb-[14px]">
          <label className="form-label">Deal type</label>
          <Select
            value={form.deal_type}
            onChange={v => setForm(p => ({ ...p, deal_type: v as 'one_time' | 'monthly' | 'fixed' }))}
            options={TYPE_OPTS}
          />
        </div>

        {form.deal_type !== 'fixed' && (
          <div className="grid grid-cols-2 gap-4 mb-[14px]">
            <div className="mb-4">
              <label className="form-label">
                {form.deal_type === 'monthly' ? 'Amount / month (€)' : 'Amount (€)'}
              </label>
              <input type="number" value={form.estimated_amount} onChange={f('estimated_amount')} placeholder="0" />
            </div>
            <div className="mb-4">
              <label className="form-label">
                {form.deal_type === 'monthly' ? 'Start month' : 'Expected month'}
              </label>
              <input type="month" value={form.expected_month} onChange={f('expected_month')} />
            </div>
          </div>
        )}

        {form.deal_type === 'monthly' && (
          <div className="mb-[14px]">
            <label className="form-label">End month</label>
            <input type="month" value={form.expected_end_month} onChange={f('expected_end_month')} />
            {form.expected_month && form.expected_end_month && (() => {
              const count = monthCount(form.expected_month + '-01', form.expected_end_month + '-01')
              const total = Number(form.estimated_amount || 0) * count
              return (
                <div className="text-xs text-muted-foreground mt-1">
                  {count} month{count !== 1 ? 's' : ''} · total {fmtEuro(total)}
                </div>
              )
            })()}
          </div>
        )}

        {form.deal_type === 'fixed' && (
          <div className="mb-[14px]">
            <div className="flex items-center justify-between mb-2">
              <label className="form-label m-0">Payment schedule</label>
              <Button variant="outline" size="xs" onClick={addScheduleRow} type="button">+ Add month</Button>
            </div>
            {form.schedule.length === 0 && (
              <div className="text-xs text-muted-foreground py-[10px]">No payments added yet.</div>
            )}
            {form.schedule.map((row, i) => (
              <div key={i} className="flex gap-2 items-center mb-1.5">
                <input
                  type="month"
                  value={row.month}
                  onChange={e => updateScheduleRow(i, 'month', e.target.value)}
                  className="flex-1"
                />
                <div className="relative flex-1">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[13px] pointer-events-none">€</span>
                  <input
                    type="number"
                    value={row.amount}
                    onChange={e => updateScheduleRow(i, 'amount', e.target.value)}
                    placeholder="0"
                    className="pl-[22px] w-full"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeScheduleRow(i)}
                  className="bg-none border-none cursor-pointer text-muted-foreground text-base px-1 leading-none"
                >×</button>
              </div>
            ))}
            {form.schedule.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1 text-right">
                Total: {fmtEuro(fixedScheduleTotal())}
              </div>
            )}
          </div>
        )}

        <div className="mb-[14px]">
          <label className="form-label">Notes <span className="text-xs text-muted-foreground ml-1">optional</span></label>
          <textarea value={form.notes} onChange={f('notes')} rows={2} className="resize-y" />
        </div>
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !form.company_name || !form.title}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add deal'}
          </Button>
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove deal"
        message={`Remove "${deleteTarget?.title}"? This cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Won modal */}
      {wonTarget && (
        <Modal open title={`Mark "${wonTarget.title}" as won`} onClose={() => setWonTarget(null)}>
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer text-[13px] font-semibold">
              <input type="checkbox" checked={wonCreateProject} onChange={e => setWonCreateProject(e.target.checked)} className="w-[15px] h-[15px]" />
              Create a project from this deal
            </label>
          </div>

          {wonCreateProject && (
            <>
              <TypePills value={wonForm.type} onChange={v => setWonF('type', v)} />

              <div className="grid grid-cols-3 gap-4 mb-[14px]">
                <div className="mb-4" style={{ maxWidth: 160 }}>
                  <label className="form-label">Project #</label>
                  <input value={wonForm.pn} onChange={e => setWonF('pn', e.target.value)} className="font-mono" />
                </div>
                <div className="mb-4">
                  <label className="form-label">Project name</label>
                  <input value={wonForm.name} onChange={e => setWonF('name', e.target.value)} autoFocus />
                </div>
                <div className="mb-4">
                  <label className="form-label">Client</label>
                  <Select
                    value={wonShowNewClient ? '__new__' : wonForm.client_id}
                    onChange={v => { if (v === '__new__') { setWonShowNewClient(true); setWonF('client_id', '') } else { setWonShowNewClient(false); setWonNewClientName(''); setWonF('client_id', v) } }}
                    placeholder="— Select client —"
                    options={[...cStore.clients.map(c => ({ value: c.id, label: c.name })), { value: '__new__', label: '+ New client…' }]}
                  />
                  {wonShowNewClient && <input className="mt-2" value={wonNewClientName} onChange={e => setWonNewClientName(e.target.value)} placeholder="New client name…" />}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-[14px]">
                <div className="mb-4">
                  <label className="form-label">Project Manager</label>
                  <Select value={wonForm.pm} onChange={v => setWonF('pm', v)} options={pmOptions} />
                </div>
                {wonForm.type !== 'variable' && (
                  <div className="mb-4">
                    <label className="form-label">{wonForm.type === 'maintenance' ? 'Monthly amount (€)' : 'Project value (€)'}</label>
                    <input type="number" value={wonForm.value} onChange={e => setWonF('value', e.target.value)} placeholder={wonForm.type === 'maintenance' ? '2000' : '45000'} />
                  </div>
                )}
              </div>

              {wonForm.type === 'maintenance' && (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-[14px]">
                    <div className="mb-4">
                      <label className="form-label">Starting from</label>
                      <input type="month" value={wonForm.starting_from} onChange={e => setWonF('starting_from', e.target.value)} />
                    </div>
                    <div className="mb-4" style={{ maxWidth: 140 }}>
                      <label className="form-label">Number of months</label>
                      <input type="number" min="1" max="60" value={wonForm.num_months} onChange={e => setWonF('num_months', e.target.value)} placeholder="12" />
                    </div>
                  </div>
                  {wonForm.value && wonForm.num_months && (
                    <div className="flex items-center gap-2 mb-[10px] px-3 py-2 bg-[var(--c7)] rounded">
                      <span className="text-xs text-muted-foreground">Initial value:</span>
                      <span className="text-sm font-bold text-primary">
                        {(parseFloat(wonForm.value) * Math.max(1, Math.min(60, parseInt(wonForm.num_months) || 12))).toLocaleString()} €
                      </span>
                      <span className="text-[11px] text-muted-foreground">({wonForm.value} €/mo × {wonForm.num_months} mo)</span>
                    </div>
                  )}
                </>
              )}

              {wonForm.type === 'variable' && (
                <>
                  <div className="grid grid-cols-4 gap-4 mb-3">
                    <div className="mb-4">
                      <label className="form-label">Start month</label>
                      <input type="month" value={wonForm.start_month} onChange={e => setWonF('start_month', e.target.value)} />
                    </div>
                    <div className="mb-4">
                      <label className="form-label">End month</label>
                      <input type="month" value={wonForm.end_month} onChange={e => setWonF('end_month', e.target.value)} />
                    </div>
                    <div className="mb-4" style={{ maxWidth: 140 }}>
                      <label className="form-label">Default amount (€)</label>
                      <input type="number" value={wonForm.value} onChange={e => { setWonF('value', e.target.value); setWonVarRows(rows => rows.map(r => ({ ...r, amount: e.target.value }))) }} placeholder="0" />
                    </div>
                    <div className="mb-4" style={{ maxWidth: 200 }}>
                      <label className="form-label">Set all rows to</label>
                      <div className="flex gap-1.5">
                        <select value={wonForm.probability} onChange={e => setWonF('probability', e.target.value)}
                          className="flex-1 h-[42px] border border-border rounded-[10px] px-[10px] text-sm bg-white font-[inherit]">
                          <option value="25">25%</option>
                          <option value="50">50%</option>
                          <option value="100">100%</option>
                        </select>
                        <Button type="button" variant="outline" size="sm"
                          onClick={() => setWonVarRows(rows => rows.map(r => ({ ...r, probability: wonForm.probability })))}>
                          Apply
                        </Button>
                      </div>
                    </div>
                  </div>
                  {wonVarRows.length > 0 && wonForm.start_month && wonForm.end_month && (
                    <div className="mb-1 text-xs text-muted-foreground text-right">
                      {(() => {
                        const total = wonVarRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
                        const weighted = wonVarRows.reduce((s, r) => s + (parseFloat(r.amount) || 0) * (parseInt(r.probability) || 0) / 100, 0)
                        return total > 0 ? `Total ${total.toLocaleString()} € · Expected cash ${weighted.toLocaleString(undefined, { maximumFractionDigits: 0 })} €` : ''
                      })()}
                    </div>
                  )}
                  {wonVarRows.length > 0 && (
                    <div className="mb-3 border border-border rounded overflow-hidden">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-[var(--c7)] border-b border-border">
                            <th className="px-[14px] py-2 font-semibold text-[11px] text-left text-muted-foreground">MONTH</th>
                            <th className="px-[14px] py-2 font-semibold text-[11px] text-right text-muted-foreground">AMOUNT (€)</th>
                            <th className="px-[14px] py-2 font-semibold text-[11px] text-right text-muted-foreground">LIKELIHOOD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wonVarRows.map((r, i) => (
                            <tr key={r.month} className={i < wonVarRows.length - 1 ? 'border-b border-border' : ''}>
                              <td className="px-[14px] py-2 font-semibold text-[13px]">{new Date(r.month + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</td>
                              <td className="px-2 py-1.5">
                                <input type="number" value={r.amount} onChange={e => setWonVarRows(rows => rows.map((row, idx) => idx === i ? { ...row, amount: e.target.value } : row))} placeholder="0" className="w-full text-right px-[10px] py-1.5 text-[13px] border border-border rounded" />
                              </td>
                              <td className="px-2 py-1.5 min-w-[110px]">
                                <select value={r.probability} onChange={e => setWonVarRows(rows => rows.map((row, idx) => idx === i ? { ...row, probability: e.target.value } : row))} className="w-full h-9 border border-border rounded px-2 text-[13px] bg-white font-[inherit]">
                                  <option value="25">25%</option><option value="50">50%</option><option value="100">100%</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {(!wonForm.start_month || !wonForm.end_month) && (
                    <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 text-sm text-[#2563eb] flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      Set start and end months to generate the per-month plan table.
                    </div>
                  )}
                </>
              )}

              {wonForm.type === 'maintenance' && wonForm.num_months && wonForm.starting_from && (
                <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 text-sm text-[#2563eb] flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {wonForm.num_months} monthly invoice plans will be created from {wonForm.starting_from}.
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" size="sm" onClick={() => setWonTarget(null)}>Cancel</Button>
            <Button size="sm" className="bg-[#16a34a] border-[#16a34a] hover:bg-[#15803d]"
              onClick={confirmWon}
              disabled={wonSaving || (wonCreateProject && !wonForm.name.trim())}
            >
              {wonSaving ? 'Saving…' : wonCreateProject ? 'Won + Create Project' : 'Mark as Won'}
            </Button>
          </div>
        </Modal>
      )}

      {/* Lost confirm */}
      <ConfirmDialog
        open={!!lostTarget}
        title="Mark as lost"
        message={`Mark "${lostTarget?.title}" as lost?`}
        confirmLabel="Mark as Lost"
        onConfirm={confirmLost}
        onCancel={() => setLostTarget(null)}
      />
    </div>
  )
}
