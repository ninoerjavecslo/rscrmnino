-- ============================================================
--  RENDERSPACE — Indexes + Row Level Security
--  Run AFTER 001_initial_schema.sql
-- ============================================================

-- ── Performance indexes ───────────────────────────────────────
create index if not exists idx_projects_client_id         on projects(client_id);
create index if not exists idx_projects_pn                on projects(pn);
create index if not exists idx_projects_status            on projects(status);
create index if not exists idx_invoices_client_id         on invoices(client_id);
create index if not exists idx_invoices_project_id        on invoices(project_id);
create index if not exists idx_invoices_status            on invoices(status);
create index if not exists idx_invoices_due_date          on invoices(due_date);
create index if not exists idx_hosting_clients_client_id  on hosting_clients(client_id);
create index if not exists idx_hosting_clients_next_inv   on hosting_clients(next_invoice_date) where cycle = 'yearly';
create index if not exists idx_domains_expiry             on domains(expiry_date);
create index if not exists idx_domains_client_id          on domains(client_id);
create index if not exists idx_timesheet_month            on timesheet_entries(month);
create index if not exists idx_timesheet_user_month       on timesheet_entries(user_id, month);
create index if not exists idx_revenue_planner_month      on revenue_planner(month);
create index if not exists idx_revenue_planner_project    on revenue_planner(project_id);

-- ── Row Level Security ────────────────────────────────────────
-- Currently single-tenant: any authenticated user can read/write all rows.
-- When multi-user support is needed, add user_id columns + per-user policies.

alter table clients             enable row level security;
alter table projects            enable row level security;
alter table invoices            enable row level security;
alter table invoice_items       enable row level security;
alter table hosting_clients     enable row level security;
alter table infrastructure_costs enable row level security;
alter table domains             enable row level security;
alter table timesheet_entries   enable row level security;
alter table revenue_planner     enable row level security;

-- Authenticated users: full access (single-tenant)
create policy "authenticated_full_access" on clients              for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on projects             for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on invoices             for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on invoice_items        for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on hosting_clients      for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on infrastructure_costs for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on domains              for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on timesheet_entries    for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on revenue_planner      for all to authenticated using (true) with check (true);

-- ── Temporary: allow anon read for development ────────────────
-- REMOVE these before going to production
create policy "anon_read_dev" on clients              for select to anon using (true);
create policy "anon_read_dev" on projects             for select to anon using (true);
create policy "anon_read_dev" on hosting_clients      for select to anon using (true);
create policy "anon_read_dev" on infrastructure_costs for select to anon using (true);
create policy "anon_read_dev" on domains              for select to anon using (true);
create policy "anon_read_dev" on timesheet_entries    for select to anon using (true);
create policy "anon_read_dev" on revenue_planner      for select to anon using (true);

-- Also allow anon INSERT for development (timesheet, hosting, domains)
create policy "anon_write_dev" on hosting_clients      for insert to anon with check (true);
create policy "anon_write_dev" on infrastructure_costs for insert to anon with check (true);
create policy "anon_write_dev" on domains              for insert to anon with check (true);
create policy "anon_write_dev" on timesheet_entries    for insert to anon with check (true);
