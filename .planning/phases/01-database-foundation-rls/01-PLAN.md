---
phase: 01-database-foundation-rls
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260424000001_create_organizations.sql
autonomous: true
requirements: [MT-01, MT-04]

must_haves:
  truths:
    - "An organizations table exists in the public schema with columns id, slug, name, plan, status, created_at"
    - "The organizations.slug column has a UNIQUE constraint so two orgs cannot share a subdomain"
    - "The organizations.plan column only accepts 'free', 'trial', or 'paid'"
    - "The organizations.status column only accepts 'active' or 'suspended'"
    - "An organization_members table exists linking auth.users to organizations via (organization_id, user_id) with role"
    - "organization_members.role only accepts 'owner', 'admin', or 'member'"
    - "A user cannot be added to the same organization twice (UNIQUE(organization_id, user_id))"
    - "organization_members has indexes on user_id AND organization_id for lookup performance"
  artifacts:
    - path: "supabase/migrations/20260424000001_create_organizations.sql"
      provides: "organizations + organization_members table creation"
      contains: "create table organizations"
      contains: "create table organization_members"
  key_links:
    - from: "organization_members.organization_id"
      to: "organizations.id"
      via: "FOREIGN KEY ... ON DELETE CASCADE"
      pattern: "references organizations\\(id\\) on delete cascade"
    - from: "organization_members.user_id"
      to: "auth.users.id"
      via: "FOREIGN KEY ... ON DELETE CASCADE"
      pattern: "references auth\\.users\\(id\\) on delete cascade"
---

<objective>
Create the two foundational tables for multi-tenancy — `organizations` and `organization_members` — in a single, idempotent SQL migration. These tables are the anchor point for every other table in Phase 1-02 (which adds `organization_id` FK columns) and Phase 1-03 (which writes RLS policies).

Purpose: Without these tables the rest of Phase 1 cannot be migrated. Every `organization_id` FK in plan 01-02 references `organizations(id)` and the Custom Access Token Hook in 01-03 queries `organization_members`.

Output: `supabase/migrations/20260424000001_create_organizations.sql` — a single SQL file creating two tables with CHECK constraints, indexes, and no data population (backfill happens in Phase 3).
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md

<interfaces>
<!-- Migration naming convention — extracted from supabase/migrations/ listing -->
<!-- Two styles exist side by side: numeric (001_, 002_...) and timestamped (20260404000001_) -->
<!-- Use TIMESTAMPED style (20260424000001_) for all new migrations in Phase 1 -->

From supabase/migrations/ (directory listing):
- 001_initial_schema.sql         (legacy numeric)
- 002_indexes_rls.sql            (legacy numeric)
- 003_telegram_auth.sql          (legacy numeric)
- 20260327000001_offers.sql      (new timestamped)
- 20260404000001_user_permissions.sql (new timestamped)

From supabase/migrations/20260404000001_user_permissions.sql (reference pattern for FK to auth.users + CHECK + RLS-free table creation):
```sql
create table user_permissions (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references app_users(id) on delete cascade,
  page      text not null,
  can_view  boolean not null default true,
  can_edit  boolean not null default true,
  unique(user_id, page)
);
```
Note: this migration uses `create table` (not `create table if not exists`). New migrations should also use unconditional `create table` — idempotency is achieved by never re-running the same migration file, not by IF NOT EXISTS.
</interfaces>

<pitfalls_reference>
From .planning/research/PITFALLS.md Pitfall 7 ("FK Constraint Order"):
- organizations MUST be created BEFORE organization_members (which FKs to it)
- Both tables must live in the SAME migration file (or this migration file must run before 01-02)
- Never split table creation across unordered files

From STATE.md "Decisions":
- Use `organization_id` EVERYWHERE — never `org_id` — to avoid broken FK references
- This plan seeds the convention; every subsequent migration must match
</pitfalls_reference>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create organizations + organization_members migration SQL</name>
  <files>supabase/migrations/20260424000001_create_organizations.sql</files>
  <read_first>
    - CLAUDE.md (project conventions, TypeScript strict, `organization_id` naming)
    - .planning/research/ARCHITECTURE.md (section "Pattern 1: JWT Claim RLS" — understand how organization_members is queried by the hook in plan 01-03)
    - .planning/research/PITFALLS.md (Pitfall 7: FK constraint order)
    - supabase/migrations/20260404000001_user_permissions.sql (reference: FK-to-auth.users pattern, `on delete cascade`, UNIQUE constraint style)
    - supabase/migrations/001_initial_schema.sql (reference: existing CREATE TABLE conventions, case — all lowercase SQL keywords)
    - ls supabase/migrations/ (confirm no file starts with `20260424000001_` already)
  </read_first>
  <action>
Create the file `supabase/migrations/20260424000001_create_organizations.sql` with EXACTLY these contents (copy as-is, adjust only if a pre-existing file conflicts):

```sql
-- ============================================================
--  Phase 1-01 — Multi-tenancy foundation tables
--  Creates: organizations, organization_members
--  Requirements: MT-01, MT-04
--
--  IMPORTANT: This migration only CREATES the tables. It does
--  NOT add organization_id FKs to existing data tables (that's
--  plan 01-02) and does NOT enable RLS (that's plan 01-03).
--
--  Naming: `organization_id` is used everywhere — never `org_id`.
-- ============================================================

-- ── organizations ─────────────────────────────────────────────
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  plan        text not null default 'trial'
              check (plan in ('free', 'trial', 'paid')),
  status      text not null default 'active'
              check (status in ('active', 'suspended')),
  created_at  timestamptz not null default now()
);

comment on table organizations is
  'Tenants in the Agency Intelligence OS SaaS product. One row per agency. Slug is the subdomain (e.g. renderspace.insighty.io).';
comment on column organizations.plan is
  'Subscription tier. Manually set by admin in Phase 4 admin console (no billing integration yet).';
comment on column organizations.status is
  'active = org members can use the app; suspended = all members blocked (checked in OrgProvider in Phase 2).';

-- ── organization_members ──────────────────────────────────────
create table organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null default 'member'
                   check (role in ('owner', 'admin', 'member')),
  created_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

comment on table organization_members is
  'Links auth.users to organizations. Queried by custom_access_token_hook in plan 01-03 to embed organization_id in JWT app_metadata.';
comment on column organization_members.role is
  'owner = full admin for the org. admin = can manage members. member = standard user. Separate from existing user_permissions.page access matrix.';

-- ── Indexes ───────────────────────────────────────────────────
-- user_id lookup is the hot path: custom_access_token_hook runs this on every token refresh (~hourly)
create index idx_organization_members_user_id         on organization_members(user_id);
-- organization_id lookup is used by admin console member listing and by RLS policies in 01-03
create index idx_organization_members_organization_id on organization_members(organization_id);
```

Do NOT:
- Enable RLS on these tables (handled in plan 01-03)
- Write any RLS policies (handled in plan 01-03)
- INSERT any rows (Renderspace org is created in Phase 3 MIG-01)
- Reference `auth.uid()` or the JWT — this file only creates schema

Why `gen_random_uuid()` not `uuid_generate_v4()`: Supabase enables `pgcrypto` by default, `uuid-ossp` is optional. Matches the existing `user_permissions` migration style.

Why `timestamptz not null default now()` not `timestamp`: Matches `supabase/migrations/20260404000001_user_permissions.sql` line 8 convention; timezone-aware timestamps are the Postgres/Supabase standard.

Why no `updated_at`: These records are effectively write-once (an org's slug/name rarely changes; a membership record is created then deleted, not updated). Follows the minimal-schema principle — add columns only when a store needs them.
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; grep -q "create table organizations" supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; grep -q "create table organization_members" supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; grep -q "references organizations(id) on delete cascade" supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; grep -q "references auth.users(id) on delete cascade" supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; grep -q "unique (organization_id, user_id)" supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; grep -q "check (plan in ('free', 'trial', 'paid'))" supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; grep -q "check (status in ('active', 'suspended'))" supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; grep -q "check (role in ('owner', 'admin', 'member'))" supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; grep -q "idx_organization_members_user_id" supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; grep -q "idx_organization_members_organization_id" supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; ! grep -q "org_id" supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; ! grep -qi "enable row level security" supabase/migrations/20260424000001_create_organizations.sql &amp;&amp; echo "OK"</automated>
  </verify>
  <acceptance_criteria>
    - `supabase/migrations/20260424000001_create_organizations.sql` exists (file test)
    - `grep -c "create table organizations" supabase/migrations/20260424000001_create_organizations.sql` returns 1
    - `grep -c "create table organization_members" supabase/migrations/20260424000001_create_organizations.sql` returns 1
    - `grep "slug text unique not null" supabase/migrations/20260424000001_create_organizations.sql` matches
    - `grep "references organizations(id) on delete cascade" supabase/migrations/20260424000001_create_organizations.sql` matches (FK on organization_members.organization_id)
    - `grep "references auth.users(id) on delete cascade" supabase/migrations/20260424000001_create_organizations.sql` matches (FK on organization_members.user_id)
    - `grep "unique (organization_id, user_id)" supabase/migrations/20260424000001_create_organizations.sql` matches (no duplicate memberships)
    - `grep "check (plan in ('free', 'trial', 'paid'))" supabase/migrations/20260424000001_create_organizations.sql` matches
    - `grep "check (status in ('active', 'suspended'))" supabase/migrations/20260424000001_create_organizations.sql` matches
    - `grep "check (role in ('owner', 'admin', 'member'))" supabase/migrations/20260424000001_create_organizations.sql` matches
    - `grep -c "^create index" supabase/migrations/20260424000001_create_organizations.sql` returns 2 (user_id + organization_id)
    - `grep -c "\borg_id\b" supabase/migrations/20260424000001_create_organizations.sql` returns 0 (must use `organization_id` everywhere — STATE.md decision)
    - `grep -ci "enable row level security" supabase/migrations/20260424000001_create_organizations.sql` returns 0 (RLS is deferred to plan 01-03)
    - `grep -ci "create policy" supabase/migrations/20260424000001_create_organizations.sql` returns 0 (no policies in this plan)
    - `grep -ci "^insert into" supabase/migrations/20260424000001_create_organizations.sql` returns 0 (no row creation — Renderspace org is inserted in Phase 3)
  </acceptance_criteria>
  <done>
The migration file exists at the exact path, contains both tables with all specified columns/constraints/indexes, uses `organization_id` (never `org_id`), has no RLS statements, and has no data inserts. Downstream plan 01-02 can now reference `organizations(id)` when adding FK columns to every data table.
  </done>
</task>

</tasks>

<verification>
After this task completes:

1. **File existence:** `test -f supabase/migrations/20260424000001_create_organizations.sql`

2. **Schema correctness (requires local Supabase or equivalent):**
   ```bash
   # If supabase CLI is available locally:
   supabase db reset --linked   # applies all migrations fresh
   # then:
   supabase db dump --schema public | grep -E "^CREATE TABLE.*(organizations|organization_members)"
   ```
   Expect: both tables appear in dump.

3. **Constraint enforcement smoke-check (manual, if local DB available):**
   ```sql
   insert into organizations (slug, name, plan) values ('test', 'Test Org', 'enterprise');
   -- must fail: plan 'enterprise' violates CHECK constraint
   ```

4. **No downstream references broken:** No existing migration or source file should already reference `organizations` or `organization_members` — `grep -r "organization_members\|from organizations" src/ supabase/migrations/ | grep -v 20260424000001` should return empty.
</verification>

<success_criteria>
- Migration file exists and passes all acceptance_criteria greps
- `organizations` table has columns: id, slug, name, plan, status, created_at — with CHECK on plan and status, UNIQUE on slug
- `organization_members` table has columns: id, organization_id, user_id, role, created_at — with CHECK on role, UNIQUE on (organization_id, user_id), FK CASCADE on both references
- Two indexes created on organization_members: one on user_id, one on organization_id
- Zero RLS statements, zero INSERT statements in this migration
- Requirements MT-01 and MT-04 are structurally satisfied (enforcement via RLS happens in 01-03)
</success_criteria>

<output>
After completion, create `.planning/phases/01-database-foundation-rls/01-database-foundation-rls-01-SUMMARY.md` with:
- What was created (file path + table list)
- Any deviations from plan (and why)
- Artifacts produced (full file path)
- Downstream plans unblocked: 01-02 can now FK to organizations(id); 01-03 can now query organization_members in the hook function
</output>
