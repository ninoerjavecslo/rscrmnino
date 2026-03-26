import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOffersStore } from '../stores/offers'
import { Button } from '../components/ui/button'
import { toast } from '../lib/toast'
import { v4 as uuidv4 } from 'uuid'
import type { OfferSection } from '../lib/types'

function defaultSections(): OfferSection[] {
  return [
    { id: uuidv4(), type: 'cover', title: 'Naslovna stran', enabled: true, order: 0, blocks: [] },
    { id: uuidv4(), type: 'intro', title: 'Uvod', enabled: true, order: 1, blocks: [] },
    { id: uuidv4(), type: 'scope', title: 'Obseg del', enabled: true, order: 2, blocks: [] },
    { id: uuidv4(), type: 'pricing', title: 'Stroškovnik', enabled: true, order: 3, blocks: [] },
    { id: uuidv4(), type: 'notes', title: 'Splošne opombe', enabled: true, order: 4, blocks: [] },
    { id: uuidv4(), type: 'payment', title: 'Plačilni pogoji', enabled: false, order: 5, blocks: [] },
    { id: uuidv4(), type: 'copyright', title: 'Avtorske pravice', enabled: false, order: 6, blocks: [] },
  ]
}

export function OfferNewView() {
  const navigate = useNavigate()
  const { create } = useOffersStore()

  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [offerNumber, setOfferNumber] = useState('')
  const [language, setLanguage] = useState<'sl' | 'en'>('sl')
  const [coverTitle, setCoverTitle] = useState('Ponudba za razvoj spletne strani')
  const [clientAddress, setClientAddress] = useState('')
  const [dateLabel, setDateLabel] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !clientName.trim()) return
    setSaving(true)
    try {
      const id = await create({
        title: title.trim(),
        client_name: clientName.trim(),
        offer_number: offerNumber.trim(),
        language,
        mode: 'manual',
        brief_text: null,
        sections: defaultSections(),
        meta: {
          offer_eyebrow: offerNumber.trim() ? `Ponudba ${offerNumber.trim()}` : '',
          cover_title: coverTitle.trim(),
          client_display_name: clientName.trim(),
          client_address: clientAddress.trim(),
          date_label: dateLabel.trim(),
          doc_title: 'Specifikacija ponudbe',
        },
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

  return (
    <div className="flex-1 overflow-auto p-6 max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/tools/offer-generator')}
          className="text-muted-foreground hover:text-primary text-sm"
        >
          ← Offers
        </button>
        <h1 className="text-xl font-bold text-primary">New Offer</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
            Offer title *
          </label>
          <input
            className="w-full border border-border rounded-md px-3 py-2 text-sm"
            placeholder="Pirnar — Prenova spletne strani"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Client name *
            </label>
            <input
              className="w-full border border-border rounded-md px-3 py-2 text-sm"
              placeholder="Pirnar d.o.o."
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Offer number
            </label>
            <input
              className="w-full border border-border rounded-md px-3 py-2 text-sm"
              placeholder="26_012"
              value={offerNumber}
              onChange={e => setOfferNumber(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
            Language
          </label>
          <div className="flex gap-2">
            {(['sl', 'en'] as const).map(lang => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${
                  language === lang
                    ? 'bg-primary text-white border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {lang === 'sl' ? 'Slovenščina' : 'English'}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4 mb-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Cover page
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Main heading</label>
              <input
                className="w-full border border-border rounded-md px-3 py-2 text-sm"
                value={coverTitle}
                onChange={e => setCoverTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Client address (cover)</label>
              <textarea
                className="w-full border border-border rounded-md px-3 py-2 text-sm"
                rows={3}
                placeholder={'Ime Priimek\nPodjetje d.o.o.\n1000 Ljubljana'}
                value={clientAddress}
                onChange={e => setClientAddress(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date label</label>
              <input
                className="w-full border border-border rounded-md px-3 py-2 text-sm"
                placeholder="Marec 2026"
                value={dateLabel}
                onChange={e => setDateLabel(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Creating…' : 'Create offer →'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/tools/offer-generator')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
