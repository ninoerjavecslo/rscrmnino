-- ============================================================
--  Phase 1-03 — RLS foundation + Custom Access Token Hook
--  Requirements: MT-03, AUTH-02
--
--  This migration delivers 3 pieces:
--    1. auth.organization_id() — helper, reads JWT app_metadata
--    2. public.custom_access_token_hook(event) — populates JWT
--    3. ALTER TABLE ... ENABLE ROW LEVEL SECURITY on every
--       tenant-scoped table (the SAME list as migration
--       20260424000002_add_organization_id.sql)
--
--  INTENTIONAL DESIGN: No SELECT/INSERT/UPDATE/DELETE policies
--  are created here. They are deferred to Phase 3 after
--  backfill (MIG-01). Until Phase 3 runs, authenticated users
--  see ZERO rows on every tenant-scoped table — this is
--  expected because the app is offline during the cutover.
--
--  ACTIVATION: Deploying this migration does NOT make the hook
--  fire. The hook must be registered manually in
--  Supabase Dashboard > Authentication > Hooks. See the
--  human-action checkpoint in plan 01-03.
-- ============================================================

-- ─── 1. Helper: auth.organization_id() ────────────────────────
-- Called by future RLS policies (Phase 3). Wrapped in
-- (select ...) at call-site so Postgres caches the result
-- per-statement (99%+ perf improvement — see ARCHITECTURE.md
-- "Why (select auth.organization_id())").
--
-- READS FROM: app_metadata — server-controlled claim only.
-- (PITFALLS.md Pitfall 2 — app_metadata is the correct location)

-- NOTE: helper lives in public schema (auth schema not writable via migrations).
-- Phase 3 RLS policies use (select public.current_org_id()) — same perf caching applies.
create or replace function public.current_org_id()
returns uuid
language sql
stable
as $$
  select nullif(
    (current_setting('request.jwt.claims', true)::jsonb
      -> 'app_metadata'
      ->> 'organization_id'),
    ''
  )::uuid
$$;

comment on function public.current_org_id() is
  'Extracts organization_id uuid from JWT app_metadata. Returns NULL if not set. Used by Phase 3 RLS policies. Always call as (select public.current_org_id()) to enable per-statement caching.';

-- ─── 2. Custom Access Token Hook ──────────────────────────────
-- Runs on every token issuance (login + hourly refresh).
-- Queries organization_members for the user and embeds
-- organization_id into app_metadata only (PITFALLS.md Pitfall 2).
--
-- Input:  event jsonb — keys: user_id (text uuid), claims (jsonb)
-- Output: jsonb — the mutated event with updated claims
-- Registration: Supabase Dashboard > Auth > Hooks > Custom Access Token

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
as $$
declare
  claims         jsonb;
  v_organization uuid;
begin
  -- Look up user's organization (first membership wins —
  -- multi-org support is a future milestone).
  -- Hot path: organization_members has index on user_id.
  select om.organization_id
    into v_organization
    from public.organization_members om
   where om.user_id = (event ->> 'user_id')::uuid
   limit 1;

  claims := event -> 'claims';

  -- Ensure app_metadata exists as an object
  if jsonb_typeof(claims -> 'app_metadata') is null
     or jsonb_typeof(claims -> 'app_metadata') <> 'object' then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;

  -- Embed organization_id (or remove it if user has no membership)
  if v_organization is not null then
    claims := jsonb_set(
      claims,
      '{app_metadata,organization_id}',
      to_jsonb(v_organization)
    );
  else
    -- User has no membership — remove any stale org claim.
    claims := claims #- '{app_metadata,organization_id}';
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Supabase Custom Access Token Hook. Registered in Dashboard > Auth > Hooks. Embeds organization_id into JWT app_metadata at every token issue. Writes to app_metadata only (PITFALLS.md Pitfall 2).';

-- Grant hook execution to Supabase Auth (required by Supabase)
grant execute on function public.custom_access_token_hook to supabase_auth_admin;

-- Revoke from everyone else (defensive; the function reads
-- organization_members and we don't want arbitrary access)
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- Allow the hook to read organization_members even when RLS
-- is enabled on that table. supabase_auth_admin is a built-in
-- Supabase role; it bypasses RLS by default, but we grant
-- SELECT explicitly for clarity.
grant usage on schema public to supabase_auth_admin;
grant select on public.organization_members to supabase_auth_admin;

-- ─── 3. Enable RLS on every tenant-scoped table ───────────────
-- SAME LIST as 20260424000002_add_organization_id.sql (INCLUDED
-- block). After this runs, default-deny is in effect:
-- authenticated users see ZERO rows on these tables.
-- Phase 3 writes SELECT + INSERT + UPDATE + DELETE policies
-- (as a complete set — PITFALLS.md Pitfall 5) that restore
-- access scoped to organization_id.
--
-- NOTE: We are intentionally NOT creating any policies here.
-- Phase 3 MIG-01 backfill must complete first. See STATE.md
-- decision and PITFALLS.md Pitfall 1.
--
-- NOTE: Any future VIEW reading these tables MUST use
-- CREATE VIEW ... WITH (security_invoker = true) to prevent
-- the view creator role from bypassing RLS on the underlying
-- tables. See PITFALLS.md Pitfall 12.

-- Organizations themselves (also need RLS for admin console baseline)
alter table public.organizations         enable row level security;
alter table public.organization_members  enable row level security;

-- ── Core tables (001_initial_schema.sql) ──────────────────────
alter table public.clients                enable row level security;
alter table public.projects               enable row level security;
alter table public.invoices               enable row level security;
alter table public.invoice_items          enable row level security;
alter table public.hosting_clients        enable row level security;
alter table public.infrastructure_costs   enable row level security;
alter table public.domains                enable row level security;
alter table public.timesheet_entries      enable row level security;
alter table public.revenue_planner        enable row level security;

-- ── Maintenance tables ─────────────────────────────────────────
alter table public.maintenances           enable row level security;
alter table public.maintenance_hours_log  enable row level security;

-- ── CRM / Sales tables ─────────────────────────────────────────
alter table public.change_requests        enable row level security;
alter table public.pipeline_items         enable row level security;

-- ── Settings / Configuration tables ───────────────────────────
alter table public.reminder_rules         enable row level security;
alter table public.app_settings           enable row level security;
alter table public.invoice_automations    enable row level security;
alter table public.email_intake_rules     enable row level security;
alter table public.user_permissions       enable row level security;

-- ── Resource planning tables ───────────────────────────────────
alter table public.teams                  enable row level security;
alter table public.team_members           enable row level security;
alter table public.resource_allocations   enable row level security;
alter table public.member_projects        enable row level security;
alter table public.time_off               enable row level security;
alter table public.company_holidays       enable row level security;
alter table public.project_deliverables   enable row level security;
alter table public.resource_confirmations enable row level security;
alter table public.allocation_templates   enable row level security;
alter table public.allocation_actuals     enable row level security;

-- ── Offer / Document tables ────────────────────────────────────
alter table public.offers                 enable row level security;
alter table public.offer_versions         enable row level security;
alter table public.og_project_types       enable row level security;
alter table public.og_content_library     enable row level security;

-- ── AI / Pixel tables ──────────────────────────────────────────
alter table public.pixel_conversations    enable row level security;
alter table public.pixel_messages         enable row level security;

-- ── Project financials ─────────────────────────────────────────
alter table public.project_orders         enable row level security;
