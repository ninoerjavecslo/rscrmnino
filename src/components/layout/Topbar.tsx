import { useLocation } from 'react-router-dom'

// Map routes to page titles
const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/this-month': 'This Month',
  '/planning': 'Invoice Plan',
  '/forecast': 'Forecast',
  '/clients': 'Clients',
  '/projects': 'Projects',
  '/maintenances': 'Maintenances',
  '/sales': 'Sales',
  '/stats': 'Statistics',
  '/infrastructure': 'Hosting',
  '/domains': 'Domains',
  '/resource-planning': 'Allocation',
  '/resource-reports': 'Reports',
  '/resource-monthly': 'Monthly',
  '/resource-by-project': 'By Project',
  '/team': 'Team',
  '/tools': 'Tools',
  '/automations': 'Automations',
  '/settings': 'Settings',
  '/pixel': 'Pixel AI',
  '/email-tool': 'Email Tool',
}

export function Topbar() {
  const { pathname } = useLocation()
  // Match current path (including nested like /clients/123)
  const title = Object.entries(pageTitles)
    .sort((a,b) => b[0].length - a[0].length)
    .find(([path]) => pathname.startsWith(path))?.[1] ?? 'Agency OS'

  return (
    <div className="topbar">
      <div style={{ fontSize: 13, color: 'var(--c4)', fontFamily: 'Manrope, sans-serif', fontWeight: 600 }}>{title}</div>
      <div className="topbar-right">
        <button style={{background:'none',border:'none',cursor:'pointer',display:'flex',color:'var(--c4)'}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        </button>
        <div className="topbar-divider" />
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div className="user-avatar">N</div>
          <div>
            <p className="topbar-user-name">Nino</p>
            <p className="topbar-user-role">Admin</p>
          </div>
        </div>
      </div>
    </div>
  )
}
