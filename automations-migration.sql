-- Invoice Automations Migration
-- Recurring billing line templates for monthly email generation

create table if not exists invoice_automations (
  id                  uuid primary key default uuid_generate_v4(),
  name                text not null,
  client_id           uuid not null references clients(id) on delete restrict,
  contract_ref        text,
  pn                  text not null default '6820',
  description_template text not null,
  quantity            numeric(10,2) not null default 1,
  unit_price          numeric(10,2) not null,
  due_days            int not null default 30,
  hosting_client_id   uuid references hosting_clients(id) on delete set null,
  maintenance_id      uuid references maintenances(id) on delete set null,
  active              boolean not null default true,
  sort_order          int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists invoice_automations_active_sort_idx
  on invoice_automations(active, sort_order, created_at);

alter table invoice_automations enable row level security;

create policy "allow_all_authenticated" on invoice_automations
  for all to authenticated using (true) with check (true);
