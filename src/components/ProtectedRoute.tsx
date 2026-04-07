import { Navigate } from 'react-router-dom'
import { usePagePermission } from '../lib/usePagePermission'

interface Props {
  page: string
  children: React.ReactNode
}

export function ProtectedRoute({ page, children }: Props) {
  const { canView, loading } = usePagePermission(page)
  if (loading) return null
  if (!canView) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
