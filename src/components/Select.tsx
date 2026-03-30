import { useState, useRef, useEffect } from 'react'

export interface SelectOption {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  style?: React.CSSProperties
  className?: string
  placeholder?: string
  searchable?: boolean
  compact?: boolean
}

export function Select({ value, onChange, options, style, className, placeholder, searchable, compact }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Auto-enable search when there are many options
  const showSearch = searchable ?? options.length > 6

  useEffect(() => {
    if (!open) { setQuery(''); return }
    if (showSearch) setTimeout(() => searchRef.current?.focus(), 10)
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, showSearch])

  const selected = options.find(o => o.value === value)
  const displayLabel = selected ? selected.label : (placeholder ?? '—')

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  return (
    <div ref={ref} style={{ position: 'relative', ...style }} className={className}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          padding: '0 36px 0 14px',
          border: '1px solid var(--c6)',
          borderRadius: 10,
          background: '#fff',
          fontSize: 14,
          color: selected ? 'var(--c0)' : 'var(--c4)',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          height: compact ? 34 : 42,
          outline: 'none',
          fontFamily: 'inherit',
          position: 'relative',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayLabel}
        </span>
        <svg
          width="12" height="8" viewBox="0 0 12 8" fill="none"
          style={{ position: 'absolute', right: 12, top: '50%', transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)', transition: 'transform 0.15s', flexShrink: 0 }}
        >
          <path d="M1 1l5 5 5-5" stroke="var(--c4)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: '#fff',
          border: '1px solid var(--c6)',
          borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          zIndex: 1000,
        }}>
          {showSearch && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--c6)' }}>
              <input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search…"
                style={{ width: '100%', height: 32, fontSize: 13, border: '1px solid var(--c6)', borderRadius: 6, padding: '0 10px', outline: 'none', fontFamily: 'inherit' }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '10px 14px', fontSize: 13, color: 'var(--c4)' }}>No results</div>
            ) : filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false) }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '9px 14px',
                  border: 'none',
                  borderBottom: '1px solid var(--c7)',
                  background: opt.value === value ? 'var(--navy-light)' : '#fff',
                  fontSize: 14,
                  color: opt.value === value ? 'var(--navy)' : 'var(--c1)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontWeight: opt.value === value ? 600 : 400,
                  fontFamily: 'inherit',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
