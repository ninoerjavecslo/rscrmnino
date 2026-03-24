-- supabase/migrations/010_jira_integration.sql

-- Add Jira project key to maintenance contracts
alter table maintenances
  add column if not exists jira_project_key text;

-- Hours log: manual + Tempo overrides per maintenance per month
create table if not exists maintenance_hours_log (
  id              uuid primary key default uuid_generate_v4(),
  maintenance_id  uuid not null references maintenances(id) on delete cascade,
  month           date not null,           -- first day of month: 2026-03-01
  hours_used      numeric(6,2) not null default 0,
  source          text not null default 'manual' check (source in ('tempo','manual')),
  notes           text,
  created_at      timestamptz not null default now(),
  unique (maintenance_id, month)
);

-- Email intake rules: map sender domain or keyword → maintenance
create table if not exists email_intake_rules (
  id                  uuid primary key default uuid_generate_v4(),
  maintenance_id      uuid not null references maintenances(id) on delete cascade,
  sender_domain       text,                -- e.g. pirnar.si  (checked first)
  keyword             text,                -- fallback match in subject/body
  default_issue_type  text not null default 'Bug',
  created_at          timestamptz not null default now()
);

-- RLS: same pattern as other tables (authenticated users full access)
alter table maintenance_hours_log enable row level security;
create policy "auth_all" on maintenance_hours_log
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table email_intake_rules enable row level security;
create policy "auth_all" on email_intake_rules
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
