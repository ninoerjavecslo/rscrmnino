import { createReactBlockSpec } from '@blocknote/react'

// sectionKey is a stable identifier used by blocksToTemplate — never changes with translation
export type BoilerplateSectionKey = 'payment_terms' | 'copyright' | 'scope_and_timeline' | 'general_notes'

export const BoilerplateBlock = createReactBlockSpec(
  {
    type: 'boilerplateBlock',
    propSchema: {
      title: { default: 'Section' },
      sectionKey: { default: 'general_notes' },  // stable key, not translated
      body: { default: '' },
      collapsed: { default: 'true' },  // default collapsed
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const collapsed = block.props.collapsed === 'true'
      const toggle = () =>
        editor.updateBlock(block, { props: { ...block.props, collapsed: collapsed ? 'false' : 'true' } })

      return (
        <div
          className="rounded-xl my-2 overflow-hidden"
          style={{ border: '1px dashed #DDD8D0' }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2.5 cursor-pointer select-none"
            style={{ background: '#F9F8F6' }}
            onClick={toggle}
          >
            <div className="w-1 h-1 rounded-full" style={{ background: '#C8C3BA' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#B5AFA8' }}>
              {block.props.title}
            </span>
            <span className="text-[10px] ml-auto" style={{ color: '#C8C3BA' }}>{collapsed ? '▶' : '▼'}</span>
          </div>
          {!collapsed && (
            <textarea
              className="w-full px-4 py-3 text-xs bg-white border-none outline-none resize-none leading-relaxed placeholder:text-stone-300"
              style={{ color: '#555' }}
              rows={5}
              placeholder="Enter section text…"
              value={block.props.body}
              onChange={(e) =>
                editor.updateBlock(block, { props: { ...block.props, body: e.target.value } })
              }
            />
          )}
        </div>
      )
    },
  }
)
