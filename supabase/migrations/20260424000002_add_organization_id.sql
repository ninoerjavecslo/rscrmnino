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
--
-- INCLUDED (tenant-scoped — confirmed by CREATE TABLE or ALTER TABLE in migrations/supabase/*.sql):
--   clients               (001_initial_schema.sql — CREATE TABLE)
--   projects              (001_initial_schema.sql — CREATE TABLE)
--   invoices              (001_initial_schema.sql — CREATE TABLE)
--   invoice_items         (001_initial_schema.sql — CREATE TABLE)
--   hosting_clients       (001_initial_schema.sql — CREATE TABLE)
--   infrastructure_costs  (001_initial_schema.sql — CREATE TABLE)
--   domains               (001_initial_schema.sql — CREATE TABLE)
--   timesheet_entries     (001_initial_schema.sql — CREATE TABLE)
--   revenue_planner       (001_initial_schema.sql — CREATE TABLE)
--   maintenances          (010_jira_integration.sql — ALTER TABLE confirms existence; created in Supabase Studio)
--   change_requests       (src/stores/changeRequests.ts — live DB; Studio-created)
--   pipeline_items        (src/stores/pipeline.ts — live DB; Studio-created)
--   reminder_rules        (src/stores/reminders.ts — live DB; Studio-created)
--   app_settings          (src/stores/settings.ts — live DB; Studio-created; key-value store per agency)
--   teams                 (009_resource_tables_rls.sql — ALTER TABLE IF EXISTS confirms existence)
--   team_members          (resource-planning-migration.sql — CREATE TABLE; also in 009_resource_tables_rls.sql)
--   resource_allocations  (009_resource_tables_rls.sql — ALTER TABLE IF EXISTS confirms existence)
--   member_projects       (009_resource_tables_rls.sql — ALTER TABLE IF EXISTS confirms existence)
--   time_off              (009_resource_tables_rls.sql — ALTER TABLE IF EXISTS confirms existence)
--   company_holidays      (009_resource_tables_rls.sql — ALTER TABLE IF EXISTS confirms existence)
--   project_deliverables  (src/stores/resource.ts — live DB; Studio-created)
--   resource_confirmations (src/stores/resource.ts — live DB; Studio-created)
--   allocation_templates  (008_allocation_templates.sql — CREATE TABLE)
--   allocation_actuals    (add_allocation_actuals.sql — CREATE TABLE)
--   maintenance_hours_log (010_jira_integration.sql — CREATE TABLE)
--   email_intake_rules    (010_jira_integration.sql — CREATE TABLE)
--   offers                (20260327000001_offers.sql — CREATE TABLE)
--   offer_versions        (20260327000001_offers.sql — CREATE TABLE)
--   og_project_types      (20260404000001_offer_blocknote.sql — CREATE TABLE; per-tenant template library)
--   og_content_library    (20260404000001_offer_blocknote.sql — CREATE TABLE; per-tenant content library)
--   user_permissions      (20260404000001_user_permissions.sql — CREATE TABLE)
--   invoice_automations   (automations-migration.sql — CREATE TABLE)
--   pixel_conversations   (src/stores/pixel.ts — live DB; Studio-created)
--   pixel_messages        (src/stores/pixel.ts — live DB; Studio-created)
--   project_orders        (src/views/ProjectDetailView.tsx — live DB; Studio-created)
--
-- EXCLUDED:
--   organizations         (plan 01-01 — self-referential; already has id as PK)
--   organization_members  (plan 01-01 — already has organization_id as the FK column itself)
--   app_users             (global mirror of auth.users; tenant scoping via organization_members, not org_id FK)
--   telegram_auth         (003_telegram_auth.sql — single-row global config, not tenant-scoped)
--   auth.*                (Supabase-managed; never modify)
--   resource_plan         (resource-planning-migration.sql — member + project plan; tenant scope inherited
--                          via project_id FK to projects.organization_id; omitting to avoid Studio conflicts
--                          since resource_plan vs resource_plans naming is unclear; deferred to Phase 3 review)
--   resource_projects     (resource-planning-migration.sql — project pins helper table; scope via project_id FK;
--                          same as resource_plan — deferred)
-- ──────────────────────────────────────────────────────────────

-- ── CORE TABLES (001_initial_schema.sql) ──────────────────────

alter table public.clients
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_clients_organization_id
  on public.clients(organization_id);

alter table public.projects
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_projects_organization_id
  on public.projects(organization_id);

alter table public.invoices
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_invoices_organization_id
  on public.invoices(organization_id);

alter table public.invoice_items
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_invoice_items_organization_id
  on public.invoice_items(organization_id);

alter table public.hosting_clients
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_hosting_clients_organization_id
  on public.hosting_clients(organization_id);

alter table public.infrastructure_costs
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_infrastructure_costs_organization_id
  on public.infrastructure_costs(organization_id);

alter table public.domains
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_domains_organization_id
  on public.domains(organization_id);

alter table public.timesheet_entries
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_timesheet_entries_organization_id
  on public.timesheet_entries(organization_id);

alter table public.revenue_planner
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_revenue_planner_organization_id
  on public.revenue_planner(organization_id);

-- ── MAINTENANCE TABLES ─────────────────────────────────────────

alter table public.maintenances
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_maintenances_organization_id
  on public.maintenances(organization_id);

alter table public.maintenance_hours_log
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_maintenance_hours_log_organization_id
  on public.maintenance_hours_log(organization_id);

-- ── CRM / SALES TABLES ─────────────────────────────────────────

alter table public.change_requests
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_change_requests_organization_id
  on public.change_requests(organization_id);

alter table public.pipeline_items
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_pipeline_items_organization_id
  on public.pipeline_items(organization_id);

-- ── SETTINGS / CONFIGURATION TABLES ───────────────────────────

alter table public.reminder_rules
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_reminder_rules_organization_id
  on public.reminder_rules(organization_id);

alter table public.app_settings
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_app_settings_organization_id
  on public.app_settings(organization_id);

alter table public.invoice_automations
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_invoice_automations_organization_id
  on public.invoice_automations(organization_id);

alter table public.email_intake_rules
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_email_intake_rules_organization_id
  on public.email_intake_rules(organization_id);

alter table public.user_permissions
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_user_permissions_organization_id
  on public.user_permissions(organization_id);

-- ── RESOURCE PLANNING TABLES ───────────────────────────────────

alter table public.teams
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_teams_organization_id
  on public.teams(organization_id);

alter table public.team_members
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_team_members_organization_id
  on public.team_members(organization_id);

alter table public.resource_allocations
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_resource_allocations_organization_id
  on public.resource_allocations(organization_id);

alter table public.member_projects
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_member_projects_organization_id
  on public.member_projects(organization_id);

alter table public.time_off
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_time_off_organization_id
  on public.time_off(organization_id);

alter table public.company_holidays
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_company_holidays_organization_id
  on public.company_holidays(organization_id);

alter table public.project_deliverables
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_project_deliverables_organization_id
  on public.project_deliverables(organization_id);

alter table public.resource_confirmations
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_resource_confirmations_organization_id
  on public.resource_confirmations(organization_id);

alter table public.allocation_templates
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_allocation_templates_organization_id
  on public.allocation_templates(organization_id);

alter table public.allocation_actuals
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_allocation_actuals_organization_id
  on public.allocation_actuals(organization_id);

-- ── OFFER / DOCUMENT TABLES ────────────────────────────────────

alter table public.offers
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_offers_organization_id
  on public.offers(organization_id);

alter table public.offer_versions
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_offer_versions_organization_id
  on public.offer_versions(organization_id);

alter table public.og_project_types
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_og_project_types_organization_id
  on public.og_project_types(organization_id);

alter table public.og_content_library
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_og_content_library_organization_id
  on public.og_content_library(organization_id);

-- ── AI / PIXEL TABLES ──────────────────────────────────────────

alter table public.pixel_conversations
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_pixel_conversations_organization_id
  on public.pixel_conversations(organization_id);

alter table public.pixel_messages
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_pixel_messages_organization_id
  on public.pixel_messages(organization_id);

-- ── PROJECT FINANCIALS ─────────────────────────────────────────

alter table public.project_orders
  add column if not exists organization_id uuid references organizations(id);
create index if not exists idx_project_orders_organization_id
  on public.project_orders(organization_id);
