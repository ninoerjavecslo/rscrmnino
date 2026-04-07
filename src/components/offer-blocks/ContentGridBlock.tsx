import { createReactBlockSpec } from '@blocknote/react'

interface GridItem { title: string; body: string }

export const ContentGridBlock = createReactBlockSpec(
  {
    type: 'contentGridBlock',
    propSchema: {
      sectionTitle: { default: '' },
      itemsJson: { default: '[{"title":"","body":""}]' },
      columns: { default: '2' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const p = block.props
      const items: GridItem[] = JSON.parse(p.itemsJson || '[{"title":"","body":""}]')

      const update = (patch: Partial<typeof p>) =>
        editor.updateBlock(block, { props: { ...p, ...patch } })

      const updateItem = (idx: number, field: keyof GridItem, val: string) => {
        const next = items.map((it, i) => (i === idx ? { ...it, [field]: val } : it))
        update({ itemsJson: JSON.stringify(next) })
      }

      const addItem = () => update({ itemsJson: JSON.stringify([...items, { title: '', body: '' }]) })
      const removeItem = (idx: number) =>
        update({ itemsJson: JSON.stringify(items.filter((_, i) => i !== idx)) })

      const cols = p.columns === '1' ? 1 : 2
      const stop = (e: React.MouseEvent) => e.stopPropagation()

      return (
        <div
          className="rounded-xl my-2 overflow-hidden"
          style={{ border: '1px solid #EAE5DD', width: '100%' }}
          onMouseDown={stop}
        >
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5"
            style={{ background: '#F5F4F1', borderBottom: '1px solid #EAE5DD' }}
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#888' }} />
              <input
                className="text-[10px] font-bold uppercase tracking-widest bg-transparent border-none outline-none placeholder:text-stone-400"
                style={{ color: '#888' }}
                value={p.sectionTitle}
                placeholder="SECTION TITLE (optional)"
                onChange={e => update({ sectionTitle: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-1">
              {(['1', '2'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => update({ columns: c })}
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors"
                  style={{
                    background: p.columns === c ? '#1A1A1A' : 'transparent',
                    color: p.columns === c ? '#fff' : '#aaa',
                  }}
                >{c} col</button>
              ))}
            </div>
          </div>
          <div className="p-4 bg-white">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: '10px',
              }}
            >
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="group relative rounded-lg p-3 space-y-2"
                  style={{ background: '#F7F6F4', border: '1px solid #E5E0D9' }}
                >
                  <input
                    className="w-full text-sm font-semibold bg-transparent border-none outline-none placeholder:text-stone-300 text-stone-800"
                    value={item.title}
                    placeholder="Card title…"
                    onChange={e => updateItem(idx, 'title', e.target.value)}
                  />
                  <textarea
                    className="w-full text-xs text-stone-500 bg-transparent border-none outline-none resize-none leading-relaxed placeholder:text-stone-300"
                    rows={3}
                    value={item.body}
                    placeholder="Card body text…"
                    onChange={e => updateItem(idx, 'body', e.target.value)}
                  />
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(idx)}
                      className="absolute top-2 right-2 text-stone-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-sm leading-none"
                    >×</button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addItem}
              className="mt-3 text-xs font-medium transition-colors"
              style={{ color: '#E85C1A' }}
            >+ Add card</button>
          </div>
        </div>
      )
    },
  }
)
