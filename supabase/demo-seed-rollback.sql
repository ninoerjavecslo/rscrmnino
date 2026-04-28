-- Agency Intelligence OS — Demo Data Rollback v2
-- Removes all rows inserted by demo-seed.sql

DO $$
DECLARE
  -- ── CLIENT IDs ──────────────────────────────────────────────
  c_apex        uuid := 'a1000000-0000-0000-0000-000000000001';
  c_bloom       uuid := 'a1000000-0000-0000-0000-000000000002';
  c_verde       uuid := 'a1000000-0000-0000-0000-000000000003';
  c_pulse       uuid := 'a1000000-0000-0000-0000-000000000004';
  c_northstar   uuid := 'a1000000-0000-0000-0000-000000000005';
  c_aurora      uuid := 'a1000000-0000-0000-0000-000000000006';
  c_solaris     uuid := 'a1000000-0000-0000-0000-000000000007';
  c_cinematic   uuid := 'a1000000-0000-0000-0000-000000000008';

  -- ── PROJECT IDs ─────────────────────────────────────────────
  p_apex_brand    uuid := 'b1000000-0000-0000-0000-000000000001';
  p_apex_web      uuid := 'b1000000-0000-0000-0000-000000000002';
  p_apex_maint    uuid := 'b1000000-0000-0000-0000-000000000003';
  p_bloom_brand   uuid := 'b1000000-0000-0000-0000-000000000004';
  p_bloom_web     uuid := 'b1000000-0000-0000-0000-000000000005';
  p_verde_web     uuid := 'b1000000-0000-0000-0000-000000000006';
  p_verde_maint   uuid := 'b1000000-0000-0000-0000-000000000007';
  p_pulse_camp    uuid := 'b1000000-0000-0000-0000-000000000008';
  p_pulse_maint   uuid := 'b1000000-0000-0000-0000-000000000009';
  p_north_web     uuid := 'b1000000-0000-0000-0000-000000000010';
  p_aurora_brand  uuid := 'b1000000-0000-0000-0000-000000000011';
  p_aurora_maint  uuid := 'b1000000-0000-0000-0000-000000000012';
  p_solaris_web   uuid := 'b1000000-0000-0000-0000-000000000013';
  p_solaris_camp  uuid := 'b1000000-0000-0000-0000-000000000014';
  p_cinematic_web uuid := 'b1000000-0000-0000-0000-000000000015';
  p_cinematic_mnt uuid := 'b1000000-0000-0000-0000-000000000016';
  p_bloom_app     uuid := 'b1000000-0000-0000-0000-000000000017';
  p_north_portal  uuid := 'b1000000-0000-0000-0000-000000000018';
  p_internal      uuid := 'b1000000-0000-0000-0000-000000000019';

  -- ── MAINTENANCE IDs ──────────────────────────────────────────
  m_apex    uuid := 'c1000000-0000-0000-0000-000000000001';
  m_verde   uuid := 'c1000000-0000-0000-0000-000000000002';
  m_pulse   uuid := 'c1000000-0000-0000-0000-000000000003';
  m_aurora  uuid := 'c1000000-0000-0000-0000-000000000004';
  m_solaris uuid := 'c1000000-0000-0000-0000-000000000005';
  m_cinema  uuid := 'c1000000-0000-0000-0000-000000000006';
  m_north   uuid := 'c1000000-0000-0000-0000-000000000007';

  -- ── HOSTING CLIENT IDs ───────────────────────────────────────
  h_apex    uuid := 'd1000000-0000-0000-0000-000000000001';
  h_bloom   uuid := 'd1000000-0000-0000-0000-000000000002';
  h_verde   uuid := 'd1000000-0000-0000-0000-000000000003';
  h_pulse   uuid := 'd1000000-0000-0000-0000-000000000004';
  h_north   uuid := 'd1000000-0000-0000-0000-000000000005';
  h_aurora  uuid := 'd1000000-0000-0000-0000-000000000006';
  h_solaris uuid := 'd1000000-0000-0000-0000-000000000007';
  h_cinema  uuid := 'd1000000-0000-0000-0000-000000000008';

  -- ── DOMAIN IDs ───────────────────────────────────────────────
  dom_apex1    uuid := 'e1000000-0000-0000-0000-000000000001';
  dom_apex2    uuid := 'e1000000-0000-0000-0000-000000000002';
  dom_bloom1   uuid := 'e1000000-0000-0000-0000-000000000003';
  dom_verde1   uuid := 'e1000000-0000-0000-0000-000000000004';
  dom_verde2   uuid := 'e1000000-0000-0000-0000-000000000005';
  dom_pulse1   uuid := 'e1000000-0000-0000-0000-000000000006';
  dom_north1   uuid := 'e1000000-0000-0000-0000-000000000007';
  dom_aurora1  uuid := 'e1000000-0000-0000-0000-000000000008';
  dom_aurora2  uuid := 'e1000000-0000-0000-0000-000000000009';
  dom_solaris1 uuid := 'e1000000-0000-0000-0000-000000000010';
  dom_cinema1  uuid := 'e1000000-0000-0000-0000-000000000011';
  dom_cinema2  uuid := 'e1000000-0000-0000-0000-000000000012';

  -- ── TEAM IDs ─────────────────────────────────────────────────
  t_design uuid := 'f1000000-0000-0000-0000-000000000001';
  t_dev    uuid := 'f1000000-0000-0000-0000-000000000002';

  -- ── TEAM MEMBER IDs ──────────────────────────────────────────
  tm_nino  uuid := 'f2000000-0000-0000-0000-000000000001';
  tm_ana   uuid := 'f2000000-0000-0000-0000-000000000002';
  tm_luka  uuid := 'f2000000-0000-0000-0000-000000000003';

  -- ── AUTOMATION IDs ───────────────────────────────────────────
  aut_retainers uuid := 'f3000000-0000-0000-0000-000000000001';
  aut_hosting   uuid := 'f3000000-0000-0000-0000-000000000002';
  aut_domains   uuid := 'f3000000-0000-0000-0000-000000000003';

  demo_project_ids uuid[];
  demo_maint_ids   uuid[];
  demo_hosting_ids uuid[];
  demo_domain_ids  uuid[];
  demo_client_ids  uuid[];
  demo_member_ids  uuid[];
  demo_aut_ids     uuid[];

BEGIN

  demo_project_ids := ARRAY[
    p_apex_brand, p_apex_web, p_apex_maint,
    p_bloom_brand, p_bloom_web, p_bloom_app,
    p_verde_web, p_verde_maint,
    p_pulse_camp, p_pulse_maint,
    p_north_web, p_north_portal,
    p_aurora_brand, p_aurora_maint,
    p_solaris_web, p_solaris_camp,
    p_cinematic_web, p_cinematic_mnt,
    p_internal
  ];

  demo_maint_ids   := ARRAY[m_apex, m_verde, m_pulse, m_aurora, m_solaris, m_cinema, m_north];
  demo_hosting_ids := ARRAY[h_apex, h_bloom, h_verde, h_pulse, h_north, h_aurora, h_solaris, h_cinema];
  demo_domain_ids  := ARRAY[dom_apex1, dom_apex2, dom_bloom1, dom_verde1, dom_verde2, dom_pulse1,
                             dom_north1, dom_aurora1, dom_aurora2, dom_solaris1, dom_cinema1, dom_cinema2];
  demo_client_ids  := ARRAY[c_apex, c_bloom, c_verde, c_pulse, c_northstar, c_aurora, c_solaris, c_cinematic];
  demo_member_ids  := ARRAY[tm_nino, tm_ana, tm_luka];
  demo_aut_ids     := ARRAY[aut_retainers, aut_hosting, aut_domains];

  -- 1. Resource allocations (linked to demo members or projects)
  DELETE FROM resource_allocations
  WHERE member_id = ANY(demo_member_ids)
     OR project_id = ANY(demo_project_ids);

  -- 2. Resource projects (pinned projects)
  DELETE FROM resource_projects WHERE project_id = ANY(demo_project_ids);

  -- 3. Project deliverables
  DELETE FROM project_deliverables WHERE project_id = ANY(demo_project_ids);

  -- 4. Maintenance hours logs
  DELETE FROM maintenance_hours_logs WHERE maintenance_id = ANY(demo_maint_ids);

  -- 5. Timesheet entries seeded for demo project PNs
  DELETE FROM timesheet_entries
  WHERE project_pn IN (
    'RS-2024-001','RS-2024-008','RS-2025-003','RS-2024-004','RS-2025-001',
    'RS-2025-009','RS-2023-011','RS-2024-003','RS-2024-006','RS-2025-002',
    'RS-2024-009','RS-2025-008','RS-2024-012','RS-2025-005','RS-2025-007',
    'RS-2025-011','RS-2024-014','RS-2025-004','RS-INT-001'
  );

  -- 6. Revenue planner (linked to demo entities)
  DELETE FROM revenue_planner
  WHERE project_id        = ANY(demo_project_ids)
     OR maintenance_id    = ANY(demo_maint_ids)
     OR hosting_client_id = ANY(demo_hosting_ids)
     OR domain_id         = ANY(demo_domain_ids);

  -- 7. Revenue planner cost rows (seeded for demo months)
  DELETE FROM revenue_planner
  WHERE project_id IS NULL AND maintenance_id IS NULL
    AND hosting_client_id IS NULL AND domain_id IS NULL
    AND status = 'cost'
    AND month BETWEEN '2025-09-01' AND '2026-09-01'
    AND planned_amount IN (-280, -90, -22, -40, -18, -16);

  -- 8. Change requests
  DELETE FROM change_requests WHERE project_id = ANY(demo_project_ids);

  -- 9. Pipeline items
  DELETE FROM pipeline_items
  WHERE client_id = ANY(demo_client_ids)
     OR company_name IN ('Ferro & Fiamma', 'Lumina Optics', 'Nexus SRL', 'Aria Consulting');

  -- 10. Infrastructure costs
  DELETE FROM infrastructure_costs
  WHERE (provider = 'Hetzner Cloud'        AND description ILIKE '%Primary VPS fleet%')
     OR (provider = 'Cloudflare Pro'       AND description ILIKE '%CDN, DDoS%')
     OR (provider = 'Kinsta'               AND description ILIKE '%Managed WordPress%Verde%')
     OR (provider = 'Bunny CDN'            AND description ILIKE '%Video and asset delivery%')
     OR (provider = 'Adobe Creative Cloud' AND description ILIKE '%Team plan%')
     OR (provider = 'GitHub Teams'         AND description ILIKE '%Version control%');

  -- 11. Automation items
  DELETE FROM automation_items WHERE automation_id = ANY(demo_aut_ids);

  -- 12. Automations
  DELETE FROM automations WHERE id = ANY(demo_aut_ids);

  -- 13. Invoice automations (seeded by demo)
  DELETE FROM invoice_automations WHERE client_id = ANY(demo_client_ids);

  -- 14. Reminder rules (seeded by demo)
  DELETE FROM reminder_rules
  WHERE name IN (
    'Domain Expiry — 60 days notice',
    'Domain Expiry — 14 days final warning',
    'Maintenance Contract End — 90 days',
    'Hosting Renewal — 30 days',
    'Stale Pipeline — 30 days no update'
  );

  -- 15. Hosting clients
  DELETE FROM hosting_clients WHERE id = ANY(demo_hosting_ids);

  -- 16. Domains
  DELETE FROM domains WHERE id = ANY(demo_domain_ids);

  -- 17. Maintenances
  DELETE FROM maintenances WHERE id = ANY(demo_maint_ids);

  -- 18. Projects
  DELETE FROM projects WHERE id = ANY(demo_project_ids);

  -- 19. Team members
  DELETE FROM team_members WHERE id = ANY(demo_member_ids);

  -- 20. Teams
  DELETE FROM teams WHERE id IN (t_design, t_dev);

  -- 21. Clients
  DELETE FROM clients WHERE id = ANY(demo_client_ids);

  RAISE NOTICE 'Demo data rollback v2 complete.';

END $$;
