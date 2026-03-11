import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './design-system.css'
import { Sidebar } from './components/layout/Sidebar'
import { DashboardView } from './views/DashboardView'
import { StatisticsView } from './views/StatisticsView'
import { ClientsView } from './views/ClientsView'
import { ClientDetailView } from './views/ClientDetailView'
import { ProjectsView } from './views/ProjectsView'
import { ProjectDetailView } from './views/ProjectDetailView'
import { RevenuePlannerView } from './views/RevenuePlannerView'
import { ToolsView } from './views/ToolsView'
import { InfrastructureView } from './views/InfrastructureView'
import { DomainsView } from './views/DomainsView'
import { TimesheetView } from './views/TimesheetView'
import { ThisMonthView } from './views/ThisMonthView'
import { EmailToolView } from './views/EmailToolView'
import { CeoSummaryView } from './views/CeoSummaryView'
import { SettingsView } from './views/SettingsView'
import { Toaster } from './components/Toaster'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ── Standalone (no sidebar) ── */}
        <Route path="/ceo" element={<CeoSummaryView />} />

        {/* ── Main app layout ── */}
        <Route path="*" element={
          <div className="app-layout">
            <Sidebar />
            <main className="app-main">
              <Toaster />
              <Routes>
                <Route path="/"                element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard"       element={<DashboardView />} />
                <Route path="/this-month"      element={<ThisMonthView />} />
                <Route path="/planning"        element={<RevenuePlannerView />} />
                <Route path="/clients"         element={<ClientsView />} />
                <Route path="/clients/:id"     element={<ClientDetailView />} />
                <Route path="/projects"        element={<ProjectsView />} />
                <Route path="/projects/:id"    element={<ProjectDetailView />} />
                <Route path="/stats"           element={<StatisticsView />} />
                <Route path="/infrastructure"  element={<InfrastructureView />} />
                <Route path="/domains"         element={<DomainsView />} />
                <Route path="/tools"           element={<ToolsView />} />
                <Route path="/tools/timesheet" element={<TimesheetView />} />
                <Route path="/email-tool"      element={<EmailToolView />} />
                <Route path="/settings"        element={<SettingsView />} />
              </Routes>
            </main>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}

export default App
