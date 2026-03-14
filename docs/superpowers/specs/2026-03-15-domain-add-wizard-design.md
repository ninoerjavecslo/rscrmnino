# Domain Add Wizard — Design Spec
**Date:** 2026-03-15
**Status:** Approved

---

## Overview

Enhance the "Add Client Domains" modal into a 2-step flow that covers the full domain onboarding workflow: adding domain records, planning the invoice, and generating email templates for the registrar and accounting. Quick adds (no invoice, no emails) remain frictionless — Step 2 is optional and can be dismissed immediately.

---

## Step 1 — Domain info (extended current form)

### Domain rows — new/renewal toggle

Each domain row gets a **New / Renewal** toggle button (two-state pill). This controls the Slovenian text in the accounting email:
- **New** → `Zakup domene X za 1 leto (velja do DD. M. YYYY) — N EUR`
- **Renewal** → `Podaljšanje domene X za 1 leto (velja do DD. M. YYYY) — N EUR`

Default: **New**.

### Invoice planning section (optional, always visible)

Below the domain rows, a lightly styled box labelled "Invoice planning — optional":

- **Invoice month** — `<input type="month">`. Leave empty to skip.
- **Status pills** — two options, only active when month is filled:
  - `Plan for this month` → inserts `revenue_planner` row with `status: 'planned'`
  - `Already billed` → inserts `revenue_planner` row with `status: 'issued'`

If month is left empty, no `revenue_planner` row is created. The user can invoice the domain later from the Billing column in the table (existing flow).

### Footer buttons

- **Cancel** — closes modal, no save
- **Save & add new** — saves domains + invoice row (if month filled), resets form, stays on Step 1. Skips Step 2.
- **Save → Next step ›** — saves domains + invoice row, transitions modal content to Step 2

---

## Step 2 — Email actions (optional)

Modal header changes to "Next steps" with step indicator "Step 2 of 2". User can click **Done** at any time to close.

### Success banner

Green banner: "N domains saved — [name1], [name2]" + badge showing invoice status if one was planned (e.g. "Planned: March 2026").

### Invoice summary row (conditional)

Only shown if an invoice was planned in Step 1. Blue-tinted row: "Dodano v plan računov za [month] · [total €] · [status]".

### Siel order email block

- Label: "Naročilo — Siel", address: `registrar@siel.si` (hardcoded, user edits after copy)
- Copy button
- Template (Slovenian):
  ```
  Pozdravljeni,

  prosimo vas, da registrirate naslednje domene:

  - [domain1]
  - [domain2]

  Hvala in lep pozdrav,
  Renderspace
  ```

### Accounting email block

- Label: "Obvestilo — računovodstvo", address: hardcoded internal address
- **Editable payment days field** — numeric input pre-filled with `30`, shown above the email body. Changing it live-updates the copied text.
- Copy button
- Template (Slovenian), auto-built from Step 1 data:
  ```
  Stranka: [client.name]
  Datum storitve: [today DD. M. YYYY]
  Rok plačila: [N] dni

  [project_pn] — Zakup/Podaljšanje domene [name] za 1 leto (velja do [DD. M. YYYY]) — [N] EUR
  ```

Each domain line uses the New/Renewal toggle from Step 1.

### Footer

- "Kopirajte kar potrebujete, nato zaprite" (left, muted)
- **Done** button — closes modal

---

## Data model — no changes needed

`revenue_planner` already supports `domain_id` + `status: 'planned' | 'issued'`. No schema changes required.

The `Domain` type already has `project_pn`, `yearly_amount`, `expiry_date`, and `client` join — all needed for email generation.

---

## Behaviour notes

- **"Save & add new"** skips Step 2 entirely, resets form for another domain batch
- **Billing column in table** — existing "Invoice" button flow (for renewals from the table) is unchanged
- The accounting email is a **copy template only** — it is not sent programmatically
- Payment days field is ephemeral (not stored), only used for the email copy
- If no domains have `yearly_amount` set, the accounting email omits the EUR amounts gracefully (shows `—`)
- The "New / Renewal" toggle defaults to **New** for all rows

---

## Out of scope

- Sending emails programmatically
- Storing the registrar email address per-client
- Per-client accounting email addresses
- Editing the email body directly in the UI (user copies and edits in their mail client)
