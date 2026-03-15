import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { PipelineItem } from '../lib/types'

interface PipelineState {
  items: PipelineItem[]
  loading: boolean
  error: string | null
  fetchByClient: (clientId: string) => Promise<void>
  fetchAll: () => Promise<void>
  add: (data: Omit<PipelineItem, 'id' | 'created_at' | 'client'>) => Promise<void>
  update: (id: string, data: Partial<Omit<PipelineItem, 'id' | 'created_at' | 'client'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  items: [],
  loading: false,
  error: null,

  fetchByClient: async (clientId: string) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('pipeline_items')
        .select('*, client:clients(id, name)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      if (error) throw error
      set({ items: (data ?? []) as PipelineItem[] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('pipeline_items')
        .select('*, client:clients(id, name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      set({ items: (data ?? []) as PipelineItem[] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  add: async (data) => {
    const { error } = await supabase.from('pipeline_items').insert(data)
    if (error) throw error
    await get().fetchAll()
  },

  update: async (id, data) => {
    const { error } = await supabase.from('pipeline_items').update(data).eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  remove: async (id) => {
    const { error } = await supabase.from('pipeline_items').delete().eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },
}))
