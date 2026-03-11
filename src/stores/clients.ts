import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Client } from '../lib/types'

interface ClientsState {
  clients: Client[]
  loading: boolean
  error: string | null
  fetchAll: () => Promise<void>
  add: (data: Omit<Client, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  update: (id: string, data: Partial<Omit<Client, 'id' | 'created_at' | 'updated_at'>>) => Promise<void>
}

export const useClientsStore = create<ClientsState>((set, get) => ({
  clients: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name')
      if (error) throw error
      set({ clients: data ?? [] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  add: async (data) => {
    const { error } = await supabase.from('clients').insert(data)
    if (error) throw error
    await get().fetchAll()
  },

  update: async (id, data) => {
    const { error } = await supabase
      .from('clients')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },
}))
