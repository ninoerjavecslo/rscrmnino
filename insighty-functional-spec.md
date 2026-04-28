# Insighty — Functional Specification

**Version:** 1.0  
**Date:** 2026-04-24  
**Status:** Living Document

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Architecture & Multi-Tenancy](#2-architecture--multi-tenancy)
3. [User Management & Permissions](#3-user-management--permissions)
4. [Module: Clients](#4-module-clients)
5. [Module: Projects](#5-module-projects)
6. [Module: Maintenance Contracts](#6-module-maintenance-contracts)
7. [Module: Revenue Planner](#7-module-revenue-planner)
8. [Module: This Month (Invoice Dashboard)](#8-module-this-month-invoice-dashboard)
9. [Module: Sales Pipeline](#9-module-sales-pipeline)
10. [Module: Forecast](#10-module-forecast)
11. [Module: Infrastructure & Hosting](#11-module-infrastructure--hosting)
12. [Module: Domains](#12-module-domains)
13. [Module: Resource Planning](#13-module-resource-planning)
14. [Module: Reports](#14-module-reports)
15. [Module: Statistics](#15-module-statistics)
16. [Module: Automations (Invoice Automation)](#16-module-automations-invoice-automation)
17. [Module: Reminder Rules](#17-module-reminder-rules)
18. [Module: Offer Generator](#18-module-offer-generator)
19. [Module: Pixel AI Assistant](#19-module-pixel-ai-assistant)
20. [Module: Agency Tools Stack](#20-module-agency-tools-stack)
21. [Module: Contracts & Contractors](#21-module-contracts--contractors)
22. [Module: Email Tool](#22-module-email-tool)
23. [Module: Timesheet](#23-module-timesheet)
24. [Module: Dashboard](#24-module-dashboard)
25. [Module: Settings](#25-module-settings)
26. [Module: Profile](#26-module-profile)
27. [Admin Console](#27-admin-console)
28. [Integrations](#28-integrations)
29. [Notification System](#29-notification-system)
30. [Data Model Reference](#30-data-model-reference)
31. [Business Rules & Calculations](#31-business-rules--calculations)
32. [Access Control Matrix](#32-access-control-matrix)

---

## 1. Product Overview

### 1.1 Purpose

Insighty is a multi-tenant, AI-powered agency operations platform built for digital agencies and professional services firms. It acts as the financial intelligence layer on top of existing project management tools — connecting clients, projects, maintenance contracts, hosting plans, domains, invoices, and pipeline deals into one unified dashboard.

### 1.2 Core Problem Solved

Digital agencies typically manage operations across 5–10 disconnected tools:
- PM tool (Jira, Asana, ClickUp) for task tracking
- Spreadsheets for revenue planning and forecasting
- Accounting software (Xero, QuickBooks) for invoicing
- Email and calendar for client communication
- Separate tracking for domains, hosting contracts, and retainers

This fragmentation causes: missed invoices, unpredictable cash flow, invisible resource utilization, and no single source of truth for agency health.

### 1.3 Core Value Propositions

| Problem | Insighty Solution |
|---------|-------------------|
| Revenue scattered across tools | Single Revenue Planner with multi-stream visibility |
| Missed invoices / invoice leakage | "This Month" dashboard with per-item invoice confirmation |
| Cash flow unpredictability | Probability-weighted Forecast with deal pipeline integration |
| No resource visibility | Resource Planning with capacity, utilization, and deliverable tracking |
| Domain/hosting expiry surprises | Automated Reminder Rules with accounting invoice generation |
| Manual invoice generation | Automation Engine with templated monthly invoice batches |
| No project financial health view | Project Detail with budget burn, profitability, and change request tracking |

### 1.4 Target Users

- **Agency Owner / CEO** — Full visibility into financials, forecasts, resource utilization
- **Project Manager** — Project health, resource allocation, client status
- **Operations Manager** — Hosting, domains, contracts, automations
- **Team Member** — Resource planning view, own timesheet, personal week view
- **Client (external, view-only)** — Not a direct user; receives automated reports

### 1.5 Non-Goals

- Insighty does NOT replace Jira, Asana, or ClickUp for task management
- Insighty does NOT replace accounting software for ledger/bookkeeping
- Insighty is NOT a general-purpose project management tool

---

## 2. Architecture & Multi-Tenancy

### 2.1 Tenancy Model

Insighty is a multi-tenant SaaS application. Each tenant is an **Organization**. All data is isolated by `organization_id` enforced at the database level via Row-Level Security (RLS).

```
Organizations (tenants)
  └── Users (organization_members)
        └── All data rows (clients, projects, invoices, etc.)
```

### 2.2 Organization Routing

- Production: `{slug}.insighty.io` — subdomain identifies the org
- Development: `VITE_DEV_ORG_SLUG` environment variable overrides subdomain detection
- If no org matches the subdomain, the user sees an "Organization Not Found" screen
- If the org's `status = 'suspended'`, the user sees an "Account Suspended" screen

### 2.3 Organization Data Model

```
organizations
  id          uuid PK
  name        text
  slug        text UNIQUE    -- subdomain identifier
  plan        text           -- 'free' | 'pro' | 'agency' | 'enterprise'
  status      text           -- 'active' | 'suspended'
  created_at  timestamptz

organization_members
  id          uuid PK
  org_id      uuid FK → organizations.id
  user_id     uuid FK → auth.users.id
  role        text           -- 'owner' | 'admin' | 'member'
  created_at  timestamptz
```

### 2.4 RLS Isolation

All tenant tables include `organization_id uuid NOT NULL`. The database function `public.current_org_id()` reads the JWT app_metadata claim, with a fallback lookup via `organization_members` for backward compatibility. All RLS policies use `organization_id = public.current_org_id()`.

### 2.5 JWT Enrichment

A Supabase Custom Access Token Hook (`public.custom_access_token_hook`) embeds `organization_id` into JWT app_metadata at every login, eliminating per-request DB lookups in the hot path.

---

## 3. User Management & Permissions

### 3.1 Roles

| Role | Description |
|------|-------------|
| `owner` | Full access. Can manage members, billing, and org settings. |
| `admin` | Full feature access. Cannot manage billing or remove other admins. |
| `member` | Access controlled by per-page permissions configured in Settings. |

### 3.2 Permission System

The owner/admin configures a permission map stored in organization settings. Each **page** can be restricted to `owner`, `admin`, or `member`. The `ProtectedRoute` component reads from the `usePermissionsStore` and redirects unauthorized members to `/dashboard`.

**Pages with permission control:**
- this-month, automations, planning, forecast, clients, projects, maintenances, sales, stats, infrastructure, domains, tools, resource-planning, resource-yearly, reports, contracts, contractors, stack, pixel

### 3.3 Impersonation (Admin Console)

Super-admin (Insighty platform owner) can impersonate any organization via the Admin Console. An amber banner is shown during impersonation. Exiting impersonation resets all Zustand stores to prevent data leakage between organizations.

### 3.4 Authentication Flow

1. User navigates to `{slug}.insighty.io`
2. OrgProvider resolves slug → organization lookup
3. If valid org: Login page shown with org branding
4. After Supabase auth sign-in: `organization_members` checked for membership
5. If not a member of this org: signed out immediately with error
6. If member: JWT enriched with `organization_id`, app loads with correct org context

---

## 4. Module: Clients

### 4.1 Purpose

Central directory of all agency clients. Serves as the relational anchor for projects, maintenance contracts, hosting clients, domains, and pipeline items.

### 4.2 Client List View

- Table view with columns: Name, Contact Person, Email, Phone, Website
- Search/filter by name
- Sort by name, created date
- Quick-add button opens inline modal

### 4.3 Client Detail View

**Tabs within client detail:**

**Overview Tab**
- Editable fields: Name, Email, Phone, Address, VAT ID, Website, Contact Person, Contact Email, Contact Phone, Notes
- Save changes with confirmation

**Projects Tab**
- All projects linked to this client
- Columns: Project Number (PN), Name, Type, Status, Contract Value, PM, Start Date, End Date
- Link to project detail
- Quick-add project for this client

**Maintenance Tab**
- All maintenance contracts for this client
- Columns: Name, Monthly Retainer, Billing Cycle, Status, Contract Start/End
- Link to maintenance detail

**Hosting Tab**
- All hosting clients (hosting plans) for this client
- Columns: Description, Cycle, Amount, Status, Next Invoice Date

**Domains Tab**
- All domains registered for this client
- Columns: Domain Name, Expiry Date, Yearly Amount, Registrar, Status
- Color-coded status: green (active), amber (expiring soon), red (expired)

**Pipeline Tab**
- All pipeline deals associated with this client
- Columns: Title, Amount, Probability, Expected Month, Status

**Invoices Tab**
- All invoices for this client
- Columns: Invoice Number, Status, Issued Date, Due Date, Total

**Financial Summary**
- Total contract value (active projects)
- Total annual hosting revenue
- Total annual domain revenue
- Total annual maintenance revenue
- Combined annual client value

### 4.4 Data Model

```
clients
  id              uuid PK
  organization_id uuid FK
  name            text NOT NULL
  email           text
  phone           text
  address         text
  vat_id          text
  notes           text
  website         text
  contact_person  text
  contact_email   text
  contact_phone   text
  created_at      timestamptz
  updated_at      timestamptz
```

### 4.5 Business Rules

- Client name must be unique within an organization
- Deleting a client is blocked if active projects, maintenances, or hosting clients exist
- A client without a `client_id` link on projects is shown as "Internal" or "No Client"

---

## 5. Module: Projects

### 5.1 Purpose

Tracks all billable and internal projects. Each project has a type that determines how revenue is recognized and how it flows into the Revenue Planner and Forecast.

### 5.2 Project Types

| Type | Description |
|------|-------------|
| `fixed` | Fixed-price project. Revenue recognized when invoiced. |
| `maintenance` | Ongoing monthly retainer. (Deprecated in favor of Maintenance module.) |
| `variable` | Time-and-materials. Revenue recognized per invoice. |
| `internal` | Internal agency project. Not billable. |

### 5.3 Project Status

| Status | Meaning |
|--------|---------|
| `active` | In progress |
| `paused` | Temporarily on hold |
| `completed` | Finished and closed |
| `cancelled` | Cancelled, not invoiced |

### 5.4 Project List View

- Table: PN, Client, Name, Type, Status, Contract Value, PM, Start Date, End Date
- Filters: Status (active/paused/completed/cancelled), Type, Client
- Search by name, PN, client
- Create New Project button → modal with full form

### 5.5 Project Number (PN) System

- Auto-generated format: `RS-YYYY-NNN` (e.g., `RS-2026-042`)
- Sequential per organization per year
- Shown throughout the app as the primary short reference

### 5.6 Project Detail View

**Tabs:**

**Overview**
- Editable: Name, Client, Type, Status, PM, Currency, Contract Value, Start Date, End Date, Notes, Contract URL, CMS
- Change request list: all CRs linked to this project (pending, approved, billed)
- Change request total (pending + approved)
- Total project value = contract_value + approved CRs

**Revenue / Invoices**
- All Revenue Planner entries for this project (month, amount, status)
- All invoices linked to this project
- Budget burn: planned vs. actual invoiced
- Profitability indicators

**Resources**
- Team members assigned to this project
- Resource allocations by member and date

**Deliverables**
- ProjectDeliverable list: title, due date, estimated hours, status
- Status: active, completed, delayed
- Add/edit/delete deliverables
- Hours per team breakdown and per-member percentage split

**Project Orders**
- ProjectOrder list: offer reference, PO number, description, amount, month
- Linked to Revenue Planner entries

**Change Requests**
- Full CR management: title, description, amount, status, notes
- Status flow: `pending → approved → billed`
- Billed CRs are excluded from pipeline/forecast views

### 5.7 Won Deal Flow (from Sales)

When a pipeline deal is marked "Won":
1. User selects deal type → creates appropriate project structure
2. `fixed` deal → creates a Project with a Revenue Planner entry
3. `monthly` deal → creates a Maintenance Contract
4. `variable` deal → creates a Project without a fixed revenue entry

### 5.8 Data Model

```
projects
  id                    uuid PK
  organization_id       uuid FK
  client_id             uuid FK → clients.id
  pn                    text NOT NULL      -- RS-YYYY-NNN
  name                  text NOT NULL
  type                  text NOT NULL      -- fixed | maintenance | variable | internal
  status                text NOT NULL      -- active | paused | completed | cancelled
  pm                    text
  contract_value        numeric
  initial_contract_value numeric
  currency              text DEFAULT 'EUR'
  start_date            date
  end_date              date
  notes                 text
  contract_url          text
  is_maintenance        boolean
  cms                   text
  created_at            timestamptz
```

---

## 6. Module: Maintenance Contracts

### 6.1 Purpose

Manages recurring retainer contracts with clients, typically covering ongoing support, website maintenance, or managed services. Each maintenance contract has fixed monthly (or annual) billing, included hours, and included help requests.

### 6.2 Maintenance List View

- Table: Client, Name, Monthly Retainer, Billing Cycle, Status, Contract Start/End
- Filter by status (active/paused/cancelled)
- Search by client, name
- Create button

### 6.3 Maintenance Detail View

**Overview**
- Editable: Client, Name, Monthly Retainer, Billing Cycle, Billing Month (for annual), Help Requests Included, Hours Included, Contract Start, Contract End, Contract URL, Status, Notes, CMS, Jira Project Key, Team Hours

**Jira Integration**
- If `jira_project_key` is set, fetches live issue data from Jira API
- Shows: bugs used this month, CRs used, hours logged via Tempo
- Manual hours override available if Tempo not configured
- Usage shown as progress bars against included hours/requests

**Hours Log**
- `MaintenanceHoursLog` entries per month
- Source: `tempo` (auto-fetched from Jira/Tempo) or `manual`
- Historical usage chart

**Revenue**
- All Revenue Planner entries for this maintenance contract
- Monthly retainer automatically creates recurring revenue entries

**Change Requests**
- CRs linked to this maintenance (same flow as project CRs)
- Shown separately from included hours/requests

**Hosting**
- Hosting clients linked to this maintenance contract

**Email Intake Rules**
- `EmailIntakeRule` entries: sender domain, keyword matching, default issue type
- Configures automatic ticket creation from client emails

### 6.4 Billing Logic

- `monthly`: generates one Revenue Planner entry per month
- `annual`: generates one Revenue Planner entry in the specified `billing_month`
- Cancelled contracts: revenue entries generated up to cancellation date only
- `team_hours`: JSON map of `team_id → monthly_hours` for resource planning auto-fill

### 6.5 Data Model

```
maintenances
  id                    uuid PK
  organization_id       uuid FK
  client_id             uuid FK → clients.id
  project_pn            text
  name                  text NOT NULL
  monthly_retainer      numeric NOT NULL
  billing_cycle         text               -- monthly | annual
  billing_month         integer            -- 1-12
  help_requests_included integer DEFAULT 0
  hours_included        numeric DEFAULT 0
  contract_id           uuid FK → contracts.id
  contract_start        date NOT NULL
  contract_end          date
  contract_url          text
  status                text               -- active | paused | cancelled
  notes                 text
  cms                   text
  jira_project_key      text
  team_hours            jsonb
  created_at            timestamptz
```

---

## 7. Module: Revenue Planner

### 7.1 Purpose

The Revenue Planner is Insighty's core financial planning module. It provides a multi-month matrix view of all revenue streams, allowing agency owners to see exactly what is planned, issued, and paid across every client, project, retainer, hosting plan, and domain — for any combination of months.

### 7.2 Revenue Streams

The Revenue Planner aggregates entries from four sources:

| Source Type | How Generated |
|-------------|---------------|
| Project | Manual entry or from Won Deal flow |
| Maintenance Contract | Auto-generated from active maintenance contracts |
| Hosting Client | Auto-generated from active hosting plans |
| Domain | Auto-generated from billable domain renewals |

Entries can also be type `cost` (to represent planned costs, shown as negative).

### 7.3 View Layout

- Column headers: month names (e.g., Jan 2026, Feb 2026, … N months)
- Rows: grouped by client → sub-rows per revenue line (project, maintenance, hosting, domain)
- Month selector: user can choose which months to display (e.g., 6-month window)
- Each cell shows: amount, status badge

### 7.4 Entry Status

| Status | Meaning | Display Color |
|--------|---------|---------------|
| `planned` | Scheduled, not yet invoiced | Gray |
| `issued` | Invoice sent, not yet paid | Blue |
| `paid` | Invoice paid and received | Green |
| `retainer` | Recurring retainer (auto-generated) | Navy |
| `cost` | Planned cost (shown as negative) | Red |
| `deferred` | Pushed to a later month | Amber |

### 7.5 Probability

Each entry has a `probability` field (25 | 50 | 75 | 100). Used in Forecast view for weighted revenue calculation. Revenue Planner shows actual planned amounts; Forecast view applies probability weighting.

### 7.6 Interactions

- **Click cell** → open edit modal: change amount, status, probability, notes, link to invoice
- **Drag month** → defer entry to next month (changes status to `deferred`)
- **Add entry** → manual entry for one-off project revenue in a specific month
- **Auto-generate** → button to auto-fill retainer/hosting/domain entries for upcoming months based on active contracts
- **Mark as paid** → updates status, optionally links an invoice ID

### 7.7 "This Month" Integration

The Revenue Planner feeds into the "This Month" view which shows only current-month entries requiring action (issue or confirm payment).

### 7.8 Data Model

```
revenue_planner
  id                  uuid PK
  organization_id     uuid FK
  project_id          uuid FK → projects.id
  maintenance_id      uuid FK → maintenances.id
  hosting_client_id   uuid FK → hosting_clients.id
  domain_id           uuid FK → domains.id
  month               date NOT NULL          -- YYYY-MM-01
  planned_amount      numeric
  actual_amount       numeric
  status              text                   -- planned | paid | issued | retainer | cost | deferred
  probability         integer DEFAULT 100    -- 25 | 50 | 75 | 100
  invoice_id          uuid FK → invoices.id
  notes               text
```

---

## 8. Module: This Month (Invoice Dashboard)

### 8.1 Purpose

A focused, actionable view of everything that needs to be invoiced or confirmed for the current month. Eliminates invoice leakage by surfacing every revenue stream in one place with one-click confirmation.

### 8.2 View Layout

- Header: current month, total planned revenue, total confirmed, delta
- Table rows: one per Revenue Planner entry in the current month
- Columns: Client, Description (project/maintenance/hosting/domain), Type, Amount, Status, Action

### 8.3 Status Actions

| Current Status | Available Actions |
|----------------|-------------------|
| `planned` | → Mark as Issued, → Defer to next month |
| `issued` | → Mark as Paid |
| `retainer` | → Confirm (moves to paid), → Defer |
| `paid` | (no action needed, shown for completeness) |

### 8.4 Invoice Totals

- Summary cards: Total Planned, Total Issued, Total Paid, Remaining to Issue
- Color coding by status

### 8.5 Notifications

- Badge on sidebar nav item showing count of unactioned items for current month
- Reminder notification if unactioned items exist past the 10th of the month (configurable in Settings)

---

## 9. Module: Sales Pipeline

### 9.1 Purpose

Tracks prospective deals from initial proposal through to won/lost. Probability-weighted deal values flow automatically into the Forecast view.

### 9.2 Deal Types

| Type | Behavior |
|------|----------|
| `one_time` | Single payment in `expected_month` |
| `monthly` | Recurring monthly from `expected_month` to `expected_end_month` |
| `fixed` | Custom schedule (`monthly_schedule` array with month+amount pairs) |

### 9.3 Pipeline View

- Kanban view grouped by status: Proposal, Won, Lost
- Table view with sortable columns: Client/Company, Title, Amount, Probability, Expected Month, Deal Type
- Quick filters: active only (proposal), all, won, lost
- Search by title, company

### 9.4 Deal Probabilities

| Level | Value |
|-------|-------|
| Early / Exploratory | 10% |
| Initial Proposal | 25% |
| Active Negotiation | 50% |
| Verbal Commitment | 75% |
| Signature Pending | 90% |

### 9.5 Won Deal Flow

When a deal is marked Won:
1. Modal asks: "Create project from this deal?"
2. Based on `deal_type`:
   - `one_time` / `fixed` → creates Project + Revenue Planner entries
   - `monthly` → creates Maintenance Contract
3. Pipeline item status set to `won`
4. Revenue automatically removed from Pipeline Forecast and added to committed revenue

### 9.6 Change Requests in Pipeline

CRs with status `pending` or `approved` also appear in the pipeline/forecast. `billed` CRs are excluded (already invoiced, no longer in forecast).

### 9.7 Data Model

```
pipeline_items
  id                  uuid PK
  organization_id     uuid FK
  client_id           uuid FK → clients.id
  company_name        text        -- for prospects not yet in clients
  title               text NOT NULL
  description         text
  estimated_amount    numeric
  probability         integer
  deal_type           text        -- one_time | monthly | fixed
  expected_month      date
  expected_end_month  date
  monthly_schedule    jsonb       -- [{month, amount}]
  status              text        -- proposal | won | lost
  notes               text
  created_at          timestamptz
```

---

## 10. Module: Forecast

### 10.1 Purpose

Projects future cash flow by combining committed revenue (Revenue Planner) with probability-weighted pipeline deals and change requests. Gives agency owners confidence to make hiring and investment decisions.

### 10.2 Forecast Sources

The Forecast view aggregates from four sources:

| Source | How Included |
|--------|-------------|
| Revenue Planner entries | Included at their probability (usually 100% for planned/issued/paid) |
| Pipeline deals (proposal) | Included at their probability × amount |
| Approved Change Requests | Included at their probability (default 100% if no probability set) |
| Pending Change Requests | Included at their probability |

### 10.3 View Layout

- Month columns (same 6-month or rolling window as Revenue Planner)
- Rows: Revenue Planner total, Pipeline total (weighted), CR total
- Combined forecast per month (weighted sum)
- Optimistic forecast (all at 100%)
- Conservative forecast (pipeline at 50% weight)

### 10.4 Monthly Breakdown

Each month cell is expandable to show:
- Individual Revenue Planner entries
- Individual pipeline deals contributing to that month
- Individual CRs contributing

### 10.5 Forecast vs. Actual

After a month closes, Forecast compares planned vs. actual paid revenue and displays variance with color coding (green = on track, red = missed).

### 10.6 Pipeline Impact Report

Sub-view showing: if all current pipeline deals close vs. none close, what is the monthly revenue range (best case / worst case / expected). Useful for hiring decisions.

---

## 11. Module: Infrastructure & Hosting

### 11.1 Purpose

Tracks all hosting contracts sold to clients (revenue) and all infrastructure costs the agency pays to providers (costs). Provides net hosting margin.

### 11.2 Hosting Clients (Revenue Side)

Each `HostingClient` represents a hosted service sold to a client.

**Fields:**
- Client (required)
- Project PN reference
- Description (e.g., "WordPress Hosting — example.com")
- Billing Cycle: `monthly` or `yearly`
- Amount
- Billing Since (start date — affects partial-year revenue calculations)
- Next Invoice Date
- Billing Month (for yearly billing, 1–12)
- Status: `active` | `paused` | `cancelled`
- Provider (which hosting company the agency uses)
- Linked Maintenance Contract (optional — connects hosting to a retainer)
- Contract ID, Contract Expiry
- Cancelled From (first month NOT billed — allows accurate annual revenue calculation)
- Accounting Email flag (include in automated invoice batches)
- Notes

**Annual Value Calculation:**
The `hostingAnnualValue()` function computes how much a hosting client bills in a given calendar year, accounting for:
- `billing_since` (partial first year)
- `contract_expiry` (partial final year)
- `cancelled_from` (first unbilled month)
- `cycle` (monthly = sum of active months; yearly = flat amount)

### 11.3 Infrastructure Costs (Cost Side)

Each `InfrastructureCost` represents a cost the agency pays.

**Fields:**
- Provider (e.g., AWS, DigitalOcean, Cloudflare)
- Description
- Monthly Cost
- Billing Cycle: `monthly` | `annual` | `variable`
- Status: `active` | `inactive`
- Cancelled From
- Notes

### 11.4 Infrastructure View

- **Summary cards:** Total Monthly Hosting Revenue, Total Monthly Costs, Net Margin
- **Hosting Clients table** with filtering by status and client
- **Infrastructure Costs table** with totals
- **Annual view toggle:** shows annualized values

### 11.5 Data Model

```
hosting_clients
  id                  uuid PK
  organization_id     uuid FK
  client_id           uuid FK → clients.id
  project_pn          text
  description         text
  cycle               text        -- monthly | yearly
  amount              numeric NOT NULL
  billing_since       date
  next_invoice_date   date
  billing_month       integer
  status              text        -- active | paused | cancelled
  provider            text
  maintenance_id      uuid FK → maintenances.id
  accounting_email    boolean DEFAULT false
  notes               text
  contract_id         uuid FK
  contract_expiry     date
  cancelled_from      date

infrastructure_costs
  id                  uuid PK
  organization_id     uuid FK
  provider            text NOT NULL
  description         text
  monthly_cost        numeric NOT NULL
  billing_cycle       text        -- monthly | annual | variable
  status              text        -- active | inactive
  cancelled_from      date
  notes               text
```

---

## 12. Module: Domains

### 12.1 Purpose

Tracks domain registrations for all clients. Provides expiry visibility, auto-renew status, billable flag, and integrates with the Reminder Rules system for automated renewal alerts and invoice generation.

### 12.2 Domain Status (Computed)

| Status | Rule |
|--------|------|
| `active` | Expiry date > 30 days from today |
| `expiring_soon` | Expiry date within 30 days |
| `expired` | Expiry date in the past |

This is a database-computed column, not stored directly.

### 12.3 Domains View

- Table: Client, Domain Name, Expiry Date, Yearly Amount, Registrar, Auto-Renew, Billable, Status
- Color-coded rows by status (green / amber / red)
- Filter by status, client
- Bulk add: paste a list of domain names for batch creation
- Export to CSV

### 12.4 Domain Detail / Edit

- Fields: Client, Project PN, Domain Name, Registered Date, Expiry Date, Yearly Amount, Contract ID, Registrar, Auto-Renew (boolean), Billable (boolean), Accounting Email, Archived, Notes

### 12.5 Revenue Integration

Billable domains with yearly amounts automatically appear in the Revenue Planner for their renewal month. The yearly amount is used as the planned revenue.

### 12.6 Reminder Integration

If a ReminderRule exists with `trigger_type = 'domain_expiry'`, the system sends reminder emails `days_before` the expiry date. If `invoice_email` is configured on the rule, an accounting-style invoice email is also generated.

### 12.7 Data Model

```
domains
  id                  uuid PK
  organization_id     uuid FK
  client_id           uuid FK → clients.id
  project_pn          text
  domain_name         text NOT NULL
  registered_date     date
  expiry_date         date NOT NULL
  yearly_amount       numeric
  contract_id         uuid FK
  registrar           text
  auto_renew          boolean DEFAULT true
  billable            boolean DEFAULT true
  status              text GENERATED      -- active | expiring_soon | expired
  accounting_email    boolean DEFAULT false
  archived            boolean DEFAULT false
  notes               text
```

---

## 13. Module: Resource Planning

### 13.1 Purpose

Provides full visibility into team capacity, utilization, and allocation across all projects and maintenance contracts. Supports daily allocation planning, deliverable tracking, template-based schedule generation, and monthly/yearly reports.

### 13.2 Sub-Views

| View | Description |
|------|-------------|
| Resource Planning | Day-by-day allocation grid for all team members |
| Resource Reports | Monthly utilization and billability reports |
| Resource Yearly | Annual overview: planned vs. capacity per member |
| Resource Monthly | Monthly detail: team member breakdown |
| Resource By Project | Per-project hours and utilization |
| Team Member Detail | Individual member profile with allocations, projects, time-off |

### 13.3 Team Structure

```
teams
  id              uuid PK
  organization_id uuid FK
  name            text
  color           text     -- hex color for visual grouping
  display_order   integer

team_members
  id                        uuid PK
  organization_id           uuid FK
  name                      text NOT NULL
  email                     text
  role                      text
  team_id                   uuid FK → teams.id
  skills                    text
  hours_per_day             numeric DEFAULT 8
  overhead_meetings_month   numeric
  overhead_sales_month      numeric
  vacation_days_year        integer
  display_order             integer
  active                    boolean DEFAULT true
  share_token               uuid    -- for public "My Week" link
```

### 13.4 Allocation Categories

| Category | Billable Default |
|----------|-----------------|
| `project` | Yes |
| `maintenance` | Yes |
| `internal` | No |
| `meeting` | No |
| `admin` | No |
| `leave` | No |
| `sales` | No |

### 13.5 Resource Allocation Data Model

```
resource_allocations
  id                    uuid PK
  organization_id       uuid FK
  member_id             uuid FK → team_members.id
  project_id            uuid FK → projects.id
  category              text
  date                  date NOT NULL
  hours                 numeric NOT NULL
  label                 text
  notes                 text
  recurring_group_id    uuid     -- links recurring entries
  is_billable           boolean DEFAULT true
  deadline_date         date
  is_unplanned          boolean DEFAULT false
  displaced_allocation_id uuid   -- if this allocation displaced another
```

### 13.6 Allocation Templates

- Templates store a typical weekly allocation pattern per team member
- Template entries: member, project/category, weekly hours, billable flag
- Applying a template to a date range auto-creates allocations for all working days

### 13.7 Deliverables

- `ProjectDeliverable` records track what needs to be delivered and when
- `estimated_hours` and `team_hours` (per team breakdown) and `member_percentages` support capacity planning
- Status: `active` | `completed` | `delayed`

### 13.8 Public "My Week" View

- Team members have a `share_token` (public UUID)
- URL: `/my-week/{token}` — no authentication required
- Shows this week's allocations for the specific member
- Read-only; used for sharing schedule externally or on a shared screen

### 13.9 Resource Confirmation

```
resource_confirmations
  id            uuid PK
  member_id     uuid FK
  date          date
  status        text    -- confirmed | delayed
  delay_reason  text
  confirmed_at  timestamptz
```

Members can confirm or mark as delayed their planned work for each day, providing actual vs. planned visibility.

### 13.10 Company Holidays

```
company_holidays
  id          uuid PK
  organization_id uuid FK
  name        text
  date        date
  type        text    -- public_holiday | company_shutdown
  applies_to  uuid[]  -- team_ids; empty = all teams
  recurrence  text    -- none | yearly
```

Holidays are excluded from capacity calculations and shown as non-working days in the allocation grid.

### 13.11 Capacity Calculations

For any member and date range:
```
Available hours = working_days × hours_per_day
                - holidays (where applies_to contains member's team or applies_to is empty)
                - time_off entries
                - overhead_meetings_month (prorated)
                - overhead_sales_month (prorated)

Utilization % = billable_hours / available_hours × 100
```

---

## 14. Module: Reports

### 14.1 Available Reports

| Report | Description |
|--------|-------------|
| Pipeline Impact | Scenario modeling: what happens to revenue if pipeline deals close vs. don't |
| Delay Impact | Financial impact of project delays on forecast |
| Monthly Digest | Automated monthly summary of agency health metrics |
| Capacity Forecast | Forward-looking team capacity vs. expected workload |

### 14.2 Pipeline Impact Report

- Inputs: current pipeline deals and probabilities
- Output: bar chart comparing Best Case (all deals close) vs. Expected (weighted) vs. Worst Case (no deals close) per month
- Drill-down by client or deal type

### 14.3 Delay Impact Report

- Calculates revenue variance if projects slip by 1 month, 2 months, or 3 months
- Shows which delays cause the most financial damage
- Color-coded risk severity

### 14.4 Monthly Digest

- Auto-generated on 1st of each month (or on demand)
- Sections: revenue vs. plan, top 5 invoiced clients, pipeline movements, resource utilization summary, domain/contract alerts
- Can be emailed to owner automatically via Automations

### 14.5 Capacity Forecast

- 12-week forward view of team capacity vs. planned allocations
- Identifies over-allocation (red), under-utilization (amber), and optimal (green)
- Per-team and per-member breakdowns

---

## 15. Module: Statistics

### 15.1 Purpose

High-level agency performance metrics across time periods. Suitable for board reports and monthly reviews.

### 15.2 Metrics

**Revenue Metrics:**
- Total revenue (current month, YTD, last 12 months)
- Revenue by client (top N, chart)
- Revenue by project type (fixed vs. maintenance vs. hosting)
- Revenue trend line (monthly)
- Invoice payment speed (average days to payment)

**Project Metrics:**
- Active projects count
- Projects by status
- Average project contract value
- Projects completed on time vs. delayed

**Client Metrics:**
- Active clients count
- New clients (period)
- Client revenue distribution (concentration risk)
- Churned maintenance clients (period)

**Team Metrics:**
- Average team utilization %
- Billable hours total
- Non-billable hours breakdown by category

---

## 16. Module: Automations (Invoice Automation)

### 16.1 Purpose

Automations allow agencies to configure recurring monthly invoice batches that are sent automatically on a specified day of the month. Eliminates manual invoice generation for predictable recurring revenue.

### 16.2 Automation Structure

An Automation is a named configuration that:
- Has a recipient email (accounting/client)
- Has a send day (1–28, day of month)
- Has a subject line and optional intro message
- Contains one or more **Automation Items** (line items)

### 16.3 Automation Items

Each item in an automation represents a recurring invoice line:
- Client
- Contract Reference
- Project PN
- Description Template (supports `{month}` and `{year}` tokens, e.g., "Website maintenance — {month} {year}")
- Quantity
- Unit Price
- Due Days (payment terms, e.g., 30 days)
- Sort Order
- Optional link to Hosting Client or Maintenance Contract

### 16.4 Execution

On the configured send day each month, the system:
1. Renders the description templates with current month/year
2. Generates an invoice-formatted email
3. Sends to the recipient email
4. Logs `sent_count` and `last_sent_at`

### 16.5 Automation List View

- Table: Name, Recipient, Send Day, Item Count, Last Sent, Active toggle
- Create / Edit / Delete
- "Send Now" button for manual trigger (test run)

### 16.6 Automation Form View

- Header fields: Name, Recipient Email, Send Day, Subject, Message
- Line item table: add/edit/delete items with drag-to-reorder
- Preview: rendered email preview showing how the email will look

---

## 17. Module: Reminder Rules

### 17.1 Purpose

Configurable rules that trigger reminder emails when contracts, domains, or pipeline deals approach key dates. Also supports automated domain renewal invoice generation.

### 17.2 Trigger Types

| Trigger Type | Description |
|--------------|-------------|
| `domain_expiry` | Fires N days before a domain's expiry date |
| `maintenance_end` | Fires N days before a maintenance contract's end date |
| `hosting_renewal` | Fires N days before a hosting contract's expiry |
| `pipeline_stale` | Fires when a pipeline deal has not been updated for N days |

### 17.3 Reminder Rule Fields

- Name
- Trigger Type
- Days Before (N)
- Recipient Email
- Active flag
- Notes
- **Invoice Generation (domain_expiry only):**
  - Invoice Email (accounting recipient)
  - Invoice PN (e.g., "6820" — accounting code)
  - Invoice Unit Price (per domain)
  - Invoice Due Days

### 17.4 Domain Invoice Generation

When `invoice_email` is configured on a domain expiry rule, the reminder email sent to accounting includes a formatted invoice section listing all domains expiring within the window, with the configured price per domain, ready for accounting to process.

---

## 18. Module: Offer Generator

### 18.1 Purpose

AI-powered proposal (offer) generation tool. Creates structured, professional PDF-quality proposals in Slovenian or English based on a brief or manual content entry.

### 18.2 Generation Modes

| Mode | Description |
|------|-------------|
| `quick` | Brief → AI generates complete proposal in one pass |
| `structured` | Step-by-step guided form with AI assistance per section |
| `manual` | Full manual composition with block-level content editing |

### 18.3 Offer Structure

An Offer is composed of **Sections**, each containing **Blocks**:

**Section Types:**
cover, intro, agency, strategy, phases, functionality, scope, tech, optional-services, maintenance, rate-card, team, references, pricing, notes, closing, custom

**Block Types (content components within sections):**
- `paragraph` — free text
- `bullet-list` — unordered list
- `goal-list` — styled goal cards
- `phase-block` — project phase timeline block
- `pricing-table` — service pricing grid
- `price-table` — alternative pricing layout
- `audience-grid` — target audience cards
- `pillar-block` — strategic pillar presentation
- `func-grid` — functionality feature grid
- `service-block` — service description cards
- `extra-card` — optional add-on cards
- `maint-grid` — maintenance terms grid
- `sla-table` — SLA terms table
- `team-grid` — team member cards
- `ref-grid` — client reference/case study grid
- `summary-box` — pricing summary callout
- `cms-explainer` — CMS comparison block
- `tech-grid` — technology stack cards
- `closing-block` — closing statement
- `info-box` — informational callout
- `two-col` — two-column layout
- `stat-grid` — statistics grid
- `notes` — internal notes (excluded from PDF)
- `boilerplate` — reusable content block from library

### 18.4 Offer Metadata

- Offer Number (auto-incremented)
- Client
- Language (sl / en)
- Pricing Total
- Status: draft | sent | accepted | rejected
- Version tracking (full section snapshots per version)

### 18.5 Offer Versioning

Each save creates an `OfferVersion` snapshot. Users can compare or restore previous versions.

### 18.6 Export

- PDF export with agency branding
- Section visibility toggles (hide/show sections for different audiences)
- Optional client portal sharing link

> **Note:** This module is currently disabled in the production build pending Insighty SaaS rebrand completion.

---

## 19. Module: Pixel AI Assistant

### 19.1 Purpose

An embedded AI chat assistant with access to the agency's operational context. Allows team members to ask natural language questions about clients, revenue, projects, and forecasts without manually navigating the dashboard.

### 19.2 Models Supported

- Claude (Anthropic) — default, long-context
- GPT-4o (OpenAI) — alternative

### 19.3 Context Injection

Pixel has access to (at conversation start):
- Current month revenue summary
- Active projects list
- Active maintenance contracts
- Pipeline deals
- Top client stats

### 19.4 Conversation Structure

```
pixel_conversations
  id          uuid PK
  organization_id uuid FK
  title       text         -- auto-generated from first message
  created_at  timestamptz
  updated_at  timestamptz

pixel_messages
  id                  uuid PK
  organization_id     uuid FK
  conversation_id     uuid FK
  role                text    -- user | assistant
  content             text
  model               text    -- claude | gpt4o
  created_at          timestamptz
```

### 19.5 UI

- Sidebar panel or full-page view
- Conversation list on left, chat on right
- Model selector per message or per conversation
- New conversation button
- Message timestamp and model indicator per message

---

## 20. Module: Agency Tools Stack

### 20.1 Purpose

A curated internal directory of all software tools the agency uses, along with their costs, renewal dates, project assignments, and ownership. Provides visibility into total SaaS spend and upcoming renewals.

### 20.2 Tool Record

- Name, Category, URL
- Billing: monthly cost, annual cost, billing cycle
- Renewal date
- Owner (team member)
- Linked projects (which projects/clients use this tool)
- Notes

### 20.3 View

- Card grid view with tool categories
- Filters: category, owner, billing cycle
- Total monthly SaaS spend card
- Renewal alerts (tools renewing within 30 days)

---

## 21. Module: Contracts & Contractors

### 21.1 Contracts

Tracks agency contracts (client contracts, NDA, service agreements) as a document registry.

**Fields:**
- Reference number
- Client
- Type (service agreement, NDA, MSA, etc.)
- Start Date, End Date
- Status (active, expired, terminated)
- Document URL
- Notes

The Contracts module serves as the source for `contract_id` references in Hosting Clients, Domains, and Maintenance records.

### 21.2 Contractors

Tracks freelancers and external collaborators the agency works with.

**Fields:**
- Name, Email, Phone
- Skills / Role
- Rate (hourly, daily, monthly)
- Currency
- Payment Method
- Tax ID / VAT
- Active flag
- Notes

---

## 22. Module: Email Tool

### 22.1 Purpose

Provides a simple outbound email composition tool for sending structured agency communications (proposals, reports, summaries) directly from Insighty using the agency's configured email identity.

### 22.2 Features

- Template-based composition
- Variable substitution (client name, month, project, amounts)
- Preview before send
- Send history log (outbox view)
- Integration with Automations for automated sends

---

## 23. Module: Timesheet

### 23.1 Purpose

Monthly timesheet log for recording hours per project/task. Supports manual entry and AI-assisted pre-fill based on resource allocation data.

### 23.2 Timesheet Entry

```
timesheet_entries
  id              uuid PK
  organization_id uuid FK
  user_id         uuid FK → auth.users.id
  month           date        -- YYYY-MM-01
  project_pn      text
  project_name    text
  description     text
  hours           numeric
  allocation_pct  numeric     -- % of total month hours
  total_month_hours numeric   -- total hours worked that month
  ai_generated    boolean DEFAULT false
```

### 23.3 AI-Assisted Pre-fill

The AI can analyze resource allocations for the month and generate draft timesheet entries, which are marked `ai_generated = true`. The user reviews and confirms before final submission.

---

## 24. Module: Dashboard

### 24.1 Purpose

The entry point view when a user logs in. Provides a snapshot of current agency health across all key metrics.

### 24.2 Dashboard Sections

**This Month Summary**
- Revenue: Planned, Issued, Paid
- Outstanding items count

**Active Projects**
- Count of active projects
- Quick status overview

**Pipeline Summary**
- Open proposals count
- Total weighted pipeline value

**Team Capacity (current week)**
- % utilized this week across team

**Alerts**
- Domains expiring in < 30 days
- Maintenance contracts ending in < 30 days
- Overdue invoices
- Pipeline deals not updated in > 14 days

**Quick Actions**
- Add Client
- Add Project
- Add Pipeline Deal
- Open This Month

---

## 25. Module: Settings

### 25.1 Agency Settings

- Agency Name, Logo
- Default Currency
- Default PM Name
- Invoice prefix / numbering settings
- Fiscal year start month

### 25.2 Member Permissions

For each page, set minimum role required: `owner` | `admin` | `member`. Saved as a permission map in organization settings.

### 25.3 Notification Settings

- Email notifications: on/off per event type
- Notification email address(es)
- Reminder thresholds (e.g., domain expiry warning days)

### 25.4 Integrations Config

- Jira: Base URL, Email, API Token
- Accounting: Xero / QuickBooks OAuth connection
- Email: SMTP settings or SendGrid API key
- Supabase: auto-configured (internal)

### 25.5 Billing / Plan

- Current plan (Freelancer / Pro / Agency / Enterprise)
- Seat count
- Renewal date
- Upgrade / downgrade flow

---

## 26. Module: Profile

### 26.1 User Profile

- Display Name
- Email (read-only, from auth)
- Avatar / initials
- Notification preferences
- Theme preference (light/dark — future)

### 26.2 Connected Team Member

Links the authenticated user to a `TeamMember` record for resource planning purposes.

---

## 27. Admin Console

### 27.1 Purpose

Super-admin interface accessible only to the Insighty platform owner (hardcoded email). Used to manage all organizations, users, and subscriptions across the entire platform.

### 27.2 Access Control

- Route: `/admin/*`
- Protected by `AdminRoute` component that checks `auth.getUser()` email
- Completely separate layout from main app

### 27.3 Admin Overview

- Total organizations, active, suspended
- Total users
- Plan breakdown (Freelancer / Pro / Agency / Enterprise counts)
- New orgs this month
- New users this month

### 27.4 Admin Organizations View

- Table: Name, Slug, Plan, Status, Member Count, Created Date
- Create Organization modal:
  - Name, Slug (auto-generated from name)
  - Plan
  - Optional: create first user (email, name, password, role)
- Organization actions:
  - Change plan
  - Suspend / unsuspend
  - View members → OrgMembersModal
- OrgMembersModal:
  - List all members with roles
  - Add existing user by email + role
  - Remove member (with confirmation)
  - Change member role

### 27.5 Admin Users View

- Table: Name, Email, Workspaces (org badges), Joined Date
- Search by name, email
- Add User modal: Email, Name, Password, optional org assignment + role
- Remove from workspace (× button on workspace badge, with confirmation)

### 27.6 Admin Operations (Edge Function)

All admin mutations go through the `admin-ops` Supabase Edge Function using service role:

| Action | Description |
|--------|-------------|
| `create-user` | Creates auth user + optional org membership |
| `add-member` | Looks up user by email, adds to org |
| `remove-member` | Deletes organization_members row |
| `update-member-role` | Updates role in organization_members |

---

## 28. Integrations

### 28.1 Jira + Tempo

- **Config:** Base URL, Jira email, Jira API token, Tempo token
- **Data fetched:** Issues for a Jira project key (bugs, CRs), hours logged via Tempo worklogs
- **Used in:** Maintenance Detail view — shows bugs used, CRs used, hours against included quota
- **Sync frequency:** On-demand (user triggers fetch)

### 28.2 Accounting Software (Xero / QuickBooks / FreshBooks)

- **Planned integration:** OAuth connection, pull paid invoices, push new invoices
- **Current state:** Manual invoice status tracking within Insighty

### 28.3 Email (SMTP / SendGrid)

- **Used by:** Automations engine, Reminder Rules, Monthly Digest
- **Config:** SMTP credentials or SendGrid API key in Settings

### 28.4 Domain Registrars (Planned)

- Auto-sync domain expiry dates from Namecheap, GoDaddy, Google Domains APIs
- Current state: manual entry

### 28.5 Hosting Providers (Planned)

- Auto-sync hosting contract status from cPanel, Plesk, or cloud provider APIs
- Current state: manual entry

---

## 29. Notification System

### 29.1 Toast Notifications

In-app, ephemeral toast messages:
- `success` — green, operation completed
- `error` — red, operation failed
- `info` — gray, informational
- Auto-dismiss after 4 seconds
- Stacked (multiple simultaneous toasts supported)

### 29.2 Email Notifications

Triggered by:
- Automation execution (scheduled invoice batches)
- Reminder Rule fires (domain expiry, contract end, stale pipeline)
- Monthly Digest (if configured)
- Admin events (new org created, user added)

### 29.3 In-App Badges

- Sidebar nav badges: count of actionable items per module
- "This Month" badge: unconfirmed invoice items
- "Domains" badge: expiring soon count

---

## 30. Data Model Reference

### 30.1 Core Tables

| Table | Purpose |
|-------|---------|
| `organizations` | Tenant registry |
| `organization_members` | User ↔ org membership with role |
| `app_users` | Mirror of auth.users for internal queries |
| `clients` | Client directory |
| `projects` | Project registry |
| `maintenances` | Maintenance contract registry |
| `invoices` | Invoice records |
| `revenue_planner` | Multi-stream revenue planning matrix |
| `pipeline_items` | Sales pipeline deals |
| `change_requests` | Change requests on projects and maintenances |
| `hosting_clients` | Hosting plans sold to clients |
| `infrastructure_costs` | Agency infra costs |
| `domains` | Domain registration tracking |
| `automations` | Invoice automation configurations |
| `automation_items` | Line items within automations |
| `reminder_rules` | Alert rule configurations |
| `teams` | Team groupings |
| `team_members` | Individual team members |
| `resource_allocations` | Day-level hour allocations |
| `allocation_templates` | Reusable weekly allocation patterns |
| `project_deliverables` | Deliverable milestones per project |
| `resource_confirmations` | Member daily status confirmations |
| `allocation_actuals` | Actual vs planned hours per allocation |
| `company_holidays` | Non-working days |
| `time_offs` | Member time-off periods |
| `timesheet_entries` | Monthly timesheet logs |
| `pixel_conversations` | AI chat conversation sessions |
| `pixel_messages` | Individual AI chat messages |
| `maintenance_hours_log` | Monthly hours used per maintenance contract |
| `project_orders` | Purchase orders linked to projects |
| `email_intake_rules` | Email → Jira ticket routing rules |
| `contracts` | Contract document registry |
| `contractors` | Freelancer/contractor directory |
| `agency_tools` | Agency SaaS stack entries |
| `offers` | Proposal/offer documents |
| `offer_versions` | Offer version snapshots |

### 30.2 All Tables Include

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `organization_id uuid NOT NULL REFERENCES organizations(id)`
- Row-Level Security policy: `organization_id = public.current_org_id()`

---

## 31. Business Rules & Calculations

### 31.1 Revenue Planner Auto-Generation

When "auto-generate" is triggered for a date range:
1. All active `maintenances` → generate monthly `retainer` entries for each month in range
2. All active `hosting_clients` → generate `planned` entries for active months (per `hostingActiveInMonth()`)
3. All `billable` domains → generate `planned` entry for their renewal month if it falls in range
4. Existing entries are NOT overwritten (idempotent — skips if entry already exists)

### 31.2 Forecast Weighted Revenue

For each month:
```
Weighted Revenue = 
  Sum(RevenuePlanner entries × probability / 100)
  + Sum(Pipeline deals that touch this month × probability / 100)
  + Sum(approved CRs × (probability or 100) / 100)
  + Sum(pending CRs × probability / 100)
```

### 31.3 Project Total Value

```
Project Total = contract_value + Sum(approved_CR amounts) + Sum(pending_CR amounts × probability)
```

### 31.4 Hosting Annual Value (hostingAnnualValue)

For monthly hosting clients:
```
Active months in year = count of months where:
  month >= billing_since (or Jan if null)
  AND month <= min(Dec, contract_expiry, month_before(cancelled_from))

Annual Value = active_months × monthly_amount
```

For yearly hosting clients: `Annual Value = amount` (one payment regardless of month)

### 31.5 Team Capacity

```
Working days = calendar days - weekends - holidays_for_member's_team - time_off_days

Available hours = working_days × hours_per_day
                - (overhead_meetings_month + overhead_sales_month) prorated daily

Utilization % = Sum(billable allocation hours for period) / available hours × 100
```

### 31.6 Invoice Leakage Prevention

"Invoice leakage" = revenue that should be invoiced but is missed.

Insighty prevents this by:
- Every recurring revenue line (maintenance, hosting, domain) generates a Revenue Planner entry for each month
- "This Month" view surfaces ALL current-month entries with `planned` or `retainer` status
- Badge on sidebar shows count of unactioned items
- Reminder email can be triggered if items remain unconfirmed past configured day

---

## 32. Access Control Matrix

| Feature | Owner | Admin | Member |
|---------|-------|-------|--------|
| Dashboard | ✓ | ✓ | ✓ |
| Clients (view) | ✓ | ✓ | Configurable |
| Clients (edit) | ✓ | ✓ | Configurable |
| Projects (view) | ✓ | ✓ | Configurable |
| Projects (edit) | ✓ | ✓ | Configurable |
| Revenue Planner | ✓ | ✓ | Configurable |
| This Month | ✓ | ✓ | Configurable |
| Sales Pipeline | ✓ | ✓ | Configurable |
| Forecast | ✓ | ✓ | Configurable |
| Infrastructure | ✓ | ✓ | Configurable |
| Domains | ✓ | ✓ | Configurable |
| Maintenances | ✓ | ✓ | Configurable |
| Resource Planning | ✓ | ✓ | Configurable |
| Reports | ✓ | ✓ | Configurable |
| Statistics | ✓ | ✓ | Configurable |
| Automations | ✓ | ✓ | Configurable |
| Settings | ✓ | ✓ | — |
| Permissions Config | ✓ | — | — |
| Org Members | ✓ | ✓ | — |
| Billing / Plan | ✓ | — | — |
| Admin Console | Platform Owner only | — | — |

"Configurable" = Access granted by Owner in Settings → Permissions for each page individually.

---

*This document reflects the Insighty platform as of v1.0 (April 2026). All referenced data models mirror the live Supabase schema. Module specifications should be updated when schema changes are applied.*
