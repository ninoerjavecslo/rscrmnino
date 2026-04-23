# Roadmap: Agency Intelligence OS

## Milestones

- ✅ **v1.0 Internal Tool** - Phases 1-N (shipped pre-2026-04, pre-GSD baseline)
- 🚧 **v2.0 SaaS Conversion** - Phases 1-4 (in progress)

## Phases

<details>
<summary>✅ v1.0 Internal Tool — SHIPPED pre-2026-04</summary>

Full-featured agency management tool for single-tenant use by Renderspace. Delivered before GSD was introduced — no phase breakdown recorded. All features documented in PROJECT.md Validated requirements.

</details>

### 🚧 v2.0 SaaS Conversion (In Progress)

**Milestone Goal:** Convert the single-tenant internal tool into a multi-tenant SaaS product on insighty.io. Multiple agencies each get their own isolated workspace accessed via subdomain. Renderspace data migrates cleanly into the new model.

**Phase Numbering:** Starting at 1 (first GSD-tracked milestone).

- [ ] **Phase 1: Database Foundation + RLS** - Organizations schema, `organization_id` FK on all tables, RLS policies, Custom Access Token Hook
- [ ] **Phase 2: Subdomain Routing + Auth** - OrgProvider boot resolver, org context in stores, subdomain-scoped login
- [ ] **Phase 3: Data Migration** - Backfill Renderspace org and user membership, verify isolation
- [ ] **Phase 4: Admin Console** - Owner-only `/admin` route with org management and impersonation

## Phase Details

### Phase 1: Database Foundation + RLS
**Goal**: The database enforces multi-tenant isolation at the schema level — no application code changes can produce cross-org data leaks
**Depends on**: Nothing (first phase)
**Requirements**: MT-01, MT-02, MT-03, MT-04, AUTH-02
**Success Criteria** (what must be TRUE):
  1. An `organizations` table exists with slug, name, plan, and status columns and a unique constraint on slug
  2. An `organization_members` table exists linking users to organizations with a role field
  3. Every data table has an `organization_id` FK column with a matching index
  4. RLS is enabled (default-deny) on all data tables — enforcement policies are written in Phase 3 after backfill; until then authenticated users see zero rows (safe, expected)
  5. A Supabase Custom Access Token Hook embeds `organization_id` into `app_metadata` at login so RLS evaluates automatically
**Plans**: 3 plans

Plans:
- [ ] 01-database-foundation-rls/01-PLAN.md — Create organizations + organization_members tables (migration 20260424000001)
- [ ] 01-database-foundation-rls/02-PLAN.md — Add nullable organization_id FK + index to every tenant-scoped table (migration 20260424000002)
- [ ] 01-database-foundation-rls/03-PLAN.md — RLS helper + Custom Access Token Hook + enable RLS on all tables (migration 20260424000003 + edge function)

### Phase 2: Subdomain Routing + Auth
**Goal**: Users who visit `renderspace.insighty.io` are automatically placed in the Renderspace org context and can only log in as Renderspace members
**Depends on**: Phase 1
**Requirements**: RT-01, RT-02, AUTH-01
**Success Criteria** (what must be TRUE):
  1. Visiting `renderspace.insighty.io` resolves the slug "renderspace" from the hostname and loads the org record before any authenticated data fetch occurs
  2. All Zustand store queries execute scoped to the active org (enforced automatically by RLS + JWT; no manual `organization_id` filter needed in store code)
  3. Attempting to log in on a subdomain with a user account that does not belong to that org is rejected with a clear error
  4. A suspended org redirects all visitors to a suspended-account page before login
**Plans**: TBD

Plans:
- [ ] 02-01: Build OrgContext + OrgProvider (hostname → DB lookup → React context)
- [ ] 02-02: Wrap App.tsx with OrgProvider; update ProtectedRoute for org status check
- [ ] 02-03: Scope login to org membership; add org name to Sidebar; configure Vercel wildcard DNS

### Phase 3: Data Migration
**Goal**: Renderspace's existing production data is fully owned by the Renderspace organization in the new multi-tenant model — no row is orphaned, no user is locked out
**Depends on**: Phase 2
**Requirements**: MIG-01, MIG-02
**Success Criteria** (what must be TRUE):
  1. A `renderspace` organization record exists in the `organizations` table
  2. Every row in every data table has `organization_id` set to the Renderspace org ID (zero NULL rows)
  3. All existing Renderspace users appear in `organization_members` linked to the Renderspace org
  4. RLS is enabled (not just deployed) only after all rows are backfilled — the migration script enforces this order
  5. After migration, Renderspace users can log in and see all their historical data without any data loss
**Plans**: TBD

Plans:
- [ ] 03-01: Write and test backfill migration (create Renderspace org, set organization_id on all rows)
- [ ] 03-02: Link existing users to Renderspace org in organization_members; enable RLS; verify row counts and run cross-org isolation test

### Phase 4: Admin Console
**Goal**: Nino can manage all organizations in the system from a single owner-only interface, including creating orgs, adjusting plans, suspending accounts, and switching into any org context for support
**Depends on**: Phase 3
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06
**Success Criteria** (what must be TRUE):
  1. Navigating to `/admin` with any account other than `nino.erjavec@renderspace.si` is rejected (redirect or 403)
  2. Admin can see a table of all organizations showing slug, plan, status, and member count
  3. Admin can create a new organization with a name and slug, and the new org immediately appears in the table
  4. Admin can suspend an active org (org members are blocked from app access) and reactivate it
  5. Admin can set an org's plan to free, trial, or paid
  6. Admin can impersonate any org (switch app context for debugging) with a visible impersonation banner, without re-authenticating; all Zustand stores reset on org switch
**Plans**: TBD

Plans:
- [ ] 04-01: AdminRoute guard + admin layout scaffold (owner-only access)
- [ ] 04-02: Org list view (ADM-02) + create org form (ADM-03)
- [ ] 04-03: Suspend/reactivate (ADM-04) + plan assignment (ADM-05)
- [ ] 04-04: Impersonation (ADM-06): org switcher, resetAllStores(), impersonation banner

## Progress

**Execution Order:** 1 → 2 → 3 → 4

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Database Foundation + RLS | v2.0 | 0/3 | Not started | - |
| 2. Subdomain Routing + Auth | v2.0 | 0/3 | Not started | - |
| 3. Data Migration | v2.0 | 0/2 | Not started | - |
| 4. Admin Console | v2.0 | 0/4 | Not started | - |
