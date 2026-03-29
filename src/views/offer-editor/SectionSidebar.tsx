import { memo, useMemo } from 'react'
import type { OfferSection, OfferVersion } from '../../lib/types'

interface Props {
  sections: OfferSection[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  versions: OfferVersion[]
  onRestoreVersion: (versionId: string) => void
  onSaveVersion: () => void
  saving: boolean
}

export const SectionSidebar = memo(function SectionSidebar({ sections, selectedId, onSelect, onToggle, versions, onRestoreVersion, onSaveVersion, saving }: Props) {
  const sorted = useMemo(() => [...sections].sort((a, b) => a.order - b.order), [sections])

  return (
    <div style={{ width: 220, background: '#1a1a1a', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'hidden' }}>
      <div style={{ padding: '14px 12px 6px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#444' }}>
        Sections
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
        {sorted.map(section => (
          <div
            key={section.id}
            onClick={() => onSelect(section.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              borderRadius: 6,
              marginBottom: 2,
              cursor: 'pointer',
              background: selectedId === section.id ? '#E85C1A' : 'transparent',
              transition: 'background 0.1s',
            }}
          >
            <button
              onClick={e => { e.stopPropagation(); onToggle(section.id) }}
              title={section.enabled ? 'Hide section' : 'Show section'}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 10,
                padding: 0,
                flexShrink: 0,
                lineHeight: 1,
                color: selectedId === section.id ? 'rgba(255,255,255,0.8)' : section.enabled ? '#E85C1A' : '#444',
              }}
            >
              {section.enabled ? '●' : '○'}
            </button>
            <span style={{
              fontSize: 12,
              fontWeight: selectedId === section.id ? 600 : 400,
              color: selectedId === section.id ? '#fff' : section.enabled ? '#ccc' : '#555',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {section.title}
            </span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid #2a2a2a', padding: '10px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#444', marginBottom: 8 }}>
          Versions
        </div>
        {versions.length === 0 && (
          <div style={{ fontSize: 10, color: '#444', marginBottom: 8 }}>No versions saved yet.</div>
        )}
        {versions.slice(0, 5).map(v => (
          <div
            key={v.id}
            onClick={() => {
              if (confirm(`Restore v${v.version}? Current state will be saved first.`)) onRestoreVersion(v.id)
            }}
            style={{
              fontSize: 11,
              color: '#888',
              padding: '4px 6px',
              marginBottom: 1,
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              borderRadius: 4,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2a2a2a')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ color: '#aaa' }}>v{v.version}</span>
            <span style={{ fontSize: 10, color: '#555' }}>
              {new Date(v.created_at).toLocaleDateString('sl-SI')}
            </span>
          </div>
        ))}
        <button
          onClick={onSaveVersion}
          disabled={saving}
          style={{
            marginTop: 8,
            width: '100%',
            background: '#2a2a2a',
            border: '1px solid #333',
            color: saving ? '#444' : '#888',
            fontSize: 11,
            padding: '6px 0',
            borderRadius: 4,
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'background 0.1s, color 0.1s',
          }}
          onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#333' }}
          onMouseLeave={e => { if (!saving) e.currentTarget.style.background = '#2a2a2a' }}
        >
          {saving ? 'Saving…' : 'Save version'}
        </button>
      </div>
    </div>
  )
})
