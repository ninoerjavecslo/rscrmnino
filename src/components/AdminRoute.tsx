import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const ADMIN_EMAIL = 'nino.erjavec@renderspace.si'

interface Props {
  children: React.ReactNode
}

export function AdminRoute({ children }: Props) {
  const [state, setState] = useState<'loading' | 'allowed' | 'denied'>('loading')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setState(data.user?.email === ADMIN_EMAIL ? 'allowed' : 'denied')
    })
  }, [])

  if (state === 'loading') return null
  if (state === 'denied') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
