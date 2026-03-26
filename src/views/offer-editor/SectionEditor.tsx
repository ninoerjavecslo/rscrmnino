import { useState } from 'react'
import { getBoilerplate } from '../../lib/offerBoilerplate'
import type { OfferSection, OfferBlock, OfferLanguage } from '../../lib/types'
import { v4 as uuidv4 } from 'uuid'

interface BlockEditorProps {
  block: OfferBlock
  onChange: (b: OfferBlock) => void
  onDelete: () => void
}

function BlockEditor({ block, onChange, onDelete }: BlockEditorProps) {
  if (block.type === 'phase-block') {
    let parsed: { tag: string; title: string; deadline: string; items: string[] } = { tag: '', title: '', deadline: '', items: [] }
    try { parsed = { ...parsed, ...JSON.parse(block.content) } } catch { /* ok */ }

    function save(updated: typeof parsed) {
      onChange({ ...block, content: JSON.stringify(updated) })
    }

    return (
      <div style={{ border: '1px solid #e8e3ea', borderRadius: 6, padding: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#E85C1A' }}>Phase</span>
          <button onClick={onDelete} style={{ fontSize: 10, color: '#999', border: 'none', background: 'none', cursor: 'pointer' }}>Remove</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Tag (e.g. FAZA 1)</label>
            <input style={{ width: '100%', border: '1px solid #e8e3ea', borderRadius: 4, padding: '4px 8px', fontSize: 12 }} value={parsed.tag} onChange={e => save({ ...parsed, tag: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Deadline</label>
            <input style={{ width: '100%', border: '1px solid #e8e3ea', borderRadius: 4, padding: '4px 8px', fontSize: 12 }} value={parsed.deadline} onChange={e => save({ ...parsed, deadline: e.target.value })} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Phase title</label>
          <input style={{ width: '100%', border: '1px solid #e8e3ea', borderRadius: 4, padding: '4px 8px', fontSize: 12 }} value={parsed.title} onChange={e => save({ ...parsed, title: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>Deliverables (one per line)</label>
          <textarea
            style={{ width: '100%', border: '1px solid #e8e3ea', borderRadius: 4, padding: '4px 8px', fontSize: 12, minHeight: 80 }}
            value={parsed.items.join('\n')}
            onChange={e => save({ ...parsed, items: e.target.value.split('\n') })}
          />
        </div>
      </div>
    )
  }

  if (block.type === 'pricing-table') {
    let parsed: { rows: { label: string; qty: string; rate: string; total: string }[]; subtotals: { label: string; total: string }[]; grandTotal: string } = { rows: [{ label: '', qty: '', rate: '', total: '' }], subtotals: [], grandTotal: '' }
    try { parsed = { ...parsed, ...JSON.parse(block.content) } } catch { /* ok */ }

    function save(updated: typeof parsed) {
      onChange({ ...block, content: JSON.stringify(updated) })
    }

    function addRow() {
      save({ ...parsed, rows: [...parsed.rows, { label: '', qty: '', rate: '', total: '' }] })
    }
    function removeRow(i: number) {
      save({ ...parsed, rows: parsed.rows.filter((_, idx) => idx !== i) })
    }
    function updateRow(i: number, key: keyof typeof parsed.rows[0], val: string) {
      const rows = parsed.rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r)
      save({ ...parsed, rows })
    }

    return (
      <div style={{ border: '1px solid #e8e3ea', borderRadius: 6, padding: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#E85C1A' }}>Pricing table</span>
          <button onClick={onDelete} style={{ fontSize: 10, color: '#999', border: 'none', background: 'none', cursor: 'pointer' }}>Remove</button>
        </div>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr style={{ background: '#f5f5f3' }}>
              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Service</th>
              <th style={{ width: 60, padding: '4px 6px', fontWeight: 600 }}>Qty</th>
              <th style={{ width: 80, padding: '4px 6px', fontWeight: 600 }}>Rate</th>
              <th style={{ width: 90, padding: '4px 6px', fontWeight: 600 }}>Total</th>
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((row, i) => (
              <tr key={i}>
                <td style={{ padding: '2px 4px' }}><input style={{ width: '100%', border: '1px solid #e8e3ea', borderRadius: 3, padding: '2px 4px', fontSize: 11 }} value={row.label} onChange={e => updateRow(i, 'label', e.target.value)} /></td>
                <td style={{ padding: '2px 4px' }}><input style={{ width: '100%', border: '1px solid #e8e3ea', borderRadius: 3, padding: '2px 4px', fontSize: 11 }} value={row.qty} onChange={e => updateRow(i, 'qty', e.target.value)} /></td>
                <td style={{ padding: '2px 4px' }}><input style={{ width: '100%', border: '1px solid #e8e3ea', borderRadius: 3, padding: '2px 4px', fontSize: 11 }} value={row.rate} onChange={e => updateRow(i, 'rate', e.target.value)} /></td>
                <td style={{ padding: '2px 4px' }}><input style={{ width: '100%', border: '1px solid #e8e3ea', borderRadius: 3, padding: '2px 4px', fontSize: 11 }} value={row.total} onChange={e => updateRow(i, 'total', e.target.value)} /></td>
                <td style={{ padding: '2px 4px' }}><button onClick={() => removeRow(i)} style={{ color: '#999', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <button onClick={addRow} style={{ fontSize: 11, color: '#E85C1A', border: '1px dashed #E85C1A', background: 'none', cursor: 'pointer', padding: '2px 10px', borderRadius: 3 }}>+ Row</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 11, color: '#888' }}>Grand total:</label>
          <input style={{ border: '1px solid #e8e3ea', borderRadius: 4, padding: '3px 8px', fontSize: 12, width: 140 }} value={parsed.grandTotal} onChange={e => save({ ...parsed, grandTotal: e.target.value })} placeholder="5.900,00 EUR" />
        </div>
      </div>
    )
  }

  // paragraph / bullet-list / notes / goal-list
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{block.type}</span>
        <button onClick={onDelete} style={{ fontSize: 10, color: '#999', border: 'none', background: 'none', cursor: 'pointer' }}>Remove</button>
      </div>
      <textarea
        style={{ width: '100%', border: '1px solid #e8e3ea', borderRadius: 4, padding: '6px 10px', fontSize: 12, minHeight: block.type === 'paragraph' ? 100 : 80, lineHeight: 1.5 }}
        value={block.content}
        onChange={e => onChange({ ...block, content: e.target.value })}
        placeholder={block.type === 'bullet-list' ? 'One item per line' : block.type === 'goal-list' ? 'One goal per line' : 'Text…'}
      />
    </div>
  )
}

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
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Cover page</div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>Cover page fields are set during offer creation. Use Preview PDF to see how it looks.</div>
        <div style={{ background: '#f5f5f3', borderRadius: 6, padding: 12, fontSize: 12, color: '#555' }}>
          The cover page is auto-generated from your offer metadata (client name, offer number, date label, etc).
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{section.title}</div>

      {section.blocks.map(block => (
        <BlockEditor
          key={block.id}
          block={block}
          onChange={updated => updateBlock(block.id, updated)}
          onDelete={() => deleteBlock(block.id)}
        />
      ))}

      {section.blocks.length === 0 && (
        <div style={{ color: '#aaa', fontSize: 12, marginBottom: 16 }}>
          No blocks yet. Add one below.
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        <button onClick={() => addBlock('paragraph')} style={{ fontSize: 11, border: '1px dashed #ccc', background: 'none', cursor: 'pointer', padding: '3px 10px', borderRadius: 3 }}>+ Text</button>
        <button onClick={() => addBlock('bullet-list')} style={{ fontSize: 11, border: '1px dashed #ccc', background: 'none', cursor: 'pointer', padding: '3px 10px', borderRadius: 3 }}>+ Bullet list</button>
        <button onClick={() => addBlock('goal-list')} style={{ fontSize: 11, border: '1px dashed #ccc', background: 'none', cursor: 'pointer', padding: '3px 10px', borderRadius: 3 }}>+ Goal list</button>
        <button onClick={() => addBlock('phase-block', JSON.stringify({ tag: 'FAZA 1', title: '', deadline: '', items: [] }))} style={{ fontSize: 11, border: '1px dashed #ccc', background: 'none', cursor: 'pointer', padding: '3px 10px', borderRadius: 3 }}>+ Phase</button>
        <button onClick={() => addBlock('pricing-table', JSON.stringify({ rows: [{ label: '', qty: '', rate: '', total: '' }], subtotals: [], grandTotal: '' }))} style={{ fontSize: 11, border: '1px dashed #ccc', background: 'none', cursor: 'pointer', padding: '3px 10px', borderRadius: 3 }}>+ Pricing table</button>
        <button onClick={() => setShowBoilerplate(v => !v)} style={{ fontSize: 11, border: '1px dashed #E85C1A', color: '#E85C1A', background: 'none', cursor: 'pointer', padding: '3px 10px', borderRadius: 3 }}>+ Boilerplate</button>
      </div>

      {showBoilerplate && (
        <div style={{ border: '1px solid #e8e3ea', borderRadius: 6, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Insert standard block</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {boilerplate.map(bp => (
              <button
                key={bp.key}
                onClick={() => insertBoilerplate(bp.content)}
                style={{ textAlign: 'left', background: '#f5f5f3', border: 'none', borderRadius: 4, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}
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
