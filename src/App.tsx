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
import { InternalView } from './views/InternalView'
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
// Offer generator disabled (Insighty SaaS rebrand)
// import { OfferGeneratorView } from './views/OfferGeneratorView'
// import { OfferNewView } from './views/OfferNewView'
// import { OfferEditorView } from './views/OfferEditorView'
// import { OfferTemplatesView } from './views/OfferTemplatesView'
import { ResourcePlanningView } from './views/ResourcePlanningView'
import { ResourceReportsView } from './views/ResourceReportsView'
import { ResourceYearlyView } from './views/ResourceYearlyView'
import { ResourceMonthlyView } from './views/ResourceMonthlyView'
import { ResourceByProjectView } from './views/ResourceByProjectView'
import { TeamMemberDetailView } from './views/TeamMemberDetailView'
import { MyWeekView } from './views/MyWeekView'
import { MemberDashboardView } from './views/MemberDashboardView'
import { ProfileView } from './views/ProfileView'
import { ContractsView } from './views/ContractsView'
import { ContractorsView } from './views/ContractorsView'
import { AgencyToolsView } from './views/AgencyToolsView'
import { ReportsView } from './views/ReportsView'
import { PipelineImpactView } from './views/reports/PipelineImpactView'
import { DelayImpactView } from './views/reports/DelayImpactView'
import { MonthlyDigestView } from './views/reports/MonthlyDigestView'
import { CapacityForecastView } from './views/reports/CapacityForecastView'
import { Toaster } from './components/Toaster'
import { Topbar } from './components/layout/Topbar'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminRoute } from './components/AdminRoute'
import { ImpersonationBanner } from './components/ImpersonationBanner'
import { AdminLayout } from './views/admin/AdminLayout'
import { AdminOverview } from './views/admin/AdminOverview'
import { AdminOrgsView } from './views/admin/AdminOrgsView'
import { AdminUsersView } from './views/admin/AdminUsersView'
import { usePermissionsStore } from './stores/permissions'
import { OrgProvider } from './components/OrgProvider'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [session, setSession] = useState<boolean | null>(null) // null = loading
  const fetchPermissions = usePermissionsStore(s => s.fetchMine)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(!!data.session)
      if (data.session) fetchPermissions()
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // Only react to real sign-in / sign-out, not token refreshes that fire on tab focus.
      // TOKEN_REFRESHED / USER_UPDATED must not retrigger fetchPermissions — it flips the
      // permissions store's loading flag, which makes ProtectedRoute unmount the active view.
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT' && event !== 'INITIAL_SESSION') return
      setSession(!!s)
      if (s) fetchPermissions()
    })
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (session === null) return null // loading — no flash

  if (!session) return <OrgProvider><LoginView onLogin={() => setSession(true)} /></OrgProvider>

  return (
    <OrgProvider>
    <BrowserRouter>
      <Routes>

        {/* ── Standalone routes (no sidebar) ── */}
        <Route path="/my-week/:token" element={<MyWeekView />} />
        <Route path="/member-dashboard/:token" element={<MemberDashboardView />} />

        {/* ── Admin console (own layout, no main sidebar) ── */}
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<Navigate to="/admin/overview" replace />} />
          <Route path="overview" element={<AdminOverview />} />
          <Route path="organizations" element={<AdminOrgsView />} />
          <Route path="users" element={<AdminUsersView />} />
        </Route>

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

              <ImpersonationBanner />
              <Topbar />
              <Toaster />
              <Routes>
                <Route path="/"                element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard"       element={<DashboardView />} />
                <Route path="/this-month"      element={<ProtectedRoute page="this-month"><ThisMonthView /></ProtectedRoute>} />
                <Route path="/automations"           element={<ProtectedRoute page="automations"><AutomationsView /></ProtectedRoute>} />
                <Route path="/automations/new"       element={<ProtectedRoute page="automations"><AutomationFormView /></ProtectedRoute>} />
                <Route path="/automations/:id/edit"  element={<ProtectedRoute page="automations"><AutomationFormView /></ProtectedRoute>} />
                <Route path="/planning"        element={<ProtectedRoute page="planning"><RevenuePlannerView /></ProtectedRoute>} />
                <Route path="/forecast"        element={<ProtectedRoute page="forecast"><ForecastView /></ProtectedRoute>} />
                <Route path="/clients"         element={<ProtectedRoute page="clients"><ClientsView /></ProtectedRoute>} />
                <Route path="/clients/:id"     element={<ProtectedRoute page="clients"><ClientDetailView /></ProtectedRoute>} />
                <Route path="/projects"        element={<ProtectedRoute page="projects"><ProjectsView /></ProtectedRoute>} />
                <Route path="/projects/:id"    element={<ProtectedRoute page="projects"><ProjectDetailView /></ProtectedRoute>} />
                <Route path="/internal"        element={<ProtectedRoute page="internal"><InternalView /></ProtectedRoute>} />
                <Route path="/maintenances"    element={<ProtectedRoute page="maintenances"><MaintenancesView /></ProtectedRoute>} />
                <Route path="/maintenances/:id" element={<ProtectedRoute page="maintenances"><MaintenanceDetailView /></ProtectedRoute>} />
                <Route path="/sales"           element={<ProtectedRoute page="sales"><SalesView /></ProtectedRoute>} />
                <Route path="/stats"           element={<ProtectedRoute page="stats"><StatisticsView /></ProtectedRoute>} />
                <Route path="/infrastructure"  element={<ProtectedRoute page="infrastructure"><InfrastructureView /></ProtectedRoute>} />
                <Route path="/domains"         element={<ProtectedRoute page="domains"><DomainsView /></ProtectedRoute>} />
                <Route path="/tools"           element={<ProtectedRoute page="tools"><ToolsView /></ProtectedRoute>} />
                <Route path="/tools/timesheet" element={<ProtectedRoute page="tools"><TimesheetView /></ProtectedRoute>} />
                {/* Offers section — disabled for Insighty SaaS rebrand */}
                {/* <Route path="/offers" element={<ProtectedRoute page="offers"><OfferGeneratorView /></ProtectedRoute>} /> */}
                {/* <Route path="/offers/new" element={<ProtectedRoute page="offers"><OfferNewView /></ProtectedRoute>} /> */}
                {/* <Route path="/offers/templates" element={<ProtectedRoute page="offers"><OfferTemplatesView /></ProtectedRoute>} /> */}
                {/* <Route path="/offers/:id" element={<ProtectedRoute page="offers"><OfferEditorView /></ProtectedRoute>} /> */}
                {/* <Route path="/tools/offer-generator" element={<Navigate to="/offers" replace />} /> */}
                {/* <Route path="/tools/offer-generator/new" element={<Navigate to="/offers/new" replace />} /> */}
                {/* <Route path="/tools/offer-generator/:id" element={<ProtectedRoute page="offers"><OfferEditorView /></ProtectedRoute>} /> */}
                <Route path="/resource-planning" element={<ProtectedRoute page="resource-planning"><ResourcePlanningView /></ProtectedRoute>} />
                <Route path="/resource-reports" element={<ProtectedRoute page="resource-planning"><ResourceReportsView /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute page="reports"><ReportsView /></ProtectedRoute>} />
                <Route path="/reports/pipeline-impact" element={<ProtectedRoute page="reports"><PipelineImpactView /></ProtectedRoute>} />
                <Route path="/reports/delay-impact" element={<ProtectedRoute page="reports"><DelayImpactView /></ProtectedRoute>} />
                <Route path="/reports/monthly-digest" element={<ProtectedRoute page="reports"><MonthlyDigestView /></ProtectedRoute>} />
                <Route path="/reports/capacity-forecast" element={<ProtectedRoute page="reports"><CapacityForecastView /></ProtectedRoute>} />
                <Route path="/resource-yearly" element={<ProtectedRoute page="resource-yearly"><ResourceYearlyView /></ProtectedRoute>} />
                <Route path="/resource-monthly" element={<ProtectedRoute page="resource-yearly"><ResourceMonthlyView /></ProtectedRoute>} />
                <Route path="/resource-by-project" element={<ProtectedRoute page="resource-yearly"><ResourceByProjectView /></ProtectedRoute>} />
                <Route path="/team"            element={<Navigate to="/resource-planning" replace />} />
                <Route path="/team/:id"        element={<TeamMemberDetailView />} />
                <Route path="/email-tool"      element={<EmailToolView />} />
                <Route path="/settings"        element={<SettingsView />} />
                <Route path="/pixel"           element={<ProtectedRoute page="pixel"><PixelView /></ProtectedRoute>} />
                <Route path="/profile"         element={<ProfileView />} />
                <Route path="/contracts"       element={<ProtectedRoute page="contracts"><ContractsView /></ProtectedRoute>} />
                <Route path="/contractors"     element={<ProtectedRoute page="contractors"><ContractorsView /></ProtectedRoute>} />
                <Route path="/stack"           element={<ProtectedRoute page="stack"><AgencyToolsView /></ProtectedRoute>} />
              </Routes>
            </main>
          </div>
        } />
      </Routes>
    </BrowserRouter>
    </OrgProvider>
  )
}

export default App
