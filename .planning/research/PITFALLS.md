# Pitfalls Research

**Domain:** Brownfield SaaS multi-tenancy conversion — Supabase RLS + subdomain routing + admin impersonation on existing React/Zustand app
**Researched:** 2026-04-24
**Confidence:** HIGH (all critical pitfalls verified against official Supabase docs + community post-mortems)

---

## Critical Pitfalls

### Pitfall 1: RLS Enabled But Tables Silently Missing Coverage

**What goes wrong:**
After adding `organization_id` and writing policies for the main tables, a handful of tables (automations, reminders, resource plans, timesheets, settings) are missed because they were added incrementally or are considered "non-sensitive." RLS is enabled globally but those tables have no SELECT policy — so they return zero rows to all users silently. Alternatively, some tables are skipped entirely and RLS is never enabled — any user with the anon key can read all rows.

**Why it happens:**
Developers write policies for the tables they're actively thinking about (clients, projects, invoices) and forget the supporting tables. Supabase does not warn you that a table has RLS enabled with no policies, nor that a table has no RLS enabled at all unless you run an advisor query. In a brownfield app with ~20 data tables, manual tracking fails.

**How to avoid:**
1. Run a coverage query immediately after migration:
   ```sql
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public'
   ORDER BY tablename;
   ```
   Every table must have `rowsecurity = true`.
2. Run the Supabase Security Advisor (Dashboard → Database → Advisors) — it flags tables without RLS and tables with RLS but zero policies.
3. Maintain a migration checklist of every table in the schema and tick off RLS policy creation per table before considering Phase 1 done.
4. Write a pg_tap test that asserts every `public` table has at least one RLS policy.

**Warning signs:**
- A Zustand store returns an empty array after migration even when data clearly exists
- `SELECT count(*) FROM automations` returns 0 for an authenticated user but returns correct count as `postgres` role
- The Security Advisor shows "no policy" warnings

**Phase to address:** Phase 1 (Schema + RLS foundation)

---

### Pitfall 2: user_metadata Used in RLS Policies (User-Controlled Claims)

**What goes wrong:**
The RLS policy reads `org_id` from `auth.jwt() -> 'user_metadata'`. Because `raw_user_meta_data` is writable by the authenticated user via `supabase.auth.updateUser()`, any user can set their own `user_metadata.org_id` to a different organization's UUID and gain access to that org's data.

**Why it happens:**
Supabase's JWT payload contains both `user_metadata` (user-controlled) and `app_metadata` (server-controlled). The visual similarity of the two fields and the fact that both appear in the JWT causes developers to reach for whichever they see first in examples. Many community blog posts use `user_metadata` incorrectly.

**How to avoid:**
Only store `org_id` in `app_metadata`, which cannot be written by the client. When using a Custom Access Token Hook, query the `organization_members` table inside the hook and embed `org_id` into the JWT from a server-controlled source. The RLS policy must reference `(auth.jwt() ->> 'app_metadata')::jsonb ->> 'org_id'` or the resolved claim key, never `user_metadata`.

Alternatively — and more robustly — do not embed `org_id` in the JWT at all. Instead, resolve org membership at query time by joining against the `organization_members` table:
```sql
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = (SELECT auth.uid())
  )
)
```

**Warning signs:**
- Any policy containing `auth.jwt() -> 'user_metadata'`
- Users reporting they can see data that isn't theirs after updating their profile

**Phase to address:** Phase 1 (Schema + RLS foundation)

---

### Pitfall 3: SQL Testing in Supabase Dashboard Bypasses RLS

**What goes wrong:**
Developer writes a policy, runs a test SELECT in the Supabase SQL editor, sees the expected rows, and concludes the policy works. In production, authenticated users see zero rows or wrong rows. The policy was actually broken the whole time.

**Why it happens:**
The Supabase SQL editor runs as the `postgres` superuser role, which bypasses all RLS policies unconditionally. Every SELECT returns every row regardless of what policies say. This is the single most common RLS debugging trap.

**How to avoid:**
Test policies by impersonating a specific user role in SQL:
```sql
-- Impersonate an authenticated user
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "user-uuid-here", "role": "authenticated"}';
SELECT * FROM clients;
RESET ROLE;
```
Or use the Supabase client in a test script with a real user session token. Also write pg_tap tests that authenticate as specific user IDs and assert row counts.

**Warning signs:**
- Policies "work" in the SQL editor but produce empty results in the app
- You have never tested policies as a non-postgres role

**Phase to address:** Phase 1 (Schema + RLS foundation) — verification step must use role impersonation

---

### Pitfall 4: Stale JWT Claims After Organization Assignment Changes

**What goes wrong:**
Admin assigns a user to a new organization (or changes their role). The `app_metadata` is updated in the database. But the user's current access token still carries the old `org_id` claim. RLS queries using the JWT claim continue to authorize against the old org for up to 1 hour (the default access token lifetime). The user sees the old org's data or gets access denied on the new org.

**Why it happens:**
JWTs are stateless. Supabase only checks `exp` (expiry) on the access token — there is no server-side revocation check on the access token itself. The Custom Access Token Hook runs at token issuance, not on every request. So the claim in a live token can be stale relative to the database.

**How to avoid:**
Two strategies, use both:

1. **Force token refresh after org change:** After updating `app_metadata`, call `supabase.auth.admin.signOut(userId, 'others')` or trigger a session invalidation so the user's next request forces a token refresh.

2. **Use database-resolved membership instead of JWT claims in RLS:** The most resilient pattern is not relying on JWT for `org_id` at all. Write policies that join against `organization_members` table (see Pitfall 2 "How to avoid" pattern). This adds one join per query but eliminates the stale-claim window entirely.

The Custom Access Token Hook approach is convenient but requires accepting a stale window equal to the access token TTL (default 1 hour). For an admin tool this is acceptable; document it as a known limitation.

**Warning signs:**
- User reports seeing a previous org's data after being moved between orgs
- Impersonation session shows wrong org data during the first hour after org context was changed in the admin console

**Phase to address:** Phase 1 (AUTH-02), verified again in Phase 4 (admin impersonation)

---

### Pitfall 5: UPDATE Policies Without Corresponding SELECT Policy

**What goes wrong:**
An `organization_id` UPDATE policy is written but the SELECT policy for the same table is missing or too restrictive. UPDATE operations silently return 0 rows affected with no error. The frontend treats this as a success (no exception thrown) and shows a success toast while no data was changed.

**Why it happens:**
PostgreSQL evaluates the SELECT policy first to identify which rows the UPDATE can act on. If SELECT returns no rows for the current user, UPDATE has nothing to update — and returns success with 0 affected rows, not an error. This is surprising and hard to diagnose.

**How to avoid:**
For every table with an UPDATE policy, verify there is also a matching SELECT policy with the same `USING` condition. When writing migrations, always create SELECT + INSERT + UPDATE + DELETE policies as a set, never a subset.

Test pattern: run an update as an impersonated user and assert `count > 0` in the result, not just absence of error.

**Warning signs:**
- Save operations return 200 OK but data does not change in the database
- Update count is consistently 0 after migration

**Phase to address:** Phase 1 — add to migration checklist and pg_tap tests

---

### Pitfall 6: Data Backfill Migration Locks the Table

**What goes wrong:**
The backfill migration does `UPDATE clients SET organization_id = 'renderspace-uuid' WHERE organization_id IS NULL` as a single statement. On a table with thousands of rows, this holds an `ACCESS EXCLUSIVE` lock for the duration. Other queries queue behind it. If Supabase's connection pool has a statement timeout shorter than the migration duration, the migration fails midway, leaving some rows with `organization_id` NULL.

**Why it happens:**
Single-statement bulk UPDATE is the intuitive approach. In a single-tenant app with modest data, it works fine in testing. The developer doesn't account for connection pool timeouts or concurrent read traffic.

**How to avoid:**
1. Run the backfill in small batches using a `LIMIT` + `RETURNING` loop — or use a one-time migration that sets a constant DEFAULT on the column (fast on Postgres 11+, no table rewrite):
   ```sql
   ALTER TABLE clients ADD COLUMN organization_id uuid REFERENCES organizations(id);
   UPDATE clients SET organization_id = 'renderspace-uuid'; -- acceptable for small dataset
   ALTER TABLE clients ALTER COLUMN organization_id SET NOT NULL;
   ```
   For Renderspace's current data volume (single tenant, likely < 10k rows per table), a single UPDATE is safe, but verify row counts before running.

2. Add the column as nullable first, backfill, then add the NOT NULL constraint separately — this prevents the constraint check from locking the table during the write.

3. Run the migration during off-hours or use Supabase's migration tooling with a transaction that has explicit timeouts set.

**Warning signs:**
- Migration script times out with "canceling statement due to statement timeout"
- Rows with `NULL` organization_id exist after a "completed" migration
- RLS queries return inconsistent results (some rows visible, some not)

**Phase to address:** Phase 3 (MIG-01, MIG-02)

---

### Pitfall 7: FK Constraint Order in Migration — Referenced Table Must Exist First

**What goes wrong:**
The migration adds `organization_id uuid REFERENCES organizations(id)` to `clients` before the `organizations` table exists. Migration fails with `ERROR: relation "organizations" does not exist`. If migrations run as a set of files, any file that adds the FK column will fail if loaded before the file that creates `organizations`.

**Why it happens:**
In brownfield migrations split across multiple SQL files, the execution order depends on filename sorting or manual ordering. Developers writing parallel files can accidentally get this wrong, especially if the organizations table creation and the FK additions are in separate files.

**How to avoid:**
Use a single migration file or enforce strict ordering. The correct sequence:
1. Create `organizations` table
2. Create `organization_members` table  
3. Add `organization_id` columns to all data tables (with FK referencing `organizations`)
4. Backfill data
5. Add NOT NULL constraints
6. Enable RLS and create policies
7. Create indexes on `organization_id` columns

Never split steps 1 and 3 into unordered migration files.

**Warning signs:**
- Migration fails with "relation does not exist" error
- Partial migrations leave the schema in an inconsistent state

**Phase to address:** Phase 3 (MIG-01)

---

### Pitfall 8: Zustand Stores Retain Previous Org's Data After Impersonation Switch

**What goes wrong:**
Admin enters impersonation mode for Org B while previously viewing Org A (Renderspace). The Zustand stores still hold Org A's clients, projects, and invoices in memory. The new org context is set, but the stores are not flushed. The admin sees Org A's data visually while operating in Org B's context — and any write that goes through will use the new `organization_id` but be mixed with stale Org A state in the UI.

This is not just a UX issue: if an admin triggers a save from a form that was pre-populated with Org A data while the org context has switched to Org B, a record from Org A's dataset is written into Org B's data with Org B's `organization_id`. Cross-tenant data contamination.

**Why it happens:**
Zustand stores in this app are populated lazily (each store's `fetch*` action is called per-view). When the org context changes, no central mechanism invalidates and refetches all stores. The 20 independent stores all hold their last-fetched data, which belonged to the previous org.

**How to avoid:**
1. Create a central `resetAllStores()` function that calls each store's reset method:
   ```ts
   // src/lib/resetAllStores.ts
   export function resetAllStores() {
     useClientsStore.getState().reset()
     useProjectsStore.getState().reset()
     useInfraStore.getState().reset()
     // ... all 20 stores
   }
   ```
2. Call `resetAllStores()` before switching org context in the impersonation flow and before exiting impersonation.
3. Return the org context store to the previous state synchronously, before any navigation happens.
4. Gate all form renders on `orgId === record.organization_id` so stale data can never be submitted for a different org.

**Warning signs:**
- After entering impersonation, a store still shows the previous org's count/names
- An admin saves a record and it appears in the impersonated org's data view

**Phase to address:** Phase 4 (ADM-06)

---

### Pitfall 9: Admin Impersonation Allows Accidental Mutations

**What goes wrong:**
Admin enters impersonation mode to debug a client's view. The UI looks identical to a normal session. Admin accidentally clicks Save on a form, deletes a record, or triggers an automation — and the action executes against the impersonated org's real data. There is no warning, no confirmation, and the audit trail doesn't distinguish admin-impersonation writes from legitimate org-user writes.

**Why it happens:**
Impersonation that simply swaps the `org_id` in the Zustand context and uses the admin's existing Supabase session gives full write access. The admin is not reminded they are in impersonation mode. Normal UX flows (save buttons, delete confirmations) work exactly as usual.

**How to avoid:**
1. **Visual indicator:** Always show a persistent banner — "Viewing as [OrgName] — Impersonation Mode" — that cannot be dismissed. Style it in a distinct color (amber/red).
2. **Read-only by default:** The impersonation context flag should default to read-only. All form submit handlers check `isImpersonating && !impersonationWriteEnabled` and show a blocked state.
3. **Explicit write enablement:** Add a toggle "Allow writes in this session" that requires a confirmation. Log every write made under impersonation to a separate `admin_actions` audit table with `(admin_user_id, impersonated_org_id, action, timestamp)`.
4. **RLS enforcement:** Impersonation should NOT use the admin's service_role key. It should use the RLS-enforced authenticated role scoped to the impersonated org, so the database itself prevents cross-org writes.

**Warning signs:**
- No visual distinction between impersonation and normal admin session
- Mutations succeed silently during impersonation testing
- No audit log entries for impersonated actions

**Phase to address:** Phase 4 (ADM-06)

---

### Pitfall 10: Subdomain Resolution Breaks in Vite Dev Environment

**What goes wrong:**
Production routing uses `renderspace.insighty.io` — the subdomain is parsed from `window.location.hostname`. In local dev, the hostname is `localhost` or `127.0.0.1` — no subdomain. The org resolution logic returns `undefined`, throws a "tenant not found" error, and the dev environment is unusable.

**Why it happens:**
`window.location.hostname.split('.')[0]` returns `'localhost'` not a valid org slug. Developers assume the same hostname parsing works in both environments because they haven't needed to test multi-org locally.

**How to avoid:**
1. Add explicit dev-mode fallback in the org resolver:
   ```ts
   function resolveOrgSlug(): string {
     const hostname = window.location.hostname
     if (hostname === 'localhost' || hostname === '127.0.0.1') {
       return import.meta.env.VITE_DEV_ORG_SLUG ?? 'renderspace'
     }
     return hostname.split('.')[0]
   }
   ```
2. Alternatively, configure local subdomains via `/etc/hosts`:
   ```
   127.0.0.1 renderspace.localhost
   ```
   And update `vite.config.ts` to allow the subdomain hostname (`server.host: true`).
3. Document the dev setup requirement in the repo CLAUDE.md.

Note: Vite's dev server proxy configuration (`server.proxy`) does NOT carry over to production — it is dev-only. Any routing that relies on Vite proxy for subdomain resolution will silently break in the production build. Subdomain resolution must happen in application code, not Vite config.

**Warning signs:**
- App throws on load in dev with "organization not found" or shows a blank screen
- A developer hard-codes `renderspace` as the org slug to unblock themselves (masks the underlying bug)

**Phase to address:** Phase 2 (RT-01)

---

### Pitfall 11: TypeScript Strict Mode — Optional organization_id Breaks Existing Non-Null Assumptions

**What goes wrong:**
The `Client`, `Project`, and other interfaces gain an `organization_id?: string` field. Existing code that passes these objects to functions, comparisons, or display components assumes all fields are present. TypeScript now flags errors like `Type 'string | undefined' is not assignable to type 'string'` in hundreds of call sites. The developer adds `!` non-null assertions throughout to silence errors quickly, suppressing the type system without fixing the underlying nullable concern.

**Why it happens:**
Adding `organization_id` as optional (`?`) is the path of least resistance because rows created before the migration may genuinely have `NULL` until backfill runs. But this propagates `| undefined` through every interface that contains the field, causing cascading type errors across the codebase.

**How to avoid:**
1. After migration and backfill are complete, make `organization_id` required (non-optional) in the type definitions.
2. During the migration transition window, use a union type: `organization_id: string | null` (not optional `?`). This forces explicit null checks at call sites and prevents the `!` shortcut.
3. Never use `organization_id?: string` — optional fields silently propagate `undefined` through the call chain. Always use explicit `| null` instead.
4. The type in `src/lib/types.ts` should be:
   ```ts
   organization_id: string  // non-nullable after migration
   ```
   with a migration step that ensures the database column is NOT NULL before the final type definition change.

**Warning signs:**
- `!` non-null assertions scattered across store and component files for `organization_id`
- TypeScript errors spike by 50+ after adding the field to interfaces
- Build errors after adding the column to `src/lib/types.ts`

**Phase to address:** Phase 1 and Phase 3 — define type as `string | null` in Phase 1, upgrade to required `string` after Phase 3 backfill

---

### Pitfall 12: RLS Policies on Views Missing security_invoker

**What goes wrong:**
Any Postgres VIEW created in the `public` schema runs by default as the view creator (`postgres` role), which bypasses RLS on the underlying tables. If the app queries a view instead of the base table directly — even indirectly through a Supabase RPC function — cross-tenant data is exposed because the view ignores `organization_id` policies.

**Why it happens:**
Postgres views default to `security_definer` semantics (run as creator). This is a non-obvious security footgun. The Supabase Dashboard also has a known bug where editing a view in the UI strips the `security_invoker` setting, silently downgrading its security.

**How to avoid:**
For all views that expose org-scoped data:
```sql
CREATE OR REPLACE VIEW my_view WITH (security_invoker = true) AS ...;
```
Audit every view in `public` schema. Run:
```sql
SELECT viewname, definition FROM pg_views WHERE schemaname = 'public';
```
Cross-reference against the tables that have RLS. Any view querying an RLS-protected table must have `security_invoker = true`. Avoid editing views in the Supabase Dashboard UI until the known stripping bug is resolved.

**Warning signs:**
- A view returns more rows than expected for an org-scoped user
- Supabase Security Advisor flags views as potential bypass paths

**Phase to address:** Phase 1 (final checklist item before enabling RLS)

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use JWT `user_metadata` for org_id | No hook needed | User can forge org access, complete data leak | Never |
| Hard-code `renderspace` as org slug in dev | Unblocks dev locally | Masks missing subdomain resolver, breaks onboarding new devs | Never in committed code |
| Skip RLS on "non-sensitive" tables | Faster migration | Cross-tenant leak on automations, settings, resource plans | Never |
| Use `organization_id?: string` optional type | Fewer type errors initially | `!` proliferates, real null bugs surface at runtime | Only during active migration window, remove before Phase 3 merge |
| Service_role key in admin impersonation | Simpler to implement | Bypasses all RLS; admin can read/write any tenant's data | Never — always use auth session scoped to org |
| Single giant UPDATE backfill | Simple migration script | Table lock timeout on larger tables, partial migration risk | Acceptable for current Renderspace data volume (< 10k rows/table) — verify counts first |
| Zustand stores not reset on org switch | Less code to write | Stale cross-org data, potential data contamination | Never in impersonation flow |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase Custom Access Token Hook | Calling `supabase.auth.admin.updateUserById` inside the hook for the same user currently signing in | Call user updates after the hook returns, or use a trigger/cron — circular update causes 422 timeout |
| Supabase RLS + Zustand stores | Forgetting to pass the user's session token in the Supabase client before store fetches | Ensure `supabase.auth.setSession()` is called and store fetch actions are called after session is established |
| Supabase RLS + Next.js / SSR (not this stack but worth noting) | Service role client shared across SSR requests leaks data across users | This app is SPA-only — keep single-user session client, never server-share |
| Vite + subdomain routing | Relying on `server.proxy` for org resolution in dev — this does not exist in production | Put org resolution logic in `window.location.hostname` parsing with dev fallback in app code |
| Zustand + React Router v7 | Navigating between routes does not clear store state — old org's data persists across navigation | Reset stores explicitly on org context change, not on route change |
| Supabase Auth + Custom Claims | Expecting updated `app_metadata` to be reflected immediately in the current session's JWT | The current access token is stale until it expires or is refreshed — force `supabase.auth.refreshSession()` after org assignment changes |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `auth.uid()` called per-row in RLS policy without SELECT wrapper | Slow queries on tables with thousands of rows, CPU spike on Postgres | Always write `(SELECT auth.uid())` in RLS expressions, not `auth.uid()` bare | Noticeable at ~1k rows, severe at 10k+ |
| Missing index on `organization_id` FK columns | Full table scans on every RLS-filtered query; queries get slower linearly with row count | Add `CREATE INDEX idx_{table}_org_id ON {table}(organization_id)` for every table | Breaks noticeably at a few thousand rows per table |
| Org membership resolved via subquery in every RLS policy | Multiplied query cost when policies join `organization_members` on every row | Cache membership in JWT claims (app_metadata) OR ensure `organization_members` has index on `(user_id, organization_id)` | At 5+ concurrent users with active queries |
| Admin impersonation loads all orgs' data into memory | Admin console page loads slowly; memory bloat in browser | Paginate org list; load org detail lazily on selection | At 50+ organizations |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `service_role` key used for impersonation to "simplify" access | Complete RLS bypass — admin can read and write all tenants' data without any policy enforcement | Impersonation must use a scoped authenticated session, never service_role |
| No audit log for impersonated actions | Impossible to determine if admin caused data corruption during support session | Write every mutation during impersonation to `admin_actions` table with impersonator identity |
| Impersonation session has no expiry | Admin leaves a browser tab open indefinitely with write access to a client's data | Add TTL to impersonation context; force exit after 30 minutes of inactivity |
| `org_id` injected into Zustand from URL parameter directly | Attacker crafts URL with a different org's UUID; if store skips server validation, cross-org access | Always resolve `org_id` from the authenticated subdomain lookup at boot, never from URL query params or route params |
| RLS policies written but never cross-tenant tested | Policies are syntactically correct but logically wrong; developer never proves Org B cannot see Org A's data | Run explicit negative tests: authenticate as Org B user, confirm Org A's rows are not returned |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visual distinction between impersonation and normal admin session | Admin makes accidental changes in client data, doesn't notice until client complains | Persistent amber banner with org name + "Impersonation Active" that cannot be dismissed |
| App shows loading spinner indefinitely when org slug is not found from subdomain | New/invalid subdomain shows blank app with no explanation | Show a "Workspace not found" error page with link to contact Nino |
| Session expired mid-session with no feedback | User gets silent empty responses from all Supabase queries (RLS denies expired JWTs) | Listen to Supabase `onAuthStateChange` for `SIGNED_OUT` / `TOKEN_REFRESHED` events; redirect to login on expiry |
| Org context not displayed anywhere in the UI | Multi-tenant users can't confirm which org they're currently in | Show org name in sidebar or top nav for all sessions |

---

## "Looks Done But Isn't" Checklist

- [ ] **RLS migration:** Every table in `public` schema has RLS enabled — verify with `pg_tables` query, not just the tables you explicitly migrated
- [ ] **Policy coverage:** Every RLS-enabled table has SELECT + INSERT + UPDATE + DELETE policies — a table with only a SELECT policy will silently swallow writes
- [ ] **Views audit:** Every view that reads org-scoped tables has `security_invoker = true` — check all views, not just ones you added this milestone
- [ ] **Backfill completeness:** After running MIG-01, verify zero rows have `organization_id IS NULL` across all tables — `SELECT count(*) FROM clients WHERE organization_id IS NULL` for every table
- [ ] **JWT claims source:** All RLS policies that reference JWT use `app_metadata`, not `user_metadata` — grep policies for `user_metadata`
- [ ] **Stores reset on org switch:** Entering and exiting impersonation both flush all Zustand stores — verify by checking store state before and after switch
- [ ] **Impersonation banner:** Banner is visible and styled distinctly during impersonation — test visually, not just in code
- [ ] **Dev subdomain fallback:** App boots correctly on `localhost` without any hard-coded org slug in source — test with `VITE_DEV_ORG_SLUG` env var unset
- [ ] **TypeScript clean build:** `npx tsc --noEmit` passes after all type changes — run before marking any phase complete
- [ ] **Cross-tenant negative tests:** Log in as a user from Org B and confirm zero rows from Org A are returned for every table — this is the only test that proves isolation actually works

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Cross-tenant data leak discovered in production | HIGH | Immediately enable additional network-level ACL or take app offline; audit which rows were accessed via Supabase logs; notify affected tenants; fix policies and redeploy; retrospective |
| Backfill migration left rows with NULL organization_id | MEDIUM | Run targeted backfill for missed rows: `UPDATE {table} SET organization_id = 'renderspace-uuid' WHERE organization_id IS NULL`; verify counts; re-run RLS test suite |
| Zustand stale state caused cross-org data write | MEDIUM | Identify affected records in database; reverse the write manually as postgres role; add the resetAllStores() fix; add regression test |
| JWT claims stale after org change (user sees wrong org data) | LOW | Ask user to sign out and sign back in; if urgent, use Supabase admin API to invalidate session; long-term: switch to DB-resolved membership in RLS |
| TypeScript build broken by organization_id type change | LOW | Temporarily use `organization_id: string \| null` across all interfaces; fix non-null assertion sites before marking phase done |
| Views bypassing RLS found after deployment | HIGH | Immediately recreate views with `security_invoker = true`; audit if any cross-tenant data was exposed via view queries in logs |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Missing table RLS coverage | Phase 1 | Run `pg_tables` coverage query + Security Advisor before phase sign-off |
| user_metadata in JWT used for org_id | Phase 1 | Grep all RLS policies for `user_metadata`; test user forging their own metadata |
| SQL editor bypasses RLS (testing gap) | Phase 1 | All policy tests run as impersonated authenticated role, not postgres |
| UPDATE policy without SELECT policy | Phase 1 | Run save operations as impersonated user and assert affected row count > 0 |
| Stale JWT claims after org change | Phase 1 + Phase 4 | Force token refresh test after app_metadata update; impersonation regression test |
| Backfill migration table lock | Phase 3 | Run migration in staging with production-equivalent data volume; verify no NULL rows after |
| FK constraint order in migration | Phase 3 | Single ordered migration file; CI dry-run on clean schema |
| Views missing security_invoker | Phase 1 | Audit all views in public schema; include in migration checklist |
| Zustand stale state on org switch | Phase 4 | After impersonation entry/exit: assert all stores are empty before first fetch |
| Admin impersonation accidental mutation | Phase 4 | E2E test: enter impersonation, attempt form save, verify write is blocked or attributed correctly |
| Subdomain resolution breaks in dev | Phase 2 | Test app boot on localhost without VITE_DEV_ORG_SLUG; verify graceful fallback |
| TypeScript optional organization_id | Phase 1 + Phase 3 | `npx tsc --noEmit` passes after each phase; no `!` assertions on organization_id |

---

## Sources

- Supabase RLS Best Practices (MakerKit): https://makerkit.dev/blog/tutorials/supabase-rls-best-practices
- Supabase Custom Claims & RBAC (official docs): https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac
- Supabase Custom Access Token Hook (official docs): https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
- Supabase RLS documentation: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase User Sessions documentation: https://supabase.com/docs/guides/auth/sessions
- Edge Functions & JWT Hook timeout discussion: https://www.answeroverflow.com/m/1328426552064475187
- Safe User Impersonation (Pigment Engineering, April 2026): https://engineering.pigment.com/2026/04/08/safe-user-impersonation/
- Zustand reset state guide: https://zustand.docs.pmnd.rs/guides/how-to-reset-state
- Zustand clear state on sign out discussion: https://github.com/pmndrs/zustand/discussions/574
- Postgres views security gotcha (DEV Community): https://dev.to/datadeer/postgres-views-the-hidden-security-gotcha-in-supabase-ckd
- Supabase Security Flaw / Missing RLS (CVE-2025-48757): https://byteiota.com/supabase-security-flaw-170-apps-exposed-by-missing-rls/
- RLS LockIn multi-tenant architecture: https://dev.to/blackie360/-enforcing-row-level-security-in-supabase-a-deep-dive-into-lockins-multi-tenant-architecture-4hd2
- Vite server options (subdomain support): https://vite.dev/config/server-options
- PostgreSQL ALTER TABLE and table locks: https://dev.to/mickelsamuel/which-alter-table-operations-lock-your-postgresql-table-1082

---

*Pitfalls research for: Supabase RLS brownfield SaaS conversion — Agency Intelligence OS v2.0*
*Researched: 2026-04-24*
