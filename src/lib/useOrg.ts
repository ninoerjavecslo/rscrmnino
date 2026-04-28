import { useContext } from 'react'
import { OrgContext } from '../contexts/OrgContext'

export function useOrg() {
  return useContext(OrgContext)
}
