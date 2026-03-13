# Technical Maintenances — Design Spec

**Date:** 2026-03-12
**Status:** Approved

## Overview

A new first-class entity for tracking technical maintenance retainer contracts — completely separate from the Projects table. Each contract has a monthly retainer fee, SLA limits (help requests, hours), and contract validity dates. When a maintenance contract is active, it auto-generates `retainer` rows in `revenue_planner` for all months in its active period.

---

## Data Model

### New table: `maintenances`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `client_id` | uuid FK → clients | required |
| `name` | text | e.g. "Website Support" |
| `monthly_retainer` | numeric | € amount billed per month |
| `help_requests_included` | integer | max requests/month in SLA |
| `hours_included` | numeric | max hours/month in SLA |
| `contract_start` | date | YYYY-MM-DD |
| `contract_end` | date nullable | null = open-ended |
| `status` | text | `active` \| `paused` \| `cancelled` |
| `notes` | text nullable | |
| `created_at` | timestamptz | |

### Revenue planner linkage

`revenue_planner.project_id` is a required FK — to avoid polluting the projects table with proxy records, add a nullable `maintenance_id` column to `revenue_planner` and make `project_id` nullable. Rows linked to a maintenance will have `maintenance_id` set and `project_id` null, with `status: 'retainer'`.

Migration:
```sql
ALTER TABLE revenue_planner
  ADD COLUMN maintenance_id uuid REFERENCES maintenances(id),
  ALTER COLUMN project_id DROP NOT NULL;
```

---

## Revenue Planner Integration

On maintenance create/activate:
- Compute months from `contract_start` to `contract_end` (or 12 months ahead if open-ended)
- Upsert one `revenue_planner` row per month: `{ maintenance_id, month, planned_amount: monthly_retainer, status: 'retainer', probability: 100 }`

On maintenance update (amount/dates change): re-upsert affected months.
On maintenance cancel/pause: no rows deleted (history preserved), stop generating future rows.

---

## Frontend

### Page: `/maintenances`

**Sidebar:** under "Clients & Projects" group, between Projects and the divider.

**Stats strip (4 cards):**
- Total active contracts
- Total monthly retainer (€/mo, sum of active)
- Total hours included/mo
- Contracts expiring within 30 days

**Table columns:** Client · Contract name · Monthly retainer · Help requests/mo · Hours/mo · Start · End (or "Open-ended") · Status badge · Edit button

**Add/Edit modal fields:** Client (dropdown), Name, Monthly retainer (€), Help requests included, Hours included, Contract start (month picker), Contract end (month picker, optional), Status, Notes.

### Store: `src/stores/maintenances.ts`

Pattern: `useMaintenancesStore` with `fetchAll`, `add`, `update`. On `add`/`update`, calls revenue planner upsert logic.

### Types: `Maintenance` interface added to `src/lib/types.ts`

---

## Routing

- Route: `/maintenances` → `MaintenancesView`
- Sidebar nav item added under Projects

---

## Constraints

- No detail page needed — all info fits in the list + modal
- No delete — only status change to `cancelled`
- TypeScript strict — no unused variables
