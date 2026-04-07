import { createReactBlockSpec } from '@blocknote/react'

export const SLATableBlock = createReactBlockSpec(
  {
    type: 'slaTable',
    propSchema: {
      responseTimeHours: { default: '24' },
      uptimePct: { default: '99.5' },
      includedHours: { default: '2' },
      notes: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const set = (key: string, value: string) =>
        editor.updateBlock(block, { props: { ...block.props, [key]: value } })

      const rows = [
        { key: 'responseTimeHours', label: 'Response time', value: block.props.responseTimeHours, suffix: 'hours' },
        { key: 'uptimePct', label: 'Uptime guarantee', value: block.props.uptimePct, suffix: '%' },
        { key: 'includedHours', label: 'Included support hours', value: block.props.includedHours, suffix: 'h/month' },
      ]

      return (
        <div className="rounded-xl border border-teal-100 my-2 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-teal-50/40 border-b border-teal-100/60">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-teal-500/80">SLA Parameters</span>
          </div>
          <table className="w-full text-sm bg-white">
            <tbody className="divide-y divide-stone-50">
              {rows.map(row => (
                <tr key={row.key} className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-4 py-2.5 text-stone-500 text-xs w-1/2">{row.label}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <input
                        className="bg-transparent border-none outline-none font-semibold text-stone-800 w-16 text-sm"
                        value={row.value}
                        onChange={e => set(row.key, e.target.value)}
                      />
                      <span className="text-stone-400 text-xs">{row.suffix}</span>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="hover:bg-stone-50/50 transition-colors">
                <td className="px-4 py-2.5 text-stone-500 text-xs">Notes</td>
                <td className="px-4 py-2.5">
                  <input
                    className="w-full bg-transparent border-none outline-none text-sm text-stone-600 placeholder:text-stone-300"
                    value={block.props.notes}
                    placeholder="Optional notes…"
                    onChange={e => set('notes', e.target.value)}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )
    },
  }
)
