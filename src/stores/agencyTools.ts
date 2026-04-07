import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export interface AgencyTool {
  id: string
  name: string
  category: string
  billing_cycle: 'monthly' | 'yearly' | 'one-time'
  cost: number
  url?: string | null
  email?: string | null
  notes?: string | null
  status: 'active' | 'inactive'
  paying_from?: string | null
  billable: boolean
  client_id?: string | null
  billing_from?: string | null
  project_id?: string | null
  created_at: string
}

interface AgencyToolsState {
  tools: AgencyTool[]
  loading: boolean
  fetchAll: () => Promise<void>
  add: (data: Omit<AgencyTool, 'id' | 'created_at'>) => Promise<void>
  update: (id: string, data: Partial<Omit<AgencyTool, 'id' | 'created_at'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useAgencyToolsStore = create<AgencyToolsState>((set) => ({
  tools: [],
  loading: false,

  fetchAll: async () => {
    set({ loading: true })
    const { data } = await supabase
      .from('agency_tools')
      .select('*')
      .order('category')
      .order('name')
    set({ tools: data ?? [], loading: false })
  },

  add: async (data) => {
    const { error } = await supabase.from('agency_tools').insert(data)
    if (error) throw error
    const { data: all } = await supabase.from('agency_tools').select('*').order('category').order('name')
    set({ tools: all ?? [] })
  },

  update: async (id, data) => {
    const { error } = await supabase.from('agency_tools').update(data).eq('id', id)
    if (error) throw error
    const { data: all } = await supabase.from('agency_tools').select('*').order('category').order('name')
    set({ tools: all ?? [] })
  },

  remove: async (id) => {
    const { error } = await supabase.from('agency_tools').delete().eq('id', id)
    if (error) throw error
    set(s => ({ tools: s.tools.filter(t => t.id !== id) }))
  },
}))
