# Domain Add Wizard — Design Spec
**Date:** 2026-03-15
**Status:** Approved

---

## Overview

Enhance the "Add Client Domains" modal into a 2-step flow covering the full domain onboarding workflow: adding domain records, planning the invoice, and generating email templates for the registrar and accounting. Quick adds (no invoice, no emails) remain frictionless — Step 2 is optional and dismissed with one click.

---

## Step 1 — Domain info (extended current form)

### Domain rows — new/renewal toggle

Each domain row gets a **New / Renewal** toggle (two-state pill button). Defaults to **New**. Controls the Slovenian line in the accounting email:
- **New** → `Zakup domene X za 1 leto (velja do DD. M. YYYY) — N EUR`
- **Renewal** → `Podaljšanje domene X za 1 leto (velja do DD. M. YYYY) — N EUR`

The grid layout for each row becomes: `1fr 130px 80px 110px 28px` (domain name, expiry date, €/yr, New/Renewal toggle, remove button).

### Invoice planning section (optional, always visible)

A lightly styled box below the domain rows, labelled "📅 Invoice planning — optional":

- **Invoice month** — `<input type="month">`. Leave empty to skip all invoice creation.
- **Status pills** — two options, only relevant when month is filled:
  - `Plan for this month` → inserts `revenue_planner` row(s) with `status: 'planned'`
  - `Already billed` → inserts `revenue_planner` row(s) with `status: 'issued'`

"Already billed" means the invoice has already been sent (issued) to the client — not necessarily paid. `'issued'` is the correct status.

**Cardinality:** one `revenue_planner` row is inserted **per domain** (not per batch), each with the domain's own `yearly_amount` as `planned_amount`. This matches the existing "Invoice" button flow. `probability` is always `100`.

**`addDomains` store change required:** the method must return the inserted domain records (add `.select()` to the Supabase insert) so their IDs are available for the `revenue_planner` inserts.

### Footer buttons

- **Cancel** — closes modal, no save
- **Save & add new** — saves domains + invoice rows (if month filled), resets form, stays on Step 1. **Step 2 is skipped.**
- **Save → Next step ›** — saves domains + invoice rows, transitions to Step 2. Step 2 shows data from **this batch only**.

---

## Step 2 — Email actions (optional)

Modal content replaces Step 1 in-place. Header title: "Next steps", step indicator: "Step 2 of 2". Same `maxWidth: 580`. User can click **Done** at any time to close.

### Success banner

Green banner: "N domain(s) saved — [name1], [name2]" + badge showing invoice status if one was planned (e.g. "Planned: March 2026"). Month displayed as `MMM YYYY` via `toLocaleString('en', { month: 'long', year: 'numeric' })`.

### Invoice summary row (conditional)

Only shown if an invoice was planned in Step 1. Blue-tinted row: "Dodano v plan računov za [month] · [total €] · [status label]".

### Siel order email block

- Header label: "Naročilo — Siel"
- To address: `registrar@siel.si` (hardcoded — user edits in their mail client)
- Copy button
- Template is **generic regardless of new/renewal** (user will adjust if needed):

```
Pozdravljeni,

prosimo vas, da registrirate naslednje domene:

- [domain1]
- [domain2]

Hvala in lep pozdrav,
Renderspace
```

### Accounting email block

- Header label: "Obvestilo — računovodstvo"
- To address: `fakturiranje@pristop.si` (hardcoded)
- **Editable payment days field** — numeric input pre-filled with `30`, inline above the email body. Changing it updates the copied text (reactive, not live-editing the textarea).
- Copy button
- Template auto-built from Step 1 data:

```
Stranka: [client.name]
Datum storitve: [today as DD. M. YYYY]
Rok plačila: [N] dni

[project_pn] — Zakup domene [name] za 1 leto (velja do [DD. M. YYYY]) — [N] EUR
[project_pn] — Podaljšanje domene [name] za 1 leto (velja do [DD. M. YYYY]) — [N] EUR
```

`project_pn` is a single value for the whole batch (from Step 1), shared across all domain lines. If no `yearly_amount` is set for a domain, omit the ` — N EUR` suffix.

### Footer

- Left: muted text "Kopirajte kar potrebujete, nato zaprite"
- Right: **Done** button — closes modal

---

## Store changes

### `useDomainsStore.addDomains`
- Add `.select()` to the Supabase insert so inserted domain records (with IDs) are returned
- Return the array of inserted `Domain` records

### `useRevenuePlannerStore` (or direct Supabase call in component)
- After domains are saved, if invoice month is set: insert one `revenue_planner` row per domain with:
  - `domain_id`: from returned domain record
  - `month`: `invoiceMonth + '-01'`
  - `planned_amount`: domain's `yearly_amount` (or `null`)
  - `status`: `'planned'` or `'issued'`
  - `probability`: `100`
  - `notes`: null

---

## Behaviour notes

- **"Save & add new"** skips Step 2, resets form for another domain batch
- **Billing column in table** — existing "Invoice" button flow (for renewals from the table) is unchanged
- The email blocks are copy templates only — not sent programmatically
- Payment days field is ephemeral (not stored)
- The New/Renewal toggle defaults to **New** for all rows
- `billedDomainIds` must be updated on **both** save paths (Save & add new AND Save → Next step), not just when Done is clicked in Step 2
- If `revenue_planner` inserts fail after domains are already saved: show a toast error, proceed to Step 2 anyway (domains are saved), but omit the invoice summary row

---

## Out of scope

- Sending emails programmatically
- Storing registrar or accounting email addresses per-client
- Editing email body directly in UI
- Per-domain payment day configuration
