import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { CompanyHoliday } from '../lib/types'

interface HolidayState {
  holidays: CompanyHoliday[]
  loading: boolean

  fetchAll: () => Promise<void>
  fetchByRange: (start: string, end: string) => Promise<CompanyHoliday[]>
  add: (data: Omit<CompanyHoliday, 'id' | 'created_at'>) => Promise<void>
  update: (id: string, data: Partial<Omit<CompanyHoliday, 'id' | 'created_at'>>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useHolidayStore = create<HolidayState>((set) => ({
  holidays: [],
  loading: false,

  fetchAll: async () => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('company_holidays')
      .select('*')
      .order('date', { ascending: true })
    if (error) { set({ loading: false }); return }
    set({ holidays: data ?? [], loading: false })
  },

  // Returns holidays in range + all yearly-recurring ones (caller handles year expansion)
  fetchByRange: async (start: string, end: string) => {
    const { data } = await supabase
      .from('company_holidays')
      .select('*')
      .or(`and(date.gte.${start},date.lte.${end}),recurrence.eq.yearly`)
      .order('date', { ascending: true })
    return data ?? []
  },

  add: async (data) => {
    const { data: inserted, error } = await supabase
      .from('company_holidays')
      .insert(data)
      .select()
      .single()
    if (error) throw new Error(error.message)
    if (inserted) {
      set(state => ({ holidays: [...state.holidays, inserted].sort((a, b) => a.date.localeCompare(b.date)) }))
    }
  },

  update: async (id, data) => {
    const { data: updated, error } = await supabase
      .from('company_holidays')
      .update(data)
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    if (updated) {
      set(state => ({ holidays: state.holidays.map(h => h.id === id ? updated : h).sort((a, b) => a.date.localeCompare(b.date)) }))
    }
  },

  remove: async (id: string) => {
    const { error } = await supabase.from('company_holidays').delete().eq('id', id)
    if (error) throw new Error(error.message)
    set(state => ({ holidays: state.holidays.filter(h => h.id !== id) }))
  },
}))
