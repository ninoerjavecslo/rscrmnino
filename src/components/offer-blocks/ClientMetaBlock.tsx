import { createReactBlockSpec } from '@blocknote/react'

export const ClientMetaBlock = createReactBlockSpec(
  {
    type: 'clientMeta',
    propSchema: {
      offerNumber: { default: '' },
      projectTitle: { default: '' },
      clientName: { default: '' },
      contactPerson: { default: '' },
      date: { default: '' },
      validUntil: { default: '' },
      introText: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      const p = block.props
      const set = (key: string, value: string) =>
        editor.updateBlock(block, { props: { ...p, [key]: value } })

      const row1 = [
        { key: 'offerNumber', label: 'Offer #', value: p.offerNumber, placeholder: 'e.g. 26_4982' },
        { key: 'clientName', label: 'Client', value: p.clientName, placeholder: 'Company name' },
        { key: 'contactPerson', label: 'Contact person', value: p.contactPerson, placeholder: 'Full name' },
        { key: 'date', label: 'Date', value: p.date, placeholder: 'YYYY-MM-DD' },
        { key: 'validUntil', label: 'Valid until', value: p.validUntil, placeholder: 'YYYY-MM-DD' },
      ]

      return (
        <div className="rounded-xl my-2 overflow-hidden" style={{ border: '1px solid #EAE5DD', background: '#FDFCFB' }}>
          <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #EAE5DD', background: '#F9F7F4' }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#E85C1A' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#C47B52' }}>Offer Details</span>
          </div>
          <div className="p-4 space-y-3">
            {/* Project title — full width, prominent */}
            <div>
              <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                Project title <span className="font-normal normal-case tracking-normal text-stone-300">(shown on cover)</span>
              </label>
              <input
                className="w-full text-base font-semibold text-stone-900 bg-white rounded-lg px-2.5 py-2 outline-none placeholder:text-stone-300 transition-all"
                style={{ border: '1px solid #E5E0D9' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#E85C1A')}
                onBlur={e => (e.currentTarget.style.borderColor = '#E5E0D9')}
                value={p.projectTitle}
                placeholder="e.g. Ponudba za prenovo spletnega mesta"
                onChange={e => set('projectTitle', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {row1.map(({ key, label, value, placeholder }) => (
                <div key={key}>
                  <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-stone-400 mb-1">{label}</label>
                  <input
                    className="w-full text-sm text-stone-800 bg-white rounded-lg px-2.5 py-1.5 outline-none placeholder:text-stone-300 transition-all"
                    style={{ border: '1px solid #E5E0D9' }}
                    onFocus={e => (e.currentTarget.style.borderColor = '#E85C1A')}
                    onBlur={e => (e.currentTarget.style.borderColor = '#E5E0D9')}
                    value={value}
                    placeholder={placeholder}
                    onChange={e => set(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-stone-400 mb-1">
                Intro text <span className="font-normal normal-case tracking-normal text-stone-300">(optional)</span>
              </label>
              <textarea
                className="w-full text-sm text-stone-700 bg-white rounded-lg px-2.5 py-1.5 outline-none resize-none placeholder:text-stone-300 leading-relaxed transition-all"
                style={{ border: '1px solid #E5E0D9' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#E85C1A')}
                onBlur={e => (e.currentTarget.style.borderColor = '#E5E0D9')}
                rows={2}
                placeholder="Brief introduction or context for this offer…"
                value={p.introText}
                onChange={e => set('introText', e.target.value)}
              />
            </div>
          </div>
        </div>
      )
    },
  }
)
