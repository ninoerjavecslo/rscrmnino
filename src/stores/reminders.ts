import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { ReminderRule } from '../lib/types'

interface RemindersState {
  rules: ReminderRule[]
  loading: boolean
  error: string | null

  fetchAll: () => Promise<void>
  add: (data: Omit<ReminderRule, 'id' | 'created_at' | 'updated_at' | 'last_run_at'>) => Promise<void>
  update: (id: string, data: Partial<Omit<ReminderRule, 'id' | 'created_at' | 'updated_at'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useRemindersStore = create<RemindersState>((set, get) => ({
  rules: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('reminder_rules')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      set({ rules: (data ?? []) as ReminderRule[] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  add: async (data) => {
    const { error } = await supabase.from('reminder_rules').insert(data)
    if (error) throw error
    await get().fetchAll()
  },

  update: async (id, data) => {
    const { error } = await supabase
      .from('reminder_rules')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  remove: async (id) => {
    const { error } = await supabase.from('reminder_rules').delete().eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },
}))
