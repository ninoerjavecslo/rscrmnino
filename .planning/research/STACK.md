# Stack Research

**Domain:** SaaS Multi-Tenancy Conversion (Supabase RLS + Subdomain Routing)
**Researched:** 2026-04-24
**Confidence:** HIGH (Supabase RLS/hooks verified against official docs), MEDIUM (deployment wildcard approach — Vercel confirmed, Cloudflare confirmed as NOT supported)

---

## Context: Brownfield Additions Only

The existing stack (React 19, TypeScript strict, Vite 7, Tailwind CSS v4, shadcn/ui, Zustand v5, React Router v7, @supabase/supabase-js ^2.99.1) is NOT being replaced. This document covers only the additions and changes required for v2.0 SaaS multi-tenancy.

---

## Required Stack Additions

### New Supabase Features to Enable

| Feature | Where to Enable | Purpose | Confidence |
|---------|----------------|---------|------------|
| Custom Access Token Hook | Supabase Dashboard → Auth → Hooks | Inject `organization_id` into JWT `app_metadata` at login | HIGH |
| RLS on all data tables | SQL migrations | Row-level isolation per org | HIGH |
| Wildcard Redirect URL | Supabase Dashboard → Auth → URL Configuration | Allow `https://*.insighty.io/**` as valid auth callback | HIGH |

**No Supabase plan upgrade required.** Custom Access Token Hook is available on Free and Pro plans.

### No New npm Packages Needed

The multi-tenancy implementation requires no new frontend dependencies. Everything uses what's already installed:

- Subdomain parsing: `window.location.hostname` — native browser API, no package needed
- JWT decoding for org context: `supabase.auth.getSession()` returns the full session including `app_metadata` claims from the access token — no `jwt-decode` needed
- Zustand store updates: use existing store pattern, add `orgId` as a parameter to fetch calls

The only edge case: if you need to decode the raw JWT access token on the client side outside of Supabase's session object, `jwt-decode` (3.1.2, 0-dep, 1KB) is available but likely unnecessary given `session.user.app_metadata` exposes the claims directly.

---

## Recommended Patterns

### 1. Custom Access Token Hook (JWT org context)

Create a Postgres function that fires on every token issuance and injects `organization_id` into `app_metadata`:

```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  claims jsonb;
  org_id uuid;
begin
  -- Look up the user's org from organization_members
  select om.organization_id into org_id
  from public.organization_members om
  where om.user_id = (event->>'user_id')::uuid
  limit 1;

  claims := event->'claims';

  -- Embed org_id into app_metadata (not user_metadata — user can modify that)
  if org_id is not null then
    claims := jsonb_set(claims, '{app_metadata, organization_id}', to_jsonb(org_id));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Grant auth admin permission to call it
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
```

Enable in `supabase/config.toml`:
```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

**Why app_metadata, not user_metadata:** `user_metadata` can be updated by the authenticated user via `supabase.auth.update()`. `app_metadata` is admin-only. Authorization data must always go in `app_metadata`. (Source: official Supabase RLS docs)

### 2. RLS Helper Function (org context extraction)

Create a stable SQL helper to extract org_id from the JWT — this is cached per-statement by Postgres's optimizer when wrapped in a `SELECT`, avoiding per-row function calls:

```sql
create or replace function auth.organization_id()
returns uuid
language sql stable
as $$
  select nullif(
    ((current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata'
      ->> 'organization_id')),
    ''
  )::uuid
$$;
```

**RLS policy pattern for every tenant table:**
```sql
-- Example for `clients` table
alter table public.clients enable row level security;

create policy "org_isolation" on public.clients
  using ((select auth.organization_id()) = organization_id);
```

**Critical performance requirement:** Add a composite index on `(organization_id, id)` (or `(organization_id, <primary_sort_column>)`) for every tenant-scoped table. RLS policies without matching indexes cause full table scans.

```sql
create index on public.clients (organization_id);
create index on public.projects (organization_id);
-- repeat for all ~15 data tables
```

**Why `(select auth.organization_id())` not `auth.organization_id()` directly:** Wrapping in SELECT causes Postgres to cache the result as an initPlan, evaluating once per statement rather than once per row. Documented 99%+ performance improvement in Supabase's own RLS performance guide.

### 3. Subdomain Resolution (no new library)

At app boot, before any Supabase queries, extract and resolve the org slug:

```typescript
// src/lib/org-context.ts
export function getSubdomainSlug(): string | null {
  const host = window.location.hostname; // e.g. "renderspace.insighty.io"
  const parts = host.split('.');

  // Production: renderspace.insighty.io → 3 parts
  // Local dev: renderspace.localhost → 2 parts
  // insighty.io itself (landing/login) → 2 parts, no subdomain
  if (parts.length < 3) return null;

  const subdomain = parts[0];
  // Exclude reserved subdomains
  if (['www', 'app', 'admin'].includes(subdomain)) return null;
  return subdomain;
}
```

Then in the root of the app (before routing), resolve the slug to an org record via an **unauthenticated** Supabase query on the `organizations` table (public read on slug/id only — no sensitive data):

```typescript
// src/stores/useOrgStore.ts  (new store)
const slug = getSubdomainSlug();
if (slug) {
  const { data } = await supabase
    .from('organizations')
    .select('id, name, slug, plan, status')
    .eq('slug', slug)
    .single();
  // Store in Zustand as current org context
}
```

This approach requires no additional packages and works identically in dev and production.

### 4. Zustand Store Org-Awareness

Existing stores fetch data without an `organization_id` filter because RLS doesn't exist yet. After migration, RLS handles filtering automatically — the stores themselves need **no changes** to their query logic. RLS policies enforce isolation at the database level.

The one required change: stores need to call `reset()` when org context changes (e.g., admin impersonating an org). Add a standard reset action to each store that clears local state and forces re-fetch on next access.

### 5. Deployment: Vercel (wildcard subdomain support confirmed)

Cloudflare Pages does NOT support wildcard custom domains (confirmed as of April 2026, community threads from 2022–2026 all unresolved). Vercel DOES support wildcard domains natively.

**Vercel wildcard setup:**
1. Point `insighty.io` nameservers to `ns1.vercel-dns.com` + `ns2.vercel-dns.com`
2. Add apex domain `insighty.io` to Vercel project
3. Add wildcard `*.insighty.io` to Vercel project
4. Add `vercel.json` for SPA routing:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Vercel issues SSL certificates per subdomain automatically. No additional packages needed.

**Supabase Auth URL configuration (Dashboard → Auth → URL Configuration):**
- Site URL: `https://insighty.io`
- Additional redirect URLs: `https://*.insighty.io/**` (globstar matches across separators, single `*` does NOT work for subdomains because `.` is a separator)

### 6. Local Development Subdomain Testing

No Vite plugin needed. Use `/etc/hosts` entries:

```
127.0.0.1  renderspace.localhost
127.0.0.1  acme.localhost
```

Then run `vite --host` (or `server.host: true` in `vite.config.ts`). Browsers support `*.localhost` subdomains natively. The subdomain parser above handles this with the `parts.length >= 2` check for `.localhost` domains (add a dev-mode branch).

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `jwt-decode` npm package | Supabase session already exposes `session.user.app_metadata` with decoded claims | `supabase.auth.getSession()` |
| Supabase Edge Functions for org resolution | Adds latency and deployment complexity for a simple slug→id lookup | Direct Supabase client query on boot |
| Separate Supabase project per tenant | 10x cost, operational nightmare, breaks shared admin console | Single project + RLS (already decided) |
| Clerk or Auth0 for multi-tenancy | Replaces existing Supabase Auth which already works; massive migration cost | Supabase Custom Access Token Hook |
| PostgreSQL schema-per-tenant | Stronger isolation but requires dynamic schema switching and Supabase doesn't support it cleanly in the JS client | `organization_id` column + RLS (simpler, well-documented pattern) |
| Cloudflare Pages for deployment | Wildcard custom domains NOT supported as of April 2026 | Vercel (wildcard domains supported natively) |
| `set_config` / `request.jwt.claims` manual injection | Old pattern, now superseded by Custom Access Token Hook which is the official Supabase recommendation | Custom Access Token Hook |

---

## Version Compatibility

| Package | Current Version | Status | Notes |
|---------|----------------|--------|-------|
| @supabase/supabase-js | ^2.99.1 (latest: 2.103.3) | OK, no upgrade needed | Custom Access Token Hook supported since v2.x |
| supabase CLI | ^2.78.1 (dev dep) | OK | `config.toml` hook config supported |
| Vite | ^7.3.1 | OK | `server.host: true` for subdomain dev |
| React Router | ^7.13.1 | OK | No changes needed — subdomain routing bypasses React Router |
| Zustand | ^5.0.11 | OK | Add reset actions to existing stores |

**Upgrade recommendation:** `@supabase/supabase-js` from ^2.99.1 → ^2.103.3 is safe (patch-level only) but not required for this milestone.

---

## Migration SQL Pattern (single-tenant → multi-tenant)

The migration must be sequenced carefully to avoid locking out the existing Renderspace data:

1. Create `organizations` table + insert Renderspace org
2. Create `organization_members` table + link existing auth users
3. Add `organization_id uuid references organizations(id)` column (nullable initially) to all data tables
4. Backfill: `UPDATE <table> SET organization_id = '<renderspace-org-uuid>'`
5. Add `NOT NULL` constraint after backfill confirms 0 nulls
6. Add indexes on `organization_id` for all tables
7. Enable RLS on all tables
8. Add RLS policies (using `auth.organization_id()` helper)
9. Enable Custom Access Token Hook in Supabase dashboard + config.toml
10. Add wildcard redirect URL in Supabase dashboard

**Do not enable RLS before backfill is complete.** Enabling RLS on a table with no policies locks out all access. Enabling with policies before backfill means existing rows have `organization_id = NULL` and fail the policy check.

---

## Sources

- [Supabase Custom Access Token Hook Docs](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) — hook SQL structure, enabling via config.toml, limitations
- [Supabase Auth Hooks Overview](https://supabase.com/docs/guides/auth/auth-hooks) — available hooks, Free/Pro tier availability
- [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — `(select auth.uid())` caching pattern, index performance data
- [Supabase Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) — app_metadata vs user_metadata for authorization
- [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) — wildcard glob rules, separator characters, `**` for subdomain matching
- [Supabase RLS Best Practices (Makerkit)](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices) — security definer patterns, membership table approach, production patterns
- [Simple Supabase Multi-Tenancy (Roughly Written)](https://roughlywritten.substack.com/p/supabase-multi-tenancy-simple-and) — `auth.tenant_id()` helper function pattern, `app_metadata` SQL examples
- [Vercel Wildcard Domain Docs](https://vercel.com/docs/multi-tenant/domain-management) — wildcard `*.insighty.io` setup, nameserver requirements, SPA rewrite config
- [Cloudflare Pages Wildcard Limitation](https://community.cloudflare.com/t/wildcard-subdomains-for-pages-in-2026/908010) — confirmed not supported as of April 2026

---

*Stack research for: SaaS multi-tenancy conversion — Supabase RLS + subdomain routing*
*Researched: 2026-04-24*
