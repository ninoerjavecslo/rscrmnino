# Architecture Research

**Domain:** SaaS multi-tenancy conversion — React + Zustand + Supabase
**Researched:** 2026-04-24
**Confidence:** HIGH (Supabase official docs + existing codebase inspection)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser — subdomain resolution at app boot                          │
│  renderspace.insighty.io → slug = "renderspace"                      │
├──────────────────────────────────────────────────────────────────────┤
│  App Boot Sequence (before any auth)                                 │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  useOrgContext (new)                                          │    │
│  │  1. parse window.location.hostname → slug                    │    │
│  │  2. supabase.from('organizations').select().eq('slug', slug)  │    │
│  │  3. store { org_id, name, slug, plan } in OrgContext          │    │
│  │  4. if org not found → render <OrgNotFound />                 │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                              ↓                                        │
│  Auth layer (existing LoginView + supabase.auth)                     │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  JWT on issue includes custom claim: org_id                  │    │
│  │  (via custom_access_token_hook Postgres function)            │    │
│  └──────────────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────────────┤
│  State Layer                                                         │
│  ┌──────────────┐   ┌─────────────────────────────────────────┐     │
│  │  useOrgStore │   │  All 20 Zustand stores (unmodified API)  │     │
│  │  (new)       │   │  fetchAll(), add(), update(), remove()   │     │
│  │  org_id      │   │  — RLS handles scoping via JWT claim     │     │
│  │  impersonated│   └─────────────────────────────────────────┘     │
│  └──────────────┘                                                    │
├──────────────────────────────────────────────────────────────────────┤
│  Supabase — single project, single schema                            │
│  ┌──────────────────┐  ┌────────────────────────────────────┐       │
│  │  RLS Policies     │  │  Postgres Auth Hook                │       │
│  │  on all 14 tables │  │  custom_access_token_hook()        │       │
│  │  using JWT claim  │  │  injects org_id into JWT           │       │
│  └──────────────────┘  └────────────────────────────────────┘       │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|---------------|----------------|
| `useOrgContext` hook (new) | Resolve org from subdomain at boot, expose org_id/name/slug | `useEffect` on mount, queries `organizations` table using anon key, stores result in React context |
| `OrgContext` + `OrgProvider` (new) | Hold org context across tree, gate auth render | React context wrapping `App`; children render only after org resolves |
| `useOrgStore` Zustand store (new) | Hold org_id + impersonation override state | Separate from React context — needed for admin impersonation |
| `custom_access_token_hook` Postgres function (new) | Inject `org_id` into JWT at sign-in | Runs in DB, queries `organization_members` for user's org, sets `app_metadata.org_id` in JWT |
| RLS policies on all tables (new) | Restrict every row to the JWT's `org_id` | `using ((select (auth.jwt()->'app_metadata'->>'org_id')::uuid) = organization_id)` |
| `AdminRoute` component (new) | Gate `/admin` routes to owner email only | Checks `session.user.email === OWNER_EMAIL` — no store dependency |
| Modified `App.tsx` | Add org boot sequence before auth check | Wraps current session check with org resolution phase |
| Modified ProtectedRoute | Unchanged in logic — RLS handles data; permissions stay per-org-member | No change needed to existing `ProtectedRoute` |

## Recommended Project Structure

```
src/
├── lib/
│   ├── supabase.ts          # unchanged
│   ├── types.ts             # add Organization, OrgMember types
│   ├── useCurrentUser.ts    # unchanged
│   └── usePagePermission.ts # unchanged
├── contexts/
│   └── OrgContext.tsx       # NEW — org_id, slug, name, plan, loading, status
├── stores/
│   ├── org.ts               # NEW — useOrgStore: activeOrgId, impersonatedOrgId, setImpersonate()
│   ├── clients.ts           # unchanged (RLS does the scoping)
│   ├── projects.ts          # unchanged
│   └── [all 18 others]      # unchanged
├── components/
│   ├── ProtectedRoute.tsx   # unchanged
│   ├── AdminRoute.tsx       # NEW — owner-only gate
│   └── OrgNotFound.tsx      # NEW — shown when slug doesn't resolve
└── views/
    └── admin/
        ├── AdminView.tsx    # NEW — org list + impersonation
        ├── AdminOrgList.tsx # NEW
        └── AdminOrgCreate.tsx # NEW
```

### Structure Rationale

- **contexts/OrgContext.tsx:** Org resolution happens before auth, before any Zustand store. A React context (not a store) is the right primitive for pre-auth boot data that gates the rest of the tree.
- **stores/org.ts:** A separate small Zustand store for impersonation state that admin UI can write to — this is the one case where a store needs to influence queries. But in the standard (non-admin) path, no store is needed because RLS is automatic.
- **views/admin/:** Grouped under a single folder so the build-order is clear and the route file is clean. All admin views are owner-gated, not org-gated.

## Architectural Patterns

### Pattern 1: JWT Claim RLS (recommended approach)

**What:** Inject `org_id` into the Supabase JWT at token issuance via a custom Postgres hook. All RLS policies compare the row's `organization_id` column against the JWT claim. Zero changes to existing store query code.

**When to use:** This project — single Supabase project, anon key client, standard org-per-user membership.

**Trade-offs:** JWT claims are set at login and updated on token refresh (every ~60 minutes). For org membership changes (rare), the lag is acceptable. Claims are immutable mid-session without a re-sign-in or forced token refresh.

**Hook function (Postgres):**
```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  v_org_id uuid;
begin
  -- Look up user's org from organization_members
  select org_id into v_org_id
  from public.organization_members
  where user_id = (event->>'user_id')::uuid
  limit 1;

  claims := event->'claims';

  -- Nest org_id inside app_metadata (Supabase convention)
  if jsonb_typeof(claims->'app_metadata') is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}');
  end if;

  if v_org_id is not null then
    claims := jsonb_set(claims, '{app_metadata,org_id}', to_jsonb(v_org_id));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Required grants
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
```

**RLS policy template (same pattern on all 14 tables):**
```sql
-- Helper function — call once, reuse in all policies
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
as $$
  select (auth.jwt()->'app_metadata'->>'org_id')::uuid
$$;

-- SELECT policy (same pattern for INSERT/UPDATE/DELETE)
create policy "org_isolation_select"
on public.clients
for select
to authenticated
using (organization_id = (select public.current_org_id()));
```

The `(select ...)` wrapper is critical — Postgres caches the function result per-statement as an `initPlan`, avoiding per-row evaluation. This is documented as providing up to 100x+ speedup on large tables.

### Pattern 2: Org Context at App Boot (pre-auth subdomain resolution)

**What:** Before showing login or any authenticated content, read `window.location.hostname`, extract the subdomain slug, and fetch the org record from the `organizations` table using the anon key (public read on slug+id+name only — no sensitive data).

**When to use:** This project — subdomain-per-tenant with Supabase anon key client.

**Trade-offs:** One extra DB query at boot. On localhost (`localhost` or `app.localhost`) fall back to a dev org or env-var override. The organizations table needs a permissive read policy on its public fields for the anon role (slug, id, name, plan — not internal fields).

**Implementation:**
```typescript
// src/contexts/OrgContext.tsx
export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [org, setOrg] = useState<OrgContext | null>(null)
  const [status, setStatus] = useState<'loading' | 'found' | 'not_found'>('loading')

  useEffect(() => {
    const hostname = window.location.hostname // e.g. "renderspace.insighty.io"
    const parts = hostname.split('.')
    // "renderspace.insighty.io" → slug = "renderspace"
    // "localhost" → use VITE_DEV_ORG_SLUG env var
    const slug = parts.length >= 3
      ? parts[0]
      : import.meta.env.VITE_DEV_ORG_SLUG ?? 'renderspace'

    supabase
      .from('organizations')
      .select('id, slug, name, plan, status')
      .eq('slug', slug)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setStatus('not_found'); return }
        setOrg({ orgId: data.id, slug: data.slug, name: data.name, plan: data.plan })
        setStatus('found')
      })
  }, [])

  if (status === 'loading') return null  // no flash
  if (status === 'not_found') return <OrgNotFound />
  return <OrgContextValue.Provider value={org!}>{children}</OrgContextValue.Provider>
}
```

### Pattern 3: Impersonation via App State Override (admin only)

**What:** Admin impersonation does NOT re-authenticate as the target org's user. Instead, the admin's own JWT is used but the `useOrgStore` holds an `impersonatedOrgId` that is passed explicitly to queries in the admin context. Standard org queries continue to use RLS (admin's own JWT org). Impersonation queries use the service-role client (server-side) or a dedicated admin Supabase function.

**When to use:** `/admin` route only — Nino's account impersonating orgs for support.

**Trade-offs:** Simpler than magic-link impersonation (no session swap). Works by reading data via a Supabase Edge Function that accepts `org_id` as a param and uses the service-role key — the admin UI is just a viewer, not a full data mutator. This avoids the complexity of JWT minting or magic-link flows.

**Pattern:**
```typescript
// stores/org.ts
interface OrgStoreState {
  impersonatedOrgId: string | null
  setImpersonate: (orgId: string | null) => void
}
export const useOrgStore = create<OrgStoreState>((set) => ({
  impersonatedOrgId: null,
  setImpersonate: (orgId) => set({ impersonatedOrgId: orgId }),
}))
```

The admin panel's data views call a dedicated `adminFetchOrg(orgId)` function that uses the service-role client (env var `VITE_SUPABASE_SERVICE_ROLE` — only set in admin build context, or via an Edge Function). Regular stores are never touched.

### Pattern 4: Why NOT `set_config` Session Context

**What people consider:** Calling `supabase.rpc('set_config', { parameter: 'app.org_id', value: orgId })` before every query to set a session-local Postgres variable that RLS policies read via `current_setting('app.org_id')`.

**Why not here:**
1. The existing stores use the anon key client which is stateless per-request — there is no persistent session context between the `set_config` RPC call and the subsequent query. In Supabase's PostgREST layer, each REST request is a separate transaction.
2. It requires modifying every store's query flow to include the pre-call, defeating the goal of zero store changes.
3. `set_config` is useful in backend server contexts (Node/Edge Functions) where you control the transaction boundary. It does not work reliably with the Supabase JS client in a browser SPA.

The JWT claim approach requires zero changes to any of the 20 existing stores.

## Data Flow

### Boot Sequence (full flow)

```
Browser loads renderspace.insighty.io
    ↓
OrgProvider mounts
    ↓
Parse hostname → slug "renderspace"
    ↓
supabase.from('organizations').select().eq('slug', 'renderspace') [anon key]
    ↓
Org found → { orgId, name, slug, plan } stored in OrgContext
    ↓
App.tsx renders → supabase.auth.getSession()
    ↓
Session exists → JWT already contains app_metadata.org_id (set at login)
    ↓
fetchPermissions() → permissions store loads
    ↓
Main app renders — all stores call fetchAll() with zero org scoping code
    ↓
Supabase RLS: every query filtered to org_id from JWT automatically
```

### Login Flow (first-time or new session)

```
User submits credentials on subdomain
    ↓
supabase.auth.signInWithPassword()
    ↓
Supabase Auth calls custom_access_token_hook()
    ↓
Hook queries organization_members WHERE user_id = auth.uid()
    ↓
org_id appended to JWT app_metadata.org_id
    ↓
JWT returned to client — stored in supabase auth session
    ↓
All subsequent queries automatically filtered by RLS
```

### Store Query Flow (no changes to existing stores)

```
useClientsStore.fetchAll()
    ↓
supabase.from('clients').select('*').order('name')
    ↓
PostgREST applies RLS on 'clients' table
    ↓
RLS policy: organization_id = (select current_org_id())
current_org_id() = (auth.jwt()->'app_metadata'->>'org_id')::uuid
    ↓
Only rows matching the JWT's org_id are returned
```

### Key Data Flows

1. **Subdomain → org_id:** `window.location.hostname` → slug → `organizations` table → `org_id` in React context. Happens before auth.
2. **User → org_id in JWT:** `organization_members` table → Postgres hook → JWT `app_metadata.org_id`. Happens at sign-in.
3. **Query → filtered rows:** JWT claim → `current_org_id()` function → RLS policy on every table. Happens on every Supabase query automatically.
4. **Admin impersonation:** Admin's JWT unchanged → service-role Edge Function accepts `target_org_id` param → returns org data for admin display only.

## Integration Points — Existing Files

### New Files

| File | Purpose |
|------|---------|
| `src/contexts/OrgContext.tsx` | Boot-time org resolution from subdomain, OrgProvider, useOrg hook |
| `src/stores/org.ts` | Impersonation state (admin use only) |
| `src/components/AdminRoute.tsx` | Owner-only route gate |
| `src/components/OrgNotFound.tsx` | Rendered when subdomain slug has no matching org |
| `src/views/admin/AdminView.tsx` | Admin console — org list, create, suspend |
| `src/views/admin/AdminOrgList.tsx` | Org table with plan/status badges |
| `src/views/admin/AdminOrgCreate.tsx` | New org form |
| `supabase/migrations/001_multi_tenancy.sql` | Organizations, org_members tables + organization_id columns + backfill |
| `supabase/migrations/002_rls_policies.sql` | RLS enable + policies on all 14 tables |
| `supabase/migrations/003_auth_hook.sql` | custom_access_token_hook function + grants |

### Modified Files

| File | What Changes | Why |
|------|-------------|-----|
| `src/App.tsx` | Wrap with `<OrgProvider>` before session check; add `/admin` route + `<AdminRoute>` | Org must resolve before auth renders; admin route added |
| `src/lib/types.ts` | Add `Organization`, `OrgMember` interfaces; add `organization_id: string` to all entity types | Type accuracy after migration |
| `src/stores/permissions.ts` | `app_users` and `user_permissions` tables need `organization_id`; queries need RLS too | Permissions are per-org, not global |
| `vite.config.ts` or `.env.local` | Add `VITE_DEV_ORG_SLUG=renderspace` for local dev | Localhost has no subdomain |

### Files That Do NOT Change

All 20 Zustand stores (`clients.ts`, `projects.ts`, `domains.ts`, `maintenances.ts`, `pipeline.ts`, `changeRequests.ts`, `infrastructure.ts`, `revenuePlanner.ts`, `resource.ts`, `timesheet.ts`, `automations.ts`, `reminders.ts`, `settings.ts`, `agencyTools.ts`, `contractors.ts`, `emailIntake.ts`, `holidays.ts`, `jira.ts`, `offers.ts`, `pixel.ts`) — zero changes needed. RLS handles all scoping.

`ProtectedRoute.tsx` — logic unchanged. Permissions are scoped by org via RLS on `user_permissions` table.

`useCurrentUser.ts` — unchanged. Reads from `user_metadata` which is per-user regardless of org.

## Build Order

### Why this specific order (dependency chain)

The chicken-and-egg problem: RLS requires `organization_id` columns on tables, but existing Renderspace data has no `organization_id`. Migrations must backfill before RLS is enabled, or the app breaks for the current user.

```
Phase 1 — Database (no app code yet)
    ↓
  Create organizations + organization_members tables
  Add organization_id column to all 14 data tables (nullable initially)
  Create Renderspace org record
  Backfill organization_id on all existing rows (UPDATE ... SET organization_id = renderspace_id)
  Make organization_id NOT NULL after backfill
  Add auth hook function (custom_access_token_hook)
  Register hook in Supabase dashboard (Auth > Hooks)
  Enable RLS on all tables
  Add RLS policies
  ↓
  VERIFY: existing Renderspace user can still log in and see all data

Phase 2 — Subdomain Infrastructure
    ↓
  Configure DNS wildcard: *.insighty.io → app server
  Add organizations RLS policy for anon SELECT (slug, id, name, plan only)
  ↓
  VERIFY: renderspace.insighty.io loads OrgContext correctly

Phase 3 — App Boot + OrgContext
    ↓
  OrgContext.tsx + OrgProvider
  OrgNotFound.tsx
  Modify App.tsx to wrap with OrgProvider
  Add VITE_DEV_ORG_SLUG to local .env
  ↓
  VERIFY: app boots, org resolves from subdomain, all existing views still work

Phase 4 — Admin Console
    ↓
  AdminRoute.tsx
  admin/ views (list, create, suspend, impersonate)
  useOrgStore (impersonation state)
  ↓
  VERIFY: /admin accessible only to nino.erjavec@renderspace.si

Phase 5 — Settings + permissions migration
    ↓
  app_settings and user_permissions tables get organization_id + RLS
  Verify settings/permissions still load for Renderspace users
```

### The Critical Ordering Constraint

**RLS must NOT be enabled before backfill completes.** If you enable RLS before rows have `organization_id`, the existing user (Renderspace) will immediately see zero rows on all tables (policy `organization_id = current_org_id()` fails because `organization_id` is NULL). The safe sequence is:

1. Add nullable `organization_id` column
2. Create org record
3. Backfill all rows
4. Make column NOT NULL
5. Enable RLS
6. Add policies
7. Register auth hook

Do steps 1–7 in a single migration transaction where possible, or keep the app offline during the migration window.

## Scaling Considerations

| Scale | Architecture Adjustment |
|-------|------------------------|
| 0–50 orgs | Current architecture with no changes — single Supabase project, RLS handles isolation |
| 50–500 orgs | Add index on `organization_id` on all large tables (projects, invoices, pipeline, domains) — critical for RLS performance |
| 500–5000 orgs | Monitor PostgREST connection pool; consider Supabase connection pooler (pgBouncer already included) |
| 5000+ orgs | Evaluate schema-per-tenant or Postgres row sharding; this is far beyond current scope |

### Scaling Priorities

1. **First bottleneck:** Missing indexes on `organization_id`. RLS scans every row without them. Add `CREATE INDEX ON clients(organization_id)` etc. for all 14 tables in Phase 1 migration.
2. **Second bottleneck:** `custom_access_token_hook` doing a DB query on every token issue. Acceptable at current scale; if it becomes slow, add an index on `organization_members(user_id)`.

## Anti-Patterns

### Anti-Pattern 1: Passing org_id explicitly in every store query

**What people do:** Add `orgId` parameter to every `fetchAll()`, every `add()`, manually appending `.eq('organization_id', orgId)` to every query across all 20 stores.

**Why it's wrong:** It requires touching 80–120 query sites, creates a maintenance surface where any new store can accidentally omit the filter, and the filter can be bypassed by a bug. It also means stores need to know about org context, creating an import cycle risk.

**Do this instead:** Use RLS + JWT claim. The database enforces isolation unconditionally. No application code can accidentally bypass it. Zero existing store changes needed.

### Anti-Pattern 2: Storing org_id in localStorage or user_metadata and trusting the client

**What people do:** Store the resolved `org_id` in `localStorage` or in `user_metadata`, then pass it in query headers or body — trusting the client-provided value in RLS.

**Why it's wrong:** A malicious user can set any `org_id` in localStorage or user_metadata and access another tenant's data. User_metadata is user-writable. The org_id must come from `app_metadata` (server-controlled) via the auth hook.

**Do this instead:** `app_metadata` is only writable by service-role/hooks — not by the client. Always use `auth.jwt()->'app_metadata'->>'org_id'` in RLS, never `auth.jwt()->'user_metadata'->>'org_id'`.

### Anti-Pattern 3: Resolving org from subdomain inside every store

**What people do:** Each store reads `window.location.hostname`, parses the slug, and makes an organizations lookup.

**Why it's wrong:** 20 duplicate DNS lookups per page load. Race conditions. Tight coupling between stores and routing.

**Do this instead:** Resolve once in `OrgProvider` at app boot, expose via `useOrg()` context hook. Stores don't need to know about org resolution — RLS handles scoping for them.

### Anti-Pattern 4: Using `set_config` in a browser SPA

**What people do:** Call `supabase.rpc('set_config', { key: 'app.org_id', value: orgId })` before each query to set the Postgres session variable.

**Why it's wrong:** PostgREST opens a new transaction per HTTP request. `set_config` set in one RPC call is not visible in the next SELECT query — they are separate transactions. This gives a false sense of security while providing no actual isolation.

**Do this instead:** JWT claims — they travel with every request automatically.

## Sources

- [Supabase Custom Access Token Hook docs](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) — HIGH confidence (official)
- [Supabase Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) — HIGH confidence (official)
- [Supabase Row Level Security docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — HIGH confidence (official); documents SELECT-wrap optimization for `auth.jwt()`
- [Supabase RLS Multi-tenant pattern](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/) — MEDIUM confidence (community blog, verified against official docs)
- [Supabase Auth Hooks reference](https://supabase.com/docs/guides/auth/auth-hooks) — HIGH confidence (official)
- Codebase inspection: `src/stores/clients.ts`, `src/stores/projects.ts`, `src/stores/permissions.ts`, `src/App.tsx`, `src/lib/supabase.ts`, `src/lib/useCurrentUser.ts`

---
*Architecture research for: Agency Intelligence OS — SaaS multi-tenancy conversion*
*Researched: 2026-04-24*
