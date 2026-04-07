import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MantineProvider } from '@mantine/core'
import { useOffersStore } from '../stores/offers'
import { toast } from '../lib/toast'
import { blocksToTemplateVars } from '../lib/blocksToTemplate'
import { renderOfferBlocksHtml } from '../lib/offerBlockTemplate'
import { loadDefaultBlocksForProjectType } from '../lib/offerTemplateLoader'
import { BlocknoteEditor } from './offer-editor/BlocknoteEditor'
import { OutlinePanel } from './offer-editor/OutlinePanel'
import { BlockPickerPanel } from './offer-editor/BlockPickerPanel'
import { BlockOptionsPanel } from './offer-editor/BlockOptionsPanel'

const A4_WIDTH = 794

const CUSTOM_BLOCK_TYPES = new Set([
  'clientMeta', 'serviceBlock', 'pricingTable', 'boilerplateBlock',
  'maintenancePackage', 'slaTable', 'phaseBlock', 'contentGridBlock',
  'bulletListBlock', 'infoBoxBlock',
])

// ── Right panel: tabbed Preview + Block Picker + Block Options ────────────────

type RightTab = 'preview' | 'blocks' | 'options'

function RightPanel({
  vars,
  editorRef,
  selectedBlock,
}: {
  vars: ReturnType<typeof blocksToTemplateVars>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editorRef: React.MutableRefObject<any>
  selectedBlock: unknown | null
}) {
  const [tab, setTab] = useState<RightTab>('preview')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.42)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasOptions = CUSTOM_BLOCK_TYPES.has((selectedBlock as any)?.type)

  // Auto-switch to Options tab when a custom block is focused, back to Preview when not
  useEffect(() => {
    if (hasOptions) {
      setTab('options')
    } else {
      setTab(prev => prev === 'options' ? 'preview' : prev)
    }
  }, [hasOptions])

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const available = containerRef.current.clientWidth - 16
        setScale(Math.min(available / A4_WIDTH, 1))
      }
    }
    update()
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (tab !== 'preview') return
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    doc.open()
    doc.write(renderOfferBlocksHtml(vars))
    doc.close()
  }, [vars, tab])

  function openInTab() {
    const html = renderOfferBlocksHtml(vars)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 5000))
  }

  const TABS: [RightTab, string][] = [
    ['preview', 'Preview'],
    ['blocks', 'Blocks'],
    ['options', 'Options'],
  ]

  return (
    <div
      className="flex flex-col shrink-0 h-full overflow-hidden"
      style={{ width: 380, borderLeft: '1px solid #e8e3ea' }}
    >
      {/* Tab bar */}
      <div
        className="flex items-center shrink-0"
        style={{ borderBottom: '1px solid #e8e3ea', background: '#fafaf8' }}
      >
        {TABS.map(([t, label]) => {
          const isOptions = t === 'options'
          const isActive = tab === t
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 relative ${
                isActive
                  ? 'border-primary text-primary bg-white'
                  : 'border-transparent text-muted-foreground hover:text-primary'
              }`}
            >
              {label}
              {isOptions && hasOptions && !isActive && (
                <span
                  className="absolute top-2 right-3 w-1.5 h-1.5 rounded-full"
                  style={{ background: '#E85C1A' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Preview tab */}
      {tab === 'preview' && (
        <div className="flex flex-col flex-1 overflow-hidden" style={{ background: '#1c1c1e' }}>
          <div
            className="flex items-center justify-between px-3 py-2 shrink-0"
            style={{ borderBottom: '1px solid #2a2a2c' }}
          >
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Live Preview
            </span>
            <button
              onClick={openInTab}
              className="text-[10px] font-medium px-2 py-0.5 rounded transition-colors"
              style={{ color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.07)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.13)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
            >
              Open ↗
            </button>
          </div>
          <div ref={containerRef} className="flex-1 overflow-y-auto p-2">
            <div
              style={{
                width: A4_WIDTH,
                transformOrigin: 'top left',
                transform: `scale(${scale})`,
                height: `calc(100% / ${scale})`,
              }}
            >
              <iframe
                ref={iframeRef}
                title="Offer preview"
                style={{ width: A4_WIDTH, height: '100%', border: 'none', background: 'white' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Blocks tab */}
      {tab === 'blocks' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <BlockPickerPanel editorRef={editorRef} />
        </div>
      )}

      {/* Options tab */}
      {tab === 'options' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <BlockOptionsPanel block={selectedBlock} editorRef={editorRef} />
        </div>
      )}
    </div>
  )
}

// ── Main editor view ──────────────────────────────────────────────────────────

export function OfferEditorView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentOffer, saving, fetchById, update, updateLocal } = useOffersStore()
  const [blocks, setBlocks] = useState<unknown[] | null>(null)
  const [selectedBlock, setSelectedBlock] = useState<unknown | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null)

  useEffect(() => {
    setBlocks(null)
    if (id) fetchById(id)
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentOffer) return
    const stored = (currentOffer.meta as Record<string, unknown>)?.blocks as unknown[] | undefined
    if (stored?.length) {
      setBlocks(stored)
    } else {
      loadDefaultBlocksForProjectType(
        (currentOffer.meta as Record<string, unknown>)?.project_type_slug as string || 'website-redesign',
        (currentOffer.language as 'sl' | 'en') || 'sl'
      ).then(setBlocks)
    }
  }, [currentOffer?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBlocksChange = useCallback((newBlocks: unknown[]) => {
    setBlocks(newBlocks)
  }, [])

  const templateVars = useMemo(() => blocksToTemplateVars(blocks ?? []), [blocks])

  async function handleSave() {
    if (!currentOffer || blocks === null) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = { ...(currentOffer.meta as any), blocks } as any
      await update(currentOffer.id, { meta })
      toast('success', 'Saved')
    } catch {
      toast('error', 'Save failed')
    }
  }

  async function handleTranslate() {
    if (!currentOffer || !blocks) return
    const targetLanguage = currentOffer.language === 'sl' ? 'en' : 'sl'
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const res = await fetch(`${supabaseUrl}/functions/v1/ai-translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ blocks, targetLanguage }),
      })
      const { blocks: translated } = await res.json()
      if (translated) {
        setBlocks(translated)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const meta = { ...(currentOffer.meta as any), blocks: translated } as any
        await update(currentOffer.id, { language: targetLanguage, meta })
        updateLocal({ language: targetLanguage })
        toast('success', `Translated to ${targetLanguage === 'en' ? 'English' : 'Slovenian'}`)
      }
    } catch {
      toast('error', 'Translation failed')
    }
  }

  if (!currentOffer || blocks === null) {
    return (
      <div className="flex items-center justify-center flex-1" style={{ background: '#f4f2ef' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: '#aaa' }}>
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="16 8"/>
          </svg>
          Loading offer…
        </div>
      </div>
    )
  }

  return (
    <MantineProvider>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        {/* ── Top bar ── */}
        <div
          className="flex items-center justify-between px-5 shrink-0"
          style={{ background: '#fff', borderBottom: '1px solid #e8e3ea', height: 52 }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/offers')}
              className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[#f4f2ef]"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
            </button>
            <div>
              <div className="font-semibold text-sm text-primary leading-tight">{currentOffer.title}</div>
              <div className="text-xs text-muted-foreground">
                {currentOffer.client_name}{currentOffer.offer_number ? ` · ${currentOffer.offer_number}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void handleTranslate()}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-primary hover:bg-[#f4f2ef] transition-colors"
            >
              {currentOffer.language === 'sl' ? '→ EN' : '→ SL'}
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-muted-foreground hover:text-primary hover:bg-[#f4f2ef] transition-colors disabled:opacity-50"
            >
              Save & Exit
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-4 py-1.5 rounded-md text-xs font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: '#E85C1A' }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {/* ── 3-panel body ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left: Outline (220px) */}
          <OutlinePanel blocks={blocks} offerId={id} />

          {/* Center: Document canvas */}
          <div className="flex-1 overflow-y-auto" style={{ background: '#f0eeeb' }}>
            <div className="mx-auto py-8 px-4" style={{ maxWidth: 740 }}>
              <div className="bg-white shadow-lg rounded-sm overflow-hidden" style={{ minHeight: 900 }}>
                <BlocknoteEditor
                  key={id}
                  initialBlocks={blocks}
                  onChange={handleBlocksChange}
                  editorRef={editorRef}
                  onBlockSelect={setSelectedBlock}
                />
              </div>
            </div>
          </div>

          {/* Right: Preview + Block picker + Options (380px) */}
          <RightPanel vars={templateVars} editorRef={editorRef} selectedBlock={selectedBlock} />

        </div>
      </div>
    </MantineProvider>
  )
}
