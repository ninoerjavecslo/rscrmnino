---
phase: 01-database-foundation-rls
plan: 02
type: execute
wave: 2
depends_on: ["01-database-foundation-rls-01"]
files_modified:
  - supabase/migrations/20260424000002_add_organization_id.sql
autonomous: true
requirements: [MT-02]

must_haves:
  truths:
    - "Every tenant-scoped data table in public schema has a nullable organization_id uuid column that FKs to organizations(id)"
    - "Every such table has an index on organization_id (RLS performance baseline)"
    - "The column is nullable — Phase 3 backfill populates it, Phase 3 migration adds NOT NULL"
    - "No data loss: adding a nullable column with no default leaves all existing rows unchanged"
  artifacts:
    - path: "supabase/migrations/20260424000002_add_organization_id.sql"
      provides: "organization_id column + FK + index on every tenant-scoped data table"
      contains: "alter table"
      contains: "add column organization_id uuid references organizations(id)"
      contains: "create index"
  key_links:
    - from: "{every_data_table}.organization_id"
      to: "organizations.id"
      via: "FOREIGN KEY (nullable — backfill in Phase 3 makes NOT NULL)"
      pattern: "references organizations\\(id\\)"
---

<objective>
Add a nullable `organization_id uuid references organizations(id)` column, plus a matching index on that column, to every tenant-scoped data table in the `public` schema. This is the structural prerequisite for RLS — policies in plan 01-03 filter rows using this column.

Purpose: Every row in the database must eventually be owned by exactly one organization. Adding the column nullable in Phase 1 (this plan), backfilling in Phase 3, and adding NOT NULL in Phase 3 is the ONLY safe sequence — the reverse order locks existing Renderspace users out of their own data (see PITFALLS.md Pitfall 1, 6).

Output: `supabase/migrations/20260424000002_add_organization_id.sql` — a single idempotent SQL file that runs `ALTER TABLE ... ADD COLUMN ... IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` for every tenant-scoped table that actually exists in the schema.

Critical: This plan requires the executor to FIRST inspect the actual table inventory before writing the migration, because research sources disagree (14 vs 20+ tables) and some names in the planning prompt (`revenue_planners`, `automations`, `resource_plans`) do not match the actual schema.
</objective>

<execution_context>
@~/.claude/get-shit-done/workflows/execute-plan.md
@~/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/research/ARCHITECTURE.md
@.planning/research/PITFALLS.md
@src/lib/types.ts

<interfaces>
<!-- Actual table inventory discovered via grep on supabase/migrations/ -->
<!-- This list is AUTHORITATIVE — takes precedence over the planning prompt's table list -->
<!-- which used the TypeScript interface names (e.g. `automations`) rather than the SQL -->
<!-- table names (e.g. `invoice_automations`). -->

Tenant-scoped tables confirmed to exist in migrations:
  public.clients                   (001_initial_schema.sql line 9)
  public.projects                  (001_initial_schema.sql line 22)
  public.invoices                  (001_initial_schema.sql line 39)
  public.invoice_items             (001_initial_schema.sql line 58)
  public.hosting_clients           (001_initial_schema.sql line 69)
  public.infrastructure_costs      (001_initial_schema.sql line 85)
  public.domains                   (001_initial_schema.sql line 98)
  public.timesheet_entries         (001_initial_schema.sql line 124)
  public.revenue_planner           (001_initial_schema.sql line 139)  -- singular, NOT `revenue_planners`
  public.maintenance_hours_log     (010_jira_integration.sql line 8)
  public.email_intake_rules        (010_jira_integration.sql line 20)
  public.allocation_templates      (008_allocation_templates.sql line 1)
  public.allocation_actuals        (add_allocation_actuals.sql line 2)
  public.offers                    (20260327000001_offers.sql line 1)
  public.offer_versions            (20260327000001_offers.sql line 18)
  public.og_project_types          (20260404000001_offer_blocknote.sql line 7)
  public.og_content_library        (20260404000001_offer_blocknote.sql line 20)
  public.app_users                 (20260404000001_user_permissions.sql line 2)
  public.user_permissions          (20260404000001_user_permissions.sql line 15)
  public.invoice_automations       (supabase/automations-migration.sql line 4)
  public.telegram_auth             (003_telegram_auth.sql line 6)

Tables named in the planning prompt but NOT yet confirmed in migrations (executor MUST verify with grep before including; skip if absent):
  public.maintenances          -- referenced by src/lib/types.ts Maintenance interface; check for CREATE TABLE statement
  public.change_requests       -- referenced by ChangeRequest interface
  public.pipeline_items        -- referenced by PipelineItem interface
  public.team_members          -- referenced by TeamMember interface
  public.contractors           -- may not exist; verify
  public.resource_plans        -- may not be the actual name; check for `resource_allocations`, `member_projects`, `teams`, `time_offs`, `project_deliverables`, `resource_confirmations`, `company_holidays`
  public.app_settings          -- check exact name; may be singular
  public.reminder_rules        -- check exact name
  public.automations           -- in prompt, but actual table is `invoice_automations`; skip `automations` if no such table exists
  public.offer_templates       -- may not exist yet; `og_project_types` + `og_content_library` serve this purpose

Tables to EXCLUDE (system/global, not tenant-scoped):
  public.app_users     -- mirrors auth.users globally; scoped via organization_members instead
  public.telegram_auth -- single-row config; no tenant scope
  auth.*               -- Supabase-managed, never modify
  public.organizations -- created in 01-01; self-referential
  public.organization_members -- created in 01-01; self-referential via organization_id column already

From supabase/migrations/001_initial_schema.sql (style reference for ALTER TABLE additions):
```sql
-- existing migrations use lowercase SQL
-- FK pattern in existing code: `references clients(id) on delete cascade`
-- Column addition pattern used elsewhere (from 004_maintenance_project_pn.sql is the reference)
```

From src/lib/types.ts (TypeScript interfaces — DO NOT edit in this plan, but use to confirm which tables are tenant-scoped):
  Client, Project, Invoice, HostingClient, InfrastructureCost, Domain, Maintenance,
  TimesheetEntry, RevenuePlanner, PipelineItem, ChangeRequest, Automation,
  AutomationItem, InvoiceAutomation, ReminderRule, Team, TeamMember, MemberProject,
  TimeOff, ResourceAllocation, AllocationTemplate, ProjectDeliverable,
  ResourceConfirmation, AllocationActual, CompanyHoliday, PixelConversation,
  PixelMessage, MaintenanceHoursLog, ProjectOrder, EmailIntakeRule, Offer, OfferVersion
</interfaces>

<pitfalls_reference>
From PITFALLS.md Pitfall 1 (missing RLS coverage): The #1 cause of cross-tenant leaks is forgetting a table. Discovery step (Task 1) is the mitigation.

From PITFALLS.md Pitfall 6 (backfill locks): Adding a nullable column with no default is O(1) in Postgres 11+ (no table rewrite). Safe for any table size.

From PITFALLS.md Pitfall 11 (TypeScript `organization_id?` optional): This plan adds the DB column only. The type change (`Client.organization_id: string | null`) is deferred — do NOT edit src/lib/types.ts in this plan.

From STATE.md: Exact table count needs verification before writing migration — Task 1 does this verification.

From ARCHITECTURE.md Scaling: Index on organization_id is REQUIRED, not optional. Without it RLS scans every row per query.
</pitfalls_reference>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enumerate tenant-scoped tables from the live schema</name>
  <files>supabase/migrations/20260424000002_add_organization_id.sql</files>
  <read_first>
    - CLAUDE.md (naming: `organization_id` everywhere)
    - .planning/STATE.md (blocker: "Exact table count needs verification before writing migration")
    - .planning/research/PITFALLS.md (Pitfall 1: missing RLS coverage silently leaks data)
    - src/lib/types.ts (TypeScript interfaces — each interface usually corresponds to one tenant-scoped table)
    - `ls supabase/migrations/` (enumerate all existing migrations)
    - Each migration file matching `grep -l "create table" supabase/migrations/*.sql supabase/*.sql`
    - .planning/phases/01-database-foundation-rls/01-PLAN.md (dependency — organizations table must exist first)
  </read_first>
  <action>
Step A — Enumerate all tables in the `public` schema by grepping migration files:

```bash
grep -rhn "^create table" supabase/migrations/*.sql supabase/*.sql 2>/dev/null \
  | sed -E 's/.*create table (if not exists )?([a-z_]+).*/\2/' \
  | sort -u
```

Record the FULL list.

Step B — Classify each table. A table is TENANT-SCOPED (must get organization_id) if:
  - It holds business data belonging to a specific agency (clients, projects, invoices, maintenances, timesheets, etc.)
  - OR it holds per-tenant configuration (settings, automations, reminder rules, team members, resource plans)

A table is NOT tenant-scoped (SKIP adding organization_id) if:
  - It is `organizations` or `organization_members` (already self-referential)
  - It is `app_users` (mirrors auth.users globally; membership is tracked via organization_members)
  - It is `telegram_auth` (single-row config shared across the Supabase project)
  - It is in the `auth.*` schema (Supabase-managed)

For tables where classification is ambiguous (e.g., `og_project_types`, `og_content_library` — offer template library; currently global, may become per-tenant), INCLUDE them to be safe — over-scoping is reversible; under-scoping leaks data (PITFALLS.md Pitfall 1).

Step C — Produce the final tenant-scoped table list as a comment at the top of the migration. The list below is the expected set based on the interfaces in types.ts + migration grep; executor MUST cross-verify with Step A output and adjust:

Expected tenant-scoped tables (~20-25):
  clients, projects, invoices, invoice_items, hosting_clients, infrastructure_costs, domains,
  maintenances, timesheet_entries, revenue_planner, pipeline_items, change_requests,
  invoice_automations, reminder_rules, teams, team_members, member_projects, time_offs,
  resource_allocations, allocation_templates, allocation_actuals, project_deliverables,
  resource_confirmations, company_holidays, maintenance_hours_log, email_intake_rules,
  offers, offer_versions, og_project_types, og_content_library, app_settings,
  user_permissions, pixel_conversations, pixel_messages, project_orders

Tables to verify as existing (SQL grep confirmation) before including — if `grep -l "create table maintenances" supabase/migrations/*.sql` returns NOTHING, EXCLUDE that table from the migration, do not invent one.

Step D — Write the migration. See Task 2.
  </action>
  <verify>
    <automated>grep -rhn "^create table" supabase/migrations/*.sql supabase/*.sql 2>/dev/null | wc -l | awk '{if ($1 &gt;= 15) print "OK"; else print "FAIL: found only " $1 " tables — expected &gt;=15"}'</automated>
  </verify>
  <acceptance_criteria>
    - The executor has produced a written enumeration (in the migration file header as a SQL comment) listing every tenant-scoped table they will alter
    - The comment block lists which tables were EXCLUDED and why (e.g. `-- EXCLUDED: app_users (global user mirror, scoped via organization_members)`)
    - Every table included in the list has been confirmed to exist via `grep "create table {name}" supabase/migrations/ supabase/*.sql` returning at least one match
    - No table is invented (no entry for a table the executor did not find a CREATE TABLE statement for)
  </acceptance_criteria>
  <done>
A classified table inventory exists as a comment in `supabase/migrations/20260424000002_add_organization_id.sql` header. The inventory distinguishes INCLUDED (tenant-scoped) from EXCLUDED (global/system) tables with reasoning for each exclusion. The list contains no invented table names.
  </done>
</task>

<task type="auto">
  <name>Task 2: Write the ALTER TABLE + CREATE INDEX migration for every tenant-scoped table</name>
  <files>supabase/migrations/20260424000002_add_organization_id.sql</files>
  <read_first>
    - The table inventory produced in Task 1 (top of the migration file)
    - supabase/migrations/20260424000001_create_organizations.sql (dependency — organizations table must exist for the FK)
    - supabase/migrations/002_indexes_rls.sql (index-creation style reference: `create index if not exists idx_{table}_{column}`)
    - .planning/research/PITFALLS.md Pitfall 6 (nullable column + no default = O(1) on Postgres 11+)
    - .planning/research/PITFALLS.md Pitfall 11 (do NOT edit src/lib/types.ts in this plan)
  </read_first>
  <action>
Open `supabase/migrations/20260424000002_add_organization_id.sql` (created in Task 1 with the inventory comment at the top) and append ALTER TABLE + CREATE INDEX statements.

Exact structure the file must follow:

```sql
-- ============================================================
--  Phase 1-02 — Add organization_id to every tenant-scoped table
--  Requirements: MT-02
--
--  CRITICAL SAFETY NOTES:
--    1. Column is NULLABLE in this migration. NOT NULL is added
--       in Phase 3 AFTER backfill (PITFALLS.md Pitfall 6).
--    2. FK references organizations(id) — created in
--       20260424000001_create_organizations.sql. That migration
--       MUST have been applied before this one.
--    3. Index on organization_id is REQUIRED for RLS perf
--       (ARCHITECTURE.md — full-table-scan risk without it).
--    4. This migration does NOT backfill data. Backfill is Phase 3.
--    5. This migration does NOT enable RLS or write policies.
--       That is plan 01-03.
-- ============================================================

-- ── TABLE INVENTORY (from Task 1) ─────────────────────────────
-- INCLUDED (tenant-scoped): {list produced in Task 1}
-- EXCLUDED:
--   organizations, organization_members (self-referential — plan 01-01)
--   app_users (global mirror of auth.users)
--   telegram_auth (single-row global config)
--   auth.* (Supabase-managed)
-- ──────────────────────────────────────────────────────────────

-- For each tenant-scoped table, emit a pair of statements:

alter table public.clients
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_clients_organization_id
  on public.clients(organization_id);

alter table public.projects
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_projects_organization_id
  on public.projects(organization_id);

-- ... repeat for EVERY tenant-scoped table in the inventory ...
```

Rules for each generated pair:

1. **Exact column DDL (never deviate):**
   `add column if not exists organization_id uuid references organizations(id);`
   - NO `not null` (column must be nullable until Phase 3 backfill)
   - NO `default` clause (a default would create a bogus FK on backfill day)
   - NO `on delete cascade` for now (cross-table cascade behavior is decided in Phase 3)
   - The FK target is always `organizations(id)` — never `organization_members` or any other table

2. **Exact index DDL (never deviate):**
   `create index if not exists idx_{table}_organization_id on public.{table}(organization_id);`
   - Index name format is `idx_{table}_organization_id` — matches existing `idx_projects_client_id` convention in `002_indexes_rls.sql`
   - `if not exists` keeps the migration idempotent

3. **Order of statements:**
   - ALTER TABLE first for every table (batch all column additions), then
   - CREATE INDEX for every table (batch all indexes)
   OR pair them table-by-table (clients ALTER + clients INDEX, then projects ALTER + projects INDEX, …) — either is acceptable; pick ONE style and be consistent.

4. **Use `public.` schema prefix on every table name** — matches PITFALLS.md recommendation that the migration checklist must be explicit about schema.

5. **Do NOT modify any existing column** — no ALTER ... DROP, no ALTER ... RENAME, no ALTER ... ALTER TYPE.

6. **Do NOT add NOT NULL anywhere in this file.**

7. **Do NOT UPDATE any rows.** Backfill is Phase 3 (MIG-01).

8. **Do NOT ENABLE ROW LEVEL SECURITY** anywhere in this file. RLS is plan 01-03.

9. **Do NOT edit src/lib/types.ts** in this plan. TypeScript changes are a separate concern handled after Phase 3 backfill (PITFALLS.md Pitfall 11).
  </action>
  <verify>
    <automated>N=$(grep -c "^alter table public\." supabase/migrations/20260424000002_add_organization_id.sql); M=$(grep -c "^create index if not exists idx_.*_organization_id" supabase/migrations/20260424000002_add_organization_id.sql); NOTNULL=$(grep -ci "not null" supabase/migrations/20260424000002_add_organization_id.sql); RLS=$(grep -ci "enable row level security\|create policy" supabase/migrations/20260424000002_add_organization_id.sql); UPDATE=$(grep -ci "^update \|^insert into" supabase/migrations/20260424000002_add_organization_id.sql); ORGID=$(grep -c "\borg_id\b" supabase/migrations/20260424000002_add_organization_id.sql); if [ "$N" -ge 15 ] &amp;&amp; [ "$M" -eq "$N" ] &amp;&amp; [ "$NOTNULL" -eq 0 ] &amp;&amp; [ "$RLS" -eq 0 ] &amp;&amp; [ "$UPDATE" -eq 0 ] &amp;&amp; [ "$ORGID" -eq 0 ]; then echo "OK (tables=$N indexes=$M)"; else echo "FAIL tables=$N indexes=$M notnull=$NOTNULL rls=$RLS mutations=$UPDATE orgid=$ORGID"; fi</automated>
  </verify>
  <acceptance_criteria>
    - `test -f supabase/migrations/20260424000002_add_organization_id.sql` (file exists)
    - `grep -c "^alter table public\." supabase/migrations/20260424000002_add_organization_id.sql` >= 15 (every tenant-scoped table altered; lower bound matches confirmed minimum from migration inventory)
    - `grep -c "^create index if not exists idx_.*_organization_id" supabase/migrations/20260424000002_add_organization_id.sql` equals the ALTER TABLE count (1:1 pairing)
    - `grep -c "add column if not exists organization_id uuid references organizations(id)" supabase/migrations/20260424000002_add_organization_id.sql` equals the ALTER TABLE count
    - `grep -ci "not null" supabase/migrations/20260424000002_add_organization_id.sql` == 0 (no NOT NULL — Phase 3 concern)
    - `grep -ci "enable row level security" supabase/migrations/20260424000002_add_organization_id.sql` == 0 (RLS is 01-03)
    - `grep -ci "^create policy\|^alter policy" supabase/migrations/20260424000002_add_organization_id.sql` == 0
    - `grep -ci "^update \|^insert into" supabase/migrations/20260424000002_add_organization_id.sql` == 0 (no data mutation)
    - `grep -c "\borg_id\b" supabase/migrations/20260424000002_add_organization_id.sql` == 0 (must use `organization_id`)
    - `grep -c "references organizations(id)" supabase/migrations/20260424000002_add_organization_id.sql` equals ALTER TABLE count (every column FKs to organizations)
    - No reference to `auth.users` as an FK target (tables FK only to organizations, not directly to auth.users)
    - `grep -c "^-- INCLUDED\|^-- EXCLUDED" supabase/migrations/20260424000002_add_organization_id.sql` >= 2 (inventory comment block present from Task 1)
    - Every table name appearing in an `alter table` statement was confirmed to have a matching `create table` statement in the existing migrations (executor lists verification in summary)
  </acceptance_criteria>
  <done>
The migration file contains one ALTER TABLE + one CREATE INDEX for every tenant-scoped table in the inventory. All columns are nullable uuid FKs to organizations(id). Zero RLS statements, zero data mutations, zero `org_id` references. Downstream plan 01-03 can now write policies that reference `{table}.organization_id` knowing the column exists.
  </done>
</task>

</tasks>

<verification>
After both tasks complete:

1. **File + structure:** `grep -c "^alter table" supabase/migrations/20260424000002_add_organization_id.sql` should equal `grep -c "^create index" supabase/migrations/20260424000002_add_organization_id.sql`

2. **Coverage check (requires applied migration):**
   ```sql
   -- After applying the migration, this query must return 0 rows:
   SELECT c.table_name
   FROM information_schema.tables t
   JOIN information_schema.columns c
     ON c.table_schema = t.table_schema AND c.table_name = t.table_name
   WHERE t.table_schema = 'public'
     AND t.table_type = 'BASE TABLE'
     AND t.table_name NOT IN ('organizations', 'organization_members', 'app_users', 'telegram_auth')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.columns c2
       WHERE c2.table_schema = 'public'
         AND c2.table_name = t.table_name
         AND c2.column_name = 'organization_id'
     );
   -- If any row returns, that table was missed. Add it to the migration.
   ```

3. **Index check (after applying):**
   ```sql
   SELECT tablename FROM pg_indexes
   WHERE schemaname = 'public' AND indexname LIKE '%organization_id%';
   -- Count should equal count of tables that got the column.
   ```

4. **Null-safety (after applying):**
   ```sql
   -- All existing rows retain NULL organization_id — no accidental backfill:
   SELECT count(*) FROM clients WHERE organization_id IS NOT NULL; -- must return 0
   ```
</verification>

<success_criteria>
- `supabase/migrations/20260424000002_add_organization_id.sql` exists
- Every tenant-scoped table in the `public` schema has an `organization_id uuid REFERENCES organizations(id)` column (nullable)
- Every such table has an `idx_{table}_organization_id` index
- The migration file has a header comment listing INCLUDED and EXCLUDED tables with reasoning
- Zero NOT NULL constraints, zero RLS statements, zero data mutations in this file
- Requirement MT-02 is structurally met (FK column exists; RLS enforcement is 01-03)
</success_criteria>

<output>
After completion, create `.planning/phases/01-database-foundation-rls/01-database-foundation-rls-02-SUMMARY.md` with:
- Full list of tables that received organization_id (count + names)
- Any tables classified as EXCLUDED and the reason
- Any tables named in the planning prompt that did NOT exist in the schema and were skipped
- Downstream impact: 01-03 can now write `policies ... using (organization_id = current_org_id())` against every listed table
</output>
