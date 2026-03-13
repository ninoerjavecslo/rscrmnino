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
  addDomains: (clientId: string, projectPn: string, entries: { domain_name: string; expiry_date: string; yearly_amount?: number; contract_id?: string; accounting_email?: boolean }[]) => Promise<void>
  updateDomain: (id: string, data: Partial<Omit<Domain, 'id' | 'status' | 'client'>>) => Promise<void>
  deleteDomain: (id: string) => Promise<void>
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
        .from('domains')
        .select('*, client:clients(id, name)')
        .order('expiry_date')
      if (error) throw error
      // Compute status locally so we don't depend on the view
      const now = Date.now()
      const domains = (data ?? []).map((d: Record<string, unknown>) => {
        const days = Math.ceil((new Date((d.expiry_date as string) + 'T00:00:00').getTime() - now) / 86_400_000)
        const status: Domain['status'] = days < 0 ? 'expired' : days <= 30 ? 'expiring_soon' : 'active'
        return { ...d, status } as Domain
      })
      set({ domains })
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
      accounting_email: e.accounting_email ?? false,
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

  deleteDomain: async (id) => {
    const { error } = await supabase.from('domains').delete().eq('id', id)
    if (error) throw error
    set(s => ({ domains: s.domains.filter(d => d.id !== id) }))
  },
}))
