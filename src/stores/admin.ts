import { create } from 'zustand'
import type { OrgData } from '../contexts/OrgContext'

interface AdminState {
  impersonatedOrg: OrgData | null
  setImpersonatedOrg: (org: OrgData | null) => void
}

export const useAdminStore = create<AdminState>((set) => ({
  impersonatedOrg: null,
  setImpersonatedOrg: (org) => set({ impersonatedOrg: org }),
}))

export function resetAdminStore() {
  useAdminStore.setState({ impersonatedOrg: null })
}
