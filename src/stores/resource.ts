import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { TeamMember, ResourcePlan } from '../lib/types'

interface ResourceState {
  members: TeamMember[]
  plans: ResourcePlan[]
  plannedProjectIds: string[]
  loading: boolean
  fetchMembers: () => Promise<void>
  addMember: (name: string) => Promise<void>
  removeMember: (id: string) => Promise<void>
  fetchPlans: (periods: string[], periodType: 'week' | 'month') => Promise<void>
  upsertPlan: (id: string | null, data: Omit<ResourcePlan, 'id' | 'created_at' | 'project'>) => Promise<void>
  deletePlan: (id: string) => Promise<void>
  deleteMonthPlans: (projectId: string, memberId: string | null, from: string, to: string) => Promise<void>
  fetchPlannedProjects: () => Promise<void>
  addProjectToPlan: (projectId: string) => Promise<void>
  removeProjectFromPlan: (projectId: string) => Promise<void>
}

export const useResourceStore = create<ResourceState>((set, get) => ({
  members: [],
  plans: [],
  plannedProjectIds: [],
  loading: false,

  fetchMembers: async () => {
    const { data } = await supabase
      .from('team_members')
      .select('*')
      .eq('active', true)
      .order('display_order', { ascending: true })
    set({ members: (data ?? []) as TeamMember[] })
  },

  addMember: async (name) => {
    const max = get().members.reduce((m, mem) => Math.max(m, mem.display_order), 0)
    await supabase.from('team_members').insert({ name, display_order: max + 1 })
    await get().fetchMembers()
  },

  removeMember: async (id) => {
    await supabase.from('team_members').update({ active: false }).eq('id', id)
    await get().fetchMembers()
  },

  fetchPlans: async (periods, periodType) => {
    if (periods.length === 0) return
    set({ loading: true })
    if (periodType === 'month') {
      // Fetch all records in the date range (any period_type — backward compat)
      const from = periods[0]
      const lastM = new Date(periods[periods.length - 1] + 'T00:00:00')
      const lastDay = new Date(lastM.getFullYear(), lastM.getMonth() + 1, 0)
      const pad = (n: number) => String(n).padStart(2, '0')
      const to = `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`
      const { data } = await supabase
        .from('resource_plan')
        .select('*, project:projects(id, pn, name, client_id)')
        .gte('period', from)
        .lte('period', to)
      set({ plans: (data ?? []) as ResourcePlan[], loading: false })
    } else {
      // Week view: range query (covers timezone-shifted dates from old saves too)
      const from = periods[0]
      const last = new Date(periods[periods.length - 1] + 'T00:00:00')
      last.setDate(last.getDate() + 6)
      const pad = (n: number) => String(n).padStart(2, '0')
      const to = `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`
      const { data } = await supabase
        .from('resource_plan')
        .select('*, project:projects(id, pn, name, client_id)')
        .gte('period', from)
        .lte('period', to)
      set({ plans: (data ?? []) as ResourcePlan[], loading: false })
    }
  },

  upsertPlan: async (id, data) => {
    if (id) {
      const { error } = await supabase
        .from('resource_plan')
        .update({ project_id: data.project_id, hours: data.hours, notes: data.notes })
        .eq('id', id)
      if (error) throw error
      set(s => ({
        plans: s.plans.map(p =>
          p.id === id ? { ...p, project_id: data.project_id, hours: data.hours } : p
        ),
      }))
    } else {
      const { data: inserted, error } = await supabase
        .from('resource_plan')
        .insert({
          member_id: data.member_id,
          project_id: data.project_id,
          period: data.period,
          period_type: 'week',   // always store as weekly
          hours: data.hours,
          notes: data.notes,
        })
        .select('*, project:projects(id, pn, name, client_id)')
        .single()
      if (error) throw error
      if (inserted) set(s => ({ plans: [...s.plans, inserted as ResourcePlan] }))
    }
  },

  deletePlan: async (id) => {
    await supabase.from('resource_plan').delete().eq('id', id)
    set(s => ({ plans: s.plans.filter(p => p.id !== id) }))
  },

  // Delete all weekly records for a project+member within a date range (used by month-view save)
  deleteMonthPlans: async (projectId, memberId, from, to) => {
    const ids = get().plans
      .filter(p =>
        p.project_id === projectId &&
        p.member_id === memberId &&
        p.period >= from &&
        p.period <= to
      )
      .map(p => p.id)
    if (ids.length === 0) return
    await supabase.from('resource_plan').delete().in('id', ids)
    set(s => ({ plans: s.plans.filter(p => !ids.includes(p.id)) }))
  },

  fetchPlannedProjects: async () => {
    const { data } = await supabase
      .from('resource_projects')
      .select('project_id')
      .order('display_order', { ascending: true })
    set({ plannedProjectIds: (data ?? []).map((r: { project_id: string }) => r.project_id) })
  },

  addProjectToPlan: async (projectId) => {
    const max = get().plannedProjectIds.length
    await supabase.from('resource_projects').insert({ project_id: projectId, display_order: max })
    set(s => ({ plannedProjectIds: [...s.plannedProjectIds, projectId] }))
  },

  removeProjectFromPlan: async (projectId) => {
    await supabase.from('resource_projects').delete().eq('project_id', projectId)
    set(s => ({ plannedProjectIds: s.plannedProjectIds.filter(id => id !== projectId) }))
  },
}))
