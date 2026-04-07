import { createReactBlockSpec } from '@blocknote/react'

export const BulletListBlock = createReactBlockSpec(
  {
    type: 'bulletListBlock',
    propSchema: {
      title: { default: '' },
      itemsJson: { default: '[""]' },
      accent: { default: 'orange' },
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

      const accentColor = p.accent === 'black' ? '#1A1A1A' : '#E85C1A'
      const stop = (e: React.MouseEvent) => e.stopPropagation()

      return (
        <div
          className="rounded-xl my-2 overflow-hidden"
          style={{ border: '1px solid #EAE5DD', width: '100%' }}
          onMouseDown={stop}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ background: '#F9F7F4', borderBottom: '1px solid #EAE5DD' }}
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: accentColor }} />
              <input
                className="text-[10px] font-bold uppercase tracking-widest bg-transparent border-none outline-none placeholder:text-stone-400"
                style={{ color: accentColor }}
                value={p.title}
                placeholder="LIST TITLE (optional)"
                onChange={e => update({ title: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-1.5">
              {(['orange', 'black'] as const).map(a => (
                <button
                  key={a}
                  onClick={() => update({ accent: a })}
                  className="w-3 h-3 rounded-full border-2 transition-all"
                  style={{
                    background: a === 'orange' ? '#E85C1A' : '#1A1A1A',
                    borderColor: p.accent === a ? '#999' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="px-4 py-3 bg-white space-y-1.5">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3 group">
                <div
                  className="w-0.5 h-4 rounded shrink-0"
                  style={{ background: accentColor, opacity: 0.7 }}
                />
                <input
                  className="flex-1 text-sm text-stone-700 bg-transparent border-none outline-none placeholder:text-stone-300"
                  value={item}
                  placeholder="List item…"
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
            <button
              onClick={addItem}
              className="mt-1 text-xs font-medium transition-colors pl-3"
              style={{ color: accentColor }}
            >+ Add item</button>
          </div>
        </div>
      )
    },
  }
)
