import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOffersStore } from '../stores/offers'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { toast } from '../lib/toast'
import { v4 as uuidv4 } from 'uuid'
import type { OfferSection } from '../lib/types'

// ─── Section options ──────────────────────────────────────────────────────────

const ALL_SECTIONS: { type: OfferSection['type']; label: string; defaultEnabled: boolean }[] = [
  { type: 'cover', label: 'Cover', defaultEnabled: true },
  { type: 'intro', label: 'Introduction', defaultEnabled: true },
  { type: 'agency', label: 'About Agency', defaultEnabled: false },
  { type: 'strategy', label: 'Strategy', defaultEnabled: false },
  { type: 'phases', label: 'Phases / Timeline', defaultEnabled: true },
  { type: 'functionality', label: 'Functionality', defaultEnabled: false },
  { type: 'scope', label: 'Scope of Work', defaultEnabled: true },
  { type: 'tech', label: 'Technology', defaultEnabled: false },
  { type: 'optional-services', label: 'Optional Services', defaultEnabled: false },
  { type: 'maintenance', label: 'Maintenance', defaultEnabled: false },
  { type: 'rate-card', label: 'Rate Card', defaultEnabled: false },
  { type: 'team', label: 'Team', defaultEnabled: false },
  { type: 'references', label: 'References', defaultEnabled: false },
  { type: 'pricing', label: 'Pricing', defaultEnabled: true },
  { type: 'notes', label: 'Notes', defaultEnabled: true },
  { type: 'closing', label: 'Closing', defaultEnabled: true },
]

const SECTION_LABELS_SL: Partial<Record<OfferSection['type'], string>> = {
  cover: 'Naslovna stran',
  intro: 'Uvod',
  agency: 'O agenciji',
  strategy: 'Strategija',
  phases: 'Faze izvedbe',
  functionality: 'Funkcionalnosti',
  scope: 'Obseg del',
  tech: 'Tehnologija',
  'optional-services': 'Opcijske storitve',
  maintenance: 'Vzdrževanje',
  'rate-card': 'Cenik storitev',
  team: 'Projektna ekipa',
  references: 'Reference',
  pricing: 'Stroškovnik',
  notes: 'Splošne opombe',
  closing: 'Zaključek',
}

function defaultSections(enabled: OfferSection['type'][], language: 'sl' | 'en'): OfferSection[] {
  return ALL_SECTIONS.map((s, i) => ({
    id: uuidv4(),
    type: s.type,
    title: language === 'sl' ? (SECTION_LABELS_SL[s.type] ?? s.label) : s.label,
    enabled: enabled.includes(s.type),
    order: i,
    blocks: [],
  }))
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--navy)]'
const LABEL_CLS = 'text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1'

function LanguageToggle({ value, onChange }: { value: 'sl' | 'en'; onChange: (v: 'sl' | 'en') => void }) {
  return (
    <div className="flex gap-2">
      {(['sl', 'en'] as const).map(lang => (
        <button
          key={lang}
          type="button"
          onClick={() => onChange(lang)}
          className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${
            value === lang
              ? 'bg-primary text-white border-primary'
              : 'border-border text-muted-foreground hover:border-primary/40'
          }`}
        >
          {lang === 'sl' ? 'Slovenščina' : 'English'}
        </button>
      ))}
    </div>
  )
}

function SectionPicker({
  selected,
  onChange,
}: {
  selected: OfferSection['type'][]
  onChange: (v: OfferSection['type'][]) => void
}) {
  function toggle(type: OfferSection['type']) {
    if (type === 'cover') return // cover always on
    onChange(selected.includes(type) ? selected.filter(t => t !== type) : [...selected, type])
  }

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {ALL_SECTIONS.map(s => (
        <label
          key={s.type}
          className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded border cursor-pointer transition-colors ${
            selected.includes(s.type)
              ? 'border-primary bg-primary/5 text-primary font-medium'
              : 'border-border text-muted-foreground hover:border-primary/30'
          } ${s.type === 'cover' ? 'opacity-60 cursor-default' : ''}`}
        >
          <input
            type="checkbox"
            checked={selected.includes(s.type)}
            onChange={() => toggle(s.type)}
            disabled={s.type === 'cover'}
            className="hidden"
          />
          <span className={`w-3 h-3 rounded-sm border flex items-center justify-center flex-shrink-0 ${
            selected.includes(s.type) ? 'bg-primary border-primary' : 'border-border'
          }`}>
            {selected.includes(s.type) && <span className="text-white text-[9px] leading-none">✓</span>}
          </span>
          {s.label}
        </label>
      ))}
    </div>
  )
}

// ─── Mode Selection ───────────────────────────────────────────────────────────

function ModeCard({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: string
  title: string
  desc: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left border border-border rounded-lg p-5 hover:border-primary/50 hover:bg-[#fafaf8] transition-all group"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-semibold text-primary text-sm mb-1 group-hover:text-primary">{title}</div>
      <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
    </button>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

type Mode = 'select' | 'quick' | 'structured' | 'manual'

export function OfferNewView() {
  const navigate = useNavigate()
  const { create, generating, generateFromBrief } = useOffersStore()

  const [mode, setMode] = useState<Mode>('select')

  // Shared fields
  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [offerNumber, setOfferNumber] = useState('')
  const [language, setLanguage] = useState<'sl' | 'en'>('sl')
  const [coverTitle, setCoverTitle] = useState('Ponudba za razvoj spletne strani')
  const [clientAddress, setClientAddress] = useState('')
  const [dateLabel, setDateLabel] = useState('')
  const [aiDecidesSections, setAiDecidesSections] = useState(true)
  const [selectedSections, setSelectedSections] = useState<OfferSection['type'][]>(
    ALL_SECTIONS.filter(s => s.defaultEnabled).map(s => s.type)
  )

  // Quick mode
  const [brief, setBrief] = useState('')

  // Structured mode
  const [projectTitle, setProjectTitle] = useState('')
  const [projectDesc, setProjectDesc] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [phases, setPhases] = useState([{ name: '', deadline: '', budget: '' }])

  const [saving, setSaving] = useState(false)

  function buildMeta() {
    return {
      offer_eyebrow: offerNumber.trim() ? `Ponudba ${offerNumber.trim()}` : '',
      cover_title: coverTitle.trim() || title.trim(),
      client_display_name: clientName.trim(),
      client_address: clientAddress.trim(),
      date_label: dateLabel.trim(),
      doc_title: language === 'sl' ? 'Specifikacija ponudbe' : 'Offer Specification',
    }
  }

  function getSections() {
    return aiDecidesSections ? ALL_SECTIONS.map(s => s.type) : selectedSections
  }

  async function handleManual(e: React.FormEvent) {
    e.preventDefault()
    if (!clientName.trim()) return
    setSaving(true)
    try {
      const id = await create({
        title: title.trim() || clientName.trim(),
        client_name: clientName.trim(),
        offer_number: offerNumber.trim(),
        language,
        mode: 'manual',
        brief_text: null,
        sections: defaultSections(selectedSections, language),
        meta: buildMeta(),
        pricing_total: 0,
        status: 'draft',
        version: 1,
      })
      toast('success', 'Offer created')
      navigate(`/tools/offer-generator/${id}`)
    } catch {
      toast('error', 'Failed to create offer')
    } finally {
      setSaving(false)
    }
  }

  async function handleQuick(e: React.FormEvent) {
    e.preventDefault()
    if (!brief.trim() || !clientName.trim()) return
    setSaving(true)
    try {
      const id = await generateFromBrief({
        mode: 'quick',
        brief: brief.trim(),
        language,
        sections: getSections(),
        coverMeta: buildMeta(),
        clientName: clientName.trim(),
        offerNumber: offerNumber.trim(),
      })
      toast('success', 'Offer generated')
      navigate(`/tools/offer-generator/${id}`)
    } catch {
      toast('error', 'Failed to generate offer')
    } finally {
      setSaving(false)
    }
  }

  async function handleStructured(e: React.FormEvent) {
    e.preventDefault()
    if (!clientName.trim()) return
    setSaving(true)
    try {
      const formData = {
        clientName: clientName.trim(),
        contactPerson: contactPerson.trim(),
        projectTitle: projectTitle.trim(),
        projectDesc: projectDesc.trim(),
        phases: phases.filter(p => p.name),
      }
      const id = await generateFromBrief({
        mode: 'structured',
        formData,
        language,
        sections: getSections(),
        coverMeta: buildMeta(),
        clientName: clientName.trim(),
        offerNumber: offerNumber.trim(),
      })
      toast('success', 'Offer generated')
      navigate(`/tools/offer-generator/${id}`)
    } catch {
      toast('error', 'Failed to generate offer')
    } finally {
      setSaving(false)
    }
  }

  const isLoading = saving || generating

  // ─── Mode selection screen ──────────────────────────────────────────────────

  if (mode === 'select') {
    return (
      <div className="flex-1 overflow-auto p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/tools/offer-generator')} className="text-muted-foreground hover:text-primary text-sm">
            ← Offers
          </button>
          <h1 className="text-xl font-bold text-primary">New Offer</h1>
        </div>

        <div className="text-sm text-muted-foreground mb-6">Choose how you want to create your offer.</div>

        <div className="grid grid-cols-3 gap-4">
          <ModeCard
            icon="⚡"
            title="Quick (AI)"
            desc="Write a brief description and let AI generate the full offer structure and content."
            onClick={() => setMode('quick')}
          />
          <ModeCard
            icon="🧩"
            title="Structured (AI)"
            desc="Fill in project details, phases and budget. AI generates the offer from your data."
            onClick={() => setMode('structured')}
          />
          <ModeCard
            icon="✏️"
            title="Manual"
            desc="Create a blank offer and build every section yourself, block by block."
            onClick={() => setMode('manual')}
          />
        </div>
      </div>
    )
  }

  // ─── Shared fields JSX (inline, not a sub-component) ───────────────────────

  const sharedFields = (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Client & Offer</div>

        <div className="mb-4">
          <label className={LABEL_CLS}>Client name *</label>
          <input className={INPUT_CLS} placeholder="Pirnar d.o.o." value={clientName} onChange={e => setClientName(e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={LABEL_CLS}>Offer number</label>
            <input className={INPUT_CLS} placeholder="26_012" value={offerNumber} onChange={e => setOfferNumber(e.target.value)} />
          </div>
          <div>
            <label className={LABEL_CLS}>Language</label>
            <LanguageToggle value={language} onChange={setLanguage} />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Cover page</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLS}>Main heading</label>
              <input className={INPUT_CLS} value={coverTitle} onChange={e => setCoverTitle(e.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLS}>Date label</label>
              <input className={INPUT_CLS} placeholder="Marec 2026" value={dateLabel} onChange={e => setDateLabel(e.target.value)} />
            </div>
          </div>
          <div className="mt-3">
            <label className={LABEL_CLS}>Client address (cover)</label>
            <textarea className={`${INPUT_CLS} resize-none`} rows={2} placeholder={'Ime Priimek\nPodjetje d.o.o.'} value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const sectionsCard = (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sections to include</div>
          <button
            type="button"
            onClick={() => setAiDecidesSections(!aiDecidesSections)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
              aiDecidesSections
                ? 'border-[#E85C1A] bg-[#E85C1A]/10 text-[#E85C1A] font-medium'
                : 'border-border text-muted-foreground hover:border-[#E85C1A]/40'
            }`}
          >
            <span>✦</span> AI decides
          </button>
        </div>
        {aiDecidesSections ? (
          <div className="text-sm text-muted-foreground py-2">
            AI will select the most relevant sections based on your brief.
          </div>
        ) : (
          <SectionPicker selected={selectedSections} onChange={setSelectedSections} />
        )}
      </CardContent>
    </Card>
  )

  // ─── Quick mode ─────────────────────────────────────────────────────────────

  if (mode === 'quick') {
    return (
      <div className="flex-1 overflow-auto p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setMode('select')} className="text-muted-foreground hover:text-primary text-sm">← Back</button>
          <h1 className="text-xl font-bold text-primary">Quick Offer (AI)</h1>
        </div>

        <form onSubmit={handleQuick} className="flex flex-col gap-4">
          {sharedFields}

          <Card>
            <CardContent className="p-5">
              <label className={`${LABEL_CLS} mb-3`}>Project brief *</label>
              <textarea
                className={`${INPUT_CLS} resize-none`}
                rows={8}
                placeholder={`Describe the project in detail:\n\n- Client and their business\n- What needs to be built\n- Key goals and requirements\n- Budget range\n- Timeline expectations\n- Any specific technical requirements`}
                value={brief}
                onChange={e => setBrief(e.target.value)}
                required
              />
              <div className="text-xs text-muted-foreground mt-2">The more detail you provide, the better the generated offer will be.</div>
            </CardContent>
          </Card>

          {sectionsCard}

          <div className="flex gap-3">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Generating offer…' : 'Generate offer →'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setMode('select')} disabled={isLoading}>
              Cancel
            </Button>
          </div>

          {isLoading && (
            <div className="text-sm text-muted-foreground animate-pulse">
              AI is writing your offer. This usually takes 15–30 seconds…
            </div>
          )}
        </form>
      </div>
    )
  }

  // ─── Structured mode ────────────────────────────────────────────────────────

  if (mode === 'structured') {
    return (
      <div className="flex-1 overflow-auto p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setMode('select')} className="text-muted-foreground hover:text-primary text-sm">← Back</button>
          <h1 className="text-xl font-bold text-primary">Structured Offer (AI)</h1>
        </div>

        <form onSubmit={handleStructured} className="flex flex-col gap-4">
          {sharedFields}

          <Card>
            <CardContent className="p-5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Project details</div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={LABEL_CLS}>Project title</label>
                  <input className={INPUT_CLS} placeholder="Prenova spletne strani" value={projectTitle} onChange={e => setProjectTitle(e.target.value)} />
                </div>
                <div>
                  <label className={LABEL_CLS}>Contact person</label>
                  <input className={INPUT_CLS} placeholder="Janez Novak" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
                </div>
              </div>

              <div className="mb-4">
                <label className={LABEL_CLS}>Project description</label>
                <textarea className={`${INPUT_CLS} resize-none`} rows={4} placeholder="Describe the project goals and requirements…" value={projectDesc} onChange={e => setProjectDesc(e.target.value)} />
              </div>

              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Phases</div>
                {phases.map((p, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 mb-2">
                    <input className={INPUT_CLS} placeholder="Phase name" value={p.name} onChange={e => setPhases(phases.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} />
                    <input className={INPUT_CLS} placeholder="Deadline" value={p.deadline} onChange={e => setPhases(phases.map((x, idx) => idx === i ? { ...x, deadline: e.target.value } : x))} />
                    <div className="flex gap-2">
                      <input className={`${INPUT_CLS} flex-1`} placeholder="Budget" value={p.budget} onChange={e => setPhases(phases.map((x, idx) => idx === i ? { ...x, budget: e.target.value } : x))} />
                      <button type="button" onClick={() => setPhases(phases.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-red-500">×</button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPhases([...phases, { name: '', deadline: '', budget: '' }])}
                  className="text-xs border border-dashed rounded px-3 py-1 mt-1 transition-colors hover:bg-white"
                  style={{ borderColor: '#E85C1A', color: '#E85C1A' }}
                >
                  + Add phase
                </button>
              </div>
            </CardContent>
          </Card>

          {sectionsCard}

          <div className="flex gap-3">
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Generating offer…' : 'Generate offer →'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setMode('select')} disabled={isLoading}>
              Cancel
            </Button>
          </div>

          {isLoading && (
            <div className="text-sm text-muted-foreground animate-pulse">
              AI is writing your offer. This usually takes 15–30 seconds…
            </div>
          )}
        </form>
      </div>
    )
  }

  // ─── Manual mode ────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-auto p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setMode('select')} className="text-muted-foreground hover:text-primary text-sm">← Back</button>
        <h1 className="text-xl font-bold text-primary">Manual Offer</h1>
      </div>

      <form onSubmit={handleManual} className="flex flex-col gap-4">
        {sharedFields}

        <Card>
          <CardContent className="p-5">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Offer title</div>
            <input
              className={INPUT_CLS}
              placeholder="Pirnar — Prenova spletne strani"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
            <div className="text-xs text-muted-foreground mt-1">Used as the document title in the editor. Defaults to client name if left blank.</div>
          </CardContent>
        </Card>

        {sectionsCard}

        <div className="flex gap-3">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Creating…' : 'Create offer →'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/tools/offer-generator')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
