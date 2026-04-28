import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ImpersonationBanner } from '../../components/ImpersonationBanner'

const nav = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
    isActive
      ? 'bg-[#0f172a] text-white'
      : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a]'
  }`

function IconGrid() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> }
function IconBuilding() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg> }
function IconUsers() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> }
function IconArrow() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> }

export function AdminLayout() {
  const navigate = useNavigate()

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col bg-white border-r border-[#e8e3ea]">
        <div className="px-5 py-5 border-b border-[#e8e3ea]">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-[#0f172a] flex items-center justify-center">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', fontFamily: 'Manrope, sans-serif' }}>Admin Console</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>insighty.io</div>
        </div>

        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          <NavLink to="/admin/overview" className={nav}><IconGrid /> Overview</NavLink>
          <NavLink to="/admin/organizations" className={nav}><IconBuilding /> Organizations</NavLink>
          <NavLink to="/admin/users" className={nav}><IconUsers /> Users</NavLink>
        </nav>

        <div className="px-3 py-4 border-t border-[#e8e3ea]">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-3 py-2 w-full rounded-lg text-sm text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors font-medium"
          >
            <IconArrow /> Back to app
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ImpersonationBanner />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
