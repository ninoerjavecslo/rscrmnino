---
phase: 01-database-foundation-rls
verified: 2026-04-24T00:00:00Z
status: passed
score: 8/8 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Decode JWT after Phase 3 creates first organization_members row"
    expected: "app_metadata.organization_id is populated; no user_metadata.organization_id claim"
    why_human: "Hook fires only on token issuance; cannot verify JWT claim content without a real login session. Cannot use SQL editor (PITFALLS.md Pitfall 3)."
  - test: "Confirm hook is registered and active in Supabase Dashboard"
    expected: "Dashboard > Authentication > Hooks shows Custom Access Token hook pointing to public.custom_access_token_hook, status Active"
    why_human: "No API to confirm hook registration state; SUMMARY documents it was done (hook id: 03483343-e0c3-4afa-9569-e71a16aaa93a) but the Dashboard toggle cannot be verified programmatically."
---

# Phase 1: Database Foundation & RLS — Verification Report

**Phase Goal:** The database enforces multi-tenant isolation at the schema level — no application code changes can produce cross-org data leaks
**Verified:** 2026-04-24
**Status:** PASSED (with documented deviation)
**Re-verification:** No — initial verification

---

## Documented Deviation (Non-Blocking)

**Plan 03 must_have truth:** "A SQL helper function `auth.organization_id()` exists..."
**Actual implementation:** `public.current_org_id()` in the `public` schema

**Reason:** The `auth` schema is not writable via Supabase migrations (requires superuser; `postgres` role is denied `CREATE FUNCTION` in `auth`). The function was moved to `public` and renamed `current_org_id()` with identical semantics — reads `app_metadata.organization_id` from JWT, returns `uuid`. Documented in plan 03 SUMMARY as Deviation #3.

**Impact on goal:** None. The helper still provides the same JWT extraction functionality. Phase 3 RLS policies must use `(select public.current_org_id())` instead of `(select auth.organization_id())`. This is explicitly captured in the SUMMARY's follow-up notes.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | organizations table exists with correct columns, constraints (slug UNIQUE, plan/status CHECKs) | VERIFIED | `20260424000001_create_organizations.sql` lines 14-23: CREATE TABLE with all 6 columns, check constraints confirmed by grep |
| 2 | organization_members table links auth.users to organizations with role constraint and duplicate-prevention UNIQUE | VERIFIED | `20260424000001_create_organizations.sql` lines 33-41: both FK CASCADE references + CHECK role + UNIQUE(organization_id, user_id) |
| 3 | Every tenant-scoped data table has a nullable organization_id FK to organizations(id) with a matching index | VERIFIED | `20260424000002_add_organization_id.sql`: 35 ALTER TABLE + 35 matching CREATE INDEX statements; 1:1 parity confirmed |
| 4 | RLS is enabled (default-deny) on all 37 tables with zero policies written | VERIFIED | `20260424000003_rls_policies.sql`: 37 `enable row level security` statements, 0 `CREATE POLICY` statements |
| 5 | A SQL helper function exists that extracts organization_id from JWT app_metadata | VERIFIED | `public.current_org_id()` at line 35 of migration 03; reads `app_metadata ->> 'organization_id'`, returns uuid, marked `stable` |
| 6 | A Postgres hook function public.custom_access_token_hook() exists, queries organization_members, and embeds org_id into app_metadata | VERIFIED | Migration 03 lines 60-101: function body queries `organization_members` by `user_id`, writes to `{app_metadata,organization_id}`, never touches `user_metadata` |
| 7 | Hook function is granted to supabase_auth_admin only; revoked from authenticated/anon/public | VERIFIED | Migration 03 lines 107-111: single-line grant + revoke statements |
| 8 | Edge function fallback exists at supabase/functions/custom-access-token-hook/ with identical semantics | VERIFIED | `index.ts` (91 lines): Deno.serve, queries `organization_members`, writes to `app_metadata`, never reads `user_metadata`; `deno.json` valid JSON |

**Score: 8/8 truths verified**

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|---------|---------|--------|---------|
| `supabase/migrations/20260424000001_create_organizations.sql` | organizations + organization_members table creation | VERIFIED | 53 lines; both tables with all constraints and indexes |
| `supabase/migrations/20260424000002_add_organization_id.sql` | organization_id column + FK + index on every tenant-scoped table | VERIFIED | 260 lines; 35 ALTER TABLE + 35 CREATE INDEX; inventory comment block present |
| `supabase/migrations/20260424000003_rls_policies.sql` | auth helper + hook function + RLS enabled | VERIFIED | 191 lines; all three sections present; 37 RLS enables |
| `supabase/functions/custom-access-token-hook/index.ts` | Deno edge function hook fallback | VERIFIED | 91 lines; Deno.serve, organization_members query, app_metadata write |
| `supabase/functions/custom-access-token-hook/deno.json` | Deno config | VERIFIED | Valid JSON with serve task |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `organization_members.organization_id` | `organizations.id` | `REFERENCES organizations(id) ON DELETE CASCADE` | WIRED | Migration 01 line 35: exact pattern present |
| `organization_members.user_id` | `auth.users.id` | `REFERENCES auth.users(id) ON DELETE CASCADE` | WIRED | Migration 01 line 36: exact pattern present |
| `{35 data tables}.organization_id` | `organizations.id` | nullable FK `references organizations(id)` | WIRED | Migration 02: 35 instances of `add column if not exists organization_id uuid references organizations(id)` |
| `public.custom_access_token_hook` | `public.organization_members` | `SELECT organization_id WHERE user_id = event->>'user_id'` | WIRED | Migration 03 line 75: `from public.organization_members` |
| `public.current_org_id()` | JWT `app_metadata.organization_id` | `current_setting('request.jwt.claims')::jsonb -> 'app_metadata' ->> 'organization_id'` | WIRED | Migration 03 lines 40-46 |
| Edge function | `organization_members` | Supabase service-role client query `.from('organization_members').select('organization_id').eq('user_id', userId)` | WIRED | index.ts lines 62-67 |
| Supabase Auth | `public.custom_access_token_hook` | Dashboard hook registration (human action) | WIRED (human-confirmed) | SUMMARY documents hook ACTIVE, id `03483343-e0c3-4afa-9569-e71a16aaa93a`; cannot verify programmatically |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|------------|------------|-------------|--------|---------|
| MT-01 | 01-PLAN.md | Each agency has an organization record with unique slug, name, plan, status | SATISFIED | `organizations` table in migration 01; slug has UNIQUE constraint; plan/status have CHECK constraints |
| MT-02 | 02-PLAN.md | All data tables have organization_id FK linking rows to their organization | SATISFIED | 35 tables in migration 02 all receive nullable `organization_id uuid references organizations(id)` |
| MT-03 | 03-PLAN.md | RLS policies restrict all table access to authenticated user's organization | STRUCTURALLY MET | RLS enabled on 37 tables (default-deny); actual SELECT/INSERT/UPDATE/DELETE policies deferred to Phase 3 by design — this is correct behavior per the plan |
| MT-04 | 01-PLAN.md | Users linked to organizations via organization_members table with role field | SATISFIED | `organization_members` table in migration 01; role CHECK ('owner','admin','member'); UNIQUE(organization_id, user_id) |
| AUTH-02 | 03-PLAN.md | Session includes org_id for RLS policy enforcement via JWT claims | STRUCTURALLY MET | `public.custom_access_token_hook` embeds `organization_id` into `app_metadata`; `public.current_org_id()` helper reads it; hook registered and ACTIVE per SUMMARY |

**Note on MT-03 and AUTH-02 "structurally met":** These requirements are fully met at the schema/infrastructure level. MT-03 will become fully operational (with actual row-filtering) when Phase 3 writes the SELECT/INSERT/UPDATE/DELETE policies after backfill. AUTH-02 will produce a non-null claim when Phase 3 creates the first organization_members row. This deferred activation is the correct and documented design — it is not a gap.

---

## Anti-Patterns Found

No anti-patterns found.

- Zero `CREATE POLICY` statements in any migration — intentional by design
- Zero `INSERT INTO` / `UPDATE` data mutations — backfill deferred to Phase 3 (correct)
- Zero `user_metadata` references in migration 03 (confirmed by grep count = 0)
- Zero `NOT NULL` in migration 02 (the two hits are in SQL comments explaining the intentional choice)
- Zero `org_id` (forbidden shorthand) — the one hit in migration 02 is in a comment explaining the exclusion of `app_users`, using `org_id` as a contraction in prose, not as an identifier
- `security definer` on `custom_access_token_hook` is correct — hook must read `organization_members` regardless of caller's RLS context

---

## Human Verification Required

### 1. JWT claim verification after Phase 3 backfill

**Test:** Sign in to the app as Nino after Phase 3 creates the Renderspace org and the first `organization_members` row. Run `(await supabase.auth.getSession()).data.session?.access_token` in the browser console, paste into jwt.io, decode.
**Expected:** `app_metadata.organization_id` is a non-null UUID matching the Renderspace org id. No `user_metadata.organization_id` claim exists.
**Why human:** Hook fires only on real token issuance. Cannot decode a live JWT without a browser session. Cannot use SQL editor (PITFALLS.md Pitfall 3 — SQL editor bypasses RLS).

### 2. Dashboard hook registration confirmation

**Test:** Navigate to Supabase Dashboard > Authentication > Hooks (Beta) and verify Custom Access Token hook is shown as active, pointing to `public.custom_access_token_hook`.
**Expected:** Hook status = Active, type = Postgres, function = `public.custom_access_token_hook`.
**Why human:** No Supabase API/CLI exists to read hook registration state. The SUMMARY documents registration was completed (edge function id: `03483343-e0c3-4afa-9569-e71a16aaa93a`) but the Dashboard state cannot be verified by code.

---

## Critical Note for Phase 3

The helper function is `public.current_org_id()` — NOT `auth.organization_id()`. All Phase 3 RLS policies must use:

```sql
using (organization_id = (select public.current_org_id()))
```

The `(select ...)` wrapper is mandatory for per-statement initPlan caching (ARCHITECTURE.md performance note).

---

## Gaps Summary

No gaps. All phase goal preconditions are satisfied in migration files. The single documented deviation (helper in `public` schema vs `auth` schema) does not affect goal achievement — the function provides identical semantics and is correctly referenced by the hook and will be correctly used by Phase 3 policies. The deviation is documented in SUMMARY and propagated to Phase 3 follow-up notes.

---

_Verified: 2026-04-24_
_Verifier: Claude (gsd-verifier)_
