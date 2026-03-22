-- ============================================================
--  Resource tables RLS — ensure authenticated users have full access
--  Run if time_off, teams, resource_allocations, etc. were created
--  directly in Supabase Studio without migrations.
-- ============================================================

-- Enable RLS (safe to run even if already enabled)
alter table if exists teams                enable row level security;
alter table if exists team_members         enable row level security;
alter table if exists resource_allocations enable row level security;
alter table if exists member_projects      enable row level security;
alter table if exists time_off             enable row level security;
alter table if exists company_holidays     enable row level security;

-- Drop existing policies if any (idempotent)
do $$ begin
  drop policy if exists "authenticated_full_access" on teams;
  drop policy if exists "authenticated_full_access" on team_members;
  drop policy if exists "authenticated_full_access" on resource_allocations;
  drop policy if exists "authenticated_full_access" on member_projects;
  drop policy if exists "authenticated_full_access" on time_off;
  drop policy if exists "authenticated_full_access" on company_holidays;
exception when others then null;
end $$;

-- Full access for authenticated users
create policy "authenticated_full_access" on teams                for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on team_members         for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on resource_allocations for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on member_projects      for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on time_off             for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on company_holidays     for all to authenticated using (true) with check (true);
