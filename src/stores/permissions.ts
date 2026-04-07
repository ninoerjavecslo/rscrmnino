import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export interface AppUser {
  id: string
  email: string
  name: string
  is_admin: boolean
}

export interface UserPermission {
  user_id: string
  page: string
  can_view: boolean
  can_edit: boolean
}

interface PermissionsState {
  isAdmin: boolean
  myPermissions: Record<string, { canView: boolean; canEdit: boolean }>
  users: AppUser[]
  allPermissions: UserPermission[]
  loading: boolean
  fetchMine: () => Promise<void>
  fetchAll: () => Promise<void>
  setPermission: (userId: string, page: string, canView: boolean, canEdit: boolean) => Promise<void>
  setAdmin: (userId: string, isAdmin: boolean) => Promise<void>
}

export const usePermissionsStore = create<PermissionsState>((set) => ({
  isAdmin: false,
  myPermissions: {},
  users: [],
  allPermissions: [],
  loading: true,

  fetchMine: async () => {
    set({ loading: true })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: appUser } = await supabase
        .from('app_users')
        .select('is_admin')
        .eq('id', user.id)
        .single()

      const isAdmin = appUser?.is_admin ?? false

      const { data: perms } = await supabase
        .from('user_permissions')
        .select('page, can_view, can_edit')
        .eq('user_id', user.id)

      const myPermissions: Record<string, { canView: boolean; canEdit: boolean }> = {}
      for (const p of perms ?? []) {
        myPermissions[p.page] = { canView: p.can_view, canEdit: p.can_edit }
      }

      set({ isAdmin, myPermissions })
    } finally {
      set({ loading: false })
    }
  },

  fetchAll: async () => {
    const [{ data: users }, { data: perms }] = await Promise.all([
      supabase.from('app_users').select('*').order('name'),
      supabase.from('user_permissions').select('*'),
    ])
    set({
      users: (users ?? []) as AppUser[],
      allPermissions: (perms ?? []) as UserPermission[],
    })
  },

  setPermission: async (userId, page, canView, canEdit) => {
    await supabase.from('user_permissions').upsert(
      { user_id: userId, page, can_view: canView, can_edit: canEdit },
      { onConflict: 'user_id,page' }
    )
    // Update local allPermissions
    set(s => {
      const rest = s.allPermissions.filter(p => !(p.user_id === userId && p.page === page))
      return { allPermissions: [...rest, { user_id: userId, page, can_view: canView, can_edit: canEdit }] }
    })
  },

  setAdmin: async (userId, isAdmin) => {
    await supabase.from('app_users').update({ is_admin: isAdmin }).eq('id', userId)
    set(s => ({ users: s.users.map(u => u.id === userId ? { ...u, is_admin: isAdmin } : u) }))
  },
}))
