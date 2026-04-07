import { useEffect, useState } from 'react'
import { useDomainsStore } from '../stores/domains'
import { useClientsStore } from '../stores/clients'
import { useSettingsStore } from '../stores/settings'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { Domain } from '../lib/types'
import { buildLogoHtml, openHtmlAsPdf } from '../lib/pdfExport'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { usePagePermission } from '../lib/usePagePermission'
import * as XLSX from 'xlsx'


// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(d: string) {
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
}
function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
// Convert YYYY-MM-DD → dd/mm/yyyy (for display in text input)
function isoToDMY(s: string): string {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  return `${d}/${m}/${y}`
}
function fmtEur(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' €'
}
function fmtSloDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return `${dt.getDate()}. ${dt.getMonth() + 1}. ${dt.getFullYear()}`
}

const ACTIVE_PER_PAGE  = 30
const ARCHIVE_PER_PAGE = 10

function Pagination({ page, total, perPage, onChange }: { page: number; total: number; perPage: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / perPage)
  if (pages <= 1) return null
  return (
    <div className="flex items-center justify-end gap-1 px-4 py-3">
      <span className="text-xs text-muted-foreground mr-2">{((page-1)*perPage)+1}–{Math.min(page*perPage,total)} of {total}</span>
      <Button variant="ghost" size="xs" disabled={page === 1} onClick={() => onChange(page - 1)}>‹ Prev</Button>
      {Array.from({length: pages}, (_, i) => i + 1).map(p => (
        <Button key={p} size="xs" variant={p === page ? 'default' : 'outline'} onClick={() => onChange(p)}>
          {p}
        </Button>
      ))}
      <Button variant="ghost" size="xs" disabled={page === pages} onClick={() => onChange(page + 1)}>Next ›</Button>
    </div>
  )
}

function ExpiryBadge({ expiryDate }: { expiryDate: string }) {
  const days = daysUntil(expiryDate)
  if (days < 0)   return <Badge variant="red">Expired</Badge>
  if (days <= 7)  return <Badge variant="red">Expires in {days}d</Badge>
  if (days <= 30) return <Badge variant="amber">Expires in {days}d</Badge>
  return <Badge variant="green">Active</Badge>
}

// ── Domain row input (in add modal) ──────────────────────────────────────────

interface DomainRow { domain_name: string; expiry_date: string; yearly_amount: string }

function DomainRowInputs({ rows, onChange }: { rows: DomainRow[]; onChange: (r: DomainRow[]) => void }) {
  function update<K extends keyof DomainRow>(i: number, f: K, v: DomainRow[K]) {
    onChange(rows.map((r, idx) => idx === i ? { ...r, [f]: v } : r))
  }
  function add()     { onChange([...rows, { domain_name: '', expiry_date: '', yearly_amount: '' }]) }
  function remove(i: number) { onChange(rows.filter((_, idx) => idx !== i)) }

  const cols = '2fr 140px 90px 32px'
  return (
    <div>
      <div className="grid mb-1.5 pb-1 border-b border-border" style={{gridTemplateColumns:cols,gap:'4px 10px'}}>
        <span className="form-label m-0">Domain</span>
        <span className="form-label m-0">Expiry date</span>
        <span className="form-label m-0">€ / year</span>
        <span></span>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid items-center mb-2" style={{gridTemplateColumns:cols,gap:'6px 10px'}}>
          <input value={row.domain_name} onChange={e => update(i,'domain_name',e.target.value)} placeholder="example.si" className="h-9" />
          <input type="date" lang="en-GB" value={row.expiry_date} onChange={e => update(i,'expiry_date',e.target.value)} className="h-9 w-full" />
          <input type="number" value={row.yearly_amount} onChange={e => update(i,'yearly_amount',e.target.value)} placeholder="25" className="h-9" />
          <button onClick={() => remove(i)} disabled={rows.length === 1}
            className="flex items-center justify-center rounded cursor-pointer text-muted-foreground border border-border bg-white w-8 h-9 text-lg leading-none">×</button>
        </div>
      ))}
      <Button variant="ghost" size="xs" onClick={add} className="mt-1">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add domain
      </Button>
    </div>
  )
}

// ── Step 2 Panel ──────────────────────────────────────────────────────────────

function Step2Panel({
  savedDomains, invoicePlanned, invoicePlanMonth, invoicePlanStatus,
  paymentDays, onPaymentDaysChange, sielEmail, accountingEmail, onCopy
}: {
  savedDomains: Domain[]
  invoicePlanned: boolean
  invoicePlanMonth: string
  invoicePlanStatus: 'planned' | 'issued' | null
  paymentDays: number
  onPaymentDaysChange: (n: number) => void
  sielEmail: string
  accountingEmail: string
  onCopy: (text: string, label: string) => void
}) {
  const domainNames = savedDomains.map(d => d.domain_name).join(', ')
  const monthLabel = invoicePlanMonth
    ? new Date(invoicePlanMonth + '-01T00:00:00').toLocaleString('en', { month: 'long', year: 'numeric' })
    : ''
  const statusLabel = invoicePlanStatus === 'issued' ? 'Already billed' : 'Planned'

  return (
    <div>
      {/* Step indicator */}
      <div className="flex justify-end mb-3">
        <span className="text-xs text-muted-foreground bg-[var(--c7)] px-[10px] py-[3px] rounded-[20px]">Step 2 of 2</span>
      </div>

      {/* Success banner */}
      <div className="flex items-center gap-[10px] bg-[#e8f5e9] border border-[#c8e6c9] rounded-lg px-[14px] py-[10px] mb-4 text-[13px] text-[#2e7d32] font-semibold">
        <span>✓</span>
        <span>{savedDomains.length} domain{savedDomains.length > 1 ? 's' : ''} saved — {domainNames}</span>
        {invoicePlanned && (
          <Badge variant="green" className="ml-auto">{statusLabel}: {monthLabel}</Badge>
        )}
      </div>

      {/* Invoice summary */}
      {invoicePlanned && (
        <div className="flex items-center gap-2 px-[14px] py-[10px] bg-[#f0f4ff] border border-[#d0d8f0] rounded-lg mb-[14px] text-[13px]">
          {'📅'} <span>Dodano v plan računov za <strong>{monthLabel}</strong> · {fmtEur(savedDomains.reduce((s, d) => s + (d.yearly_amount ?? 0), 0))} · <strong>{statusLabel}</strong></span>
        </div>
      )}

      {/* Siel email */}
      <div className="border border-[var(--c6)] rounded-lg mb-3 overflow-hidden">
        <div className="flex items-center justify-between px-[14px] py-[10px] bg-[var(--c7)] border-b border-[var(--c6)]">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground">Naročilo — Siel</div>
            <div className="text-xs text-[var(--c1)] font-semibold">registrar@siel.si</div>
          </div>
          <Button variant="outline" size="xs" onClick={() => onCopy(sielEmail, 'Siel email')}>Copy</Button>
        </div>
        <pre className="m-0 px-[14px] py-3 text-xs leading-[1.7] text-[var(--c1)] font-[inherit] whitespace-pre-wrap bg-white">{sielEmail}</pre>
      </div>

      {/* Accounting email */}
      <div className="border border-[var(--c6)] rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-[14px] py-[10px] bg-[var(--c7)] border-b border-[var(--c6)]">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground">Obvestilo — računovodstvo</div>
            <div className="text-xs text-[var(--c1)] font-semibold">fakturiranje@pristop.si</div>
          </div>
          <Button variant="outline" size="xs" onClick={() => onCopy(accountingEmail, 'Accounting email')}>Copy</Button>
        </div>
        <div className="flex items-center gap-2 px-[14px] py-2 border-b border-[var(--c6)] bg-[#fafbfd]">
          <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground">Rok plačila (dni):</span>
          <input
            type="number"
            value={paymentDays}
            onChange={e => onPaymentDaysChange(Number(e.target.value) || 30)}
            className="w-[60px] h-7 text-center text-[13px] font-semibold"
          />
          <span className="text-[11px] text-muted-foreground">— spremenite pred kopiranjem</span>
        </div>
        <pre className="m-0 px-[14px] py-3 text-xs leading-[1.7] text-[var(--c1)] font-[inherit] whitespace-pre-wrap bg-white">{accountingEmail}</pre>
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function DomainsView() {
  const store   = useDomainsStore()
  const cStore  = useClientsStore()
  const settingsStore = useSettingsStore()
  const { canEdit } = usePagePermission('domains')
  const [showAdd, setShowAdd]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [search, setSearch]             = useState('')
  const [clientFilter, setClientFilter] = useState('')
  // Bulk select
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [bulkClientId, setBulkClientId] = useState('')
  const [bulkProjectPn, setBulkProjectPn] = useState('')
  const [bulkSaving, setBulkSaving]     = useState(false)
  const [showBulkNewClient, setShowBulkNewClient] = useState(false)
  const [bulkNewClientName, setBulkNewClientName] = useState('')
  const [bulkArchiveOpen, setBulkArchiveOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen]   = useState(false)

  // Add form
  const [clientId, setClientId]               = useState('')
  const [newClientName, setNewClientName]     = useState('')
  const [showNewClient, setShowNewClient]     = useState(false)
  const [projectPn, setProjectPn]             = useState('')
  const [contractId, setContractId]           = useState('')
  const [domainRows, setDomainRows]           = useState<DomainRow[]>([{ domain_name: '', expiry_date: '', yearly_amount: '' }])
  const [domainError, setDomainError]         = useState<string | null>(null)

  // Invoice planning (add form)
  const [invoicePlanMonth, setInvoicePlanMonth]   = useState('')
  const [invoicePlanStatus, setInvoicePlanStatus] = useState<'planned' | 'issued' | null>(null)

  // Wizard state
  const [wizardStep, setWizardStep]         = useState<1 | 2>(1)
  const [savedDomains, setSavedDomains]     = useState<Domain[]>([])
  const [invoicePlanned, setInvoicePlanned] = useState(false)

  // Step 2 / snapshot state
  const [paymentDays, setPaymentDays]                       = useState(30)
  const [, setDomainRowsSnapshot]         = useState<DomainRow[]>([])
  const [invoicePlanMonthSnap, setInvoicePlanMonthSnap]     = useState('')
  const [invoicePlanStatusSnap, setInvoicePlanStatusSnap]   = useState<'planned' | 'issued' | null>(null)

  // Edit form
  const [editDomain, setEditDomain] = useState<Domain | null>(null)

  // Pagination
  const [activePage, setActivePage]   = useState(1)
  const [archivePage, setArchivePage] = useState(1)

  // Confirm modals (single)
  const [archiveTarget, setArchiveTarget] = useState<Domain | null>(null)
  const [deleteTarget, setDeleteTarget]   = useState<Domain | null>(null)

  // Domain renewal invoice
  const [invoiceDomain, setInvoiceDomain]   = useState<Domain | null>(null)
  const [invoiceAmount, setInvoiceAmount]   = useState('')
  const [invoiceMonth, setInvoiceMonth]     = useState('')
  const [invoiceDesc, setInvoiceDesc]       = useState('')
  const [invoiceSaving, setInvoiceSaving]   = useState(false)
  const [domainBillingStatus, setDomainBillingStatus] = useState<Map<string, 'planned' | 'billed'>>(new Map())

  const [isOwn, setIsOwn] = useState(false)

  useEffect(() => { store.fetchAll(); cStore.fetchAll(); settingsStore.fetch() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function fetchDomainBilling() {
      const { data } = await supabase
        .from('revenue_planner')
        .select('domain_id, status')
        .not('domain_id', 'is', null)
      if (data) {
        const map = new Map<string, 'planned' | 'billed'>()
        for (const r of data as { domain_id: string; status: string }[]) {
          const current = map.get(r.domain_id)
          const isBilled = r.status === 'issued' || r.status === 'paid'
          // Billed takes precedence over planned
          if (isBilled || current == null) {
            map.set(r.domain_id, isBilled ? 'billed' : 'planned')
          }
        }
        setDomainBillingStatus(map)
      }
    }
    fetchDomainBilling()
  }, [])
  useEffect(() => { setActivePage(1) }, [search, clientFilter])

  const activeDomains   = store.domains.filter(d => !d.archived)
  const archivedDomains = store.domains.filter(d => d.archived)
  const critical        = store.critical().filter(d => !d.archived)
  const warningSoon     = store.warningSoon().filter(d => !d.archived)
  const q               = search.trim().toLowerCase()
  const filtered        = activeDomains.filter(d => {
    const matchQ      = !q || d.domain_name.toLowerCase().includes(q) || (d.client?.name ?? '').toLowerCase().includes(q)
    const matchClient = !clientFilter || d.client_id === clientFilter
    return matchQ && matchClient
  })

  const totalYearly = (() => {
    const now = new Date()
    const curYear = String(now.getFullYear())
    const curMonthStr = `${curYear}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    return store.domains.filter(d => {
      if (d.status === 'expired') return false
      if (!d.archived) return true
      const billingMonth = `${curYear}-${(d.registered_date ?? d.expiry_date).slice(5, 7)}-01`
      return billingMonth <= curMonthStr
    }).reduce((s, d) => s + (d.yearly_amount ?? 0), 0)
  })()
  const pagedActive   = filtered.slice((activePage - 1) * ACTIVE_PER_PAGE, activePage * ACTIVE_PER_PAGE)
  const pagedArchived = archivedDomains.slice((archivePage - 1) * ARCHIVE_PER_PAGE, archivePage * ARCHIVE_PER_PAGE)
  const allSelected   = pagedActive.length > 0 && pagedActive.every(d => selected.has(d.id))

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(pagedActive.map(d => d.id)))
  }
  function clearSelection() {
    setSelected(new Set())
    setBulkClientId('')
    setBulkProjectPn('')
    setShowBulkNewClient(false)
    setBulkNewClientName('')
  }

  // Bulk actions
  async function handleBulkEdit() {
    if (!bulkClientId && !showBulkNewClient && !bulkProjectPn) { toast('error', 'Set a client or project # to apply'); return }
    if (showBulkNewClient && !bulkNewClientName.trim()) { toast('error', 'Enter a client name'); return }
    setBulkSaving(true)
    try {
      let resolvedClientId = bulkClientId
      if (showBulkNewClient && bulkNewClientName.trim()) {
        const { data: newClient, error: ce } = await supabase
          .from('clients').insert({ name: bulkNewClientName.trim() }).select('id').single()
        if (ce) throw ce
        resolvedClientId = newClient.id
        await cStore.fetchAll()
      }
      const updates: Partial<Domain> = {}
      if (resolvedClientId) updates.client_id  = resolvedClientId
      if (bulkProjectPn)    updates.project_pn = bulkProjectPn
      await Promise.all([...selected].map(id => store.updateDomain(id, updates)))
      toast('success', `Updated ${selected.size} domain${selected.size > 1 ? 's' : ''}`)
      setShowBulkEdit(false)
      clearSelection()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBulkSaving(false)
    }
  }

  async function handleBulkArchive() {
    try {
      await Promise.all([...selected].map(id => store.updateDomain(id, { archived: true })))
      toast('success', `Archived ${selected.size} domain${selected.size > 1 ? 's' : ''}`)
      clearSelection()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBulkArchiveOpen(false)
    }
  }

  async function handleBulkDelete() {
    try {
      await Promise.all([...selected].map(id => store.deleteDomain(id)))
      toast('success', `Deleted ${selected.size} domain${selected.size > 1 ? 's' : ''}`)
      clearSelection()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBulkDeleteOpen(false)
    }
  }

  function resetAddForm() {
    setClientId(''); setProjectPn(''); setContractId('')
    setNewClientName(''); setShowNewClient(false); setIsOwn(false)
    setDomainRows([{ domain_name: '', expiry_date: '', yearly_amount: '' }])
    setDomainError(null)
    setInvoicePlanMonth('')
    setInvoicePlanStatus(null)
  }

  // Single actions
  async function handleSave(keepOpen = false) {
    const valid = domainRows.filter(r => r.domain_name && r.expiry_date)
    if (!isOwn && !clientId && !showNewClient) { setDomainError('Select or create a client'); return }
    if (!isOwn && showNewClient && !newClientName.trim()) { setDomainError('Enter a client name'); return }
    if (valid.length === 0) { setDomainError('Add at least one domain with a name and expiry date'); return }
    setDomainError(null)
    setSaving(true)
    // Capture form state before any awaits (prevents async narrowing issues and survives resetAddForm)
    const planMonth  = invoicePlanMonth
    const planStatus = invoicePlanStatus
    try {
      let resolvedClientId = clientId
      if (!isOwn && showNewClient) {
        const { data: newClient, error: ce } = await supabase
          .from('clients').insert({ name: newClientName.trim() }).select('id').single()
        if (ce) throw ce
        resolvedClientId = newClient.id
        await cStore.fetchAll()
      }

      // Snapshot form rows so Step 2 can use isRenewal after resetAddForm clears domainRows
      setDomainRowsSnapshot([...valid])
      setInvoicePlanMonthSnap(planMonth)
      setInvoicePlanStatusSnap(planStatus)

      const inserted = await store.addDomains(isOwn ? null : (resolvedClientId ?? null), projectPn, valid.map(r => ({
        domain_name:     r.domain_name,
        expiry_date:     r.expiry_date,
        yearly_amount:   r.yearly_amount ? parseFloat(r.yearly_amount) : undefined,
        contract_id:     contractId || undefined,
        billable:        !isOwn,
      })))

      // Insert revenue_planner rows if invoice month was set
      let invoiceSuccess = false
      if (planMonth && planStatus) {
        try {
          const planRows = inserted.map(d => ({
            domain_id:      d.id,
            month:          planMonth + '-01',
            planned_amount: d.yearly_amount ?? null,
            actual_amount:  null,
            status:         planStatus,   // narrowed local const — not the state var
            probability:    100,
            notes:          null,
          }))
          const { error: pe } = await supabase.from('revenue_planner').insert(planRows)
          if (pe) throw pe
          const billingVal: 'planned' | 'billed' = planStatus === 'issued' ? 'billed' : 'planned'
          setDomainBillingStatus(prev => { const next = new Map(prev); inserted.forEach(d => next.set(d.id, billingVal)); return next })
          invoiceSuccess = true
        } catch (err) {
          toast('error', 'Domains saved but invoice planning failed: ' + (err as Error).message)
        }
      }

      toast('success', `${inserted.length} domain${inserted.length > 1 ? 's' : ''} added`)

      if (keepOpen) {
        resetAddForm()
      } else {
        // Go to Step 2
        setSavedDomains(inserted)
        setInvoicePlanned(invoiceSuccess && !!planMonth)
        setWizardStep(2)
        resetAddForm()
      }
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function closeWizard() {
    setShowAdd(false)
    setWizardStep(1)
    setSavedDomains([])
    setInvoicePlanned(false)
    setPaymentDays(30)
    setDomainRowsSnapshot([])
    setInvoicePlanMonthSnap('')
    setInvoicePlanStatusSnap(null)
    resetAddForm()
  }

  function buildSielEmail() {
    const names = savedDomains.map(d => `- ${d.domain_name}`).join('\n')
    return `Pozdravljeni,\n\nprosimo vas, da registrirate naslednje domene:\n\n${names}\n\nHvala in lep pozdrav,\nRenderspace`
  }

  function buildAccountingEmail() {
    const today = new Date()
    const dateStr = `${today.getDate()}. ${today.getMonth() + 1}. ${today.getFullYear()}`
    const header = `Stranka: ${savedDomains[0]?.client?.name ?? '—'}\nDatum storitve: ${dateStr}\nRok plačila: ${paymentDays} dni`
    const lines = savedDomains.map(d => {
      const verb = 'Zakup'
      const expiry = fmtSloDate(d.expiry_date)
      const amount = d.yearly_amount != null ? ` — ${d.yearly_amount} EUR` : ''
      return `${d.project_pn} — ${verb} domene ${d.domain_name} za 1 leto (velja do ${expiry})${amount}`
    }).join('\n')
    return `${header}\n\n${lines}`
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast('success', `${label} copied`))
  }

  async function handleSaveEdit() {
    if (!editDomain) return
    setSaving(true)
    try {
      await store.updateDomain(editDomain.id, {
        domain_name:   editDomain.domain_name,
        expiry_date:   editDomain.expiry_date,
        yearly_amount: editDomain.yearly_amount,
        project_pn:    editDomain.project_pn,
        contract_id:   editDomain.contract_id,
        registrar:     editDomain.registrar,
        auto_renew:    editDomain.auto_renew,
        notes:         editDomain.notes,
      })
      toast('success', 'Domain updated')
      setEditDomain(null)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(d: Domain) {
    try {
      await store.updateDomain(d.id, { archived: true })
      toast('success', `${d.domain_name} archived`)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setArchiveTarget(null)
    }
  }

  async function handleDelete(d: Domain) {
    try {
      await store.deleteDomain(d.id)
      toast('success', `${d.domain_name} deleted`)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setDeleteTarget(null)
    }
  }

  function openInvoiceDomain(d: Domain) {
    const now = new Date()
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    setInvoiceDomain(d)
    setInvoiceAmount(d.yearly_amount != null ? String(d.yearly_amount) : '')
    setInvoiceMonth(monthStr)
    setInvoiceDesc(`Domain renewal: ${d.domain_name}`)
  }

  async function saveInvoiceDomain() {
    if (!invoiceDomain) return
    setInvoiceSaving(true)
    try {
      const { error } = await supabase.from('revenue_planner').insert({
        domain_id: invoiceDomain.id,
        month: invoiceMonth + '-01',
        planned_amount: invoiceAmount ? parseFloat(invoiceAmount) : null,
        actual_amount: null,
        status: 'planned' as const,
        probability: 100,
        notes: invoiceDesc || null,
      })
      if (error) throw error
      toast('success', `Invoice planned for ${invoiceDomain.domain_name}`)
      setDomainBillingStatus(prev => { const next = new Map(prev); next.set(invoiceDomain.id, 'planned'); return next })
      setInvoiceDomain(null)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setInvoiceSaving(false)
    }
  }

  function exportExcel() {
    const rows = activeDomains.map(d => ({
      Domain:       d.domain_name,
      Client:       d.client?.name ?? '',
      'Project #':  d.project_pn ?? '',
      Expiry:       d.expiry_date,
      'Yearly (€)': d.yearly_amount ?? '',
      Status:       (() => { const days = daysUntil(d.expiry_date); return days < 0 ? 'Expired' : days <= 7 ? 'Critical' : days <= 30 ? 'Warning' : 'Active' })(),
      Notes:        d.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Domains')
    XLSX.writeFile(wb, `domains-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function exportPDF() {
    const { agencyLogo, agencyName } = settingsStore
    const logoHtml = buildLogoHtml(agencyLogo, agencyName)
    const today = new Date().toLocaleDateString('en-GB')

    const rows = activeDomains.map((d, i) => {
      const days = daysUntil(d.expiry_date)
      const bg = i % 2 === 0 ? '#ffffff' : '#fafaf9'
      const statusColor = days < 0 ? '#dc2626' : days <= 7 ? '#dc2626' : days <= 30 ? '#d97706' : '#16a34a'
      const statusBg    = days < 0 ? '#fff1f2' : days <= 7 ? '#fff1f2' : days <= 30 ? '#fffbeb' : '#f0fdf4'
      const statusLabel = days < 0 ? 'Expired' : days <= 7 ? `${days}d` : days <= 30 ? `${days}d` : 'Active'
      return `<tr>
        <td style="background:${bg};font-weight:600">${d.domain_name}</td>
        <td style="background:${bg};color:#6b7280">${d.client?.name ?? '—'}</td>
        <td style="background:${bg};color:#6b7280">${d.project_pn ?? '—'}</td>
        <td style="background:${bg}">${fmtDate(d.expiry_date)}</td>
        <td style="background:${bg};text-align:right;font-weight:700;color:#16a34a">${d.yearly_amount ? d.yearly_amount + ' €' : '—'}</td>
        <td style="background:${bg}"><span style="display:inline-block;padding:2px 7px;border-radius:99px;font-size:9px;font-weight:700;color:${statusColor};background:${statusBg}">${statusLabel}</span></td>
        <td style="background:${bg};color:#6b7280;font-size:9px">${d.notes ?? ''}</td>
      </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Figtree',sans-serif;background:#e8e8e5;color:#1a1a1a;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:210mm;min-height:297mm;margin:20px auto;padding:10mm 14mm;background:#fff;box-shadow:0 4px 40px rgba(0,0,0,.12)}
  @media print{body{background:#fff}.page{margin:0;box-shadow:none;width:210mm}}
  @page{size:A4 portrait;margin:0}
  .header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8mm;border-bottom:2px solid #E85C1A;padding-bottom:5mm}
  .doc-title{font-size:13px;font-weight:700;color:#1a1a1a;margin-top:3px}
  .meta{text-align:right;font-size:10px;color:#6b7280;line-height:1.7}
  .stats{display:flex;gap:12px;margin-bottom:6mm}
  .stat{background:#fafaf9;border:1px solid #e0e0dd;border-radius:6px;padding:6px 12px;flex:1;text-align:center}
  .stat-val{font-size:15px;font-weight:800;color:#1a1a1a}
  .stat-lbl{font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-top:1px}
  table{width:100%;border-collapse:collapse}
  th{background:#1a1a1a;color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;padding:5px 8px;text-align:left;white-space:nowrap}
  th.r{text-align:right}
  td{padding:5px 8px;border-bottom:1px solid #f0efed;font-size:10.5px;vertical-align:middle}
  .footer{margin-top:6mm;border-top:1px solid #e0e0dd;padding-top:3mm;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      ${logoHtml}
      <div class="doc-title">Domain Portfolio</div>
    </div>
    <div class="meta">
      <div>Exported ${today}</div>
      <div>support@renderspace.si</div>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-val">${activeDomains.length}</div><div class="stat-lbl">Active</div></div>
    <div class="stat"><div class="stat-val" style="color:#dc2626">${critical.length}</div><div class="stat-lbl">Critical</div></div>
    <div class="stat"><div class="stat-val" style="color:#d97706">${warningSoon.length}</div><div class="stat-lbl">Expiring Soon</div></div>
    <div class="stat"><div class="stat-val" style="color:#16a34a">${totalYearly.toLocaleString(undefined, { maximumFractionDigits: 0 })} €</div><div class="stat-lbl">Yearly Revenue</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Domain</th><th>Client</th><th>Project #</th><th>Expiry</th><th class="r">Yearly</th><th>Status</th><th>Notes</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <div>${agencyName || 'Renderspace'} · support@renderspace.si · +386 (1) 23 91 200</div>
    <div>${today}</div>
  </div>
</div>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`

    openHtmlAsPdf(html)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Domains</h1>
          <p>Domain expiry tracking &amp; renewals</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="min-w-[160px]">
            <Select
              value={clientFilter}
              onChange={setClientFilter}
              placeholder="All clients"
              options={[
                { value: '', label: 'All clients' },
                ...cStore.clients.map(c => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <div className="relative">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="absolute left-[9px] top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search domains…" value={search} onChange={e => setSearch(e.target.value)}
              className="pl-7 max-w-[160px] w-full h-[34px] text-[13px]" />
          </div>
          <Button variant="outline" size="sm" onClick={exportExcel}>Export Excel</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}>Export PDF</Button>
          {canEdit && <Button size="sm" onClick={() => setShowAdd(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Client Domains
          </Button>}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3 mb-4 px-6 pt-4">
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Total domains</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{activeDomains.length}</div>
          <div className="text-xs text-muted-foreground mt-1">active</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Yearly revenue</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{totalYearly > 0 ? fmtEur(totalYearly) : '—'}</div>
          <div className="text-xs text-muted-foreground mt-1">from domain renewals</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Critical</div>
          <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${critical.length > 0 ? 'text-[#dc2626]' : 'text-foreground'}`}>
            {critical.length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">expires ≤ 7 days</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Expiring soon</div>
          <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${warningSoon.length > 0 ? 'text-[#d97706]' : 'text-foreground'}`}>
            {warningSoon.length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">expires ≤ 30 days</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {store.error && (
          <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c] mb-3">Failed to load data. Please check your connection.</div>
        )}
        <div className="flex items-center justify-between mb-3">
          <h2>Active Domains <span className="text-xs" style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>· {filtered.length} domain{filtered.length !== 1 ? 's' : ''}</span></h2>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 px-[14px] py-[10px] bg-primary rounded-lg mb-2">
            <span className="text-[13px] font-semibold text-white mr-[6px]">{selected.size} selected</span>
            <Button size="sm" className="bg-white/15 border-white/20 text-white"
              onClick={() => { setBulkClientId(''); setBulkProjectPn(''); setShowBulkEdit(true) }}>
              Edit
            </Button>
            <Button size="sm" className="bg-white/15 border-white/20 text-white"
              onClick={() => setBulkArchiveOpen(true)}>
              Archive
            </Button>
            <Button size="sm" className="bg-[rgba(220,38,38,0.7)] border-[rgba(220,38,38,0.5)] text-white"
              onClick={() => setBulkDeleteOpen(true)}>
              Delete
            </Button>
            <button onClick={clearSelection}
              className="ml-auto bg-none border-none cursor-pointer text-[13px] text-white/50 px-1 font-[inherit]">
              ✕ Clear
            </button>
          </div>
        )}

        <Card>
          {filtered.length === 0 ? (
            <CardContent className="py-10 text-center">
              <div className="font-semibold text-muted-foreground mb-1">No domains tracked yet</div>
              <div className="text-sm text-muted-foreground">Add client domains to start monitoring expiry dates</div>
            </CardContent>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{width:36}}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="cursor-pointer w-[14px] h-[14px]" />
                  </th>
                  <th>Client</th>
                  <th>Domain</th>
                  <th style={{width:110}}>Project #</th>
                  <th style={{width:110}}>Contract ID</th>
                  <th className="text-right" style={{width:90}}>€/yr</th>
                  <th style={{width:110}}>Expiry</th>
                  <th style={{width:100}}>Status</th>
                  <th style={{width:100}}>Billing</th>
                  <th style={{width:120}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedActive.map((d: Domain) => (
                  <tr key={d.id} style={selected.has(d.id) ? {background:'#eef2ff'} : {}}>
                    <td>
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleRow(d.id)}
                        className="cursor-pointer w-[14px] h-[14px]" />
                    </td>
                    <td className="font-semibold">
                      {d.client?.name
                        ? d.client.name
                        : <span className="text-muted-foreground italic font-normal">own cost</span>}
                    </td>
                    <td className="font-bold text-[var(--c0)]">{d.domain_name}</td>
                    <td className="text-[13px] text-[#374151]">{d.project_pn ?? '—'}</td>
                    <td className="text-[13px] text-[#374151]">{d.contract_id ?? <span className="text-xs">—</span>}</td>
                    <td className="text-right font-bold">
                      {d.yearly_amount ? `${d.yearly_amount} €` : <span className="text-xs font-normal">—</span>}
                    </td>
                    <td className="text-[13px] text-[#374151]">{fmtDate(d.expiry_date)}</td>
                    <td><ExpiryBadge expiryDate={d.expiry_date} /></td>
                    <td>
                      {domainBillingStatus.get(d.id) === 'billed'
                        ? <Badge variant="green">Billed</Badge>
                        : domainBillingStatus.get(d.id) === 'planned'
                          ? <Badge variant="amber">In plan</Badge>
                          : daysUntil(d.expiry_date) <= 60
                            ? <Button variant="ghost" size="xs" onClick={() => openInvoiceDomain(d)} className="text-primary font-semibold">Invoice</Button>
                            : null}
                    </td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <Button variant="outline" size="xs" onClick={() => setEditDomain({ ...d })}>Edit</Button>
                        <Button variant="ghost" size="xs" onClick={() => setArchiveTarget(d)} title="Archive">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => setDeleteTarget(d)} title="Delete" className="text-[#dc2626]">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {totalYearly > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={7}></td>
                    <td></td>
                    <td className="text-right text-[10px] font-bold text-muted-foreground uppercase tracking-[0.6px] pr-2 whitespace-nowrap">Total / year</td>
                    <td className="text-right pr-4 text-[15px] font-extrabold text-primary whitespace-nowrap">{totalYearly.toFixed(0)} €</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          <Pagination page={activePage} total={filtered.length} perPage={ACTIVE_PER_PAGE} onChange={setActivePage} />
        </Card>

        {/* Archived domains */}
        <div className="flex items-center justify-between mb-3 mt-8">
          <h2>Archived Domains <span className="text-xs" style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>· {archivedDomains.length}</span></h2>
        </div>
        <Card>
          {archivedDomains.length === 0 ? (
            <CardContent className="py-7 text-center">
              <div className="text-sm text-muted-foreground">No archived domains</div>
            </CardContent>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Domain</th>
                  <th style={{width:90}}>Project #</th>
                  <th style={{width:110}}>Expiry</th>
                  <th className="text-right" style={{width:90}}>€/yr</th>
                  <th style={{width:80}}></th>
                </tr>
              </thead>
              <tbody>
                {pagedArchived.map(d => (
                  <tr key={d.id} style={{opacity:0.65}}>
                    <td className="font-semibold text-[#374151]">
                      {d.client?.name ?? <span className="italic text-muted-foreground font-normal">own cost</span>}
                    </td>
                    <td className="font-semibold text-[#374151]">{d.domain_name}</td>
                    <td className="text-[13px] text-[#374151]">{d.project_pn ?? '—'}</td>
                    <td className="text-[13px] text-muted-foreground">{fmtDate(d.expiry_date)}</td>
                    <td className="text-right text-muted-foreground">
                      {d.yearly_amount ? `${d.yearly_amount} €` : <span className="text-xs">—</span>}
                    </td>
                    <td>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeleteTarget(d)} title="Delete permanently">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination page={archivePage} total={archivedDomains.length} perPage={ARCHIVE_PER_PAGE} onChange={setArchivePage} />
        </Card>
      </div>

      {/* ── Add domains modal ── */}
      <Modal open={showAdd} title={wizardStep === 1 ? 'Add Client Domains' : 'Next steps'} maxWidth={720} onClose={closeWizard}
        footer={
          wizardStep === 1 ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setShowAdd(false); resetAddForm() }}>Cancel</Button>
              <Button variant="outline" size="sm" onClick={() => handleSave(true)} disabled={saving}>Save &amp; add new</Button>
              <Button size="sm" onClick={() => handleSave(false)} disabled={saving}>
                {saving ? <span className="spinner"/> : null} Save › Next step
              </Button>
            </>
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-muted-foreground">Kopirajte kar potrebujete, nato zaprite</span>
              <Button size="sm" onClick={closeWizard}>Done</Button>
            </div>
          )
        }>

        {wizardStep === 1 ? (
          <>
            {domainError && <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c] mb-3">{domainError}</div>}

            {/* Own agency domain toggle */}
            <label className="flex items-center gap-2 cursor-pointer mb-3 text-[13px] font-medium text-[var(--c1)]">
              <input
                type="checkbox"
                checked={isOwn}
                onChange={e => { setIsOwn(e.target.checked); setClientId(''); setShowNewClient(false) }}
                className="w-[15px] h-[15px] cursor-pointer"
              />
              This is our agency domain
              {settingsStore.agencyName && (
                <span className="text-xs text-muted-foreground ml-1">({settingsStore.agencyName}) — will be set as non-billable</span>
              )}
            </label>

            {/* Client */}
            {!isOwn && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-[6px]">
                <label className="form-label" style={{marginBottom:0}}>Client</label>
                <button type="button" onClick={() => { setShowNewClient(!showNewClient); setClientId('') }}
                  className="bg-none border-none cursor-pointer text-xs text-primary font-semibold p-0 font-[inherit]">
                  {showNewClient ? '← Pick existing' : '+ New client'}
                </button>
              </div>
              {showNewClient ? (
                <input placeholder="Enter new client name" value={newClientName} onChange={e => setNewClientName(e.target.value)} autoFocus />
              ) : (
                <Select
                  value={clientId}
                  onChange={setClientId}
                  placeholder="Select client"
                  options={cStore.clients.map(c => ({ value: c.id, label: c.name }))}
                />
              )}
            </div>
            )}

            {/* Project # + Contract ID */}
            <div className="grid grid-cols-2 gap-4 mb-[14px]">
              <div className="form-group">
                <label className="form-label">Project #</label>
                <input placeholder="e.g. 1159" value={projectPn} onChange={e => setProjectPn(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Contract / Order ID <span className="form-hint" style={{display:'inline'}}>optional</span></label>
                <input placeholder="e.g. PO-2026-042" value={contractId} onChange={e => setContractId(e.target.value)} />
              </div>
            </div>

            {/* Domains */}
            <div className="border-t border-border pt-[14px]">
              <p className="m-0 mb-[10px] font-bold text-[15px] text-[var(--c0)]">Domains</p>
              <DomainRowInputs rows={domainRows} onChange={setDomainRows} />
            </div>

            {/* Billing */}
            <div className="border-t border-border pt-[14px] mt-[14px]">
              <p className="m-0 mb-3 font-bold text-[13px] text-[var(--c0)]">
                Billing <span className="font-normal text-[11px] text-muted-foreground">— optional</span>
              </p>
              <label className="flex items-center gap-2 cursor-pointer mb-3 text-[13px] font-medium">
                <input
                  type="checkbox"
                  checked={invoicePlanStatus === 'issued'}
                  onChange={e => {
                    setInvoicePlanStatus(e.target.checked ? 'issued' : 'planned')
                    if (!invoicePlanMonth) {
                      const now = new Date()
                      setInvoicePlanMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
                    }
                  }}
                  className="w-[15px] h-[15px]"
                />
                Already billed
              </label>
              {invoicePlanStatus === 'issued' ? (
                <div className="mb-0 max-w-[200px]">
                  <label className="form-label">Billed in which month?</label>
                  <input type="month" value={invoicePlanMonth} onChange={e => setInvoicePlanMonth(e.target.value)} />
                </div>
              ) : (
                <div>
                  <div className="mb-0 max-w-[200px]">
                    <label className="form-label">Add to invoice month</label>
                    <input
                      type="month"
                      value={invoicePlanMonth}
                      onChange={e => {
                        setInvoicePlanMonth(e.target.value)
                        if (!invoicePlanStatus) setInvoicePlanStatus('planned')
                      }}
                    />
                  </div>
                  {!invoicePlanMonth && (
                    <p className="mt-[6px] mb-0 text-[11px] text-muted-foreground">Leave empty to skip — you can invoice from the table later.</p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <Step2Panel
            savedDomains={savedDomains}
            invoicePlanned={invoicePlanned}
            invoicePlanMonth={invoicePlanMonthSnap}
            invoicePlanStatus={invoicePlanStatusSnap}
            paymentDays={paymentDays}
            onPaymentDaysChange={setPaymentDays}
            sielEmail={buildSielEmail()}
            accountingEmail={buildAccountingEmail()}
            onCopy={copyText}
          />
        )}
      </Modal>

      {/* ── Edit domain modal (single) ── */}
      {editDomain && (
        <Modal open={!!editDomain} title="Edit Domain" onClose={() => setEditDomain(null)}
          footer={<>
            <Button variant="outline" size="sm" onClick={() => setEditDomain(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={saving}>{saving ? <span className="spinner"/> : null} Save</Button>
          </>}>
          <div className="grid grid-cols-2 gap-4 mb-[14px]">
            <div className="form-group">
              <label className="form-label">Domain name</label>
              <input value={editDomain.domain_name} onChange={e => setEditDomain(d => d ? {...d, domain_name: e.target.value} : d)} />
            </div>
            <div className="form-group">
              <label className="form-label">Expiry date</label>
              <input type="text" value={isoToDMY(editDomain.expiry_date)} readOnly className="bg-[var(--c7)] text-muted-foreground cursor-not-allowed" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-[14px]">
            <div className="form-group">
              <label className="form-label">Client</label>
              <input value={editDomain.client?.name ?? '— own cost —'} readOnly className="bg-[var(--c7)] text-muted-foreground cursor-not-allowed" />
            </div>
            <div className="form-group">
              <label className="form-label">Project #</label>
              <input placeholder="e.g. RS-2026-001" value={editDomain.project_pn ?? ''} onChange={e => setEditDomain(d => d ? {...d, project_pn: e.target.value} : d)} />
            </div>
          </div>
          <div className="mb-[14px]">
            <label className="form-label">€ / year</label>
            <input type="number" value={editDomain.yearly_amount ?? ''} readOnly className="bg-[var(--c7)] text-muted-foreground cursor-not-allowed" />
          </div>
          <div className="mb-[14px]">
            <label className="form-label">Contract / Order ID</label>
            <input value={editDomain.contract_id ?? ''} onChange={e => setEditDomain(d => d ? {...d, contract_id: e.target.value || null} : d)} />
          </div>
        </Modal>
      )}

      {/* ── Bulk edit modal ── */}
      <Modal open={showBulkEdit} title={`Edit ${selected.size} domain${selected.size > 1 ? 's' : ''}`}
        maxWidth={440}
        onClose={() => setShowBulkEdit(false)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setShowBulkEdit(false)}>Cancel</Button>
          <Button size="sm" onClick={handleBulkEdit} disabled={bulkSaving}>
            {bulkSaving ? <span className="spinner"/> : null} Apply to all
          </Button>
        </>}>
        <p className="m-0 mb-4 text-[13px] text-muted-foreground">Only filled fields will be updated. Leave blank to keep existing values.</p>
        <div className="mb-[14px]">
          <label className="form-label flex items-center justify-between">
            Set client
            <Button variant="ghost" size="xs" className="px-1 font-medium"
              onClick={() => { setShowBulkNewClient(!showBulkNewClient); setBulkClientId('') }}>
              {showBulkNewClient ? '← Pick existing' : '+ New client'}
            </Button>
          </label>
          {showBulkNewClient ? (
            <input placeholder="Client name" value={bulkNewClientName} onChange={e => setBulkNewClientName(e.target.value)} autoFocus />
          ) : (
            <Select
              value={bulkClientId}
              onChange={setBulkClientId}
              placeholder="— keep existing —"
              options={cStore.clients.map(c => ({ value: c.id, label: c.name }))}
            />
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Set project #</label>
          <input placeholder="e.g. 1159" value={bulkProjectPn} onChange={e => setBulkProjectPn(e.target.value)} />
        </div>
      </Modal>

      {/* ── Single confirm modals ── */}
      <ConfirmDialog
        open={!!archiveTarget}
        title="Archive domain"
        message={`Archive ${archiveTarget?.domain_name ?? ''}? Past invoices in the Revenue Planner and Statistics will be preserved. The domain will no longer appear as active or be billed going forward.`}
        confirmLabel="Archive"
        onConfirm={() => archiveTarget && handleArchive(archiveTarget)}
        onCancel={() => setArchiveTarget(null)}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete domain"
        message={`Permanently delete ${deleteTarget?.domain_name ?? ''}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Domain renewal invoice modal ── */}
      <Modal
        open={!!invoiceDomain}
        title={`Issue Invoice — ${invoiceDomain?.domain_name ?? ''}`}
        onClose={() => setInvoiceDomain(null)}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => setInvoiceDomain(null)}>Cancel</Button>
          <Button size="sm" onClick={saveInvoiceDomain} disabled={invoiceSaving || !invoiceMonth}>
            {invoiceSaving ? 'Saving…' : 'Add to Invoice Plan'}
          </Button>
        </>}
      >
        {invoiceDomain && (
          <>
            {invoiceDomain.client && (
              <div className="mb-3 text-[13px] text-[#374151]">
                Client: <strong>{invoiceDomain.client.name}</strong>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="form-group">
                <label className="form-label">Month</label>
                <input type="month" value={invoiceMonth} onChange={e => setInvoiceMonth(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Amount (€)</label>
                <input type="number" value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input value={invoiceDesc} onChange={e => setInvoiceDesc(e.target.value)} />
            </div>
          </>
        )}
      </Modal>

      {/* ── Bulk confirm modals ── */}
      <ConfirmDialog
        open={bulkArchiveOpen}
        title="Archive domains"
        message={`Archive ${selected.size} domain${selected.size > 1 ? 's' : ''}? Past invoices will be preserved. Domains will no longer be billed going forward.`}
        confirmLabel="Archive all"
        onConfirm={handleBulkArchive}
        onCancel={() => setBulkArchiveOpen(false)}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        title="Delete domains"
        message={`Permanently delete ${selected.size} domain${selected.size > 1 ? 's' : ''}? This cannot be undone.`}
        confirmLabel="Delete all"
        onConfirm={handleBulkDelete}
        onCancel={() => setBulkDeleteOpen(false)}
      />
    </div>
  )
}
