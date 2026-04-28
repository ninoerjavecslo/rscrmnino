-- ============================================================
--  Phase 3-02 — RLS isolation policies + NOT NULL constraints
--  Uses (select public.current_org_id()) for per-statement caching
-- ============================================================

-- ── Data table isolation policies ─────────────────────────────
create policy "org_isolation" on public.agency_tools
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.app_settings
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.automation_items
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.change_requests
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.clients
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.company_holidays
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.contractors
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.domains
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.email_intake_rules
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.hosting_clients
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.infrastructure_costs
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.invoice_automations
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.invoices
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.maintenance_hours_log
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.maintenances
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.member_projects
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.offer_versions
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.offers
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.og_content_library
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.og_offers
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.og_project_types
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.pipeline_items
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.pixel_conversations
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.pixel_messages
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.project_deliverables
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.projects
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.reminder_rules
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.resource_allocations
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.resource_confirmations
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.revenue_planner
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.team_members
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.teams
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.time_off
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.timesheet_entries
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

create policy "org_isolation" on public.user_permissions
  for all using  (organization_id = (select public.current_org_id()))
  with check     (organization_id = (select public.current_org_id()));

-- ── NOT NULL constraints (safe after backfill) ─────────────────
alter table public.agency_tools           alter column organization_id set not null;
alter table public.app_settings           alter column organization_id set not null;
alter table public.automation_items       alter column organization_id set not null;
alter table public.change_requests        alter column organization_id set not null;
alter table public.clients                alter column organization_id set not null;
alter table public.company_holidays       alter column organization_id set not null;
alter table public.contractors            alter column organization_id set not null;
alter table public.domains                alter column organization_id set not null;
alter table public.email_intake_rules     alter column organization_id set not null;
alter table public.hosting_clients        alter column organization_id set not null;
alter table public.infrastructure_costs   alter column organization_id set not null;
alter table public.invoice_automations    alter column organization_id set not null;
alter table public.invoices               alter column organization_id set not null;
alter table public.maintenance_hours_log  alter column organization_id set not null;
alter table public.maintenances           alter column organization_id set not null;
alter table public.member_projects        alter column organization_id set not null;
alter table public.offer_versions         alter column organization_id set not null;
alter table public.offers                 alter column organization_id set not null;
alter table public.og_content_library     alter column organization_id set not null;
alter table public.og_offers              alter column organization_id set not null;
alter table public.og_project_types       alter column organization_id set not null;
alter table public.pipeline_items         alter column organization_id set not null;
alter table public.pixel_conversations    alter column organization_id set not null;
alter table public.pixel_messages         alter column organization_id set not null;
alter table public.project_deliverables   alter column organization_id set not null;
alter table public.projects               alter column organization_id set not null;
alter table public.reminder_rules         alter column organization_id set not null;
alter table public.resource_allocations   alter column organization_id set not null;
alter table public.resource_confirmations alter column organization_id set not null;
alter table public.revenue_planner        alter column organization_id set not null;
alter table public.team_members           alter column organization_id set not null;
alter table public.teams                  alter column organization_id set not null;
alter table public.time_off               alter column organization_id set not null;
alter table public.timesheet_entries      alter column organization_id set not null;
alter table public.user_permissions       alter column organization_id set not null;
