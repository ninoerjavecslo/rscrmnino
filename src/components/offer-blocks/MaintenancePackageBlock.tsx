import { createReactBlockSpec } from '@blocknote/react'

export const MaintenancePackageBlock = createReactBlockSpec(
  {
    type: 'maintenancePackage',
    propSchema: {
      name: { default: 'Package' },
      priceMonthly: { default: '0' },
      featuresJson: { default: '[]' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const features: string[] = JSON.parse(block.props.featuresJson || '[]')
      const setFeatures = (f: string[]) =>
        editor.updateBlock(block, { props: { ...block.props, featuresJson: JSON.stringify(f) } })

      return (
        <div className="rounded-xl border border-emerald-100 my-2 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50/40 border-b border-emerald-100/60">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/80">Maintenance Package</span>
          </div>
          <div className="bg-white p-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-stone-400 mb-1">Package name</label>
                <input
                  className="font-bold text-base text-stone-900 bg-transparent border-none outline-none border-b border-transparent focus:border-stone-200 pb-0.5 transition-colors"
                  value={block.props.name}
                  onChange={e => editor.updateBlock(block, { props: { ...block.props, name: e.target.value } })}
                />
              </div>
              <div className="text-right">
                <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-stone-400 mb-1">Monthly price</label>
                <div className="flex items-baseline gap-1">
                  <span className="text-stone-400 text-sm">€</span>
                  <input
                    className="text-xl font-bold text-orange-500 bg-transparent border-none outline-none w-24 text-right"
                    value={block.props.priceMonthly}
                    onChange={e => editor.updateBlock(block, { props: { ...block.props, priceMonthly: e.target.value } })}
                  />
                  <span className="text-xs text-stone-400">/mo</span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Features</label>
              <ul className="space-y-1.5">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 group">
                    <span className="text-emerald-400 text-xs shrink-0">✓</span>
                    <input
                      className="flex-1 text-sm text-stone-600 bg-transparent border-none outline-none placeholder:text-stone-300"
                      value={f}
                      placeholder="Feature description…"
                      onChange={e => { const updated = [...features]; updated[i] = e.target.value; setFeatures(updated) }}
                    />
                    <button
                      onClick={() => setFeatures(features.filter((_, j) => j !== i))}
                      className="text-stone-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                    >×</button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setFeatures([...features, ''])}
                className="mt-2 text-xs text-emerald-500 hover:text-emerald-600 font-medium transition-colors"
              >+ Add feature</button>
            </div>
          </div>
        </div>
      )
    },
  }
)
