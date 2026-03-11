-- ============================================================
--  RENDERSPACE — Initial Schema
--  Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── CLIENTS ──────────────────────────────────────────────────
create table if not exists clients (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  email      text,
  phone      text,
  address    text,
  vat_id     text,          -- davčna številka (SI12345678)
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── PROJECTS ─────────────────────────────────────────────────
create table if not exists projects (
  id             uuid primary key default uuid_generate_v4(),
  client_id      uuid references clients(id) on delete set null,
  pn             text not null unique,   -- e.g. RS-2026-001
  name           text not null,
  type           text not null check (type in ('fixed','maintenance','retainer')),
  status         text not null default 'active' check (status in ('active','paused','completed','cancelled')),
  contract_value numeric(10,2),
  currency       text not null default 'EUR',
  start_date     date,
  end_date       date,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── INVOICES ─────────────────────────────────────────────────
create table if not exists invoices (
  id             uuid primary key default uuid_generate_v4(),
  project_id     uuid references projects(id) on delete set null,
  client_id      uuid references clients(id) on delete set null,
  invoice_number text unique,
  status         text not null default 'draft' check (status in ('draft','issued','paid','overdue','cancelled')),
  issued_date    date,
  due_date       date,
  paid_date      date,
  subtotal       numeric(10,2) not null default 0,
  tax_rate       numeric(5,2)  not null default 22,   -- DDV %
  tax_amount     numeric(10,2) not null default 0,
  total          numeric(10,2) not null default 0,
  currency       text not null default 'EUR',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists invoice_items (
  id          uuid primary key default uuid_generate_v4(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(10,2) not null,
  amount      numeric(10,2) generated always as (quantity * unit_price) stored,
  sort_order  int not null default 0
);

-- ── HOSTING CLIENTS (revenue you receive) ────────────────────
create table if not exists hosting_clients (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid not null references clients(id) on delete cascade,
  project_pn        text references projects(pn) on delete set null,
  description       text,
  cycle             text not null default 'monthly' check (cycle in ('monthly','yearly')),
  amount            numeric(10,2) not null,   -- monthly OR yearly amount per cycle
  billing_since     date,
  next_invoice_date date,                      -- relevant only for yearly
  status            text not null default 'active' check (status in ('active','paused','cancelled')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── INFRASTRUCTURE COSTS (costs you pay) ─────────────────────
create table if not exists infrastructure_costs (
  id            uuid primary key default uuid_generate_v4(),
  provider      text not null,
  description   text,
  monthly_cost  numeric(10,2) not null,
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly','annual','variable')),
  status        text not null default 'active' check (status in ('active','inactive')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── DOMAINS ──────────────────────────────────────────────────
create table if not exists domains (
  id            uuid primary key default uuid_generate_v4(),
  client_id     uuid references clients(id) on delete set null,
  project_pn    text not null default '1159',
  domain_name   text not null,
  expiry_date   date not null,
  yearly_amount numeric(10,2),
  contract_id   text,
  registrar     text,
  auto_renew    boolean not null default true,
  -- Computed: derived automatically from expiry_date
  status        text generated always as (
    case
      when expiry_date < current_date                        then 'expired'
      when expiry_date <= current_date + interval '30 days'  then 'expiring_soon'
      else 'active'
    end
  ) stored,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── TIMESHEET ENTRIES ─────────────────────────────────────────
-- project_pn is a free-text field (not a FK) so users can type
-- custom entries like "Sales", "Admin" not in the projects table.
create table if not exists timesheet_entries (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid,                       -- references auth.users — added when auth is enabled
  month             date not null,              -- first day of month: 2026-03-01
  project_pn        text not null,              -- loose reference, allows "Sales", "Admin" etc.
  project_name      text,                       -- denormalised display name
  description       text,                       -- work description in Slovenian
  hours             numeric(6,2) not null,
  allocation_pct    numeric(5,2),               -- % of total monthly hours
  total_month_hours numeric(6,2),               -- total hours for the month (for reference)
  ai_generated      boolean not null default false,
  created_at        timestamptz not null default now()
);

-- ── REVENUE PLANNER ───────────────────────────────────────────
create table if not exists revenue_planner (
  id             uuid primary key default uuid_generate_v4(),
  project_id     uuid not null references projects(id) on delete cascade,
  month          date not null,                 -- first day of month: 2026-03-01
  planned_amount numeric(10,2),
  actual_amount  numeric(10,2),
  status         text not null default 'planned' check (status in ('planned','paid','issued','retainer','cost')),
  invoice_id     uuid references invoices(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  unique (project_id, month)
);
