import { useEffect, useState } from 'react'
import { useDomainsStore } from '../stores/domains'
import { useClientsStore } from '../stores/clients'
import { useSettingsStore } from '../stores/settings'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { Domain } from '../lib/types'
import { Select } from '../components/Select'


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
    <div style={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4,padding:'12px 16px 4px'}}>
      <span style={{fontSize:12,color:'var(--c3)',marginRight:8}}>{((page-1)*perPage)+1}–{Math.min(page*perPage,total)} of {total}</span>
      <button className="btn btn-ghost btn-xs" disabled={page === 1} onClick={() => onChange(page - 1)}>‹ Prev</button>
      {Array.from({length: pages}, (_, i) => i + 1).map(p => (
        <button key={p} className="btn btn-xs" onClick={() => onChange(p)}
          style={p === page ? {background:'var(--navy)',color:'#fff',borderColor:'var(--navy)'} : {}}>
          {p}
        </button>
      ))}
      <button className="btn btn-ghost btn-xs" disabled={page === pages} onClick={() => onChange(page + 1)}>Next ›</button>
    </div>
  )
}

function ExpiryBadge({ expiryDate }: { expiryDate: string }) {
  const days = daysUntil(expiryDate)
  if (days < 0)   return <span className="badge badge-red">Expired</span>
  if (days <= 7)  return <span className="badge badge-red">Expires in {days}d</span>
  if (days <= 30) return <span className="badge badge-amber">Expires in {days}d</span>
  return <span className="badge badge-green">Active</span>
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
      <div style={{display:'grid',gridTemplateColumns:cols,gap:'4px 10px',marginBottom:6,paddingBottom:4,borderBottom:'1px solid var(--c6)'}}>
        <span className="form-label" style={{margin:0}}>Domain</span>
        <span className="form-label" style={{margin:0}}>Expiry date</span>
        <span className="form-label" style={{margin:0}}>€ / year</span>
        <span></span>
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{display:'grid',gridTemplateColumns:cols,gap:'6px 10px',alignItems:'center',marginBottom:8}}>
          <input value={row.domain_name} onChange={e => update(i,'domain_name',e.target.value)} placeholder="example.si" style={{height:36}} />
          <input type="date" lang="en-GB" value={row.expiry_date} onChange={e => update(i,'expiry_date',e.target.value)} style={{height:36,width:'100%'}} />
          <input type="number" value={row.yearly_amount} onChange={e => update(i,'yearly_amount',e.target.value)} placeholder="25" style={{height:36}} />
          <button onClick={() => remove(i)} disabled={rows.length === 1}
            style={{width:32,height:36,border:'1px solid var(--c6)',borderRadius:6,background:'#fff',cursor:'pointer',color:'var(--c4)',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',lineHeight:1}}>×</button>
        </div>
      ))}
      <button className="btn btn-ghost btn-xs" onClick={add} style={{marginTop:4}}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add domain
      </button>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ open, title, maxWidth = 580, onClose, children, footer }: {
  open: boolean; title: string; maxWidth?: number
  onClose: () => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth }}>
        <div className="modal-header"><h2>{title}</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// ── Confirm popup ─────────────────────────────────────────────────────────────

function ConfirmModal({ open, title, message, confirmLabel, danger, onConfirm, onClose }: {
  open: boolean; title: string; message: string; confirmLabel: string; danger?: boolean
  onConfirm: () => void; onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <div className="modal-header"><h2>{title}</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <p style={{margin:0,fontSize:14,color:'var(--c1)'}}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-sm btn-primary"
            style={danger ? {background:'var(--red)',borderColor:'var(--red)'} : {}}
            onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
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
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
        <span style={{fontSize:12,color:'var(--c3)',background:'var(--c7)',padding:'3px 10px',borderRadius:20}}>Step 2 of 2</span>
      </div>

      {/* Success banner */}
      <div style={{display:'flex',alignItems:'center',gap:10,background:'#e8f5e9',border:'1px solid #c8e6c9',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#2e7d32',fontWeight:600}}>
        <span>✓</span>
        <span>{savedDomains.length} domain{savedDomains.length > 1 ? 's' : ''} saved — {domainNames}</span>
        {invoicePlanned && (
          <span className="badge badge-green" style={{marginLeft:'auto'}}>{statusLabel}: {monthLabel}</span>
        )}
      </div>

      {/* Invoice summary */}
      {invoicePlanned && (
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'#f0f4ff',border:'1px solid #d0d8f0',borderRadius:8,marginBottom:14,fontSize:13}}>
          {'📅'} <span>Dodano v plan računov za <strong>{monthLabel}</strong> · {fmtEur(savedDomains.reduce((s, d) => s + (d.yearly_amount ?? 0), 0))} · <strong>{statusLabel}</strong></span>
        </div>
      )}

      {/* Siel email */}
      <div style={{border:'1px solid var(--c6)',borderRadius:8,marginBottom:12,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'var(--c7)',borderBottom:'1px solid var(--c6)'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--c3)'}}>Naročilo — Siel</div>
            <div style={{fontSize:12,color:'var(--c1)',fontWeight:600}}>registrar@siel.si</div>
          </div>
          <button className="btn btn-secondary btn-xs" onClick={() => onCopy(sielEmail, 'Siel email')}>Copy</button>
        </div>
        <pre style={{margin:0,padding:'12px 14px',fontSize:12,lineHeight:1.7,color:'var(--c1)',fontFamily:'inherit',whiteSpace:'pre-wrap',background:'#fff'}}>{sielEmail}</pre>
      </div>

      {/* Accounting email */}
      <div style={{border:'1px solid var(--c6)',borderRadius:8,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'var(--c7)',borderBottom:'1px solid var(--c6)'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--c3)'}}>Obvestilo — računovodstvo</div>
            <div style={{fontSize:12,color:'var(--c1)',fontWeight:600}}>fakturiranje@pristop.si</div>
          </div>
          <button className="btn btn-secondary btn-xs" onClick={() => onCopy(accountingEmail, 'Accounting email')}>Copy</button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderBottom:'1px solid var(--c6)',background:'#fafbfd'}}>
          <span style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.4px',color:'var(--c3)'}}>Rok plačila (dni):</span>
          <input
            type="number"
            value={paymentDays}
            onChange={e => onPaymentDaysChange(Number(e.target.value) || 30)}
            style={{width:60,height:28,textAlign:'center',fontSize:13,fontWeight:600}}
          />
          <span style={{fontSize:11,color:'var(--c4)'}}>— spremenite pred kopiranjem</span>
        </div>
        <pre style={{margin:0,padding:'12px 14px',fontSize:12,lineHeight:1.7,color:'var(--c1)',fontFamily:'inherit',whiteSpace:'pre-wrap',background:'#fff'}}>{accountingEmail}</pre>
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function DomainsView() {
  const store   = useDomainsStore()
  const cStore  = useClientsStore()
  const settingsStore = useSettingsStore()
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

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Domains</h1>
          <p>Domain expiry tracking &amp; renewals</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={{minWidth:160}}>
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
          <div style={{position:'relative'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'var(--c4)',pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search domains…" value={search} onChange={e => setSearch(e.target.value)}
              style={{paddingLeft:28,maxWidth:160,width:'100%',height:34,fontSize:13}} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Client Domains
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="stats-strip" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="stat-card" style={{'--left-color':'var(--navy)'} as React.CSSProperties}>
          <div className="stat-card-label">Total domains</div>
          <div className="stat-card-value">{activeDomains.length}</div>
          <div className="stat-card-sub">active</div>
        </div>
        <div className="stat-card" style={{'--left-color':'var(--green)'} as React.CSSProperties}>
          <div className="stat-card-label">Yearly revenue</div>
          <div className="stat-card-value">{totalYearly > 0 ? fmtEur(totalYearly) : '—'}</div>
          <div className="stat-card-sub">from domain renewals</div>
        </div>
        <div className="stat-card" style={{'--left-color': critical.length > 0 ? 'var(--red)' : 'var(--c5)'} as React.CSSProperties}>
          <div className="stat-card-label">Critical</div>
          <div className="stat-card-value" style={{color: critical.length > 0 ? 'var(--red)' : undefined}}>
            {critical.length}
          </div>
          <div className="stat-card-sub">expires ≤ 7 days</div>
        </div>
        <div className="stat-card" style={{'--left-color': warningSoon.length > 0 ? 'var(--amber)' : 'var(--c5)'} as React.CSSProperties}>
          <div className="stat-card-label">Expiring soon</div>
          <div className="stat-card-value" style={{color: warningSoon.length > 0 ? 'var(--amber)' : undefined}}>
            {warningSoon.length}
          </div>
          <div className="stat-card-sub">expires ≤ 30 days</div>
        </div>
      </div>

      <div className="page-content">
        {store.error && (
          <div className="alert alert-red" style={{marginBottom:12}}>Failed to load data. Please check your connection.</div>
        )}
        <div className="section-bar">
          <h2>Active Domains <span className="text-xs" style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>· {filtered.length} domain{filtered.length !== 1 ? 's' : ''}</span></h2>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'var(--navy)',borderRadius:8,marginBottom:8}}>
            <span style={{fontSize:13,fontWeight:600,color:'#fff',marginRight:6}}>{selected.size} selected</span>
            <button className="btn btn-sm" style={{background:'rgba(255,255,255,0.15)',borderColor:'rgba(255,255,255,0.2)',color:'#fff'}}
              onClick={() => { setBulkClientId(''); setBulkProjectPn(''); setShowBulkEdit(true) }}>
              Edit
            </button>
            <button className="btn btn-sm" style={{background:'rgba(255,255,255,0.15)',borderColor:'rgba(255,255,255,0.2)',color:'#fff'}}
              onClick={() => setBulkArchiveOpen(true)}>
              Archive
            </button>
            <button className="btn btn-sm" style={{background:'rgba(220,38,38,0.7)',borderColor:'rgba(220,38,38,0.5)',color:'#fff'}}
              onClick={() => setBulkDeleteOpen(true)}>
              Delete
            </button>
            <button onClick={clearSelection}
              style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',fontSize:13,color:'rgba(255,255,255,0.5)',padding:'0 4px',fontFamily:'inherit'}}>
              ✕ Clear
            </button>
          </div>
        )}

        <div className="card">
          {filtered.length === 0 ? (
            <div style={{padding:'40px 20px',textAlign:'center',color:'var(--c4)'}}>
              <div style={{fontWeight:600,color:'var(--c3)',marginBottom:4}}>No domains tracked yet</div>
              <div className="text-sm">Add client domains to start monitoring expiry dates</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{width:36}}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      style={{cursor:'pointer',width:14,height:14}} />
                  </th>
                  <th>Client</th>
                  <th>Domain</th>
                  <th style={{width:110}}>Project #</th>
                  <th style={{width:110}}>Contract ID</th>
                  <th className="th-right" style={{width:90}}>€/yr</th>
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
                        style={{cursor:'pointer',width:14,height:14}} />
                    </td>
                    <td style={{fontWeight:600}}>
                      {d.client?.name
                        ? d.client.name
                        : <span style={{color:'var(--c4)',fontStyle:'italic',fontWeight:400}}>own cost</span>}
                    </td>
                    <td style={{fontWeight:700,color:'var(--c0)'}}>{d.domain_name}</td>
                    <td style={{fontSize:13,color:'var(--c2)'}}>{d.project_pn ?? '—'}</td>
                    <td style={{fontSize:13,color:'var(--c2)'}}>{d.contract_id ?? <span className="text-xs">—</span>}</td>
                    <td className="td-right text-mono" style={{fontWeight:700}}>
                      {d.yearly_amount ? `${d.yearly_amount} €` : <span className="text-xs" style={{fontWeight:400}}>—</span>}
                    </td>
                    <td style={{fontSize:13,color:'var(--c2)'}}>{fmtDate(d.expiry_date)}</td>
                    <td><ExpiryBadge expiryDate={d.expiry_date} /></td>
                    <td>
                      {domainBillingStatus.get(d.id) === 'billed'
                        ? <span className="badge badge-green">Billed</span>
                        : domainBillingStatus.get(d.id) === 'planned'
                          ? <span className="badge badge-amber">In plan</span>
                          : daysUntil(d.expiry_date) <= 60
                            ? <button className="btn btn-ghost btn-xs" onClick={() => openInvoiceDomain(d)} style={{color:'var(--navy)',fontWeight:600}}>Invoice</button>
                            : null}
                    </td>
                    <td>
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                        <button className="btn btn-secondary btn-xs" onClick={() => setEditDomain({ ...d })}>Edit</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => setArchiveTarget(d)} title="Archive">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                        </button>
                        <button className="btn btn-ghost btn-xs" onClick={() => setDeleteTarget(d)} title="Delete" style={{color:'var(--red)'}}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
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
                    <td style={{textAlign:'right',fontSize:10,fontWeight:700,color:'var(--c3)',textTransform:'uppercase',letterSpacing:'0.6px',paddingRight:8}}>Total / year</td>
                    <td className="td-right text-mono" style={{fontSize:15,fontWeight:800,color:'var(--navy)',paddingRight:16}}>{totalYearly.toFixed(0)} €</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          <Pagination page={activePage} total={filtered.length} perPage={ACTIVE_PER_PAGE} onChange={setActivePage} />
        </div>

        {/* Archived domains */}
        <div className="section-bar" style={{marginTop:32}}>
          <h2>Archived Domains <span className="text-xs" style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>· {archivedDomains.length}</span></h2>
        </div>
        <div className="card">
          {archivedDomains.length === 0 ? (
            <div style={{padding:'28px 20px',textAlign:'center',color:'var(--c4)'}}>
              <div className="text-sm">No archived domains</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Domain</th>
                  <th style={{width:90}}>Project #</th>
                  <th style={{width:110}}>Expiry</th>
                  <th className="th-right" style={{width:90}}>€/yr</th>
                  <th style={{width:80}}></th>
                </tr>
              </thead>
              <tbody>
                {pagedArchived.map(d => (
                  <tr key={d.id} style={{opacity:0.65}}>
                    <td style={{fontWeight:600,color:'var(--c2)'}}>
                      {d.client?.name ?? <span style={{fontStyle:'italic',color:'var(--c4)',fontWeight:400}}>own cost</span>}
                    </td>
                    <td style={{fontWeight:600,color:'var(--c2)'}}>{d.domain_name}</td>
                    <td style={{fontSize:13,color:'var(--c2)'}}>{d.project_pn ?? '—'}</td>
                    <td style={{fontSize:13,color:'var(--c3)'}}>{fmtDate(d.expiry_date)}</td>
                    <td className="td-right text-mono" style={{color:'var(--c3)'}}>
                      {d.yearly_amount ? `${d.yearly_amount} €` : <span className="text-xs">—</span>}
                    </td>
                    <td>
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                        <button className="btn btn-ghost btn-xs" style={{color:'var(--red)'}} onClick={() => setDeleteTarget(d)} title="Delete permanently">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination page={archivePage} total={archivedDomains.length} perPage={ARCHIVE_PER_PAGE} onChange={setArchivePage} />
        </div>
      </div>

      {/* ── Add domains modal ── */}
      <Modal open={showAdd} title={wizardStep === 1 ? 'Add Client Domains' : 'Next steps'} maxWidth={720} onClose={closeWizard}
        footer={
          wizardStep === 1 ? (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => { setShowAdd(false); resetAddForm() }}>Cancel</button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleSave(true)} disabled={saving}>Save &amp; add new</button>
              <button className="btn btn-primary btn-sm" onClick={() => handleSave(false)} disabled={saving}>
                {saving ? <span className="spinner"/> : null} Save › Next step
              </button>
            </>
          ) : (
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%'}}>
              <span style={{fontSize:12,color:'var(--c4)'}}>Kopirajte kar potrebujete, nato zaprite</span>
              <button className="btn btn-primary btn-sm" onClick={closeWizard}>Done</button>
            </div>
          )
        }>

        {wizardStep === 1 ? (
          <>
            {domainError && <div className="alert alert-red" style={{marginBottom:12}}>{domainError}</div>}

            {/* Own agency domain toggle */}
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:12,fontSize:13,fontWeight:500,color:'var(--c1)'}}>
              <input
                type="checkbox"
                checked={isOwn}
                onChange={e => { setIsOwn(e.target.checked); setClientId(''); setShowNewClient(false) }}
                style={{width:15,height:15,cursor:'pointer'}}
              />
              This is our agency domain
              {settingsStore.agencyName && (
                <span className="form-hint" style={{fontSize:11,marginLeft:4}}>({settingsStore.agencyName}) — will be set as non-billable</span>
              )}
            </label>

            {/* Client */}
            {!isOwn && (
            <div className="form-group" style={{marginBottom:12}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                <label className="form-label" style={{marginBottom:0}}>Client</label>
                <button type="button" onClick={() => { setShowNewClient(!showNewClient); setClientId('') }}
                  style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--navy)',fontWeight:600,padding:0,fontFamily:'inherit'}}>
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
            <div className="form-row" style={{marginBottom:14}}>
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
            <div style={{borderTop:'1px solid var(--c6)',paddingTop:14}}>
              <p style={{margin:'0 0 10px',fontWeight:700,fontSize:15,color:'var(--c0)'}}>Domains</p>
              <DomainRowInputs rows={domainRows} onChange={setDomainRows} />
            </div>

            {/* Billing */}
            <div style={{borderTop:'1px solid var(--c6)',paddingTop:14,marginTop:14}}>
              <p style={{margin:'0 0 12px',fontWeight:700,fontSize:13,color:'var(--c0)'}}>
                Billing <span style={{fontWeight:400,fontSize:11,color:'var(--c4)'}}>— optional</span>
              </p>
              <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:12,fontSize:13,fontWeight:500}}>
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
                  style={{width:15,height:15}}
                />
                Already billed
              </label>
              {invoicePlanStatus === 'issued' ? (
                <div className="form-group" style={{marginBottom:0,maxWidth:200}}>
                  <label className="form-label">Billed in which month?</label>
                  <input type="month" value={invoicePlanMonth} onChange={e => setInvoicePlanMonth(e.target.value)} />
                </div>
              ) : (
                <div>
                  <div className="form-group" style={{marginBottom:0,maxWidth:200}}>
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
                    <p style={{margin:'6px 0 0',fontSize:11,color:'var(--c4)'}}>Leave empty to skip — you can invoice from the table later.</p>
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
            <button className="btn btn-secondary btn-sm" onClick={() => setEditDomain(null)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={saving}>{saving ? <span className="spinner"/> : null} Save</button>
          </>}>
          <div className="form-row" style={{marginBottom:14}}>
            <div className="form-group">
              <label className="form-label">Domain name</label>
              <input value={editDomain.domain_name} onChange={e => setEditDomain(d => d ? {...d, domain_name: e.target.value} : d)} />
            </div>
            <div className="form-group">
              <label className="form-label">Expiry date</label>
              <input type="text" value={isoToDMY(editDomain.expiry_date)} readOnly style={{background:'var(--c7)',color:'var(--c3)',cursor:'not-allowed'}} />
            </div>
          </div>
          <div className="form-row" style={{marginBottom:14}}>
            <div className="form-group">
              <label className="form-label">Client</label>
              <input value={editDomain.client?.name ?? '— own cost —'} readOnly style={{background:'var(--c7)',color:'var(--c3)',cursor:'not-allowed'}} />
            </div>
            <div className="form-group">
              <label className="form-label">Project #</label>
              <input placeholder="e.g. RS-2026-001" value={editDomain.project_pn ?? ''} onChange={e => setEditDomain(d => d ? {...d, project_pn: e.target.value} : d)} />
            </div>
          </div>
          <div className="form-group" style={{marginBottom:14}}>
            <label className="form-label">€ / year</label>
            <input type="number" value={editDomain.yearly_amount ?? ''} readOnly style={{background:'var(--c7)',color:'var(--c3)',cursor:'not-allowed'}} />
          </div>
          <div className="form-group" style={{marginBottom:14}}>
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
          <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkEdit(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleBulkEdit} disabled={bulkSaving}>
            {bulkSaving ? <span className="spinner"/> : null} Apply to all
          </button>
        </>}>
        <p style={{margin:'0 0 16px',fontSize:13,color:'var(--c3)'}}>Only filled fields will be updated. Leave blank to keep existing values.</p>
        <div className="form-group" style={{marginBottom:14}}>
          <label className="form-label" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            Set client
            <button type="button" className="btn btn-ghost btn-xs" style={{padding:'0 4px',fontWeight:500}}
              onClick={() => { setShowBulkNewClient(!showBulkNewClient); setBulkClientId('') }}>
              {showBulkNewClient ? '← Pick existing' : '+ New client'}
            </button>
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
      <ConfirmModal
        open={!!archiveTarget}
        title="Archive domain"
        message={`Archive ${archiveTarget?.domain_name ?? ''}? Past invoices in the Revenue Planner and Statistics will be preserved. The domain will no longer appear as active or be billed going forward.`}
        confirmLabel="Archive"
        onConfirm={() => archiveTarget && handleArchive(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
      />
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete domain"
        message={`Permanently delete ${deleteTarget?.domain_name ?? ''}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      />

      {/* ── Domain renewal invoice modal ── */}
      <Modal
        open={!!invoiceDomain}
        title={`Issue Invoice — ${invoiceDomain?.domain_name ?? ''}`}
        onClose={() => setInvoiceDomain(null)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setInvoiceDomain(null)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={saveInvoiceDomain} disabled={invoiceSaving || !invoiceMonth}>
            {invoiceSaving ? 'Saving…' : 'Add to Invoice Plan'}
          </button>
        </>}
      >
        {invoiceDomain && (
          <>
            {invoiceDomain.client && (
              <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--c2)' }}>
                Client: <strong>{invoiceDomain.client.name}</strong>
              </div>
            )}
            <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
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
      <ConfirmModal
        open={bulkArchiveOpen}
        title="Archive domains"
        message={`Archive ${selected.size} domain${selected.size > 1 ? 's' : ''}? Past invoices will be preserved. Domains will no longer be billed going forward.`}
        confirmLabel="Archive all"
        onConfirm={handleBulkArchive}
        onClose={() => setBulkArchiveOpen(false)}
      />
      <ConfirmModal
        open={bulkDeleteOpen}
        title="Delete domains"
        message={`Permanently delete ${selected.size} domain${selected.size > 1 ? 's' : ''}? This cannot be undone.`}
        confirmLabel="Delete all"
        danger
        onConfirm={handleBulkDelete}
        onClose={() => setBulkDeleteOpen(false)}
      />
    </div>
  )
}
