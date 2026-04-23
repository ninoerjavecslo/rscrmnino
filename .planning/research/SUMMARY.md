# Research Summary: Agency Intelligence OS v2.0 SaaS Conversion

**Synthesized:** 2026-04-24
**Researchers:** Stack, Features, Architecture, Pitfalls
**Overall Confidence:** HIGH

---

## Executive Summary

Converting Agency Intelligence OS to multi-tenant SaaS uses the JWT claim + RLS pattern: a Postgres Custom Access Token Hook embeds `org_id` into `app_metadata` at login, and RLS policies on every data table filter rows automatically. The critical insight is that **zero changes are needed to any of the 20 existing Zustand stores** — the database enforces isolation unconditionally. No new npm packages are required. Deployment must switch to Vercel (Cloudflare Pages confirmed unsupported for wildcard custom domains as of April 2026).

The build order has a hard dependency chain: database schema + RLS must be fully verified before any app code changes, and **data migration (backfilling Renderspace data) must complete before RLS is enabled** — enabling RLS before backfill instantly locks out the current production user. The admin console is deliberately last, safe to build only after isolation is proven.

---

## Stack Additions

**No new npm packages required.** All multi-tenancy work happens in SQL and lightweight TypeScript patterns using existing dependencies.

| Addition | What | Why |
|----------|------|-----|
| Supabase Custom Access Token Hook | Postgres function registered in Auth > Hooks | Embeds `organization_id` into `app_metadata` at login — the only user-unmodifiable JWT claim location |
| `current_org_id()` SQL helper | `CREATE FUNCTION auth.organization_id()` | Called with `(select ...)` wrapper for RLS perf — documented 99%+ speedup vs per-row evaluation |
| Indexes on `organization_id` | `CREATE INDEX ON table(organization_id)` for all 14+ tables | Required for acceptable query performance under RLS |
| Vercel deployment | Platform switch | Only major host with native wildcard custom domain SSL (`*.insighty.io`). Cloudflare Pages does NOT support this. |

---

## Feature Landscape

### Table Stakes (must have for any org to use the product)
- `organizations` table with slug, name, plan, status
- `organization_members` table linking users to orgs with roles
- `organization_id` FK + RLS on all data tables
- Subdomain → org resolution at app boot
- Login gated to org membership on current subdomain
- `org_id` in JWT `app_metadata` for RLS enforcement

### Differentiators (planned for v2.0)
- Admin console with impersonation + audit log
- Manual plan assignment (free/trial/paid)

### Anti-features (do NOT build)
- Passing `organization_id` explicitly in every store query (fragile, bypasses RLS intent)
- `set_config` for org context (doesn't persist across PostgREST requests)
- Storing `org_id` in localStorage (bypasses RLS; security risk)
- `user_metadata` in JWT claims (user-writable, can be forged)

---

## Architecture

### New Files (3 source files + 3 admin views + 3 SQL migrations)
- `src/contexts/OrgContext.tsx` — React context: `{ orgId, slug, name, plan }`
- `src/components/OrgProvider.tsx` — boot resolver: hostname → DB lookup → context
- `src/components/AdminRoute.tsx` — owner-only guard (checks `user.email === owner email`)
- `src/views/admin/` — AdminDashboardView, OrgDetailView, ImpersonationBanner
- `supabase/migrations/001-organizations.sql` — schema foundation
- `supabase/migrations/002-rls-policies.sql` — all RLS policies
- `supabase/migrations/003-backfill-renderspace.sql` — data migration

### Modified Files (4)
- `src/App.tsx` — wrap with `<OrgProvider>`
- `src/lib/supabase.ts` — no structural change (RLS handles scoping)
- `src/components/ProtectedRoute.tsx` — add org status check (suspended → redirect)
- `src/components/layout/Sidebar.tsx` — show org name

### Unchanged (20 Zustand stores)
Zero store changes required. RLS filters rows automatically by `organization_id` claim in JWT.

### Boot Sequence
```
Page load → OrgProvider reads hostname
  → "renderspace" slug → anon query: SELECT * FROM organizations WHERE slug = 'renderspace'
  → Sets OrgContext (orgId, name, plan, status)
  → If suspended: redirect to suspended page
  → User logs in → Custom Access Token Hook fires
  → org_id embedded in app_metadata → RLS-automatic store queries work
```

---

## Critical Pitfalls

| # | Pitfall | Risk | Prevention |
|---|---------|------|------------|
| 1 | **RLS enabled before backfill** | All existing data becomes invisible instantly | Enable RLS only AFTER `organization_id` is NOT NULL on all rows |
| 2 | **Missing table RLS coverage** | Silent cross-org data leak | Supabase Security Advisor query; test with Org B user after migration |
| 3 | **`user_metadata` in JWT** | User can forge any org_id | Always use `app_metadata` — only Custom Access Token Hook can write it |
| 4 | **SQL editor RLS testing** | False confidence — SQL editor runs as `postgres`, bypasses all RLS | Test policies only via real client session or SET ROLE |
| 5 | **Zustand stale state on impersonation** | Admin writes data to wrong org | `resetAllStores()` utility, called on every org switch |
| 6 | **org_id vs organization_id naming** | SQL bugs, broken FK references | Settle on `organization_id` everywhere before any SQL is written |
| 7 | **JWT 1-hour stale window** | Org suspension not immediately enforced | Add DB-resolved membership check in RLS `USING` clause alongside JWT claim |

---

## Suggested Phase Breakdown

| Phase | Focus | Key Deliverables | Requirements |
|-------|-------|-----------------|--------------|
| 1 | Database Foundation + RLS | organizations, organization_members, org_id on all tables, RLS policies, Custom Access Token Hook, indexes | MT-01, MT-02, MT-03, MT-04, AUTH-02 |
| 2 | Subdomain + App Boot | OrgContext, OrgProvider, App.tsx wrapping, org-scoped login, Vercel wildcard DNS | RT-01, RT-02, AUTH-01 |
| 3 | Data Migration | Backfill Renderspace, verify row counts, link users to org | MIG-01, MIG-02 |
| 4 | Admin Console | AdminRoute, org list/create/suspend, plan assignment, impersonation + audit log | ADM-01 through ADM-06 |

---

## Open Questions for Planning

1. **Exact table count**: STACK.md says ~20, ARCHITECTURE.md says 14 — inspect actual Supabase schema before writing migration checklist
2. **`organization_members.role` vs existing permissions model**: `organization_members.role` (owner/admin/member) needs to be reconciled with the existing `user_permissions` store — decide before Phase 1 migration
3. **JWT stale window**: Accept 1-hour stale org_id in JWT, or add DB-resolved membership join in RLS policy `USING` clause? Recommendation: add DB join for suspended-org enforcement

---
*Synthesized: 2026-04-24*
