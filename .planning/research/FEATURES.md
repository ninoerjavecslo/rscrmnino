# Feature Research: SaaS Multi-Tenancy Conversion

**Domain:** SaaS multi-tenancy conversion — Supabase RLS, subdomain routing, org-aware auth, data migration, owner admin console
**Researched:** 2026-04-24
**Confidence:** HIGH (Supabase patterns verified via official docs + community; impersonation UX from multiple production SaaS sources)

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are non-negotiable for a functional multi-tenant SaaS. Missing any of these means the product is broken, not just incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Organizations table (slug, name, plan, status) | Every multi-tenant SaaS needs a tenant record as the root entity | LOW | Standard Postgres table; slug must be unique, URL-safe, immutable after creation |
| `organization_id` FK on all data tables | Without this, RLS has nothing to scope against; data leaks between tenants | MEDIUM | ~20 tables to ALTER; must be NOT NULL with FK to organizations; add btree index on each |
| `organization_members` join table (user_id, org_id, role) | Links Supabase auth users to orgs; enables per-org RBAC | LOW | Standard pattern; role column supports future per-org permission tiers |
| RLS policies on all data tables | The actual isolation layer; without this any authenticated user can read any org's data | MEDIUM | Policies use `(select auth.jwt()->>'org_id')::uuid` pattern for performance |
| Subdomain extraction at app boot | Users expect `renderspace.insighty.io` to load their org; no manual org selection | LOW | `window.location.hostname.split('.')[0]` → DB lookup → org context in React state |
| Org context injected into all Supabase queries | Every store fetch must be scoped; unscoped queries will return wrong data or violate RLS | MEDIUM | ~20 Zustand stores need `organization_id` filter added; largest surface area in the milestone |
| Login scoped to subdomain org | Auth must be tied to the org the user is trying to access; cross-org login is a security hole | MEDIUM | Requires verifying user is a member of the subdomain's org before allowing session |
| JWT carries `org_id` for RLS enforcement | RLS policies must have something to compare `organization_id` against per request | MEDIUM | Supabase Custom Access Token Hook (Postgres function) adds `org_id` to JWT `app_metadata` |
| Renderspace data migration | Existing production data must backfill cleanly; no data loss | MEDIUM | SQL migration: create org record → `UPDATE all_tables SET organization_id = '<renderspace_uuid>'` |
| Existing users linked to Renderspace org | Auth users must be in `organization_members` or they can't log in post-migration | LOW | One-time INSERT into `organization_members` for current Supabase auth users |
| Owner admin console (`/admin`) | Nino needs visibility and control over all orgs; without it there is no operational handle on the SaaS | MEDIUM | Route-guarded to `nino.erjavec@renderspace.si` only |

### Differentiators (Competitive Advantage)

Features that go beyond table stakes and make the admin experience meaningfully better.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Org impersonation (context switch, not user takeover) | Support and debugging without re-authenticating as a different user; faster ops | MEDIUM | Preferred over magic-link impersonation for this use case — see Anti-Features |
| Persistent impersonation banner | Prevents the most common impersonation mistake: making changes while forgetting you're in a customer's account | LOW | Fixed banner at top of app; yellow/amber background; "You are viewing [Org Name] — Stop" button; injected via React context |
| Org suspend / reactivate | Controls access for non-paying or problematic orgs without deleting data | LOW | Set `organizations.status = 'suspended'`; RLS or app-layer check blocks login |
| Plan assignment in admin | Nino can manually assign `free / trial / paid` without a billing system | LOW | Simple dropdown in admin org table; pre-cursor to future Stripe integration |
| Org member count in admin list | At-a-glance health check on all tenants without drilling into each | LOW | COUNT join in admin query |
| Immutable admin audit log | Documents every impersonation session start/end and any org status change | MEDIUM | `admin_audit_log` table; append-only (no UPDATE/DELETE RLS); captures admin_user_id, target_org_id, action, timestamp |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Magic-link impersonation (sign in as user) | Gives admin exact user experience | Invalidates user's session; GDPR risk if admin takes destructive actions as user; hard to audit precisely; logs admin actions under user's identity | Org context switch: admin keeps their own session, Zustand org context changes to target org — all actions are clearly the admin's |
| `service_role` client for admin data reads | Bypasses RLS, "just works" | Exposes service_role key risk; all security assumptions break; any bug becomes a full data breach | Admin org context switch scoped via a separate `is_admin` claim in JWT; regular RLS with an admin bypass policy on `organizations` table only |
| Shared Supabase auth session across all subdomains via broad cookie domain (`.insighty.io`) | Simpler session management | Users on `org-a.insighty.io` could accidentally be authenticated in `org-b.insighty.io` if cookies aren't properly scoped; confusing UX | Each subdomain gets its own isolated session; org membership check at login enforces correct scoping |
| Separate Supabase project per org | Maximum isolation | Ops complexity explodes; separate billing, separate keys, no cross-org admin queries possible | Single Supabase project, RLS + `organization_id` on all tables (already decided — see PROJECT.md) |
| `user_metadata` in JWT for RLS | Easy to add | Users can modify `raw_user_meta_data` directly via Supabase client; security hole | Use `app_metadata` (server-side only) via Custom Access Token Hook, or query `organization_members` table in policies |

---

## Feature Dependencies

```
[organizations table]
    └──required by──> [organization_id FK on data tables]
                          └──required by──> [RLS policies]
                                                └──required by──> [JWT org_id claim (auth hook)]

[organizations table]
    └──required by──> [organization_members table]
                          └──required by──> [org-scoped login (AUTH-01)]
                                                └──required by──> [subdomain org resolution (RT-01)]

[organizations table + organization_id FK]
    └──required by──> [Renderspace data migration]

[JWT org_id claim]
    └──enables──> [org context injected into Zustand stores]

[organizations table + org_id FK + RLS]
    └──required by──> [/admin console — safe to build only after isolation works]

[org context in React state]
    └──required by──> [impersonation (context switch changes org in React state)]
                          └──required by──> [impersonation banner]
```

### Dependency Notes

- **RLS requires JWT org_id**: RLS policies that compare `organization_id = (select auth.jwt()->>'org_id')::uuid` will silently pass all rows (or fail) if the JWT has no `org_id` claim. The auth hook must be in place before any RLS policy is relied upon for security.
- **Subdomain resolution requires organizations table**: `renderspace.insighty.io` → DB lookup for `slug = 'renderspace'` → returns org record. Table must exist first.
- **Migration requires schema + RLS**: Run migration only after `organization_id` columns exist and RLS is in place; otherwise migrated data is visible to all authenticated users until RLS is applied.
- **Admin console is safe after isolation**: The `/admin` route should not be built until RLS is verified working — otherwise Nino is debugging in a system that doesn't yet enforce data isolation.
- **Impersonation requires org context pattern**: The org-context-switch approach (preferred over magic-link) depends on the React org context being injectable at runtime, which is only possible after RT-02 (Zustand stores accept dynamic org_id) is done.

---

## Feature Categories for Phase Planning

### Category A: Database Schema + RLS (Phase 1 — Foundation)

Everything here must exist before any other feature is meaningful.

- [ ] `organizations` table with slug, name, plan, status
- [ ] `organization_id` UUID FK + btree index on all ~20 data tables
- [ ] `organization_members` table (user_id, org_id, role)
- [ ] Supabase Custom Access Token Hook — Postgres function embeds `org_id` into JWT `app_metadata`
- [ ] RLS policies on all tables: `organization_id = (select (auth.jwt()->>'org_id')::uuid)`
- [ ] Admin bypass RLS policy on `organizations` table (for `/admin` queries)

Complexity note: The RLS policy surface is large (~20 tables, 4 operations each = ~80 policies), but the pattern is mechanical and repetitive. The auth hook is the highest-risk item — if it misconfigures JWT required claims, auth breaks entirely.

### Category B: Subdomain Routing + Auth (Phase 2 — Connectivity)

The app needs to know which org it's serving and ensure login is scoped.

- [ ] `resolveOrgFromSubdomain()` — extracts subdomain from `window.location.hostname`, queries `organizations` where `slug = subdomain`, returns org record or 404
- [ ] `OrgContext` React context — holds `{ org_id, org_name, org_slug, org_status }`
- [ ] `OrgProvider` wraps `App` — blocks render until org resolved, shows error if subdomain unknown
- [ ] Login flow checks `organization_members` for user+org membership before completing sign-in
- [ ] All ~20 Zustand stores updated to accept `organization_id` filter on every query
- [ ] Local development: `.insighty.localhost` subdomain setup (or `VITE_ORG_SLUG` env var fallback)

Complexity note: Updating 20 stores is the largest mechanical effort in the milestone. Each store's `fetch*` actions need an `organization_id` WHERE clause added. Pattern is repetitive but tedious.

### Category C: Data Migration (Phase 3 — Continuity)

One-time migration that makes Renderspace's existing data safe in the new model.

- [ ] SQL migration: `INSERT INTO organizations (name, slug, plan, status) VALUES ('Renderspace', 'renderspace', 'paid', 'active')` → capture UUID
- [ ] `UPDATE` all data tables: `SET organization_id = '<renderspace_uuid>'` for all existing rows
- [ ] `INSERT INTO organization_members` for all existing Supabase auth users → renderspace org → role: `admin`
- [ ] Verify: zero rows with `organization_id IS NULL` across all tables post-migration
- [ ] Verify: existing Renderspace functionality unchanged post-migration

Complexity note: Low complexity technically, but HIGH stakes — this runs on live production data. Must be transactional (wrapped in a single migration, rolled back on error). Test on a copy first.

### Category D: Admin Console (Phase 4 — Operations)

Owner-only tooling. Safe to build last, needs all prior phases complete.

- [ ] `/admin` route, `ProtectedRoute` scoped to `nino.erjavec@renderspace.si`
- [ ] Org list view: slug, plan, status, member count, created_at; sortable table
- [ ] Create org form: name, slug (validated unique + URL-safe), initial plan
- [ ] Suspend / reactivate toggle per org (updates `organizations.status`)
- [ ] Plan assignment dropdown per org (free / trial / paid)
- [ ] Impersonation: "View as [Org]" button sets org context in React state without re-auth
- [ ] Impersonation banner: amber fixed top bar, "Viewing as [Org Name]" + "Stop Viewing" button
- [ ] `admin_audit_log` table: append-only log of impersonation starts/ends and status changes

---

## UX Patterns: Org-Context Impersonation (Standard for This Use Case)

The standard "good" admin impersonation UX for a pure org-context switch (not user takeover):

**Initiation:**
- Admin clicks "View as [Org]" in the `/admin` org table
- App sets `orgContext` in React state to the target org (not the admin's own org)
- All Zustand stores refetch scoped to the new org_id
- URL may optionally change to `renderspace.insighty.io` to make the context visually obvious

**During impersonation:**
- Persistent banner pinned to the top of the layout (above the Sidebar/app-layout)
- Amber/yellow background, high contrast: "Viewing as Renderspace — you are in admin view mode"
- "Stop Viewing" button on the right of the banner, returns org context to admin's own org
- Sidebar and page headers still reflect the impersonated org's name
- The admin's own JWT / session is unchanged — no magic links, no sign-out/sign-in

**Termination:**
- "Stop Viewing" resets `orgContext` back to admin org
- Stores refetch for admin org
- Banner disappears

**Audit:**
- `admin_audit_log` INSERT on start: `{ action: 'impersonate_start', admin_user_id, target_org_id, timestamp }`
- `admin_audit_log` INSERT on stop: `{ action: 'impersonate_stop', admin_user_id, target_org_id, timestamp }`

This pattern is lighter than magic-link impersonation (no session invalidation risk), fully auditable (admin's identity is always clear), and sufficient for a single-admin tool (Nino is the only admin).

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| organizations + organization_id FK + RLS | HIGH (security foundation) | MEDIUM | P1 |
| JWT org_id via Custom Access Token Hook | HIGH (RLS depends on it) | MEDIUM | P1 |
| organization_members table | HIGH (login scoping) | LOW | P1 |
| Renderspace data migration | HIGH (production continuity) | LOW-MEDIUM | P1 |
| Subdomain resolution + OrgContext | HIGH (core UX) | LOW | P1 |
| Store updates for org_id scoping | HIGH (data correctness) | MEDIUM | P1 |
| Org-scoped login | HIGH (security) | MEDIUM | P1 |
| /admin org list + create + suspend | HIGH (ops control) | MEDIUM | P1 |
| Org impersonation + banner | MEDIUM (support/debug tool) | MEDIUM | P1 |
| Plan assignment in admin | MEDIUM (billing proxy) | LOW | P2 |
| Admin audit log | MEDIUM (compliance/accountability) | LOW | P2 |
| Org member count in admin | LOW (convenience) | LOW | P3 |

---

## Implementation Complexity Notes (for Roadmap Phase Sizing)

| Area | Estimated Effort | Risk Level | Notes |
|------|-----------------|------------|-------|
| Schema + RLS (~20 tables, ~80 policies) | 2-3 days | MEDIUM | Mechanical but large; one missing policy = data leak |
| Custom Access Token Hook | 0.5 days | HIGH | Misconfiguring required JWT claims breaks all auth; test thoroughly |
| Store updates (20 Zustand stores) | 2-3 days | LOW | Repetitive; each store adds one `organization_id` filter per query |
| Subdomain resolution + OrgContext | 0.5-1 day | LOW | Standard `window.location.hostname` split → DB lookup → React context |
| Org-scoped login | 1 day | MEDIUM | Must verify org membership at login time without breaking existing auth flow |
| Data migration SQL | 0.5 days | HIGH | Low complexity, high stakes — runs on production data |
| /admin console UI | 1.5-2 days | LOW | CRUD UI with existing shadcn/ui components |
| Impersonation + banner | 0.5-1 day | LOW | Context switch + React component; simpler than magic-link approach |

---

## Sources

- [Supabase Row Level Security Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — HIGH confidence
- [Supabase Custom Access Token Hook Docs](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) — HIGH confidence
- [Supabase Custom Claims & RBAC Docs](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) — HIGH confidence
- [Supabase RLS Best Practices (Makerkit)](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) — MEDIUM confidence (third-party, well-established)
- [Multi-Tenant RLS with Supabase (Antstack)](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/) — MEDIUM confidence
- [Supabase Impersonation Pattern (catjam.fi)](https://catjam.fi/articles/supabase-admin-impersonation) — MEDIUM confidence
- [User Impersonation Tool for SaaS (Yaro Labs)](https://yaro-labs.com/blog/user-impersonation-tool-saas) — MEDIUM confidence
- [Clerk Blog: Admin Impersonation UX](https://clerk.com/blog/empower-support-team-user-impersonation) — MEDIUM confidence
- [Supabase Multi-Subdomain Session Issue](https://github.com/supabase/supabase/issues/28199) — HIGH confidence (official GitHub issue)
- [WorkOS: Modelling B2B SaaS with Organizations](https://workos.com/blog/model-your-b2b-saas-with-organizations) — MEDIUM confidence

---

*Feature research for: SaaS multi-tenancy conversion (Agency Intelligence OS v2.0)*
*Researched: 2026-04-24*
