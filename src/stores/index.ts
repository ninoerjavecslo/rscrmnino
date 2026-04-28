import { useClientsStore } from './clients'
import { useProjectsStore } from './projects'
import { useInfraStore } from './infrastructure'
import { useDomainsStore } from './domains'
import { useRevenuePlannerStore } from './revenuePlanner'
import { usePipelineStore } from './pipeline'
import { useChangeRequestsStore } from './changeRequests'
import { useMaintenancesStore } from './maintenances'
import { useResourceStore } from './resource'
import { useAutomationsStore } from './automations'
import { useSettingsStore } from './settings'
import { useRemindersStore } from './reminders'
import { resetAdminStore } from './admin'

export function resetAllStores() {
  useClientsStore.setState({ clients: [], loading: false, error: null })
  useProjectsStore.setState({ projects: [], loading: false, error: null })
  useInfraStore.setState({ hostingClients: [], infraCosts: [], loading: false, error: null })
  useDomainsStore.setState({ domains: [], loading: false, error: null })
  useRevenuePlannerStore.setState({ rows: [], loading: false, saving: false, error: null })
  usePipelineStore.setState({ items: [], loading: false, error: null })
  useChangeRequestsStore.setState({ changeRequests: [], maintenanceCRs: [], approvedCRs: [], pendingCRs: [], loading: false, error: null })
  useMaintenancesStore.setState({ maintenances: [], loading: false, error: null })
  useResourceStore.setState({ teams: [], members: [], allocations: [], confirmations: [], loading: false })
  useAutomationsStore.setState({ automations: [], items: [], loading: false, error: null })
  useSettingsStore.setState({ agencyName: '', agencyLogo: '', projectManagers: [], internalHourlyRate: 0, cmsOptions: [], jiraBaseUrl: '', jiraUserEmail: '', jiraApiToken: '', loading: false })
  useRemindersStore.setState({ rules: [], loading: false, error: null })
  resetAdminStore()
}
