import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { ChangeRequest } from '../lib/types'

interface ChangeRequestsState {
  changeRequests: ChangeRequest[]
  approvedCRs: ChangeRequest[]
  loading: boolean
  error: string | null
  fetchByProject: (projectId: string) => Promise<void>
  fetchAllApproved: () => Promise<void>
  add: (data: Omit<ChangeRequest, 'id' | 'created_at'>) => Promise<void>
  update: (id: string, data: Partial<Omit<ChangeRequest, 'id' | 'created_at'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useChangeRequestsStore = create<ChangeRequestsState>((set, get) => ({
  changeRequests: [],
  approvedCRs: [],
  loading: false,
  error: null,

  fetchAllApproved: async () => {
    try {
      const { data, error } = await supabase
        .from('change_requests')
        .select('*')
        .eq('status', 'approved')
      if (error) throw error
      set({ approvedCRs: (data ?? []) as ChangeRequest[] })
    } catch (_err) { /* silent */ }
  },

  fetchByProject: async (projectId: string) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('change_requests')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      if (error) throw error
      set({ changeRequests: (data ?? []) as ChangeRequest[] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  add: async (data) => {
    const { error } = await supabase.from('change_requests').insert(data)
    if (error) throw error
    await get().fetchByProject(data.project_id)
  },

  update: async (id, data) => {
    const { error } = await supabase.from('change_requests').update(data).eq('id', id)
    if (error) throw error
    const cr = get().changeRequests.find(c => c.id === id)
    if (cr) await get().fetchByProject(cr.project_id)
  },

  remove: async (id) => {
    const cr = get().changeRequests.find(c => c.id === id)
    const { error } = await supabase.from('change_requests').delete().eq('id', id)
    if (error) throw error
    if (cr) await get().fetchByProject(cr.project_id)
  },
}))
