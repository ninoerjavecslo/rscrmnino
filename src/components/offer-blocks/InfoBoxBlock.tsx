import { createReactBlockSpec } from '@blocknote/react'

const BOX_STYLES = {
  highlight: { accent: '#E85C1A', bg: '#FDF0EA', label: 'Highlight' },
  note:      { accent: '#3B82F6', bg: '#EFF6FF', label: 'Note' },
  warning:   { accent: '#F59E0B', bg: '#FFFBEB', label: 'Warning' },
} as const

type BoxStyle = keyof typeof BOX_STYLES

export const InfoBoxBlock = createReactBlockSpec(
  {
    type: 'infoBoxBlock',
    propSchema: {
      title: { default: '' },
      body: { default: '' },
      style: { default: 'highlight' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const p = block.props
      const update = (patch: Partial<typeof p>) =>
        editor.updateBlock(block, { props: { ...p, ...patch } })

      const s = BOX_STYLES[(p.style as BoxStyle) ?? 'highlight'] ?? BOX_STYLES.highlight
      const stop = (e: React.MouseEvent) => e.stopPropagation()

      return (
        <div
          className="rounded-xl my-2 overflow-hidden"
          style={{ border: `1px solid ${s.accent}40`, width: '100%' }}
          onMouseDown={stop}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ background: s.bg, borderBottom: `1px solid ${s.accent}20` }}
          >
            <div className="flex items-center gap-2 flex-1">
              <div className="w-1 h-4 rounded shrink-0" style={{ background: s.accent }} />
              <input
                className="text-sm font-semibold bg-transparent border-none outline-none placeholder:text-stone-400 flex-1"
                style={{ color: '#1A1A1A' }}
                value={p.title}
                placeholder="Box title (optional)…"
                onChange={e => update({ title: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-1 ml-3">
              {(Object.keys(BOX_STYLES) as BoxStyle[]).map(st => (
                <button
                  key={st}
                  onClick={() => update({ style: st })}
                  className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide transition-colors"
                  style={{
                    background: p.style === st ? BOX_STYLES[st].accent : 'transparent',
                    color: p.style === st ? '#fff' : '#aaa',
                  }}
                >{BOX_STYLES[st].label}</button>
              ))}
            </div>
          </div>
          <div
            className="px-4 py-3 bg-white"
            style={{ borderLeft: `3px solid ${s.accent}` }}
          >
            <textarea
              className="w-full text-sm text-stone-700 bg-transparent border-none outline-none resize-none placeholder:text-stone-300 leading-relaxed"
              rows={3}
              placeholder="Write your content here…"
              value={p.body}
              onChange={e => update({ body: e.target.value })}
            />
          </div>
        </div>
      )
    },
  }
)
