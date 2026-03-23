import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAutomationsStore } from '../stores/automations'
import { useRemindersStore } from '../stores/reminders'
import { toast } from '../lib/toast'
import type { Automation, AutomationItem, ReminderRule } from '../lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Label } from '@/components/ui/label'

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
      <Modal
        open={showTypePicker}
        title="New automation"
        onClose={() => setShowTypePicker(false)}
        maxWidth={520}
      >
        <p className="mb-4 text-sm text-muted-foreground">What type of automation do you want to create?</p>
        <div className="grid grid-cols-2 gap-3">
          {/* Invoice Batch */}
          <button
            onClick={() => { setShowTypePicker(false); navigate('/automations/new') }}
            className="bg-[var(--c7)] border-2 border-[var(--c6)] rounded-lg p-5 cursor-pointer text-left transition-colors hover:border-[var(--navy)]"
          >
            <div className="mb-2.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </div>
            <div className="font-bold text-sm text-[var(--c0)] mb-1">Invoice Batch</div>
            <div className="text-xs text-muted-foreground leading-relaxed">Recurring monthly invoice emails sent automatically to clients</div>
          </button>
          {/* Reminder */}
          <button
            onClick={openAddReminder}
            className="bg-[var(--c7)] border-2 border-[var(--c6)] rounded-lg p-5 cursor-pointer text-left transition-colors hover:border-[var(--amber)]"
          >
            <div className="mb-2.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <div className="font-bold text-sm text-[var(--c0)] mb-1">Reminder</div>
            <div className="text-xs text-muted-foreground leading-relaxed">Alert emails for domain expiries, contract ends, hosting renewals, stale pipeline</div>
          </button>
        </div>
      </Modal>

      {/* ── Generate email modal ───────────────────────────────────────────── */}
      <Modal
        open={!!genAutomation}
        title={genAutomation ? `Preview — ${genAutomation.name}` : 'Preview'}
        onClose={() => setGenAutomation(null)}
        maxWidth={680}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setGenAutomation(null)}>Close</Button>
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(genText); toast('success', 'Copied') }}>Copy</Button>
            <Button size="sm" onClick={() => genAutomation && handleSendEmail(genAutomation, genMonth)} disabled={sending}>
              {sending ? <span className="spinner" /> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
              Send to {genAutomation?.recipient_email}
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="mb-0">
            <Label className="mb-1 block">Month</Label>
            <input type="month" value={genMonth} onChange={e => { setGenMonth(e.target.value); if (genAutomation) refreshGenText(genAutomation, e.target.value) }} style={{ height: 36 }} />
          </div>
          <div className="mt-[18px]">
            <span className="text-xs text-muted-foreground">→ {genAutomation?.recipient_email}</span>
          </div>
        </div>
        <pre className="bg-[var(--c7)] border border-[var(--c6)] rounded-lg p-4 text-xs leading-relaxed whitespace-pre-wrap max-h-[420px] overflow-y-auto text-[var(--c1)]">
          {genText}
        </pre>
      </Modal>

      {/* ── Delete batch confirm ───────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete automation"
        message={deleteTarget ? `Delete ${deleteTarget.name} and all its line items?` : ''}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
      />

      {/* ── Reminder add/edit modal ────────────────────────────────────────── */}
      <Modal
        open={reminderModal !== null}
        title={reminderModal === 'add' ? 'New Reminder' : 'Edit Reminder'}
        onClose={() => setReminderModal(null)}
        maxWidth={560}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setReminderModal(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveReminder} disabled={reminderSaving}>
              {reminderSaving ? <span className="spinner" /> : null}
              {reminderModal === 'add' ? 'Create reminder' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-4">
            <div className="mb-4" style={{ flex: 2 }}>
              <Label>Name *</Label>
              <input value={rf.name} onChange={e => setReminderForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Domain expiry 30d" autoFocus className="w-full mt-1" />
            </div>
            <div className="mb-4">
              <Label>Active</Label>
              <div className="flex gap-2 mt-1">
                {[true, false].map(v => (
                  <Button key={String(v)} size="sm" variant={rf.active === v ? 'default' : 'outline'} onClick={() => setReminderForm(f => ({ ...f, active: v }))}>
                    {v ? 'Active' : 'Paused'}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-4">
            <Label>Trigger type *</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {TRIGGER_TYPES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setReminderForm(f => ({ ...f, trigger_type: t.value }))}
                  style={{
                    border: `2px solid ${rf.trigger_type === t.value ? t.color : 'var(--c6)'}`,
                    background: rf.trigger_type === t.value ? `${t.color}12` : 'var(--c7)',
                  }}
                  className="rounded-lg px-3 py-2.5 cursor-pointer text-left transition-all"
                >
                  <div className="text-xs font-bold" style={{ color: rf.trigger_type === t.value ? t.color : 'var(--c1)' }}>{t.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="mb-4">
              <Label>{rf.trigger_type === 'pipeline_stale' ? 'Days in pipeline' : 'Days before expiry'}</Label>
              <input type="number" min={1} value={rf.days_before} onChange={e => setReminderForm(f => ({ ...f, days_before: parseInt(e.target.value) || 30 }))} className="w-full mt-1" />
            </div>
            <div className="mb-4">
              <Label>Recipient email *</Label>
              <input type="email" value={rf.recipient_email} onChange={e => setReminderForm(f => ({ ...f, recipient_email: e.target.value }))} placeholder="you@renderspace.si" className="w-full mt-1" />
            </div>
          </div>

          {rf.trigger_type === 'domain_expiry' && (
            <div className="bg-[var(--c7)] border border-[var(--c6)] rounded-lg px-4 py-3.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#d97706] mb-3">Invoice generation (optional)</div>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">If set, also sends an invoice-style email to accounting with all expiring domains as line items.</p>
              <div className="mb-2.5">
                <Label>Accounting email</Label>
                <input type="email" value={rf.invoice_email ?? ''} onChange={e => setReminderForm(f => ({ ...f, invoice_email: e.target.value || null }))} placeholder="racunovodstvo@firma.si" className="w-full mt-1" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="mb-4">
                  <Label>PN</Label>
                  <input value={rf.invoice_pn ?? '6820'} onChange={e => setReminderForm(f => ({ ...f, invoice_pn: e.target.value }))} placeholder="6820" className="w-full mt-1" />
                </div>
                <div className="mb-4">
                  <Label>Price per domain €</Label>
                  <input type="number" min={0} step="0.01" value={rf.invoice_unit_price ?? ''} onChange={e => setReminderForm(f => ({ ...f, invoice_unit_price: parseFloat(e.target.value) || null }))} placeholder="15.00" className="w-full mt-1" />
                </div>
                <div className="mb-4">
                  <Label>Due days</Label>
                  <input type="number" min={1} value={rf.invoice_due_days ?? 30} onChange={e => setReminderForm(f => ({ ...f, invoice_due_days: parseInt(e.target.value) || 30 }))} className="w-full mt-1" />
                </div>
              </div>
            </div>
          )}

          <div className="mb-0">
            <Label>Notes <span className="text-xs text-muted-foreground ml-1">optional</span></Label>
            <input value={rf.notes ?? ''} onChange={e => setReminderForm(f => ({ ...f, notes: e.target.value || null }))} placeholder="Internal notes…" className="w-full mt-1" />
          </div>
        </div>
      </Modal>

      {/* ── Delete reminder confirm ────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!reminderDelTarget}
        title="Delete reminder"
        message={reminderDelTarget ? `Delete ${reminderDelTarget.name}?` : ''}
        onConfirm={() => reminderDelTarget && handleDeleteReminder(reminderDelTarget)}
        onCancel={() => setReminderDelTarget(null)}
      />

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Automations</h1>
          <p>Invoice batches, reminders &amp; recurring alerts</p>
        </div>
        <Button size="sm" onClick={() => setShowTypePicker(true)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Automation
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── Tabs ──────────────────────────────────────────────────────────── */}
        <div className="flex border-b-2 border-[var(--c6)] mb-5">
          {([['batches', 'Invoice Batches', store.automations.length], ['reminders', 'Reminders', rStore.rules.length]] as const).map(([tab, label, count]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="bg-transparent border-0 cursor-pointer px-5 py-2.5 font-bold text-sm flex items-center gap-1.5 -mb-0.5 transition-all"
              style={{
                color: activeTab === tab ? 'var(--navy)' : 'var(--c3)',
                borderBottom: `2px solid ${activeTab === tab ? 'var(--navy)' : 'transparent'}`,
              }}
            >
              {label}
              {count > 0 && (
                <span
                  className="text-[10px] rounded-[10px] px-1.5 py-px font-bold"
                  style={{
                    background: activeTab === tab ? 'var(--navy)' : 'var(--c5)',
                    color: activeTab === tab ? '#fff' : 'var(--c2)',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Invoice Batches tab ────────────────────────────────────────────── */}
        {activeTab === 'batches' && (
          store.loading && store.automations.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3, display: 'inline-block' }} />
            </div>
          ) : store.automations.length === 0 ? (
            <Card>
              <CardContent className="text-center px-5 py-16">
                <div className="mb-3"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--c5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></div>
                <div className="font-bold text-[15px] text-[#374151] mb-1.5">No invoice batches yet</div>
                <div className="text-sm text-muted-foreground mb-5">Create a batch to auto-generate monthly invoice emails</div>
                <Button size="sm" onClick={() => navigate('/automations/new')}>New Invoice Batch</Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[var(--c7)] border-b-2 border-[var(--c6)]">
                    <th className="px-5 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground">Automation</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground">Recipient</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground w-20">Send day</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground">Contents</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground w-24">Monthly €</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground w-40 whitespace-nowrap">Last sent</th>
                    <th className="px-5 py-2.5 w-64"></th>
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
                      <tr key={a.id} className="border-b border-[var(--c6)]">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[var(--c0)]">{a.name}</span>
                            <Badge variant={a.active ? 'green' : 'gray'}>{a.active ? 'Active' : 'Paused'}</Badge>
                          </div>
                          {a.notes && <div className="text-[11px] text-muted-foreground mt-0.5">{a.notes}</div>}
                        </td>
                        <td className="px-3 py-3.5 text-xs text-[#374151]">{a.recipient_email}</td>
                        <td className="px-3 py-3.5 text-center text-[13px] text-[#374151]">{ordinal(a.send_day)}</td>
                        <td className="px-3 py-3.5 text-xs text-muted-foreground">
                          {clientCount} client{clientCount !== 1 ? 's' : ''} · {items.length} line{items.length !== 1 ? 's' : ''}
                        </td>
                        <td className="px-3 py-3.5 text-right font-bold text-sm text-primary whitespace-nowrap">
                          {fmtEuro(total)} €
                        </td>
                        <td className="px-3 py-3.5 whitespace-nowrap">
                          {(a.sent_count ?? 0) > 0 ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-primary bg-[var(--navy-light)] rounded px-1.5 py-px">{a.sent_count}×</span>
                              {lastSent && <span className="text-xs text-muted-foreground">{lastSent}</span>}
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--c5)]">Never</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex gap-1.5 justify-end items-center">
                            <Button size="xs" variant={a.active ? 'outline' : 'ghost'} onClick={() => handleToggleActive(a)}>{a.active ? 'Pause' : 'Resume'}</Button>
                            <Button size="xs" variant="outline" onClick={() => navigate(`/automations/${a.id}/edit`)}>Edit</Button>
                            <Button size="xs" variant="outline" onClick={() => openGenerate(a)} disabled={items.length === 0}>Preview</Button>
                            <Button size="xs" onClick={() => handleSendEmail(a, currentMonthStr())} disabled={items.length === 0 || sending} title={`Send ${currentMonthStr()} to ${a.recipient_email}`}>
                              {sending ? <span className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
                              Test
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => setDeleteTarget(a)} className="text-[#dc2626]" title="Delete">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )
        )}

        {/* ── Reminders tab ─────────────────────────────────────────────────── */}
        {activeTab === 'reminders' && (
          rStore.loading && rStore.rules.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3, display: 'inline-block' }} />
            </div>
          ) : rStore.rules.length === 0 ? (
            <Card>
              <CardContent className="text-center px-5 py-16">
                <div className="mb-3"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--c5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
                <div className="font-bold text-[15px] text-[#374151] mb-1.5">No reminders configured</div>
                <div className="text-sm text-muted-foreground mb-5">Set up alerts for domain expiries, contract ends, hosting renewals, and stale pipeline deals</div>
                <Button size="sm" onClick={openAddReminder}>New Reminder</Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[var(--c7)] border-b-2 border-[var(--c6)]">
                    <th className="px-5 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground">Reminder</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground w-40">Type</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground w-24">Days before</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground">Recipient</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground w-36">Last run</th>
                    <th className="px-5 py-2.5 w-44"></th>
                  </tr>
                </thead>
                <tbody>
                  {rStore.rules.map(r => {
                    const lastRun = r.last_run_at
                      ? new Date(r.last_run_at).toLocaleDateString('sl-SI', { day: 'numeric', month: 'short', year: 'numeric' })
                      : null

                    return (
                      <tr key={r.id} className="border-b border-[var(--c6)]">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-[var(--c0)]">{r.name}</span>
                            <Badge variant={r.active ? 'green' : 'gray'}>{r.active ? 'Active' : 'Paused'}</Badge>
                            {r.invoice_email && <Badge variant="amber">+ Invoice</Badge>}
                          </div>
                          {r.notes && <div className="text-[11px] text-muted-foreground mt-0.5">{r.notes}</div>}
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="text-xs font-semibold" style={{ color: triggerColor(r.trigger_type) }}>{triggerLabel(r.trigger_type)}</span>
                        </td>
                        <td className="px-3 py-3.5 text-center text-[13px] text-[#374151] font-semibold">
                          {r.days_before}d
                        </td>
                        <td className="px-3 py-3.5 text-xs text-[#374151]">{r.recipient_email}</td>
                        <td className="px-3 py-3.5 text-xs text-muted-foreground">
                          {lastRun ?? <span className="text-[var(--c5)]">Never</span>}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex gap-1.5 justify-end items-center">
                            <Button size="xs" variant="outline" onClick={() => openEditReminder(r)}>Edit</Button>
                            <Button
                              size="xs"
                              onClick={() => handleRunReminder(r)}
                              disabled={reminderRunning === r.id}
                              title="Run now"
                            >
                              {reminderRunning === r.id ? <span className="spinner" style={{ width: 10, height: 10, borderWidth: 2 }} /> : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>}
                              Run
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => setReminderDelTarget(r)} className="text-[#dc2626]" title="Delete">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )
        )}

      </div>
    </div>
  )
}
