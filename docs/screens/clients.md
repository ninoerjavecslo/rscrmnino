# Clients Screen

**Route:** `/clients`
**File:** `src/views/ClientsView.tsx`

---

## Purpose

Central list of all studio clients. Each row gives a quick snapshot of a client's infrastructure footprint and financial standing for the current year.

---

## Data Sources

| Store | Table | Purpose |
|---|---|---|
| `useClientsStore` | `clients` | Client list |
| `useProjectsStore` | `projects` | Project count per client |
| `useInfraStore` | `hosting_clients` | Hosting presence + annual value |
| `useDomainsStore` | `domains` | Domain presence + annual value |
| `useMaintenancesStore` | `maintenances` | Maintenance presence + annual value |
| `useRevenuePlannerStore` | `revenue_planner` | Invoice YTD (current year months only) |

---

## Columns

### Projects
Count of all projects linked to this client (`project.client_id = client.id`), regardless of project status.

### Hosting
`Yes` if the client has **at least one active** `hosting_clients` row (`status = 'active'`).
`No` otherwise.

### Domains
`Yes` if the client has **at least one** `domains` row (archived domains are still counted here).
`No` otherwise.

> **Note:** Archived domains still show `Yes`. Only the Annual Value calculation excludes archived domains.

### Maintenance
`Yes` if the client has **at least one active** `maintenances` row (`status = 'active'`).
`No` otherwise.

---

## Active Value

Annual contract value across all active revenue streams. This is a **forward-looking annual figure**, not a sum of planned invoices.

| Component | Calculation | Filter |
|---|---|---|
| Projects | `contract_value` (fixed) or `contract_value × 12` (maintenance type) | Active projects only (`status = 'active'`); projects with `contract_value = null` contribute `0` but set the Variable flag |
| Hosting | `hostingContractValue(h)` — monthly: `amount × months_in_contract` (or `× 12` if no expiry); yearly: `amount` as-is | Active hosting clients only (`status = 'active'`) |
| Domains | `yearly_amount` per domain | Non-archived domains only (`archived = false`) |
| Maintenance | `monthly_retainer × 12` | Active maintenance contracts only (`status = 'active'`) |

**Total:** Sum of all four components above.

**Variable flag:** Shown as `+ variable` if any active project has `contract_value = null` (e.g. a time-and-materials project with no fixed value).

> Change Requests are not included directly — when a CR is approved, an invoice is planned for it, which then flows into the revenue planner and appears in Invoice YTD once issued.

---

## Invoice YTD

Total revenue **actually issued or paid** to this client in the current calendar year.

- Reads from `revenue_planner` rows for the 12 months of the current year
- **Included statuses:** `issued`, `paid` only
- **Excluded:** `planned`, `retainer`, `deferred`, `cost`
- **Amount used:** `actual_amount` if set; falls back to `planned_amount`
- **Categories covered:** Projects, Maintenance, Hosting, Domains (all resolved via the row's foreign key joins)

### Client resolution per row type

| Row type | Client resolved via |
|---|---|
| Project invoice | `revenue_planner.project → projects.client_id` |
| Maintenance invoice | `revenue_planner.maintenance → maintenances → clients.id` |
| Hosting invoice | `revenue_planner.hosting_client → hosting_clients → clients.id` |
| Domain invoice | `revenue_planner.domain → domains → clients.id` |

---

## Adding / Editing Clients

- **New Client** button opens a modal with: Name, Email, Phone, Address, VAT number, Accounting email, Contact person, Contact email, Contact phone
- Clients can also be created inline when adding a project, hosting entry, or domain
- Edit opens the same modal pre-filled
- Archive removes the client from the active list (soft delete via `archived` flag)

---

## Supabase Schema

### `clients` table
```
id               uuid  PK
name             text  NOT NULL
email            text
phone            text
address          text
vat_number       text
accounting_email text
contact_person   text
contact_email    text
contact_phone    text
archived         bool  DEFAULT false
created_at       timestamptz
```

### Related tables (foreign keys into `clients`)
- `projects.client_id → clients.id`
- `hosting_clients.client_id → clients.id`
- `domains.client_id → clients.id`
- `maintenances.client_id → clients.id`

---

## Known Issues / Gaps

| # | Issue | Severity |
|---|---|---|
| 1 | Archived domains still count as `Domains: Yes` in the column indicator | Minor |
| 2 | Invoice YTD only covers the current calendar year (no multi-year view) | By design |
