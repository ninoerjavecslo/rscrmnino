import { usePermissionsStore } from '../stores/permissions'

export function usePagePermission(page: string) {
  const { isAdmin, myPermissions, loading } = usePermissionsStore()

  if (isAdmin) return { canView: true, canEdit: true, loading }

  const perm = myPermissions[page]
  // No entry = full access by default (additive restriction model)
  if (!perm) return { canView: true, canEdit: true, loading }

  return { canView: perm.canView, canEdit: perm.canEdit, loading }
}
