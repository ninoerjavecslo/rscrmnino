create table if not exists allocation_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  entries    jsonb not null default '[]',
  created_at timestamptz default now()
);

alter table allocation_templates enable row level security;

create policy "allow all authenticated"
  on allocation_templates
  for all
  using (true)
  with check (true);
