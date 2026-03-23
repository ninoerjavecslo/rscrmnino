# Internal Projects & Estimation Modal — Design Spec

Date: 2026-03-24 (revised)

## Overview

1. Fix Add Estimation dropdown in `ResourceYearlyView.tsx` (native → Select component)
2. Add "Create new project" button in estimation modal (opens New Project modal)
3. Add `internal` project type to the New Project modal (4th pill, no client/value)
4. New `/internal` page with stats + project list
5. Add internal hourly rate to Settings
6. Update all views that have exhaustive `Project.type` maps

---

## 1. Add Estimation Modal — Dropdown Fix

**File:** `src/views/ResourceYearlyView.tsx`

Replace the native `<select>` for project selection with the `Select` component (`src/components/Select.tsx`). Options: all `projectsStore.projects` with `status === 'active'`, sorted alphabetically. Add a `"+ New project…"` item that opens a nested New Project modal.

---

## 2. "Create New Project" From Estimation Modal

**File:** `src/views/ResourceYearlyView.tsx`

Clicking `"+ New project…"` in the project dropdown opens the same New Project modal (reuse `ProjectsView`'s new-project form as a shared `NewProjectModal` component, or replicate inline in `ResourceYearlyView`). On save, refresh `projectsStore.fetchAll()` and auto-select the new project.

---

## 3. Internal Project Type

### New Project Modal (`src/views/ProjectsView.tsx`)

Add "Internal" as the 4th type card, after Variable:
```
[ Fixed ]  [ Recurring ]  [ Variable ]  [ Internal ]
```
- Icon: a simple house or tool icon (or just a building/internal icon)
- Label: "Internal"
- Subtitle: "Non-billable"

When `type === 'internal'` is selected:
- Hide the **CLIENT** selector
- Hide the **PROJECT VALUE (€)** field
- `client_id` is not sent in the insert payload (null)
- `initial_contract_value` is not sent (null/0)

All other fields (PN auto-generated, Project Name, Project Manager) remain identical.

**Insert payload for internal:** `{ name, type: 'internal', status: 'active', pn, pm, currency: 'EUR', client_id: null }`

### Type union (`src/lib/types.ts`)
```ts
type: 'fixed' | 'maintenance' | 'variable' | 'internal'
```

### Views that need TYPE_BADGE / TYPE_LABEL map updates (add `internal: 'gray'` / `'Internal'`):
- `src/views/ProjectsView.tsx` — `TYPE_BADGE`, `TYPE_LABEL` maps + `TypePills`
- `src/views/ProjectDetailView.tsx` — local `TypeBadge` map
- `src/views/ClientDetailView.tsx` — local type badge map
- `src/views/RevenuePlannerView.tsx` — local `TypeBadge` function (Record<Project['type'], string>)
- `src/views/StatisticsView.tsx` — add explicit `type !== 'internal'` guard on project counts

### Views that must filter out internal projects:
- `src/views/ForecastView.tsx` — add `type !== 'internal'` to project selectors/sums
- `src/views/RevenuePlannerView.tsx` — filter project selectors
- `src/views/DashboardView.tsx` — exclude from project counts/sums
- `src/views/ProjectsView.tsx` — `portfolioValue` excludes internal (`type !== 'internal'`)

---

## 4. Internal Page (`/internal`)

**Files:** `src/views/InternalView.tsx` (new), `src/App.tsx` (add `<Route path="/internal" element={<InternalView />} />`), sidebar nav

### Stats strip (3 cards):
- **Total projects** — count of `type === 'internal'` and `status === 'active'`
- **Estimated hours** — sum of `project_deliverables.estimated_hours` (status ≠ 'completed', filtered client-side) across all internal project IDs; null hours count as 0
- **Internal cost** — estimated hours × `internalHourlyRate` from settings (€)

### Project list table:
Columns: Project name (link to `/projects/:id`), Status badge, Estimated hours (sum of active deliverables), Internal cost (hrs × rate), Team (comma-separated text from deliverable team fields)

Fetch:
```ts
supabase.from('projects')
  .select('*, deliverables:project_deliverables(estimated_hours, status, team)')
  .eq('type', 'internal')
```
Filter deliverables client-side: `d.status !== 'completed'`.

### Sidebar: add "Internal" link under the Projects group.

---

## 5. Settings — Internal Hourly Rate

**Files:** `src/stores/settings.ts`, `src/views/SettingsView.tsx`

Store addition:
```ts
internalHourlyRate: number   // default 0
setInternalHourlyRate: (rate: number) => Promise<void>
```

- `fetch()`: read `map['internal_hourly_rate']`, `parseFloat(value) || 0`
- `setInternalHourlyRate()`: upsert `{ key: 'internal_hourly_rate', value: String(rate) }`, then `set({ internalHourlyRate: rate })`

SettingsView General Info card: number input labeled **"Internal cost / hour (€)"**, `type="number"`, `min=0`, `step=1`.

---

## What Is NOT Changed

- `project_deliverables` schema — no changes
- Resource allocation categories — `'internal'` already exists in `AllocationCategory`
- Sales/Pipeline — internal projects excluded by type
- Yearly estimation — internal projects can be selected (they appear in active projects list)
