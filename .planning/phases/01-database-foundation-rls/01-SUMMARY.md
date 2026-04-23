---
phase: 01-database-foundation-rls
plan: 01
subsystem: database
tags: [postgres, supabase, multi-tenancy, rls, organizations, sql-migration]

# Dependency graph
requires: []
provides:
  - organizations table (id, slug UNIQUE, name, plan CHECK, status CHECK, created_at)
  - organization_members table (id, organization_id FK CASCADE, user_id FK CASCADE, role CHECK, created_at, UNIQUE(organization_id, user_id))
  - indexes on organization_members(user_id) and organization_members(organization_id)
affects:
  - 01-database-foundation-rls/02 (needs organizations(id) as FK target)
  - 01-database-foundation-rls/03 (needs organization_members for custom_access_token_hook)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Use gen_random_uuid() not uuid_generate_v4() for new migrations (pgcrypto default)"
    - "Use timestamptz not null default now() for all timestamp columns"
    - "organization_id everywhere — never org_id — to avoid broken FK references"
    - "Tables created unconditionally (no IF NOT EXISTS) — idempotency via migration ordering"

key-files:
  created:
    - supabase/migrations/20260424000001_create_organizations.sql
  modified: []

key-decisions:
  - "No RLS in this migration — deferred to plan 01-03 (adding RLS before backfill would block all queries)"
  - "No data inserts — Renderspace org row created in Phase 3 backfill migration (MIG-01)"
  - "No updated_at columns — orgs and memberships are effectively write-once records"

patterns-established:
  - "Pattern 1: New timestamped migrations use YYYYMMDDNNNNNN_ prefix (e.g. 20260424000001_)"
  - "Pattern 2: CHECK constraints inline on the column definition, not as separate table constraints"
  - "Pattern 3: UNIQUE on composite (organization_id, user_id) prevents duplicate memberships"

requirements-completed: [MT-01, MT-04]

# Metrics
duration: 2min
completed: 2026-04-24
---

# Phase 1 Plan 01: Database Foundation — Organizations Tables Summary

**`organizations` + `organization_members` tables created in a single idempotent migration, with CHECK constraints on plan/status/role, CASCADE FKs to auth.users, and performance indexes — no RLS, no data, ready for plan 01-02 FK columns**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-23T16:58:07Z
- **Completed:** 2026-04-23T16:59:04Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Created `organizations` table with slug (UNIQUE), plan (CHECK: free/trial/paid), status (CHECK: active/suspended)
- Created `organization_members` table with FK CASCADE to both organizations(id) and auth.users(id), role CHECK (owner/admin/member), UNIQUE(organization_id, user_id)
- Added two performance indexes on organization_members for the hot-path JWT hook and admin member listing

## Task Commits

1. **Task 1: Create organizations + organization_members migration SQL** - `fa0b097` (feat)

**Plan metadata:** (pending — added below after state update)

## Files Created/Modified

- `supabase/migrations/20260424000001_create_organizations.sql` — Multi-tenancy foundation tables: organizations + organization_members with constraints and indexes

## Decisions Made

- No RLS enabled in this migration (deferred to plan 01-03 — enabling RLS before backfill would block all queries on those tables, and there are no policies yet anyway)
- No data inserts (Renderspace org row created in Phase 3 MIG-01 backfill migration)
- Used `gen_random_uuid()` not `uuid_generate_v4()` — matches recent migration style, pgcrypto is Supabase default
- Used `timestamptz not null default now()` — matches 20260404000001_user_permissions.sql convention

## Deviations from Plan

None — plan executed exactly as written.

The automated verify string in the plan used `! grep -q "org_id"` (no word boundary), which technically matches the substring inside `organization_id`. The actual acceptance criteria correctly uses `\borg_id\b` (word boundary), and that check returns 0 — confirming no standalone `org_id` exists anywhere. The file content is correct.

## Issues Encountered

None — file was created cleanly on first attempt. All acceptance criteria grep checks pass.

## User Setup Required

None — this is a SQL migration file only. It will be applied when `supabase db reset` or `supabase migration up` is run against the project.

## Next Phase Readiness

- Plan 01-02 can now add `organization_id uuid not null references organizations(id) on delete cascade` to all 14+ data tables
- Plan 01-03 can now write the `custom_access_token_hook` that queries `organization_members` by `user_id`
- No blockers for 01-02

---
*Phase: 01-database-foundation-rls*
*Completed: 2026-04-24*
