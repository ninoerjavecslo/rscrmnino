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
    const { error } = await supabase.from('projects').insert(data)
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
}))
