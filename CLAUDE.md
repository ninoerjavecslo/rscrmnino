# Agency Intelligence OS

## Project overview
React + TypeScript + Vite frontend for an agency management tool ("Agency Intelligence OS"). Supabase backend. Uses Tailwind CSS v4 + shadcn/ui components, with a custom CSS design system (`design-system.css`) for base layout and typography.

## Tech stack
- React 19, TypeScript (strict), Vite
- Tailwind CSS v4 via `@tailwindcss/vite`
- shadcn/ui components in `src/components/ui/` (customised to match design system)
- Zustand v5 for state management
- Supabase JS client (`src/lib/supabase.ts`) — uses `createClient<any>` intentionally (not generated types)
- React Router v7
- CSS variables in `src/design-system.css` + tokens in `src/index.css`

## Key conventions

### Components — always prefer these over raw HTML or CSS classes
- **Buttons**: `<Button>` from `@/components/ui/button` — variants: `default` (navy), `outline` (secondary), `ghost`, `destructive` (red) — sizes: `default`/`sm` (34px), `xs` (28px), `lg` (42px)
- **Badges**: `<Badge variant="...">` from `@/components/ui/badge` — variants: `green`, `amber`, `blue`, `navy`, `red`, `gray`, `secondary`
- **Cards**: `<Card>` + `<CardContent>` from `@/components/ui/card` — matches old `.card`/`.card-body` styles
- **Modals**: `<Modal>` from `src/components/Modal` — props: `open?`, `title`, `onClose`, `children`, `footer?`, `maxWidth?`
- **Delete confirmations**: `<ConfirmDialog>` from `src/components/ConfirmDialog`

### Tailwind for layout and spacing
Use Tailwind utilities instead of custom CSS classes or inline styles:
- Layout: `flex items-center justify-between px-6 py-5 bg-white border-b border-border` (page header)
- Content area: `flex-1 overflow-auto p-6`
- Section headers: `flex items-center justify-between mb-3`
- Stats grid: `grid grid-cols-4 gap-4 mb-6`
- Stat card: `bg-white rounded-[10px] border border-border p-4`
- Form group: `mb-4`
- Form row: `grid grid-cols-2 gap-4`
- Form hint: `text-xs text-muted-foreground mt-1`
- Alerts: `rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c]`

### Design tokens (CSS variables)
Still available from `design-system.css`:
`--navy`, `--green`, `--red`, `--amber`, `--blue`, `--navy-light`
`--c0` (darkest) through `--c7` (lightest) for grays

Tailwind also has: `text-primary` = navy, `text-muted-foreground` = gray, `border-border` = `#e8e3ea`

### Sidebar / layout (keep as CSS classes — don't migrate)
`sidebar`, `sidebar-nav`, `sidebar-item`, `sidebar-group-label`, `sidebar-divider`, `app-layout`, `app-main`

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

## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

**Using gstack skills.** After install, the following slash commands are available:

- `/office-hours` — CEO-style check-in
- `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/plan-devex-review` — plan reviews from different roles
- `/design-consultation`, `/design-shotgun`, `/design-html`, `/design-review` — design tooling
- `/review` — code review
- `/ship`, `/land-and-deploy`, `/canary` — release flow
- `/benchmark` — performance benchmarking
- `/browse`, `/connect-chrome`, `/setup-browser-cookies` — browsing (ALWAYS use `/browse` for web browsing — never `mcp__claude-in-chrome__*` tools)
- `/qa`, `/qa-only` — QA flows
- `/setup-deploy` — deploy setup
- `/retro` — retrospective
- `/investigate` — systematic investigation
- `/document-release` — release notes
- `/codex`, `/cso` — codex / CSO workflows
- `/autoplan` — automatic planning
- `/devex-review` — developer experience review
- `/careful`, `/freeze`, `/guard`, `/unfreeze` — safety gates
- `/gstack-upgrade` — update gstack
- `/learn` — capture learnings

Use `~/.claude/skills/gstack/...` for gstack file paths (the global path).
