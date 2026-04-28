-- ============================================================
--  Phase 3-01 — Create Renderspace org + backfill all tables
-- ============================================================
do $$
declare
  v_org_id uuid;
begin
  insert into public.organizations (slug, name, plan, status)
  values ('renderspace', 'Renderspace', 'paid', 'active')
  on conflict (slug) do nothing;

  select id into v_org_id from public.organizations where slug = 'renderspace';

  -- Backfill all tenant-scoped tables
  update public.agency_tools           set organization_id = v_org_id where organization_id is null;
  update public.app_settings           set organization_id = v_org_id where organization_id is null;
  update public.automation_items       set organization_id = v_org_id where organization_id is null;
  update public.change_requests        set organization_id = v_org_id where organization_id is null;
  update public.clients                set organization_id = v_org_id where organization_id is null;
  update public.company_holidays       set organization_id = v_org_id where organization_id is null;
  update public.contractors            set organization_id = v_org_id where organization_id is null;
  update public.domains                set organization_id = v_org_id where organization_id is null;
  update public.email_intake_rules     set organization_id = v_org_id where organization_id is null;
  update public.hosting_clients        set organization_id = v_org_id where organization_id is null;
  update public.infrastructure_costs   set organization_id = v_org_id where organization_id is null;
  update public.invoice_automations    set organization_id = v_org_id where organization_id is null;
  update public.invoices               set organization_id = v_org_id where organization_id is null;
  update public.maintenance_hours_log  set organization_id = v_org_id where organization_id is null;
  update public.maintenances           set organization_id = v_org_id where organization_id is null;
  update public.member_projects        set organization_id = v_org_id where organization_id is null;
  update public.offer_versions         set organization_id = v_org_id where organization_id is null;
  update public.offers                 set organization_id = v_org_id where organization_id is null;
  update public.og_content_library     set organization_id = v_org_id where organization_id is null;
  update public.og_offers              set organization_id = v_org_id where organization_id is null;
  update public.og_project_types       set organization_id = v_org_id where organization_id is null;
  update public.pipeline_items         set organization_id = v_org_id where organization_id is null;
  update public.pixel_conversations    set organization_id = v_org_id where organization_id is null;
  update public.pixel_messages         set organization_id = v_org_id where organization_id is null;
  update public.project_deliverables   set organization_id = v_org_id where organization_id is null;
  update public.projects               set organization_id = v_org_id where organization_id is null;
  update public.reminder_rules         set organization_id = v_org_id where organization_id is null;
  update public.resource_allocations   set organization_id = v_org_id where organization_id is null;
  update public.resource_confirmations set organization_id = v_org_id where organization_id is null;
  update public.revenue_planner        set organization_id = v_org_id where organization_id is null;
  update public.team_members           set organization_id = v_org_id where organization_id is null;
  update public.teams                  set organization_id = v_org_id where organization_id is null;
  update public.time_off               set organization_id = v_org_id where organization_id is null;
  update public.timesheet_entries      set organization_id = v_org_id where organization_id is null;
  update public.user_permissions       set organization_id = v_org_id where organization_id is null;

  -- Link all existing users to renderspace org
  -- nino.erjavec@renderspace.si gets 'owner', everyone else 'member'
  insert into public.organization_members (organization_id, user_id, role)
  select
    v_org_id,
    u.id,
    case when u.email = 'nino.erjavec@renderspace.si' then 'owner' else 'member' end
  from auth.users u
  where not exists (
    select 1 from public.organization_members om
    where om.organization_id = v_org_id and om.user_id = u.id
  );
end $$;
