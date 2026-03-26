create table offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_name text not null default '',
  offer_number text not null default '',
  language text not null default 'sl' check (language in ('sl', 'en')),
  mode text not null default 'manual' check (mode in ('quick', 'structured', 'manual')),
  brief_text text,
  sections jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  pricing_total numeric not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table offer_versions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers(id) on delete cascade,
  version integer not null,
  sections_snapshot jsonb not null default '[]'::jsonb,
  meta_snapshot jsonb not null default '{}'::jsonb,
  pricing_total_snapshot numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table offers enable row level security;
alter table offer_versions enable row level security;

create policy "authenticated read offers" on offers for select using (auth.role() = 'authenticated');
create policy "authenticated write offers" on offers for all using (auth.role() = 'authenticated');
create policy "authenticated read offer_versions" on offer_versions for select using (auth.role() = 'authenticated');
create policy "authenticated write offer_versions" on offer_versions for all using (auth.role() = 'authenticated');
