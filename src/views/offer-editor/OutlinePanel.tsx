const BLOCK_LABELS: Record<string, { label: string; icon: string }> = {
  clientMeta:          { label: 'Offer Details',       icon: '◉' },
  serviceBlock:        { label: 'Service Section',      icon: '◈' },
  pricingTable:        { label: 'Pricing Table',        icon: '◫' },
  boilerplateBlock:    { label: 'Boilerplate',          icon: '◻' },
  maintenancePackage:  { label: 'Maintenance Package',  icon: '◈' },
  slaTable:            { label: 'SLA Table',            icon: '◫' },
  phaseBlock:          { label: 'Project Phase',        icon: '◉' },
  contentGridBlock:    { label: 'Content Grid',         icon: '▦' },
  bulletListBlock:     { label: 'Bullet List',          icon: '•' },
  infoBoxBlock:        { label: 'Info Box',             icon: 'ℹ' },
  heading:             { label: 'Heading',              icon: 'H' },
  paragraph:           { label: 'Paragraph',            icon: '¶' },
  bulletListItem:      { label: 'List item',            icon: '·' },
  numberedListItem:    { label: 'List item',            icon: '·' },
}

interface OutlineItem {
  id: string
  type: string
  title?: string
}

interface OutlinePanelProps {
  blocks: unknown[]
  offerId?: string
}

function extractOutline(blocks: unknown[]): OutlineItem[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (blocks as any[]).flatMap((b: any) => {
    const meta = BLOCK_LABELS[b.type]
    if (!meta && b.type === 'paragraph') return []  // skip empty paragraphs
    if (!meta) return []

    // Try to extract a meaningful title
    let title = ''
    if (b.type === 'serviceBlock' || b.type === 'phaseBlock') title = b.props?.title ?? ''
    if (b.type === 'bulletListBlock' || b.type === 'infoBoxBlock') title = b.props?.title ?? ''
    if (b.type === 'maintenancePackage') title = b.props?.name ?? ''
    if (b.type === 'heading') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      title = b.content?.map((c: any) => c.text ?? '').join('') ?? ''
    }

    return [{ id: b.id, type: b.type, title }]
  })
}

export function OutlinePanel({ blocks }: OutlinePanelProps) {
  const items = extractOutline(blocks)

  return (
    <div
      className="flex flex-col shrink-0 h-full overflow-hidden"
      style={{ width: 220, borderRight: '1px solid #e8e3ea', background: '#fafaf8' }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 shrink-0 flex items-center gap-2"
        style={{ borderBottom: '1px solid #e8e3ea' }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#999' }}>
          <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
          <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg>
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#aaa' }}>Outline</span>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto py-2">
        {items.length === 0 && (
          <div className="px-4 py-3 text-xs text-muted-foreground italic">No blocks yet</div>
        )}
        {items.map((item, i) => {
          const meta = BLOCK_LABELS[item.type]
          return (
            <div
              key={item.id ?? i}
              className="flex items-center gap-2 px-4 py-1.5 cursor-pointer hover:bg-white transition-colors group"
              onClick={() => {
                // Scroll the block into view by ID
                const el = document.querySelector(`[data-id="${item.id}"]`)
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
            >
              <span className="text-[11px] shrink-0" style={{ color: '#bbb', width: 14, textAlign: 'center' }}>
                {meta?.icon ?? '·'}
              </span>
              <span className="text-xs text-muted-foreground group-hover:text-primary truncate transition-colors">
                {item.title || meta?.label || item.type}
              </span>
            </div>
          )
        })}
      </div>

      {/* Footer: Add Section shortcut */}
      <div className="px-3 py-3 shrink-0" style={{ borderTop: '1px solid #e8e3ea' }}>
        <div className="text-[10px] text-muted-foreground text-center">
          Use <kbd className="px-1 py-0.5 rounded bg-white border border-border text-[9px] font-mono">/</kbd> in editor to add blocks
        </div>
      </div>
    </div>
  )
}
