# Renderspace Invoice Tracker — Product Specification v4

## Overview

A single-user invoice and revenue management tool for a small creative agency (Renderspace). It tracks planned vs. actual invoicing across projects, manages costs, and provides financial reporting. The interface is a web app with a persistent sidebar nav and 8 main screens.

---

## Navigation

Sidebar with two sections:

**Overview**
- Dashboard
- Statistics

**Clients & Projects**
- Clients
- Projects

**Invoices**
- Revenue Planner
- This Month

**Tools**
- Tools
- Email Tool

Bottom: user avatar + name (Nino, Admin)

---

## Screens

### 1. Revenue Planner (default)

**Purpose:** Plan revenue and costs across all projects for a 6-month period.

**Header controls:** Period selector (H1/H2/FY), prev/next arrows, Export button, Add Entry button.

**KPI strip (5 cards):**
- Total Planned H1
- Fixed (€ + project count)
- Maintenance (€ + "Recurring")
- Retainer (~70% probability, €)
- Issued YTD (€)

**Planning grid (scrollable table):**
- Rows: per project, with a sub-row for Costs
- Columns: Project/Client label, Jan–Jun, Total
- Each cell is a clickable button showing amount or "—"
- Cell color states: **Paid** (green), **Issued** (blue), **Planned** (purple), **Retainer** (amber), **Costs** (red)
- Project name is a link to Single Project view; has a type badge (Fixed / Maintenance / Retainer)
- Footer row: monthly totals with revenue + costs breakdown
- Legend at bottom; "Click any cell to view details" hint

**Add Entry modal (3 tabs):**
- **One time:** month picker, amount, probability (Fixed/Maybe/Unlikely/Low), optional description
- **Monthly:** from/to month range, generates per-month rows with editable amount + probability selector; running total
- **Ad-hoc:** for work not tied to a project — client selector, month, description, amount, probability

---

### 2. This Month

**Purpose:** Confirm or defer planned invoices for the current month.

**Header controls:** Month navigation (prev/next arrows + label).

**KPI strip (4 cards):**
- Planned this month
- Issued (€ + count)
- Not yet issued (€ + count)
- Delta plan vs. actual

**Planned invoices table:**
- Columns: Project, Client, Planned, Actual amount (editable input for pending), Status badge, Actions
- Statuses: Issued (blue), Not issued (amber/pending highlight)
- Actions for pending rows: **Confirm** (green) + **Not Invoiced** (opens modal)
- "Ad-hoc invoice" button to add one-off invoice

**Costs this month table:**
- Columns: Project, Description, Planned, Actual, Edit button
- "Add cost" button

---

### 3. Clients

**Purpose:** List all clients with aggregated project and invoice data.

**Header:** New Client button (opens modal)

**Table columns:** Client name (link), Projects (count), Active value, Invoiced YTD, View button

---

### 4. Single Client

**Purpose:** Client detail view.

**Breadcrumb:** ← Clients

**KPI strip (4 cards):** Projects, Total Value, Invoiced YTD, Total Costs

**Projects table:** Project name, Type badge, Value, PM, Invoiced (€ + progress bar), Status badge, View button

**Recent invoices table:** Month, Project, Planned, Actual, Status badge, Email button (quick-send action)

**Header actions:** Edit, New Project

---

### 5. Projects

**Purpose:** Full project portfolio list.

**KPI strip (4 cards):** Total projects, Portfolio value, Invoiced YTD, Costs YTD

**Table columns:** # (RS-YYYY-NNN), Project, Client, Type badge, Value, PM, Invoiced (€ + progress bar), Status badge, Edit button

---

### 6. Single Project

**Purpose:** Full project detail.

**Breadcrumb:** ← Projects

**Title:** Project name + ID badge + client + type badge

**Field grid (2 rows × 3 cols):** Client, PM, Type, Value, Total Invoiced (% complete), Total Costs

**Invoice Plans table (synced with planning grid):**
- Columns: Month, Description, Planned, Actual (editable for pending), Status, Actions
- Pending rows highlighted; Confirm + Not Invoiced actions
- "Add invoice plan" button

**Project Costs table:**
- Columns: Month, Description, Amount (red), Edit
- "Add cost" button

---

### 7. Dashboard

**Purpose:** CEO-level monthly snapshot.

**Header controls:** Month selector, Export PDF

**KPI strip (4 cards):**
- Invoiced this month (€ + count)
- Planned not issued (€ + count)
- Plan vs. Actual (delta €, note if over/under)
- Costs this month

**Invoice table:**
- Columns: Project, Client, Type, Planned, Actual, Delta, Status, Email action
- Pending rows highlighted with Confirm action

---

### 8. Statistics

**Purpose:** Revenue performance and forecasting.

**Header controls:** Period selector (YTD / H1 / H2 / FY), Export

**KPI strip (4 cards):**
- Revenue issued
- Avg / month
- Collection rate (%)
- Costs ratio (%)

**Charts:**
- **Monthly Revenue** — bar chart, Planned vs. Issued vs. Costs
- **Revenue by Type** — donut chart, Fixed / Maintenance / Retainer (€ + %)
- **Revenue by Client** — horizontal bar chart, YTD issued per client
- **Upcoming Forecast** — next 3 months list (month, type + probability note, amount); 3-month total at bottom

---

### 9. Email Tool

**Purpose:** Generate a Slovenian invoice request email for the accountant.

**Left panel (inputs):**
- Date of service (month picker)
- Payment terms (days)
- Client / Company
- Project ref (optional)
- Line items table (Ref #, Description, Amount EUR) — add/remove rows; running total
- Generate email button

**Right panel:**
- Generated email preview (monospace, pre-wrap)
- Copy button
- Open in Mail button

---

### 10. Tools

**Purpose:** Utility launcher listing available tools.

**AI Tools section:**
- **AI Hour Distribution Tool** *(Draft)* — paste PN projects, set % allocations, pick month + hours; AI (Claude) generates a filled Časovnice timesheet exportable as .xlsx

**Utilities section:**
- **Email Tool** — links to Email Tool screen
- **Hosting Invoice Generator** *(Draft)* — build monthly "Gostovanja" table for accounting with hosting clients, PN numbers, services, prices; columns: Naročnik, PN, Storitev, Število, Cena/kos, Vrednost, Rok plačila

---

## Modals

| Modal | Trigger |
|---|---|
| Add planned invoice | Revenue Planner → Add Entry, Single Project → Add invoice plan |
| Not Invoiced | "Not Invoiced" button on pending invoice rows |
| Add cost | "Add cost" button on Single Project or This Month |
| New Client | Clients → New Client |
| New Project | Client detail → New Project, Projects → New Project |
| Ad-hoc invoice | This Month → Ad-hoc invoice |

---

## Data Model (inferred)

**Client:** name, since date

**Project:** id (RS-YYYY-NNN), name, client, type (Fixed / Maintenance / Retainer), value, PM, status (Active / Planned / Archived)

**Invoice Plan:** project, month, planned amount, actual amount, probability (100/50/30/10%), status (Planned / Issued / Paid / Not issued), description

**Cost:** project, month, description, planned amount, actual amount

---

## Invoice Status Flow

`Planned` → `Issued` → `Paid`
`Planned` → `Not Invoiced` (with reason + optional rescheduled month)

---

## Project Types

| Type | Behavior |
|---|---|
| **Fixed** | Lump sum, milestones over months |
| **Maintenance** | Recurring monthly fixed fee |
| **Retainer** | Recurring, shown at ~70% probability by default in forecasts |

---

## Design System

- Font: Figtree
- Primary color: purple `#7c3aed`
- Neutral scale: zinc (`--c0` through `--c8`)
- Status colors: green (paid), blue (issued), purple (planned), amber (retainer/pending), red (costs/negative)
- Border radius: 10px cards, 100px pills/buttons
- Background: `#f1f1f4`
