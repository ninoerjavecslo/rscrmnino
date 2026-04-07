import React, { useEffect, useState, MutableRefObject } from 'react'

const BLOCK_TYPE_LABELS: Record<string, string> = {
  clientMeta: 'Offer Details',
  serviceBlock: 'Service Section',
  pricingTable: 'Pricing Table',
  boilerplateBlock: 'Boilerplate',
  maintenancePackage: 'Maintenance Package',
  slaTable: 'SLA Table',
  phaseBlock: 'Project Phase',
  contentGridBlock: 'Content Grid',
  bulletListBlock: 'Bullet List',
  infoBoxBlock: 'Info Box',
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="relative rounded-full transition-colors shrink-0"
      style={{ width: 30, height: 17, background: value ? '#E85C1A' : '#D9D4CE' }}
    >
      <span
        className="absolute top-[2px] left-[2px] rounded-full bg-white shadow-sm transition-transform"
        style={{ width: 13, height: 13, transform: `translateX(${value ? 13 : 0}px)` }}
      />
    </button>
  )
}

function PillGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ background: '#EFECE7' }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="flex-1 text-[10px] font-semibold py-1 px-1.5 rounded-md transition-all"
          style={{
            background: value === o.value ? 'white' : 'transparent',
            color: value === o.value ? '#1A1A1A' : '#999',
            boxShadow: value === o.value ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function OptionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="text-xs text-stone-600 leading-tight">{label}</span>
      {children}
    </div>
  )
}

function Section({
  title,
  children,
  last = false,
}: {
  title: string
  children: React.ReactNode
  last?: boolean
}) {
  return (
    <div
      className="px-4 py-3.5"
      style={last ? undefined : { borderBottom: '1px solid #EAE5DD' }}
    >
      <div
        className="text-[9px] font-bold uppercase tracking-widest mb-3"
        style={{ color: '#BBB5AD' }}
      >
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

interface BlockOptionsPanelProps {
  block: unknown
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editorRef: MutableRefObject<any>
}

export function BlockOptionsPanel({ block, editorRef }: BlockOptionsPanelProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = block as any
  const blockId: string = b?.id ?? ''
  const [props, setProps] = useState<Record<string, string>>(b?.props ?? {})

  // Subscribe to editor changes to keep props fresh
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !blockId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fresh = editor.document.find((x: any) => x.id === blockId)
    if (fresh) setProps({ ...fresh.props })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsub = editor.onChange(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updated = editor.document.find((x: any) => x.id === blockId)
      if (updated) setProps({ ...updated.props })
    })
    return () => unsub?.()
  }, [blockId, editorRef])

  const update = (patch: Record<string, string>) => {
    const editor = editorRef.current
    if (!editor || !blockId) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const freshBlock = editor.document.find((x: any) => x.id === blockId)
    if (!freshBlock) return
    editor.updateBlock(freshBlock, { props: { ...freshBlock.props, ...patch } })
  }

  const type = b?.type as string
  const label = BLOCK_TYPE_LABELS[type] ?? type

  function renderOptions() {
    switch (type) {
      case 'pricingTable': {
        const paymentType = props.paymentType ?? 'one_time'
        const showTax = props.showTax === 'true'
        const striped = props.striped === 'true'
        const compact = props.compact === 'true'
        return (
          <>
            <Section title="Payment type">
              <PillGroup
                options={[
                  { value: 'one_time', label: 'One-time' },
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'yearly', label: 'Yearly' },
                ]}
                value={paymentType}
                onChange={v => update({ paymentType: v })}
              />
            </Section>
            <Section title="Pricing">
              <OptionRow label="Discount (€)">
                <input
                  className="w-20 text-right text-xs text-stone-700 bg-white rounded-lg px-2 py-1 outline-none"
                  style={{ border: '1px solid #E5E0D9' }}
                  value={props.discount ?? '0'}
                  onFocus={e => (e.currentTarget.style.borderColor = '#E85C1A')}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = '#E5E0D9'
                    update({ discount: e.currentTarget.value })
                  }}
                  onChange={e => setProps(p => ({ ...p, discount: e.target.value }))}
                />
              </OptionRow>
              <OptionRow label="Include VAT">
                <Toggle value={showTax} onChange={v => update({ showTax: v ? 'true' : 'false' })} />
              </OptionRow>
              {showTax && (
                <OptionRow label="Tax rate (%)">
                  <input
                    className="w-16 text-right text-xs text-stone-700 bg-white rounded-lg px-2 py-1 outline-none"
                    style={{ border: '1px solid #E5E0D9' }}
                    value={props.taxRate ?? '22'}
                    onFocus={e => (e.currentTarget.style.borderColor = '#E85C1A')}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = '#E5E0D9'
                      update({ taxRate: e.currentTarget.value })
                    }}
                    onChange={e => setProps(p => ({ ...p, taxRate: e.target.value }))}
                  />
                </OptionRow>
              )}
            </Section>
            <Section title="Display" last>
              <OptionRow label="Striped rows">
                <Toggle value={striped} onChange={v => update({ striped: v ? 'true' : 'false' })} />
              </OptionRow>
              <OptionRow label="Compact view">
                <Toggle value={compact} onChange={v => update({ compact: v ? 'true' : 'false' })} />
              </OptionRow>
            </Section>
          </>
        )
      }

      case 'serviceBlock': {
        const collapsed = props.collapsed === 'true'
        return (
          <Section title="Display" last>
            <OptionRow label="Collapsed">
              <Toggle value={collapsed} onChange={v => update({ collapsed: v ? 'true' : 'false' })} />
            </OptionRow>
          </Section>
        )
      }

      case 'contentGridBlock': {
        const columns = props.columns ?? '2'
        return (
          <Section title="Layout" last>
            <OptionRow label="Columns">
              <PillGroup
                options={[
                  { value: '1', label: '1 col' },
                  { value: '2', label: '2 col' },
                ]}
                value={columns}
                onChange={v => update({ columns: v })}
              />
            </OptionRow>
          </Section>
        )
      }

      case 'bulletListBlock': {
        const accent = props.accent ?? 'orange'
        return (
          <Section title="Style" last>
            <OptionRow label="Accent color">
              <div className="flex gap-2">
                {(['orange', 'black'] as const).map(a => (
                  <button
                    key={a}
                    onClick={() => update({ accent: a })}
                    className="w-6 h-6 rounded-full border-2 transition-all"
                    style={{
                      background: a === 'orange' ? '#E85C1A' : '#1A1A1A',
                      borderColor: accent === a ? '#999' : 'transparent',
                      outline: accent === a ? `2px solid ${a === 'orange' ? '#E85C1A' : '#1A1A1A'}40` : 'none',
                      outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
            </OptionRow>
          </Section>
        )
      }

      case 'infoBoxBlock': {
        const style = props.style ?? 'highlight'
        return (
          <Section title="Style" last>
            <PillGroup
              options={[
                { value: 'highlight', label: 'Highlight' },
                { value: 'note', label: 'Note' },
                { value: 'warning', label: 'Warning' },
              ]}
              value={style}
              onChange={v => update({ style: v })}
            />
          </Section>
        )
      }

      case 'boilerplateBlock': {
        const collapsed = props.collapsed === 'true'
        return (
          <Section title="Display" last>
            <OptionRow label="Collapsed">
              <Toggle value={collapsed} onChange={v => update({ collapsed: v ? 'true' : 'false' })} />
            </OptionRow>
          </Section>
        )
      }

      default:
        return (
          <div className="px-4 py-10 text-center">
            <div className="text-xs leading-relaxed" style={{ color: '#C0B9B2' }}>
              Edit fields directly in the block above.
            </div>
          </div>
        )
    }
  }

  if (!blockId) {
    return (
      <div className="flex flex-col h-full items-center justify-center" style={{ background: '#fafaf8' }}>
        <div className="text-xs text-center leading-relaxed px-6" style={{ color: '#C0B9B2' }}>
          Click any block to see its options here.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#fafaf8' }}>
      {/* Block type header */}
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #EAE5DD' }}>
        <div
          className="text-[9px] font-bold uppercase tracking-widest mb-1"
          style={{ color: '#BBB5AD' }}
        >
          Block options
        </div>
        <div className="text-xs font-semibold text-stone-700">{label}</div>
      </div>

      {/* Options */}
      <div className="flex-1 overflow-y-auto">
        {renderOptions()}
      </div>
    </div>
  )
}
