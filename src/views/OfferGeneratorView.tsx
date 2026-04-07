import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOffersStore } from '../stores/offers'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { toast } from '../lib/toast'
import type { Offer } from '../lib/types'

const STATUS_VARIANT: Record<string, 'green' | 'amber' | 'blue' | 'gray' | 'red'> = {
  draft: 'gray',
  sent: 'blue',
  accepted: 'green',
  rejected: 'red',
}

type Tab = 'all' | 'draft' | 'sent' | 'accepted' | 'rejected'

export function OfferGeneratorView() {
  const navigate = useNavigate()
  const { offers, loading, fetchAll, deleteOffer } = useOffersStore()
  const [tab, setTab] = useState<Tab>('all')

  useEffect(() => { fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(offer: Offer, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Delete "${offer.title}"?`)) return
    try {
      await deleteOffer(offer.id)
      toast('success', 'Offer deleted')
    } catch {
      toast('error', 'Failed to delete offer')
    }
  }

  const counts = {
    all: offers.length,
    draft: offers.filter(o => o.status === 'draft').length,
    sent: offers.filter(o => o.status === 'sent').length,
    accepted: offers.filter(o => o.status === 'accepted').length,
    rejected: offers.filter(o => o.status === 'rejected').length,
  }

  const filtered = tab === 'all' ? offers : offers.filter(o => o.status === tab)

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Drafts' },
    { key: 'sent', label: 'Sent' },
    { key: 'accepted', label: 'Accepted' },
    { key: 'rejected', label: 'Rejected' },
  ]

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-primary">Offers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage client proposals</p>
        </div>
        <Button onClick={() => navigate('/offers/new')}>+ New Offer</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Offers', value: counts.all },
          { label: 'Drafts', value: counts.draft },
          { label: 'Sent', value: counts.sent, highlight: counts.sent > 0 },
          { label: 'Accepted', value: counts.accepted, highlight: counts.accepted > 0 },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[10px] border border-border p-4">
            <div className="text-xs text-muted-foreground mb-1">{s.label}</div>
            <div className={`text-3xl font-bold ${s.highlight ? 'text-[var(--green)]' : 'text-primary'}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-primary'
            }`}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span className="ml-1.5 text-xs text-muted-foreground">{counts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-muted-foreground py-4">Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No offers yet.</p>
          <Button className="mt-4" onClick={() => navigate('/offers/new')}>
            Create your first offer
          </Button>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-white rounded-[10px] border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-[#fafaf9]">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lang</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(offer => (
                <tr
                  key={offer.id}
                  className="hover:bg-[#fafaf9] cursor-pointer transition-colors"
                  onClick={() => navigate(`/offers/${offer.id}`)}
                >
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{offer.offer_number || '—'}</td>
                  <td className="px-4 py-3 font-medium text-primary">{offer.client_name || <span className="text-muted-foreground italic">No client</span>}</td>
                  <td className="px-4 py-3 text-muted-foreground">{offer.title}</td>
                  <td className="px-4 py-3 text-xs uppercase text-muted-foreground">{offer.language}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[offer.status] ?? 'gray'}>{offer.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {offer.updated_at ? offer.updated_at.slice(0, 10) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={e => void handleDelete(offer, e)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
