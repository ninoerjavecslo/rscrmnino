import { createContext } from 'react'

export interface OrgData {
  orgId: string
  slug: string
  name: string
  plan: 'free' | 'trial' | 'paid'
  status: 'active' | 'suspended'
}

export const OrgContext = createContext<OrgData | null>(null)
