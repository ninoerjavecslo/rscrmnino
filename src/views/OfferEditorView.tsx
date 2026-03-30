import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOffersStore } from '../stores/offers'
import { toast } from '../lib/toast'
import { SectionSidebar } from './offer-editor/SectionSidebar'
import { SectionEditor } from './offer-editor/SectionEditor'
import { renderOfferToHtml } from '../lib/offerRenderer'
import type { OfferSection } from '../lib/types'

export function OfferEditorView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentOffer, versions, saving, fetchById, fetchVersions, update, updateLocal, saveVersion, restoreVersion } = useOffersStore()
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      fetchById(id)
      fetchVersions(id)
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentOffer && !selectedSectionId) {
      const sorted = [...currentOffer.sections].sort((a, b) => a.order - b.order)
      const first = sorted.find(s => s.type !== 'cover') ?? sorted[0]
      setSelectedSectionId(first?.id ?? null)
    }
  }, [currentOffer?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSectionChange = useCallback((updated: OfferSection) => {
    if (!currentOffer) return
    const sections = currentOffer.sections.map(s => s.id === updated.id ? updated : s)
    updateLocal({ sections })
  }, [currentOffer, updateLocal])

  const handleToggleSection = useCallback((sectionId: string) => {
    if (!currentOffer) return
    const sections = currentOffer.sections.map(s =>
      s.id === sectionId ? { ...s, enabled: !s.enabled } : s
    )
    updateLocal({ sections })
  }, [currentOffer, updateLocal])

  async function handleSave() {
    if (!currentOffer) return
    try {
      await update(currentOffer.id, { sections: currentOffer.sections, meta: currentOffer.meta })
      toast('success', 'Saved')
    } catch {
      toast('error', 'Save failed')
    }
  }

  async function handleSaveVersion() {
    if (!currentOffer) return
    try {
      await saveVersion(currentOffer.id)
      toast('success', 'Version saved')
    } catch {
      toast('error', 'Failed to save version')
    }
  }

  async function handleRestoreVersion(versionId: string) {
    try {
      await restoreVersion(versionId)
      toast('success', 'Version restored')
    } catch {
      toast('error', 'Failed to restore version')
    }
  }

  const handlePreview = useCallback(() => {
    if (!currentOffer) return
    const html = renderOfferToHtml(currentOffer)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }, [currentOffer])

  if (!currentOffer) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  const selectedSection = currentOffer.sections.find(s => s.id === selectedSectionId) ?? null

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Top bar — dark, matches AgencyOS topbar style */}
      <div
        className="flex items-center justify-between px-6 border-b"
        style={{ background: 'var(--navy)', borderColor: 'rgba(255,255,255,0.08)', flexShrink: 0, height: 56 }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/tools/offer-generator')}
            style={{ color: 'rgba(255,255,255,0.5)' }}
            className="hover:text-white transition-colors"
            title="Back to offers"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <div>
            <div className="font-semibold text-sm text-white leading-tight">{currentOffer.title}</div>
            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{currentOffer.client_name}{currentOffer.offer_number ? ` · ${currentOffer.offer_number}` : ''}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreview}
            className="text-sm font-medium transition-colors px-3 py-1.5 rounded"
            style={{ color: 'rgba(255,255,255,0.65)', background: 'rgba(255,255,255,0.07)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.13)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
          >
            Preview PDF
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="text-sm font-semibold px-4 py-1.5 rounded transition-colors"
            style={{ background: '#E85C1A', color: '#fff', opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
            onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#d04f15' }}
            onMouseLeave={e => { if (!saving) e.currentTarget.style.background = '#E85C1A' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Two-panel body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <SectionSidebar
          sections={currentOffer.sections}
          selectedId={selectedSectionId}
          onSelect={setSelectedSectionId}
          onToggle={handleToggleSection}
          versions={versions}
          onRestoreVersion={handleRestoreVersion}
          onSaveVersion={() => void handleSaveVersion()}
          saving={saving}
        />

        <div className="flex-1 overflow-y-auto" style={{ background: '#f8f8f6' }}>
          {selectedSection ? (
            <SectionEditor
              section={selectedSection}
              language={currentOffer.language}
              onChange={handleSectionChange}
            />
          ) : (
            <div className="p-6 text-muted-foreground text-sm">Select a section from the sidebar.</div>
          )}
        </div>
      </div>
    </div>
  )
}
