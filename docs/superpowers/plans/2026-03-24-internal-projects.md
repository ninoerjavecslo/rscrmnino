# Internal Projects Feature Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `internal` (non-billable) project type, an Internal projects page with cost tracking, a settings field for internal hourly rate, and fix the Add Estimation modal dropdown.

**Architecture:** Extend `Project.type` union → propagate through all exhaustive maps → add Internal type pill to the New Project form → create `InternalView` page → add internal hourly rate to settings → replace native `<select>` in the Add Estimation modal with the existing `Select` component.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS v4, Zustand v5, Supabase JS, shadcn/ui, React Router v7.

**No test suite.** Verification step for each task is `npx tsc --noEmit` (must produce no output).

---

## Chunk 1: Core Type Extension + Map Updates

### Task 1: Extend Project.type union

**Files:**
- Modify: `src/lib/types.ts` (line 26)

- [ ] **Step 1: Add `'internal'` to the union**

In `src/lib/types.ts` line 26, change:
```ts
type: 'fixed' | 'maintenance' | 'variable'
```
to:
```ts
type: 'fixed' | 'maintenance' | 'variable' | 'internal'
```

- [ ] **Step 2: Run type check — expect errors**

```bash
npx tsc --noEmit 2>&1 | grep "error TS"
```
Expected: TS2322 errors in `RevenuePlannerView.tsx` where `Record<Project['type'], ...>` is no longer exhaustive. This confirms the cascade is working.

---

### Task 2: Fix TYPE_BADGE / TYPE_LABEL maps in all views

**Files:**
- Modify: `src/views/ProjectsView.tsx` (lines 44–49)
- Modify: `src/views/ClientDetailView.tsx` (lines 124–132)
- Modify: `src/views/RevenuePlannerView.tsx` (lines 38–43)

- [ ] **Step 1: Update `ProjectsView.tsx` maps**

Find (lines 44–49):
```ts
const TYPE_BADGE: Record<string, 'blue' | 'amber' | 'green'> = {
  fixed: 'blue', maintenance: 'amber', variable: 'green'
}
const TYPE_LABEL: Record<string, string> = {
  fixed: 'Fixed', maintenance: 'Recurring', variable: 'Variable'
}
```
Change to:
```ts
const TYPE_BADGE: Record<string, 'blue' | 'amber' | 'green' | 'gray'> = {
  fixed: 'blue', maintenance: 'amber', variable: 'green', internal: 'gray'
}
const TYPE_LABEL: Record<string, string> = {
  fixed: 'Fixed', maintenance: 'Recurring', variable: 'Variable', internal: 'Internal'
}
```

- [ ] **Step 2: Update `ClientDetailView.tsx` maps**

Find (lines 124–132):
```ts
const TYPE_BADGE: Record<string, string> = {
  fixed: 'blue',
  maintenance: 'amber',
  variable: 'green',
}
const TYPE_LABEL: Record<string, string> = {
  fixed: 'Fixed',
  maintenance: 'Recurring',
  variable: 'Variable',
}
```
Add `internal: 'gray'` to TYPE_BADGE and `internal: 'Internal'` to TYPE_LABEL.

- [ ] **Step 3: Update `RevenuePlannerView.tsx` TypeBadge function**

Find (lines 37–43):
```ts
function TypeBadge({ type }: { type: Project['type'] }) {
  const cls: Record<Project['type'], string> = {
    fixed: 'bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]',
    maintenance: 'bg-[#dbeafe] text-[#1d4ed8] border border-[#bfdbfe]',
    variable: 'bg-[#fef3c7] text-[#92400e] border border-[#fde68a]',
  }
  const labels: Record<Project['type'], string> = { fixed: 'Fixed', maintenance: 'Recurring', variable: 'Variable' }
```
Add `internal` entries to both records:
```ts
    internal: 'bg-[#f4f2f6] text-[#374151] border border-[#e8e3ea]',
```
```ts
    internal: 'Internal'
```

- [ ] **Step 4: Verify type check passes**

```bash
npx tsc --noEmit
```
Expected: no output (zero errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/views/ProjectsView.tsx src/views/ClientDetailView.tsx src/views/RevenuePlannerView.tsx
git commit -m "feat: add internal to Project.type union and update badge/label maps"
```

---

## Chunk 2: New Project Modal — Internal Type Pill

### Task 3: Add Internal pill to TypePills + form logic

**Files:**
- Modify: `src/views/ProjectsView.tsx`

- [ ] **Step 1: Add Internal to the `types` array in `TypePills` function**

Find the `types` array (lines 54–61) in the `TypePills` function:
```ts
const types = [
  { key: 'fixed',       label: 'Fixed',       sub: 'Known total', icon: <...> },
  { key: 'maintenance', label: 'Recurring',  sub: 'Monthly recurring', icon: <...> },
  { key: 'variable',    label: 'Variable',      sub: 'Hourly / usage-based', icon: <...> },
]
```
Add a 4th entry after `variable`:
```ts
{ key: 'internal', label: 'Internal', sub: 'Non-billable',
  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
```

- [ ] **Step 2: Hide client selector and value field when type is internal**

In the modal form, the client selector (lines 352–366) renders unconditionally. Wrap it:
```tsx
{form.type !== 'internal' && (
  <div className="mb-4">
    <label ...>Client</label>
    <Select ... />
    {showNewClient && ...}
  </div>
)}
```

The value field (lines 378–385) already has `{form.type !== 'variable' && (` guard. Extend it to also exclude internal:
```tsx
{form.type !== 'variable' && form.type !== 'internal' && (
```

- [ ] **Step 3: Exclude internal from `portfolioValue` calculation**

Find line 229–239:
```ts
const portfolioValue = pStore.projects
  .filter(p => p.status === 'active')
  .reduce(...)
```
Add `&& p.type !== 'internal'` to the filter:
```ts
const portfolioValue = pStore.projects
  .filter(p => p.status === 'active' && p.type !== 'internal')
  .reduce(...)
```

- [ ] **Step 4: Also exclude internal from the inline value display in the project list**

Line 307 has:
```ts
const isRecurring = p.type === 'maintenance' || p.type === 'variable'
```
This is fine — internal will have `isRecurring = false` and `initial_contract_value = null`, so the value cell shows `—` naturally. No change needed.

- [ ] **Step 5: Verify type check passes**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/views/ProjectsView.tsx
git commit -m "feat: add Internal type pill to New Project modal, hide client/value for internal"
```

---

## Chunk 3: Settings — Internal Hourly Rate

### Task 4: Add internalHourlyRate to settings store

**Files:**
- Modify: `src/stores/settings.ts`

- [ ] **Step 1: Add field and setter to the store interface**

In `src/stores/settings.ts`, add to the `SettingsState` interface:
```ts
internalHourlyRate: number
setInternalHourlyRate: (rate: number) => Promise<void>
```

- [ ] **Step 2: Add initial value and setter implementation**

Add `internalHourlyRate: 0` to the initial state object.

In `fetch()`, after the existing `set(...)` line, parse the rate:
```ts
set({
  agencyName: map['agency_name'] ?? '',
  agencyLogo: map['agency_logo'] ?? '',
  projectManagers: pms,
  internalHourlyRate: parseFloat(map['internal_hourly_rate'] ?? '0') || 0,
})
```

Add the setter after `setProjectManagers`:
```ts
setInternalHourlyRate: async (rate: number) => {
  await supabase.from('app_settings').upsert({ key: 'internal_hourly_rate', value: String(rate) })
  set({ internalHourlyRate: rate })
},
```

- [ ] **Step 3: Verify type check**

```bash
npx tsc --noEmit
```
Expected: no output.

---

### Task 5: Add internal hourly rate input to SettingsView

**Files:**
- Modify: `src/views/SettingsView.tsx`

- [ ] **Step 1: Add state for the rate input**

In `SettingsView`, the general info form uses local state for editable fields. Find where `agencyName` local state is declared and add:
```ts
const [internalRate, setInternalRate] = useState(String(settingsStore.internalHourlyRate || ''))
```
Also sync on store changes with a `useEffect`:
```ts
useEffect(() => { setInternalRate(String(settingsStore.internalHourlyRate || '')) }, [settingsStore.internalHourlyRate])
```

- [ ] **Step 2: Add number input to the General Info form**

Find the General Info card form section and add a new form group for internal cost per hour:
```tsx
<div className="mb-4">
  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">
    Internal cost / hour (€)
  </label>
  <input
    type="number"
    min={0}
    step={1}
    value={internalRate}
    onChange={e => setInternalRate(e.target.value)}
    placeholder="0"
    style={{ maxWidth: 140 }}
  />
</div>
```

- [ ] **Step 3: Save on the existing General Info save action**

Find where the General Info save button calls `settingsStore.setAgencyName(...)`. Add alongside it:
```ts
await settingsStore.setInternalHourlyRate(parseFloat(internalRate) || 0)
```

- [ ] **Step 4: Verify type check**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/stores/settings.ts src/views/SettingsView.tsx
git commit -m "feat: add internal hourly rate to settings store and UI"
```

---

## Chunk 4: Internal Page

### Task 6: Create InternalView

**Files:**
- Create: `src/views/InternalView.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSettingsStore } from '../stores/settings'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface InternalProject {
  id: string
  pn: string
  name: string
  status: string
  created_at: string
  deliverables: Array<{ estimated_hours: number | null; status: string; team: string | null }>
}

export function InternalView() {
  const settingsStore = useSettingsStore()
  const [projects, setProjects] = useState<InternalProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    settingsStore.fetch()
    supabase
      .from('projects')
      .select('id, pn, name, status, created_at, deliverables:project_deliverables(estimated_hours, status, team)')
      .eq('type', 'internal')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProjects((data ?? []) as InternalProject[])
        setLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rate = settingsStore.internalHourlyRate

  const stats = useMemo(() => {
    const activeCount = projects.filter(p => p.status === 'active').length
    let totalHours = 0
    projects.forEach(p => {
      p.deliverables
        .filter(d => d.status !== 'completed')
        .forEach(d => { totalHours += d.estimated_hours ?? 0 })
    })
    return { activeCount, totalHours, cost: totalHours * rate }
  }, [projects, rate])

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Internal Projects</h1>
          <p>Non-billable internal work and initiatives.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="px-6 py-5">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px] mb-2">Active Projects</div>
              <div className="text-[32px] font-extrabold text-foreground font-[Manrope,sans-serif] leading-none">
                {stats.activeCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-6 py-5">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px] mb-2">Estimated Hours</div>
              <div className="text-[32px] font-extrabold text-foreground font-[Manrope,sans-serif] leading-none">
                {stats.totalHours.toLocaleString()}
                <span className="text-base font-medium text-muted-foreground ml-1.5">h</span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">Active deliverables only</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-6 py-5">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px] mb-2">Internal Cost</div>
              <div className="text-[32px] font-extrabold text-foreground font-[Manrope,sans-serif] leading-none">
                {stats.cost > 0 ? `${stats.cost.toLocaleString()} €` : rate === 0 ? <span className="text-base text-muted-foreground">Set rate in Settings</span> : '—'}
              </div>
              {rate > 0 && <div className="text-xs text-muted-foreground mt-2">@ {rate} €/h</div>}
            </CardContent>
          </Card>
        </div>

        {/* Project list */}
        <Card>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading…</div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No internal projects yet. Create one from Projects → New Project → Internal.</div>
          ) : (
            <table style={{ width: '100%' }}>
              <thead>
                <tr className="bg-[var(--c7)]">
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px]">#</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px]">Project</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px]">Status</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px]">Est. Hours</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px]">Cost</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px]">Teams</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => {
                  const activeDelivs = p.deliverables.filter(d => d.status !== 'completed')
                  const hours = activeDelivs.reduce((s, d) => s + (d.estimated_hours ?? 0), 0)
                  const cost = hours * rate
                  const teams = [...new Set(activeDelivs.flatMap(d => d.team ? d.team.split(',').map(t => t.trim()) : []))].filter(Boolean)
                  return (
                    <tr key={p.id} className="border-t border-[var(--c6)] hover:bg-[var(--c7)] transition-colors">
                      <td className="px-4 py-3 text-[12px] text-muted-foreground font-mono">{p.pn}</td>
                      <td className="px-4 py-3">
                        <Link to={`/projects/${p.id}`} className="font-semibold text-[14px] text-foreground no-underline hover:underline">{p.name}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={p.status === 'active' ? 'green' : p.status === 'paused' ? 'amber' : 'gray'}>{p.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-[14px] font-semibold">{hours > 0 ? `${hours}h` : '—'}</td>
                      <td className="px-4 py-3 text-right text-[14px] font-semibold">{cost > 0 ? `${cost.toLocaleString()} €` : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {teams.map(t => <Badge key={t} variant="secondary">{t}</Badge>)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify type check**

```bash
npx tsc --noEmit
```
Expected: no output.

---

### Task 7: Register route and add sidebar nav link

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add import and route in `App.tsx`**

Add import alongside the other view imports (alphabetical order, near P):
```ts
import { InternalView } from './views/InternalView'
```

Add route inside the nested Routes, after the `/projects/:id` route:
```tsx
<Route path="/internal" element={<InternalView />} />
```

- [ ] **Step 2: Add nav link in `Sidebar.tsx`**

Find the "Clients & Projects" nav group (line ~69–73):
```tsx
<div className="sidebar-group-label">Clients &amp; Projects</div>
<NavLink to="/clients"       className={nav}><IconUsers />    Clients</NavLink>
<NavLink to="/projects"      className={nav}><IconBriefcase /> Projects</NavLink>
<NavLink to="/maintenances"  className={nav}><IconTool /> Maintenances</NavLink>
<NavLink to="/sales"         className={nav}><IconTarget /> Sales</NavLink>
```
Add "Internal" after "Projects":
```tsx
<NavLink to="/internal" className={nav}><IconGrid /> Internal</NavLink>
```
`IconGrid` is already defined in the file (line 18).

- [ ] **Step 3: Verify type check**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/views/InternalView.tsx src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: add Internal projects page, route, and sidebar nav"
```

---

## Chunk 5: Add Estimation Modal — Dropdown Fix + New Project

### Task 8: Replace native select with Select component in ResourceYearlyView

**Files:**
- Modify: `src/views/ResourceYearlyView.tsx`

- [ ] **Step 1: Import Select component**

The file already imports `useProjectsStore`. Add `Select` import:
```ts
import { Select } from '../components/Select'
```

- [ ] **Step 2: Replace the native `<select>` block**

Find in the modal (lines ~551–565):
```tsx
<select
  value={estProjectId}
  onChange={e => setEstProjectId(e.target.value)}
  className="w-full"
>
  <option value="">Select project…</option>
  {projectsStore.projects
    .filter(p => p.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => (
      <option key={p.id} value={p.id}>{p.name}</option>
    ))}
</select>
```
Replace with:
```tsx
<Select
  value={estProjectId}
  onChange={v => {
    if (v === '__new__') { setShowNewProjModal(true) }
    else { setEstProjectId(v) }
  }}
  placeholder="Select project…"
  options={[
    ...projectsStore.projects
      .filter(p => p.status === 'active')
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(p => ({ value: p.id, label: p.name })),
    { value: '__new__', label: '+ New project…' },
  ]}
/>
```

- [ ] **Step 3: Add state for new project modal**

After the existing `estSaving` state, add:
```ts
const [showNewProjModal, setShowNewProjModal] = useState(false)
const [newProjName, setNewProjName] = useState('')
const [newClientName, setNewClientName] = useState('')
const [newProjSaving, setNewProjSaving] = useState(false)
```

- [ ] **Step 4: Add `saveNewProject` function**

After `saveEstimation()`, add:
```ts
async function saveNewProject() {
  if (!newProjName.trim() || !newClientName.trim()) return
  setNewProjSaving(true)
  const { data: client, error: ce } = await supabase
    .from('clients').insert({ name: newClientName.trim(), status: 'active' }).select('id').single()
  if (ce) { toast('error', 'Failed to create client'); setNewProjSaving(false); return }
  const allProjects = projectsStore.projects
  const year = new Date().getFullYear()
  const prefix = `RS-${year}-`
  const nums = allProjects.map(p => p.pn).filter(pn => pn.startsWith(prefix))
    .map(pn => parseInt(pn.slice(prefix.length), 10)).filter(n => !isNaN(n))
  const pn = `${prefix}${String((nums.length > 0 ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
  const { data: proj, error: pe } = await supabase
    .from('projects').insert({
      pn, name: newProjName.trim(), client_id: client.id,
      type: 'fixed', status: 'active', pm: 'Nino', currency: 'EUR',
    }).select('id').single()
  if (pe) { toast('error', 'Failed to create project'); setNewProjSaving(false); return }
  await projectsStore.fetchAll()
  setEstProjectId(proj.id)
  setShowNewProjModal(false)
  setNewProjName(''); setNewClientName('')
  setNewProjSaving(false)
  toast('success', 'Project created')
}
```

- [ ] **Step 5: Add the new project modal JSX**

After the closing `)}` of the existing `showEstModal` block (but still inside the outer `<>`), add:
```tsx
{showNewProjModal && (
  <Modal title="New Project" maxWidth={420} onClose={() => { setShowNewProjModal(false); setNewProjName(''); setNewClientName('') }}>
    <div className="mb-4">
      <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project name</label>
      <input value={newProjName} onChange={e => setNewProjName(e.target.value)} placeholder="e.g. Petrol — Prenova" autoFocus />
    </div>
    <div className="mb-4">
      <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Client name</label>
      <input value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="e.g. Petrol d.o.o." />
    </div>
    <div className="flex gap-2 justify-end mt-5">
      <Button variant="outline" size="sm" onClick={() => { setShowNewProjModal(false); setNewProjName(''); setNewClientName('') }}>Cancel</Button>
      <Button size="sm" disabled={!newProjName.trim() || !newClientName.trim() || newProjSaving} onClick={saveNewProject}>
        {newProjSaving ? 'Creating…' : 'Create & Select'}
      </Button>
    </div>
  </Modal>
)}
```

- [ ] **Step 6: Import useClientsStore (needed for cache refresh)**

Actually `saveNewProject` calls `projectsStore.fetchAll()` which is enough — no clients store needed here.

- [ ] **Step 7: Verify type check**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/views/ResourceYearlyView.tsx
git commit -m "feat: replace native select with Select component in estimation modal, add new project flow"
```

---

## Chunk 6: Filters for Existing Views

### Task 9: Add `type !== 'internal'` guards to existing views

**Files:**
- Modify: `src/views/StatisticsView.tsx` (line 204)
- Modify: `src/views/DashboardView.tsx` (line 144)

- [ ] **Step 1: StatisticsView — exclude internal from activeProjects**

Find line 204:
```ts
const activeProjects = useMemo(() => projects.filter(p => p.status === 'active'), [projects])
```
Change to:
```ts
const activeProjects = useMemo(() => projects.filter(p => p.status === 'active' && p.type !== 'internal'), [projects])
```

- [ ] **Step 2: DashboardView — exclude internal from activeProjects**

Find line 144:
```ts
const activeProjects = pStore.projects.filter(p => p.status === 'active')
```
Change to:
```ts
const activeProjects = pStore.projects.filter(p => p.status === 'active' && p.type !== 'internal')
```

- [ ] **Step 3: ForecastView — internal projects are not selectable anyway** (RevenuePlanner drives forecast, and internal projects won't have revenue planner rows). No code change needed.

- [ ] **Step 4: Verify type check**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/views/StatisticsView.tsx src/views/DashboardView.tsx
git commit -m "feat: exclude internal projects from stats and dashboard active project counts"
```

---

## Final Verification

- [ ] **Run full type check**

```bash
npx tsc --noEmit
```
Expected: no output (zero errors).

- [ ] **Manual smoke test checklist**
  - [ ] Projects → New Project → select Internal: client selector hidden, value hidden
  - [ ] Create an internal project, verify it appears with INTERNAL gray badge in project list
  - [ ] Internal page (`/internal`) loads, shows stats and project list
  - [ ] Settings → save internal hourly rate → Internal page shows cost
  - [ ] Yearly planning → Add Estimation → dropdown is styled (not native) → "+ New project…" opens modal
  - [ ] Create project from estimation modal → auto-selects in dropdown
  - [ ] Dashboard: internal projects not counted in active projects
  - [ ] Statistics: internal projects not counted
