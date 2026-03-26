import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOffersStore } from '../stores/offers'
import { Button } from '../components/ui/button'
import { toast } from '../lib/toast'
import { SectionSidebar } from './offer-editor/SectionSidebar'
import { SectionEditor } from './offer-editor/SectionEditor'
import { renderOfferToHtml } from '../lib/offerRenderer'
import type { OfferSection } from '../lib/types'

export function OfferEditorView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentOffer, versions, loading, saving, fetchById, fetchVersions, update, saveVersion, restoreVersion } = useOffersStore()
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

  if (loading || !currentOffer) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  const selectedSection = currentOffer.sections.find(s => s.id === selectedSectionId) ?? null

  function handleSectionChange(updated: OfferSection) {
    const sections = currentOffer!.sections.map(s => s.id === updated.id ? updated : s)
    void update(currentOffer!.id, { sections })
  }

  function handleToggleSection(sectionId: string) {
    const sections = currentOffer!.sections.map(s =>
      s.id === sectionId ? { ...s, enabled: !s.enabled } : s
    )
    void update(currentOffer!.id, { sections })
  }

  async function handleSave() {
    try {
      await update(currentOffer!.id, { sections: currentOffer!.sections, meta: currentOffer!.meta })
      toast('success', 'Saved')
    } catch {
      toast('error', 'Save failed')
    }
  }

  async function handleSaveVersion() {
    try {
      await saveVersion(currentOffer!.id)
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

  function handlePreview() {
    const html = renderOfferToHtml(currentOffer!)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/tools/offer-generator')}
            className="text-muted-foreground hover:text-primary text-sm"
          >
            ←
          </button>
          <div>
            <div className="font-semibold text-sm text-primary">{currentOffer.title}</div>
            <div className="text-xs text-muted-foreground">{currentOffer.client_name} · {currentOffer.offer_number}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handlePreview}>
            Preview PDF
          </Button>
          <Button size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
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

        <div style={{ flex: 1, overflowY: 'auto', background: '#fafaf8' }}>
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
