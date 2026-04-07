import { createReactBlockSpec } from '@blocknote/react'
import { useRef, useEffect, useState } from 'react'
import DOMPurify from 'dompurify'

function RichTextDescription({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const isEditing = useRef(false)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (ref.current && !isEditing.current) {
      ref.current.innerHTML = DOMPurify.sanitize(value || '')
    }
  }, [value])

  const applyFormat = (cmd: string) => {
    ref.current?.focus()
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    document.execCommand(cmd, false)
  }

  const Btn = ({ label, cmd, style }: { label: string; cmd: string; style?: 'bold' | 'italic' }) => (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); applyFormat(cmd) }}
      title={cmd}
      className="px-1.5 py-0.5 rounded text-[11px] text-stone-500 hover:bg-stone-200 hover:text-stone-800 transition-colors"
      style={{ fontWeight: style === 'bold' ? 700 : undefined, fontStyle: style === 'italic' ? 'italic' : undefined }}
    >
      {label}
    </button>
  )

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${focused ? '#E85C1A' : '#E5E0D9'}`, transition: 'border-color 0.15s' }}>
      {focused && (
        <div className="flex items-center gap-0.5 px-1.5 py-1 border-b" style={{ borderColor: '#E5E0D9', background: '#FAFAF9' }}>
          <Btn label="B" cmd="bold" style="bold" />
          <Btn label="I" cmd="italic" style="italic" />
          <Btn label="U" cmd="underline" />
          <div className="w-px h-3 bg-stone-200 mx-1" />
          <Btn label="• list" cmd="insertUnorderedList" />
          <Btn label="1. list" cmd="insertOrderedList" />
        </div>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Brief phase overview…"
        className="w-full text-sm text-stone-700 bg-stone-50 px-2.5 py-2 outline-none min-h-[52px] leading-relaxed"
        onFocus={() => { isEditing.current = true; setFocused(true) }}
        onBlur={e => {
          isEditing.current = false
          setFocused(false)
          onChange(DOMPurify.sanitize(e.currentTarget.innerHTML))
        }}
        onKeyDown={e => e.stopPropagation()}
        onKeyUp={e => e.stopPropagation()}
        onPaste={e => e.stopPropagation()}
      />
    </div>
  )
}

export const PhaseBlock = createReactBlockSpec(
  {
    type: 'phaseBlock',
    propSchema: {
      title: { default: 'Phase 1: Discovery' },
      description: { default: '' },
      itemsJson: { default: '[""]' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const p = block.props
      const items: string[] = JSON.parse(p.itemsJson || '[""]')

      const update = (patch: Partial<typeof p>) =>
        editor.updateBlock(block, { props: { ...p, ...patch } })

      const updateItem = (idx: number, val: string) => {
        const next = items.map((it, i) => (i === idx ? val : it))
        update({ itemsJson: JSON.stringify(next) })
      }

      const addItem = () => update({ itemsJson: JSON.stringify([...items, '']) })
      const removeItem = (idx: number) =>
        update({ itemsJson: JSON.stringify(items.filter((_, i) => i !== idx)) })

      return (
        <div className="rounded-xl my-2 overflow-hidden" style={{ border: '1px solid #E8E3DC', width: '100%' }}>
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: '#1A1A1A', borderBottom: '1px solid #333' }}>
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#E85C1A' }} />
            <input
              className="font-bold text-sm bg-transparent border-none outline-none flex-1 placeholder:text-stone-500"
              style={{ color: '#fff', letterSpacing: '0.01em' }}
              value={p.title}
              placeholder="Phase title…"
              onChange={e => update({ title: e.target.value })}
            />
          </div>
          <div className="p-4 space-y-3 bg-white">
            <div>
              <label className="block text-[9px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                Description <span className="normal-case font-normal tracking-normal text-stone-300">(optional)</span>
              </label>
              <RichTextDescription
                value={p.description}
                onChange={html => update({ description: html })}
              />
            </div>
            <div>
              <label className="block text-[9px] font-semibold uppercase tracking-wider text-stone-400 mb-2">
                Deliverables / Tasks
              </label>
              <div className="space-y-1.5">
                {items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 group">
                    <div className="w-1 h-1 rounded-full shrink-0" style={{ background: '#E85C1A', opacity: 0.6 }} />
                    <input
                      className="flex-1 text-sm text-stone-700 bg-stone-50 rounded-md px-2.5 py-1.5 outline-none placeholder:text-stone-300 transition-all"
                      style={{ border: '1px solid #E5E0D9' }}
                      onFocus={e => (e.currentTarget.style.borderColor = '#E85C1A')}
                      onBlur={e => (e.currentTarget.style.borderColor = '#E5E0D9')}
                      value={item}
                      placeholder="Deliverable or task…"
                      onChange={e => updateItem(idx, e.target.value)}
                    />
                    {items.length > 1 && (
                      <button
                        onClick={() => removeItem(idx)}
                        className="text-stone-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      >×</button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={addItem}
                className="mt-2 text-xs font-medium transition-colors"
                style={{ color: '#E85C1A' }}
              >+ Add item</button>
            </div>
          </div>
        </div>
      )
    },
  }
)
