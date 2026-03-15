import { useEffect, useState } from 'react'
import { usePipelineStore } from '../stores/pipeline'
import { toast } from '../lib/toast'
import type { PipelineItem } from '../lib/types'
import { Select } from '../components/Select'

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

const STATUS_BADGE: Record<string, string> = {
  proposal: 'badge-amber',
  won:      'badge-green',
  lost:     'badge-red',
}

function Modal({ open, title, onClose, children, footer }: {
  open: boolean; title: string
  onClose: () => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
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
  const store = usePipelineStore()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PipelineItem | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('active')
  const [deleteTarget, setDeleteTarget] = useState<PipelineItem | null>(null)

  useEffect(() => {
    store.fetchAll()
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

  const items = store.items
  const filtered = filter === 'active'
    ? items.filter(i => i.status !== 'won' && i.status !== 'lost')
    : filter === 'won'  ? items.filter(i => i.status === 'won')
    : filter === 'lost' ? items.filter(i => i.status === 'lost')
    : items

  const activeItems = items.filter(i => i.status !== 'won' && i.status !== 'lost')
  const totalFace = activeItems.reduce((s, i) => s + dealTotal(i), 0)
  const totalWeighted = activeItems.reduce((s, i) => s + dealTotal(i) * i.probability / 100, 0)
  const totalWon = items.filter(i => i.status === 'won').reduce((s, i) => s + dealTotal(i), 0)

  // Forecast by month
  const forecastMap = new Map<string, { face: number; weighted: number; count: number }>()
  for (const item of activeItems) {
    const prob = item.probability / 100
    if (item.deal_type === 'fixed' && item.monthly_schedule?.length) {
      for (const row of item.monthly_schedule) {
        const key = row.month.length === 7 ? row.month + '-01' : row.month
        if (!forecastMap.has(key)) forecastMap.set(key, { face: 0, weighted: 0, count: 0 })
        const g = forecastMap.get(key)!
        g.face += row.amount
        g.weighted += row.amount * prob
        g.count += 1
      }
    } else if (item.deal_type === 'monthly' && item.expected_month && item.expected_end_month) {
      const amt = item.estimated_amount ?? 0
      const s = new Date(item.expected_month + 'T00:00:00')
      const e = new Date(item.expected_end_month + 'T00:00:00')
      const cur = new Date(s)
      while (cur <= e) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-01`
        if (!forecastMap.has(key)) forecastMap.set(key, { face: 0, weighted: 0, count: 0 })
        const g = forecastMap.get(key)!
        g.face += amt
        g.weighted += amt * prob
        g.count += 1
        cur.setMonth(cur.getMonth() + 1)
      }
    } else if (item.expected_month) {
      const amt = item.estimated_amount ?? 0
      const key = item.expected_month.length === 7 ? item.expected_month + '-01' : item.expected_month
      if (!forecastMap.has(key)) forecastMap.set(key, { face: 0, weighted: 0, count: 0 })
      const g = forecastMap.get(key)!
      g.face += amt
      g.weighted += amt * prob
      g.count += 1
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
      <div className="page-header">
        <div>
          <h1>Sales Pipeline</h1>
          <p style={{ color: 'var(--c3)', fontSize: 13, margin: 0 }}>Track pitches and proposals for revenue forecasting</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add deal</button>
      </div>

      <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="stat-card" style={{ '--left-color': 'var(--amber, #d97706)' } as React.CSSProperties}>
          <div className="stat-card-label">ACTIVE DEALS</div>
          <div className="stat-card-value">{activeItems.length}</div>
          <div className="stat-card-sub">{items.length} total</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--navy)' } as React.CSSProperties}>
          <div className="stat-card-label">PIPELINE (FACE VALUE)</div>
          <div className="stat-card-value" style={{ color: 'var(--navy)' }}>{fmtEuro(totalFace)}</div>
          <div className="stat-card-sub">all active deals</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--blue)' } as React.CSSProperties}>
          <div className="stat-card-label">WEIGHTED FORECAST</div>
          <div className="stat-card-value" style={{ color: 'var(--blue)' }}>{fmtEuro(Math.round(totalWeighted))}</div>
          <div className="stat-card-sub">probability-adjusted</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--green)' } as React.CSSProperties}>
          <div className="stat-card-label">WON</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>{fmtEuro(totalWon)}</div>
          <div className="stat-card-sub">{items.filter(i => i.status === 'won').length} deals closed</div>
        </div>
      </div>

      <div className="page-content">
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {(['active', 'all', 'won', 'lost'] as const).map(opt => (
            <button
              key={opt}
              className={`btn btn-sm ${filter === opt ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter(opt)}
              style={{ textTransform: 'capitalize' }}
            >
              {opt}
            </button>
          ))}
        </div>

        <div className="card">
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              No {filter === 'active' ? 'active ' : ''}deals.{' '}
              <span className="table-link" onClick={openAdd}>Add one</span>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>STATUS</th>
                  <th>COMPANY</th>
                  <th>TITLE</th>
                  <th>TYPE</th>
                  <th className="th-right">AMOUNT</th>
                  <th className="th-right">PROB</th>
                  <th className="th-right">WEIGHTED</th>
                  <th>PERIOD</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const name = item.company_name ?? item.client?.name ?? '—'
                  const total = dealTotal(item)
                  const weighted = total * item.probability / 100
                  return (
                    <tr key={item.id}>
                      <td>
                        <span className={`badge ${STATUS_BADGE[item.status] ?? 'badge-gray'}`} style={{ fontSize: 10, textTransform: 'capitalize' }}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--c1)', fontWeight: 600 }}>{name}</td>
                      <td style={{ fontWeight: 700 }}>
                        {item.title}
                        {item.description && (
                          <div style={{ fontSize: 11, color: 'var(--c4)', fontWeight: 400, marginTop: 2 }}>{item.description}</div>
                        )}
                      </td>
                      <td>
                        {item.deal_type === 'monthly'
                          ? <span className="badge badge-blue" style={{ fontSize: 10 }}>Monthly</span>
                          : item.deal_type === 'fixed'
                          ? <span className="badge badge-navy" style={{ fontSize: 10 }}>Fixed</span>
                          : <span className="badge badge-gray" style={{ fontSize: 10 }}>One-time</span>}
                      </td>
                      <td className="td-right text-mono">
                        {item.deal_type === 'fixed' && item.monthly_schedule?.length ? (
                          fmtEuro(total)
                        ) : item.estimated_amount ? (
                          item.deal_type === 'monthly'
                            ? <>{fmtEuro(item.estimated_amount)}<span style={{ color: 'var(--c4)', fontSize: 11 }}>/mo</span></>
                            : fmtEuro(item.estimated_amount)
                        ) : '—'}
                      </td>
                      <td className="td-right">
                        <span style={{
                          fontSize: 12, fontWeight: 700,
                          color: item.probability >= 75 ? 'var(--green)' : item.probability >= 50 ? 'var(--navy)' : 'var(--amber, #d97706)'
                        }}>
                          {item.probability}%
                        </span>
                      </td>
                      <td className="td-right text-mono" style={{ color: 'var(--navy)', fontWeight: 600 }}>
                        {total > 0 ? fmtEuro(Math.round(weighted)) : '—'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--c2)' }}>
                        {item.deal_type === 'fixed' && item.monthly_schedule?.length ? (
                          <span style={{ fontSize: 11, color: 'var(--c4)' }}>
                            {item.monthly_schedule.length} payment{item.monthly_schedule.length !== 1 ? 's' : ''}
                          </span>
                        ) : item.expected_month
                          ? item.deal_type === 'monthly' && item.expected_end_month
                            ? `${fmtMonth(item.expected_month)} – ${fmtMonth(item.expected_end_month)}`
                            : fmtMonth(item.expected_month)
                          : '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button className="btn btn-secondary btn-xs" onClick={() => openEdit(item)}>Edit</button>
                          <button
                            className="btn btn-xs"
                            style={{ color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                            onClick={() => setDeleteTarget(item)}
                          >✕</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Forecast by month */}
        {forecastRows.length > 0 && (
          <>
            <div className="section-bar" style={{ marginTop: 24, marginBottom: 10 }}>
              <h2>Forecast by Month</h2>
              <span style={{ fontSize: 12, color: 'var(--c4)' }}>active deals only · probability-weighted</span>
            </div>
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>MONTH</th>
                    <th className="th-right">DEALS</th>
                    <th className="th-right">FACE VALUE</th>
                    <th className="th-right">WEIGHTED</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastRows.map(([key, g]) => (
                    <tr key={key}>
                      <td style={{ fontWeight: 600 }}>{fmtMonth(key)}</td>
                      <td className="td-right text-mono" style={{ color: 'var(--c3)' }}>{g.count}</td>
                      <td className="td-right text-mono">{fmtEuro(g.face)}</td>
                      <td className="td-right text-mono" style={{ color: 'var(--navy)', fontWeight: 700 }}>{fmtEuro(Math.round(g.weighted))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--c7)', borderTop: '2px solid var(--c6)' }}>
                    <td style={{ fontWeight: 700, fontSize: 12, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</td>
                    <td className="td-right text-mono" style={{ color: 'var(--c3)' }}>{activeItems.length}</td>
                    <td className="td-right text-mono" style={{ fontWeight: 700 }}>{fmtEuro(totalFace)}</td>
                    <td className="td-right text-mono" style={{ fontWeight: 700, color: 'var(--navy)' }}>{fmtEuro(Math.round(totalWeighted))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Add / Edit modal */}
      <Modal
        open={showModal}
        title={editing ? 'Edit deal' : 'Add deal'}
        onClose={() => setShowModal(false)}
        footer={
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={save}
              disabled={saving || !form.company_name || !form.title}
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add deal'}
            </button>
          </>
        }
      >
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Company / Prospect *</label>
          <input value={form.company_name} onChange={f('company_name')} placeholder="e.g. Acme Corp" autoFocus={!editing} />
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Title *</label>
          <input value={form.title} onChange={f('title')} placeholder="e.g. Website redesign" />
        </div>
        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Description</label>
          <input value={form.description} onChange={f('description')} placeholder="Short description" />
        </div>

        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label">Status</label>
            <Select
              value={form.status}
              onChange={v => setForm(p => ({ ...p, status: v as PipelineItem['status'] }))}
              options={STATUS_OPTS}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Probability</label>
            <Select
              value={form.probability}
              onChange={v => setForm(p => ({ ...p, probability: v }))}
              options={PROB_OPTS}
            />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Deal type</label>
          <Select
            value={form.deal_type}
            onChange={v => setForm(p => ({ ...p, deal_type: v as 'one_time' | 'monthly' | 'fixed' }))}
            options={TYPE_OPTS}
          />
        </div>

        {form.deal_type !== 'fixed' && (
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">
                {form.deal_type === 'monthly' ? 'Amount / month (€)' : 'Amount (€)'}
              </label>
              <input type="number" value={form.estimated_amount} onChange={f('estimated_amount')} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">
                {form.deal_type === 'monthly' ? 'Start month' : 'Expected month'}
              </label>
              <input type="month" value={form.expected_month} onChange={f('expected_month')} />
            </div>
          </div>
        )}

        {form.deal_type === 'monthly' && (
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">End month</label>
            <input type="month" value={form.expected_end_month} onChange={f('expected_end_month')} />
            {form.expected_month && form.expected_end_month && (() => {
              const count = monthCount(form.expected_month + '-01', form.expected_end_month + '-01')
              const total = Number(form.estimated_amount || 0) * count
              return (
                <div className="form-hint">
                  {count} month{count !== 1 ? 's' : ''} · total {fmtEuro(total)}
                </div>
              )
            })()}
          </div>
        )}

        {form.deal_type === 'fixed' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label className="form-label" style={{ margin: 0 }}>Payment schedule</label>
              <button className="btn btn-secondary btn-xs" onClick={addScheduleRow} type="button">+ Add month</button>
            </div>
            {form.schedule.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--c4)', padding: '10px 0' }}>No payments added yet.</div>
            )}
            {form.schedule.map((row, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <input
                  type="month"
                  value={row.month}
                  onChange={e => updateScheduleRow(i, 'month', e.target.value)}
                  style={{ flex: 1 }}
                />
                <div style={{ position: 'relative', flex: 1 }}>
                  <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--c3)', fontSize: 13, pointerEvents: 'none' }}>€</span>
                  <input
                    type="number"
                    value={row.amount}
                    onChange={e => updateScheduleRow(i, 'amount', e.target.value)}
                    placeholder="0"
                    style={{ paddingLeft: 22, width: '100%' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeScheduleRow(i)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c4)', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
                >×</button>
              </div>
            ))}
            {form.schedule.length > 0 && (
              <div className="form-hint" style={{ textAlign: 'right' }}>
                Total: {fmtEuro(fixedScheduleTotal())}
              </div>
            )}
          </div>
        )}

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Notes</label>
          <textarea value={form.notes} onChange={f('notes')} rows={2} placeholder="Any context or details…" />
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal
        open={!!deleteTarget}
        title="Remove deal"
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <button className="btn btn-secondary btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button
              className="btn btn-primary btn-sm"
              style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
              onClick={confirmDelete}
            >
              Remove
            </button>
          </>
        }
      >
        <p>Remove <strong>{deleteTarget?.title}</strong>? This cannot be undone.</p>
      </Modal>
    </div>
  )
}
