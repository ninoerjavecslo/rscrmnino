import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { distributeWeekly } from '../lib/distributeWeekly'
import { toast } from '../lib/toast'
import type { AllocationTemplate, TemplateEntry, TeamMember, ResourceAllocation, AllocationCategory } from '../lib/types'

interface AddBatchRow {
  member_id: string
  project_id: string | null
  category: AllocationCategory
  date: string
  hours: number
  label?: string | null
  is_billable: boolean
}

interface UseTemplatesReturn {
  templates: AllocationTemplate[]
  loading: boolean
  saveTemplate: (name: string, entries: TemplateEntry[]) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  applyTemplate: (
    template: Pick<AllocationTemplate, 'entries'>,
    weekStart: string,
    existingAllocations: ResourceAllocation[],
    members: TeamMember[],
    addBatch: (rows: AddBatchRow[]) => Promise<void>,
  ) => Promise<void>
}

export function useTemplates(): UseTemplatesReturn {
  const [templates, setTemplates] = useState<AllocationTemplate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('allocation_templates')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          toast('error', 'Failed to load templates')
        }
        setTemplates((data ?? []) as AllocationTemplate[])
        setLoading(false)
      })
  }, [])

  const saveTemplate = useCallback(async (name: string, entries: TemplateEntry[]) => {
    const { data, error } = await supabase
      .from('allocation_templates')
      .insert({ name, entries })
      .select()
      .single()
    if (error) { toast('error', 'Failed to save template'); return }
    setTemplates(prev => [data as AllocationTemplate, ...prev])
    toast('success', `Template "${name}" saved`)
  }, [])

  const deleteTemplate = useCallback(async (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id))
    const { error } = await supabase.from('allocation_templates').delete().eq('id', id)
    if (error) {
      toast('error', 'Failed to delete template')
      supabase.from('allocation_templates').select('*').order('created_at', { ascending: false })
        .then(({ data }) => setTemplates((data ?? []) as AllocationTemplate[]))
    }
  }, [])

  const applyTemplate = useCallback(async (
    template: Pick<AllocationTemplate, 'entries'>,
    weekStart: string,
    existingAllocations: ResourceAllocation[],
    members: TeamMember[],
    addBatch: (rows: AddBatchRow[]) => Promise<void>,
  ) => {
    const skipped: string[] = []
    const rows: AddBatchRow[] = []

    for (const entry of template.entries) {
      const member = members.find(m => m.id === entry.member_id && m.active)
      if (!member) { skipped.push(entry.member_name); continue }

      const daySlots = distributeWeekly(weekStart, entry.member_id, entry.weekly_hours, members, existingAllocations)
      for (const { date, hours } of daySlots) {
        rows.push({
          member_id: entry.member_id,
          project_id: entry.project_id,
          category: entry.category,
          date,
          hours,
          is_billable: entry.is_billable,
        })
      }
    }

    if (rows.length === 0) { toast('info', 'No available capacity to apply template'); return }
    await addBatch(rows)
    if (skipped.length > 0) {
      toast('info', `Skipped: ${skipped.join(', ')} — not found in active team`)
    }
    toast('success', `Template applied — ${rows.length} allocations added`)
  }, [])

  return { templates, loading, saveTemplate, deleteTemplate, applyTemplate }
}
