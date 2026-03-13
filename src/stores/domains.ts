import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Domain } from '../lib/types'

interface DomainState {
  domains: Domain[]
  loading: boolean
  error: string | null

  // Derived
  critical: () => Domain[]
  warningSoon: () => Domain[]
  byClient: () => { clientName: string; domains: Domain[] }[]

  // Actions
  fetchAll: () => Promise<void>
  addDomains: (clientId: string, projectPn: string, entries: { domain_name: string; expiry_date: string; yearly_amount?: number; contract_id?: string }[]) => Promise<void>
  updateDomain: (id: string, data: Partial<Omit<Domain, 'id' | 'status' | 'client'>>) => Promise<void>
}

function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
}

export const useDomainsStore = create<DomainState>((set, get) => ({
  domains: [],
  loading: false,
  error: null,

  critical:    () => get().domains.filter(d => { const n = daysUntil(d.expiry_date); return n >= 0 && n <= 7 }),
  warningSoon: () => get().domains.filter(d => { const n = daysUntil(d.expiry_date); return n > 7 && n <= 30 }),

  byClient: () => {
    const map = new Map<string, { clientName: string; domains: Domain[] }>()
    for (const d of get().domains) {
      const name = d.client?.name ?? 'Unknown'
      if (!map.has(name)) map.set(name, { clientName: name, domains: [] })
      map.get(name)!.domains.push(d)
    }
    return [...map.values()]
  },

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('domains_with_status')   // view that adds computed status
        .select('*, client:clients(id, name)')
        .order('expiry_date')
      if (error) throw error
      set({ domains: (data ?? []) as Domain[] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  addDomains: async (clientId, projectPn, entries) => {
    const rows = entries.map(e => ({
      client_id: clientId,
      project_pn: projectPn,
      domain_name: e.domain_name,
      expiry_date: e.expiry_date,
      yearly_amount: e.yearly_amount ?? null,
      contract_id: e.contract_id ?? null,
      auto_renew: true,
    }))
    const { error } = await supabase.from('domains').insert(rows)
    if (error) throw error
    await get().fetchAll()
  },

  updateDomain: async (id, data) => {
    const { error } = await supabase.from('domains').update(data).eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },
}))
