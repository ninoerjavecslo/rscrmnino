import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './design-system.css'
import { supabase } from './lib/supabase'
import { LoginView } from './views/LoginView'
import { Sidebar } from './components/layout/Sidebar'
import { DashboardView } from './views/DashboardView'
import { StatisticsView } from './views/StatisticsView'
import { ClientsView } from './views/ClientsView'
import { ClientDetailView } from './views/ClientDetailView'
import { ProjectsView } from './views/ProjectsView'
import { ProjectDetailView } from './views/ProjectDetailView'
import { MaintenancesView } from './views/MaintenancesView'
import { MaintenanceDetailView } from './views/MaintenanceDetailView'
import { RevenuePlannerView } from './views/RevenuePlannerView'
import { ToolsView } from './views/ToolsView'
import { InfrastructureView } from './views/InfrastructureView'
import { DomainsView } from './views/DomainsView'
import { TimesheetView } from './views/TimesheetView'
import { ThisMonthView } from './views/ThisMonthView'
import { EmailToolView } from './views/EmailToolView'
import { ForecastView } from './views/ForecastView'
import { SalesView } from './views/SalesView'
import { SettingsView } from './views/SettingsView'
import { AutomationsView } from './views/AutomationsView'
import { AutomationFormView } from './views/AutomationFormView'
import { PixelView } from './views/PixelView'
import { ResourcePlanningView } from './views/ResourcePlanningView'
import { ResourceReportsView } from './views/ResourceReportsView'
import { ResourceYearlyView } from './views/ResourceYearlyView'
import { ResourceMonthlyView } from './views/ResourceMonthlyView'
import { ResourceByProjectView } from './views/ResourceByProjectView'
import { TeamMemberDetailView } from './views/TeamMemberDetailView'
import { MyWeekView } from './views/MyWeekView'
import { MemberDashboardView } from './views/MemberDashboardView'
import { ProfileView } from './views/ProfileView'
import { Toaster } from './components/Toaster'
import { Topbar } from './components/layout/Topbar'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [session, setSession] = useState<boolean | null>(null) // null = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(!!s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === null) return null // loading — no flash

  if (!session) return <LoginView onLogin={() => setSession(true)} />

  return (
    <BrowserRouter>
      <Routes>

        {/* ── Standalone routes (no sidebar) ── */}
        <Route path="/my-week/:token" element={<MyWeekView />} />
        <Route path="/member-dashboard/:token" element={<MemberDashboardView />} />

        {/* ── Main app layout ── */}
        <Route path="*" element={
          <div className="app-layout">
            {/* Backdrop for mobile sidebar */}
            <div
              className={`sidebar-backdrop${sidebarOpen ? ' sidebar-open' : ''}`}
              onClick={() => setSidebarOpen(false)}
            />

            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <main className="app-main">
              {/* Mobile header bar */}
              <div className="mobile-header">
                <button
                  className="mobile-menu-btn"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open menu"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="3" y1="6" x2="21" y2="6"/>
                    <line x1="3" y1="12" x2="21" y2="12"/>
                    <line x1="3" y1="18" x2="21" y2="18"/>
                  </svg>
                </button>
                <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--c0)' }}>
                  Agency Intelligence OS
                </span>
              </div>

              <Topbar />
              <Toaster />
              <Routes>
                <Route path="/"                element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard"       element={<DashboardView />} />
                <Route path="/this-month"      element={<ThisMonthView />} />
                <Route path="/automations"           element={<AutomationsView />} />
                <Route path="/automations/new"       element={<AutomationFormView />} />
                <Route path="/automations/:id/edit"  element={<AutomationFormView />} />
                <Route path="/planning"        element={<RevenuePlannerView />} />
                <Route path="/forecast"        element={<ForecastView />} />
                <Route path="/clients"         element={<ClientsView />} />
                <Route path="/clients/:id"     element={<ClientDetailView />} />
                <Route path="/projects"        element={<ProjectsView />} />
                <Route path="/projects/:id"    element={<ProjectDetailView />} />
                <Route path="/maintenances"    element={<MaintenancesView />} />
                <Route path="/maintenances/:id" element={<MaintenanceDetailView />} />
                <Route path="/sales"           element={<SalesView />} />
                <Route path="/stats"           element={<StatisticsView />} />
                <Route path="/infrastructure"  element={<InfrastructureView />} />
                <Route path="/domains"         element={<DomainsView />} />
                <Route path="/tools"           element={<ToolsView />} />
                <Route path="/tools/timesheet" element={<TimesheetView />} />
                <Route path="/resource-planning" element={<ResourcePlanningView />} />
                <Route path="/resource-reports" element={<ResourceReportsView />} />
                <Route path="/resource-yearly" element={<ResourceYearlyView />} />
                <Route path="/resource-monthly" element={<ResourceMonthlyView />} />
                <Route path="/resource-by-project" element={<ResourceByProjectView />} />
                <Route path="/team"            element={<Navigate to="/resource-planning" replace />} />
                <Route path="/team/:id"        element={<TeamMemberDetailView />} />
                <Route path="/email-tool"      element={<EmailToolView />} />
                <Route path="/settings"        element={<SettingsView />} />
                <Route path="/pixel"           element={<PixelView />} />
                <Route path="/profile"         element={<ProfileView />} />
              </Routes>
            </main>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App
