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

export function SectionSidebar({ sections, selectedId, onSelect, onToggle, versions, onRestoreVersion, onSaveVersion, saving }: Props) {
  const sorted = [...sections].sort((a, b) => a.order - b.order)
  return (
    <div style={{ width: 220, background: '#1a1a1a', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '14px 12px 8px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#555' }}>
        Sections
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {sorted.map(section => (
          <div
            key={section.id}
            onClick={() => onSelect(section.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
              borderRadius: 4, marginBottom: 2, cursor: 'pointer',
              background: selectedId === section.id ? '#E85C1A' : 'transparent',
              color: section.enabled ? '#fff' : '#555',
            }}
          >
            <button
              onClick={e => { e.stopPropagation(); onToggle(section.id) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: section.enabled ? '#E85C1A' : '#444', fontSize: 11, padding: 0, flexShrink: 0 }}
              title={section.enabled ? 'Hide section' : 'Show section'}
            >
              {section.enabled ? '●' : '○'}
            </button>
            <span style={{ fontSize: 12, fontWeight: selectedId === section.id ? 700 : 400 }}>
              {section.title}
            </span>
          </div>
        ))}
      </div>

      <div style={{ borderTop: '1px solid #2a2a2a', padding: '10px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#555', marginBottom: 6 }}>
          Versions
        </div>
        {versions.slice(0, 5).map(v => (
          <div
            key={v.id}
            onClick={() => { if (confirm(`Restore v${v.version}? Current state will be saved first.`)) onRestoreVersion(v.id) }}
            style={{ fontSize: 10, color: '#666', padding: '3px 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
          >
            <span>v{v.version}</span>
            <span style={{ fontSize: 9, color: '#444' }}>
              {new Date(v.created_at).toLocaleDateString('sl-SI')}
            </span>
          </div>
        ))}
        <button
          onClick={onSaveVersion}
          disabled={saving}
          style={{ marginTop: 8, width: '100%', background: '#2a2a2a', border: 'none', color: '#aaa', fontSize: 10, padding: '5px 0', borderRadius: 3, cursor: 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save version'}
        </button>
      </div>
    </div>
  )
}
