import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { OrgContext, type OrgData } from '../contexts/OrgContext'
import { OrgNotFoundView } from '../views/OrgNotFoundView'
import { OrgSuspendedView } from '../views/OrgSuspendedView'

function resolveSlug(): string | null {
  const dev = (import.meta as { env: Record<string, string> }).env.VITE_DEV_ORG_SLUG
  if (dev) return dev
  const parts = window.location.hostname.split('.')
  // e.g. renderspace.insighty.io → 3 parts → parts[0] is the slug
  if (parts.length >= 3) return parts[0]
  return null
}

type State = 'loading' | 'not-found' | 'suspended' | OrgData | null

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const slug = resolveSlug()
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    if (!slug) {
      setState(null)
      return
    }
    supabase
      .from('organizations')
      .select('id, slug, name, plan, status')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setState('not-found'); return }
        if (data.status === 'suspended') { setState('suspended'); return }
        setState({
          orgId: data.id as string,
          slug: data.slug as string,
          name: data.name as string,
          plan: data.plan as OrgData['plan'],
          status: data.status as OrgData['status'],
        })
      })
  }, [slug])

  if (state === 'loading') return null
  if (state === 'not-found') return <OrgNotFoundView slug={slug ?? ''} />
  if (state === 'suspended') return <OrgSuspendedView />

  return (
    <OrgContext.Provider value={state}>
      {children}
    </OrgContext.Provider>
  )
}
