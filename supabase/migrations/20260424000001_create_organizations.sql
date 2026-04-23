-- ============================================================
--  Phase 1-01 — Multi-tenancy foundation tables
--  Creates: organizations, organization_members
--  Requirements: MT-01, MT-04
--
--  IMPORTANT: This migration only CREATES the tables. It does
--  NOT add organization_id FKs to existing data tables (that's
--  plan 01-02) and does NOT enable RLS (that's plan 01-03).
--
--  Naming: `organization_id` is used everywhere — never `org_id`.
-- ============================================================

-- ── organizations ─────────────────────────────────────────────
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  plan        text not null default 'trial'
              check (plan in ('free', 'trial', 'paid')),
  status      text not null default 'active'
              check (status in ('active', 'suspended')),
  created_at  timestamptz not null default now()
);

comment on table organizations is
  'Tenants in the Agency Intelligence OS SaaS product. One row per agency. Slug is the subdomain (e.g. renderspace.insighty.io).';
comment on column organizations.plan is
  'Subscription tier. Manually set by admin in Phase 4 admin console (no billing integration yet).';
comment on column organizations.status is
  'active = org members can use the app; suspended = all members blocked (checked in OrgProvider in Phase 2).';

-- ── organization_members ──────────────────────────────────────
create table organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null default 'member'
                   check (role in ('owner', 'admin', 'member')),
  created_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

comment on table organization_members is
  'Links auth.users to organizations. Queried by custom_access_token_hook in plan 01-03 to embed organization_id in JWT app_metadata.';
comment on column organization_members.role is
  'owner = full admin for the org. admin = can manage members. member = standard user. Separate from existing user_permissions.page access matrix.';

-- ── Indexes ───────────────────────────────────────────────────
-- user_id lookup is the hot path: custom_access_token_hook runs this on every token refresh (~hourly)
create index idx_organization_members_user_id         on organization_members(user_id);
-- organization_id lookup is used by admin console member listing and by RLS policies in 01-03
create index idx_organization_members_organization_id on organization_members(organization_id);
