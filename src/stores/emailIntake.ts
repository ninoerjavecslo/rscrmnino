// src/stores/emailIntake.ts
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { EmailIntakeRule } from '../lib/types'

interface EmailIntakeState {
  rules: EmailIntakeRule[]
  loading: boolean
  fetchAll: () => Promise<void>
  add: (rule: Omit<EmailIntakeRule, 'id' | 'created_at' | 'maintenance'>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useEmailIntakeStore = create<EmailIntakeState>((set) => ({
  rules: [],
  loading: false,

  fetchAll: async () => {
    set({ loading: true })
    try {
      const { data } = await supabase
        .from('email_intake_rules')
        .select('*, maintenance:maintenances(id, name)')
        .order('created_at')
      set({ rules: (data ?? []) as EmailIntakeRule[] })
    } finally {
      set({ loading: false })
    }
  },

  add: async (rule) => {
    const { data } = await supabase
      .from('email_intake_rules')
      .insert(rule)
      .select('*, maintenance:maintenances(id, name)')
      .single()
    if (data) {
      set(s => ({ rules: [...s.rules, data as EmailIntakeRule] }))
    }
  },

  remove: async (id) => {
    await supabase.from('email_intake_rules').delete().eq('id', id)
    set(s => ({ rules: s.rules.filter(r => r.id !== id) }))
  },
}))
