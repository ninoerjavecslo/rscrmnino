import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Team, TeamMember, ResourceAllocation, ResourceConfirmation, AllocationCategory, TimeOff, MemberProject, ProjectDeliverable } from '../lib/types'

interface ResourceState {
  teams: Team[]
  members: TeamMember[]
  allocations: ResourceAllocation[]
  confirmations: ResourceConfirmation[]
  loading: boolean
  _weekStart: string
  _weekEnd: string

  // Teams
  fetchTeams: () => Promise<void>
  addTeam: (name: string, color?: string) => Promise<void>
  updateTeam: (id: string, data: Partial<Pick<Team, 'name' | 'color' | 'display_order'>>) => Promise<void>
  removeTeam: (id: string) => Promise<void>

  // Team members
  fetchMembers: () => Promise<void>
  addMember: (data: { name: string; email?: string; role?: string; team_id?: string | null; hours_per_day?: number; skills?: string }) => Promise<void>
  updateMember: (id: string, data: Partial<Pick<TeamMember, 'name' | 'email' | 'role' | 'team_id' | 'hours_per_day' | 'display_order' | 'active' | 'skills'>>) => Promise<void>
  removeMember: (id: string) => Promise<void>

  // Allocations
  fetchAllocations: (weekStart: string, weekEnd: string) => Promise<void>
  addAllocation: (data: { member_id: string; project_id?: string | null; category: AllocationCategory; date: string; hours: number; label?: string | null; notes?: string | null; is_billable?: boolean; deadline_date?: string | null; recurring_group_id?: string | null }) => Promise<void>
  addAllocationsBatch: (rows: Array<{ member_id: string; project_id?: string | null; category: AllocationCategory; date: string; hours: number; label?: string | null; notes?: string | null; is_billable?: boolean; deadline_date?: string | null; recurring_group_id?: string | null }>) => Promise<void>
  updateAllocation: (id: string, data: Partial<{ member_id: string; project_id: string | null; category: AllocationCategory; date: string; hours: number; label: string | null; notes: string | null }>) => Promise<void>
  removeAllocation: (id: string) => Promise<void>
  removeAllocationsForWeek: (memberId: string, projectId: string | null, category: AllocationCategory, weekStart: string, weekEnd: string) => Promise<void>
  removeRecurringGroup: (groupId: string) => Promise<void>

  // Confirmations
  fetchConfirmations: (weekStart: string, weekEnd: string) => Promise<void>
  confirm: (memberId: string, date: string, status: 'confirmed' | 'delayed', delayReason?: string) => Promise<void>

  // Member projects
  memberProjects: MemberProject[]
  fetchMemberProjects: (memberId: string) => Promise<void>
  addMemberProject: (memberId: string, projectId: string, role?: string) => Promise<void>
  removeMemberProject: (id: string) => Promise<void>

  // Time off
  timeOff: TimeOff[]
  fetchTimeOff: (memberId: string) => Promise<void>
  addTimeOff: (data: { member_id: string; start_date: string; end_date: string; reason?: string }) => Promise<void>
  removeTimeOff: (id: string) => Promise<void>

  // Deliverables
  deliverables: ProjectDeliverable[]
  fetchDeliverables: (projectId?: string) => Promise<void>
  addDeliverable: (data: Omit<ProjectDeliverable, 'id' | 'created_at' | 'project'>) => Promise<void>
  updateDeliverable: (id: string, data: Partial<Pick<ProjectDeliverable, 'title' | 'due_date' | 'estimated_hours' | 'team' | 'status' | 'notes'>>) => Promise<void>
  removeDeliverable: (id: string) => Promise<void>

  // Unplanned work
  addUnplannedWork: (data: { member_id: string; project_id?: string | null; category: AllocationCategory; date: string; hours: number; label?: string | null; notes?: string | null; is_billable?: boolean }) => Promise<void>
  fetchUnplanned: (weekStart: string, weekEnd: string) => Promise<ResourceAllocation[]>

  // Public member view (by share token)
  fetchMemberByToken: (token: string) => Promise<TeamMember | null>
  fetchAllocationsByToken: (token: string, weekStart: string, weekEnd: string) => Promise<ResourceAllocation[]>
}

export const useResourceStore = create<ResourceState>((set, get) => ({
  teams: [],
  members: [],
  allocations: [],
  confirmations: [],
  memberProjects: [],
  timeOff: [],
  deliverables: [],
  loading: false,
  _weekStart: '',
  _weekEnd: '',

  // ── Teams ─────────────────────────────────────────────────────────────────────

  fetchTeams: async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('display_order')
    if (error) throw error
    set({ teams: (data ?? []) as Team[] })
  },

  addTeam: async (name, color) => {
    const payload: Record<string, unknown> = { name }
    if (color) payload.color = color
    const { error } = await supabase.from('teams').insert(payload)
    if (error) throw error
    await get().fetchTeams()
  },

  updateTeam: async (id, data) => {
    const { error } = await supabase.from('teams').update(data).eq('id', id)
    if (error) throw error
    await get().fetchTeams()
  },

  removeTeam: async (id) => {
    const { error } = await supabase.from('teams').delete().eq('id', id)
    if (error) throw error
    await get().fetchTeams()
  },

  // ── Team members ──────────────────────────────────────────────────────────────

  fetchMembers: async () => {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select('*, team:teams(id, name, color)')
        .eq('active', true)
        .order('display_order')
      if (error) throw error
      set({ members: (data ?? []) as TeamMember[] })
    } finally {
      set({ loading: false })
    }
  },

  addMember: async (payload) => {
    const { error } = await supabase.from('team_members').insert(payload)
    if (error) throw error
    await get().fetchMembers()
  },

  updateMember: async (id, data) => {
    const { error } = await supabase.from('team_members').update(data).eq('id', id)
    if (error) throw error
    await get().fetchMembers()
  },

  removeMember: async (id) => {
    const { error } = await supabase.from('team_members').update({ active: false }).eq('id', id)
    if (error) throw error
    await get().fetchMembers()
  },

  // ── Allocations ───────────────────────────────────────────────────────────────

  fetchAllocations: async (weekStart, weekEnd) => {
    set({ loading: true, _weekStart: weekStart, _weekEnd: weekEnd })
    try {
      const { data, error } = await supabase
        .from('resource_allocations')
        .select('*, member:team_members(id, name), project:projects(id, pn, name)')
        .gte('date', weekStart)
        .lte('date', weekEnd)
        .order('date')
      if (error) throw error
      set({ allocations: (data ?? []) as ResourceAllocation[] })
    } finally {
      set({ loading: false })
    }
  },

  addAllocation: async (data) => {
    const { error } = await supabase.from('resource_allocations').insert(data)
    if (error) throw error
    const { _weekStart, _weekEnd } = get()
    if (_weekStart && _weekEnd) await get().fetchAllocations(_weekStart, _weekEnd)
  },

  addAllocationsBatch: async (rows) => {
    if (rows.length === 0) return
    const { error } = await supabase.from('resource_allocations').insert(rows)
    if (error) throw error
    const { _weekStart, _weekEnd } = get()
    if (_weekStart && _weekEnd) await get().fetchAllocations(_weekStart, _weekEnd)
  },

  updateAllocation: async (id, data) => {
    const { error } = await supabase.from('resource_allocations').update(data).eq('id', id)
    if (error) throw error
    const { _weekStart, _weekEnd } = get()
    if (_weekStart && _weekEnd) await get().fetchAllocations(_weekStart, _weekEnd)
  },

  removeAllocation: async (id) => {
    const { error } = await supabase.from('resource_allocations').delete().eq('id', id)
    if (error) throw error
    const { _weekStart, _weekEnd } = get()
    if (_weekStart && _weekEnd) await get().fetchAllocations(_weekStart, _weekEnd)
  },

  removeAllocationsForWeek: async (memberId, projectId, category, weekStart, weekEnd) => {
    let q = supabase.from('resource_allocations').delete()
      .eq('member_id', memberId)
      .eq('category', category)
      .gte('date', weekStart)
      .lte('date', weekEnd)
    if (projectId) q = q.eq('project_id', projectId)
    else q = q.is('project_id', null)
    const { error } = await q
    if (error) throw error
    const s = get()
    if (s._weekStart && s._weekEnd) await get().fetchAllocations(s._weekStart, s._weekEnd)
  },

  removeRecurringGroup: async (groupId) => {
    const { error } = await supabase.from('resource_allocations').delete().eq('recurring_group_id', groupId)
    if (error) throw error
    const s = get()
    if (s._weekStart && s._weekEnd) await get().fetchAllocations(s._weekStart, s._weekEnd)
  },

  // ── Confirmations ─────────────────────────────────────────────────────────────

  fetchConfirmations: async (weekStart, weekEnd) => {
    const { data, error } = await supabase
      .from('resource_confirmations')
      .select('*')
      .gte('date', weekStart)
      .lte('date', weekEnd)
    if (error) throw error
    set({ confirmations: (data ?? []) as ResourceConfirmation[] })
  },

  confirm: async (memberId, date, status, delayReason) => {
    const { error } = await supabase
      .from('resource_confirmations')
      .upsert(
        { member_id: memberId, date, status, delay_reason: delayReason ?? null },
        { onConflict: 'member_id,date' }
      )
    if (error) throw error
    const { _weekStart, _weekEnd } = get()
    if (_weekStart && _weekEnd) await get().fetchConfirmations(_weekStart, _weekEnd)
  },

  // ── Member projects ──────────────────────────────────────────────────────────

  fetchMemberProjects: async (memberId) => {
    const { data, error } = await supabase
      .from('member_projects')
      .select('*, project:projects(id, pn, name, status, type, client:clients(id, name))')
      .eq('member_id', memberId)
      .order('created_at')
    if (error) throw error
    set({ memberProjects: (data ?? []) as MemberProject[] })
  },

  addMemberProject: async (memberId, projectId, role) => {
    const { error } = await supabase.from('member_projects').insert({ member_id: memberId, project_id: projectId, role: role || null })
    if (error) throw error
    await get().fetchMemberProjects(memberId)
  },

  removeMemberProject: async (id) => {
    const row = get().memberProjects.find(mp => mp.id === id)
    const { error } = await supabase.from('member_projects').delete().eq('id', id)
    if (error) throw error
    if (row) await get().fetchMemberProjects(row.member_id)
  },

  // ── Time off ─────────────────────────────────────────────────────────────────

  fetchTimeOff: async (memberId) => {
    const { data, error } = await supabase
      .from('time_off')
      .select('*')
      .eq('member_id', memberId)
      .order('start_date')
    if (error) throw error
    set({ timeOff: (data ?? []) as TimeOff[] })
  },

  addTimeOff: async (payload) => {
    const { error } = await supabase.from('time_off').insert(payload)
    if (error) throw error
    await get().fetchTimeOff(payload.member_id)
  },

  removeTimeOff: async (id) => {
    const row = get().timeOff.find(t => t.id === id)
    const { error } = await supabase.from('time_off').delete().eq('id', id)
    if (error) throw error
    if (row) await get().fetchTimeOff(row.member_id)
  },

  // ── Deliverables ─────────────────────────────────────────────────────────────

  fetchDeliverables: async (projectId) => {
    let q = supabase.from('project_deliverables').select('*, project:projects(id, pn, name)').order('due_date')
    if (projectId) q = q.eq('project_id', projectId)
    const { data, error } = await q
    if (error) throw error
    set({ deliverables: (data ?? []) as ProjectDeliverable[] })
  },

  addDeliverable: async (data) => {
    const { error } = await supabase.from('project_deliverables').insert(data)
    if (error) throw error
    await get().fetchDeliverables(data.project_id)
  },

  updateDeliverable: async (id, data) => {
    const { error } = await supabase.from('project_deliverables').update(data).eq('id', id)
    if (error) throw error
    const d = get().deliverables.find(x => x.id === id)
    if (d) await get().fetchDeliverables(d.project_id)
  },

  removeDeliverable: async (id) => {
    const d = get().deliverables.find(x => x.id === id)
    const { error } = await supabase.from('project_deliverables').delete().eq('id', id)
    if (error) throw error
    if (d) await get().fetchDeliverables(d.project_id)
  },

  // ── Unplanned work ─────────────────────────────────────────────────────────

  addUnplannedWork: async (data) => {
    const { error } = await supabase.from('resource_allocations').insert({ ...data, is_unplanned: true })
    if (error) throw error
    const { _weekStart, _weekEnd } = get()
    if (_weekStart && _weekEnd) await get().fetchAllocations(_weekStart, _weekEnd)
  },

  fetchUnplanned: async (weekStart, weekEnd) => {
    const { data, error } = await supabase
      .from('resource_allocations')
      .select('*, member:team_members(id, name), project:projects(id, pn, name)')
      .eq('is_unplanned', true)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date')
    if (error) throw error
    return (data ?? []) as ResourceAllocation[]
  },

  // ── Public member view (by share token) ───────────────────────────────────────

  fetchMemberByToken: async (token) => {
    const { data, error } = await supabase
      .from('team_members')
      .select('*, team:teams(id, name, color)')
      .eq('share_token', token)
      .single()
    if (error) return null
    return data as TeamMember
  },

  fetchAllocationsByToken: async (token, weekStart, weekEnd) => {
    const member = await get().fetchMemberByToken(token)
    if (!member) return []
    const { data, error } = await supabase
      .from('resource_allocations')
      .select('*, project:projects(id, pn, name)')
      .eq('member_id', member.id)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date')
    if (error) return []
    return (data ?? []) as ResourceAllocation[]
  },
}))
