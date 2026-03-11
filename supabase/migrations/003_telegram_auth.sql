-- ============================================================
--  RENDERSPACE — Telegram Bot Auth
--  Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

create table if not exists telegram_auth (
  id                         uuid primary key default gen_random_uuid(),
  telegram_id                bigint unique,               -- Telegram user ID (null until linked)
  link_code                  text,                        -- 32-char crypto-random hex, expires 10 min
  link_code_expires_at       timestamptz,
  linked_at                  timestamptz,
  pending_action             jsonb,                       -- action awaiting confirmation
  pending_action_expires_at  timestamptz,                 -- 5 min TTL
  last_update_id             bigint,                      -- dedup: ignore already-processed update_ids
  created_at                 timestamptz not null default now()
);

-- Only one row ever (single user) — enforce via unique constraint
-- RLS: only service_role can access (Edge Functions use service_role)
alter table telegram_auth enable row level security;

-- Allow service_role full access (used by Edge Functions)
create policy "service_role_all" on telegram_auth
  for all using (true) with check (true);
