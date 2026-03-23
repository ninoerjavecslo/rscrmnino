import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useSettingsStore } from '../../stores/settings'
import { useCurrentUser } from '../../lib/useCurrentUser'

function IconHome()      { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function IconInvoice()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> }
function IconBarChart()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function IconUsers()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> }
function IconBriefcase() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg> }
function IconServer()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg> }
function IconGlobe()     { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> }
function IconCalendar()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
function IconTool()      { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg> }
function IconTarget()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> }
function IconZap()       { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> }
function IconSparkle()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/></svg> }
function IconGrid()      { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> }
function IconLayers()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> }

const nav = ({isActive}: {isActive: boolean}) => 'sidebar-item' + (isActive ? ' active' : '')

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const { agencyName, agencyLogo, fetch: fetchSettings } = useSettingsStore()
  const user = useCurrentUser()
  useEffect(() => { fetchSettings() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <aside className={`sidebar${open ? ' sidebar-open' : ''}`}>
      <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {agencyLogo ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <img src={agencyLogo} alt="Logo" style={{ height: 32, maxWidth: 140, objectFit: 'contain', objectPosition: 'left' }} />
            <div style={{ fontSize: 9, fontWeight: 600, fontFamily: 'Manrope, sans-serif', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Intelligence Platform</div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, background: '#0f172a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}>
              <IconLayers />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Manrope, sans-serif', color: 'var(--c0)', lineHeight: 1.2 }}>{agencyName || 'Agency OS'}</div>
              <div style={{ fontSize: 9, fontWeight: 600, fontFamily: 'Manrope, sans-serif', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.2 }}>Intelligence Platform</div>
            </div>
          </div>
        )}
        <button className="mobile-close-btn" onClick={onClose} aria-label="Close menu">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <nav className="sidebar-nav" onClick={onClose}>
        <NavLink to="/dashboard" className={nav}><IconHome /> Dashboard</NavLink>
        <NavLink to="/pixel" className={nav}><IconSparkle /> Pixel AI</NavLink>

        <div className="sidebar-divider" />

        <div className="sidebar-group-label">Invoicing</div>
        <NavLink to="/this-month"   className={nav}><IconInvoice /> This Month</NavLink>
        <NavLink to="/stats"        className={nav}><IconBarChart /> Statistics</NavLink>

        <div className="sidebar-divider" />

        <div className="sidebar-group-label">Clients &amp; Projects</div>
        <NavLink to="/clients"       className={nav}><IconUsers />    Clients</NavLink>
        <NavLink to="/projects"      className={nav}><IconBriefcase /> Projects</NavLink>
        <NavLink to="/internal"      className={nav}><IconGrid /> Internal</NavLink>
        <NavLink to="/maintenances"  className={nav}><IconTool /> Maintenances</NavLink>
        <NavLink to="/sales"         className={nav}><IconTarget /> Sales</NavLink>

        <div className="sidebar-divider" />

        <div className="sidebar-group-label">Domains &amp; Hosting</div>
        <NavLink to="/infrastructure" className={nav}><IconServer /> Hosting</NavLink>
        <NavLink to="/domains"        className={nav}><IconGlobe /> Domains</NavLink>

        <div className="sidebar-divider" />

        <div className="sidebar-group-label">Finance</div>
        <NavLink to="/planning" className={nav}><IconCalendar /> Invoice Plan</NavLink>
        <NavLink to="/forecast" className={nav}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
          Forecast
        </NavLink>

        <div className="sidebar-divider" />

        <div className="sidebar-group-label">Planning</div>
        <NavLink to="/resource-planning" className={nav}><IconGrid /> Allocation</NavLink>
        <NavLink to="/resource-reports" className={nav}><IconBarChart /> Reports</NavLink>
        <NavLink to="/resource-yearly" className={nav}><IconCalendar /> Yearly Plan</NavLink>

        <div className="sidebar-divider" />

        <NavLink to="/tools" className={nav}><IconTool /> Tools</NavLink>
        <NavLink to="/automations" className={nav}><IconZap /> Automations</NavLink>

        <div className="sidebar-divider" />

        <NavLink to="/settings" className={nav}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          Settings
        </NavLink>
      </nav>

      <div className="sidebar-foot">
        <button
          onClick={() => navigate('/profile')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px', borderRadius: 8, textAlign: 'left' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--c7)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <div className="user-avatar">{user?.initial ?? '?'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name ?? '…'}</div>
            <div style={{ fontSize: 11, color: 'var(--c4)' }}>{user?.role ?? ''}</div>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--c4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </button>
        <button className="btn btn-primary" style={{width:'100%', justifyContent:'center', marginTop:8, padding:'10px 0'}} onClick={() => navigate('/projects')}>
          + New Project
        </button>
      </div>
    </aside>
  )
}
