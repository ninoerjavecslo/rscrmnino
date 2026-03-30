import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export interface Contractor {
  id: string
  name: string
  role?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  notes?: string | null
  status: 'active' | 'inactive'
  created_at: string
}

interface ContractorsState {
  contractors: Contractor[]
  loading: boolean
  fetchAll: () => Promise<void>
  add: (data: Omit<Contractor, 'id' | 'created_at'>) => Promise<void>
  update: (id: string, data: Partial<Omit<Contractor, 'id' | 'created_at'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useContractorsStore = create<ContractorsState>((set) => ({
  contractors: [],
  loading: false,

  fetchAll: async () => {
    set({ loading: true })
    const { data } = await supabase
      .from('contractors')
      .select('*')
      .order('name')
    set({ contractors: data ?? [], loading: false })
  },

  add: async (data) => {
    const { error } = await supabase.from('contractors').insert(data)
    if (error) throw error
    const { data: all } = await supabase.from('contractors').select('*').order('name')
    set({ contractors: all ?? [] })
  },

  update: async (id, data) => {
    const { error } = await supabase.from('contractors').update(data).eq('id', id)
    if (error) throw error
    const { data: all } = await supabase.from('contractors').select('*').order('name')
    set({ contractors: all ?? [] })
  },

  remove: async (id) => {
    const { error } = await supabase.from('contractors').delete().eq('id', id)
    if (error) throw error
    set(s => ({ contractors: s.contractors.filter(c => c.id !== id) }))
  },
}))
