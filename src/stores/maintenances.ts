import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Maintenance } from '../lib/types'

export interface HostingPayload {
  project_pn: string
  description: string
  cycle: 'monthly' | 'yearly'
  amount: number
  billing_since: string | null
}

function monthsInRange(start: string, end: string | null | undefined): string[] {
  const result: string[] = []
  const s = new Date(start + 'T00:00:00')
  const e = end
    ? new Date(end + 'T00:00:00')
    : new Date(s.getFullYear(), s.getMonth() + 12, 1)
  const cur = new Date(s.getFullYear(), s.getMonth(), 1)
  while (cur <= e) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    result.push(`${y}-${m}-01`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return result
}

async function upsertRetainerRows(maintenance: Maintenance) {
  // Only delete unactioned (planned) rows — preserve issued/paid/deferred months
  await supabase
    .from('revenue_planner')
    .delete()
    .eq('maintenance_id', maintenance.id)
    .eq('status', 'planned')

  // Find months that already have a row (issued/paid/retainer) so we don't overwrite them
  const { data: existing } = await supabase
    .from('revenue_planner')
    .select('month')
    .eq('maintenance_id', maintenance.id)
  const existingMonths = new Set((existing ?? []).map((r: { month: string }) => r.month))

  const months = monthsInRange(maintenance.contract_start, maintenance.contract_end)
  const newRows = months
    .filter(m => !existingMonths.has(m))
    .map(month => ({
      maintenance_id: maintenance.id,
      project_id: null as string | null,
      month,
      planned_amount: maintenance.monthly_retainer,
      actual_amount: null as number | null,
      status: 'planned' as const,
      probability: 100,
    }))

  if (newRows.length > 0) {
    const { error } = await supabase.from('revenue_planner').insert(newRows)
    if (error) throw error
  }
}

async function syncHosting(maintenanceId: string, clientId: string, hosting: HostingPayload | null) {
  // Check if a hosting row already exists for this maintenance
  const { data: existing } = await supabase
    .from('hosting_clients')
    .select('id')
    .eq('maintenance_id', maintenanceId)
    .maybeSingle()

  if (!hosting) {
    // Remove hosting if it existed
    if (existing) {
      await supabase.from('hosting_clients').delete().eq('maintenance_id', maintenanceId)
    }
    return
  }

  const row = {
    client_id: clientId,
    project_pn: hosting.project_pn,
    description: hosting.description || null,
    cycle: hosting.cycle,
    amount: hosting.amount,
    billing_since: hosting.billing_since,
    status: 'active' as const,
    maintenance_id: maintenanceId,
    notes: null,
  }

  if (existing) {
    await supabase.from('hosting_clients').update(row).eq('id', existing.id)
  } else {
    await supabase.from('hosting_clients').insert(row)
  }
}

interface MaintenancesState {
  maintenances: Maintenance[]
  loading: boolean
  error: string | null
  fetchAll: () => Promise<void>
  add: (data: Omit<Maintenance, 'id' | 'created_at' | 'client'>, hosting?: HostingPayload | null) => Promise<void>
  update: (id: string, data: Partial<Omit<Maintenance, 'id' | 'created_at' | 'client'>>, hosting?: HostingPayload | null) => Promise<void>
}

export const useMaintenancesStore = create<MaintenancesState>((set, get) => ({
  maintenances: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('maintenances')
        .select('*, client:clients(id, name), hosting_clients(id)')
        .order('created_at', { ascending: false })
      if (error) throw error
      set({ maintenances: (data ?? []) as Maintenance[] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  add: async (data, hosting) => {
    const { data: inserted, error } = await supabase
      .from('maintenances')
      .insert(data)
      .select('*, client:clients(id, name)')
      .single()
    if (error) throw error
    await upsertRetainerRows(inserted as Maintenance)
    await syncHosting(inserted.id, inserted.client_id, hosting ?? null)
    await get().fetchAll()
  },

  update: async (id, data, hosting) => {
    const { error } = await supabase.from('maintenances').update(data).eq('id', id)
    if (error) throw error
    const { data: updated } = await supabase
      .from('maintenances')
      .select('*, client:clients(id, name)')
      .eq('id', id)
      .single()
    if (updated) {
      await upsertRetainerRows(updated as Maintenance)
      await syncHosting(id, updated.client_id, hosting ?? null)
    }
    await get().fetchAll()
  },
}))
