-- ============================================================
--  Phase 2 — RLS policies enabling subdomain routing + auth
-- ============================================================

-- Allow anon key to read organizations by slug (subdomain resolver)
create policy "orgs_public_read"
  on public.organizations
  for select
  using (true);

-- Allow authenticated users to read their own org memberships (login check)
create policy "members_self_read"
  on public.organization_members
  for select
  to authenticated
  using (auth.uid() = user_id);
