// src/stores/jira.ts
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { JiraIssue, JiraUsageSummary, MaintenanceHoursLog } from '../lib/types'

interface JiraCache {
  [key: string]: JiraUsageSummary  // key = `${maintenanceId}:${month}`
}

interface JiraState {
  cache: JiraCache
  loading: Record<string, boolean>
  error: Record<string, string | null>
  fetchUsage: (maintenanceId: string, jiraProjectKey: string, month: string, bugType: string, crType: string) => Promise<void>
  saveManualHours: (maintenanceId: string, month: string, hours: number, notes?: string) => Promise<void>
  loadManualHours: (maintenanceId: string) => Promise<MaintenanceHoursLog[]>
}

export const useJiraStore = create<JiraState>((set, _get) => ({
  cache: {},
  loading: {},
  error: {},

  fetchUsage: async (maintenanceId, jiraProjectKey, month, bugType, crType) => {
    const cacheKey = `${maintenanceId}:${month}`
    set(s => ({ loading: { ...s.loading, [cacheKey]: true }, error: { ...s.error, [cacheKey]: null } }))

    try {
      // Fetch bugs + CRs in parallel
      const [bugsRes, crsRes, tempoRes] = await Promise.all([
        supabase.functions.invoke('jira-proxy', {
          body: { action: 'get-issues', projectKey: jiraProjectKey, month, issueTypes: [bugType] }
        }),
        supabase.functions.invoke('jira-proxy', {
          body: { action: 'get-issues', projectKey: jiraProjectKey, month, issueTypes: [crType] }
        }),
        supabase.functions.invoke('jira-proxy', {
          body: { action: 'get-tempo-hours', projectKey: jiraProjectKey, month }
        }),
      ])

      const bugs: JiraIssue[] = (bugsRes.data?.issues ?? [])
      const crs: JiraIssue[]  = (crsRes.data?.issues ?? [])
      const tempoHours: number = tempoRes.data?.totalHours ?? 0

      // Check for manual hours override
      const { data: manualLog } = await supabase
        .from('maintenance_hours_log')
        .select('*')
        .eq('maintenance_id', maintenanceId)
        .eq('month', month + '-01')
        .eq('source', 'manual')
        .maybeSingle()

      const summary: JiraUsageSummary = {
        bugsUsed: bugs.length,
        crsUsed: crs.length,
        hoursUsed: tempoHours,
        hoursManualOverride: manualLog?.hours_used ?? null,
        issues: [...bugs, ...crs],
      }

      set(s => ({ cache: { ...s.cache, [cacheKey]: summary } }))
    } catch (e) {
      set(s => ({ error: { ...s.error, [cacheKey]: (e as Error).message } }))
    } finally {
      set(s => ({ loading: { ...s.loading, [cacheKey]: false } }))
    }
  },

  saveManualHours: async (maintenanceId, month, hours, notes) => {
    await supabase.from('maintenance_hours_log').upsert({
      maintenance_id: maintenanceId,
      month: month + '-01',
      hours_used: hours,
      source: 'manual',
      notes: notes ?? null,
    }, { onConflict: 'maintenance_id,month' })
    // Invalidate cache for this month so it reloads
    const cacheKey = `${maintenanceId}:${month}`
    set(s => {
      const newCache = { ...s.cache }
      delete newCache[cacheKey]
      return { cache: newCache }
    })
  },

  loadManualHours: async (maintenanceId) => {
    const { data } = await supabase
      .from('maintenance_hours_log')
      .select('*')
      .eq('maintenance_id', maintenanceId)
      .order('month', { ascending: false })
    return (data ?? []) as MaintenanceHoursLog[]
  },
}))
