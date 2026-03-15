# Agency Intelligence OS — Functional & Technical Specification

**Product Version:** 1.0
**Last Updated:** 2026-03-15
**Status:** Production-ready core, ongoing feature development

---

## 1. Product Overview

**Agency Intelligence OS** is a comprehensive studio/agency management platform designed for creative services agencies to streamline project delivery, revenue planning, and operational intelligence. It provides real-time visibility into project portfolios, recurring revenue streams, infrastructure costs, and pipeline forecasting—enabling studio managers and executives to make data-driven business decisions.

### Core Value Proposition
- **Single source of truth** for all client projects, hosting contracts, maintenance agreements, and domain registrations
- **Revenue planning** across multiple contract types (fixed, variable, recurring) with probability-weighted forecasting
- **Cost & margin tracking** for hosting infrastructure paired against SaaS revenue
- **Operational alerts** for expiring contracts, domains, and pending invoices
- **CEO dashboard** with print-friendly monthly summaries for stakeholder reporting

### Target Users
- Studio owners / CEOs (strategic planning, financial reporting)
- Project managers (project tracking, revenue planning)
- Finance/accounting (invoice management, cost tracking)
- Operations (domain & contract renewal management)

---

## 2. Architecture

### 2.1 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | React (with TypeScript) | 19.x |
| Type Safety | TypeScript (strict mode) | 5.x |
| Build Tool | Vite | 7.x |
| State Management | Zustand | 5.x |
| Backend | Supabase (Postgres) | 2.x |
| Routing | React Router | 7.x |
| Charting | Recharts | 3.x |
| CSS | Custom CSS variables (no Tailwind) | — |

### 2.2 Folder Structure

```
src/
├── components/          # Reusable UI components
│   ├── layout/Sidebar.tsx
│   ├── Select.tsx
│   └── Toaster.tsx
├── stores/             # Zustand state management
│   ├── clients.ts
│   ├── projects.ts
│   ├── changeRequests.ts
│   ├── revenuePlanner.ts
│   ├── infrastructure.ts
│   ├── domains.ts
│   ├── maintenances.ts
│   ├── pipeline.ts
│   ├── timesheet.ts
│   └── settings.ts
├── views/              # Page components (routing targets)
│   ├── DashboardView.tsx
│   ├── ThisMonthView.tsx
│   ├── RevenuePlannerView.tsx
│   ├── ClientsView.tsx
│   ├── ClientDetailView.tsx
│   ├── ProjectsView.tsx
│   ├── ProjectDetailView.tsx
│   ├── MaintenancesView.tsx
│   ├── InfrastructureView.tsx
│   ├── DomainsView.tsx
│   ├── StatisticsView.tsx
│   ├── ForecastView.tsx
│   ├── SalesView.tsx
│   ├── CeoSummaryView.tsx
│   ├── EmailToolView.tsx
│   ├── OutboxView.tsx
│   └── SettingsView.tsx
├── lib/
│   ├── types.ts        # TypeScript interfaces (mirrors Supabase schema)
│   ├── supabase.ts     # Supabase client initialization
│   └── toast.ts        # Toast notification helper
├── design-system.css   # All CSS variables and component classes
├── App.tsx             # Router and main layout
└── main.tsx
```

### 2.3 State Management Pattern

All state is managed via **Zustand v5** stores. Each store:
- Is a singleton instance: `create<StoreType>((set, get) => ({...}))`
- Exports a single custom hook: `useXxxStore()`
- Manages domain-specific data with async Supabase actions
- Handles fetch, insert, update, delete operations

### 2.4 Routes

| Path | Component | Notes |
|------|-----------|-------|
| `/` | redirect | → `/dashboard` |
| `/dashboard` | DashboardView | Entry point |
| `/this-month` | ThisMonthView | Monthly invoice actions |
| `/planning` | RevenuePlannerView | Multi-month planning |
| `/clients` | ClientsView | Client list |
| `/clients/:id` | ClientDetailView | Client workspace (tabbed) |
| `/projects` | ProjectsView | Project list |
| `/projects/:id` | ProjectDetailView | Project detail + CRs |
| `/maintenances` | MaintenancesView | Maintenance contracts |
| `/maintenances/:id` | MaintenanceDetailView | Contract detail |
| `/sales` | SalesView | Pipeline management |
| `/stats` | StatisticsView | Business intelligence |
| `/infrastructure` | InfrastructureView | Hosting revenue + costs |
| `/domains` | DomainsView | Domain tracking |
| `/forecast` | ForecastView | Revenue forecast |
| `/tools` | ToolsView | Tool launcher |
| `/tools/timesheet` | TimesheetView | Time tracking |
| `/email-tool` | EmailToolView | Email generator |
| `/outbox` | OutboxView | Email queue |
| `/ceo` | CeoSummaryView | Standalone print view |
| `/settings` | SettingsView | App configuration |

---

## 3. Data Model

All tables use `id` (UUID) as primary key. Dates stored as `YYYY-MM-DD` strings.

### 3.1 clients

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | TEXT | Required |
| email | TEXT | |
| phone | TEXT | |
| address | TEXT | |
| vat_id | TEXT | VAT/tax number |
| notes | TEXT | |
| contact_person | TEXT | Primary contact name |
| contact_email | TEXT | Primary contact email |
| contact_phone | TEXT | Primary contact phone |
| created_at | TIMESTAMP | Auto |
| updated_at | TIMESTAMP | Auto |

### 3.2 projects

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| client_id | UUID | FK → clients |
| pn | TEXT | Project number |
| name | TEXT | Required |
| type | ENUM | fixed \| maintenance \| variable |
| status | ENUM | active \| paused \| completed \| cancelled |
| pm | TEXT | Project manager name |
| contract_value | DECIMAL | Current (editable) |
| initial_contract_value | DECIMAL | Historical (set once, never updated) |
| currency | TEXT | Default EUR |
| start_date | DATE | |
| end_date | DATE | |
| notes | TEXT | |
| contract_url | TEXT | Link to contract |

**Business rule:** `initial_contract_value` is set at creation from `contract_value` and never overwritten.

### 3.3 change_requests

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| project_id | UUID | FK → projects |
| title | TEXT | Required |
| description | TEXT | |
| status | ENUM | pending \| approved \| billed |
| amount | DECIMAL | |
| notes | TEXT | `'auto_extra'` = auto-generated on invoice overage |
| probability | INT | 25 \| 50 \| 100 |
| deal_type | ENUM | one_time |
| expected_month | DATE | YYYY-MM-01 |
| expected_end_month | DATE | YYYY-MM-01 |
| monthly_schedule | JSONB | [{month, amount}] |
| created_at | TIMESTAMP | Auto |

### 3.4 maintenances

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| client_id | UUID | FK → clients |
| name | TEXT | Contract name |
| monthly_retainer | DECIMAL | Monthly amount |
| help_requests_included | INT | Support tickets/month |
| hours_included | INT | Dev hours/month |
| contract_start | DATE | YYYY-MM-DD |
| contract_end | DATE | YYYY-MM-DD or null (open-ended) |
| contract_url | TEXT | |
| status | ENUM | active \| paused \| cancelled |
| notes | TEXT | |

### 3.5 hosting_clients

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| client_id | UUID | FK → clients |
| project_pn | TEXT | Reference |
| description | TEXT | Service description |
| cycle | ENUM | monthly \| yearly |
| amount | DECIMAL | Per cycle |
| billing_since | DATE | |
| next_invoice_date | DATE | |
| status | ENUM | active \| paused \| cancelled |
| maintenance_id | UUID | FK → maintenances (optional) |
| accounting_email | BOOL | |
| contract_id | TEXT | |
| contract_expiry | DATE | |
| cancelled_from | DATE | |
| notes | TEXT | |

### 3.6 infrastructure_costs

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| provider | TEXT | e.g. AWS, Cloudflare |
| description | TEXT | |
| monthly_cost | DECIMAL | |
| billing_cycle | ENUM | monthly \| annual \| variable |
| status | ENUM | active \| inactive |
| notes | TEXT | |

### 3.7 domains

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| client_id | UUID | FK → clients |
| project_pn | TEXT | |
| domain_name | TEXT | Full domain |
| registered_date | DATE | |
| expiry_date | DATE | Required for alerts |
| yearly_amount | DECIMAL | |
| contract_id | TEXT | Registrar reference |
| registrar | TEXT | |
| auto_renew | BOOL | Default true |
| billable | BOOL | |
| accounting_email | BOOL | |
| archived | BOOL | Soft delete |
| notes | TEXT | |

**Status (computed client-side):** expired (<0 days) | expiring_soon (0–30 days) | active (31+ days)

### 3.8 revenue_planner

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| project_id | UUID | FK → projects (optional) |
| maintenance_id | UUID | FK → maintenances (optional) |
| hosting_client_id | UUID | FK → hosting_clients (optional) |
| domain_id | UUID | FK → domains (optional) |
| month | DATE | YYYY-MM-01 |
| planned_amount | DECIMAL | Expected invoice |
| actual_amount | DECIMAL | Confirmed invoice (when issued/paid) |
| status | ENUM | planned \| issued \| paid \| retainer \| cost \| deferred |
| probability | INT | 25 \| 50 \| 75 \| 100 |
| notes | TEXT | `CR:` prefix = linked to change request |
| description | TEXT | |

**Status semantics:**
- `planned` — pending invoice creation
- `issued` — invoice sent, awaiting payment
- `paid` — payment received
- `retainer` — recurring, not shown as "invoice to issue"
- `cost` — infrastructure cost offset (excluded from revenue)
- `deferred` — moved to future month

### 3.9 pipeline_items

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| client_id | UUID | FK → clients (optional) |
| company_name | TEXT | Free-text for prospects |
| title | TEXT | Required |
| description | TEXT | |
| estimated_amount | DECIMAL | |
| probability | INT | 10 \| 25 \| 50 \| 75 \| 90 |
| deal_type | ENUM | one_time \| monthly \| fixed |
| expected_month | DATE | YYYY-MM-01 |
| expected_end_month | DATE | YYYY-MM-01 |
| monthly_schedule | JSONB | [{month, amount}] |
| status | ENUM | proposal \| won \| lost |
| notes | TEXT | |
| created_at | TIMESTAMP | Auto |

### 3.10 timesheet_entries

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | |
| month | DATE | YYYY-MM-01 |
| project_pn | TEXT | |
| project_name | TEXT | Denormalized |
| description | TEXT | |
| hours | DECIMAL | |
| allocation_pct | INT | % of full-time |
| total_month_hours | INT | Available hours |
| ai_generated | BOOL | AI-suggested flag |

### 3.11 app_settings

| Column | Type | Notes |
|--------|------|-------|
| key | TEXT | PK |
| value | TEXT | JSON-encoded if complex |

**Keys:** `agency_name`, `project_managers`

---

## 4. Feature Modules

### 4.1 Dashboard

**Route:** `/dashboard`

Quick-links grid + "Invoices to Issue This Month" table + alerts section.

**Quick Links:** This Month, Invoice Plan, Clients, Projects, Forecast

**Alerts (conditional):**
- Domains expiring ≤30 days (amber/red)
- Maintenance contracts expiring ≤30 days (amber)
- Hosting contracts expiring ≤30 days (amber)

**Business rules:**
- Critical domain: 0–7 days (red), Warning: 8–30 days (amber)

---

### 4.2 This Month

**Route:** `/this-month`

Monthly invoice workflow. Shows all `revenue_planner` rows for current month with status `planned` or `retainer`. Allows inline edit of amount + probability, quick confirm to `issued`.

---

### 4.3 Invoice Plan (Revenue Planner)

**Route:** `/planning`

6-month matrix (H1 or H2) showing all projects × months. Each cell is a revenue_planner row with inline edit. Cell background color by status:
- Paid/Issued = light blue
- Planned = light amber (varies by probability)
- Retainer = light orange
- Deferred = light red/strikethrough

Multiple rows per project/month are aggregated: sum amounts, take minimum probability, take highest-rank status.

---

### 4.4 Clients

**Route:** `/clients` and `/clients/:id`

**ClientsView:** Table of all clients with YTD invoiced amount. YTD = sum of issued/paid revenue_planner rows for that client's projects/maintenances/hosting/domains.

**ClientDetailView:** Tabbed workspace:
1. **Overview** — client info card, stats, alerts
2. **Projects** — project table
3. **Infrastructure** — domains + hosting
4. **Maintenances** — maintenance contracts
5. **Invoices** — full invoice history
6. **Pipeline** — pipeline items for this client

---

### 4.5 Projects

**Route:** `/projects` and `/projects/:id`

**ProjectsView:** Table with type/status badges, contract values.

**ProjectDetailView:** 6-stat strip (Initial Value, Total Value, Actual Invoiced, Change Requests, Costs, Left to Invoice) + Invoice Plans table + Change Requests section.

**Revenue calculations:**
```
effectiveBudget:
  - maintenance/variable: sum of regularInvoiceRows (non-CR, non-cost)
  - fixed: initial_contract_value ?? contract_value

totalValue = effectiveBudget + crApprovedTotal

leftToInvoice = max(0, totalValue - totalInvoiced)

invoicedPct = totalInvoiced / totalValue × 100  (shown as "% of total")
```

**Change Request flow:** pending → approved → billed
Auto-extra CRs (notes='auto_extra'): created when actual > planned on confirm; read-only, no edit/delete.

---

### 4.6 Maintenances

**Route:** `/maintenances` and `/maintenances/:id`

On create/update: upserts monthly retainer rows in revenue_planner for each month in contract range. Preserves issued/paid/deferred rows. Deletes and regenerates planned rows.

Supports `?edit=<id>` query param for deep-linking from ClientDetailView.

---

### 4.7 Infrastructure

**Route:** `/infrastructure`

KPIs: Hosting MRR, Infrastructure costs, Gross margin, Margin %.

```
monthlyEquiv(h) = h.cycle === 'monthly' ? h.amount : h.amount / 12
margin = hostingMRR - totalMonthlyCosts
```

---

### 4.8 Domains

**Route:** `/domains`

Bulk add (multi-row form). Table with expiry status badges. Alerts for expiring ≤30 days.

---

### 4.9 Statistics

**Route:** `/stats`

Business intelligence: YTD revenue, monthly bar chart (Recharts), project type pie, top clients by revenue, maintenance contracts KPIs, pipeline stats.

---

### 4.10 CEO Monthly Summary

**Route:** `/ceo` (standalone, no sidebar)

Print-friendly monthly financial report. Sections:
1. Header with month navigation (past + future)
2. Stats strip (Planned, Issued, Pending)
3. Project invoices (grouped, sorted by status)
4. Maintenance retainers
5. Hosting (combined total + MRR)
6. Domains
7. Grand total bar

---

### 4.11 Forecast

**Route:** `/forecast`

12-month view combining confirmed revenue_planner rows + pipeline_items. Shows weighted (probability-adjusted) totals per month. Sections: Confirmed | Pipeline | Grand Total.

---

### 4.12 Sales / Pipeline

**Route:** `/sales`

Pipeline item CRUD. Table with status badges: proposal=amber, won=green, lost=red. Add/edit modal with deal type, amounts, probability, expected months.

---

### 4.13 Tools

- **Timesheet** (`/tools/timesheet`): Monthly hour tracking per project
- **Email Tool** (`/email-tool`): Generate Slovenian-language invoice notification emails
- **Outbox** (`/outbox`): Email queue management

---

### 4.14 Settings

**Route:** `/settings`

Agency name + project managers list stored in `app_settings` table.

---

## 5. Business Logic

### 5.1 Total Value Formula (consistent across all views)

```typescript
// For recurring projects (maintenance, variable):
const regularRows = rpRows.filter(r =>
  r.project_id === p.id &&
  r.status !== 'cost' &&
  !r.notes?.startsWith('CR:')
)
const base = regularRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)

// For fixed projects:
const base = p.initial_contract_value ?? p.contract_value ?? 0

// Always add approved CRs:
const crTotal = approvedCRs
  .filter(cr => cr.project_id === p.id)
  .reduce((s, cr) => s + (cr.amount ?? 0), 0)

const totalValue = base + crTotal
```

**This formula is used in:** ProjectDetailView, ProjectsView, ClientDetailView, ClientsView.

### 5.2 Invoice Status Flow

`planned` → `issued` → `paid`
Alternative statuses: `retainer` (recurring), `deferred` (moved out), `cost` (expense)

### 5.3 Maintenance Partial-Year Calculation

```typescript
function maintMonthsThisYear(m: Maintenance): number {
  const yearStart = `${YEAR}-01`
  const yearEnd = `${YEAR}-12`
  const effStart = max(contract_start.slice(0,7), yearStart)
  const effEnd = min(contract_end?.slice(0,7) ?? yearEnd, yearEnd)
  if (effStart > effEnd) return 0
  const [sy, sm] = effStart.split('-').map(Number)
  const [ey, em] = effEnd.split('-').map(Number)
  return (ey - sy) * 12 + (em - sm) + 1
}
```

### 5.4 Revenue Planner Aggregation (multi-row per cell)

When multiple rows exist for the same project+month, aggregate by:
- Sum `planned_amount`
- Take minimum `probability`
- Take highest-rank status (paid > issued > planned > retainer > deferred > cost)
- Concatenate `notes` with " | "

---

## 6. UI Design System

### 6.1 CSS Variables

```css
--navy: #1a3a6c        /* Primary brand */
--navy-light: #e8edf7  /* Hover/active backgrounds */
--green: #16a34a       /* Success, confirmed */
--amber: #d97706       /* Warning, pending */
--red: #dc2626         /* Error, critical */
--blue: #2563eb        /* Info, issued */

/* Neutral scale */
--c0: #09090b  --c1: #18181b  --c2: #3f3f46
--c3: #71717a  --c4: #52525b  --c5: #d4d4d8
--c6: #e4e4e7  --c7: #f4f4f5  --c8: #fafafa

--bg: #f1f1f4    /* App background */
--r: 10px        /* Border radius */
--sidebar-w: 224px
```

### 6.2 Key Component Classes

**Buttons:** `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`, `.btn-xs`

**Badges:** `.badge`, `.badge-green`, `.badge-amber`, `.badge-red`, `.badge-blue`, `.badge-navy`, `.badge-gray`

**Layout:** `.page-header`, `.page-content`, `.section-bar`, `.app-layout`, `.app-main`

**Stats:** `.stats-strip`, `.stat-card`, `.stat-card-label`, `.stat-card-value`, `.stat-card-sub`

**Forms:** `.form-group`, `.form-label`, `.form-row`, `.form-hint`

**Tables:** `.th-right`, `.td-right`, `.text-mono`, `.table-link`

**Modals:** `.modal-overlay`, `.modal-box`, `.modal-header`, `.modal-body`, `.modal-footer`

**Alerts:** `.alert`, `.alert-red`, `.alert-amber`

**Cards:** `.card`, `.card-body`

---

## 7. Key Technical Constraints

- TypeScript strict mode: TS6133 (unused vars) breaks build — never declare unused variables
- No Tailwind — use existing CSS classes only
- No react-hook-form — plain `useState` per form
- Dates: always use `new Date(str + 'T00:00:00')` to avoid timezone issues
- Month pickers return `YYYY-MM` → append `-01` before storing to DB
- Supabase client uses `createClient<any>` intentionally (no generated types)

---

## 8. Glossary

| Term | Definition |
|------|-----------|
| MRR | Monthly Recurring Revenue |
| YTD | Year-to-Date |
| CR | Change Request |
| RP | Revenue Planner |
| effectiveBudget | Base value for a project (initial contract or sum of planned rows) |
| totalValue | effectiveBudget + approved CRs |
| leftToInvoice | totalValue - totalInvoiced |
| retainer | Recurring maintenance/hosting row status |
| deferred | Invoice moved to future month |
| auto_extra | Auto-generated CR from invoice overage |
| H1/H2 | First half (Jan–Jun) / Second half (Jul–Dec) of year |
