import { createReactBlockSpec } from '@blocknote/react'

export const ServiceBlock = createReactBlockSpec(
  {
    type: 'serviceBlock',
    propSchema: {
      title: { default: 'Service' },
      collapsed: { default: 'false' },
    },
    content: 'inline',
  },
  {
    render: ({ block, editor, contentRef }) => {
      const collapsed = block.props.collapsed === 'true'
      const toggle = () =>
        editor.updateBlock(block, { props: { ...block.props, collapsed: collapsed ? 'false' : 'true' } })

      return (
        <div className="rounded-xl my-2 overflow-hidden" style={{ border: '1px solid #EAE5DD' }}>
          <div
            className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
            style={{ background: collapsed ? '#F9F7F4' : '#FDFCFB', borderBottom: collapsed ? 'none' : '1px solid #EAE5DD' }}
            onClick={toggle}
          >
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: '#E85C1A', opacity: 0.7 }} />
            <input
              className="font-semibold text-sm bg-transparent border-none outline-none flex-1 placeholder:text-stone-400"
              style={{ color: '#1A1A1A' }}
              value={block.props.title}
              placeholder="Service name…"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) =>
                editor.updateBlock(block, { props: { ...block.props, title: e.target.value } })
              }
            />
            <span className="text-[10px] ml-auto shrink-0" style={{ color: '#C8C3BA' }}>{collapsed ? '▶' : '▼'}</span>
          </div>
          {!collapsed && (
            <div className="px-4 py-3 text-sm text-stone-600 bg-white" ref={contentRef} />
          )}
        </div>
      )
    },
  }
)
