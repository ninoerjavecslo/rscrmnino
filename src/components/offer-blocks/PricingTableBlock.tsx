import { createReactBlockSpec } from '@blocknote/react'

interface LineItem { description: string; quantity: number; unit: string; unit_price: number; total: number }

export const PricingTableBlock = createReactBlockSpec(
  {
    type: 'pricingTable',
    propSchema: {
      itemsJson: { default: '[]' },
      discount: { default: '0' },
      paymentType: { default: 'one_time' },
      showTax: { default: 'false' },
      taxRate: { default: '22' },
      striped: { default: 'false' },
      compact: { default: 'false' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const items: LineItem[] = JSON.parse(block.props.itemsJson || '[]')
      const discount = parseFloat(block.props.discount) || 0
      const showTax = block.props.showTax === 'true'
      const taxRate = parseFloat(block.props.taxRate) || 22
      const striped = block.props.striped === 'true'
      const compact = block.props.compact === 'true'
      const subtotal = items.reduce((s, i) => s + i.total, 0)
      const afterDiscount = subtotal - discount
      const tax = showTax ? afterDiscount * (taxRate / 100) : 0
      const total = afterDiscount + tax
      const rowPy = compact ? 'py-1' : 'py-2'

      const update = (newItems: LineItem[], newDiscount?: number) => {
        const updated = newItems.map(i => ({ ...i, total: i.quantity * i.unit_price }))
        editor.updateBlock(block, {
          props: {
            ...block.props,
            itemsJson: JSON.stringify(updated),
            discount: String(newDiscount ?? discount),
          },
        })
      }

      const addRow = () => update([...items, { description: '', quantity: 1, unit: 'h', unit_price: 0, total: 0 }])
      const removeRow = (idx: number) => update(items.filter((_, i) => i !== idx))
      const updateRow = (idx: number, field: keyof LineItem, val: string) => {
        const updated = items.map((item, i) =>
          i === idx ? { ...item, [field]: field === 'description' || field === 'unit' ? val : parseFloat(val) || 0 } : item
        )
        update(updated)
      }

      return (
        <div className="rounded-xl border border-orange-100 my-2 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-50/40 border-b border-orange-100/60">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400/80">Pricing</span>
          </div>
          <div className="bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-100">
                  {['Description', 'Qty', 'Unit', 'Unit price', 'Total', ''].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[9px] font-semibold uppercase tracking-wider text-stone-400 bg-stone-50">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {items.map((item, idx) => (
                  <tr
                    key={idx}
                    className="group hover:bg-stone-50/60 transition-colors"
                    style={striped && idx % 2 === 1 ? { background: '#FAFAF8' } : undefined}
                  >
                    {(['description', 'quantity', 'unit', 'unit_price'] as const).map(field => (
                      <td key={field} className={`px-3 ${rowPy}`}>
                        <input
                          className="w-full bg-transparent border-none outline-none text-stone-700 placeholder:text-stone-300"
                          value={String(item[field])}
                          placeholder={field === 'description' ? 'Item description…' : undefined}
                          onChange={e => updateRow(idx, field, e.target.value)}
                        />
                      </td>
                    ))}
                    <td className={`px-3 ${rowPy} text-stone-500 tabular-nums`}>€{item.total.toFixed(2)}</td>
                    <td className={`px-3 ${rowPy}`}>
                      <button
                        onClick={() => removeRow(idx)}
                        className="text-stone-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                      >×</button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-xs text-stone-300">No items yet</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="flex items-end justify-between px-3 py-3 border-t border-stone-100 bg-stone-50/50">
              <button onClick={addRow} className="text-xs text-orange-500 hover:text-orange-600 font-medium transition-colors">
                + Add row
              </button>
              <div className="text-right space-y-1">
                {(discount > 0 || showTax) && (
                  <div className="text-xs text-stone-400">
                    Subtotal: <span className="font-semibold text-stone-600">€{subtotal.toFixed(2)}</span>
                  </div>
                )}
                {discount > 0 && (
                  <div className="text-xs text-stone-400">
                    Discount: <span className="text-stone-600">−€{discount.toFixed(2)}</span>
                  </div>
                )}
                {showTax && (
                  <div className="text-xs text-stone-400">
                    VAT ({taxRate}%): <span className="font-semibold text-stone-600">€{tax.toFixed(2)}</span>
                  </div>
                )}
                <div className="text-sm font-bold text-stone-900">
                  Total: <span className="text-orange-500">€{total.toFixed(2)}</span>
                  <span className="text-xs font-normal text-stone-400 ml-1">
                    ({showTax ? 'incl. VAT' : 'excl. VAT'})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    },
  }
)
