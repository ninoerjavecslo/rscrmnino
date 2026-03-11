import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { HostingClient, InfrastructureCost } from '../lib/types'

interface InfraState {
  hostingClients: HostingClient[]
  infraCosts: InfrastructureCost[]
  loading: boolean
  error: string | null

  // Derived values (computed from state)
  monthlyRevenueEquiv: () => number
  totalMonthlyCost: () => number
  margin: () => number
  marginPct: () => number
  yearlyDueSoon: () => HostingClient[]

  // Actions
  fetchAll: () => Promise<void>
  addHostingClient: (data: Omit<HostingClient, 'id' | 'client'>) => Promise<void>
  updateHostingClient: (id: string, data: Partial<Omit<HostingClient, 'id' | 'client'>>) => Promise<void>
  addInfraCost: (data: Omit<InfrastructureCost, 'id'>) => Promise<void>
}

function monthlyEquiv(h: HostingClient) {
  return h.cycle === 'monthly' ? h.amount : h.amount / 12
}

function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
}

export const useInfraStore = create<InfraState>((set, get) => ({
  hostingClients: [],
  infraCosts: [],
  loading: false,
  error: null,

  monthlyRevenueEquiv: () =>
    get().hostingClients
      .filter(h => h.status === 'active')
      .reduce((s, h) => s + monthlyEquiv(h), 0),

  totalMonthlyCost: () =>
    get().infraCosts
      .filter(c => c.status === 'active')
      .reduce((s, c) => s + c.monthly_cost, 0),

  margin: () => get().monthlyRevenueEquiv() - get().totalMonthlyCost(),

  marginPct: () => {
    const rev = get().monthlyRevenueEquiv()
    return rev > 0 ? Math.round((get().margin() / rev) * 100) : 0
  },

  yearlyDueSoon: () =>
    get().hostingClients.filter(h => {
      if (h.cycle !== 'yearly' || !h.next_invoice_date) return false
      const d = daysUntil(h.next_invoice_date)
      return d >= 0 && d <= 60
    }),

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const [{ data: hosting, error: he }, { data: costs, error: ce }] = await Promise.all([
        supabase
          .from('hosting_clients')
          .select('*, client:clients(id, name)')
          .order('created_at'),
        supabase
          .from('infrastructure_costs')
          .select('*')
          .eq('status', 'active')
          .order('provider'),
      ])
      if (he) throw he
      if (ce) throw ce
      set({ hostingClients: (hosting ?? []) as HostingClient[], infraCosts: costs ?? [] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  addHostingClient: async (data) => {
    const { error } = await supabase.from('hosting_clients').insert(data)
    if (error) throw error
    await get().fetchAll()
  },

  updateHostingClient: async (id, data) => {
    const { error } = await supabase.from('hosting_clients').update(data).eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  addInfraCost: async (data) => {
    const { error } = await supabase.from('infrastructure_costs').insert(data)
    if (error) throw error
    await get().fetchAll()
  },
}))
