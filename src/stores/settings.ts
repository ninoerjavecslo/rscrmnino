import { create } from 'zustand'
import { supabase } from '../lib/supabase'

interface SettingsState {
  agencyName: string
  agencyLogo: string
  projectManagers: string[]
  internalHourlyRate: number
  cmsOptions: string[]
  loading: boolean
  fetch: () => Promise<void>
  setAgencyName: (name: string) => Promise<void>
  setAgencyLogo: (url: string) => Promise<void>
  setProjectManagers: (managers: string[]) => Promise<void>
  setInternalHourlyRate: (rate: number) => Promise<void>
  setCmsOptions: (options: string[]) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  agencyName: '',
  agencyLogo: '',
  projectManagers: ['Nino'],
  internalHourlyRate: 0,
  cmsOptions: ['WordPress', 'Webflow', 'Custom', 'Shopify', 'Drupal', 'Other'],
  loading: false,

  fetch: async () => {
    set({ loading: true })
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('key, value')
      const map = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
      const pms = map['project_managers']
        ? JSON.parse(map['project_managers']) as string[]
        : ['Nino']
      const cms = map['cms_options']
        ? JSON.parse(map['cms_options']) as string[]
        : ['WordPress', 'Webflow', 'Custom', 'Shopify', 'Drupal', 'Other']
      set({ agencyName: map['agency_name'] ?? '', agencyLogo: map['agency_logo'] ?? '', projectManagers: pms, internalHourlyRate: parseFloat(map['internal_hourly_rate'] ?? '0') || 0, cmsOptions: cms })
    } finally {
      set({ loading: false })
    }
  },

  setAgencyName: async (name: string) => {
    await supabase.from('app_settings').upsert({ key: 'agency_name', value: name })
    set({ agencyName: name })
  },

  setAgencyLogo: async (url: string) => {
    await supabase.from('app_settings').upsert({ key: 'agency_logo', value: url })
    set({ agencyLogo: url })
  },

  setProjectManagers: async (managers: string[]) => {
    await supabase.from('app_settings').upsert({ key: 'project_managers', value: JSON.stringify(managers) })
    set({ projectManagers: managers })
  },

  setInternalHourlyRate: async (rate: number) => {
    await supabase.from('app_settings').upsert({ key: 'internal_hourly_rate', value: String(rate) })
    set({ internalHourlyRate: rate })
  },

  setCmsOptions: async (options: string[]) => {
    await supabase.from('app_settings').upsert({ key: 'cms_options', value: JSON.stringify(options) })
    set({ cmsOptions: options })
  },
}))
