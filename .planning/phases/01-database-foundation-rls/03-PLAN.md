---
phase: 01-database-foundation-rls
plan: 03
type: execute
wave: 3
depends_on: ["01-database-foundation-rls-01", "01-database-foundation-rls-02"]
files_modified:
  - supabase/migrations/20260424000003_rls_policies.sql
  - supabase/functions/custom-access-token-hook/index.ts
  - supabase/functions/custom-access-token-hook/deno.json
autonomous: false
requirements: [MT-03, AUTH-02]

user_setup:
  - service: supabase-dashboard
    why: "Custom Access Token Hook must be registered in Supabase Auth > Hooks to fire on login. SQL + edge function deployment alone do NOT activate the hook — it requires a dashboard toggle."
    dashboard_config:
      - task: "Register Custom Access Token Hook"
        location: "Supabase Dashboard > Authentication > Hooks > Custom Access Token"
        steps:
          - "Select 'Postgres' hook type"
          - "Set function to `public.custom_access_token_hook`"
          - "Enable the hook"
          - "Save configuration"

must_haves:
  truths:
    - "Every tenant-scoped table in public schema has RLS enabled (rowsecurity = true)"
    - "A SQL helper function auth.organization_id() exists and returns the uuid from JWT app_metadata.organization_id, or NULL"
    - "A Postgres function public.custom_access_token_hook(event jsonb) exists and is granted to supabase_auth_admin"
    - "The hook function queries organization_members by user_id and embeds organization_id into app_metadata claims"
    - "The Supabase edge function at supabase/functions/custom-access-token-hook/index.ts exists as a deployment artifact (Supabase supports both pg-function and edge-function hooks — we deploy both for redundancy, edge used as fallback)"
    - "NO SELECT/INSERT/UPDATE/DELETE policies are created in this migration — they are deferred to Phase 3 after backfill (prevents locking out existing Renderspace data)"
    - "The migration contains a clear comment noting that RLS is ENABLED but NO POLICIES are written, so authenticated users see ZERO rows until Phase 3 completes — this is intentional"
  artifacts:
    - path: "supabase/migrations/20260424000003_rls_policies.sql"
      provides: "auth.organization_id() helper + custom_access_token_hook() function + RLS enabled on every tenant-scoped table"
      contains: "create or replace function auth.organization_id()"
      contains: "create or replace function public.custom_access_token_hook"
      contains: "alter table public.clients enable row level security"
    - path: "supabase/functions/custom-access-token-hook/index.ts"
      provides: "Edge function fallback hook implementation (Deno)"
      contains: "Deno.serve"
    - path: "supabase/functions/custom-access-token-hook/deno.json"
      provides: "Deno config for the edge function"
  key_links:
    - from: "public.custom_access_token_hook"
      to: "public.organization_members"
      via: "SELECT organization_id WHERE user_id = event->>'user_id'"
      pattern: "from public\\.organization_members"
    - from: "auth.organization_id()"
      to: "auth.jwt()"
      via: "JWT -> 'app_metadata' ->> 'organization_id'"
      pattern: "app_metadata.*organization_id"
    - from: "Supabase Auth"
      to: "public.custom_access_token_hook"
      via: "Registered in Dashboard > Auth > Hooks (human-action checkpoint)"
      pattern: "(manual registration in Supabase Dashboard)"
---

<objective>
Deliver the three pieces required for the JWT-claim RLS pattern to go LIVE in Phase 3:

1. SQL helper `auth.organization_id()` — extracts the org_id claim from the JWT (used by Phase 3 RLS policies).
2. SQL function `public.custom_access_token_hook(event jsonb)` — runs on every token issue, queries `organization_members`, writes `organization_id` into `app_metadata`.
3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on every tenant-scoped table — but WITHOUT writing SELECT/INSERT/UPDATE/DELETE policies yet. The policies are deferred to Phase 3 because enabling them before backfill instantly locks out Renderspace's existing data.

Plus an optional Edge Function fallback (Deno) at `supabase/functions/custom-access-token-hook/index.ts` — identical semantics, deployed alongside the pg-function so the dashboard can swap between them.

Plus a checkpoint step requiring the human (Nino) to register the hook in the Supabase Dashboard because no API exists to do so (confirmed in STACK.md + ARCHITECTURE.md).

Purpose: This is the final pre-migration step. After this plan, Phase 2 can wire the frontend (OrgProvider), and Phase 3 can backfill + enable policies — at which point isolation is LIVE.

Output:
  - `supabase/migrations/20260424000003_rls_policies.sql`
  - `supabase/functions/custom-access-token-hook/index.ts`
  - `supabase/functions/custom-access-token-hook/deno.json`
  - One checkpoint directing the user to register the hook in the Supabase Dashboard.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/research/ARCHITECTURE.md
@.planning/research/STACK.md
@.planning/research/PITFALLS.md
@.planning/phases/01-database-foundation-rls/01-PLAN.md
@.planning/phases/01-database-foundation-rls/02-PLAN.md

<interfaces>
<!-- Hook function payload and claim nesting — HIGH confidence, from Supabase official docs -->
<!-- (ARCHITECTURE.md lines 104-139 + STACK.md lines 45-85) -->

Custom Access Token Hook payload signature:
  -- Input:  event jsonb with keys: user_id (text uuid), claims (jsonb)
  -- Output: jsonb with the mutated event.claims (same structure, updated app_metadata)
  -- Registration: Supabase Dashboard > Auth > Hooks, or config.toml + CLI

JWT claim path for org_id (AUTHORITATIVE — deviations break RLS silently):
  - claims -> 'app_metadata' -> 'organization_id'  ← correct (server-controlled)
  - claims -> 'user_metadata' -> 'organization_id' ← FORBIDDEN (user-writable, see PITFALLS.md Pitfall 2)

From supabase/functions/telegram-link/index.ts (edge function style reference):
```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  const cors = { 'Access-Control-Allow-Origin': '*', ... }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  // ... handler logic
})
```

From .planning/phases/01-database-foundation-rls/02-PLAN.md must_haves.artifacts.path:
  Every tenant-scoped table has an `organization_id` column by the time this plan runs.
  The list of tables is finalized at the top of `supabase/migrations/20260424000002_add_organization_id.sql` in its INCLUDED comment block — THIS PLAN MUST USE THE SAME LIST.

From .planning/phases/01-database-foundation-rls/01-PLAN.md:
  - `organizations` table: columns id (uuid), slug, name, plan, status, created_at
  - `organization_members` table: columns id, organization_id, user_id, role, created_at
  - `organization_members` indexed on user_id — the hot path for this plan's hook
</interfaces>

<pitfalls_reference>
From PITFALLS.md Pitfall 1 (missing RLS coverage): This plan must ENABLE RLS on every tenant-scoped table. Use the same table list as 01-02 to guarantee parity. After applying, run the `pg_tables WHERE rowsecurity = true` coverage query.

From PITFALLS.md Pitfall 2 (user_metadata in JWT): The hook MUST write to `app_metadata`, not `user_metadata`. The helper MUST read from `app_metadata`. Grep the migration for `user_metadata` — it must return 0 matches.

From PITFALLS.md Pitfall 3 (SQL editor bypasses RLS): The verification step in this plan CANNOT use the Supabase SQL editor. The human-verify checkpoint must use a real client session.

From PITFALLS.md Pitfall 5 (UPDATE without SELECT policy): This plan writes NO policies — the concern belongs to Phase 3. But a comment in the migration must explicitly state "no policies yet" so Phase 3 knows to write SELECT+INSERT+UPDATE+DELETE as a complete set.

From PITFALLS.md Pitfall 12 (views missing security_invoker): Not currently applicable — no views are added in this phase. But leave a comment noting that any future view reading tenant-scoped tables must use `WITH (security_invoker = true)`.

From STATE.md decision: "RLS is deployed in Phase 1 but NOT enabled until Phase 3 backfill is complete" — reconciling:
  - We DO call `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in this plan (Phase 1).
  - Enabling RLS WITHOUT any policies means authenticated users see ZERO rows (default-deny).
  - This is SAFE for Renderspace's current user because the app is offline during the SaaS cutover.
  - If the app must stay online during Phase 1, ADD a temporary full-access policy for authenticated users on each table, and drop those policies in Phase 3 when the real policies are added.
  - Ask the user during the checkpoint which path they want.
</pitfalls_reference>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write the RLS + hook SQL migration</name>
  <files>supabase/migrations/20260424000003_rls_policies.sql</files>
  <read_first>
    - CLAUDE.md (naming convention `organization_id`)
    - .planning/research/ARCHITECTURE.md (Pattern 1 — exact hook SQL template + helper function pattern)
    - .planning/research/STACK.md (sections 1 + 2: Custom Access Token Hook SQL, helper function, perf note on `(select ...)` wrapper)
    - .planning/research/PITFALLS.md (Pitfalls 1, 2, 3, 5, 12)
    - supabase/migrations/20260424000002_add_organization_id.sql — specifically the INCLUDED comment block at the top (the authoritative list of tenant-scoped tables)
    - supabase/migrations/20260404000001_user_permissions.sql (security definer function style reference)
  </read_first>
  <action>
Create `supabase/migrations/20260424000003_rls_policies.sql` with exactly three sections. Do not deviate from the signatures.

```sql
-- ============================================================
--  Phase 1-03 — RLS foundation + Custom Access Token Hook
--  Requirements: MT-03, AUTH-02
--
--  This migration delivers 3 pieces:
--    1. auth.organization_id() — helper, reads JWT app_metadata
--    2. public.custom_access_token_hook(event) — populates JWT
--    3. ALTER TABLE ... ENABLE ROW LEVEL SECURITY on every
--       tenant-scoped table (the SAME list as migration
--       20260424000002_add_organization_id.sql)
--
--  INTENTIONAL DESIGN: No SELECT/INSERT/UPDATE/DELETE policies
--  are created here. They are deferred to Phase 3 after
--  backfill (MIG-01). Until Phase 3 runs, authenticated users
--  see ZERO rows on every tenant-scoped table — this is
--  expected because the app is offline during the cutover.
--
--  ACTIVATION: Deploying this migration does NOT make the hook
--  fire. The hook must be registered manually in
--  Supabase Dashboard > Authentication > Hooks. See Task 3.
-- ============================================================

-- ─── 1. Helper: auth.organization_id() ────────────────────────
-- Called by future RLS policies. Wrapped in (select ...) at
-- call-site so Postgres caches the result per-statement (99%+
-- perf improvement — see STACK.md "Why (select auth.organization_id())").

create or replace function auth.organization_id()
returns uuid
language sql
stable
as $$
  select nullif(
    (current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata'
      ->> 'organization_id'),
    ''
  )::uuid
$$;

comment on function auth.organization_id() is
  'Extracts organization_id uuid from JWT app_metadata. Returns NULL if not set. Used by Phase 3 RLS policies.';

-- ─── 2. Custom Access Token Hook ──────────────────────────────
-- Runs on every token issuance (login + hourly refresh).
-- Queries organization_members for the user and embeds
-- organization_id into app_metadata. NEVER writes to
-- user_metadata (PITFALLS.md Pitfall 2).

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims          jsonb;
  v_organization  uuid;
begin
  -- Look up user's organization (first membership wins —
  -- multi-org support is a future milestone)
  select om.organization_id
    into v_organization
    from public.organization_members om
   where om.user_id = (event ->> 'user_id')::uuid
   limit 1;

  claims := event -> 'claims';

  -- Ensure app_metadata exists as an object
  if jsonb_typeof(claims -> 'app_metadata') is null
     or jsonb_typeof(claims -> 'app_metadata') <> 'object' then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;

  -- Embed organization_id (or remove it if user has no membership)
  if v_organization is not null then
    claims := jsonb_set(
      claims,
      '{app_metadata,organization_id}',
      to_jsonb(v_organization)
    );
  else
    claims := claims #- '{app_metadata,organization_id}';
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Supabase Custom Access Token Hook. Registered in Dashboard > Auth > Hooks. Embeds organization_id into JWT app_metadata at every token issue.';

-- Grant hook execution to Supabase Auth (required by Supabase)
grant execute
  on function public.custom_access_token_hook
  to supabase_auth_admin;

-- Revoke from everyone else (defensive; the function reads
-- organization_members and we don't want arbitrary access)
revoke execute
  on function public.custom_access_token_hook
  from authenticated, anon, public;

-- Allow the hook to read organization_members even when RLS
-- is enabled on that table. supabase_auth_admin is a built-in
-- Supabase role; it bypasses RLS by default, but we grant
-- SELECT explicitly for clarity.
grant usage on schema public to supabase_auth_admin;
grant select on public.organization_members to supabase_auth_admin;

-- ─── 3. Enable RLS on every tenant-scoped table ───────────────
-- SAME LIST as 20260424000002_add_organization_id.sql.
-- After this runs, default-deny is in effect: authenticated
-- users see ZERO rows on these tables. Phase 3 writes policies
-- that restore access scoped to organization_id.
--
-- ALSO enable RLS on organizations + organization_members so
-- the admin console later has a clean baseline.

alter table public.organizations         enable row level security;
alter table public.organization_members  enable row level security;

-- Tenant-scoped tables (MUST match the INCLUDED list in
-- 20260424000002_add_organization_id.sql — copy that list here):
-- {executor: paste the exact list from the 02 migration header}
alter table public.clients                enable row level security;
alter table public.projects               enable row level security;
-- ... repeat for every INCLUDED table from 02 migration ...

-- NOTE: We are intentionally NOT creating any policies here.
-- Phase 3 MIG-01 backfill must complete first. See STATE.md
-- decision and PITFALLS.md Pitfall 1.

-- NOTE: Any future VIEW reading these tables MUST use
-- CREATE VIEW ... WITH (security_invoker = true) — see
-- PITFALLS.md Pitfall 12.
```

Rules:
1. Use the EXACT table list from `supabase/migrations/20260424000002_add_organization_id.sql` (same INCLUDED set). Add RLS enable for each, plus `organizations` + `organization_members`.
2. The helper function is in the `auth` schema to match Supabase convention (`auth.uid()`, `auth.email()` etc.). Postgres requires you have permission to create functions in `auth` — this is granted to `postgres` role by default in Supabase.
3. The hook function is in `public` because that's the only schema Supabase auth-admin can reach by grant.
4. `revoke execute from authenticated, anon, public` prevents a client-side caller from invoking the hook directly and probing other users' memberships.
5. `stable` (not `volatile`) — both functions are read-only against the DB.
6. **Do NOT write any `CREATE POLICY ... FOR SELECT` statements.** They belong to Phase 3.
7. **Do NOT write any `CREATE POLICY ... FOR ALL` statements** either — default-deny is the correct posture for now.
8. **Do NOT INSERT/UPDATE data.** Backfill is Phase 3.
9. Grep yourself before saving: `grep -c user_metadata {file}` must be 0.

If the user prefers to keep the app online during Phase 1 (ask during Task 3 checkpoint), add a temporary fallback AFTER enabling RLS — a single policy per table that allows the current Renderspace user full access by matching their `auth.uid()` to an existing `app_users.id`. Drop those policies in Phase 3 before adding the real ones. Default to default-deny (no fallback policies) if the user does not request otherwise.
  </action>
  <verify>
    <automated>HELPER=$(grep -c "create or replace function auth\.organization_id" supabase/migrations/20260424000003_rls_policies.sql); HOOK=$(grep -c "create or replace function public\.custom_access_token_hook" supabase/migrations/20260424000003_rls_policies.sql); RLS=$(grep -c "enable row level security" supabase/migrations/20260424000003_rls_policies.sql); UMETA=$(grep -c "user_metadata" supabase/migrations/20260424000003_rls_policies.sql); POL=$(grep -ci "^create policy" supabase/migrations/20260424000003_rls_policies.sql); GRANT=$(grep -c "grant execute.*custom_access_token_hook.*to supabase_auth_admin" supabase/migrations/20260424000003_rls_policies.sql); ORGID_WRONG=$(grep -c "\borg_id\b" supabase/migrations/20260424000003_rls_policies.sql); if [ "$HELPER" -ge 1 ] &amp;&amp; [ "$HOOK" -ge 1 ] &amp;&amp; [ "$RLS" -ge 15 ] &amp;&amp; [ "$UMETA" -eq 0 ] &amp;&amp; [ "$POL" -eq 0 ] &amp;&amp; [ "$GRANT" -ge 1 ] &amp;&amp; [ "$ORGID_WRONG" -eq 0 ]; then echo "OK"; else echo "FAIL helper=$HELPER hook=$HOOK rls=$RLS user_metadata=$UMETA policies=$POL grant=$GRANT org_id=$ORGID_WRONG"; fi</automated>
  </verify>
  <acceptance_criteria>
    - `test -f supabase/migrations/20260424000003_rls_policies.sql`
    - `grep -c "create or replace function auth\.organization_id" supabase/migrations/20260424000003_rls_policies.sql` >= 1
    - `grep -c "create or replace function public\.custom_access_token_hook" supabase/migrations/20260424000003_rls_policies.sql` >= 1
    - `grep -c "grant execute.*custom_access_token_hook.*to supabase_auth_admin" supabase/migrations/20260424000003_rls_policies.sql` >= 1
    - `grep -c "revoke execute.*custom_access_token_hook.*from authenticated" supabase/migrations/20260424000003_rls_policies.sql` >= 1
    - `grep -c "enable row level security" supabase/migrations/20260424000003_rls_policies.sql` >= 15 (matches the table count from 01-02 + 2 for organizations/organization_members)
    - `grep -c "alter table public\.organizations *enable row level security" supabase/migrations/20260424000003_rls_policies.sql` == 1
    - `grep -c "alter table public\.organization_members *enable row level security" supabase/migrations/20260424000003_rls_policies.sql` == 1
    - `grep -c "user_metadata" supabase/migrations/20260424000003_rls_policies.sql` == 0 (PITFALLS Pitfall 2)
    - `grep -c "app_metadata" supabase/migrations/20260424000003_rls_policies.sql` >= 2 (hook + helper both reference it)
    - `grep -ci "^create policy\|^alter policy" supabase/migrations/20260424000003_rls_policies.sql` == 0 (policies are Phase 3)
    - `grep -ci "^insert into\|^update " supabase/migrations/20260424000003_rls_policies.sql` == 0 (no data mutation)
    - `grep -c "\borg_id\b" supabase/migrations/20260424000003_rls_policies.sql` == 0 (naming convention)
    - `grep -c "from public\.organization_members" supabase/migrations/20260424000003_rls_policies.sql` >= 1 (hook queries this table)
    - `grep -c "security_invoker" supabase/migrations/20260424000003_rls_policies.sql` >= 1 (comment warning about future views — PITFALLS Pitfall 12)
    - Every table listed in `supabase/migrations/20260424000002_add_organization_id.sql` INCLUDED block has a matching `enable row level security` line in this file (parity check — executor to list verification in SUMMARY)
  </acceptance_criteria>
  <done>
The SQL migration exists at the exact path, contains all three sections (helper, hook, RLS enable), references `app_metadata` (never `user_metadata`), writes zero policies, and mutates zero data. The function grants are correct for supabase_auth_admin. A comment block explicitly notes that policies are deferred to Phase 3.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Edge Function fallback of the hook (Deno)</name>
  <files>supabase/functions/custom-access-token-hook/index.ts, supabase/functions/custom-access-token-hook/deno.json</files>
  <read_first>
    - supabase/functions/telegram-link/index.ts (style reference: CORS, Deno.serve, esm.sh imports, env var pattern)
    - supabase/functions/_shared/ (look for shared CORS / auth helpers to reuse)
    - .planning/research/ARCHITECTURE.md (Pattern 1 — hook semantics must match the SQL version EXACTLY)
    - .planning/research/STACK.md section 1 (JWT payload structure)
    - The SQL hook from Task 1 (`supabase/migrations/20260424000003_rls_policies.sql`) — the Deno edge function must have identical semantics: input `event.user_id`, output `event.claims.app_metadata.organization_id`
  </read_first>
  <action>
Supabase supports TWO kinds of hook endpoints: `pg-functions://...` (the SQL function from Task 1) and `https://...` (an Edge Function). Having both deployed lets the user switch in the Dashboard without a code change. Task 1's SQL is the primary; this Edge Function is the fallback.

**Create `supabase/functions/custom-access-token-hook/index.ts`:**

```typescript
// Supabase Custom Access Token Hook — Edge Function fallback
// Registered in Supabase Dashboard > Authentication > Hooks
// as type "HTTPS" with this function's public URL.
//
// Semantics MUST match the SQL version in
// supabase/migrations/20260424000003_rls_policies.sql —
// look up organization_members by user_id, write
// organization_id into claims.app_metadata.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Supabase sends a webhook signature; verify it in production.
// For Phase 1 we accept the request if it matches a shared
// secret from Dashboard > Auth > Hooks (set as env var).
const HOOK_SECRET = Deno.env.get('AUTH_HOOK_SECRET') ?? ''

interface HookPayload {
  user_id: string
  claims: {
    app_metadata?: Record<string, unknown>
    user_metadata?: Record<string, unknown>
    [key: string]: unknown
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Supabase Auth sends a signature header — verify when HOOK_SECRET is set.
  if (HOOK_SECRET) {
    const provided = req.headers.get('webhook-signature') ?? ''
    if (provided !== HOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const payload = (await req.json()) as HookPayload
  const userId = payload.user_id
  if (!userId) {
    return new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Service-role client — bypasses RLS, needed to read
  // organization_members regardless of policy state.
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  // Initialize app_metadata if missing
  const appMeta = { ...(payload.claims.app_metadata ?? {}) } as Record<string, unknown>

  if (!error && data?.organization_id) {
    appMeta.organization_id = data.organization_id
  } else {
    // User has no membership — remove any stale org_id claim.
    delete appMeta.organization_id
  }

  const mutated: HookPayload = {
    ...payload,
    claims: {
      ...payload.claims,
      app_metadata: appMeta,
    },
  }

  return new Response(JSON.stringify(mutated), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

**Create `supabase/functions/custom-access-token-hook/deno.json`:**

```json
{
  "tasks": {
    "serve": "deno run --allow-net --allow-env index.ts"
  }
}
```

Rules:
1. NEVER read from `user_metadata` and NEVER write to `user_metadata` (PITFALLS Pitfall 2).
2. Use `SUPABASE_SERVICE_ROLE_KEY` — the hook MUST bypass RLS to read organization_members reliably before the user's session is fully valid.
3. Match existing edge function style from `supabase/functions/telegram-link/index.ts` (esm.sh imports, Deno.serve, env vars via `Deno.env.get`).
4. Type all imports strictly — the project uses TypeScript strict.
5. DO NOT add unused variables or imports — CLAUDE.md states TS6133 (unused) breaks the build.
6. Do NOT call `supabase.auth.admin.*` methods on the same user — creates a circular update (see PITFALLS "Integration Gotchas" table, line about hook 422 timeout).
  </action>
  <verify>
    <automated>F1=$(test -f supabase/functions/custom-access-token-hook/index.ts &amp;&amp; echo 1 || echo 0); F2=$(test -f supabase/functions/custom-access-token-hook/deno.json &amp;&amp; echo 1 || echo 0); DS=$(grep -c "Deno.serve" supabase/functions/custom-access-token-hook/index.ts 2>/dev/null); APP=$(grep -c "app_metadata" supabase/functions/custom-access-token-hook/index.ts 2>/dev/null); USERMETA_READ=$(grep -cE "claims\.user_metadata|user_metadata\]" supabase/functions/custom-access-token-hook/index.ts 2>/dev/null); ORGTBL=$(grep -c "organization_members" supabase/functions/custom-access-token-hook/index.ts 2>/dev/null); if [ "$F1" = "1" ] &amp;&amp; [ "$F2" = "1" ] &amp;&amp; [ "$DS" -ge 1 ] &amp;&amp; [ "$APP" -ge 2 ] &amp;&amp; [ "$USERMETA_READ" -eq 0 ] &amp;&amp; [ "$ORGTBL" -ge 1 ]; then echo "OK"; else echo "FAIL index=$F1 deno=$F2 serve=$DS appmeta=$APP user_meta_read=$USERMETA_READ org_table=$ORGTBL"; fi</automated>
  </verify>
  <acceptance_criteria>
    - `test -f supabase/functions/custom-access-token-hook/index.ts`
    - `test -f supabase/functions/custom-access-token-hook/deno.json`
    - `grep -c "Deno.serve" supabase/functions/custom-access-token-hook/index.ts` >= 1
    - `grep -c "organization_members" supabase/functions/custom-access-token-hook/index.ts` >= 1 (queries the right table)
    - `grep -c "app_metadata" supabase/functions/custom-access-token-hook/index.ts` >= 2 (read + write)
    - `grep -cE "claims\.user_metadata|user_metadata\]" supabase/functions/custom-access-token-hook/index.ts` == 0 (never reads/writes user_metadata)
    - `grep -c "SUPABASE_SERVICE_ROLE_KEY" supabase/functions/custom-access-token-hook/index.ts` >= 1 (service-role client)
    - `grep -c "persistSession: false" supabase/functions/custom-access-token-hook/index.ts` >= 1 (stateless hook)
    - The file does not declare any unused imports or variables (TypeScript strict — CLAUDE.md TS6133)
    - `deno.json` exists and is valid JSON (`node -e "JSON.parse(require('fs').readFileSync('supabase/functions/custom-access-token-hook/deno.json','utf8'))"` exits 0)
  </acceptance_criteria>
  <done>
Edge function file and deno.json exist. Semantics match the SQL hook exactly (read user_id, look up membership, write organization_id into app_metadata, never touch user_metadata). Unused-var/import clean so `npx tsc --noEmit` would not break if the file is included in the project tsconfig.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 3: Register the Custom Access Token Hook in Supabase Dashboard</name>
  <what-built>
  - Phase 1-03 SQL migration: `supabase/migrations/20260424000003_rls_policies.sql`
  - Edge function: `supabase/functions/custom-access-token-hook/index.ts`
  - SQL hook `public.custom_access_token_hook` granted to `supabase_auth_admin`
  - RLS ENABLED on every tenant-scoped table, with NO policies yet
  </what-built>
  <read_first>
    - .planning/phases/01-database-foundation-rls/03-PLAN.md (user_setup block in frontmatter)
    - .planning/research/STACK.md section "New Supabase Features to Enable"
    - Supabase docs: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
  </read_first>
  <how-to-verify>
  This task requires human action in the Supabase Dashboard — there is no CLI or API for hook registration as of April 2026.

  **Step 1 — Apply the migrations (Claude CAN do this if supabase CLI is configured):**
  ```bash
  supabase db push
  ```
  Confirm in Dashboard > Database > Tables that `organizations`, `organization_members` exist and that `rowsecurity = true` on all tenant-scoped tables.

  **Step 2 — Deploy the edge function (Claude CAN do this):**
  ```bash
  supabase functions deploy custom-access-token-hook
  ```

  **Step 3 — HUMAN ACTION: Register the hook in the Dashboard:**
  1. Navigate to Supabase Dashboard > Authentication > Hooks (Beta)
  2. Click "Custom Access Token" -> "Add Hook"
  3. Choose **Postgres** hook type (primary)
  4. Function schema: `public`
  5. Function name: `custom_access_token_hook`
  6. Click Enable
  7. Save

  **Step 4 — HUMAN DECISION: Does the app need to stay online during Phase 1?**
  - If NO (cutover window acceptable): leave default-deny in place. RLS is enabled with no policies, authenticated users see zero rows until Phase 3. This is SAFE.
  - If YES (app must remain usable): ask Claude to append a temporary full-access policy set to `20260424000003_rls_policies.sql` for Renderspace's existing user, to be dropped in Phase 3.

  **Step 5 — HUMAN VERIFICATION (cannot use SQL editor — PITFALLS Pitfall 3):**
  - Sign in to the app as Nino (real client session)
  - Inspect the JWT via Supabase client: `(await supabase.auth.getSession()).data.session?.access_token` — decode at jwt.io
  - Confirm `app_metadata.organization_id` claim is PRESENT in the decoded JWT (will be null/undefined because no organization_members rows exist yet — that's expected; Phase 3 creates the Renderspace org and the first membership row)
  - Confirm NO `user_metadata.organization_id` claim exists

  **Step 6 — Report back:**
  Tell Claude:
  - "Hook registered and enabled" (to continue)
  - "Hook failed to register — error: {paste}" (to debug)
  - "Keep app online" / "Cutover acceptable" (so plan 03-01 can be tuned)
  </how-to-verify>
  <acceptance_criteria>
    - User has confirmed hook is registered in Supabase Dashboard
    - User has decided on cutover strategy (default-deny vs temporary full-access policy)
    - Decoded JWT from a real session contains `app_metadata` key (organization_id may be null until Phase 3 backfill, but the claim path must be reachable)
    - No `user_metadata.organization_id` appears in decoded JWT
  </acceptance_criteria>
  <resume-signal>Type "approved" to continue, or "blocked: {reason}" if registration failed. Also state "cutover-ok" or "stay-online" for the RLS strategy decision.</resume-signal>
</task>

</tasks>

<verification>
After all three tasks complete:

1. **File existence:**
   - `test -f supabase/migrations/20260424000003_rls_policies.sql`
   - `test -f supabase/functions/custom-access-token-hook/index.ts`
   - `test -f supabase/functions/custom-access-token-hook/deno.json`

2. **Schema coverage (after applying migration, run in Supabase SQL editor — note that this particular query runs as postgres so it's valid here — it's NOT testing policy behavior, just metadata):**
   ```sql
   SELECT tablename, rowsecurity
   FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename NOT IN ('app_users', 'telegram_auth')
   ORDER BY tablename;
   -- Every row must have rowsecurity = true
   ```

3. **Hook function presence:**
   ```sql
   SELECT proname, provolatile FROM pg_proc WHERE proname = 'custom_access_token_hook';
   -- Must return one row, provolatile = 's' (stable)
   ```

4. **Helper function presence:**
   ```sql
   SELECT auth.organization_id();
   -- Returns NULL when not in a JWT context — this is fine
   ```

5. **Policy count must be zero (Phase 1 deliberate state):**
   ```sql
   SELECT tablename, count(*)
   FROM pg_policies
   WHERE schemaname = 'public'
   GROUP BY tablename;
   -- Expected: empty result set (unless user opted for stay-online mode)
   ```

6. **Human verification (Task 3):** User has registered the hook and confirmed JWT contains `app_metadata` claim path.
</verification>

<success_criteria>
- All three artifacts exist at the specified paths
- Migration file passes every grep-able acceptance criterion (helper + hook + RLS-enable + no user_metadata + no policies + no data mutation + no `org_id`)
- Edge function passes every grep-able criterion (Deno.serve + organization_members query + app_metadata writes + no user_metadata reads)
- Human has registered the hook in the Supabase Dashboard and confirmed the JWT claim path is reachable
- Requirement MT-03 structurally met: RLS is enabled on every tenant-scoped table (enforcement becomes real when Phase 3 adds policies)
- Requirement AUTH-02 structurally met: JWT contains the `app_metadata.organization_id` claim path (value becomes non-null when Phase 3 creates the first organization_members row)
- Phase 2 (OrgProvider) can proceed — the hook will populate JWT at login once the Renderspace org + membership exist
- Phase 3 (backfill + policies) has every prerequisite in place
</success_criteria>

<output>
After completion, create `.planning/phases/01-database-foundation-rls/01-database-foundation-rls-03-SUMMARY.md` with:
- All three files created (full paths)
- Exact list of tenant-scoped tables with RLS enabled (for Phase 3 to reference when writing policies)
- User's cutover decision (default-deny vs stay-online)
- Any deviations from plan and why
- Explicit note: "No policies written — Phase 3 writes SELECT + INSERT + UPDATE + DELETE policies as a complete set per PITFALLS Pitfall 5"
- Follow-ups for Phase 3:
  - Write policies using `organization_id = (select auth.organization_id())` pattern
  - Insert Renderspace org BEFORE backfilling any row (FK would fail otherwise)
  - After backfill, ALTER COLUMN organization_id SET NOT NULL on every tenant-scoped table
  - Update src/lib/types.ts to add `organization_id: string | null` (PITFALLS Pitfall 11 — never optional `?`)
</output>
