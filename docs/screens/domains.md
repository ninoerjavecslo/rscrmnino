# Domains Screen

**Route:** `/domains`
**File:** `src/views/DomainsView.tsx`

---

## Purpose

Track all client domain registrations — expiry dates, renewal billing, and invoice status. Drives renewal reminders and domain revenue planning.

---

## Data Sources

| Store | Table | Purpose |
|---|---|---|
| `useDomainsStore` | `domains` | Domain list + expiry status |
| `useClientsStore` | `clients` | Client assignment dropdown |
| Revenue Planner (direct Supabase) | `revenue_planner` | Billing status per domain |

---

## Domain Fields

| Field | Required | Notes |
|---|---|---|
| `domain_name` | Yes | e.g. `example.si` |
| `client_id` | No | Links domain to a client |
| `project_pn` | No | Project/order number for accounting references |
| `registered_date` | No | Purchase/registration date (DD/MM/YYYY in UI, stored as YYYY-MM-DD) |
| `expiry_date` | Yes | Renewal deadline — drives all alerts and reminders |
| `yearly_amount` | No | Renewal cost in EUR — used as default planned invoice amount |
| `contract_id` | No | Contract or order reference ID |
| `registrar` | No | Domain registrar name |
| `auto_renew` | No | Whether the domain auto-renews |
| `billable` | No | Whether this domain is billed to the client |
| `archived` | No | Soft-delete — hides from active view, preserves history |
| `notes` | No | Free-text notes |

---

## Expiry Date & Reminders

The `expiry_date` field is the core of domain tracking. Status is computed client-side on every load:

| Status | Condition | Badge |
|---|---|---|
| `active` | More than 30 days remaining | Green — "Active" |
| `expiring_soon` | 8–30 days remaining | Amber — "Expires in Xd" |
| `expired` | Past expiry date | Red — "Expired" |

### Alert thresholds
- **Critical** (≤ 7 days): counted in the red stats card, surfaces in dashboard alerts
- **Expiring soon** (8–30 days): counted in the amber stats card

These thresholds are defined in `src/stores/domains.ts` via `critical()` and `warningSoon()` selectors and are used across Dashboard and ClientDetailView to show warnings.

---

## Invoice Planning

Domains are invoiced annually (renewal cost = `yearly_amount`). There are two ways to add a domain to the invoice plan:

### 1. At domain creation time
When adding one or more domains, the form includes an optional "Plan Invoice" section:
- **Invoice month** — pick the billing month (`YYYY-MM`)
- **Already billed** checkbox — if checked, status is set to `issued`; otherwise `planned`

This inserts a `revenue_planner` row for each domain with:
```
domain_id      = domain.id
month          = selected month + '-01'
planned_amount = domain.yearly_amount (or null if not set)
status         = 'planned' | 'issued'
probability    = 100
```

### 2. Via the "Invoice" button on an existing domain
When a domain has **≤ 60 days until expiry** and no invoice has been planned yet, an **Invoice** button appears in the Billing column.

Clicking it opens a modal to:
- Pick the billing month
- Set the amount (pre-filled with `yearly_amount`)
- Add a description/note

This inserts a `revenue_planner` row with `status = 'planned'`.

### Billing status badge (Billing column)
| revenue_planner status | Badge shown |
|---|---|
| `issued` or `paid` | Green — "Billed" |
| `planned` | Amber — "In plan" |
| No row + expiry ≤ 60 days | Button — "Invoice" |
| No row + expiry > 60 days | *(blank)* |

---

## Archiving a Domain

Archiving sets `archived = true` on the domain record. Effects:

- Domain disappears from the active domains table
- **Past `revenue_planner` rows are preserved** — historical invoices and statistics remain intact
- Domain no longer appears in billing options or future planning
- Domain no longer appears in client active value calculations
- Archived domains are shown in a collapsed "Archived Domains" section at the bottom of the page
- Can be un-archived from that section

---

## yearly_amount

The annual renewal cost of the domain in EUR. Used as:
- Default `planned_amount` when creating a revenue_planner row
- Pre-fills the Invoice modal amount field
- Aggregated in the "Total / year" footer and stats strip ("Annual domain revenue" stat card)
- Included in accounting email templates (Slovenian format)

If `yearly_amount` is null, invoice rows can still be created with a manually entered amount.

---

## Supabase Schema

### `domains` table
```
id               uuid        PK
client_id        uuid        FK → clients.id (nullable)
project_pn       text
domain_name      text        NOT NULL
registered_date  date
expiry_date      date        NOT NULL
yearly_amount    numeric
contract_id      text
registrar        text
auto_renew       bool        DEFAULT false
billable         bool        DEFAULT true
archived         bool        DEFAULT false
notes            text
status           text        GENERATED — 'active' | 'expiring_soon' | 'expired'
```

### revenue_planner rows for domains
```
domain_id        uuid        FK → domains.id ON DELETE SET NULL
status           text        'planned' | 'issued' | 'paid'
planned_amount   numeric     = yearly_amount at time of planning
actual_amount    numeric     set when marking as issued/paid
month            date        first of the billing month (YYYY-MM-01)
probability      int         always 100 for domains
```

---

## Known Issues / Gaps

| # | Issue | Severity |
|---|---|---|
| 1 | `registered_date` is stored but not used for any alert or reminder logic | By design |
| 2 | "Invoice" button only appears when ≤ 60 days to expiry — domains expiring further out must be invoiced at creation time | By design |
