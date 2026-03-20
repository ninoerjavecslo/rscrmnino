# Agency Intelligence OS

## Project overview
React + TypeScript + Vite frontend for an agency management tool ("Agency Intelligence OS"). Supabase backend. No Tailwind — custom CSS design system only.

## Tech stack
- React 19, TypeScript (strict), Vite
- Zustand v5 for state management
- Supabase JS client (`src/lib/supabase.ts`) — uses `createClient<any>` intentionally (not generated types)
- React Router v7
- Custom CSS variables in `src/design-system.css`

## Key conventions

### CSS classes
Use existing classes from `design-system.css`. Never add inline styles for things already covered:
- Layout: `page-header`, `page-content`, `app-layout`, `app-main`
- Cards: `card`, `card-body`
- Stats: `stats-strip`, `stat-card`, `stat-card-label`, `stat-card-value`, `stat-card-sub`
- Sections: `section-bar`
- Badges: `badge`, `badge-green`, `badge-blue`, `badge-navy`, `badge-amber`, `badge-gray`, `badge-red`
- Forms: `form-group`, `form-label`, `form-row`, `form-hint`
- Buttons: `btn`, `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-sm`, `btn-xs`
- Tables: `th-right`, `td-right`, `text-mono`, `table-link`
- Alerts: `alert`, `alert-red`, `alert-amber`
- Modals: `modal-overlay`, `modal-box`, `modal-header`, `modal-body`, `modal-footer`, `modal-close`
- Sidebar: `sidebar`, `sidebar-nav`, `sidebar-item`, `sidebar-group-label`, `sidebar-divider`

### CSS variables
`--navy`, `--green`, `--red`, `--amber`, `--blue`, `--navy-light`
`--c0` (darkest) through `--c7` (lightest) for grays

### Stores (Zustand)
All stores in `src/stores/`. Pattern: `useXxxStore()`. Key stores:
- `useClientsStore` — clients CRUD
- `useProjectsStore` — projects CRUD
- `useInfraStore` — hosting clients + infra costs; has `addHostingClient`, `updateHostingClient`, `addInfraCost`
- `useDomainsStore` — domain tracking; has `addDomains`, `byClient()`, `critical()`, `warningSoon()`
- `useRevenuePlannerStore` — monthly invoice planning; has `fetchByMonths`, `upsert`
- `useToastStore` — toast notifications (use `toast()` helper from `src/lib/toast.ts`)
- `usePipelineStore` — sales pipeline; has `fetchByClient`, `fetchAll`, `add`, `update`, `remove`
- `useChangeRequestsStore` — change requests; has `fetchByProject`, `fetchByMaintenance`, `fetchAllApproved`, `fetchAllPending`
- `useMaintenancesStore` — maintenance contracts CRUD
- `useResourceStore` — team members + resource plans
- `useAutomationsStore` — automated email reporting CRUD
- `useSettingsStore` — agency-wide settings
- `useRemindersStore` — reminder rules CRUD

### Toast notifications
```ts
import { toast } from '../lib/toast'
toast('success', 'Message')
toast('error', 'Error message')
toast('info', 'Info message')
```
Always add toast feedback to user-initiated async actions (save, delete, etc.).

### Types
Defined in `src/lib/types.ts`. Key interfaces: `Client`, `Project`, `Invoice`, `HostingClient`, `InfrastructureCost`, `Domain`, `RevenuePlanner`, `TimesheetEntry`, `PipelineItem`, `ChangeRequest`, `Maintenance`, `TeamMember`, `ResourcePlan`, `Automation`, `ReminderRule`.

`RevenuePlanner.status` values: `'planned' | 'paid' | 'issued' | 'retainer' | 'cost'`

### Change request workflow
Three-stage status: `pending → approved → confirmed`. Confirmed CRs are excluded from pipeline/forecast views — only pending and approved appear there.

### Project types
Projects have a `type` field: `'fixed' | 'maintenance' | 'variable'`. Matters for revenue calculations and the SalesView won-deal flow (each type creates a different project structure).

### Date conventions
- Dates stored as `YYYY-MM-DD` strings in Supabase
- Month pickers: `type="month"` returns `YYYY-MM` → append `-01` before storing
- Always use `new Date(str + 'T00:00:00')` to avoid timezone issues

### Forms
- Don't use a framework (no react-hook-form). Simple `useState` per form.
- Pattern for edit forms: local state initialised from existing record, save on submit.

## Routes
- `/` → redirects to `/dashboard`
- `/dashboard` — DashboardView (entry point)
- `/this-month` — ThisMonthView (invoice actions for current month)
- `/automations` — AutomationsView; `/automations/new`, `/automations/:id/edit` — AutomationFormView
- `/planning` — RevenuePlannerView (multi-month invoice planning)
- `/forecast` — ForecastView
- `/clients`, `/clients/:id` — ClientsView, ClientDetailView
- `/projects`, `/projects/:id` — ProjectsView, ProjectDetailView
- `/maintenances` — MaintenancesView; `/maintenances/:id` — MaintenanceDetailView
- `/sales` — SalesView (pipeline + won-deal workflow)
- `/stats` — StatisticsView
- `/infrastructure` — InfrastructureView (hosting revenue + provider costs)
- `/domains` — DomainsView
- `/tools`, `/tools/timesheet`
- `/email-tool` — EmailToolView
- `/settings` — SettingsView
- `/pixel` — PixelView

## Build
```bash
npm run dev      # dev server
npm run build    # production build
npx tsc --noEmit # type check only
```

TypeScript strict mode — TS6133 (unused variables) breaks the build. Never declare a variable without using it.

## Owner
Nino — admin, PM role defaults to "Nino" in project forms.
