import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { RevenuePlanner } from '../lib/types'

interface RevenuePlannerState {
  rows: RevenuePlanner[]
  loading: boolean
  saving: boolean
  error: string | null
  fetchByMonths: (months: string[]) => Promise<void>
  upsert: (projectId: string, month: string, plannedAmount: number, probability?: number) => Promise<void>
  updateProbability: (rowId: string, probability: number) => Promise<void>
}

export const useRevenuePlannerStore = create<RevenuePlannerState>((set, get) => ({
  rows: [],
  loading: false,
  saving: false,
  error: null,

  fetchByMonths: async (months: string[]) => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('revenue_planner')
        .select('*, project:projects(id, pn, name, type, client_id), maintenance:maintenances(id, name, client:clients(id, name)), hosting:hosting_clients(id, description, client:clients(id, name)), domain:domains(id, domain_name, client:clients(id, name))')
        .in('month', months)
      if (error) throw error
      set({ rows: (data ?? []) as RevenuePlanner[] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  upsert: async (projectId: string, month: string, plannedAmount: number, probability = 100) => {
    set({ saving: true, error: null })
    try {
      const existing = get().rows.find(
        r => r.project_id === projectId && r.month === month
      )

      if (existing) {
        const { error } = await supabase
          .from('revenue_planner')
          .update({ planned_amount: plannedAmount, probability })
          .eq('id', existing.id)
        if (error) throw error

        set(state => ({
          rows: state.rows.map(r =>
            r.id === existing.id ? { ...r, planned_amount: plannedAmount, probability } : r
          ),
        }))
      } else {
        const { data, error } = await supabase
          .from('revenue_planner')
          .insert({
            project_id: projectId,
            month,
            planned_amount: plannedAmount,
            status: 'planned' as const,
            probability,
          })
          .select('*, project:projects(id, pn, name, type, client_id)')
          .single()
        if (error) throw error
        if (data) {
          set(state => ({ rows: [...state.rows, data as RevenuePlanner] }))
        }
      }
    } catch (err) {
      set({ error: (err as Error).message })
      throw err
    } finally {
      set({ saving: false })
    }
  },

  updateProbability: async (rowId: string, probability: number) => {
    try {
      const { error } = await supabase
        .from('revenue_planner')
        .update({ probability })
        .eq('id', rowId)
      if (error) throw error
      set(state => ({
        rows: state.rows.map(r => r.id === rowId ? { ...r, probability } : r),
      }))
    } catch (err) {
      set({ error: (err as Error).message })
    }
  },
}))
