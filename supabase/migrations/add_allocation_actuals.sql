-- supabase/migrations/add_allocation_actuals.sql
create table if not exists allocation_actuals (
  id            uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references resource_allocations(id) on delete cascade,
  member_id     uuid not null references team_members(id) on delete cascade,
  date          date not null,
  actual_hours  numeric(4,1) not null check (actual_hours >= 0),
  note          text,
  created_at    timestamptz default now()
);

-- Only one actual per allocation
create unique index if not exists allocation_actuals_alloc_idx
  on allocation_actuals(allocation_id);

-- RLS
alter table allocation_actuals enable row level security;
create policy "allow all" on allocation_actuals for all using (true) with check (true);
