import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAutomationsStore } from '../stores/automations'
import { useClientsStore } from '../stores/clients'
import { useInfraStore } from '../stores/infrastructure'
import { Select } from '../components/Select'
import { toast } from '../lib/toast'

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
      <div className="page-header">
        <div>
          <h1>{isEdit ? 'Edit Automation' : 'New Automation'}</h1>
          <p>{isEdit ? name : 'Configure a recurring monthly invoice batch'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/automations')}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? <span className="spinner" /> : null}
            {isEdit ? 'Save changes' : 'Create automation'}
          </button>
        </div>
      </div>

      <div className="page-content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Top row: settings + summary ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

          {/* Settings card */}
          <div className="card">
            <div className="card-body">
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--c3)', marginBottom: 18 }}>Automation settings</div>
              <div className="form-row" style={{ marginBottom: 14 }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Gostovanja - Renderspace" autoFocus />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Recipient email *</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@renderspace.si" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Send on day</label>
                  <input
                    type="number" min={1} max={28}
                    value={sendDay}
                    onChange={e => setSendDay(Math.max(1, Math.min(28, parseInt(e.target.value) || 1)))}
                  />
                  <div className="form-hint">{sendDay}. of each month</div>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Email subject <span className="form-hint" style={{ display: 'inline' }}>optional — defaults to "{name || 'Automation name'} — {'{month} {year}'}"</span></label>
                <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={`e.g. Računi za gostovanje — {month} {year}`} />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Email message <span className="form-hint" style={{ display: 'inline' }}>optional — appears at top of email</span></label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="e.g. Prosim izdajte račune za storitve, ki so navedene spodaj."
                  rows={3}
                  style={{ resize: 'vertical', fontSize: 13 }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Notes <span className="form-hint" style={{ display: 'inline' }}>internal only</span></label>
                <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes…" />
              </div>
            </div>
          </div>

          {/* Summary + save (sticky) */}
          <div style={{ position: 'sticky', top: 20 }}>
            <div className="card">
              <div className="card-body">
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--c3)', marginBottom: 16 }}>Summary</div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--c3)' }}>Clients</span>
                    <span style={{ fontWeight: 600, color: 'var(--c1)' }}>{validClientCount}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--c3)' }}>Service lines</span>
                    <span style={{ fontWeight: 600, color: 'var(--c1)' }}>{totalLines}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--c3)' }}>Sends on</span>
                    <span style={{ fontWeight: 600, color: 'var(--c1)' }}>{sendDay}. of month</span>
                  </div>
                  <div style={{ height: 1, background: 'var(--c6)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)' }}>Grand total</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)', fontVariantNumeric: 'tabular-nums' }}>{fmtEuro(grandTotal)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                    {saving ? <span className="spinner" /> : null}
                    {isEdit ? 'Save changes' : 'Create automation'}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigate('/automations')} style={{ width: '100%', justifyContent: 'center' }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Client blocks ─────────────────────────────────────────────────── */}
        {blocks.map((block, bi) => {
          const blockTotal = block.services.reduce((s, sv) => s + sv.quantity * sv.unit_price, 0)
          const clientHosting = block.client_id
            ? infraStore.hostingClients.filter(h => h.client_id === block.client_id)
            : []

          return (
            <div key={block._key} className="card" style={{ overflow: 'hidden' }}>

              {/* Client header bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 20px',
                borderBottom: '2px solid var(--c6)',
                background: 'var(--c7)',
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.5px', color: 'var(--c4)', minWidth: 56, flexShrink: 0,
                }}>
                  Client {bi + 1}
                </div>

                <div style={{ flex: '0 0 260px' }}>
                  <Select
                    value={block.client_id}
                    onChange={val => updateBlock(block._key, 'client_id', val)}
                    placeholder="Select client *"
                    options={cStore.clients.map(c => ({ value: c.id, label: c.name }))}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <input
                    value={block.contract_ref}
                    onChange={e => updateBlock(block._key, 'contract_ref', e.target.value)}
                    placeholder="Contract / Order ref (optional)"
                    style={{ height: 42, width: '100%', fontSize: 13 }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--c3)', whiteSpace: 'nowrap' }}>Due days</span>
                  <input
                    type="number" min={1}
                    value={block.due_days}
                    onChange={e => updateBlock(block._key, 'due_days', parseInt(e.target.value) || 30)}
                    style={{ height: 42, width: 72, fontSize: 13, textAlign: 'center' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
                  {blockTotal > 0 && (
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtEuro(blockTotal)}
                    </span>
                  )}
                  {blocks.length > 1 && (
                    <button
                      onClick={() => removeBlock(block._key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c4)', fontSize: 20, lineHeight: 1, padding: '0 4px', transition: 'color 0.15s' }}
                      title="Remove client"
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--c4)')}
                    >×</button>
                  )}
                </div>
              </div>

              {/* Services table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--c7)', borderBottom: '1px solid var(--c6)' }}>
                    <th style={{ padding: '9px 20px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)', width: 100, whiteSpace: 'nowrap' }}>PN</th>
                    <th style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)', width: '100%' }}>Description *</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)', width: 80, whiteSpace: 'nowrap' }}>Qty</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)', width: 130, whiteSpace: 'nowrap' }}>Unit price €</th>
                    <th style={{ padding: '9px 20px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--c3)', width: 120, whiteSpace: 'nowrap' }}>Total</th>
                    <th style={{ width: 44 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {block.services.map((svc) => (
                    <tr key={svc._key} style={{ borderBottom: '1px solid var(--c6)' }}>
                      <td style={{ padding: '10px 20px' }}>
                        <input
                          value={svc.pn}
                          onChange={e => updateService(block._key, svc._key, 'pn', e.target.value)}
                          style={{ height: 38, width: '100%', fontSize: 13, fontFamily: 'monospace' }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                      <td style={{ padding: '10px 12px' }}>
                        <input
                          type="number" min={1}
                          value={svc.quantity}
                          onChange={e => updateService(block._key, svc._key, 'quantity', parseFloat(e.target.value) || 1)}
                          style={{ height: 38, width: '100%', fontSize: 13, textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <input
                          type="number" min={0} step="0.01"
                          value={svc.unit_price}
                          onChange={e => updateService(block._key, svc._key, 'unit_price', parseFloat(e.target.value) || 0)}
                          style={{ height: 38, width: '100%', fontSize: 13, textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 600, fontSize: 14, fontVariantNumeric: 'tabular-nums', color: 'var(--c1)', whiteSpace: 'nowrap' }}>
                        {fmtEuro(svc.quantity * svc.unit_price)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => removeService(block._key, svc._key)}
                          disabled={block.services.length === 1}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: block.services.length === 1 ? 'var(--c5)' : 'var(--c4)',
                            fontSize: 18, lineHeight: 1, padding: '2px 4px',
                            transition: 'color 0.15s',
                          }}
                          onMouseEnter={e => block.services.length > 1 && (e.currentTarget.style.color = 'var(--red)')}
                          onMouseLeave={e => (e.currentTarget.style.color = block.services.length === 1 ? 'var(--c5)' : 'var(--c4)')}
                        >×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--c7)' }}>
                    <td colSpan={3} style={{ padding: '10px 20px' }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => addService(block._key)}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add service
                      </button>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Subtotal
                    </td>
                    <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700, fontSize: 15, color: 'var(--navy)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmtEuro(blockTotal)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        })}

        {/* ── Add client ────────────────────────────────────────────────────── */}
        <div>
          <button className="btn btn-secondary btn-sm" onClick={addBlock}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add another client
          </button>
        </div>

      </div>
    </div>
  )
}
