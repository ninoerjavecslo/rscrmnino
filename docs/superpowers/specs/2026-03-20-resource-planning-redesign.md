# Resource Planning Redesign

**Date:** 2026-03-20
**Status:** Approved for implementation

---

## Overview

Redesign the Resource Planning page with three goals:

1. **Simplify the assign modal** — Simple/Advanced tabs replace the current single-mode form
2. **Add Smart Allocate wizard** — AI-powered 4-step wizard for monthly project planning
3. **Add allocation templates** — auto-suggest last week + named saved templates

Also removes the Weekly Advisor panel to declutter the page.

---

## 1. Remove Weekly Advisor

Remove `AdvisorPanel` and all related state from `ResourcePlanningView`:
- Remove `advisories`, `aiSummary`, `advisorLoading` state
- Remove `generateAdvisories` call and its import
- Remove `AdvisorPanel` from the render tree
- Remove the `planning-advisor` edge function call

The **buffer suggestion** banner inside the assign modal (individual member unplanned average) is **kept** — it's useful per-member context.

---

## 2. Assign Modal — Simple / Advanced Tabs

### Tab state

One `useState<'simple' | 'advanced'>` in the modal, defaulting to `'simple'`. Resets to `'simple'` every time the modal closes. There is no cross-open persistence.

### Simple tab (default)

Single entry only. Fields:

- **Type** — category dropdown (project / maintenance / internal / meeting / admin / leave)
- **Project** — shown when type is `project` or `maintenance`; dropdown of active projects
- **Label** — shown for other categories; free text
- **Hours this week** — number input + preset chips: 4h, 8h, 16h, 20h, 24h, 32h, 40h
- **Repeat weekly** — checkbox; if checked, show weeks input (default 4)
- **Billable** — checkbox (auto-checked for project/maintenance, unchecked for others)

On submit: auto-distributes hours across available days (Mon–Fri) using existing week-distribute logic.

### Advanced tab

Everything in Simple, plus:

- **Multiple entries** — "+ Add another allocation" button; each entry independently removable
- **Mode toggle per entry** — "Per week — auto split" vs "Per day — manual" (5 day inputs)
- **Deadline** — checkbox + date picker per entry
- **Per-day capacity warning** inline when day total exceeds `hours_per_day`

Both tabs share the buffer suggestion banner and capacity grid at the top of the modal.

---

## 3. Allocation Templates

### Supabase migration

New file: `supabase/migrations/<timestamp>_allocation_templates.sql`

```sql
create table if not exists allocation_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  entries    jsonb not null default '[]',
  created_at timestamptz default now()
);

-- RLS: readable and writable by authenticated users (same pattern as resource_allocations)
alter table allocation_templates enable row level security;
create policy "allow all authenticated" on allocation_templates
  for all using (true) with check (true);
```

### TypeScript types (add to `src/lib/types.ts`)

```typescript
export interface TemplateEntry {
  member_id: string
  member_name: string
  project_id: string | null
  project_label: string
  category: AllocationCategory
  weekly_hours: number
  is_billable: boolean            // matches ResourceAllocation.is_billable exactly
}

export interface AllocationTemplate {
  id: string
  name: string
  entries: TemplateEntry[]
  created_at: string
}
```

Note: `is_billable` (not `billable`) intentionally matches the DB column and `ResourceAllocation.is_billable`. The apply flow passes `entry.is_billable` directly to `addAllocationsBatch` with no mapping needed.

### `useTemplates` hook (`src/hooks/useTemplates.ts`)

```typescript
interface UseTemplatesReturn {
  templates: AllocationTemplate[]
  loading: boolean
  saveTemplate: (name: string, entries: TemplateEntry[]) => Promise<void>
  deleteTemplate: (id: string) => Promise<void>
  applyTemplate: (template: AllocationTemplate, weekStart: string, existingAllocations: ResourceAllocation[], members: TeamMember[]) => Promise<void>
}
```

- Fetch on mount (single `useEffect` on component mount, no refetch on every open)
- Optimistic delete: remove from local state immediately, revert on error
- After `saveTemplate`: append to local state (no re-fetch)
- `applyTemplate` is **additive**: does not clear existing allocations first. It distributes `entry.weekly_hours` across days with remaining capacity. If a member is inactive or not found, skip that entry and show a toast: `"Skipped {member_name} — not found in active team"`.

### Week distribution for templates and wizard (parameterized)

Extract a **pure** helper from the current `distributeWeekly` closure in `ResourcePlanningView`:

```typescript
// src/lib/distributeWeekly.ts
export function distributeWeekly(
  weekStart: string,
  memberId: string,
  weeklyHours: number,
  members: TeamMember[],
  allocations: ResourceAllocation[]   // all allocations for that week
): { date: string; hours: number }[]
```

This function takes explicit parameters instead of reading from component state. The existing `distributeWeekly` in `ResourcePlanningView` is replaced with a call to this utility. This is the same logic — just extracted so the wizard and template apply can call it for arbitrary future weeks.

### Save as template

**"💾 Save week as template"** button in the page header. Opens a small modal:

- Name input — pre-filled: `"Sprint Week {Mon date e.g. Mar 17}"`
- Preview list: current week's allocations grouped by member+project, summed per group, displayed as `"{member_name} — {project_label}: {hours}h"`
- **Save** → calls `saveTemplate(name, entries)`; closes modal; shows toast

### Apply template (Templates dropdown)

**"📋 Templates ▾"** button in page header opens a dropdown list:

- One row per saved template: name + entry count + **Apply** button + **×** delete
- **Apply**: calls `applyTemplate(template, weekStart, currentAllocations, allActive)`
- **×**: calls `deleteTemplate(id)` with optimistic update

### Auto-suggest last week (empty week banner)

Shown **only** when the current week has zero allocations across all members AND the user has not dismissed it for this week.

Dismiss flag: `sessionStorage.setItem('rp_lastweek_dismissed_<weekStart>', '1')`. Cleared automatically when `weekStart` changes (different key per week).

Logic: fetch prior week's allocations (`weekStart - 7 days`), group by `member_id + project_id`, sum hours. Display:

> 💡 **Repeat last week?** Peter 20h RS-001 · Igor 15h RS-002 — **Apply** · Dismiss

**Apply**: calls `applyTemplate` with a synthetic `AllocationTemplate` object: `{ id: '', name: 'Last week', entries: [...], created_at: '' }`. The hook only reads `template.entries` internally so the dummy `id`/`name` are harmless.

---

## 4. Smart Allocate Wizard

### Entry point

**"✦ Smart Allocate"** button in page header. Opens a modal (max-width: 780px, max-height: 90vh, scrollable body).

### Wizard state shape

```typescript
interface WizardState {
  step: 1 | 2 | 3 | 4
  month: string                          // YYYY-MM
  selectedProjectIds: Set<string>
  budgets: Record<string, number>        // project_id → hours
  projectMembers: Record<string, string[]>  // project_id → member_id[]
  // Step 3 editable grid state:
  plan: WizardWeek[]
  // Step 4:
  saveAsTemplate: boolean
  templateName: string
}

interface WizardWeek {
  week_start: string                     // YYYY-MM-DD Monday
  allocations: WizardAllocation[]
}

interface WizardAllocation {
  member_id: string
  project_id: string
  weekly_hours: number                   // user-editable
  reason: string
  category: AllocationCategory           // always 'project' for wizard-generated allocations
  is_billable: boolean                   // always true for wizard-generated allocations
}
```

State lives in the modal component. Reset on close.

### Step 1 — Pick projects

- Month selector (default: current month, `YYYY-MM` format)
- Checklist of active projects, each row: `pn — name` + deliverable count
- "Next →" disabled until ≥ 1 project checked

### Step 2 — Set budgets & team

For each selected project, one row:

- Project label
- Hours budget: number input (pre-filled: sum of `estimated_hours` from that project's active deliverables, fallback 40)
- Team members: multi-select toggle chips (all active members; at least 1 required)

Month capacity warning (non-blocking, amber): if sum of all budgets > sum of all assigned members' capacities for the month (`hours_per_day × working_days_in_month` — use 5 days/week × weeks as approximation, acknowledged as inexact).

### Step 3 — AI generates plan

Loading state: "✦ Generating allocation plan…"

**Edge function call** (see §5). On success, populate `plan: WizardWeek[]` from response, then validate:

- Coerce all `weekly_hours` values to `Number()` — AI may return strings
- Clamp to `> 0`
- Skip any allocation where `member_id` or `project_id` is not in the known sets

Display as a grid:

- Rows = members (only those assigned to ≥ 1 project)
- Columns = weeks in the month
- Each cell = list of `"{pn} {hours}h"` chips per project
- Clicking a cell opens an inline editor: per-project hour inputs for that member+week combination — updates `plan` state directly

### Step 4 — Review & apply

Summary cards: total allocated hours per project vs budget (with % filled), utilization per member.

**Apply plan** button:
1. Issue a **single** Supabase query for existing allocations covering the full month range (`date >= month_start AND date <= month_end`) — do **not** call `store.fetchAllocations()` per week as that mutates `_weekStart`/`_weekEnd` and would corrupt the page's current week view.
2. Group the fetched allocations by week (`date` falls between that week's Mon–Fri).
3. For each `WizardWeek`, for each `WizardAllocation`, call `distributeWeekly(week.week_start, alloc.member_id, alloc.weekly_hours, members, weekSlice)` where `weekSlice` is that week's pre-grouped allocations from step 2.
4. Collect all `{ date, hours }` results into batch rows (set `category: alloc.category`, `is_billable: alloc.is_billable` from the `WizardAllocation`).
5. Call `addAllocationsBatch(rows)` — this triggers a store refresh for the current week automatically.
6. Show toast with total hours applied.
7. If `saveAsTemplate` checked: call `saveTemplate(templateName, derivedEntries)` where `derivedEntries` are built by grouping plan by `member_id + project_id`, summing `weekly_hours` across weeks where that pair appears (denominator = number of weeks where the pair has `weekly_hours > 0`, not total month weeks).

**"Save as template"** checkbox + name input (pre-filled: `"{Month YYYY} Smart Plan"` e.g. `"April 2026 Smart Plan"`).

---

## 5. Edge function: `smart-allocator`

**Location:** `supabase/functions/smart-allocator/index.ts`

**Input:**
```typescript
{
  projects: Array<{
    id: string
    pn: string
    name: string
    budget_hours: number
    member_ids: string[]
    deliverables: Array<{ title: string; due_date: string | null; estimated_hours: number | null }>
  }>
  members: Array<{ id: string; name: string; hours_per_day: number; role?: string | null }>
  month_start: string          // YYYY-MM-DD, first day of month
  existing_allocations: Array<{ member_id: string; date: string; hours: number }>
}
```

**Logic:**
1. Compute weeks in the month (Mon–Fri only, 4 or 5 weeks)
2. Per member per week: available = `hours_per_day × 5 − existing_alloc_hours`
3. Build prompt with capacity table + project budgets + deliverable deadlines
4. Call Claude Sonnet 4.6 (`max_tokens: 2000`)
5. Parse JSON response — validate same as `smart-planner` (try direct parse, fallback regex `\{[\s\S]*\}`)
6. Return `{ weeks: WizardWeek[] }`

**AI output format requested in prompt:**
```json
{
  "weeks": [
    {
      "week_start": "YYYY-MM-DD",
      "allocations": [
        { "member_id": "...", "project_id": "...", "weekly_hours": 20, "reason": "..." }
      ]
    }
  ]
}
```

Constraints in prompt: never exceed member's available capacity per week; distribute across projects so each gets progress every week where possible; prioritize deliverables with closer due dates.

---

## 6. Files changed

### New
- `supabase/migrations/<timestamp>_allocation_templates.sql`
- `supabase/functions/smart-allocator/index.ts`
- `src/lib/distributeWeekly.ts` — extracted pure helper
- `src/hooks/useTemplates.ts` — template CRUD + apply logic

### Modified
- `src/lib/types.ts` — add `TemplateEntry`, `AllocationTemplate`
- `src/views/ResourcePlanningView.tsx` — remove advisor, refactor assign modal to tabs, add template + smart allocate UI; replace inline `distributeWeekly` with import from `src/lib/distributeWeekly.ts`

### Unchanged
- `src/stores/resource.ts`
- `src/lib/bufferAnalysis.ts`
- `supabase/functions/smart-planner/`
- `supabase/functions/day-advisor/`

---

## 7. Out of scope

- Template sharing between users
- Template versioning / history
- Editing deliverable estimates from within the wizard
- Drag-and-drop reordering in the wizard grid
- Public holiday / time-off awareness in capacity calculations
