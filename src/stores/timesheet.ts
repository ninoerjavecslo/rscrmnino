import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { TimesheetEntry } from '../lib/types'

interface TimesheetState {
  entries: TimesheetEntry[]
  loading: boolean
  error: string | null

  fetchByMonth: (month: string) => Promise<void>
  saveEntries: (entries: Omit<TimesheetEntry, 'id' | 'created_at'>[]) => Promise<void>
}

export const useTimesheetStore = create<TimesheetState>((set) => ({
  entries: [],
  loading: false,
  error: null,

  fetchByMonth: async (month: string) => {
    set({ loading: true, error: null })
    try {
      const monthStart = `${month}-01`
      const { data, error } = await supabase
        .from('timesheet_entries')
        .select('*')
        .eq('month', monthStart)
        .order('hours', { ascending: false })
      if (error) throw error
      set({ entries: data ?? [] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  saveEntries: async (entries) => {
    set({ loading: true, error: null })
    try {
      const { error } = await supabase.from('timesheet_entries').insert(entries)
      if (error) throw error
    } catch (err) {
      set({ error: (err as Error).message })
      throw err
    } finally {
      set({ loading: false })
    }
  },
}))
