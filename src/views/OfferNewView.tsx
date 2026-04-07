import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOffersStore } from '../stores/offers'
import { useClientsStore } from '../stores/clients'
import { toast } from '../lib/toast'
import { v4 as uuidv4 } from 'uuid'
import type { OfferSection } from '../lib/types'

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES = [
  { slug: 'short-offer',       title: 'Short Offer',            desc: 'Table-only pricing, one page.',                  accent: '#3B82F6' },
  { slug: 'website-redesign',  title: 'Website Redesign',       desc: 'UX, design, dev, and launch.',                   accent: '#6366F1' },
  { slug: 'mobile-app',        title: 'Mobile App',             desc: 'iOS/Android scoping and dev.',                   accent: '#8B5CF6' },
  { slug: 'analytics',         title: 'Analytics',              desc: 'Dashboards and reporting setup.',                 accent: '#0D9488' },
  { slug: 'maintenance',       title: 'Maintenance',            desc: 'Monthly support package + SLA.',                  accent: '#F97316' },
  { slug: 'change-request',    title: 'Change Request',         desc: 'Scoped CR with effort and pricing.',              accent: '#F59E0B' },
  { slug: 'copywriting',       title: 'Copywriting',            desc: 'Copy services with deliverables.',                accent: '#EC4899' },
  { slug: 'ux-ui-design',      title: 'UX/UI Design',           desc: 'Discovery, wireframes, prototype.',               accent: '#7C3AED' },
  { slug: 'seo',               title: 'SEO',                    desc: 'Audit, on-page, tracking.',                       accent: '#10B981' },
  { slug: 'development-only',  title: 'Development Only',       desc: 'Dev scope, design provided.',                     accent: '#475569' },
  { slug: 'ecommerce',         title: 'E-commerce',             desc: 'Store design, dev, integrations.',                accent: '#EF4444' },
]

const SUGGESTIONS = [
  'Website Redesign',
  'Mobile App Development',
  'E-commerce Store',
  'SEO Campaign',
  'Maintenance Package',
  'Change Request',
  'UX/UI Design',
  'Analytics Setup',
]

// ─── Minimal default sections for manual/template ────────────────────────────

const DEFAULT_SECTION_TYPES: OfferSection['type'][] = ['cover', 'intro', 'scope', 'pricing', 'notes', 'closing']

function makeDefaultSections(language: 'sl' | 'en'): OfferSection[] {
  const labels: Record<string, { sl: string; en: string }> = {
    cover:   { sl: 'Naslovna stran', en: 'Cover' },
    intro:   { sl: 'Uvod',           en: 'Introduction' },
    scope:   { sl: 'Obseg del',      en: 'Scope of Work' },
    pricing: { sl: 'Stroškovnik',    en: 'Pricing' },
    notes:   { sl: 'Splošne opombe', en: 'Notes' },
    closing: { sl: 'Zaključek',      en: 'Closing' },
  }
  return DEFAULT_SECTION_TYPES.map((type, i) => ({
    id: uuidv4(),
    type,
    title: labels[type]?.[language] ?? type,
    enabled: true,
    order: i,
    blocks: [],
  }))
}

// ─── Component ───────────────────────────────────────────────────────────────

type PanelMode = 'ai' | 'templates'

const INPUT_CLS = 'w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--navy)] bg-white placeholder:text-muted-foreground'

export function OfferNewView() {
  const navigate = useNavigate()
  const { create, generating, generateFromBrief } = useOffersStore()
  const { clients, fetchAll: fetchClients } = useClientsStore()

  useEffect(() => { fetchClients() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [panel, setPanel] = useState<PanelMode>('ai')
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientName, setClientName] = useState('')
  const [language, setLanguage] = useState<'sl' | 'en'>('sl')
  const [brief, setBrief] = useState('')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isLoading = saving || generating

  function close() { navigate('/offers') }

  function selectClient(id: string) {
    const c = clients.find(x => x.id === id)
    setClientId(id)
    setClientName(c?.name ?? '')
  }

  function appendSuggestion(label: string) {
    const text = brief ? `${brief}\n${label}: ` : `${label}: `
    setBrief(text)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!brief.trim() || !clientId) {
      toast('error', clientId ? 'Add a brief first' : 'Select a client first')
      return
    }
    setSaving(true)
    try {
      const id = await generateFromBrief({
        mode: 'quick',
        brief: brief.trim(),
        language,
        sections: ['cover', 'intro', 'scope', 'pricing', 'notes', 'closing'],
        coverMeta: {
          cover_title: title.trim() || clientName,
          client_display_name: clientName,
          doc_title: language === 'sl' ? 'Specifikacija ponudbe' : 'Offer Specification',
        },
        clientName,
        clientId,
        offerNumber: '',
      })
      toast('success', 'Offer generated')
      navigate(`/offers/${id}`)
    } catch {
      toast('error', 'Generation failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleUseTemplate(slug: string) {
    if (!clientId) { toast('error', 'Select a client first'); return }
    setSaving(true)
    try {
      const id = await create({
        title: title.trim() || clientName,
        client_id: clientId,
        client_name: clientName,
        offer_number: '',
        language,
        mode: 'manual',
        brief_text: null,
        sections: makeDefaultSections(language),
        meta: {
          cover_title: title.trim() || clientName,
          client_display_name: clientName,
          doc_title: language === 'sl' ? 'Specifikacija ponudbe' : 'Offer Specification',
          offer_eyebrow: slug,
        },
        pricing_total: 0,
        status: 'draft',
        version: 1,
      })
      toast('success', 'Offer created')
      navigate(`/offers/${id}`)
    } catch {
      toast('error', 'Failed to create offer')
    } finally {
      setSaving(false)
    }
  }

  async function handleScratch() {
    if (!clientId) { toast('error', 'Select a client first'); return }
    setSaving(true)
    try {
      const id = await create({
        title: title.trim() || clientName,
        client_id: clientId,
        client_name: clientName,
        offer_number: '',
        language,
        mode: 'manual',
        brief_text: null,
        sections: makeDefaultSections(language),
        meta: {
          cover_title: title.trim() || clientName,
          client_display_name: clientName,
          doc_title: language === 'sl' ? 'Specifikacija ponudbe' : 'Offer Specification',
        },
        pricing_total: 0,
        status: 'draft',
        version: 1,
      })
      toast('success', 'Offer created')
      navigate(`/offers/${id}`)
    } catch {
      toast('error', 'Failed to create offer')
    } finally {
      setSaving(false)
    }
  }

  return (
    /* Full-screen overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) close() }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 720, maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="font-bold text-base text-primary">New Offer</h2>

          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex items-center bg-[#f4f2ef] rounded-lg p-0.5">
              <button
                onClick={() => setPanel('ai')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  panel === 'ai' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-primary'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/></svg>
                Generate with AI
              </button>
              <button
                onClick={() => setPanel('templates')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  panel === 'templates' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-primary'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                Go with Templates
              </button>
            </div>

            {/* Language toggle */}
            <div className="flex items-center bg-[#f4f2ef] rounded-lg p-0.5">
              {(['sl', 'en'] as const).map(lang => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${
                    language === lang ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>

            {/* Close */}
            <button
              onClick={close}
              className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-[#f4f2ef] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* ── Persistent fields: Title + Client ── */}
        <div className="grid grid-cols-2 gap-3 px-6 py-4 border-b border-border shrink-0" style={{ background: '#fafaf8' }}>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Offer Title</label>
            <input
              className={INPUT_CLS}
              placeholder="e.g. Website Redesign 2026"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Client *</label>
            <select
              className={INPUT_CLS}
              value={clientId}
              onChange={e => selectClient(e.target.value)}
            >
              <option value="">Select a client…</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ── Panel content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── AI Panel ── */}
          {panel === 'ai' && (
            <form onSubmit={e => void handleGenerate(e)} className="flex flex-col h-full">
              <div className="flex-1 px-6 pt-6 pb-4">
                <h3 className="text-xl font-bold text-primary mb-1">What are you pitching today?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Describe the project, client needs, and goals. AI will draft the offer structure.
                </p>

                <div className="border border-border rounded-xl overflow-hidden bg-white">
                  <textarea
                    ref={textareaRef}
                    className="w-full resize-none text-sm text-primary placeholder:text-muted-foreground p-4 outline-none leading-relaxed"
                    style={{ minHeight: 160 }}
                    placeholder={`e.g. Redesign the website for a local law firm. They need a modern look, better mobile experience, CMS for blog posts, and a contact form. Budget around €8k, timeline 8 weeks.`}
                    value={brief}
                    onChange={e => setBrief(e.target.value)}
                  />
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-[#fafaf8]">
                    <div className="text-xs text-muted-foreground">{brief.length > 0 ? `${brief.length} chars` : 'More detail = better output'}</div>
                    <button
                      type="submit"
                      disabled={isLoading || !brief.trim() || !clientId}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'var(--navy)' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      {isLoading ? 'Generating…' : 'Generate Draft'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Suggestion chips */}
              <div className="px-6 pb-5 shrink-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Quick start</div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => appendSuggestion(s)}
                      className="px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors bg-white"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}

          {/* ── Templates Panel ── */}
          {panel === 'templates' && (
            <div className="p-5">
              <div className="grid grid-cols-3 gap-3">
                {/* Start from Scratch */}
                <button
                  onClick={() => void handleScratch()}
                  disabled={isLoading}
                  className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-center hover:border-primary/40 transition-colors disabled:opacity-40 min-h-[100px]"
                >
                  <div className="w-7 h-7 rounded-full border-2 border-border flex items-center justify-center text-muted-foreground font-light text-lg leading-none">+</div>
                  <div className="text-sm font-semibold text-primary">Start from Scratch</div>
                  <div className="text-xs text-muted-foreground">Build block by block</div>
                </button>

                {TEMPLATES.map(t => (
                  <button
                    key={t.slug}
                    onClick={() => void handleUseTemplate(t.slug)}
                    disabled={isLoading}
                    className="bg-white border border-border rounded-xl p-4 flex flex-col gap-2 text-left hover:border-primary/20 hover:shadow-sm transition-all disabled:opacity-40 group"
                  >
                    <div
                      className="w-5 h-1 rounded-full mb-1"
                      style={{ background: t.accent }}
                    />
                    <div className="text-sm font-semibold text-primary">{t.title}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{t.desc}</div>
                    <div
                      className="mt-auto text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: t.accent }}
                    >
                      Use template →
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
