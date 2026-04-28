-- Allow authenticated users to read all organizations (admin console needs this)
create policy "orgs_authenticated_read"
  on public.organizations
  for select
  to authenticated
  using (true);

-- Allow owner to insert/update organizations
create policy "orgs_owner_write"
  on public.organizations
  for all
  to authenticated
  using (auth.jwt()->>'email' = 'nino.erjavec@renderspace.si')
  with check (auth.jwt()->>'email' = 'nino.erjavec@renderspace.si');

-- Allow owner to read all organization_members
create policy "members_owner_read"
  on public.organization_members
  for select
  to authenticated
  using (auth.jwt()->>'email' = 'nino.erjavec@renderspace.si' OR auth.uid() = user_id);
