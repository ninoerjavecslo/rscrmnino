import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAutomationsStore } from '../stores/automations'
import { useRemindersStore } from '../stores/reminders'
import { toast } from '../lib/toast'
import type { Automation, AutomationItem, ReminderRule } from '../lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SLO_MONTHS = [
  'januar', 'februar', 'marec', 'april', 'maj', 'junij',
  'julij', 'avgust', 'september', 'oktober', 'november', 'december',
]

function renderDesc(template: string, month: string): string {
  const [year, m] = month.split('-')
  return template
    .replace(/\{month\}/g, SLO_MONTHS[parseInt(m, 10) - 1])
    .replace(/\{year\}/g, year)
}

function fmtEuro(n: number): string {
  return n.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function ordinal(n: number): string {
  return `${n}.`
}

function currentMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function buildEmailText(automation: Automation, items: AutomationItem[], month: string): string {
  const [year, m] = month.split('-')
  const monthName = SLO_MONTHS[parseInt(m, 10) - 1]
  const header = `${automation.name}\nMesec: ${monthName} | Leto: ${year}\n`
  const sep = '─'.repeat(80)
  const msgPart = automation.message ? `\n${automation.message}\n` : ''

  const clientMap = new Map<string, AutomationItem[]>()
  for (const item of items) {
    const key = item.client_id
    if (!clientMap.has(key)) clientMap.set(key, [])
    clientMap.get(key)!.push(item)
  }

  const sections: string[] = []
  for (const [, clientItems] of clientMap) {
    const clientName = clientItems[0].client?.name ?? '—'
    const contractRef = clientItems[0].contract_ref
    const contractLine = contractRef ? `Naročilnica: ${contractRef}\n` : ''
    const lines = clientItems.map(item => {
      const desc = renderDesc(item.description_template, month)
      const total = item.quantity * item.unit_price
      return `  ${item.pn}  ${desc}\n  Kol: ${item.quantity}  |  Cena: ${fmtEuro(item.unit_price)} €  |  Skupaj: ${fmtEuro(total)} €  |  Rok: ${item.due_days} dni`
    }).join('\n\n')
    sections.push(`${clientName}\n${contractLine}${sep}\n${lines}`)
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const footer = `\n${sep}\nSKUPAJ (brez DDV): ${fmtEuro(total)} €`
  return `${header}${msgPart}\n${sections.join('\n\n')}\n${footer}`
}

// ── Reminder type config ──────────────────────────────────────────────────────

const TRIGGER_TYPES: { value: ReminderRule['trigger_type']; label: string; description: string; color: string }[] = [
  { value: 'domain_expiry',    label: 'Domain expiry',     description: 'Domains expiring soon',              color: 'var(--amber)' },
  { value: 'maintenance_end',  label: 'Contract end',      description: 'Maintenance contracts ending soon',  color: 'var(--red)' },
  { value: 'hosting_renewal',  label: 'Hosting renewal',   description: 'Hosting contracts expiring soon',    color: 'var(--blue)' },
  { value: 'pipeline_stale',   label: 'Pipeline stale',    description: 'Deals stuck in pipeline too long',   color: 'var(--navy)' },
]

function triggerLabel(t: ReminderRule['trigger_type']) {
  return TRIGGER_TYPES.find(x => x.value === t)?.label ?? t
}
function triggerColor(t: ReminderRule['trigger_type']) {
  return TRIGGER_TYPES.find(x => x.value === t)?.color ?? 'var(--c3)'
}

// ── Blank reminder ────────────────────────────────────────────────────────────

function blankReminder(): Omit<ReminderRule, 'id' | 'created_at' | 'updated_at' | 'last_run_at'> {
  return {
    name: '',
    trigger_type: 'domain_expiry',
    days_before: 30,
    recipient_email: '',
    active: true,
    notes: null,
    invoice_email: null,
    invoice_pn: '6820',
    invoice_unit_price: null,
    invoice_due_days: 30,
  }
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function AutomationsView() {
  const store = useAutomationsStore()
  const rStore = useRemindersStore()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<'batches' | 'reminders'>('batches')

  // Type picker
  const [showTypePicker, setShowTypePicker] = useState(false)

  // Invoice batch — generate email
  const [genMonth, setGenMonth] = useState(currentMonthStr())
  const [genAutomation, setGenAutomation] = useState<Automation | null>(null)
  const [genText, setGenText] = useState('')
  const [sending, setSending] = useState(false)

  // Invoice batch — delete
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Reminder — add/edit modal
  const [reminderModal, setReminderModal] = useState<null | 'add' | ReminderRule>(null)
  const [reminderForm, setReminderForm] = useState(blankReminder())
  const [reminderSaving, setReminderSaving] = useState(false)
  const [reminderDelTarget, setReminderDelTarget] = useState<ReminderRule | null>(null)
  const [reminderRunning, setReminderRunning] = useState<string | null>(null)

  useEffect(() => {
    store.fetchAll()
    rStore.fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Invoice batch helpers ──────────────────────────────────────────────────

  async function handleDelete(a: Automation) {
    setDeleting(true)
    try {
      await store.removeAutomation(a.id)
      toast('success', `${a.name} deleted`)
      setDeleteTarget(null)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  async function handleToggleActive(a: Automation) {
    try {
      await store.updateAutomation(a.id, { active: !a.active })
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  function openGenerate(a: Automation) {
    setGenAutomation(a)
    setGenMonth(currentMonthStr())
    const items = store.itemsForAutomation(a.id)
    setGenText(buildEmailText(a, items, currentMonthStr()))
  }

  function refreshGenText(a: Automation, month: string) {
    const items = store.itemsForAutomation(a.id)
    setGenText(buildEmailText(a, items, month))
  }

  async function handleSendEmail(a: Automation, month: string) {
    setSending(true)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-automation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({ automation_id: a.id, month }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Send failed')
      toast('success', `Email sent to ${a.recipient_email}`)
      setGenAutomation(null)
      await store.fetchAll()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSending(false)
    }
  }

  // ── Reminder helpers ───────────────────────────────────────────────────────

  function openAddReminder() {
    setReminderForm(blankReminder())
    setReminderModal('add')
    setShowTypePicker(false)
    setActiveTab('reminders')
  }

  function openEditReminder(r: ReminderRule) {
    setReminderForm({
      name: r.name,
      trigger_type: r.trigger_type,
      days_before: r.days_before,
      recipient_email: r.recipient_email,
      active: r.active,
      notes: r.notes ?? null,
      invoice_email: r.invoice_email ?? null,
      invoice_pn: r.invoice_pn ?? '6820',
      invoice_unit_price: r.invoice_unit_price ?? null,
      invoice_due_days: r.invoice_due_days ?? 30,
    })
    setReminderModal(r)
  }

  async function handleSaveReminder() {
    if (!reminderForm.name.trim()) { toast('error', 'Name is required'); return }
    if (!reminderForm.recipient_email.trim()) { toast('error', 'Recipient email is required'); return }
    setReminderSaving(true)
    try {
      if (reminderModal === 'add') {
        await rStore.add({ ...reminderForm, name: reminderForm.name.trim(), recipient_email: reminderForm.recipient_email.trim() })
        toast('success', 'Reminder created')
      } else if (reminderModal && typeof reminderModal === 'object') {
        await rStore.update(reminderModal.id, { ...reminderForm })
        toast('success', 'Reminder saved')
      }
      setReminderModal(null)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setReminderSaving(false)
    }
  }

  async function handleDeleteReminder(r: ReminderRule) {
    try {
      await rStore.remove(r.id)
      toast('success', `${r.name} deleted`)
      setReminderDelTarget(null)
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  async function handleRunReminder(r: ReminderRule) {
    setReminderRunning(r.id)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-reminders`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
          body: JSON.stringify({ rule_id: r.id }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Run failed')
      toast('success', data.message ?? `Reminder sent to ${r.recipient_email}`)
      await rStore.fetchAll()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setReminderRunning(null)
    }
  }

  const rf = reminderForm

  return (
    <div>
      {/* ── Type picker modal ──────────────────────────────────────────────── */}
      {showTypePicker && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowTypePicker(false)}>
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2>New automation</h2>
              <button className="modal-close" onClick={() => setShowTypePicker(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--c3)' }}>What type of automation do you want to create?</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Invoice Batch */}
                <button
                  onClick={() => { setShowTypePicker(false); navigate('/automations/new') }}
                  style={{
                    background: 'var(--c7)', border: '2px solid var(--c6)', borderRadius: 10,
                    padding: '20px 16px', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--navy)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--c6)')}
                >
                  <div style={{ marginBottom: 10 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)', marginBottom: 4 }}>Invoice Batch</div>
                  <div style={{ fontSize: 12, color: 'var(--c3)', lineHeight: 1.5 }}>Recurring monthly invoice emails sent automatically to clients</div>
                </button>
                {/* Reminder */}
                <button
                  onClick={openAddReminder}
                  style={{
                    background: 'var(--c7)', border: '2px solid var(--c6)', borderRadius: 10,
                    padding: '20px 16px', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--amber)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--c6)')}
                >
                  <div style={{ marginBottom: 10 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)', marginBottom: 4 }}>Reminder</div>
                  <div style={{ fontSize: 12, color: 'var(--c3)', lineHeight: 1.5 }}>Alert emails for domain expiries, contract ends, hosting renewals, stale pipeline</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate email modal ───────────────────────────────────────────── */}
      {genAutomation && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setGenAutomation(null)}>
          <div className="modal-box" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h2>Preview — {genAutomation.name}</h2>
              <button className="modal-close" onClick={() => setGenAutomation(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ marginBottom: 4 }}>Month</label>
                  <input type="month" value={genMonth} onChange={e => { setGenMonth(e.target.value); refreshGenText(genAutomation, e.target.value) }} style={{ height: 36 }} />
                </div>
                <div style={{ marginTop: 18 }}>
                  <span style={{ fontSize: 12, color: 'var(--c4)' }}>→ {genAutomation.recipient_email}</span>
                </div>
              </div>
              <pre style={{ background: 'var(--c7)', border: '1px solid var(--c6)', borderRadius: 8, padding: '16px', fontSize: 12, lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'monospace', maxHeight: 420, overflowY: 'auto', color: 'var(--c1)' }}>
                {genText}
              </pre>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setGenAutomation(null)}>Close</button>
              <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(genText); toast('success', 'Copied') }}>Copy</button>
              <button className="btn btn-primary btn-sm" onClick={() => handleSendEmail(genAutomation, genMonth)} disabled={sending}>
                {sending ? <span className="spinner" /> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
                Send to {genAutomation.recipient_email}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete batch confirm ───────────────────────────────────────────── */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-header"><h2>Delete automation</h2><button className="modal-close" onClick={() => setDeleteTarget(null)}>×</button></div>
            <div className="modal-body"><p style={{ margin: 0, fontSize: 14 }}>Delete <strong>{deleteTarget.name}</strong> and all its line items?</p></div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }} onClick={() => handleDelete(deleteTarget)} disabled={deleting}>
                {deleting ? <span className="spinner" /> : null} Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reminder add/edit modal ────────────────────────────────────────── */}
      {reminderModal !== null && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setReminderModal(null)}>
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>{reminderModal === 'add' ? 'New Reminder' : 'Edit Reminder'}</h2>
              <button className="modal-close" onClick={() => setReminderModal(null)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Name *</label>
                  <input value={rf.name} onChange={e => setReminderForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Domain expiry 30d" autoFocus />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Active</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {[true, false].map(v => (
                      <button key={String(v)} className={`btn btn-sm ${rf.active === v ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setReminderForm(f => ({ ...f, active: v }))}>
                        {v ? 'Active' : 'Paused'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Trigger type *</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                  {TRIGGER_TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setReminderForm(f => ({ ...f, trigger_type: t.value }))}
                      style={{
                        border: `2px solid ${rf.trigger_type === t.value ? t.color : 'var(--c6)'}`,
                        borderRadius: 8, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                        background: rf.trigger_type === t.value ? `${t.color}12` : 'var(--c7)',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: rf.trigger_type === t.value ? t.color : 'var(--c1)' }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 2 }}>{t.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">
                    {rf.trigger_type === 'pipeline_stale' ? 'Days in pipeline' : 'Days before expiry'}
                  </label>
                  <input type="number" min={1} value={rf.days_before} onChange={e => setReminderForm(f => ({ ...f, days_before: parseInt(e.target.value) || 30 }))} />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Recipient email *</label>
                  <input type="email" value={rf.recipient_email} onChange={e => setReminderForm(f => ({ ...f, recipient_email: e.target.value }))} placeholder="you@renderspace.si" />
                </div>
              </div>

              {rf.trigger_type === 'domain_expiry' && (
                <div style={{ background: 'var(--c7)', border: '1px solid var(--c6)', borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--amber)', marginBottom: 12 }}>Invoice generation (optional)</div>
                  <p style={{ fontSize: 12, color: 'var(--c3)', margin: '0 0 12px', lineHeight: 1.5 }}>If set, also sends an invoice-style email to accounting with all expiring domains as line items.</p>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Accounting email</label>
                    <input type="email" value={rf.invoice_email ?? ''} onChange={e => setReminderForm(f => ({ ...f, invoice_email: e.target.value || null }))} placeholder="racunovodstvo@firma.si" />
                  </div>
                  <div className="form-row">
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">PN</label>
                      <input value={rf.invoice_pn ?? '6820'} onChange={e => setReminderForm(f => ({ ...f, invoice_pn: e.target.value }))} placeholder="6820" />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Price per domain €</label>
                      <input type="number" min={0} step="0.01" value={rf.invoice_unit_price ?? ''} onChange={e => setReminderForm(f => ({ ...f, invoice_unit_price: parseFloat(e.target.value) || null }))} placeholder="15.00" />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Due days</label>
                      <input type="number" min={1} value={rf.invoice_due_days ?? 30} onChange={e => setReminderForm(f => ({ ...f, invoice_due_days: parseInt(e.target.value) || 30 }))} />
                    </div>
                  </div>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notes <span className="form-hint" style={{ display: 'inline' }}>optional</span></label>
                <input value={rf.notes ?? ''} onChange={e => setReminderForm(f => ({ ...f, notes: e.target.value || null }))} placeholder="Internal notes…" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setReminderModal(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveReminder} disabled={reminderSaving}>
                {reminderSaving ? <span className="spinner" /> : null}
                {reminderModal === 'add' ? 'Create reminder' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete reminder confirm ────────────────────────────────────────── */}
      {reminderDelTarget && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setReminderDelTarget(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }}>
            <div className="modal-header"><h2>Delete reminder</h2><button className="modal-close" onClick={() => setReminderDelTarget(null)}>×</button></div>
            <div className="modal-body"><p style={{ margin: 0, fontSize: 14 }}>Delete <strong>{reminderDelTarget.name}</strong>?</p></div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setReminderDelTarget(null)}>Cancel</button>
              <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }} onClick={() => handleDeleteReminder(reminderDelTarget)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>Automations</h1>
          <p>Invoice batches, reminders & recurring alerts</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowTypePicker(true)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Automation
        </button>
      </div>

      <div className="page-content">

        {/* ── Tabs ──────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--c6)', marginBottom: 20 }}>
          {([['batches', 'Invoice Batches', store.automations.length], ['reminders', 'Reminders', rStore.rules.length]] as const).map(([tab, label, count]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 20px', fontWeight: 700, fontSize: 13,
                color: activeTab === tab ? 'var(--navy)' : 'var(--c3)',
                borderBottom: `2px solid ${activeTab === tab ? 'var(--navy)' : 'transparent'}`,
                marginBottom: -2, transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {label}
              {count > 0 && (
                <span style={{ fontSize: 10, background: activeTab === tab ? 'var(--navy)' : 'var(--c5)', color: activeTab === tab ? '#fff' : 'var(--c2)', borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Invoice Batches tab ────────────────────────────────────────────── */}
        {activeTab === 'batches' && (
          store.loading && store.automations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c4)' }}>
              <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3, display: 'inline-block' }} />
            </div>
          ) : store.automations.length === 0 ? (
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ marginBottom: 12 }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--c5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c2)', marginBottom: 6 }}>No invoice batches yet</div>
                <div style={{ fontSize: 13, color: 'var(--c4)', marginBottom: 20 }}>Create a batch to auto-generate monthly invoice emails</div>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/automations/new')}>New Invoice Batch</button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--c7)', borderBottom: '2px solid var(--c6)' }}>
                    <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)' }}>Automation</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)' }}>Recipient</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)', width: 80 }}>Send day</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)' }}>Contents</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)', width: 90 }}>Monthly €</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)', width: 160, whiteSpace: 'nowrap' }}>Last sent</th>
                    <th style={{ padding: '10px 20px', width: 260 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {store.automations.map(a => {
                    const items = store.itemsForAutomation(a.id)
                    const total = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
                    const clientCount = new Set(items.map(i => i.client_id)).size
                    const lastSent = a.last_sent_at
                      ? new Date(a.last_sent_at).toLocaleDateString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric' })
                      : null

                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--c6)' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)' }}>{a.name}</span>
                            <span className={`badge ${a.active ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 10 }}>{a.active ? 'Active' : 'Paused'}</span>
                          </div>
                          {a.notes && <div style={{ fontSize: 11, color: 'var(--c4)', marginTop: 2 }}>{a.notes}</div>}
                        </td>
                        <td style={{ padding: '14px 12px', fontSize: 12, color: 'var(--c2)' }}>{a.recipient_email}</td>
                        <td style={{ padding: '14px 12px', textAlign: 'center', fontSize: 13, color: 'var(--c2)' }}>{ordinal(a.send_day)}</td>
                        <td style={{ padding: '14px 12px', fontSize: 12, color: 'var(--c3)' }}>
                          {clientCount} client{clientCount !== 1 ? 's' : ''} · {items.length} line{items.length !== 1 ? 's' : ''}
                        </td>
                        <td style={{ padding: '14px 12px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: 'var(--navy)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {fmtEuro(total)} €
                        </td>
                        <td style={{ padding: '14px 12px', whiteSpace: 'nowrap' }}>
                          {(a.sent_count ?? 0) > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)', background: 'var(--navy-light)', borderRadius: 6, padding: '2px 7px' }}>{a.sent_count}×</span>
                              {lastSent && <span style={{ fontSize: 12, color: 'var(--c3)' }}>{lastSent}</span>}
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--c5)' }}>Never</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button className={`btn btn-xs ${a.active ? 'btn-secondary' : 'btn-ghost'}`} onClick={() => handleToggleActive(a)}>{a.active ? 'Pause' : 'Resume'}</button>
                            <button className="btn btn-secondary btn-xs" onClick={() => navigate(`/automations/${a.id}/edit`)}>Edit</button>
                            <button className="btn btn-secondary btn-xs" onClick={() => openGenerate(a)} disabled={items.length === 0}>Preview</button>
                            <button className="btn btn-primary btn-xs" onClick={() => handleSendEmail(a, currentMonthStr())} disabled={items.length === 0 || sending} title={`Send ${currentMonthStr()} to ${a.recipient_email}`}>
                              {sending ? <span className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
                              Test
                            </button>
                            <button className="btn btn-ghost btn-xs" onClick={() => setDeleteTarget(a)} style={{ color: 'var(--red)' }} title="Delete">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── Reminders tab ─────────────────────────────────────────────────── */}
        {activeTab === 'reminders' && (
          rStore.loading && rStore.rules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--c4)' }}>
              <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3, display: 'inline-block' }} />
            </div>
          ) : rStore.rules.length === 0 ? (
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ marginBottom: 12 }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--c5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c2)', marginBottom: 6 }}>No reminders configured</div>
                <div style={{ fontSize: 13, color: 'var(--c4)', marginBottom: 20 }}>Set up alerts for domain expiries, contract ends, hosting renewals, and stale pipeline deals</div>
                <button className="btn btn-primary btn-sm" onClick={openAddReminder}>New Reminder</button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--c7)', borderBottom: '2px solid var(--c6)' }}>
                    <th style={{ padding: '10px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)' }}>Reminder</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)', width: 160 }}>Type</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)', width: 100 }}>Days before</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)' }}>Recipient</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)', width: 140 }}>Last run</th>
                    <th style={{ padding: '10px 20px', width: 180 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rStore.rules.map(r => {
                    const lastRun = r.last_run_at
                      ? new Date(r.last_run_at).toLocaleDateString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric' })
                      : null

                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--c6)' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--c0)' }}>{r.name}</span>
                            <span className={`badge ${r.active ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 10 }}>{r.active ? 'Active' : 'Paused'}</span>
                            {r.invoice_email && <span className="badge badge-amber" style={{ fontSize: 10 }}>+ Invoice</span>}
                          </div>
                          {r.notes && <div style={{ fontSize: 11, color: 'var(--c4)', marginTop: 2 }}>{r.notes}</div>}
                        </td>
                        <td style={{ padding: '14px 12px' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: triggerColor(r.trigger_type) }}>{triggerLabel(r.trigger_type)}</span>
                        </td>
                        <td style={{ padding: '14px 12px', textAlign: 'center', fontSize: 13, color: 'var(--c2)', fontWeight: 600 }}>
                          {r.days_before}d
                        </td>
                        <td style={{ padding: '14px 12px', fontSize: 12, color: 'var(--c2)' }}>{r.recipient_email}</td>
                        <td style={{ padding: '14px 12px', fontSize: 12, color: 'var(--c3)' }}>
                          {lastRun ?? <span style={{ color: 'var(--c5)' }}>Never</span>}
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button className="btn btn-secondary btn-xs" onClick={() => openEditReminder(r)}>Edit</button>
                            <button
                              className="btn btn-primary btn-xs"
                              onClick={() => handleRunReminder(r)}
                              disabled={reminderRunning === r.id}
                              title="Run now"
                            >
                              {reminderRunning === r.id ? <span className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
                              Run
                            </button>
                            <button className="btn btn-ghost btn-xs" onClick={() => setReminderDelTarget(r)} style={{ color: 'var(--red)' }} title="Delete">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

      </div>
    </div>
  )
}
