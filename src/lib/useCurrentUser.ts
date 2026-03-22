import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export interface CurrentUser {
  id: string
  email: string
  name: string
  initial: string
  role: string
}

export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (!u) return
      const meta = u.user_metadata ?? {}
      const name = meta.name || meta.full_name || u.email?.split('@')[0] || 'User'
      const role = meta.role || 'Admin'
      setUser({ id: u.id, email: u.email ?? '', name, initial: name[0].toUpperCase(), role })
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user
      if (!u) { setUser(null); return }
      const meta = u.user_metadata ?? {}
      const name = meta.name || meta.full_name || u.email?.split('@')[0] || 'User'
      const role = meta.role || 'Admin'
      setUser({ id: u.id, email: u.email ?? '', name, initial: name[0].toUpperCase(), role })
    })

    return () => subscription.unsubscribe()
  }, [])

  return user
}
