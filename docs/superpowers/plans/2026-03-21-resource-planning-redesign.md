# Resource Planning Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Resource Planning page — remove Weekly Advisor, add Simple/Advanced assign modal tabs, add allocation templates (auto-suggest + named), and add an AI-powered Smart Allocate wizard for monthly planning.

**Architecture:** Extract `distributeWeekly` into a pure utility, add a `useTemplates` hook for template CRUD, refactor `ResourcePlanningView` in layers (advisor removal → modal tabs → template UI → wizard UI), and add a `smart-allocator` Supabase edge function for monthly AI planning.

**Tech Stack:** React 19, TypeScript (strict), Zustand v5, Supabase JS client, Deno edge functions, Claude Sonnet 4.6 API

**Spec:** `docs/superpowers/specs/2026-03-20-resource-planning-redesign.md`

---

## Chunk 1: Foundation — types, utility, migration, hook

### Task 1: Extract `distributeWeekly` into a pure utility

**Files:**
- Create: `src/lib/distributeWeekly.ts`
- Modify: `src/views/ResourcePlanningView.tsx` (replace inline function with import)

- [ ] **Step 1: Create `src/lib/distributeWeekly.ts`**

```typescript
import type { TeamMember, ResourceAllocation } from './types'

function weekDaysOf(monday: string): string[] {
  const d = new Date(monday + 'T00:00:00')
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  })
}

/**
 * Distribute weeklyHours evenly across Mon–Fri of weekStart,
 * respecting existing allocations as used capacity.
 * Returns 0.5h-rounded { date, hours } pairs for available days only.
 */
export function distributeWeekly(
  weekStart: string,
  memberId: string,
  weeklyHours: number,
  members: TeamMember[],
  allocations: ResourceAllocation[],
): { date: string; hours: number }[] {
  const member = members.find(m => m.id === memberId)
  if (!member) return []
  const days = weekDaysOf(weekStart)
  const used: Record<string, number> = {}
  for (const a of allocations) {
    if (a.member_id === memberId && days.includes(a.date)) {
      used[a.date] = (used[a.date] || 0) + a.hours
    }
  }
  const avail = days
    .map(d => ({ date: d, avail: Math.max(0, member.hours_per_day - (used[d] || 0)) }))
    .filter(x => x.avail > 0)
  if (avail.length === 0) return []
  const perDay = weeklyHours / avail.length
  const result: { date: string; hours: number }[] = []
  let remaining = weeklyHours
  for (const { date, avail: cap } of avail) {
    if (remaining <= 0) break
    const h = Math.min(Math.round(Math.min(perDay, cap) * 2) / 2, remaining)
    if (h > 0) { result.push({ date, hours: h }); remaining -= h }
  }
  return result
}
```

- [ ] **Step 2: Replace inline `distributeWeekly` in `ResourcePlanningView.tsx`**

Add import at the top (after existing imports):
```typescript
import { distributeWeekly } from '../lib/distributeWeekly'
```

Delete the inline `distributeWeekly` function (lines ~423–445) and update `applySmartPlan` to call:
```typescript
distributeWeekly(weekStart, s.member_id, s.weekly_hours, allActive, allocations)
```
(It was already closing over `weekStart`, `allActive`, `allocations` — now they're explicit args.)

- [ ] **Step 3: Type-check**
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**
```bash
git add src/lib/distributeWeekly.ts src/views/ResourcePlanningView.tsx
git commit -m "refactor: extract distributeWeekly into pure utility"
```

---

### Task 2: Add types to `src/lib/types.ts`

**Files:**
- Modify: `src/lib/types.ts` (append after existing resource types, around line 454)

- [ ] **Step 1: Add types**

After the `ResourceAllocation` interface (after line ~453), add:

```typescript
export interface TemplateEntry {
  member_id: string
  member_name: string
  project_id: string | null
  project_label: string
  category: AllocationCategory
  weekly_hours: number
  is_billable: boolean
}

export interface AllocationTemplate {
  id: string
  name: string
  entries: TemplateEntry[]
  created_at: string
}
```

- [ ] **Step 2: Type-check**
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
git add src/lib/types.ts
git commit -m "feat: add AllocationTemplate and TemplateEntry types"
```

---

### Task 3: Supabase migration for `allocation_templates`

**Files:**
- Create: `supabase/migrations/008_allocation_templates.sql`

- [ ] **Step 1: Create migration file**

```sql
create table if not exists allocation_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  entries    jsonb not null default '[]',
  created_at timestamptz default now()
);

alter table allocation_templates enable row level security;

create policy "allow all authenticated"
  on allocation_templates
  for all
  using (true)
  with check (true);
```

- [ ] **Step 2: Commit**
```bash
git add supabase/migrations/008_allocation_templates.sql
git commit -m "feat: add allocation_templates migration"
```

> **Note:** Apply the migration via the Supabase dashboard SQL editor or `supabase db push` before running the app.

---

### Task 4: `useTemplates` hook

**Files:**
- Create: `src/hooks/useTemplates.ts`

- [ ] **Step 1: Create `src/hooks/useTemplates.ts`**

```typescript
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { distributeWeekly } from '../lib/distributeWeekly'
import { toast } from '../lib/toast'
import type { AllocationTemplate, TemplateEntry, TeamMember, ResourceAllocation, AllocationCategory } from '../lib/types'

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
    addBatch: (rows: {
      member_id: string; project_id: string | null; category: AllocationCategory
      date: string; hours: number; label?: string | null; is_billable: boolean
    }[]) => Promise<void>,
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
      .then(({ data }) => {
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
      // revert: re-fetch
      supabase.from('allocation_templates').select('*').order('created_at', { ascending: false })
        .then(({ data }) => setTemplates((data ?? []) as AllocationTemplate[]))
    }
  }, [])

  const applyTemplate = useCallback(async (
    template: Pick<AllocationTemplate, 'entries'>,
    weekStart: string,
    existingAllocations: ResourceAllocation[],
    members: TeamMember[],
    addBatch: UseTemplatesReturn['applyTemplate'] extends (...args: infer A) => infer R ? A[4] : never,
  ) => {
    const skipped: string[] = []
    const rows: Parameters<typeof addBatch>[0] = []

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
```

- [ ] **Step 2: Type-check**
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
git add src/hooks/useTemplates.ts
git commit -m "feat: add useTemplates hook with CRUD and apply logic"
```

---

## Chunk 2: ResourcePlanningView — advisor removal + Simple/Advanced modal

### Task 5: Remove Weekly Advisor

**Files:**
- Modify: `src/views/ResourcePlanningView.tsx`

- [ ] **Step 1: Remove advisor state**

Delete these state variables from the component:
```typescript
const [advisories, setAdvisories] = useState<Advisory[]>([])
const [aiSummary, setAiSummary] = useState<string | undefined>(undefined)
const [advisorLoading, setAdvisorLoading] = useState(false)
```

- [ ] **Step 2: Remove advisor imports**

Remove from imports:
```typescript
import { AdvisorPanel } from '../components/AdvisorPanel'
import { generateAdvisories } from '../lib/planningAdvisor'
import type { Advisory } from '../lib/planningAdvisor'
```

- [ ] **Step 3: Remove advisor logic**

Delete any `useEffect` or function that calls `generateAdvisories` or populates `advisories`/`aiSummary`.

- [ ] **Step 4: Remove `<AdvisorPanel>` from render**

Find the `<AdvisorPanel ... />` JSX block and delete it entirely.

- [ ] **Step 5: Type-check**
```bash
npx tsc --noEmit
```
Expected: no errors. If TS6133 (unused var), clean up any remaining advisory-related variables.

- [ ] **Step 6: Commit**
```bash
git add src/views/ResourcePlanningView.tsx
git commit -m "feat: remove Weekly Advisor from Resource Planning page"
```

---

### Task 6: Refactor assign modal to Simple / Advanced tabs

**Files:**
- Modify: `src/views/ResourcePlanningView.tsx`

- [ ] **Step 1: Add tab state**

Inside `ResourcePlanningView`, add:
```typescript
const [assignTab, setAssignTab] = useState<'simple' | 'advanced'>('simple')
```

Reset to `'simple'` when modal closes — in the close handler:
```typescript
setAssignFor(null)
setAssignTab('simple')
```

- [ ] **Step 2: Add Simple tab UI**

The simple tab renders a **single-entry** form. Use the first `assignEntries[0]` entry. Structure:

```tsx
{/* Tab switcher */}
<div style={{ display: 'flex', border: '1px solid var(--c6)', borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
  {(['simple', 'advanced'] as const).map(tab => (
    <button key={tab} onClick={() => setAssignTab(tab)} style={{
      flex: 1, padding: '8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      fontWeight: 700, fontSize: 13,
      background: assignTab === tab ? 'var(--navy)' : 'var(--c7)',
      color: assignTab === tab ? '#fff' : 'var(--c3)',
    }}>
      {tab === 'simple' ? 'Simple' : 'Advanced'}
    </button>
  ))}
</div>
```

**Simple tab body** (shown when `assignTab === 'simple'`):
- Type dropdown bound to `assignEntries[0].category`
- Project select (if category is `project` or `maintenance`) bound to `assignEntries[0].projectId`
- Label input (otherwise) bound to `assignEntries[0].label`
- Hours chips: `[4, 8, 16, 20, 24, 32, 40]` — clicking sets `assignEntries[0].totalHours` and forces `mode: 'week'`
- Custom hours input (number) also sets `totalHours`
- Repeat weekly checkbox + weeks input
- Billable checkbox

Submit button: **"Assign {totalHours}h"** — calls existing `handleAssign()` with only `assignEntries[0]`.

- [ ] **Step 3: Show existing multi-entry UI only in Advanced tab**

Wrap the existing multi-entry render (type/project/mode-toggle/day-inputs/deadline/remove-button sections) in `{assignTab === 'advanced' && ( ... )}`.

Advanced tab still shows:
- "+ Add another allocation" button
- Per-entry mode toggle (Per week / Per day)
- Per-entry deadline checkbox + date picker
- Remove entry button

- [ ] **Step 4: Type-check**
```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**
```bash
git add src/views/ResourcePlanningView.tsx
git commit -m "feat: Simple/Advanced tabs in assign modal"
```

---

## Chunk 3: Templates UI

### Task 7: Wire `useTemplates` into `ResourcePlanningView`

**Files:**
- Modify: `src/views/ResourcePlanningView.tsx`

- [ ] **Step 1: Import and call hook**

```typescript
import { useTemplates } from '../hooks/useTemplates'
import type { AllocationTemplate, TemplateEntry } from '../lib/types'
```

Inside component:
```typescript
const { templates, saveTemplate, deleteTemplate, applyTemplate } = useTemplates()
```

- [ ] **Step 2: Add template-related state**

```typescript
const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false)
const [showSaveTemplate, setShowSaveTemplate] = useState(false)
const [saveTemplateName, setSaveTemplateName] = useState('')
const [lastWeekDismissed, setLastWeekDismissed] = useState(false)
```

`lastWeekDismissed` init: read `sessionStorage.getItem('rp_lastweek_dismissed_' + weekStart) === '1'`.

When `weekStart` changes, re-read from sessionStorage (use a `useEffect([weekStart])`).

- [ ] **Step 3: Compute last-week suggestion**

```typescript
const [lastWeekAllocations, setLastWeekAllocations] = useState<ResourceAllocation[]>([])

useEffect(() => {
  const prevMonday = (() => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() - 7)
    return localDate(d)
  })()
  const prevFriday = (() => {
    const d = new Date(weekStart + 'T00:00:00')
    d.setDate(d.getDate() - 3)
    return localDate(d)
  })()
  supabase.from('resource_allocations')
    .select('*, project:projects(id, pn, name)')
    .gte('date', prevMonday).lte('date', prevFriday)
    .then(({ data }) => setLastWeekAllocations((data ?? []) as ResourceAllocation[]))
}, [weekStart])

const showLastWeekBanner = !lastWeekDismissed
  && allocations.length === 0
  && lastWeekAllocations.length > 0

// Build summary string for the banner
const lastWeekSummary = useMemo(() => {
  const groups: Record<string, number> = {}
  for (const a of lastWeekAllocations) {
    const label = a.project ? `${a.project.pn}` : a.label || a.category
    const key = `${a.member_id}::${label}`
    groups[key] = (groups[key] || 0) + a.hours
  }
  return Object.entries(groups).slice(0, 4).map(([key, h]) => {
    const [mid, label] = key.split('::')
    const m = allActive.find(x => x.id === mid)
    return `${m?.name ?? '?'} ${h}h ${label}`
  }).join(' · ')
}, [lastWeekAllocations, allActive])

// Build synthetic template from last week
function buildLastWeekTemplate(): Pick<AllocationTemplate, 'entries'> {
  const groups: Record<string, TemplateEntry> = {}
  for (const a of lastWeekAllocations) {
    const key = `${a.member_id}::${a.project_id ?? a.category}`
    if (!groups[key]) {
      const m = allActive.find(x => x.id === a.member_id)
      groups[key] = {
        member_id: a.member_id,
        member_name: m?.name ?? '?',
        project_id: a.project_id ?? null,
        project_label: a.project ? `${a.project.pn} — ${a.project.name}` : a.label || a.category,
        category: a.category,
        weekly_hours: 0,
        is_billable: a.is_billable,
      }
    }
    groups[key].weekly_hours += a.hours
  }
  return { entries: Object.values(groups) }
}
```

- [ ] **Step 4: Last-week banner JSX**

Place below the week nav row, above the filters:

```tsx
{showLastWeekBanner && (
  <div style={{
    background: 'var(--navy-light)', border: '1px solid var(--navy-muted)',
    borderRadius: 8, padding: '10px 14px', margin: '0 0 12px',
    display: 'flex', alignItems: 'center', gap: 10,
  }}>
    <span style={{ fontSize: 14 }}>💡</span>
    <span style={{ fontSize: 13, flex: 1, color: 'var(--c1)' }}>
      <strong>Repeat last week?</strong> {lastWeekSummary}
    </span>
    <button className="btn btn-primary btn-sm" onClick={async () => {
      await applyTemplate(buildLastWeekTemplate(), weekStart, allocations, allActive, addAllocationsBatch)
    }}>Apply</button>
    <button className="btn btn-ghost btn-sm" onClick={() => {
      sessionStorage.setItem('rp_lastweek_dismissed_' + weekStart, '1')
      setLastWeekDismissed(true)
    }}>Dismiss</button>
  </div>
)}
```

- [ ] **Step 5: Templates header buttons**

In the page header actions row, add two buttons before "⚡ Batch Assign":

```tsx
{/* Templates dropdown */}
<div style={{ position: 'relative' }}>
  <button className="btn btn-secondary btn-sm" onClick={() => setShowTemplatesDropdown(v => !v)}>
    📋 Templates ▾
  </button>
  {showTemplatesDropdown && (
    <div style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 200, marginTop: 4,
      background: '#fff', border: '1px solid var(--c6)', borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 280, padding: 8,
    }} onClick={e => e.stopPropagation()}>
      {templates.length === 0 && (
        <div style={{ padding: '10px 8px', fontSize: 13, color: 'var(--c3)' }}>No saved templates yet.</div>
      )}
      {templates.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)' }}>{t.name}</div>
            <div style={{ fontSize: 11, color: 'var(--c3)' }}>{t.entries.length} entries</div>
          </div>
          <button className="btn btn-primary btn-xs" onClick={async () => {
            setShowTemplatesDropdown(false)
            await applyTemplate(t, weekStart, allocations, allActive, addAllocationsBatch)
          }}>Apply</button>
          <button className="btn btn-ghost btn-xs" onClick={() => deleteTemplate(t.id)}>×</button>
        </div>
      ))}
    </div>
  )}
</div>

{/* Save as template */}
<button className="btn btn-secondary btn-sm" onClick={() => {
  const d = new Date(weekStart + 'T00:00:00')
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  setSaveTemplateName(`Sprint Week ${label}`)
  setShowSaveTemplate(true)
}}>💾 Save week</button>
```

Close dropdown on outside click: add `onClick={() => setShowTemplatesDropdown(false)}` to the page wrapper div, and `e.stopPropagation()` inside the dropdown.

- [ ] **Step 6: Save template modal**

```tsx
{showSaveTemplate && (
  <div className="modal-overlay" onClick={() => setShowSaveTemplate(false)}>
    <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
      <div className="modal-header">
        <h3>Save week as template</h3>
        <button className="modal-close" onClick={() => setShowSaveTemplate(false)}>&times;</button>
      </div>
      <div className="modal-body">
        <div className="form-group">
          <label className="form-label">Template name</label>
          <input className="form-input" value={saveTemplateName}
            onChange={e => setSaveTemplateName(e.target.value)} />
        </div>
        <div style={{ marginTop: 12 }}>
          {/* Preview: current week grouped by member+project */}
          {(() => {
            const groups: Record<string, number> = {}
            for (const a of allocations) {
              const label = a.project ? `${a.project.pn} — ${a.project.name}` : a.label || a.category
              const m = allActive.find(x => x.id === a.member_id)
              const key = `${m?.name ?? '?'} — ${label}`
              groups[key] = (groups[key] || 0) + a.hours
            }
            return Object.entries(groups).map(([key, h]) => (
              <div key={key} style={{ fontSize: 13, color: 'var(--c2)', padding: '3px 0' }}>
                {key}: <strong>{h}h</strong>
              </div>
            ))
          })()}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={() => setShowSaveTemplate(false)}>Cancel</button>
        <button className="btn btn-primary" disabled={!saveTemplateName.trim()} onClick={async () => {
          // Build TemplateEntry[] from current week's allocations
          const groups: Record<string, TemplateEntry> = {}
          for (const a of allocations) {
            const key = `${a.member_id}::${a.project_id ?? a.category}`
            if (!groups[key]) {
              const m = allActive.find(x => x.id === a.member_id)
              groups[key] = {
                member_id: a.member_id,
                member_name: m?.name ?? '?',
                project_id: a.project_id ?? null,
                project_label: a.project ? `${a.project.pn} — ${a.project.name}` : a.label || a.category,
                category: a.category,
                weekly_hours: 0,
                is_billable: a.is_billable,
              }
            }
            groups[key].weekly_hours += a.hours
          }
          await saveTemplate(saveTemplateName.trim(), Object.values(groups))
          setShowSaveTemplate(false)
        }}>Save template</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 7: Type-check**
```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**
```bash
git add src/views/ResourcePlanningView.tsx
git commit -m "feat: allocation templates — save, apply, last-week auto-suggest"
```

---

## Chunk 4: Smart Allocate wizard + edge function

### Task 8: `smart-allocator` edge function

**Files:**
- Create: `supabase/functions/smart-allocator/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.53.0'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

interface InputProject {
  id: string
  pn: string
  name: string
  budget_hours: number
  member_ids: string[]
  deliverables: Array<{ title: string; due_date: string | null; estimated_hours: number | null }>
}

interface InputMember {
  id: string
  name: string
  hours_per_day: number
  role?: string | null
}

interface ExistingAlloc {
  member_id: string
  date: string
  hours: number
}

interface WizardAllocation {
  member_id: string
  project_id: string
  weekly_hours: number
  reason: string
}

interface WizardWeek {
  week_start: string
  allocations: WizardAllocation[]
}

function getMondaysInMonth(monthStart: string): string[] {
  const d = new Date(monthStart + 'T00:00:00')
  const month = d.getMonth()
  // advance to first Monday
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1)
  const mondays: string[] = []
  while (d.getMonth() === month) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
    mondays.push(`${y}-${m}-${day}`)
    d.setDate(d.getDate() + 7)
  }
  return mondays
}

function weekDays(monday: string): string[] {
  const d = new Date(monday + 'T00:00:00')
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
    })
  }

  try {
    const { projects, members, month_start, existing_allocations } = await req.json() as {
      projects: InputProject[]
      members: InputMember[]
      month_start: string
      existing_allocations: ExistingAlloc[]
    }

    const mondays = getMondaysInMonth(month_start)

    // Compute available capacity per member per week
    const capacityMap: Record<string, Record<string, number>> = {}
    for (const m of members) {
      capacityMap[m.id] = {}
      for (const mon of mondays) {
        const days = weekDays(mon)
        const used = existing_allocations
          .filter(a => a.member_id === m.id && days.includes(a.date))
          .reduce((s, a) => s + a.hours, 0)
        capacityMap[m.id][mon] = Math.max(0, m.hours_per_day * 5 - used)
      }
    }

    const lines: string[] = []
    lines.push(`Month: ${month_start} — ${mondays.length} weeks`)
    lines.push(`Weeks: ${mondays.join(', ')}`)
    lines.push('')

    lines.push('=== TEAM CAPACITY PER WEEK ===')
    for (const m of members) {
      const weekCaps = mondays.map(mon => `${mon}: ${capacityMap[m.id][mon]}h`).join(' | ')
      lines.push(`${m.name} [id:${m.id}] (${m.role ?? 'team member'}): ${weekCaps}`)
    }
    lines.push('')

    lines.push('=== PROJECTS & BUDGETS ===')
    for (const p of projects) {
      const assignedNames = p.member_ids.map(mid => members.find(m => m.id === mid)?.name ?? mid).join(', ')
      lines.push(`${p.pn} — ${p.name} [id:${p.id}]: ${p.budget_hours}h budget | team: ${assignedNames}`)
      for (const d of p.deliverables) {
        lines.push(`  · "${d.title}" due ${d.due_date ?? 'no date'}, est. ${d.estimated_hours ?? '?'}h`)
      }
    }

    const prompt = `${lines.join('\n')}

=== YOUR TASK ===
Create a week-by-week allocation plan for this month. Distribute each project's budget across its team members over the available weeks.

Rules:
1. Never give a member more hours in a week than their available capacity for that week
2. Only assign members who are listed in a project's team
3. Prioritize deliverables with earlier due dates
4. Try to give each project meaningful progress every week (don't front-load or back-load)
5. Use 0.5h increments, minimum 1h per allocation entry
6. Aim to use most of each project's budget across the month

Return ONLY valid JSON (no markdown):
{
  "weeks": [
    {
      "week_start": "YYYY-MM-DD",
      "allocations": [
        { "member_id": "...", "project_id": "...", "weekly_hours": 20, "reason": "one sentence" }
      ]
    }
  ]
}`

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    let weeks: WizardWeek[] = []

    try {
      const parsed = JSON.parse(text.trim())
      weeks = (parsed.weeks ?? []).map((w: WizardWeek) => ({
        week_start: w.week_start,
        allocations: (w.allocations ?? [])
          .map((a: WizardAllocation) => ({
            member_id: a.member_id,
            project_id: a.project_id,
            weekly_hours: Math.max(0, Number(a.weekly_hours) || 0),
            reason: a.reason ?? '',
          }))
          .filter((a: WizardAllocation) =>
            a.weekly_hours > 0
            && members.some(m => m.id === a.member_id)
            && projects.some(p => p.id === a.project_id)
          ),
      }))
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        try { weeks = JSON.parse(match[0]).weeks ?? [] } catch { /* give up */ }
      }
    }

    return new Response(JSON.stringify({ weeks }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
```

- [ ] **Step 2: Commit**
```bash
git add supabase/functions/smart-allocator/
git commit -m "feat: smart-allocator edge function for monthly AI allocation"
```

---

### Task 9: Smart Allocate wizard UI in `ResourcePlanningView`

**Files:**
- Modify: `src/views/ResourcePlanningView.tsx`

- [ ] **Step 1: Add wizard state**

```typescript
// wizard modal
const [showWizard, setShowWizard] = useState(false)
const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1)
const [wizardMonth, setWizardMonth] = useState(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
})
const [wizardSelectedProjects, setWizardSelectedProjects] = useState<Set<string>>(new Set())
const [wizardBudgets, setWizardBudgets] = useState<Record<string, number>>({})
const [wizardProjectMembers, setWizardProjectMembers] = useState<Record<string, string[]>>({})
const [wizardPlan, setWizardPlan] = useState<{
  week_start: string
  allocations: { member_id: string; project_id: string; weekly_hours: number; reason: string }[]
}[]>([])
const [wizardLoading, setWizardLoading] = useState(false)
const [wizardSaveAsTemplate, setWizardSaveAsTemplate] = useState(false)
const [wizardTemplateName, setWizardTemplateName] = useState('')
const [wizardSaving, setWizardSaving] = useState(false)

function resetWizard() {
  setWizardStep(1); setWizardSelectedProjects(new Set()); setWizardBudgets({})
  setWizardProjectMembers({}); setWizardPlan([]); setWizardLoading(false)
  setWizardSaveAsTemplate(false); setWizardTemplateName('')
}
```

- [ ] **Step 2: Add "✦ Smart Allocate" button to header**

```tsx
<button className="btn btn-primary btn-sm" onClick={() => { resetWizard(); setShowWizard(true) }}>
  ✦ Smart Allocate
</button>
```

- [ ] **Step 3: Wizard step progress bar component (inline helper)**

```tsx
function WizardSteps({ step }: { step: number }) {
  const labels = ['Projects', 'Budgets & Team', 'AI Plan', 'Review']
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
      {labels.map((label, i) => {
        const n = i + 1
        const done = step > n
        const active = step === n
        return (
          <React.Fragment key={n}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 10, fontWeight: 800,
                background: done || active ? 'var(--navy)' : 'var(--c6)',
                color: done || active ? '#fff' : 'var(--c3)',
              }}>{done ? '✓' : n}</div>
              <span style={{ fontSize: 10, color: active ? 'var(--navy)' : 'var(--c3)', fontWeight: active ? 700 : 400, whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div style={{ flex: 1, height: 2, background: step > n ? 'var(--navy)' : 'var(--c6)', margin: '0 4px', marginBottom: 14 }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
```

Note: define this as a `function` inside the component file (above the main component) or as a nested component. If TypeScript complains about `React.Fragment`, use `<>...</>` instead.

- [ ] **Step 4: Step 1 — Pick projects**

```tsx
{wizardStep === 1 && (
  <div>
    <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c2)' }}>Month:</span>
      <input type="month" value={wizardMonth} onChange={e => setWizardMonth(e.target.value)}
        style={{ border: '1px solid var(--c6)', borderRadius: 6, padding: '4px 8px', fontFamily: 'inherit', fontSize: 13 }} />
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {projects.filter(p => p.status === 'active').map(p => {
        const checked = wizardSelectedProjects.has(p.id)
        const delivCount = deliverables.filter(d => d.project_id === p.id && d.status === 'active').length
        return (
          <div key={p.id} onClick={() => setWizardSelectedProjects(prev => {
            const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n
          })} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
            border: checked ? '1.5px solid var(--navy-muted)' : '1px solid var(--c6)',
            background: checked ? 'var(--navy-light)' : '#fff',
          }}>
            <input type="checkbox" checked={checked} onChange={() => {}} style={{ width: 15, height: 15 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)' }}>{p.pn} — {p.name}</div>
              {delivCount > 0 && <div style={{ fontSize: 11, color: 'var(--c3)' }}>{delivCount} active deliverable{delivCount !== 1 ? 's' : ''}</div>}
            </div>
          </div>
        )
      })}
    </div>
  </div>
)}
```

- [ ] **Step 5: Step 2 — Budgets & team**

For each selected project, render a row with:
- Project label
- Number input for budget (pre-fill from sum of deliverable `estimated_hours`, fallback 40)
- Team member toggle chips (multi-select from `allActive`)

```tsx
{wizardStep === 2 && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    {[...wizardSelectedProjects].map(pid => {
      const proj = projects.find(p => p.id === pid)
      if (!proj) return null
      const delivHours = deliverables.filter(d => d.project_id === pid && d.status === 'active')
        .reduce((s, d) => s + (d.estimated_hours ?? 0), 0)
      const defaultBudget = delivHours > 0 ? delivHours : 40
      const budget = wizardBudgets[pid] ?? defaultBudget
      const memberIds = wizardProjectMembers[pid] ?? []
      return (
        <div key={pid} style={{ background: 'var(--c7)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)', marginBottom: 8 }}>{proj.pn} — {proj.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <label style={{ fontSize: 12, color: 'var(--c3)' }}>Budget (hours):</label>
            <input type="number" value={budget} min={1} step={0.5}
              onChange={e => setWizardBudgets(prev => ({ ...prev, [pid]: Number(e.target.value) }))}
              style={{ width: 70, border: '1px solid var(--c6)', borderRadius: 6, padding: '4px 8px', fontFamily: 'inherit', fontSize: 13 }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--c3)', marginBottom: 6, fontWeight: 700 }}>TEAM</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {allActive.map(m => {
              const sel = memberIds.includes(m.id)
              return (
                <button key={m.id} onClick={() => setWizardProjectMembers(prev => ({
                  ...prev, [pid]: sel ? memberIds.filter(id => id !== m.id) : [...memberIds, m.id],
                }))} style={{
                  padding: '4px 10px', borderRadius: 100, fontSize: 12, fontWeight: 600,
                  border: sel ? '1.5px solid var(--navy-muted)' : '1px solid var(--c6)',
                  background: sel ? 'var(--navy-light)' : '#fff',
                  color: sel ? 'var(--navy)' : 'var(--c2)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{m.name}</button>
              )
            })}
          </div>
        </div>
      )
    })}
    {/* Capacity warning */}
    {(() => {
      const totalBudget = [...wizardSelectedProjects].reduce((s, pid) => s + (wizardBudgets[pid] ?? 40), 0)
      const allMemberIds = new Set([...wizardSelectedProjects].flatMap(pid => wizardProjectMembers[pid] ?? []))
      const weekCount = 4 // approx
      const totalCap = [...allMemberIds].reduce((s, mid) => {
        const m = allActive.find(x => x.id === mid)
        return s + (m ? m.hours_per_day * 5 * weekCount : 0)
      }, 0)
      if (totalBudget > totalCap && totalCap > 0) {
        return <div className="alert alert-amber" style={{ marginTop: 10, fontSize: 12 }}>
          ⚠ Total budget ({totalBudget}h) exceeds estimated team capacity ({totalCap}h). Plan may be truncated.
        </div>
      }
      return null
    })()}
  </div>
)}
```

- [ ] **Step 6: Step 3 — AI generates plan**

```tsx
{wizardStep === 3 && (
  <div>
    {wizardLoading && (
      <div style={{ textAlign: 'center', padding: '48px 20px' }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>✦</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c1)', marginBottom: 6 }}>Generating allocation plan…</div>
        <div style={{ fontSize: 13, color: 'var(--c4)' }}>AI is planning {[...wizardSelectedProjects].length} projects across the month</div>
      </div>
    )}
    {!wizardLoading && wizardPlan.length > 0 && (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--c6)' }}>
              <th style={{ textAlign: 'left', padding: '8px', color: 'var(--c3)', fontWeight: 700 }}>Member</th>
              {wizardPlan.map(w => (
                <th key={w.week_start} style={{ textAlign: 'center', padding: '8px', color: 'var(--c3)', fontWeight: 700, minWidth: 100 }}>
                  {new Date(w.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allActive.filter(m => wizardPlan.some(w => w.allocations.some(a => a.member_id === m.id))).map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid var(--c7)' }}>
                <td style={{ padding: '8px', fontWeight: 700, color: 'var(--c0)' }}>{m.name}</td>
                {wizardPlan.map(w => {
                  const cellAllocs = w.allocations.filter(a => a.member_id === m.id)
                  return (
                    <td key={w.week_start} style={{ padding: '8px', verticalAlign: 'top' }}>
                      {cellAllocs.length === 0
                        ? <span style={{ color: 'var(--c5)', fontSize: 11 }}>—</span>
                        : cellAllocs.map((a, ai) => {
                          const proj = projects.find(p => p.id === a.project_id)
                          return (
                            <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                              <span style={{ fontSize: 11, color: 'var(--navy)', fontWeight: 600 }}>{proj?.pn ?? '?'}</span>
                              <input type="number" value={a.weekly_hours} min={0} step={0.5}
                                onChange={e => setWizardPlan(prev => prev.map(wk =>
                                  wk.week_start !== w.week_start ? wk : {
                                    ...wk, allocations: wk.allocations.map((al, idx) =>
                                      wk.allocations.indexOf(al) !== wk.allocations.filter(x => x.member_id === m.id).indexOf(a) + wk.allocations.findIndex(x => x.member_id === m.id) ? al
                                      // simpler: match by member_id + project_id + index
                                      : al.member_id === a.member_id && al.project_id === a.project_id && al === a
                                        ? { ...al, weekly_hours: Number(e.target.value) } : al
                                    )
                                  }
                                ))}
                                style={{ width: 44, border: '1px solid var(--c6)', borderRadius: 4, padding: '2px 4px', fontSize: 11, fontFamily: 'inherit' }} />
                              <span style={{ fontSize: 10, color: 'var(--c3)' }}>h</span>
                            </div>
                          )
                        })
                      }
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
    {!wizardLoading && wizardPlan.length === 0 && (
      <div style={{ textAlign: 'center', padding: '32px', color: 'var(--c3)', fontSize: 13 }}>
        No plan generated. <button className="btn btn-secondary btn-sm" onClick={runWizardAI}>Try again</button>
      </div>
    )}
  </div>
)}
```

**Note on cell editing:** The inline `onChange` for the hours input above uses object identity (`al === a`) to find the right allocation. A cleaner implementation adds an `id` field to each `WizardAllocation` on parse (`crypto.randomUUID()` or index), then matches by id. Implement whichever approach is cleaner — the key requirement is that editing one cell does not affect other cells.

- [ ] **Step 7: `runWizardAI` function**

```typescript
async function runWizardAI() {
  setWizardLoading(true)
  setWizardPlan([])
  try {
    const monthStart = wizardMonth + '-01'
    const selectedProjs = projects.filter(p => wizardSelectedProjects.has(p.id))
    const projPayload = selectedProjs.map(p => ({
      id: p.id, pn: p.pn, name: p.name,
      budget_hours: wizardBudgets[p.id] ?? 40,
      member_ids: wizardProjectMembers[p.id] ?? [],
      deliverables: deliverables.filter(d => d.project_id === p.id && d.status === 'active')
        .map(d => ({ title: d.title, due_date: d.due_date ?? null, estimated_hours: d.estimated_hours ?? null })),
    }))

    // Fetch existing allocations for the month without polluting store state
    const monthEnd = (() => {
      const d = new Date(monthStart + 'T00:00:00')
      d.setMonth(d.getMonth() + 1)
      d.setDate(0) // last day of month
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    const { data: monthAllocs } = await supabase.from('resource_allocations')
      .select('member_id, date, hours')
      .gte('date', monthStart).lte('date', monthEnd)

    const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-allocator`
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
      body: JSON.stringify({
        projects: projPayload,
        members: allActive.map(m => ({ id: m.id, name: m.name, hours_per_day: m.hours_per_day, role: m.role })),
        month_start: monthStart,
        existing_allocations: monthAllocs ?? [],
      }),
    })
    if (!res.ok) throw new Error('Edge function error')
    const data = await res.json()

    // Add local ids to allocations for stable cell editing
    const plan = (data.weeks ?? []).map((w: { week_start: string; allocations: { member_id: string; project_id: string; weekly_hours: number; reason: string }[] }) => ({
      week_start: w.week_start,
      allocations: (w.allocations ?? []).map((a: { member_id: string; project_id: string; weekly_hours: number; reason: string }) => ({ ...a, _id: Math.random().toString(36).slice(2) })),
    }))
    setWizardPlan(plan)
    setWizardStep(3)
  } catch {
    toast('error', 'Smart allocator unavailable — check Supabase edge function')
  } finally {
    setWizardLoading(false)
  }
}
```

- [ ] **Step 8: Step 4 — Review & apply**

```tsx
{wizardStep === 4 && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
    {/* Summary per project */}
    {[...wizardSelectedProjects].map(pid => {
      const proj = projects.find(p => p.id === pid)
      const budget = wizardBudgets[pid] ?? 40
      const allocated = wizardPlan.flatMap(w => w.allocations)
        .filter(a => a.project_id === pid)
        .reduce((s, a) => s + a.weekly_hours, 0)
      const pct = budget > 0 ? Math.round((allocated / budget) * 100) : 0
      return (
        <div key={pid} style={{ background: 'var(--c7)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{proj?.pn} — {proj?.name}</span>
            <span style={{ fontSize: 12, color: pct >= 90 ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>{allocated}h / {budget}h ({pct}%)</span>
          </div>
          <div style={{ height: 4, background: 'var(--c6)', borderRadius: 2, marginTop: 6 }}>
            <div style={{ width: `${Math.min(100, pct)}%`, height: 4, background: pct >= 90 ? 'var(--green)' : 'var(--navy)', borderRadius: 2 }} />
          </div>
        </div>
      )
    })}
    {/* Save as template option */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input type="checkbox" id="wiz-save-tmpl" checked={wizardSaveAsTemplate}
        onChange={e => {
          setWizardSaveAsTemplate(e.target.checked)
          if (e.target.checked && !wizardTemplateName) {
            const d = new Date(wizardMonth + '-01T00:00:00')
            setWizardTemplateName(`${d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} Smart Plan`)
          }
        }} />
      <label htmlFor="wiz-save-tmpl" style={{ fontSize: 13 }}>Save as template</label>
      {wizardSaveAsTemplate && (
        <input value={wizardTemplateName} onChange={e => setWizardTemplateName(e.target.value)}
          style={{ flex: 1, border: '1px solid var(--c6)', borderRadius: 6, padding: '4px 8px', fontFamily: 'inherit', fontSize: 13 }} />
      )}
    </div>
  </div>
)}
```

- [ ] **Step 9: Wizard apply function**

```typescript
async function handleWizardApply() {
  setWizardSaving(true)
  try {
    const monthStart = wizardMonth + '-01'
    const monthEnd = (() => {
      const d = new Date(monthStart + 'T00:00:00')
      d.setMonth(d.getMonth() + 1); d.setDate(0)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()

    // Fetch all existing allocations for the month once
    const { data: monthAllocs } = await supabase.from('resource_allocations')
      .select('member_id, date, hours, id')
      .gte('date', monthStart).lte('date', monthEnd)
    const existingByWeek = (week_start: string) => (monthAllocs ?? []).filter(a => {
      const d = new Date(a.date + 'T00:00:00')
      const mon = new Date(week_start + 'T00:00:00')
      const fri = new Date(mon); fri.setDate(fri.getDate() + 4)
      return d >= mon && d <= fri
    })

    const rows: Parameters<typeof addAllocationsBatch>[0] = []
    for (const week of wizardPlan) {
      const weekSlice = existingByWeek(week.week_start) as ResourceAllocation[]
      for (const alloc of week.allocations) {
        if (alloc.weekly_hours <= 0) continue
        const daySlots = distributeWeekly(week.week_start, alloc.member_id, alloc.weekly_hours, allActive, weekSlice)
        for (const { date, hours } of daySlots) {
          rows.push({
            member_id: alloc.member_id,
            project_id: alloc.project_id,
            category: 'project',
            date,
            hours,
            is_billable: true,
          })
        }
      }
    }

    if (rows.length === 0) { toast('info', 'No capacity available'); setWizardSaving(false); return }
    await addAllocationsBatch(rows)

    if (wizardSaveAsTemplate && wizardTemplateName.trim()) {
      // Build template entries: per member+project, average weekly_hours across weeks where they appear
      const entryMap: Record<string, { sum: number; count: number; entry: TemplateEntry }> = {}
      for (const week of wizardPlan) {
        for (const alloc of week.allocations) {
          if (alloc.weekly_hours <= 0) continue
          const key = `${alloc.member_id}::${alloc.project_id}`
          const m = allActive.find(x => x.id === alloc.member_id)
          const proj = projects.find(p => p.id === alloc.project_id)
          if (!entryMap[key]) {
            entryMap[key] = {
              sum: 0, count: 0,
              entry: {
                member_id: alloc.member_id, member_name: m?.name ?? '?',
                project_id: alloc.project_id, project_label: proj ? `${proj.pn} — ${proj.name}` : '?',
                category: 'project', weekly_hours: 0, is_billable: true,
              }
            }
          }
          entryMap[key].sum += alloc.weekly_hours
          entryMap[key].count += 1
        }
      }
      const entries: TemplateEntry[] = Object.values(entryMap).map(({ sum, count, entry }) => ({
        ...entry, weekly_hours: Math.round((sum / count) * 2) / 2,
      }))
      await saveTemplate(wizardTemplateName.trim(), entries)
    }

    toast('success', `Applied ${rows.length} allocations across the month`)
    setShowWizard(false)
    resetWizard()
  } catch { toast('error', 'Failed to apply plan') }
  finally { setWizardSaving(false) }
}
```

- [ ] **Step 10: Wizard modal shell + footer navigation**

```tsx
{showWizard && (
  <div className="modal-overlay" onClick={() => { if (!wizardLoading && !wizardSaving) { setShowWizard(false); resetWizard() } }}>
    <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 780, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
      <div className="modal-header">
        <div>
          <h3>✦ Smart Allocate</h3>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--c4)', fontWeight: 400 }}>
            Monthly AI-powered resource planning
          </p>
        </div>
        <button className="modal-close" onClick={() => { setShowWizard(false); resetWizard() }}>&times;</button>
      </div>
      <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
        <WizardSteps step={wizardStep} />
        {/* Step content rendered above */}
      </div>
      <div className="modal-footer">
        {wizardStep > 1 && (
          <button className="btn btn-ghost btn-sm" style={{ marginRight: 'auto' }}
            onClick={() => setWizardStep(s => (s - 1) as 1 | 2 | 3 | 4)}>← Back</button>
        )}
        <button className="btn btn-secondary" onClick={() => { setShowWizard(false); resetWizard() }} style={{ height: 44, padding: '0 24px' }}>Cancel</button>
        {wizardStep === 1 && (
          <button className="btn btn-primary" disabled={wizardSelectedProjects.size === 0}
            onClick={() => setWizardStep(2)} style={{ height: 44, padding: '0 28px' }}>
            Next: Set budgets →
          </button>
        )}
        {wizardStep === 2 && (
          <button className="btn btn-primary"
            disabled={[...wizardSelectedProjects].some(pid => !(wizardProjectMembers[pid]?.length > 0))}
            onClick={() => { setWizardStep(3); runWizardAI() }} style={{ height: 44, padding: '0 28px' }}>
            ✦ Generate Plan →
          </button>
        )}
        {wizardStep === 3 && !wizardLoading && wizardPlan.length > 0 && (
          <button className="btn btn-primary" onClick={() => setWizardStep(4)} style={{ height: 44, padding: '0 28px' }}>
            Review & Apply →
          </button>
        )}
        {wizardStep === 4 && (
          <button className="btn btn-primary" disabled={wizardSaving}
            onClick={handleWizardApply} style={{ height: 44, padding: '0 28px', fontWeight: 700 }}>
            {wizardSaving ? 'Applying…' : `Apply plan`}
          </button>
        )}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 11: Type-check**
```bash
npx tsc --noEmit
```
Fix any errors — common ones:
- `WizardSteps` defined outside component may need `import React from 'react'` or JSX transform check
- `_id` field on allocations — add to the local wizard type or use `as` cast
- `existingByWeek` return type cast — use `as ResourceAllocation[]`

- [ ] **Step 12: Commit**
```bash
git add src/views/ResourcePlanningView.tsx
git commit -m "feat: Smart Allocate wizard — 4-step monthly AI planning"
```

---

## Final step: push to production

- [ ] **Push**
```bash
git push origin main
```

- [ ] **Deploy edge function** via Supabase dashboard → Edge Functions → smart-allocator → Deploy, or:
```bash
npx supabase functions deploy smart-allocator
```

- [ ] **Apply migration** via Supabase dashboard → SQL Editor → paste and run `supabase/migrations/008_allocation_templates.sql`
