import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Project } from '../lib/types'

interface ProjectsState {
  projects: Project[]
  loading: boolean
  error: string | null
  fetchAll: () => Promise<void>
  add: (data: Omit<Project, 'id' | 'client'>) => Promise<void>
  update: (id: string, data: Partial<Omit<Project, 'id' | 'client'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*, client:clients(id, name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      set({ projects: data ?? [] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  add: async (data) => {
    // Set initial_contract_value once at creation — never overwritten on edit
    const insertData = { ...data, initial_contract_value: data.contract_value ?? null }
    const { error } = await supabase.from('projects').insert(insertData)
    if (error) throw error
    await get().fetchAll()
  },

  update: async (id, data) => {
    const { error } = await supabase
      .from('projects')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  remove: async (id) => {
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },
}))
