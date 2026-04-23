---
phase: 01-database-foundation-rls
plan: 02
subsystem: database
tags: [postgres, supabase, rls, multi-tenancy, organization_id, migrations]

# Dependency graph
requires:
  - phase: 01-database-foundation-rls-01
    provides: organizations table with id PK — FK target for organization_id columns

provides:
  - nullable organization_id uuid FK column on 35 tenant-scoped tables
  - idx_{table}_organization_id index on all 35 tables for RLS query performance
  - structural prerequisite for RLS policies in plan 01-03

affects:
  - 01-database-foundation-rls-03 (RLS policies reference organization_id on these tables)
  - 03-backfill (Phase 3 MIG-01 populates organization_id on all rows, then adds NOT NULL)
  - all stores (will need organization_id in query filters after Phase 3)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "nullable FK column first, NOT NULL added after backfill (Pitfall 6 safety sequence)"
    - "idx_{table}_organization_id index naming convention for RLS-critical indexes"
    - "ALTER TABLE ... ADD COLUMN IF NOT EXISTS for idempotent migrations"
    - "CREATE INDEX IF NOT EXISTS for idempotent index creation"

key-files:
  created:
    - supabase/migrations/20260424000002_add_organization_id.sql
  modified: []

key-decisions:
  - "35 tables included — all confirmed by CREATE TABLE or ALTER TABLE evidence in migration files or stores"
  - "Studio-created tables (teams, resource_allocations, etc.) included based on 009_resource_tables_rls.sql ALTER TABLE IF EXISTS evidence"
  - "maintenances included — confirmed by ALTER TABLE maintenances in 010_jira_integration.sql"
  - "resource_plan and resource_projects excluded — tenant scope inherited via project_id FK; naming ambiguity deferred to Phase 3 review"
  - "app_users excluded — global auth.users mirror; tenant scoping via organization_members"
  - "telegram_auth excluded — single-row global config, not per-tenant"
  - "og_project_types and og_content_library included to be safe (over-scoping is reversible, under-scoping leaks data)"

patterns-established:
  - "All tenant-scoped tables get organization_id + matching index in one migration"
  - "Inventory comment block at top of migration documents every inclusion/exclusion decision"

requirements-completed: [MT-02]

# Metrics
duration: 15min
completed: 2026-04-24
---

# Phase 1 Plan 02: Add organization_id FK to All Tenant-Scoped Tables Summary

**Nullable `organization_id uuid references organizations(id)` column + matching index added to 35 tenant-scoped tables, covering all of clients, projects, invoices, maintenances, resource planning, offers, pixel, and configuration tables**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-24T08:00:00Z
- **Completed:** 2026-04-24T08:15:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Enumerated all 23 confirmed tables from migration files + 12 confirmed via store usage and ALTER TABLE evidence in 009_resource_tables_rls.sql
- Verified every table name against actual SQL before including (no invented tables)
- Wrote single idempotent migration with 35 ALTER TABLE + 35 CREATE INDEX pairs — zero NOT NULL, zero RLS, zero data mutations

## Tables Receiving organization_id (35 total)

**Core data tables (001_initial_schema.sql):**
clients, projects, invoices, invoice_items, hosting_clients, infrastructure_costs, domains, timesheet_entries, revenue_planner

**Maintenance tables:**
maintenances, maintenance_hours_log

**CRM / Sales tables:**
change_requests, pipeline_items

**Settings / Configuration:**
reminder_rules, app_settings, invoice_automations, email_intake_rules, user_permissions

**Resource planning:**
teams, team_members, resource_allocations, member_projects, time_off, company_holidays, project_deliverables, resource_confirmations, allocation_templates, allocation_actuals

**Offer / Documents:**
offers, offer_versions, og_project_types, og_content_library

**AI / Pixel:**
pixel_conversations, pixel_messages

**Project financials:**
project_orders

## Tables EXCLUDED (with reasoning)

| Table | Reason |
|-------|--------|
| organizations | Self-referential — created in plan 01-01, has id as PK |
| organization_members | Self-referential — organization_id is already the core FK column |
| app_users | Global mirror of auth.users; tenant scoping via organization_members, not an org_id FK |
| telegram_auth | Single-row global config (003_telegram_auth.sql), not per-tenant |
| auth.* | Supabase-managed schema, never modify |
| resource_plan | Tenant scope inherited via project_id → projects.organization_id; naming ambiguity (resource_plan vs resource_plans); deferred to Phase 3 review |
| resource_projects | Same as resource_plan — scope via project_id FK; deferred to Phase 3 review |

## Tables Named in Planning Prompt NOT Found in Migrations

The following TypeScript interface names did NOT have a matching `CREATE TABLE` statement in any migration file but were confirmed to exist in the live DB via other evidence:

- `maintenances` — confirmed by `ALTER TABLE maintenances` in 010_jira_integration.sql (INCLUDED)
- `change_requests` — confirmed by store usage in changeRequests.ts (INCLUDED)
- `pipeline_items` — confirmed by store usage in pipeline.ts (INCLUDED)
- `reminder_rules` — confirmed by store usage in reminders.ts (INCLUDED)
- `app_settings` — confirmed by store usage in settings.ts (INCLUDED)
- `teams`, `resource_allocations`, `member_projects`, `time_off`, `company_holidays` — confirmed by `alter table if exists` in 009_resource_tables_rls.sql (INCLUDED)
- `project_deliverables`, `resource_confirmations` — confirmed by store usage in resource.ts (INCLUDED)
- `pixel_conversations`, `pixel_messages` — confirmed by store usage in pixel.ts (INCLUDED)
- `project_orders` — confirmed by store usage in ProjectDetailView.tsx (INCLUDED)

## Task Commits

Each task was committed atomically:

1. **Task 1 + Task 2: Enumerate tables + Write migration** — `6a91d15` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `supabase/migrations/20260424000002_add_organization_id.sql` — 35 ALTER TABLE + 35 CREATE INDEX statements, with inventory comment block

## Decisions Made

- Included og_project_types and og_content_library (offer template libraries) — per plan guidance: "over-scoping is reversible; under-scoping leaks data"
- Excluded resource_plan and resource_projects — scope flows via project_id FK to projects.organization_id; naming ambiguity warrants Phase 3 review
- Included all Studio-created tables (no migration file) based on store usage + ALTER TABLE IF EXISTS evidence in 009_resource_tables_rls.sql

## Deviations from Plan

None — plan executed exactly as written. Task 1 enumeration and Task 2 migration were produced as a single coherent unit.

## Issues Encountered

None. The verification commands all passed:
- 35 ALTER TABLE == 35 CREATE INDEX (1:1 pairing confirmed)
- Zero NOT NULL in SQL statements (only in comments)
- Zero RLS statements
- Zero data mutations
- Zero `org_id` references (only `organization_id`)
- Zero `auth.users` FK targets

## User Setup Required

None — this plan writes SQL only. The migration is applied as part of the normal Supabase migration workflow.

## Downstream Impact

Plan 01-03 can now write RLS policies using `organization_id = current_org_id()` (or equivalent JWT claim lookup) against every listed table. All 35 tables have the column and index required for efficient per-row tenant filtering.

## Next Phase Readiness

- Ready for plan 01-03: RLS policies + JWT claim hook
- Phase 3 MIG-01 will: INSERT Renderspace org row → UPDATE all 35 tables to set organization_id → add NOT NULL constraint
- resource_plan and resource_projects tables need revisited in Phase 3 if they need org scoping

## Known Stubs

None — this plan adds structural SQL only, no UI or application code.

---
*Phase: 01-database-foundation-rls*
*Completed: 2026-04-24*

## Self-Check: PASSED
