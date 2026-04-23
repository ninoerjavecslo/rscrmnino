---
phase: 01-database-foundation-rls
plan: 03
subsystem: database
tags: [rls, jwt, postgres, supabase, custom-access-token-hook, deno, edge-functions, multi-tenancy]

# Dependency graph
requires:
  - phase: 01-database-foundation-rls-01
    provides: organizations and organization_members tables
  - phase: 01-database-foundation-rls-02
    provides: organization_id column on all 35 tenant-scoped tables + indexes

provides:
  - auth.organization_id() SQL helper reads JWT app_metadata.organization_id
  - public.custom_access_token_hook() Postgres function with supabase_auth_admin grant
  - RLS ENABLED (default-deny) on all 37 tables (35 tenant-scoped + organizations + organization_members)
  - Edge Function fallback at supabase/functions/custom-access-token-hook/index.ts
  - Zero RLS policies written — Phase 3 completes the policy set after backfill

affects:
  - phase-02-subdomain-infrastructure (OrgProvider needs hook firing correctly)
  - phase-03-backfill-and-policies (writes SELECT/INSERT/UPDATE/DELETE policies using auth.organization_id())
  - all Zustand stores (zero changes needed — RLS + JWT claim handles scoping automatically)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JWT claim RLS: auth.organization_id() reads app_metadata (never user_metadata)"
    - "Custom Access Token Hook: SQL pg-function primary, Edge Function fallback"
    - "Default-deny RLS posture: RLS enabled before backfill completes, policies added in Phase 3"
    - "Phase 3 policy pattern: organization_id = (select auth.organization_id()) with initPlan cache"

key-files:
  created:
    - supabase/migrations/20260424000003_rls_policies.sql
    - supabase/functions/custom-access-token-hook/index.ts
    - supabase/functions/custom-access-token-hook/deno.json
  modified: []

key-decisions:
  - "auth.organization_id() placed in auth schema to match Supabase conventions (auth.uid(), auth.email())"
  - "custom_access_token_hook in public schema — only schema supabase_auth_admin can reach by grant"
  - "security definer on hook function to ensure it always reads organization_members as its owner"
  - "RLS enabled with zero policies (default-deny) — safe because app is offline during cutover window"
  - "Both SQL hook and Edge Function deployed — Dashboard can swap between them without a code change"

patterns-established:
  - "Pattern: Always use (select auth.organization_id()) in Phase 3 policies — initPlan caching"
  - "Pattern: Grant execute on hook to supabase_auth_admin only; revoke from authenticated/anon/public"
  - "Pattern: Any future VIEW on tenant-scoped tables MUST use WITH (security_invoker = true)"

requirements-completed: [MT-03, AUTH-02]

# Metrics
duration: 3min
completed: 2026-04-24
---

# Phase 1 Plan 03: RLS Foundation + Custom Access Token Hook Summary

**auth.organization_id() JWT helper + custom_access_token_hook Postgres function + RLS enabled (default-deny) on all 37 tenant-scoped tables with zero policies written until Phase 3 backfill**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-23T17:05:28Z
- **Completed:** 2026-04-23T17:08:07Z
- **Tasks:** 2 of 3 (stopped at checkpoint:human-action Task 3)
- **Files modified:** 3

## Accomplishments
- SQL migration `20260424000003_rls_policies.sql` created with all three sections: helper function, hook function, and RLS enable on 37 tables
- `auth.organization_id()` helper reads `app_metadata.organization_id` from JWT — never `user_metadata`
- `public.custom_access_token_hook()` Postgres function granted to `supabase_auth_admin`, revoked from `authenticated/anon/public`, with `SELECT` on `organization_members` granted for the hook's lookup
- RLS ENABLED on all 37 tables (35 tenant-scoped from 01-02 + `organizations` + `organization_members`). Zero policies written — Phase 3 will add SELECT+INSERT+UPDATE+DELETE as a complete set per PITFALLS.md Pitfall 5
- Edge Function fallback at `supabase/functions/custom-access-token-hook/` with identical semantics to the SQL hook and `deno.json`

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the RLS + hook SQL migration** - `6bd6029` (feat)
2. **Task 2: Create Edge Function fallback of the hook (Deno)** - `ee97d92` (feat)
3. **Task 3: Register Custom Access Token Hook** — CHECKPOINT: awaiting human action

**Plan metadata:** (pending — after human completes Task 3)

## Files Created/Modified
- `supabase/migrations/20260424000003_rls_policies.sql` — auth.organization_id() helper, public.custom_access_token_hook() with grants, ALTER TABLE ... ENABLE ROW LEVEL SECURITY for all 37 tables
- `supabase/functions/custom-access-token-hook/index.ts` — Deno edge function fallback with organization_members lookup and app_metadata write
- `supabase/functions/custom-access-token-hook/deno.json` — Deno task config for local serving

## Tenant-Scoped Tables With RLS Enabled

The following 35 tables (from 01-02 INCLUDED list) plus 2 org tables have RLS enabled:

| Group | Tables |
|-------|--------|
| Org tables | `organizations`, `organization_members` |
| Core (001_initial_schema.sql) | `clients`, `projects`, `invoices`, `invoice_items`, `hosting_clients`, `infrastructure_costs`, `domains`, `timesheet_entries`, `revenue_planner` |
| Maintenance | `maintenances`, `maintenance_hours_log` |
| CRM / Sales | `change_requests`, `pipeline_items` |
| Settings / Config | `reminder_rules`, `app_settings`, `invoice_automations`, `email_intake_rules`, `user_permissions` |
| Resource planning | `teams`, `team_members`, `resource_allocations`, `member_projects`, `time_off`, `company_holidays`, `project_deliverables`, `resource_confirmations`, `allocation_templates`, `allocation_actuals` |
| Offer / Docs | `offers`, `offer_versions`, `og_project_types`, `og_content_library` |
| AI / Pixel | `pixel_conversations`, `pixel_messages` |
| Project financials | `project_orders` |

Total: 37 tables. All verified with `grep -c "enable row level security" supabase/migrations/20260424000003_rls_policies.sql` = 37.

## User's Cutover Decision

**PENDING** — awaiting response from Task 3 checkpoint.

The checkpoint asks Nino to confirm:
- **"cutover-ok"** → default-deny is acceptable (app offline during migration window). No temporary policies needed. This is the recommended path.
- **"stay-online"** → requires adding temporary full-access policies for the existing Renderspace user, to be dropped in Phase 3 before real policies are added.

## Decisions Made

- `auth.organization_id()` placed in the `auth` schema to match Supabase conventions (`auth.uid()`, `auth.email()`). The `postgres` role has CREATE FUNCTION in `auth` by default in Supabase.
- `custom_access_token_hook` placed in `public` — the only schema `supabase_auth_admin` can reach via grant. Using `security definer` so the function reads `organization_members` as its own owner regardless of caller.
- RLS enabled with zero policies (default-deny posture). This is safe because the app is offline during the Phase 1 cutover window. Phase 3 adds the real policies after backfill.
- Both SQL hook (primary) and Edge Function (fallback) deployed — Dashboard can swap between them without code changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed multi-line grant/revoke statements to match grep pattern**
- **Found during:** Task 1 verification
- **Issue:** The plan's acceptance criteria uses `grep -c "grant execute.*custom_access_token_hook.*to supabase_auth_admin"` which requires the statement on one line. Initial multi-line format caused verification failure.
- **Fix:** Collapsed grant and revoke statements to single lines.
- **Files modified:** `supabase/migrations/20260424000003_rls_policies.sql`
- **Verification:** `grep -c` returned 1 for grant and 1 for revoke after fix.
- **Committed in:** `6bd6029` (Task 1 commit)

**2. [Rule 1 - Bug] Removed user_metadata from SQL comments to pass grep check**
- **Found during:** Task 1 verification
- **Issue:** Plan acceptance criteria requires `grep -c "user_metadata" == 0`. Initial migration had 3 comment lines mentioning `user_metadata` (as warnings). The grep check is against the full file including comments.
- **Fix:** Rewrote comments to say "app_metadata only (PITFALLS.md Pitfall 2)" instead of "NEVER writes to user_metadata".
- **Files modified:** `supabase/migrations/20260424000003_rls_policies.sql`
- **Verification:** `grep -c "user_metadata"` = 0 after fix.
- **Committed in:** `6bd6029` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 — verification pattern fixes)
**Impact on plan:** Both fixes were purely cosmetic (comment wording + statement formatting). No functional change to the SQL.

## Issues Encountered

None beyond the two auto-fixed verification issues above.

## User Setup Required

**Manual action required before plan is complete.**

Task 3 requires Nino to register the hook in the Supabase Dashboard. No CLI or API exists for this action.

**Steps:**
1. Apply migrations: `supabase db push`
2. Deploy edge function: `supabase functions deploy custom-access-token-hook`
3. Navigate to Supabase Dashboard > Authentication > Hooks (Beta)
4. Click "Custom Access Token" → "Add Hook"
5. Choose **Postgres** hook type, schema `public`, function `custom_access_token_hook`
6. Enable and Save
7. Confirm cutover strategy: reply "approved cutover-ok" or "approved stay-online"

**Verification (cannot use SQL editor — PITFALLS.md Pitfall 3):**
- Sign in to the app, decode JWT at jwt.io
- Confirm `app_metadata` key exists (value may be null until Phase 3 backfill — expected)
- Confirm no `user_metadata.organization_id` claim

## No Policies Written — Note for Phase 3

**Explicit confirmation:** Zero `CREATE POLICY` statements exist in this plan's migration. Phase 3 MIG-01 backfill must complete before policies are written. When Phase 3 writes policies, they MUST be written as a complete set per table:
- `SELECT` policy (also controls what rows `UPDATE` can see — PITFALLS.md Pitfall 5)
- `INSERT` policy
- `UPDATE` policy
- `DELETE` policy

Policy pattern for Phase 3:
```sql
create policy "tenant_isolation_select"
on public.clients
for select
to authenticated
using (organization_id = (select auth.organization_id()));
```

The `(select ...)` wrapper is mandatory for per-statement caching (initPlan optimization).

## Follow-ups for Phase 3

1. Insert Renderspace org record BEFORE backfilling any table row (FK constraint would fail otherwise)
2. After backfill, verify zero rows have `organization_id IS NULL` across all tables
3. After backfill, `ALTER COLUMN organization_id SET NOT NULL` on every tenant-scoped table
4. Update `src/lib/types.ts` to add `organization_id: string | null` on all entity interfaces (use `string | null` not optional `?` — PITFALLS.md Pitfall 11)
5. After Phase 3 policies are live, upgrade types to `organization_id: string` (non-nullable)
6. Audit all views in `public` schema before writing policies — any view reading tenant-scoped tables MUST use `WITH (security_invoker = true)` (PITFALLS.md Pitfall 12)

## Next Phase Readiness

- Phase 2 (OrgProvider/subdomain infrastructure) can proceed — the hook will populate JWT at login once the Renderspace org + membership exist (Phase 3)
- Phase 3 (backfill + policies) has every DB prerequisite in place: tables, columns, indexes, RLS enabled, hook function, helper function
- **Blocker for Phase 3:** Hook must be registered in Supabase Dashboard (Task 3 checkpoint) before the hook fires on login

---
*Phase: 01-database-foundation-rls*
*Completed: 2026-04-24 (partial — awaiting Task 3 human action)*
