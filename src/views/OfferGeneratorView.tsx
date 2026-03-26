import { useEffect } from 'react'
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

export function OfferGeneratorView() {
  const navigate = useNavigate()
  const { offers, loading, fetchAll, deleteOffer } = useOffersStore()

  useEffect(() => { fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(offer: Offer) {
    if (!confirm(`Delete "${offer.title}"?`)) return
    try {
      await deleteOffer(offer.id)
      toast('success', 'Offer deleted')
    } catch {
      toast('error', 'Failed to delete offer')
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-primary">Offer Generator</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage client proposals</p>
        </div>
        <Button onClick={() => navigate('/tools/offer-generator/new')}>
          + New Offer
        </Button>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!loading && offers.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No offers yet.</p>
          <Button className="mt-4" onClick={() => navigate('/tools/offer-generator/new')}>
            Create your first offer
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {offers.map(offer => (
          <div
            key={offer.id}
            className="bg-white rounded-[10px] border border-border p-4 flex items-center justify-between cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate(`/tools/offer-generator/${offer.id}`)}
          >
            <div className="flex items-center gap-4">
              <div>
                <div className="font-semibold text-sm text-primary">{offer.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {offer.offer_number && <span className="mr-2">{offer.offer_number}</span>}
                  {offer.client_name}
                  {offer.pricing_total > 0 && (
                    <span className="ml-2">· €{offer.pricing_total.toLocaleString('sl-SI')}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={STATUS_VARIANT[offer.status] ?? 'gray'}>
                {offer.status}
              </Badge>
              <span className="text-xs text-muted-foreground">v{offer.version}</span>
              <Button
                size="xs"
                variant="ghost"
                onClick={e => { e.stopPropagation(); void handleDelete(offer) }}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
