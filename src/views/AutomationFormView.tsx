import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAutomationsStore } from '../stores/automations'
import { useClientsStore } from '../stores/clients'
import { useInfraStore } from '../stores/infrastructure'
import { Select } from '../components/Select'
import { toast } from '../lib/toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceRow {
  _key: string
  pn: string
  description_template: string
  quantity: number
  unit_price: number
  hosting_client_id: string
}

interface ClientBlock {
  _key: string
  client_id: string
  contract_ref: string
  due_days: number
  services: ServiceRow[]
}

function newService(): ServiceRow {
  return { _key: Math.random().toString(36).slice(2), pn: '6820', description_template: '', quantity: 1, unit_price: 0, hosting_client_id: '' }
}

function newClientBlock(): ClientBlock {
  return { _key: Math.random().toString(36).slice(2), client_id: '', contract_ref: '', due_days: 30, services: [newService()] }
}

function fmtEuro(n: number) {
  return n.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

// ── View ─────────────────────────────────────────────────────────────────────

export function AutomationFormView() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const store = useAutomationsStore()
  const cStore = useClientsStore()
  const infraStore = useInfraStore()

  const isEdit = !!id
  const [saving, setSaving] = useState(false)

  // Settings
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [sendDay, setSendDay] = useState(1)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [notes, setNotes] = useState('')

  // Client blocks
  const [blocks, setBlocks] = useState<ClientBlock[]>([newClientBlock()])

  useEffect(() => {
    const load = async () => {
      await Promise.all([store.fetchAll(), cStore.fetchAll(), infraStore.fetchAll()])
      if (id) {
        const aut = store.automations.find(a => a.id === id)
        if (!aut) { navigate('/automations'); return }
        setName(aut.name)
        setEmail(aut.recipient_email)
        setSendDay(aut.send_day)
        setSubject(aut.subject ?? '')
        setMessage(aut.message ?? '')
        setNotes(aut.notes ?? '')

        const items = store.itemsForAutomation(id)
        if (items.length > 0) {
          const clientMap = new Map<string, typeof items>()
          for (const item of items) {
            if (!clientMap.has(item.client_id)) clientMap.set(item.client_id, [])
            clientMap.get(item.client_id)!.push(item)
          }
          setBlocks(Array.from(clientMap.entries()).map(([clientId, clientItems]) => ({
            _key: clientId,
            client_id: clientId,
            contract_ref: clientItems[0].contract_ref ?? '',
            due_days: clientItems[0].due_days,
            services: clientItems.map(i => ({
              _key: i.id,
              pn: i.pn,
              description_template: i.description_template,
              quantity: i.quantity,
              unit_price: i.unit_price,
              hosting_client_id: i.hosting_client_id ?? '',
            })),
          })))
        }
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ── Block helpers ──────────────────────────────────────────────────────────

  function updateBlock(key: string, field: keyof ClientBlock, val: string | number) {
    setBlocks(bs => bs.map(b => b._key === key ? { ...b, [field]: val } : b))
  }

  function removeBlock(key: string) {
    setBlocks(bs => bs.filter(b => b._key !== key))
  }

  function addBlock() {
    setBlocks(bs => [...bs, newClientBlock()])
  }

  // ── Service helpers ────────────────────────────────────────────────────────

  function updateService(blockKey: string, svcKey: string, field: keyof ServiceRow, val: string | number) {
    setBlocks(bs => bs.map(b => {
      if (b._key !== blockKey) return b
      return {
        ...b,
        services: b.services.map(s => {
          if (s._key !== svcKey) return s
          const updated = { ...s, [field]: val }
          if (field === 'hosting_client_id' && typeof val === 'string' && val) {
            const h = infraStore.hostingClients.find(h => h.id === val)
            if (h) {
              updated.description_template = (h.description ?? '') + ' - {month} {year}'
              updated.unit_price = h.amount
            }
          }
          return updated
        }),
      }
    }))
  }

  function addService(blockKey: string) {
    setBlocks(bs => bs.map(b => b._key === blockKey ? { ...b, services: [...b.services, newService()] } : b))
  }

  function removeService(blockKey: string, svcKey: string) {
    setBlocks(bs => bs.map(b => {
      if (b._key !== blockKey) return b
      return { ...b, services: b.services.filter(s => s._key !== svcKey) }
    }))
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!name.trim()) { toast('error', 'Automation name is required'); return }
    if (!email.trim()) { toast('error', 'Recipient email is required'); return }
    const validBlocks = blocks.filter(b => b.client_id)
    if (validBlocks.length === 0) { toast('error', 'Add at least one client'); return }

    setSaving(true)
    try {
      const autData = { name: name.trim(), recipient_email: email.trim(), send_day: sendDay, active: true, subject: subject.trim() || null, message: message.trim() || null, notes: notes.trim() || null, sent_count: 0 }

      let autId = id
      if (isEdit && id) {
        await store.updateAutomation(id, autData)
      } else {
        const newAut = await store.addAutomation(autData)
        autId = newAut.id
      }

      const allItems = validBlocks.flatMap((b, bi) =>
        b.services
          .filter(s => s.description_template.trim())
          .map((s, si) => ({
            automation_id: autId!,
            client_id: b.client_id,
            contract_ref: b.contract_ref.trim() || null,
            pn: s.pn.trim(),
            description_template: s.description_template.trim(),
            quantity: s.quantity,
            unit_price: s.unit_price,
            due_days: b.due_days,
            sort_order: bi * 100 + si,
            hosting_client_id: s.hosting_client_id || null,
          }))
      )

      await store.replaceItems(autId!, allItems)
      toast('success', isEdit ? 'Automation saved' : 'Automation created')
      navigate('/automations')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const grandTotal = blocks.reduce((s, b) => s + b.services.reduce((ss, sv) => ss + sv.quantity * sv.unit_price, 0), 0)
  const validClientCount = blocks.filter(b => b.client_id).length
  const totalLines = blocks.reduce((s, b) => s + b.services.length, 0)

  return (
    <div>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>{isEdit ? 'Edit Automation' : 'New Automation'}</h1>
          <p>{isEdit ? name : 'Configure a recurring monthly invoice batch'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/automations')}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : null}
            {isEdit ? 'Save changes' : 'Create automation'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 flex flex-col gap-5">

        {/* ── Top row: settings + summary ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

          {/* Settings card */}
          <Card>
            <CardContent>
              <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground mb-4">Automation settings</div>
              <div className="grid grid-cols-2 gap-4 mb-3.5" style={{ gridTemplateColumns: '2fr 2fr 1fr' }}>
                <div className="mb-4">
                  <Label>Name *</Label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Gostovanja - Renderspace" autoFocus className="w-full mt-1" />
                </div>
                <div className="mb-4">
                  <Label>Recipient email *</Label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@renderspace.si" className="w-full mt-1" />
                </div>
                <div className="mb-4">
                  <Label>Send on day</Label>
                  <input
                    type="number" min={1} max={28}
                    value={sendDay}
                    onChange={e => setSendDay(Math.max(1, Math.min(28, parseInt(e.target.value) || 1)))}
                    className="w-full mt-1"
                  />
                  <div className="text-xs text-muted-foreground mt-1">{sendDay}. of each month</div>
                </div>
              </div>
              <div className="mb-3.5">
                <Label>Email subject <span className="text-xs text-muted-foreground ml-1">optional — defaults to "{name || 'Automation name'} — {'{month} {year}'}"</span></Label>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={`e.g. Računi za gostovanje — {month} {year}`} className="w-full mt-1" />
              </div>
              <div className="mb-3.5">
                <Label>Email message <span className="text-xs text-muted-foreground ml-1">optional — appears at top of email</span></Label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="e.g. Prosim izdajte račune za storitve, ki so navedene spodaj."
                  rows={3}
                  className="w-full mt-1 text-[13px]"
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div>
                <Label>Notes <span className="text-xs text-muted-foreground ml-1">internal only</span></Label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes…" className="w-full mt-1" />
              </div>
            </CardContent>
          </Card>

          {/* Summary + save (sticky) */}
          <div style={{ position: 'sticky', top: 20 }}>
            <Card>
              <CardContent>
                <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-muted-foreground mb-4">Summary</div>

                <div className="flex flex-col gap-2.5 mb-5">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground">Clients</span>
                    <span className="font-semibold text-[var(--c1)]">{validClientCount}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground">Service lines</span>
                    <span className="font-semibold text-[var(--c1)]">{totalLines}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-muted-foreground">Sends on</span>
                    <span className="font-semibold text-[var(--c1)]">{sendDay}. of month</span>
                  </div>
                  <div className="h-px bg-[var(--c6)] my-1" />
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs font-bold uppercase tracking-[0.4px] text-muted-foreground">Grand total</span>
                    <span className="text-[22px] font-extrabold text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtEuro(grandTotal)}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving} className="w-full justify-center">
                    {saving ? <span className="spinner" /> : null}
                    {isEdit ? 'Save changes' : 'Create automation'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate('/automations')} className="w-full justify-center">
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* ── Client blocks ─────────────────────────────────────────────────── */}
        {blocks.map((block, bi) => {
          const blockTotal = block.services.reduce((s, sv) => s + sv.quantity * sv.unit_price, 0)
          const clientHosting = block.client_id
            ? infraStore.hostingClients.filter(h => h.client_id === block.client_id)
            : []

          return (
            <Card key={block._key} className="overflow-hidden">

              {/* Client header bar */}
              <div className="flex items-center gap-3.5 px-5 py-3 border-b-2 border-[var(--c6)] bg-[var(--c7)]">
                <div className="text-[11px] font-bold uppercase tracking-[0.5px] text-[var(--c4)] min-w-14 shrink-0">
                  Client {bi + 1}
                </div>

                <div className="w-[260px] shrink-0">
                  <Select
                    value={block.client_id}
                    onChange={val => updateBlock(block._key, 'client_id', val)}
                    placeholder="Select client *"
                    options={cStore.clients.map(c => ({ value: c.id, label: c.name }))}
                  />
                </div>

                <div className="flex-1">
                  <input
                    value={block.contract_ref}
                    onChange={e => updateBlock(block._key, 'contract_ref', e.target.value)}
                    placeholder="Contract / Order ref (optional)"
                    style={{ height: 42, width: '100%', fontSize: 13 }}
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Due days</span>
                  <input
                    type="number" min={1}
                    value={block.due_days}
                    onChange={e => updateBlock(block._key, 'due_days', parseInt(e.target.value) || 30)}
                    style={{ height: 42, width: 72, fontSize: 13, textAlign: 'center' }}
                  />
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  {blockTotal > 0 && (
                    <span className="font-bold text-[15px] text-primary" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmtEuro(blockTotal)}
                    </span>
                  )}
                  {blocks.length > 1 && (
                    <button
                      onClick={() => removeBlock(block._key)}
                      className="bg-transparent border-0 cursor-pointer text-[var(--c4)] text-[20px] leading-none px-1 transition-colors hover:text-[#dc2626]"
                      title="Remove client"
                    >×</button>
                  )}
                </div>
              </div>

              {/* Services table */}
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[var(--c7)] border-b border-[var(--c6)]">
                    <th className="px-5 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground w-24 whitespace-nowrap">PN</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground w-full">Description *</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground w-20 whitespace-nowrap">Qty</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground w-32 whitespace-nowrap">Unit price €</th>
                    <th className="px-5 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.4px] text-muted-foreground w-28 whitespace-nowrap">Total</th>
                    <th className="w-11"></th>
                  </tr>
                </thead>
                <tbody>
                  {block.services.map((svc) => (
                    <tr key={svc._key} className="border-b border-[var(--c6)]">
                      <td className="px-5 py-2.5">
                        <input
                          value={svc.pn}
                          onChange={e => updateService(block._key, svc._key, 'pn', e.target.value)}
                          style={{ height: 38, width: '100%', fontSize: 13, fontFamily: 'monospace' }}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col gap-1.5">
                          <input
                            value={svc.description_template}
                            onChange={e => updateService(block._key, svc._key, 'description_template', e.target.value)}
                            placeholder="e.g. Gostovanje www.example.si - {month} {year}"
                            style={{ height: 38, width: '100%', fontSize: 13 }}
                          />
                          {clientHosting.length > 0 && (
                            <Select
                              value={svc.hosting_client_id}
                              onChange={val => updateService(block._key, svc._key, 'hosting_client_id', val)}
                              placeholder="↑ Autofill from hosting…"
                              options={clientHosting.map(h => ({
                                value: h.id,
                                label: `${h.description ?? h.project_pn} — ${h.amount} €`,
                              }))}
                              style={{ fontSize: 12 }}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number" min={1}
                          value={svc.quantity}
                          onChange={e => updateService(block._key, svc._key, 'quantity', parseFloat(e.target.value) || 1)}
                          style={{ height: 38, width: '100%', fontSize: 13, textAlign: 'right' }}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number" min={0} step="0.01"
                          value={svc.unit_price}
                          onChange={e => updateService(block._key, svc._key, 'unit_price', parseFloat(e.target.value) || 0)}
                          style={{ height: 38, width: '100%', fontSize: 13, textAlign: 'right' }}
                        />
                      </td>
                      <td className="px-5 py-2.5 text-right font-semibold text-sm text-[var(--c1)] whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fmtEuro(svc.quantity * svc.unit_price)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => removeService(block._key, svc._key)}
                          disabled={block.services.length === 1}
                          className="bg-transparent border-0 cursor-pointer text-[18px] leading-none px-1 py-0.5 transition-colors hover:text-[#dc2626] disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ color: block.services.length === 1 ? 'var(--c5)' : 'var(--c4)' }}
                        >×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--c7)]">
                    <td colSpan={3} className="px-5 py-2.5">
                      <Button variant="ghost" size="xs" onClick={() => addService(block._key)}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add service
                      </Button>
                    </td>
                    <td className="px-3 py-2.5 text-right text-[11px] font-bold text-muted-foreground uppercase tracking-[0.4px]">
                      Subtotal
                    </td>
                    <td className="px-5 py-2.5 text-right font-bold text-[15px] text-primary whitespace-nowrap" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {fmtEuro(blockTotal)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </Card>
          )
        })}

        {/* ── Add client ────────────────────────────────────────────────────── */}
        <div>
          <Button variant="outline" size="sm" onClick={addBlock}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add another client
          </Button>
        </div>

      </div>
    </div>
  )
}
