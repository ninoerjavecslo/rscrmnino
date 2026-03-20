# Financial Calculations — Technical Specification

Every formula, data source, and filter used across the application.
Generated 2026-03-20 from source code audit.

---

## Table of Contents
1. [Shared Helpers](#1-shared-helpers)
2. [ThisMonthView — Monthly Invoice Dashboard](#2-thismonthview)
3. [StatisticsView — Analytics Dashboard](#3-statisticsview)
4. [ForecastView — Revenue Forecasting](#4-forecastview)
5. [SalesView — Pipeline](#5-salesview)
6. [ClientDetailView — Per-Client Data](#6-clientdetailview)
7. [ClientsView — Client List](#7-clientsview)
8. [ProjectDetailView — Per-Project Data](#8-projectdetailview)
9. [MaintenanceDetailView — Per-Maintenance Data](#9-maintenancedetailview)
10. [InfrastructureView — Hosting & Costs](#10-infrastructureview)
11. [ProjectsView — Project List](#11-projectsview)

---

## 1. Shared Helpers

### 1.1 `dealTotal(item: PipelineItem): number`
Used in: SalesView, ClientDetailView, StatisticsView, ForecastView

```
if deal_type === 'fixed' AND monthly_schedule has entries:
  return SUM(monthly_schedule[].amount)

if deal_type === 'monthly' AND expected_month AND expected_end_month:
  months = (endYear - startYear) * 12 + (endMonth - startMonth) + 1
  return estimated_amount * MAX(1, months)

else:
  return estimated_amount ?? 0
```

### 1.2 `hostingAnnualValue(h, year): number`
Defined in: `src/lib/types.ts`

```
if cycle === 'yearly':
  return amount

if cycle === 'monthly':
  effStart = MAX(yearStart, billing_since ?? yearStart)
  effEnd   = MIN(yearEnd, contract_expiry ?? yearEnd)
  if status === 'cancelled' AND cancelled_from:
    effEnd = MIN(effEnd, cancelled_from - 1 month)
  if effStart > effEnd: return 0
  months = (ey - sy) * 12 + (em - sm) + 1
  return MAX(0, months * amount)
```

### 1.3 `hostingContractValue(h): number`
Defined in: `src/lib/types.ts`

```
if cycle === 'monthly': return amount * 12
if cycle === 'quarterly': return amount * 4
if cycle === 'semi-annual': return amount * 2
if cycle === 'yearly': return amount
else: return 0
```

### 1.4 `hostingActiveInMonth(h, monthStr): boolean`
Defined in: `src/lib/types.ts`

Checks if a hosting entry is active in a given month considering `billing_since`, `contract_expiry`, `cancelled_from`, and `status`.

### 1.5 `crEffectiveAmount(cr): number`
Used in: ProjectDetailView, ProjectsView

```
if cr.deal_type === 'fixed' AND cr.monthly_schedule exists:
  return SUM(schedule[].amount)
else:
  return cr.amount ?? 0
```

### 1.6 Status Values Reference

| Table | Statuses |
|-------|----------|
| RevenuePlanner | `planned`, `issued`, `paid`, `deferred`, `retainer`, `cost` |
| PipelineItem | `proposal`, `won`, `lost` |
| ChangeRequest | `pending`, `approved`, `confirmed` |
| Hosting | `active`, `paused`, `cancelled` |
| InfraCost | `active`, `inactive` |
| Maintenance | `active`, `paused`, `cancelled` |

---

## 2. ThisMonthView

### 2.1 Planned Total
```
plannedTotal =
  nonHostingRows.SUM(planned_amount)
  + maintenanceHostingExtra
  + standaloneHostingTotal
  + yearlyHostingTotal
  + domainsDueTotal
```

**nonHostingRows:** `rpStore.rows` where:
- `month === currentMonth`
- `hosting_client_id IS NULL`
- `status !== 'cost'`
- has `project_id` OR `maintenance_id` OR `domain_id`

**maintenanceHostingExtra:** For each maintenance RP row (not CR, not cost, not domain):
- Find linked hosting: `infraStore.hostingClients` where `maintenance_id` matches, `cycle='monthly'`, active in month
- SUM their `amount`

**standaloneHostingTotal:** `infraStore.hostingClients` where:
- `cycle='monthly'`, `!maintenance_id`, active in currentMonth
- SUM of `amount`

**yearlyHostingTotal:** `infraStore.hostingClients` where:
- `cycle='yearly'`, `billing_month === currentMonthNumber`, active, `!maintenance_id`
- If already in RP: use RP row's `planned_amount`
- If not in RP: use hosting `amount`

**domainsDueTotal:** `domainsStore.domains` where:
- Not in RP for this month
- Billing anniversary month (from `registered_date ?? expiry_date`) matches currentMonth
- Not archived
- SUM of `yearly_amount`

### 2.2 Issued Total
```
issuedTotal =
  issuedRows.SUM(actual_amount ?? planned_amount)
  + confirmedStandaloneHostingTotal
  + confirmedYearlyHostingTotal
```

**issuedRows:** nonHostingRows where `status IN ('issued', 'paid')`

**confirmedStandaloneHostingTotal:** standalone monthly hosting where `id IN confirmedHostingIds`

**confirmedHostingIds:** Set of `hosting_client_id` from RP rows where `status IN ('issued', 'paid')` in currentMonth

**confirmedYearlyHostingTotal:** yearly hosting RP rows where `status IN ('issued', 'paid')`

### 2.3 Not Yet Issued Total
```
notYetIssuedTotal =
  notYetIssuedRows.SUM(planned_amount)
  + notYetIssuedMaintHostingExtra
  + notYetIssuedStandaloneHosting
  + notYetIssuedYearlyHosting
  + domainsDueTotal
```

**notYetIssuedRows:** nonHostingRows where `status === 'planned'` AND `domain_id IS NULL`

**notYetIssuedMaintHostingExtra:** Same as maintenanceHostingExtra but only for planned maintenance rows without CR notes

**notYetIssuedStandaloneHosting:** standalone monthly hosting NOT in `confirmedHostingIds`

**notYetIssuedYearlyHosting:** yearly hosting RP rows where `status === 'planned'`

### 2.4 Delta
```
delta = issuedTotal - plannedTotal
```

---

## 3. StatisticsView

### 3.1 Total Invoiced YTD
```
totalInvoicedYTD = ytdRows
  .filter(status IN ('issued', 'paid'))
  .SUM(actual_amount ?? 0)
```
Where `ytdRows = rpStore.rows.filter(month starts with currentYear)`

### 3.2 MRR (Monthly Recurring Revenue)
```
mrrRetainers = rpRows
  .filter(month === currentMonthStr AND status === 'retainer')
  .SUM(planned_amount)

mrrHosting = infraStore.hostingClients
  .filter(status === 'active' AND cycle === 'monthly')
  .SUM(amount)

mrr = mrrRetainers + mrrHosting
```

### 3.3 Revenue Mix (Annual Planned)

| Source | Formula | Store |
|--------|---------|-------|
| Projects | ytdRows where has project_id, no maintenance/hosting/domain, status not cost/deferred → SUM(actual_amount ?? planned_amount) | rpStore |
| Maintenance | Active maintenances → `monthly_retainer * prorated_months_this_year` | maintStore |
| Hosting | Active hosting → SUM(hostingAnnualValue(h)) | infraStore |
| Domains | Non-archived, non-expired → SUM(yearly_amount) | domainsStore |

**Maintenance proration:**
```
effStart = MAX(yearStart, contract_start ?? yearStart)   // YYYY-MM format
effEnd   = MIN(yearEnd, contract_end ?? yearEnd)
if effStart > effEnd: months = 0
else: months = (ey - sy) * 12 + (em - sm) + 1
value = monthly_retainer * months
```

### 3.4 Year Forecast Data (Jan–Dec)
For each month in current year:

```
mRows = rpRows.filter(month === m, status not cost/deferred)

actual = (isPast) ? mRows.filter(issued|paid).SUM(actual_amount) : null
plan   = mRows.filter(planned|retainer).SUM(planned_amount)

For pipeline items (status !== 'won'|'lost'):
  amt = pipelineAmountInMonth(item, m)
  pipelineWeighted += amt * (probability / 100)
  pipelineBest += amt

pipeline = (!isPast AND pipelineBest > 0) ? pipelineBest : null
```

**pipelineAmountInMonth(item, month):**
```
if fixed + schedule: schedule entry for that month, or 0
if monthly: estimated_amount if month in [expected_month..expected_end_month], else 0
else: estimated_amount if expected_month === month, else 0
```

### 3.5 Projection Summary
```
futureMonths = yearForecastData.filter(!isPast)

confirmedRemaining    = futureMonths.SUM(plan ?? 0)
pipelineWeightedTotal = futureMonths.SUM(pipelineWeighted)
pipelineFaceTotal     = futureMonths.SUM(pipelineBest)
projectedYearEnd      = totalInvoicedYTD + confirmedRemaining + pipelineFaceTotal
```

### 3.6 Monthly Chart (Plan vs Actual)
For each month Jan–Dec:
```
mRows = rpRows.filter(month === m, status not cost/deferred)
plan   = mRows.SUM(planned_amount)
actual = mRows.filter(issued|paid).SUM(actual_amount ?? planned_amount)
```

### 3.7 Maintenance Stats
```
activeMaintenances = maintStore.filter(status === 'active')
totalMRR           = activeMaintenances.SUM(monthly_retainer)
annualValue        = totalMRR * 12
avgRetainer        = totalMRR / activeMaintenances.length (or 0)
```

### 3.8 Hosting & Infrastructure Margins
Per provider:
```
revenue = SUM hostingAnnualValue(h) for hosting clients with that provider
cost    = SUM costAnnualValue(c) for infra costs with that provider
margin  = revenue - cost
```

### 3.9 Client Analytics — Top 5 by Invoiced YTD
```
Map<clientId, amount> from ytdRows where issued|paid
  clientId = r.project?.client_id ?? r.maintenance?.client?.id
             ?? r.hosting?.client?.id ?? r.domain?.client?.id
  amount += r.actual_amount ?? 0
Sort desc, take 5
```

### 3.10 Win Rate
```
wonYTD  = pipeline.filter(status === 'won', created_at in currentYear)
lostYTD = pipeline.filter(status === 'lost', created_at in currentYear)
winRate = wonYTD.length / (wonYTD.length + lostYTD.length) * 100
```

### 3.11 Change Request Stats
```
totalCRValue = approvedCRs.SUM(amount ?? 0)
avgCRValue   = totalCRValue / approvedCRs.length
maxCR        = MAX(approvedCRs.amount)
```

---

## 4. ForecastView

### 4.1 Confirmed Revenue by Month
For each month in selected year:

```
confirmedByMonth[m] =
  clientRpRows for month m
  + hostingByMonth[m]
  + domainsByMonth[m]
```

**Client RP rows:** Revenue planner rows with resolvable client (via project/maintenance joins)
- issued/paid: `actual_amount ?? planned_amount`
- For issued maintenance rows: subtract linked monthly hosting (tracked separately)
- CR rows: no hosting deduction
- deferred: 0
- planned/retainer: `planned_amount`

**hostingByMonth:** Per month:
- Monthly hosting: active, not paused, `hostingActiveInMonth` true, before contract_expiry
- Skip months where maintenance was deferred
- Yearly hosting: `billing_month === monthNumber`, active, before expiry

**domainsByMonth:** Per month:
- Billing month = month from `registered_date ?? expiry_date`
- Archived domains: only count if billing month already passed this year
- SUM `yearly_amount`

### 4.2 Pipeline Face by Month
```
pipelineFaceByMonth[m] =
  SUM pipelineAmountInMonth(item, m) for active pipeline items
  + SUM cr.amount for pending CRs with expected_month === m
```

**Active pipeline:** `status !== 'won' && status !== 'lost'` with revenue in year's months

**Pending CR pipeline:** CRs with `amount`, `expected_month` in year, not already in RP (no matching `CR: {title}` note)

### 4.3 Costs by Month
```
costsByMonth[m] =
  infraCosts where active OR (inactive AND m < cancelled_from)
    → SUM monthly_cost
  + RP rows where status === 'cost' AND maintenance_id present
    → SUM actual_amount ?? planned_amount
```

### 4.4 Summary Cards
```
totalConfirmed   = SUM confirmedByMonth across year
totalPipelineFace = SUM pipelineFaceByMonth across year
totalBestCase    = totalConfirmed + totalPipelineFace
totalLikely      = totalConfirmed
                   + pipeline items with probability >= 50 (face value)
                   + pending CRs with probability >= 50
totalCosts       = SUM costsByMonth across year
```

---

## 5. SalesView

### 5.1 Scenario Totals
```
activeItems = items.filter(status !== 'won' AND status !== 'lost')

totalFace      = activeItems.SUM(dealTotal(item))
totalLikely    = activeItems.filter(probability >= 50).SUM(dealTotal(item))
totalHopefully = activeItems.filter(probability >= 25).SUM(dealTotal(item))
totalWon       = items.filter(status === 'won').SUM(dealTotal(item))
```

### 5.2 Forecast by Month
For each active item, distribute into months:

```
Map<month, { face, likely, hopefully, count }>

For fixed + schedule: each schedule entry → addToMonth(entry.month, entry.amount)
For monthly: each month in [expected_month..expected_end_month] → addToMonth(m, estimated_amount)
For one-time: addToMonth(expected_month, estimated_amount)

addToMonth adds to:
  face += amount
  likely += amount (if probability >= 50)
  hopefully += amount (if probability >= 25)
  count += 1
```

---

## 6. ClientDetailView

### 6.1 Recurring Revenue (Overview tab)
```
recurringMonthly =
  maintenances.filter(client, active).SUM(monthly_retainer)
  + infraStore.hostingClients.filter(client, active, monthly).SUM(amount)

recurringAnnual = recurringMonthly * 12
  + domainsStore.filter(client, !archived).SUM(yearly_amount)
```

### 6.2 Pipeline Stats
```
activePipelineItems = pipelineItems.filter(status !== 'won' AND status !== 'lost')
pipelineWeighted = activePipelineItems.SUM(dealTotal(i) * probability / 100)
```

### 6.3 Pipeline Forecast (per month)
For each active pipeline item, distribute using same logic as SalesView:
```
Map<month, { items[], total (face), weighted (probability-adjusted) }>
```

### 6.4 Other Income Rows
```
otherIncomeRows = allClientRpRows
  .filter(project_id != null AND !maintenance_id AND !hosting_client_id AND !domain_id)
  .sort by month desc
```
Note: When adding new "Other Income" entries, an auto-created project named "Other Income" is used as the project_id anchor.

### 6.5 Full Invoice History
```
fullInvoiceHistory = allClientRpRows
  .filter((issued OR paid) AND (actual_amount ?? planned_amount) > 0)
  .sort by month desc
```

---

## 7. ClientsView

### 7.1 Invoiced by Client
```
Map<clientId, amount>

For each RP row where status IN ('issued', 'paid') AND status !== 'cost':
  clientId = r.project?.client_id
           ?? r.maintenance?.client?.id
           ?? r.hosting?.client?.id
           ?? r.domain?.client?.id
  map[clientId] += actual_amount ?? planned_amount ?? 0
```

Data range: `ALL_MONTHS` array = `[currentYear-2 .. currentYear+1]` (4 years)

---

## 8. ProjectDetailView

### 8.1 Effective Budget
```
if type === 'fixed':
  effectiveBudget = initial_contract_value ?? contract_value ?? 0

if type IN ('variable', 'maintenance'):
  effectiveBudget = invoiceRows
    .filter(status !== 'cost' AND notes not startsWith 'CR:')
    .SUM(planned_amount)
```

### 8.2 Total Invoiced
```
totalInvoiced = invoiceRows
  .filter(status !== 'cost')
  .SUM(actual_amount)
```

### 8.3 Total Costs
```
totalCosts = costRows.SUM(actual_amount)
  where costRows = rpRows.filter(status === 'cost')
```

### 8.4 Change Request Totals
```
crTotal         = allCRs.SUM(crEffectiveAmount(cr))
crApprovedTotal = allCRs.filter(status === 'approved').SUM(crEffectiveAmount(cr))
```

### 8.5 Left to Invoice
```
leftToInvoice = MAX(0, effectiveBudget + crApprovedTotal - totalInvoiced)
```

### 8.6 Total Value & Progress
```
totalValue  = effectiveBudget + crApprovedTotal
invoicedPct = (totalInvoiced / totalValue) * 100   // if totalValue > 0
```

---

## 9. MaintenanceDetailView

### 9.1 Total Invoiced
```
totalInvoiced = invoiceRows
  .filter(status IN ('issued', 'paid'))
  .SUM(actual_amount ?? 0)
```

### 9.2 Hosting Monthly Amount
```
hostingMonthlyAmt = (hosting?.cycle === 'monthly') ? hosting.amount : 0
```

### 9.3 Extra Billed (Overages)
```
extraBilledRetainers = invoiceRows
  .filter(status IN ('issued', 'paid') AND notes not startsWith 'CR:')
  .SUM(MAX(0, actual_amount - planned_amount - hostingMonthlyAmt))
```

### 9.4 CR Billed
```
extraBilledCRs = invoiceRows
  .filter(status IN ('issued', 'paid') AND notes startsWith 'CR:')
  .SUM(actual_amount ?? planned_amount)
```

---

## 10. InfrastructureView

### 10.1 Hosting Revenue Per Year
```
totalRevenuePerYear = infraStore.hostingClients.SUM(hostingAnnualValue(h, selectedYear))
```

### 10.2 Infrastructure Cost Annual Value
```
costAnnualValue(cost, year):
  if status === 'inactive' AND no cancelled_from: return 0
  if status === 'active': return monthly_cost * 12
  if cancelled_from exists:
    months from yearStart to cancelled_from (exclusive)
    return MAX(0, months * monthly_cost)
```

### 10.3 Provider Margins
```
Per provider:
  revenue = SUM hostingAnnualValue(h) for clients with that provider
  cost    = SUM costAnnualValue(c) for costs with that provider
  margin  = revenue - cost
  margin% = (margin / revenue) * 100
```

---

## 11. ProjectsView

### 11.1 Portfolio Value
```
For each active project:
  if fixed: base = initial_contract_value ?? contract_value ?? 0
  if variable|maintenance: base = rpRows.filter(!cost).SUM(planned_amount)
  crValue = approvedCRs.filter(project_id).SUM(crEffectiveAmount)
  projectTotal = base + crValue

portfolioValue = SUM(projectTotal) for all active projects
```

### 11.2 Invoiced YTD (Projects only)
```
invoicedYTD = rpRows
  .filter(has project_id, no maintenance/hosting/domain, issued|paid, currentYear)
  .SUM(actual_amount)
```

---

## Data Flow Summary

```
                         ┌─── rpStore.rows ──────────────────────┐
                         │  (revenue_planner table)              │
                         │  Fields: month, status, planned_amount│
                         │          actual_amount, project_id,   │
                         │          maintenance_id, hosting_id,  │
                         │          domain_id, notes, probability│
                         └───────────────────────────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                               ▼
  ThisMonthView                   StatisticsView                  ForecastView
  (single month)                  (YTD + forecast)                (multi-month)
        │                               │                               │
        │                               ▼                               │
        │                     ┌── Pipeline Store ──┐                    │
        │                     │  dealTotal()       │                    │
        │                     │  scenario totals   │◄───── SalesView   │
        │                     └────────────────────┘                    │
        │                               │                               │
        ▼                               ▼                               ▼
  ┌── infraStore ────────────────────────────────────────────────────────┐
  │  hostingClients[]: amount, cycle, billing_month, status, provider   │
  │  infraCosts[]: monthly_cost, status, cancelled_from, provider       │
  └─────────────────────────────────────────────────────────────────────┘
        │
        ▼
  ┌── maintStore ────────────────────────────────────────────┐
  │  maintenances[]: monthly_retainer, contract_start/end    │
  └──────────────────────────────────────────────────────────┘
        │
        ▼
  ┌── domainsStore ──────────────────────────────────────────┐
  │  domains[]: yearly_amount, registered_date, expiry_date  │
  └──────────────────────────────────────────────────────────┘
        │
        ▼
  ┌── crStore ───────────────────────────────────────────────┐
  │  changeRequests[]: amount, status, deal_type, schedule   │
  │  approvedCRs, pendingCRs (filtered views)                │
  └──────────────────────────────────────────────────────────┘
```
