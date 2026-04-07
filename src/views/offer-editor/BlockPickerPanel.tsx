import { useState } from 'react'

interface BlockDef {
  type: string
  label: string
  sub: string
}

interface BlockGroup {
  group: string
  items: BlockDef[]
}

const BLOCK_GROUPS: BlockGroup[] = [
  {
    group: 'Offer blocks',
    items: [
      { type: 'clientMeta',         label: 'Offer Details',      sub: 'Client info, date & intro text' },
      { type: 'serviceBlock',       label: 'Service Section',    sub: 'Named section with description' },
      { type: 'pricingTable',       label: 'Pricing Table',      sub: 'Line items with quantities' },
      { type: 'phaseBlock',         label: 'Project Phase',      sub: 'Phase header + deliverables' },
      { type: 'contentGridBlock',   label: 'Content Grid',       sub: '2-col card grid for features' },
      { type: 'bulletListBlock',    label: 'Bullet List',        sub: 'Styled list with accent color' },
      { type: 'infoBoxBlock',       label: 'Info Box',           sub: 'Callout, note, or warning' },
      { type: 'boilerplateBlock',   label: 'Boilerplate',        sub: 'Payment terms, copyright, notes' },
      { type: 'maintenancePackage', label: 'Maintenance Package',sub: 'Monthly support card' },
      { type: 'slaTable',           label: 'SLA Table',          sub: 'Response time & uptime' },
    ],
  },
  {
    group: 'Text',
    items: [
      { type: 'heading',            label: 'Heading',            sub: 'Section heading (H1–H3)' },
      { type: 'paragraph',          label: 'Paragraph',          sub: 'Body text paragraph' },
      { type: 'bulletListItem',     label: 'Bullet item',        sub: 'Single bullet list item' },
      { type: 'numberedListItem',   label: 'Numbered item',      sub: 'Single numbered list item' },
    ],
  },
]

interface BlockPickerPanelProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editorRef: React.MutableRefObject<any>
}

export function BlockPickerPanel({ editorRef }: BlockPickerPanelProps) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const q = search.toLowerCase()
  const filtered: BlockGroup[] = BLOCK_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(
      item =>
        !q ||
        item.label.toLowerCase().includes(q) ||
        item.sub.toLowerCase().includes(q)
    ),
  })).filter(g => g.items.length > 0)

  function insertBlock(type: string) {
    const editor = editorRef.current
    if (!editor) return
    try {
      const pos = editor.getTextCursorPosition()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.insertBlocks([{ type } as any], pos.block, 'after')
      // Focus back on editor
      editor.focus()
    } catch {
      // If cursor isn't set, insert at end
      const doc = editor.document
      const last = doc[doc.length - 1]
      if (last) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.insertBlocks([{ type } as any], last, 'after')
      }
    }
  }

  const toggleGroup = (g: string) =>
    setCollapsed(prev => ({ ...prev, [g]: !prev[g] }))

  return (
    <div
      className="flex flex-col shrink-0 h-full overflow-hidden"
      style={{ width: 260, borderLeft: '1px solid #e8e3ea', background: '#fafaf8' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid #e8e3ea' }}
      >
        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: '#aaa' }}>Blocks</div>
        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            width="11" height="11" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ color: '#bbb' }}
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-border bg-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[var(--navy)]"
            placeholder="Search blocks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Block list */}
      <div className="flex-1 overflow-y-auto py-2">
        {filtered.map(group => (
          <div key={group.group} className="mb-1">
            {/* Group header */}
            <button
              className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-white transition-colors"
              onClick={() => toggleGroup(group.group)}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#aaa' }}>
                {group.group}
              </span>
              <span className="text-[10px]" style={{ color: '#ccc' }}>
                {collapsed[group.group] ? '▶' : '▼'}
              </span>
            </button>

            {!collapsed[group.group] && group.items.map(item => (
              <button
                key={item.type}
                onClick={() => insertBlock(item.type)}
                className="w-full flex items-start gap-3 px-4 py-2 text-left hover:bg-white transition-colors group"
              >
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-xs font-medium text-primary leading-tight group-hover:text-[var(--navy)] transition-colors">
                    {item.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-snug mt-0.5 truncate">
                    {item.sub}
                  </span>
                </div>
                <span
                  className="text-[10px] font-medium shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--navy)' }}
                >
                  + Add
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
