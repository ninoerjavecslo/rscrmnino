-- Agency Intelligence OS — Demo Data Rollback
-- Removes all rows inserted by demo-seed.sql

DO $$
DECLARE
  -- ── CLIENT IDs ──────────────────────────────────────────
  c_apex        uuid := 'a1000000-0000-0000-0000-000000000001';
  c_bloom       uuid := 'a1000000-0000-0000-0000-000000000002';
  c_verde       uuid := 'a1000000-0000-0000-0000-000000000003';
  c_pulse       uuid := 'a1000000-0000-0000-0000-000000000004';
  c_northstar   uuid := 'a1000000-0000-0000-0000-000000000005';
  c_aurora      uuid := 'a1000000-0000-0000-0000-000000000006';
  c_solaris     uuid := 'a1000000-0000-0000-0000-000000000007';
  c_cinematic   uuid := 'a1000000-0000-0000-0000-000000000008';

  -- ── PROJECT IDs ─────────────────────────────────────────
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

  -- ── MAINTENANCE IDs ──────────────────────────────────────
  m_apex    uuid := 'c1000000-0000-0000-0000-000000000001';
  m_verde   uuid := 'c1000000-0000-0000-0000-000000000002';
  m_pulse   uuid := 'c1000000-0000-0000-0000-000000000003';
  m_aurora  uuid := 'c1000000-0000-0000-0000-000000000004';
  m_solaris uuid := 'c1000000-0000-0000-0000-000000000005';
  m_cinema  uuid := 'c1000000-0000-0000-0000-000000000006';

  -- ── HOSTING CLIENT IDs ───────────────────────────────────
  h_apex    uuid := 'd1000000-0000-0000-0000-000000000001';
  h_bloom   uuid := 'd1000000-0000-0000-0000-000000000002';
  h_verde   uuid := 'd1000000-0000-0000-0000-000000000003';
  h_pulse   uuid := 'd1000000-0000-0000-0000-000000000004';
  h_north   uuid := 'd1000000-0000-0000-0000-000000000005';
  h_aurora  uuid := 'd1000000-0000-0000-0000-000000000006';
  h_solaris uuid := 'd1000000-0000-0000-0000-000000000007';
  h_cinema  uuid := 'd1000000-0000-0000-0000-000000000008';

  -- ── DOMAIN IDs ───────────────────────────────────────────
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

  demo_project_ids uuid[];
  demo_maint_ids   uuid[];
  demo_hosting_ids uuid[];
  demo_domain_ids  uuid[];
  demo_client_ids  uuid[];

BEGIN

  demo_project_ids := ARRAY[
    p_apex_brand, p_apex_web, p_apex_maint,
    p_bloom_brand, p_bloom_web,
    p_verde_web, p_verde_maint,
    p_pulse_camp, p_pulse_maint,
    p_north_web,
    p_aurora_brand, p_aurora_maint,
    p_solaris_web, p_solaris_camp,
    p_cinematic_web, p_cinematic_mnt
  ];

  demo_maint_ids := ARRAY[m_apex, m_verde, m_pulse, m_aurora, m_solaris, m_cinema];

  demo_hosting_ids := ARRAY[h_apex, h_bloom, h_verde, h_pulse, h_north, h_aurora, h_solaris, h_cinema];

  demo_domain_ids := ARRAY[
    dom_apex1, dom_apex2, dom_bloom1,
    dom_verde1, dom_verde2, dom_pulse1,
    dom_north1, dom_aurora1, dom_aurora2,
    dom_solaris1, dom_cinema1, dom_cinema2
  ];

  demo_client_ids := ARRAY[
    c_apex, c_bloom, c_verde, c_pulse,
    c_northstar, c_aurora, c_solaris, c_cinematic
  ];

  -- 1. Revenue planner — rows linked to demo entities
  DELETE FROM revenue_planner
  WHERE project_id       = ANY(demo_project_ids)
     OR maintenance_id   = ANY(demo_maint_ids)
     OR hosting_client_id = ANY(demo_hosting_ids)
     OR domain_id        = ANY(demo_domain_ids);

  -- 2. Revenue planner — cost rows seeded for demo months
  --    (NULL on all FK cols, status='cost', inserted by demo seed)
  DELETE FROM revenue_planner
  WHERE project_id IS NULL
    AND maintenance_id IS NULL
    AND hosting_client_id IS NULL
    AND domain_id IS NULL
    AND status = 'cost'
    AND month BETWEEN '2025-09-01' AND '2026-08-01'
    AND planned_amount IN (-280, -90, -22, -40, -18);

  -- 3. Change requests linked to demo projects
  DELETE FROM change_requests
  WHERE project_id = ANY(demo_project_ids);

  -- 4. Pipeline items linked to demo clients or known prospect names
  DELETE FROM pipeline_items
  WHERE client_id = ANY(demo_client_ids)
     OR company_name IN ('Ferro & Fiamma', 'Lumina Optics');

  -- 5. Infrastructure costs seeded by demo (matched by provider+description)
  DELETE FROM infrastructure_costs
  WHERE (provider = 'Hetzner Cloud'      AND description ILIKE '%Primary VPS fleet%')
     OR (provider = 'Cloudflare Pro'     AND description ILIKE '%CDN, DDoS%')
     OR (provider = 'Kinsta'             AND description ILIKE '%Managed WordPress%Verde%')
     OR (provider = 'Bunny CDN'          AND description ILIKE '%Video and asset delivery%')
     OR (provider = 'Adobe Creative Cloud' AND description ILIKE '%Team plan%');

  -- 6. Hosting clients
  DELETE FROM hosting_clients WHERE id = ANY(demo_hosting_ids);

  -- 7. Domains
  DELETE FROM domains WHERE id = ANY(demo_domain_ids);

  -- 8. Maintenances
  DELETE FROM maintenances WHERE id = ANY(demo_maint_ids);

  -- 9. Projects
  DELETE FROM projects WHERE id = ANY(demo_project_ids);

  -- 10. Clients
  DELETE FROM clients WHERE id = ANY(demo_client_ids);

  RAISE NOTICE 'Demo data rollback complete.';

END $$;
