import { useState, useRef, useCallback } from 'react'
import { getBoilerplate } from '../../lib/offerBoilerplate'
import type { OfferSection, OfferBlock, OfferLanguage } from '../../lib/types'
import { v4 as uuidv4 } from 'uuid'
import { Button } from '../../components/ui/button'

interface BlockEditorProps {
  block: OfferBlock
  onChange: (b: OfferBlock) => void
  onDelete: () => void
}

// ─── Shared Helpers ───────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--navy)] bg-white'
const TEXTAREA_CLS = `${INPUT_CLS} resize-none`
const LABEL_CLS = 'text-xs text-muted-foreground block mb-1'
const BLOCK_HEADER_CLS = 'flex items-center justify-between px-4 py-2 border-b border-border bg-[#fafaf8]'
const BLOCK_LABEL_CLS = 'text-xs font-bold uppercase tracking-widest'
const REMOVE_BTN_CLS = 'text-xs text-muted-foreground hover:text-red-500 transition-colors'

function BlockShell({ label, onDelete, children }: { label: string; onDelete: () => void; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg mb-3 overflow-hidden bg-white">
      <div className={BLOCK_HEADER_CLS}>
        <span className={BLOCK_LABEL_CLS} style={{ color: '#E85C1A' }}>{label}</span>
        <button onClick={onDelete} className={REMOVE_BTN_CLS}>Remove</button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function AddRowBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs border border-dashed rounded px-3 py-1 transition-colors hover:bg-white mt-2"
      style={{ borderColor: '#E85C1A', color: '#E85C1A' }}
    >
      + Add item
    </button>
  )
}

function RemoveRowBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs text-muted-foreground hover:text-red-500 mt-1">× Remove</button>
  )
}

// ─── Rich Text Editor (paragraph only) ───────────────────────────────────────

function RichTextEditor({ block, onChange, onDelete }: BlockEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isFirstRender = useRef(true)

  // Seed content on first render via ref (avoids dangerouslySetInnerHTML)
  const seedContent = useCallback((node: HTMLDivElement | null) => {
    if (!node || !isFirstRender.current) return
    isFirstRender.current = false
    const c = block.content
    if (!c) return
    node.innerHTML = /<[a-z][\s\S]*>/i.test(c)
      ? c
      : c.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const applyFormat = useCallback((cmd: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, undefined) // eslint-disable-line
  }, [])

  function handleInput() {
    if (editorRef.current) onChange({ ...block, content: editorRef.current.innerHTML })
  }

  const btnCls = 'w-7 h-7 flex items-center justify-center text-sm rounded hover:bg-white border border-transparent hover:border-border transition-colors text-primary select-none'

  return (
    <div className="border border-border rounded-lg mb-3 overflow-hidden bg-white">
      <div className={BLOCK_HEADER_CLS}>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">PARAGRAPH</span>
        <button onClick={onDelete} className={REMOVE_BTN_CLS}>Remove</button>
      </div>
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-[#fafaf8]">
        <button type="button" title="Bold" onMouseDown={e => { e.preventDefault(); applyFormat('bold') }} className={btnCls} style={{ fontWeight: 700 }}>B</button>
        <button type="button" title="Italic" onMouseDown={e => { e.preventDefault(); applyFormat('italic') }} className={btnCls} style={{ fontStyle: 'italic' }}>I</button>
        <button type="button" title="Underline" onMouseDown={e => { e.preventDefault(); applyFormat('underline') }} className={btnCls} style={{ textDecoration: 'underline' }}>U</button>
        <div className="w-px h-4 bg-border mx-1" />
        <button type="button" title="Bullet list" onMouseDown={e => { e.preventDefault(); applyFormat('insertUnorderedList') }} className={btnCls}>≡</button>
        <button type="button" title="Clear formatting" onMouseDown={e => { e.preventDefault(); applyFormat('removeFormat') }} className={`${btnCls} text-muted-foreground`}>✕</button>
      </div>
      <div
        ref={node => { editorRef.current = node; seedContent(node) }}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        className="w-full px-4 py-3 text-sm leading-relaxed bg-white text-primary focus:outline-none min-h-[100px]"
        style={{ wordBreak: 'break-word' }}
      />
    </div>
  )
}

// ─── Text / Bullet / Goal Editors ─────────────────────────────────────────────

function TextBlockEditor({ block, onChange, onDelete }: BlockEditorProps) {
  if (block.type === 'paragraph') return <RichTextEditor block={block} onChange={onChange} onDelete={onDelete} />

  const labelMap: Partial<Record<OfferBlock['type'], string>> = {
    'bullet-list': 'BULLET LIST',
    'goal-list': 'GOAL LIST',
    boilerplate: 'BOILERPLATE',
    notes: 'NOTES',
    'info-box': 'INFO BOX',
  }

  return (
    <div className="border border-border rounded-lg mb-3 overflow-hidden bg-white">
      <div className={BLOCK_HEADER_CLS}>
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {labelMap[block.type] ?? block.type}
        </span>
        <button onClick={onDelete} className={REMOVE_BTN_CLS}>Remove</button>
      </div>
      <textarea
        className="w-full px-4 py-3 text-sm focus:outline-none resize-none leading-relaxed bg-white text-primary"
        rows={block.type === 'notes' || block.type === 'info-box' ? 5 : 4}
        value={block.content}
        onChange={e => onChange({ ...block, content: e.target.value })}
        placeholder={
          block.type === 'bullet-list' ? 'One item per line…'
          : block.type === 'goal-list' ? 'One goal per line…'
          : 'Write something…'
        }
      />
    </div>
  )
}

// ─── Phase Block ──────────────────────────────────────────────────────────────

function PhaseBlockEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let parsed: { tag: string; title: string; deadline: string; items: string[]; deliverables: string[] } = {
    tag: '', title: '', deadline: '', items: [], deliverables: [],
  }
  try { parsed = { ...parsed, ...JSON.parse(block.content) } } catch { /* ok */ }

  function save(updated: typeof parsed) {
    onChange({ ...block, content: JSON.stringify(updated) })
  }

  return (
    <BlockShell label="Phase" onDelete={onDelete}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className={LABEL_CLS}>Tag (e.g. FAZA 1)</label>
          <input className={INPUT_CLS} value={parsed.tag} onChange={e => save({ ...parsed, tag: e.target.value })} />
        </div>
        <div>
          <label className={LABEL_CLS}>Deadline</label>
          <input className={INPUT_CLS} value={parsed.deadline} onChange={e => save({ ...parsed, deadline: e.target.value })} />
        </div>
      </div>
      <div className="mb-3">
        <label className={LABEL_CLS}>Phase title</label>
        <input className={INPUT_CLS} value={parsed.title} onChange={e => save({ ...parsed, title: e.target.value })} />
      </div>
      <div className="mb-3">
        <label className={LABEL_CLS}>Items (one per line)</label>
        <textarea className={TEXTAREA_CLS} rows={4} value={parsed.items.join('\n')}
          onChange={e => save({ ...parsed, items: e.target.value.split('\n') })} />
      </div>
      <div>
        <label className={LABEL_CLS}>Deliverables (one per line)</label>
        <textarea className={TEXTAREA_CLS} rows={3} value={(parsed.deliverables ?? []).join('\n')}
          onChange={e => save({ ...parsed, deliverables: e.target.value.split('\n') })} />
      </div>
    </BlockShell>
  )
}

// ─── Pricing Table ────────────────────────────────────────────────────────────

function PricingTableEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let parsed: { rows: { label: string; qty: string; rate: string; total: string }[]; grandTotal: string } = {
    rows: [{ label: '', qty: '', rate: '', total: '' }],
    grandTotal: '',
  }
  try { parsed = { ...parsed, ...JSON.parse(block.content) } } catch { /* ok */ }

  function computeGrandTotal(rows: typeof parsed.rows): string {
    const sum = rows.reduce((acc, r) => {
      const qty = parseFloat(r.qty) || 0
      const rate = parseFloat(r.rate) || 0
      const rowTotal = parseFloat(r.total) || (qty * rate)
      return acc + rowTotal
    }, 0)
    return sum > 0 ? sum.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR' : ''
  }

  function save(rows: typeof parsed.rows) {
    onChange({ ...block, content: JSON.stringify({ rows, grandTotal: computeGrandTotal(rows) }) })
  }

  function addRow() { save([...parsed.rows, { label: '', qty: '', rate: '', total: '' }]) }
  function removeRow(i: number) { save(parsed.rows.filter((_, idx) => idx !== i)) }

  function updateRow(i: number, key: keyof typeof parsed.rows[0], val: string) {
    const rows = parsed.rows.map((r, idx) => {
      if (idx !== i) return r
      const updated = { ...r, [key]: val }
      if (key === 'qty' || key === 'rate') {
        const qty = parseFloat(key === 'qty' ? val : r.qty) || 0
        const rate = parseFloat(key === 'rate' ? val : r.rate) || 0
        updated.total = qty > 0 && rate > 0 ? String(qty * rate) : updated.total
      }
      return updated
    })
    save(rows)
  }

  const grandTotal = computeGrandTotal(parsed.rows)

  return (
    <div className="border border-border rounded-lg mb-3 overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-[#fafaf8]">
        <span className={BLOCK_LABEL_CLS} style={{ color: '#E85C1A' }}>Pricing Table</span>
        <button onClick={onDelete} className={REMOVE_BTN_CLS}>Remove</button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-[#fafaf8]">
            <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">SERVICE</th>
            <th className="px-3 py-2 text-xs font-semibold text-muted-foreground w-28">QTY</th>
            <th className="px-3 py-2 text-xs font-semibold text-muted-foreground w-32">RATE</th>
            <th className="px-3 py-2 text-xs font-semibold text-muted-foreground w-36">TOTAL</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {parsed.rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              <td className="px-2 py-1.5">
                <input className={`${INPUT_CLS}`} value={row.label} onChange={e => updateRow(i, 'label', e.target.value)} placeholder="Service name…" />
              </td>
              <td className="px-2 py-1.5">
                <input className={`${INPUT_CLS} text-right`} value={row.qty} onChange={e => updateRow(i, 'qty', e.target.value)} placeholder="0" />
              </td>
              <td className="px-2 py-1.5">
                <input className={`${INPUT_CLS} text-right`} value={row.rate} onChange={e => updateRow(i, 'rate', e.target.value)} placeholder="0" />
              </td>
              <td className="px-2 py-1.5">
                <input className={`${INPUT_CLS} text-right font-medium`} value={row.total} onChange={e => updateRow(i, 'total', e.target.value)} placeholder="0" />
              </td>
              <td className="pr-2">
                <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-red-500 text-base leading-none">×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2 border-t border-border flex items-center justify-between bg-[#fafaf8]">
        <button onClick={addRow} className="text-xs border border-dashed rounded px-3 py-1 transition-colors hover:bg-white" style={{ borderColor: '#E85C1A', color: '#E85C1A' }}>
          + Row
        </button>
        {grandTotal && <div className="text-sm font-semibold text-primary">Total: <span style={{ color: '#E85C1A' }}>{grandTotal}</span></div>}
      </div>
    </div>
  )
}

// ─── Pillar Block ─────────────────────────────────────────────────────────────

type PillarItem = { num: string; title: string; text: string; bullets: string; asideLabel: string; asideItems: string }

function parsePillars(content: string): PillarItem[] {
  try {
    const raw = JSON.parse(content)
    const arr = Array.isArray(raw) ? raw : [raw]
    return arr.map(p => ({
      num: p.num ?? '',
      title: p.title ?? '',
      text: p.text ?? '',
      bullets: (p.bullets ?? []).join('\n'),
      asideLabel: p.asideLabel ?? p.aside_label ?? '',
      asideItems: (p.asideItems ?? p.aside_items ?? []).join('\n'),
    }))
  } catch { return [{ num: '', title: '', text: '', bullets: '', asideLabel: '', asideItems: '' }] }
}

function savePillars(pillars: PillarItem[]): string {
  return JSON.stringify(pillars.map(p => ({
    num: p.num, title: p.title, text: p.text,
    bullets: p.bullets.split('\n').filter(Boolean),
    asideLabel: p.asideLabel,
    asideItems: p.asideItems.split('\n').filter(Boolean),
  })))
}

function PillarBlockEditor({ block, onChange, onDelete }: BlockEditorProps) {
  const pillars = parsePillars(block.content)

  function updatePillar(i: number, updated: PillarItem) {
    onChange({ ...block, content: savePillars(pillars.map((p, idx) => idx === i ? updated : p)) })
  }

  return (
    <BlockShell label="Pillar Block" onDelete={onDelete}>
      {pillars.map((p, i) => (
        <div key={i} className="border border-border rounded p-3 mb-3 bg-[#fafaf8]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-orange-600">Pillar {i + 1}</span>
            {pillars.length > 1 && <RemoveRowBtn onClick={() => onChange({ ...block, content: savePillars(pillars.filter((_, idx) => idx !== i)) })} />}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className={LABEL_CLS}>Number</label>
              <input className={INPUT_CLS} value={p.num} onChange={e => updatePillar(i, { ...p, num: e.target.value })} placeholder="01" />
            </div>
            <div>
              <label className={LABEL_CLS}>Title</label>
              <input className={INPUT_CLS} value={p.title} onChange={e => updatePillar(i, { ...p, title: e.target.value })} />
            </div>
          </div>
          <div className="mb-2">
            <label className={LABEL_CLS}>Body text</label>
            <textarea className={TEXTAREA_CLS} rows={3} value={p.text} onChange={e => updatePillar(i, { ...p, text: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={LABEL_CLS}>Aside label</label>
              <input className={INPUT_CLS} value={p.asideLabel} onChange={e => updatePillar(i, { ...p, asideLabel: e.target.value })} />
            </div>
            <div>
              <label className={LABEL_CLS}>Aside items (one per line)</label>
              <textarea className={TEXTAREA_CLS} rows={3} value={p.asideItems} onChange={e => updatePillar(i, { ...p, asideItems: e.target.value })} />
            </div>
          </div>
        </div>
      ))}
      <AddRowBtn onClick={() => onChange({ ...block, content: savePillars([...pillars, { num: '', title: '', text: '', bullets: '', asideLabel: '', asideItems: '' }]) })} />
    </BlockShell>
  )
}

// ─── Audience Grid ────────────────────────────────────────────────────────────

function AudienceGridEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let cards: { role: string; need: string; highlight: boolean }[] = [{ role: '', need: '', highlight: false }]
  try {
    const raw = JSON.parse(block.content)
    cards = Array.isArray(raw) ? raw : (raw.cards ?? cards)
  } catch { /* ok */ }

  function save(updated: typeof cards) {
    onChange({ ...block, content: JSON.stringify(updated) })
  }

  return (
    <BlockShell label="Audience Grid" onDelete={onDelete}>
      {cards.map((c, i) => (
        <div key={i} className="border border-border rounded p-3 mb-2 bg-[#fafaf8]">
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className={LABEL_CLS}>Role</label>
              <input className={INPUT_CLS} value={c.role} onChange={e => save(cards.map((x, idx) => idx === i ? { ...x, role: e.target.value } : x))} />
            </div>
            <div>
              <label className={LABEL_CLS}>Need</label>
              <input className={INPUT_CLS} value={c.need} onChange={e => save(cards.map((x, idx) => idx === i ? { ...x, need: e.target.value } : x))} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={c.highlight} onChange={e => save(cards.map((x, idx) => idx === i ? { ...x, highlight: e.target.checked } : x))} />
              Highlight (dark)
            </label>
            <RemoveRowBtn onClick={() => save(cards.filter((_, idx) => idx !== i))} />
          </div>
        </div>
      ))}
      <AddRowBtn onClick={() => save([...cards, { role: '', need: '', highlight: false }])} />
    </BlockShell>
  )
}

// ─── Func Grid ────────────────────────────────────────────────────────────────

function FuncGridEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let items: { num: string; title: string; desc: string; tags: string; wide: boolean }[] = [{ num: '', title: '', desc: '', tags: '', wide: false }]
  try {
    const raw = JSON.parse(block.content)
    const arr = Array.isArray(raw) ? raw : (raw.items ?? [])
    items = arr.map((it: { num?: string; title: string; desc: string; tags?: string[]; wide?: boolean }) => ({
      num: it.num ?? '', title: it.title, desc: it.desc, tags: (it.tags ?? []).join(', '), wide: it.wide ?? false,
    }))
  } catch { /* ok */ }

  function save(updated: typeof items) {
    onChange({ ...block, content: JSON.stringify({
      items: updated.map(it => ({
        num: it.num, title: it.title, desc: it.desc,
        tags: it.tags.split(',').map(t => t.trim()).filter(Boolean),
        wide: it.wide,
      })),
    }) })
  }

  return (
    <BlockShell label="Functionality Grid" onDelete={onDelete}>
      {items.map((it, i) => (
        <div key={i} className="border border-border rounded p-3 mb-2 bg-[#fafaf8]">
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className={LABEL_CLS}>Num</label>
              <input className={INPUT_CLS} value={it.num} onChange={e => save(items.map((x, idx) => idx === i ? { ...x, num: e.target.value } : x))} placeholder="01" />
            </div>
            <div>
              <label className={LABEL_CLS}>Title</label>
              <input className={INPUT_CLS} value={it.title} onChange={e => save(items.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))} />
            </div>
          </div>
          <div className="mb-2">
            <label className={LABEL_CLS}>Description</label>
            <textarea className={TEXTAREA_CLS} rows={2} value={it.desc} onChange={e => save(items.map((x, idx) => idx === i ? { ...x, desc: e.target.value } : x))} />
          </div>
          <div className="mb-2">
            <label className={LABEL_CLS}>Tags (comma-separated)</label>
            <input className={INPUT_CLS} value={it.tags} onChange={e => save(items.map((x, idx) => idx === i ? { ...x, tags: e.target.value } : x))} />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={it.wide} onChange={e => save(items.map((x, idx) => idx === i ? { ...x, wide: e.target.checked } : x))} />
              Wide (full row)
            </label>
            <RemoveRowBtn onClick={() => save(items.filter((_, idx) => idx !== i))} />
          </div>
        </div>
      ))}
      <AddRowBtn onClick={() => save([...items, { num: '', title: '', desc: '', tags: '', wide: false }])} />
    </BlockShell>
  )
}

// ─── Service Block ────────────────────────────────────────────────────────────

function ServiceBlockEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let parsed: { title: string; items: { name: string; desc: string }[]; outputs: string } = {
    title: '', items: [{ name: '', desc: '' }], outputs: '',
  }
  try {
    const p = JSON.parse(block.content)
    parsed = { title: p.title ?? '', items: p.items ?? [{ name: '', desc: '' }], outputs: (p.outputs ?? []).join('\n') }
  } catch { /* ok */ }

  function save(updated: typeof parsed) {
    onChange({ ...block, content: JSON.stringify({
      title: updated.title,
      items: updated.items,
      outputs: updated.outputs.split('\n').filter(Boolean),
    }) })
  }

  return (
    <BlockShell label="Service Block" onDelete={onDelete}>
      <div className="mb-3">
        <label className={LABEL_CLS}>Service title</label>
        <input className={INPUT_CLS} value={parsed.title} onChange={e => save({ ...parsed, title: e.target.value })} />
      </div>
      <div className="mb-3">
        <div className="text-xs font-semibold text-muted-foreground mb-2">Items</div>
        {parsed.items.map((it, i) => (
          <div key={i} className="border border-border rounded p-2 mb-2 bg-[#fafaf8]">
            <div className="mb-1">
              <label className={LABEL_CLS}>Name</label>
              <input className={INPUT_CLS} value={it.name} onChange={e => save({ ...parsed, items: parsed.items.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x) })} />
            </div>
            <div>
              <label className={LABEL_CLS}>Description</label>
              <textarea className={TEXTAREA_CLS} rows={2} value={it.desc} onChange={e => save({ ...parsed, items: parsed.items.map((x, idx) => idx === i ? { ...x, desc: e.target.value } : x) })} />
            </div>
            <RemoveRowBtn onClick={() => save({ ...parsed, items: parsed.items.filter((_, idx) => idx !== i) })} />
          </div>
        ))}
        <AddRowBtn onClick={() => save({ ...parsed, items: [...parsed.items, { name: '', desc: '' }] })} />
      </div>
      <div>
        <label className={LABEL_CLS}>Outputs (one per line)</label>
        <textarea className={TEXTAREA_CLS} rows={2} value={parsed.outputs} onChange={e => save({ ...parsed, outputs: e.target.value })} />
      </div>
    </BlockShell>
  )
}

// ─── Extra Card ───────────────────────────────────────────────────────────────

type ExtraCardItem = { tag: string; title: string; price: string; priceLabel: string; desc: string; valueLabel: string; valueText: string; includes: string }

function parseExtraCards(content: string): ExtraCardItem[] {
  try {
    const raw = JSON.parse(content)
    const arr = Array.isArray(raw) ? raw : [raw]
    return arr.map(c => ({
      tag: c.tag ?? '',
      title: c.title ?? '',
      price: c.price ?? '',
      priceLabel: c.priceLabel ?? c.price_label ?? '',
      desc: c.desc ?? '',
      valueLabel: c.valueLabel ?? c.value_label ?? '',
      valueText: c.valueText ?? c.value ?? '',
      includes: (c.includes ?? c.tags ?? []).join(', '),
    }))
  } catch { return [{ tag: '', title: '', price: '', priceLabel: '', desc: '', valueLabel: '', valueText: '', includes: '' }] }
}

function saveExtraCards(cards: ExtraCardItem[]): string {
  return JSON.stringify(cards.map(c => ({
    tag: c.tag,
    title: c.title,
    price: c.price,
    priceLabel: c.priceLabel,
    desc: c.desc,
    valueLabel: c.valueLabel,
    valueText: c.valueText,
    includes: c.includes.split(',').map(t => t.trim()).filter(Boolean),
  })))
}

function ExtraCardEditor({ block, onChange, onDelete }: BlockEditorProps) {
  const cards = parseExtraCards(block.content)

  function updateCard(i: number, updated: ExtraCardItem) {
    const next = cards.map((c, idx) => idx === i ? updated : c)
    onChange({ ...block, content: saveExtraCards(next) })
  }

  return (
    <BlockShell label="Extra Card" onDelete={onDelete}>
      {cards.map((c, i) => (
        <div key={i} className="border border-border rounded p-3 mb-3 bg-[#fafaf8]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-orange-600">Card {i + 1}</span>
            {cards.length > 1 && <RemoveRowBtn onClick={() => onChange({ ...block, content: saveExtraCards(cards.filter((_, idx) => idx !== i)) })} />}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className={LABEL_CLS}>Tag (e.g. OPCIJA A)</label>
              <input className={INPUT_CLS} value={c.tag} onChange={e => updateCard(i, { ...c, tag: e.target.value })} />
            </div>
            <div>
              <label className={LABEL_CLS}>Title</label>
              <input className={INPUT_CLS} value={c.title} onChange={e => updateCard(i, { ...c, title: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className={LABEL_CLS}>Price</label>
              <input className={INPUT_CLS} value={c.price} onChange={e => updateCard(i, { ...c, price: e.target.value })} placeholder="€1.500" />
            </div>
            <div>
              <label className={LABEL_CLS}>Value label</label>
              <input className={INPUT_CLS} value={c.valueLabel} onChange={e => updateCard(i, { ...c, valueLabel: e.target.value })} />
            </div>
          </div>
          <div className="mb-2">
            <label className={LABEL_CLS}>Value text</label>
            <input className={INPUT_CLS} value={c.valueText} onChange={e => updateCard(i, { ...c, valueText: e.target.value })} />
          </div>
          <div className="mb-2">
            <label className={LABEL_CLS}>Description</label>
            <textarea className={TEXTAREA_CLS} rows={3} value={c.desc} onChange={e => updateCard(i, { ...c, desc: e.target.value })} />
          </div>
          <div>
            <label className={LABEL_CLS}>Includes (comma-separated)</label>
            <input className={INPUT_CLS} value={c.includes} onChange={e => updateCard(i, { ...c, includes: e.target.value })} />
          </div>
        </div>
      ))}
      <AddRowBtn onClick={() => onChange({ ...block, content: saveExtraCards([...cards, { tag: '', title: '', price: '', priceLabel: '', desc: '', valueLabel: '', valueText: '', includes: '' }]) })} />
    </BlockShell>
  )
}

// ─── Maintenance Grid ─────────────────────────────────────────────────────────

function MaintGridEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let cards: { name: string; price: string; items: string; featured: boolean }[] = [{ name: '', price: '', items: '', featured: false }]
  try {
    const raw = JSON.parse(block.content)
    const p = Array.isArray(raw) ? raw : (raw.cards ?? [])
    cards = p.map((c: { name: string; price: string; items: string[]; featured?: boolean; badge?: string; note?: string }) => ({
      name: c.name, price: c.price, items: (c.items ?? []).join('\n'), featured: c.featured ?? false,
    }))
  } catch { /* ok */ }

  function save(updated: typeof cards) {
    onChange({ ...block, content: JSON.stringify({
      cards: updated.map(c => ({ name: c.name, price: c.price, items: c.items.split('\n').filter(Boolean), featured: c.featured })),
    }) })
  }

  return (
    <BlockShell label="Maintenance Grid" onDelete={onDelete}>
      {cards.map((c, i) => (
        <div key={i} className="border border-border rounded p-3 mb-2 bg-[#fafaf8]">
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className={LABEL_CLS}>Package name</label>
              <input className={INPUT_CLS} value={c.name} onChange={e => save(cards.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
            </div>
            <div>
              <label className={LABEL_CLS}>Price</label>
              <input className={INPUT_CLS} value={c.price} onChange={e => save(cards.map((x, idx) => idx === i ? { ...x, price: e.target.value } : x))} />
            </div>
          </div>
          <div className="mb-2">
            <label className={LABEL_CLS}>Items (one per line)</label>
            <textarea className={TEXTAREA_CLS} rows={4} value={c.items} onChange={e => save(cards.map((x, idx) => idx === i ? { ...x, items: e.target.value } : x))} />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={c.featured} onChange={e => save(cards.map((x, idx) => idx === i ? { ...x, featured: e.target.checked } : x))} />
              Featured (highlighted)
            </label>
            <RemoveRowBtn onClick={() => save(cards.filter((_, idx) => idx !== i))} />
          </div>
        </div>
      ))}
      <AddRowBtn onClick={() => save([...cards, { name: '', price: '', items: '', featured: false }])} />
    </BlockShell>
  )
}

// ─── SLA Table ────────────────────────────────────────────────────────────────

function SlaTableEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let rows: { priority: string; priorityClass: string; desc: string; response: string; resolution: string }[] = [
    { priority: 'High', priorityClass: 'high', desc: '', response: '', resolution: '' },
  ]
  try { rows = JSON.parse(block.content).rows ?? rows } catch { /* ok */ }

  const priorityOptions = [
    { label: 'Critical', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Medium', value: 'medium' },
    { label: 'Low', value: 'low' },
  ]

  function save(updated: typeof rows) {
    onChange({ ...block, content: JSON.stringify({ rows: updated }) })
  }

  return (
    <BlockShell label="SLA Table" onDelete={onDelete}>
      {rows.map((r, i) => (
        <div key={i} className="border border-border rounded p-3 mb-2 bg-[#fafaf8]">
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className={LABEL_CLS}>Priority</label>
              <select
                className={INPUT_CLS}
                value={r.priorityClass}
                onChange={e => {
                  const opt = priorityOptions.find(p => p.value === e.target.value)
                  save(rows.map((x, idx) => idx === i ? { ...x, priorityClass: e.target.value, priority: opt?.label ?? e.target.value } : x))
                }}
              >
                {priorityOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Description</label>
              <input className={INPUT_CLS} value={r.desc} onChange={e => save(rows.map((x, idx) => idx === i ? { ...x, desc: e.target.value } : x))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className={LABEL_CLS}>Response time</label>
              <input className={INPUT_CLS} value={r.response} onChange={e => save(rows.map((x, idx) => idx === i ? { ...x, response: e.target.value } : x))} placeholder="2h" />
            </div>
            <div>
              <label className={LABEL_CLS}>Resolution time</label>
              <input className={INPUT_CLS} value={r.resolution} onChange={e => save(rows.map((x, idx) => idx === i ? { ...x, resolution: e.target.value } : x))} placeholder="8h" />
            </div>
          </div>
          <RemoveRowBtn onClick={() => save(rows.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <AddRowBtn onClick={() => save([...rows, { priority: 'Medium', priorityClass: 'medium', desc: '', response: '', resolution: '' }])} />
    </BlockShell>
  )
}

// ─── Team Grid ────────────────────────────────────────────────────────────────

function TeamGridEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let members: { role: string; name: string; responsibilities: string }[] = [{ role: '', name: '', responsibilities: '' }]
  try {
    const raw = JSON.parse(block.content)
    members = Array.isArray(raw) ? raw : (raw.members ?? members)
  } catch { /* ok */ }

  function save(updated: typeof members) {
    onChange({ ...block, content: JSON.stringify(updated) })
  }

  return (
    <BlockShell label="Team Grid" onDelete={onDelete}>
      {members.map((m, i) => (
        <div key={i} className="border border-border rounded p-3 mb-2 bg-[#fafaf8]">
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className={LABEL_CLS}>Role</label>
              <input className={INPUT_CLS} value={m.role} onChange={e => save(members.map((x, idx) => idx === i ? { ...x, role: e.target.value } : x))} />
            </div>
            <div>
              <label className={LABEL_CLS}>Name</label>
              <input className={INPUT_CLS} value={m.name} onChange={e => save(members.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLS}>Responsibilities</label>
            <textarea className={TEXTAREA_CLS} rows={2} value={m.responsibilities} onChange={e => save(members.map((x, idx) => idx === i ? { ...x, responsibilities: e.target.value } : x))} />
          </div>
          <RemoveRowBtn onClick={() => save(members.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <AddRowBtn onClick={() => save([...members, { role: '', name: '', responsibilities: '' }])} />
    </BlockShell>
  )
}

// ─── Ref Grid ─────────────────────────────────────────────────────────────────

function RefGridEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let items: { client: string; title: string; desc: string; tags: string }[] = [{ client: '', title: '', desc: '', tags: '' }]
  try {
    const raw = JSON.parse(block.content)
    const p = Array.isArray(raw) ? raw : (raw.items ?? [])
    items = p.map((it: { client: string; title: string; desc: string; tags?: string[] }) => ({ ...it, tags: (it.tags ?? []).join(', ') }))
  } catch { /* ok */ }

  function save(updated: typeof items) {
    onChange({ ...block, content: JSON.stringify({
      items: updated.map(it => ({ ...it, tags: it.tags.split(',').map((t: string) => t.trim()).filter(Boolean) })),
    }) })
  }

  return (
    <BlockShell label="Reference Grid" onDelete={onDelete}>
      {items.map((it, i) => (
        <div key={i} className="border border-border rounded p-3 mb-2 bg-[#fafaf8]">
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <label className={LABEL_CLS}>Client</label>
              <input className={INPUT_CLS} value={it.client} onChange={e => save(items.map((x, idx) => idx === i ? { ...x, client: e.target.value } : x))} />
            </div>
            <div>
              <label className={LABEL_CLS}>Project title</label>
              <input className={INPUT_CLS} value={it.title} onChange={e => save(items.map((x, idx) => idx === i ? { ...x, title: e.target.value } : x))} />
            </div>
          </div>
          <div className="mb-2">
            <label className={LABEL_CLS}>Description</label>
            <textarea className={TEXTAREA_CLS} rows={2} value={it.desc} onChange={e => save(items.map((x, idx) => idx === i ? { ...x, desc: e.target.value } : x))} />
          </div>
          <div>
            <label className={LABEL_CLS}>Tags (comma-separated)</label>
            <input className={INPUT_CLS} value={it.tags} onChange={e => save(items.map((x, idx) => idx === i ? { ...x, tags: e.target.value } : x))} />
          </div>
          <RemoveRowBtn onClick={() => save(items.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <AddRowBtn onClick={() => save([...items, { client: '', title: '', desc: '', tags: '' }])} />
    </BlockShell>
  )
}

// ─── Price Table ──────────────────────────────────────────────────────────────

function PriceTableEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let parsed: { rows: { name: string; desc: string; price: string }[]; total: string } = {
    rows: [{ name: '', desc: '', price: '' }], total: '',
  }
  try { parsed = { ...parsed, ...JSON.parse(block.content) } } catch { /* ok */ }

  function save(updated: typeof parsed) {
    onChange({ ...block, content: JSON.stringify(updated) })
  }

  return (
    <BlockShell label="Price Table" onDelete={onDelete}>
      {parsed.rows.map((r, i) => (
        <div key={i} className="grid grid-cols-3 gap-2 mb-2">
          <div>
            <label className={LABEL_CLS}>Name</label>
            <input className={INPUT_CLS} value={r.name} onChange={e => save({ ...parsed, rows: parsed.rows.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x) })} />
          </div>
          <div>
            <label className={LABEL_CLS}>Description</label>
            <input className={INPUT_CLS} value={r.desc} onChange={e => save({ ...parsed, rows: parsed.rows.map((x, idx) => idx === i ? { ...x, desc: e.target.value } : x) })} />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className={LABEL_CLS}>Price</label>
              <input className={INPUT_CLS} value={r.price} onChange={e => save({ ...parsed, rows: parsed.rows.map((x, idx) => idx === i ? { ...x, price: e.target.value } : x) })} />
            </div>
            <button onClick={() => save({ ...parsed, rows: parsed.rows.filter((_, idx) => idx !== i) })} className="text-muted-foreground hover:text-red-500 pb-1.5">×</button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 mt-2">
        <AddRowBtn onClick={() => save({ ...parsed, rows: [...parsed.rows, { name: '', desc: '', price: '' }] })} />
        <div className="flex-1">
          <label className={LABEL_CLS}>Total (optional)</label>
          <input className={INPUT_CLS} value={parsed.total} onChange={e => save({ ...parsed, total: e.target.value })} placeholder="€12.000" />
        </div>
      </div>
    </BlockShell>
  )
}

// ─── Summary Box ──────────────────────────────────────────────────────────────

function SummaryBoxEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let parsed: { rows: { name: string; price: string; optional: boolean }[]; totalLabel: string; totalPrice: string; totalSub: string } = {
    rows: [{ name: '', price: '', optional: false }], totalLabel: 'Skupaj', totalPrice: '', totalSub: '',
  }
  try {
    const p = JSON.parse(block.content)
    parsed = {
      rows: p.rows ?? parsed.rows,
      totalLabel: p.totalLabel ?? p.total_label ?? parsed.totalLabel,
      totalPrice: p.totalPrice ?? p.total_price ?? parsed.totalPrice,
      totalSub: p.totalSub ?? p.total_sub ?? parsed.totalSub,
    }
  } catch { /* ok */ }

  function save(updated: typeof parsed) {
    onChange({ ...block, content: JSON.stringify(updated) })
  }

  return (
    <BlockShell label="Summary Box" onDelete={onDelete}>
      <div className="mb-3">
        <div className="text-xs font-semibold text-muted-foreground mb-2">Rows</div>
        {parsed.rows.map((r, i) => (
          <div key={i} className="flex gap-2 items-center mb-2">
            <input className={`${INPUT_CLS} flex-1`} value={r.name} onChange={e => save({ ...parsed, rows: parsed.rows.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x) })} placeholder="Service name" />
            <input className={`${INPUT_CLS} w-28`} value={r.price} onChange={e => save({ ...parsed, rows: parsed.rows.map((x, idx) => idx === i ? { ...x, price: e.target.value } : x) })} placeholder="€0" />
            <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
              <input type="checkbox" checked={r.optional} onChange={e => save({ ...parsed, rows: parsed.rows.map((x, idx) => idx === i ? { ...x, optional: e.target.checked } : x) })} />
              Opt
            </label>
            <button onClick={() => save({ ...parsed, rows: parsed.rows.filter((_, idx) => idx !== i) })} className="text-muted-foreground hover:text-red-500">×</button>
          </div>
        ))}
        <AddRowBtn onClick={() => save({ ...parsed, rows: [...parsed.rows, { name: '', price: '', optional: false }] })} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={LABEL_CLS}>Total label</label>
          <input className={INPUT_CLS} value={parsed.totalLabel} onChange={e => save({ ...parsed, totalLabel: e.target.value })} />
        </div>
        <div>
          <label className={LABEL_CLS}>Total price</label>
          <input className={INPUT_CLS} value={parsed.totalPrice} onChange={e => save({ ...parsed, totalPrice: e.target.value })} />
        </div>
        <div>
          <label className={LABEL_CLS}>Subtitle</label>
          <input className={INPUT_CLS} value={parsed.totalSub} onChange={e => save({ ...parsed, totalSub: e.target.value })} />
        </div>
      </div>
    </BlockShell>
  )
}

// ─── CMS Explainer ────────────────────────────────────────────────────────────

function CmsExplainerEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let parsed: { title: string; body: string; benefits: string } = { title: '', body: '', benefits: '' }
  try {
    const p = JSON.parse(block.content)
    parsed = { title: p.title ?? '', body: p.body ?? '', benefits: (p.benefits ?? []).join('\n') }
  } catch { /* ok */ }

  function save(updated: typeof parsed) {
    onChange({ ...block, content: JSON.stringify({ title: updated.title, body: updated.body, benefits: updated.benefits.split('\n').filter(Boolean) }) })
  }

  return (
    <BlockShell label="CMS Explainer" onDelete={onDelete}>
      <div className="mb-3">
        <label className={LABEL_CLS}>Title</label>
        <input className={INPUT_CLS} value={parsed.title} onChange={e => save({ ...parsed, title: e.target.value })} />
      </div>
      <div className="mb-3">
        <label className={LABEL_CLS}>Body</label>
        <textarea className={TEXTAREA_CLS} rows={3} value={parsed.body} onChange={e => save({ ...parsed, body: e.target.value })} />
      </div>
      <div>
        <label className={LABEL_CLS}>Benefits (one per line)</label>
        <textarea className={TEXTAREA_CLS} rows={4} value={parsed.benefits} onChange={e => save({ ...parsed, benefits: e.target.value })} />
      </div>
    </BlockShell>
  )
}

// ─── Tech Grid ────────────────────────────────────────────────────────────────

function TechGridEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let items: { name: string; desc: string }[] = [{ name: '', desc: '' }]
  try { items = JSON.parse(block.content).items ?? items } catch { /* ok */ }

  function save(updated: typeof items) {
    onChange({ ...block, content: JSON.stringify({ items: updated }) })
  }

  return (
    <BlockShell label="Tech Grid" onDelete={onDelete}>
      {items.map((it, i) => (
        <div key={i} className="flex gap-2 mb-2">
          <div className="flex-1">
            <label className={LABEL_CLS}>Name</label>
            <input className={INPUT_CLS} value={it.name} onChange={e => save(items.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
          </div>
          <div className="flex-1">
            <label className={LABEL_CLS}>Description</label>
            <input className={INPUT_CLS} value={it.desc} onChange={e => save(items.map((x, idx) => idx === i ? { ...x, desc: e.target.value } : x))} />
          </div>
          <button onClick={() => save(items.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-red-500 self-end pb-1.5">×</button>
        </div>
      ))}
      <AddRowBtn onClick={() => save([...items, { name: '', desc: '' }])} />
    </BlockShell>
  )
}

// ─── Closing Block ────────────────────────────────────────────────────────────

function ClosingBlockEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let parsed: { title: string; body: string; contact1: { label: string; name: string; role: string }; contact2: { label: string; name: string; role: string } } = {
    title: '', body: '',
    contact1: { label: '', name: '', role: '' },
    contact2: { label: '', name: '', role: '' },
  }
  try { parsed = { ...parsed, ...JSON.parse(block.content) } } catch { /* ok */ }

  function save(updated: typeof parsed) {
    onChange({ ...block, content: JSON.stringify(updated) })
  }

  return (
    <BlockShell label="Closing Block" onDelete={onDelete}>
      <div className="mb-3">
        <label className={LABEL_CLS}>Title</label>
        <input className={INPUT_CLS} value={parsed.title} onChange={e => save({ ...parsed, title: e.target.value })} />
      </div>
      <div className="mb-3">
        <label className={LABEL_CLS}>Body</label>
        <textarea className={TEXTAREA_CLS} rows={3} value={parsed.body} onChange={e => save({ ...parsed, body: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {(['contact1', 'contact2'] as const).map(key => (
          <div key={key} className="border border-border rounded p-3 bg-[#fafaf8]">
            <div className="text-xs font-semibold mb-2 text-muted-foreground">{key === 'contact1' ? 'Contact 1' : 'Contact 2'}</div>
            <div className="mb-2">
              <label className={LABEL_CLS}>Label</label>
              <input className={INPUT_CLS} value={parsed[key].label} onChange={e => save({ ...parsed, [key]: { ...parsed[key], label: e.target.value } })} />
            </div>
            <div className="mb-2">
              <label className={LABEL_CLS}>Name</label>
              <input className={INPUT_CLS} value={parsed[key].name} onChange={e => save({ ...parsed, [key]: { ...parsed[key], name: e.target.value } })} />
            </div>
            <div>
              <label className={LABEL_CLS}>Role</label>
              <input className={INPUT_CLS} value={parsed[key].role} onChange={e => save({ ...parsed, [key]: { ...parsed[key], role: e.target.value } })} />
            </div>
          </div>
        ))}
      </div>
    </BlockShell>
  )
}

// ─── Two Col ──────────────────────────────────────────────────────────────────

function TwoColEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let parsed: { col1Label: string; col1Text: string; col2Label: string; col2Text: string } = {
    col1Label: '', col1Text: '', col2Label: '', col2Text: '',
  }
  try {
    const p = JSON.parse(block.content)
    parsed = {
      col1Label: p.col1Label ?? p.left?.label ?? '',
      col1Text: p.col1Text ?? p.left?.text ?? '',
      col2Label: p.col2Label ?? p.right?.label ?? '',
      col2Text: p.col2Text ?? p.right?.text ?? '',
    }
  } catch { /* ok */ }

  function save(updated: typeof parsed) {
    onChange({ ...block, content: JSON.stringify(updated) })
  }

  return (
    <BlockShell label="Two Columns" onDelete={onDelete}>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={LABEL_CLS}>Column 1 label</label>
          <input className={`${INPUT_CLS} mb-2`} value={parsed.col1Label} onChange={e => save({ ...parsed, col1Label: e.target.value })} />
          <label className={LABEL_CLS}>Column 1 text</label>
          <textarea className={TEXTAREA_CLS} rows={4} value={parsed.col1Text} onChange={e => save({ ...parsed, col1Text: e.target.value })} />
        </div>
        <div>
          <label className={LABEL_CLS}>Column 2 label</label>
          <input className={`${INPUT_CLS} mb-2`} value={parsed.col2Label} onChange={e => save({ ...parsed, col2Label: e.target.value })} />
          <label className={LABEL_CLS}>Column 2 text</label>
          <textarea className={TEXTAREA_CLS} rows={4} value={parsed.col2Text} onChange={e => save({ ...parsed, col2Text: e.target.value })} />
        </div>
      </div>
    </BlockShell>
  )
}

// ─── Stat Grid ────────────────────────────────────────────────────────────────

function StatGridEditor({ block, onChange, onDelete }: BlockEditorProps) {
  let stats: { num: string; label: string; sub: string; style: 'black' | 'orange' | 'light' }[] = [{ num: '', label: '', sub: '', style: 'black' }]
  try { stats = JSON.parse(block.content).stats ?? stats } catch { /* ok */ }

  function save(updated: typeof stats) {
    onChange({ ...block, content: JSON.stringify({ stats: updated }) })
  }

  return (
    <BlockShell label="Stat Grid" onDelete={onDelete}>
      {stats.map((s, i) => (
        <div key={i} className="border border-border rounded p-3 mb-2 bg-[#fafaf8]">
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className={LABEL_CLS}>Number</label>
              <input className={INPUT_CLS} value={s.num} onChange={e => save(stats.map((x, idx) => idx === i ? { ...x, num: e.target.value } : x))} placeholder="10+" />
            </div>
            <div>
              <label className={LABEL_CLS}>Label</label>
              <input className={INPUT_CLS} value={s.label} onChange={e => save(stats.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} />
            </div>
            <div>
              <label className={LABEL_CLS}>Sub</label>
              <input className={INPUT_CLS} value={s.sub} onChange={e => save(stats.map((x, idx) => idx === i ? { ...x, sub: e.target.value } : x))} />
            </div>
            <div>
              <label className={LABEL_CLS}>Style</label>
              <select className={INPUT_CLS} value={s.style} onChange={e => save(stats.map((x, idx) => idx === i ? { ...x, style: e.target.value as 'black' | 'orange' | 'light' } : x))}>
                <option value="black">Black</option>
                <option value="orange">Orange</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>
          <RemoveRowBtn onClick={() => save(stats.filter((_, idx) => idx !== i))} />
        </div>
      ))}
      <AddRowBtn onClick={() => save([...stats, { num: '', label: '', sub: '', style: 'black' }])} />
    </BlockShell>
  )
}

// ─── Block Router ─────────────────────────────────────────────────────────────

function BlockEditor(props: BlockEditorProps) {
  switch (props.block.type) {
    case 'phase-block': return <PhaseBlockEditor {...props} />
    case 'pricing-table': return <PricingTableEditor {...props} />
    case 'pillar-block': return <PillarBlockEditor {...props} />
    case 'audience-grid': return <AudienceGridEditor {...props} />
    case 'func-grid': return <FuncGridEditor {...props} />
    case 'service-block': return <ServiceBlockEditor {...props} />
    case 'extra-card': return <ExtraCardEditor {...props} />
    case 'maint-grid': return <MaintGridEditor {...props} />
    case 'sla-table': return <SlaTableEditor {...props} />
    case 'team-grid': return <TeamGridEditor {...props} />
    case 'ref-grid': return <RefGridEditor {...props} />
    case 'price-table': return <PriceTableEditor {...props} />
    case 'summary-box': return <SummaryBoxEditor {...props} />
    case 'cms-explainer': return <CmsExplainerEditor {...props} />
    case 'tech-grid': return <TechGridEditor {...props} />
    case 'closing-block': return <ClosingBlockEditor {...props} />
    case 'two-col': return <TwoColEditor {...props} />
    case 'stat-grid': return <StatGridEditor {...props} />
    default: return <TextBlockEditor {...props} />
  }
}

// ─── Section Editor ───────────────────────────────────────────────────────────

interface Props {
  section: OfferSection
  language: OfferLanguage
  onChange: (updated: OfferSection) => void
}

export function SectionEditor({ section, language, onChange }: Props) {
  const [showBoilerplate, setShowBoilerplate] = useState(false)
  const boilerplate = getBoilerplate(language)

  function addBlock(type: OfferBlock['type'], content = '') {
    const block: OfferBlock = { id: uuidv4(), type, content }
    onChange({ ...section, blocks: [...section.blocks, block] })
  }

  function updateBlock(id: string, updated: OfferBlock) {
    onChange({ ...section, blocks: section.blocks.map(b => b.id === id ? updated : b) })
  }

  function deleteBlock(id: string) {
    onChange({ ...section, blocks: section.blocks.filter(b => b.id !== id) })
  }

  function insertBoilerplate(content: string) {
    addBlock('paragraph', content)
    setShowBoilerplate(false)
  }

  if (section.type === 'cover') {
    return (
      <div className="p-6">
        <div className="text-sm font-semibold text-primary mb-1">Cover page</div>
        <div className="text-sm text-muted-foreground mb-4">Cover page fields are set during offer creation. Use Preview PDF to see how it looks.</div>
        <div className="bg-[#fafaf8] border border-border rounded-lg p-4 text-sm text-muted-foreground">
          The cover page is auto-generated from your offer metadata (client name, offer number, date, etc).
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="text-base font-semibold text-primary mb-4">{section.title}</div>

      {section.blocks.map(block => (
        <BlockEditor
          key={block.id}
          block={block}
          onChange={updated => updateBlock(block.id, updated)}
          onDelete={() => deleteBlock(block.id)}
        />
      ))}

      {section.blocks.length === 0 && (
        <div className="text-sm text-muted-foreground mb-4 py-6 text-center border border-dashed border-border rounded-lg">
          No blocks yet. Add one below.
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-2">
        <Button size="xs" variant="outline" onClick={() => addBlock('paragraph')}>+ Text</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('bullet-list')}>+ Bullets</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('goal-list')}>+ Goals</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('phase-block', JSON.stringify({ tag: 'FAZA 1', title: '', deadline: '', items: [], deliverables: [] }))}>+ Phase</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('pricing-table', JSON.stringify({ rows: [{ label: '', qty: '', rate: '', total: '' }], grandTotal: '' }))}>+ Pricing table</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('price-table', JSON.stringify({ rows: [{ name: '', desc: '', price: '' }], total: '' }))}>+ Price table</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('pillar-block', JSON.stringify({ num: '01', title: '', text: '', bullets: [], asideLabel: '', asideItems: [] }))}>+ Pillar</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('audience-grid', JSON.stringify({ cards: [{ role: '', need: '', highlight: false }] }))}>+ Audience</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('func-grid', JSON.stringify({ items: [{ num: '01', title: '', desc: '', tags: [], wide: false }] }))}>+ Func grid</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('service-block', JSON.stringify({ title: '', items: [{ name: '', desc: '' }], outputs: [] }))}>+ Service</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('extra-card', JSON.stringify({ title: '', price: '', priceLabel: '', desc: '', valueLabel: '', valueText: '', tags: [] }))}>+ Extra card</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('maint-grid', JSON.stringify({ cards: [{ name: '', price: '', items: [], featured: false }] }))}>+ Maint grid</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('sla-table', JSON.stringify({ rows: [{ priority: 'High', priorityClass: 'high', desc: '', response: '', resolution: '' }] }))}>+ SLA table</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('team-grid', JSON.stringify({ members: [{ role: '', name: '', responsibilities: '' }] }))}>+ Team</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('ref-grid', JSON.stringify({ items: [{ client: '', title: '', desc: '', tags: [] }] }))}>+ References</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('summary-box', JSON.stringify({ rows: [{ name: '', price: '', optional: false }], totalLabel: 'Skupaj', totalPrice: '', totalSub: '' }))}>+ Summary</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('cms-explainer', JSON.stringify({ title: '', body: '', benefits: [] }))}>+ CMS</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('tech-grid', JSON.stringify({ items: [{ name: '', desc: '' }] }))}>+ Tech</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('closing-block', JSON.stringify({ title: '', body: '', contact1: { label: '', name: '', role: '' }, contact2: { label: '', name: '', role: '' } }))}>+ Closing</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('info-box')}>+ Info box</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('two-col', JSON.stringify({ col1Label: '', col1Text: '', col2Label: '', col2Text: '' }))}>+ 2 cols</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('stat-grid', JSON.stringify({ stats: [{ num: '', label: '', sub: '', style: 'black' }] }))}>+ Stats</Button>
        <Button size="xs" variant="outline" onClick={() => addBlock('notes')}>+ Notes</Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => setShowBoilerplate(v => !v)}
          style={{ borderColor: '#E85C1A', color: '#E85C1A' }}
        >
          + Boilerplate
        </Button>
      </div>

      {showBoilerplate && (
        <div className="border border-border rounded-lg p-4 mt-3 bg-white">
          <div className="text-xs font-semibold text-primary mb-3 uppercase tracking-wide">Insert standard block</div>
          <div className="flex flex-col gap-1">
            {boilerplate.map(bp => (
              <button
                key={bp.key}
                onClick={() => insertBoilerplate(bp.content)}
                className="text-left bg-[#fafaf8] hover:bg-[#f0ede8] border border-border rounded px-3 py-2 text-sm cursor-pointer transition-colors"
              >
                {bp.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
