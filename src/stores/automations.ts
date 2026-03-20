import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Automation, AutomationItem } from '../lib/types'

interface AutomationsState {
  automations: Automation[]
  items: AutomationItem[]
  loading: boolean
  error: string | null

  fetchAll: () => Promise<void>

  addAutomation: (data: Omit<Automation, 'id' | 'created_at' | 'updated_at'>) => Promise<Automation>
  updateAutomation: (id: string, data: Partial<Omit<Automation, 'id' | 'created_at' | 'updated_at'>>) => Promise<void>
  removeAutomation: (id: string) => Promise<void>

  addItem: (data: Omit<AutomationItem, 'id' | 'created_at' | 'client'>) => Promise<void>
  updateItem: (id: string, data: Partial<Omit<AutomationItem, 'id' | 'created_at' | 'client'>>) => Promise<void>
  removeItem: (id: string) => Promise<void>
  replaceItems: (automationId: string, items: Omit<AutomationItem, 'id' | 'created_at' | 'client'>[]) => Promise<void>

  itemsForAutomation: (automationId: string) => AutomationItem[]
}

export const useAutomationsStore = create<AutomationsState>((set, get) => ({
  automations: [],
  items: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const [{ data: auts, error: ae }, { data: its, error: ie }] = await Promise.all([
        supabase.from('automations').select('*').order('created_at', { ascending: true }),
        supabase.from('automation_items').select('*, client:clients(id, name)').order('sort_order', { ascending: true }),
      ])
      if (ae) throw ae
      if (ie) throw ie
      set({ automations: (auts ?? []) as Automation[], items: (its ?? []) as AutomationItem[] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  addAutomation: async (data) => {
    const { data: row, error } = await supabase.from('automations').insert(data).select().single()
    if (error) throw error
    await get().fetchAll()
    return row as Automation
  },

  updateAutomation: async (id, data) => {
    const { error } = await supabase
      .from('automations')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  removeAutomation: async (id) => {
    const { error } = await supabase.from('automations').delete().eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  addItem: async (data) => {
    const { error } = await supabase.from('automation_items').insert(data)
    if (error) throw error
    await get().fetchAll()
  },

  updateItem: async (id, data) => {
    const { error } = await supabase.from('automation_items').update(data).eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  removeItem: async (id) => {
    const { error } = await supabase.from('automation_items').delete().eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  replaceItems: async (automationId, items) => {
    const { error: de } = await supabase.from('automation_items').delete().eq('automation_id', automationId)
    if (de) throw de
    if (items.length > 0) {
      const { error: ie } = await supabase.from('automation_items').insert(
        items.map((item, i) => ({ ...item, automation_id: automationId, sort_order: i }))
      )
      if (ie) throw ie
    }
    await get().fetchAll()
  },

  itemsForAutomation: (automationId) => {
    return get().items.filter(i => i.automation_id === automationId)
  },
}))
