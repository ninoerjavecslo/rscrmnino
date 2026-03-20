import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { ChangeRequest } from '../lib/types'

interface ChangeRequestsState {
  changeRequests: ChangeRequest[]
  maintenanceCRs: ChangeRequest[]
  approvedCRs: ChangeRequest[]
  pendingCRs: ChangeRequest[]
  loading: boolean
  error: string | null
  fetchByProject: (projectId: string) => Promise<void>
  fetchByMaintenance: (maintenanceId: string) => Promise<void>
  fetchAllApproved: () => Promise<void>
  fetchAllPending: () => Promise<void>
  add: (data: Omit<ChangeRequest, 'id' | 'created_at' | 'maintenance' | 'project'>) => Promise<void>
  update: (id: string, data: Partial<Omit<ChangeRequest, 'id' | 'created_at' | 'maintenance' | 'project'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useChangeRequestsStore = create<ChangeRequestsState>((set, get) => ({
  changeRequests: [],
  maintenanceCRs: [],
  approvedCRs: [],
  pendingCRs: [],
  loading: false,
  error: null,

  fetchAllPending: async () => {
    try {
      const { data, error } = await supabase
        .from('change_requests')
        .select('*, maintenance:maintenances(id, name, client:clients(id, name)), project:projects(id, pn, name, client_id)')
        .eq('status', 'pending')
      if (error) throw error
      set({ pendingCRs: (data ?? []) as ChangeRequest[] })
    } catch (_err) { /* silent */ }
  },

  fetchAllApproved: async () => {
    try {
      const { data, error } = await supabase
        .from('change_requests')
        .select('*, maintenance:maintenances(id, name, client:clients(id, name)), project:projects(id, pn, name, client_id)')
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

  fetchByMaintenance: async (maintenanceId: string) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('change_requests')
        .select('*')
        .eq('maintenance_id', maintenanceId)
        .order('created_at', { ascending: false })
      if (error) throw error
      set({ maintenanceCRs: (data ?? []) as ChangeRequest[] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  add: async (data) => {
    const { error } = await supabase.from('change_requests').insert(data)
    if (error) throw error
    if (data.project_id) {
      await get().fetchByProject(data.project_id)
    } else if (data.maintenance_id) {
      await get().fetchByMaintenance(data.maintenance_id)
    }
  },

  update: async (id, data) => {
    const { error } = await supabase.from('change_requests').update(data).eq('id', id)
    if (error) throw error
    // If status changed away from pending, remove from pendingCRs immediately (no refetch needed)
    if (data.status && data.status !== 'pending') {
      set(state => ({ pendingCRs: state.pendingCRs.filter(cr => cr.id !== id) }))
    }
    const cr = get().changeRequests.find(c => c.id === id) ?? get().maintenanceCRs.find(c => c.id === id)
    if (cr?.project_id) await get().fetchByProject(cr.project_id)
    else if (cr?.maintenance_id) await get().fetchByMaintenance(cr.maintenance_id)
  },

  remove: async (id) => {
    const cr = get().changeRequests.find(c => c.id === id) ?? get().maintenanceCRs.find(c => c.id === id)
    const { error } = await supabase.from('change_requests').delete().eq('id', id)
    if (error) throw error
    if (cr?.project_id) await get().fetchByProject(cr.project_id)
    else if (cr?.maintenance_id) await get().fetchByMaintenance(cr.maintenance_id)
  },
}))
