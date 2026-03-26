import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Offer, OfferVersion } from '../lib/types'

interface OffersState {
  offers: Offer[]
  currentOffer: Offer | null
  versions: OfferVersion[]
  loading: boolean
  saving: boolean
  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<void>
  create: (data: Omit<Offer, 'id' | 'created_at' | 'updated_at'>) => Promise<string>
  update: (id: string, data: Partial<Omit<Offer, 'id' | 'created_at'>>) => Promise<void>
  deleteOffer: (id: string) => Promise<void>
  fetchVersions: (offerId: string) => Promise<void>
  saveVersion: (offerId: string) => Promise<void>
  restoreVersion: (versionId: string) => Promise<void>
}

export const useOffersStore = create<OffersState>((set, get) => ({
  offers: [],
  currentOffer: null,
  versions: [],
  loading: false,
  saving: false,

  fetchAll: async () => {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      set({ offers: (data ?? []) as Offer[] })
    } finally {
      set({ loading: false })
    }
  },

  fetchById: async (id: string) => {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      set({ currentOffer: data as Offer })
    } finally {
      set({ loading: false })
    }
  },

  create: async (data) => {
    set({ saving: true })
    try {
      const { data: inserted, error } = await supabase
        .from('offers')
        .insert(data)
        .select('id')
        .single()
      if (error) throw error
      await get().fetchAll()
      return (inserted as { id: string }).id
    } finally {
      set({ saving: false })
    }
  },

  update: async (id, data) => {
    set({ saving: true })
    try {
      const { error } = await supabase
        .from('offers')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      const { currentOffer } = get()
      if (currentOffer && currentOffer.id === id) {
        set({ currentOffer: { ...currentOffer, ...data, updated_at: new Date().toISOString() } })
      }
      await get().fetchAll()
    } finally {
      set({ saving: false })
    }
  },

  deleteOffer: async (id: string) => {
    const { error } = await supabase.from('offers').delete().eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  fetchVersions: async (offerId: string) => {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('offer_versions')
        .select('*')
        .eq('offer_id', offerId)
        .order('version', { ascending: false })
      if (error) throw error
      set({ versions: (data ?? []) as OfferVersion[] })
    } finally {
      set({ loading: false })
    }
  },

  saveVersion: async (offerId: string) => {
    const { currentOffer } = get()
    if (!currentOffer || currentOffer.id !== offerId) return

    const { error: versionError } = await supabase.from('offer_versions').insert({
      offer_id: offerId,
      version: currentOffer.version,
      sections_snapshot: currentOffer.sections,
      meta_snapshot: currentOffer.meta,
      pricing_total_snapshot: currentOffer.pricing_total,
    })
    if (versionError) throw versionError

    const { error: incrementError } = await supabase
      .from('offers')
      .update({ version: currentOffer.version + 1, updated_at: new Date().toISOString() })
      .eq('id', offerId)
    if (incrementError) throw incrementError

    set({
      currentOffer: {
        ...currentOffer,
        version: currentOffer.version + 1,
        updated_at: new Date().toISOString(),
      },
    })
    await get().fetchAll()
  },

  restoreVersion: async (versionId: string) => {
    const { data, error } = await supabase
      .from('offer_versions')
      .select('*')
      .eq('id', versionId)
      .single()
    if (error) throw error

    const version = data as OfferVersion

    // Snapshot current state before restoring
    await get().saveVersion(version.offer_id)

    await get().update(version.offer_id, {
      sections: version.sections_snapshot,
      meta: version.meta_snapshot,
      pricing_total: version.pricing_total_snapshot,
    })

    await get().fetchById(version.offer_id)
  },
}))
