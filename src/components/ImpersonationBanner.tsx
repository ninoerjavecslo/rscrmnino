import { useAdminStore } from '../stores/admin'
import { resetAllStores } from '../stores/index'

export function ImpersonationBanner() {
  const { impersonatedOrg, setImpersonatedOrg } = useAdminStore()

  if (!impersonatedOrg) return null

  function handleExit() {
    resetAllStores()
    setImpersonatedOrg(null)
  }

  return (
    <div style={{
      background: '#fef3c7',
      borderBottom: '1px solid #fcd34d',
      padding: '8px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      fontSize: 13,
      fontWeight: 500,
      color: '#92400e',
    }}>
      <span>Impersonating <strong>{impersonatedOrg.name}</strong> ({impersonatedOrg.slug})</span>
      <button
        onClick={handleExit}
        style={{
          background: '#fcd34d',
          border: '1px solid #f59e0b',
          borderRadius: 6,
          padding: '4px 12px',
          fontSize: 12,
          fontWeight: 600,
          color: '#92400e',
          cursor: 'pointer',
        }}
      >
        Exit
      </button>
    </div>
  )
}
