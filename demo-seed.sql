-- Agency Intelligence OS — Demo Data Seed
-- Run this in Supabase SQL editor to populate demo data
-- WARNING: This will ADD data to existing tables. Run on a clean/demo database.

-- ============================================================
--  STEP 0: Define reusable UUIDs via a temp CTE approach.
--  We declare all IDs up front as variables so every
--  INSERT block stays fully self-consistent.
-- ============================================================

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

BEGIN

-- ============================================================
--  1. CLIENTS
-- ============================================================

INSERT INTO clients (id, name, email, phone, address, vat_id,
                     contact_person, contact_email, contact_phone,
                     notes, created_at, updated_at)
VALUES
  (
    c_apex,
    'Apex Digital',
    'hello@apexdigital.io',
    '+39 02 8765 4321',
    'Via della Innovazione 12, 20121 Milano MI',
    'IT04512378901',
    'Lorenzo Ferretti',
    'l.ferretti@apexdigital.io',
    '+39 348 123 4567',
    'Fast-growing SaaS startup. Very responsive team. Decision maker is Lorenzo.',
    now() - interval '18 months',
    now() - interval '2 weeks'
  ),
  (
    c_bloom,
    'Bloom & Co',
    'studio@bloomandco.it',
    '+39 055 234 5678',
    'Via dei Servi 44, 50122 Firenze FI',
    'IT03298765401',
    'Chiara Mancini',
    'chiara@bloomandco.it',
    '+39 339 876 5432',
    'Fashion and lifestyle brand. Great client for creative projects. Pays on time.',
    now() - interval '14 months',
    now() - interval '1 month'
  ),
  (
    c_verde,
    'Verde Architects',
    'info@verdearchitects.eu',
    '+39 06 5544 3322',
    'Via Giulia 78, 00186 Roma RM',
    'IT02156789012',
    'Marco Rinaldi',
    'm.rinaldi@verdearchitects.eu',
    '+39 335 567 8901',
    'Architecture studio with international projects. Needs detailed invoicing.',
    now() - interval '22 months',
    now() - interval '3 weeks'
  ),
  (
    c_pulse,
    'Pulse Media Group',
    'contracts@pulsemedia.it',
    '+39 02 3456 7890',
    'Corso Buenos Aires 18, 20124 Milano MI',
    'IT05678901234',
    'Alessia Conti',
    'a.conti@pulsemedia.it',
    '+39 347 234 5678',
    'Media company producing digital content. Monthly retainer active. Accounting email required.',
    now() - interval '20 months',
    now() - interval '1 week'
  ),
  (
    c_northstar,
    'NorthStar Logistics',
    'admin@northstarlogistics.eu',
    '+39 011 765 4321',
    'Via Nizza 55, 10125 Torino TO',
    'IT06789012345',
    'Davide Gallo',
    'd.gallo@northstarlogistics.eu',
    '+39 320 345 6789',
    'Logistics and transport company. Conservative brand. Fixed-price project completed.',
    now() - interval '12 months',
    now() - interval '2 months'
  ),
  (
    c_aurora,
    'Aurora Wellness',
    'ciao@aurorawellness.it',
    '+39 02 1234 5678',
    'Via Brera 9, 20121 Milano MI',
    'IT07890123456',
    'Sofia Greco',
    'sofia@aurorawellness.it',
    '+39 331 456 7890',
    'Health & wellness brand. Visual identity project completed. Now on maintenance.',
    now() - interval '10 months',
    now() - interval '3 weeks'
  ),
  (
    c_solaris,
    'Solaris Energy',
    'info@solarisenergia.it',
    '+39 0805 567 890',
    'Via del Mare 103, 70126 Bari BA',
    'IT08901234567',
    'Antonio Riva',
    'a.riva@solarisenergia.it',
    '+39 360 567 8901',
    'Renewable energy startup backed by VC. Large budget. Potentially big pipeline.',
    now() - interval '6 months',
    now() - interval '1 week'
  ),
  (
    c_cinematic,
    'Cinematic Studio',
    'hello@cinematicstudio.eu',
    '+39 02 9876 5432',
    'Via Savona 97, 20144 Milano MI',
    'IT09012345678',
    'Elena Fontana',
    'e.fontana@cinematicstudio.eu',
    '+39 340 678 9012',
    'Film production house. Portfolio site + maintenance. Creative direction needed.',
    now() - interval '8 months',
    now() - interval '1 month'
  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  2. PROJECTS
-- ============================================================

INSERT INTO projects (id, client_id, pn, name, type, status, pm,
                      contract_value, initial_contract_value, currency,
                      start_date, end_date, notes)
VALUES
  -- APEX DIGITAL (tech startup, 3 projects)
  (
    p_apex_brand, c_apex,
    'RS-2024-001', 'Apex Digital — Brand Identity System',
    'fixed', 'completed', 'Nino',
    8500, 8500, 'EUR',
    '2024-06-01', '2024-09-30',
    'Full brand identity: logo, typography, color system, brand guidelines PDF.'
  ),
  (
    p_apex_web, c_apex,
    'RS-2024-008', 'Apex Digital — Marketing Website',
    'fixed', 'completed', 'Nino',
    18400, 16000, 'EUR',
    '2024-10-01', '2025-02-28',
    'Next.js marketing site with CMS integration. Contract grew due to two approved CRs.'
  ),
  (
    p_apex_maint, c_apex,
    'RS-2025-003', 'Apex Digital — Monthly Support',
    'maintenance', 'active', 'Nino',
    NULL, NULL, 'EUR',
    '2025-03-01', NULL,
    'Ongoing maintenance, hosting and technical support. Priority SLA.'
  ),

  -- BLOOM & CO (fashion, 2 projects)
  (
    p_bloom_brand, c_bloom,
    'RS-2024-004', 'Bloom & Co — Visual Identity',
    'fixed', 'completed', 'Nino',
    6200, 6200, 'EUR',
    '2024-09-01', '2024-11-30',
    'Logo redesign, packaging templates and brand guidelines for SS25 launch.'
  ),
  (
    p_bloom_web, c_bloom,
    'RS-2025-001', 'Bloom & Co — E-commerce Website',
    'fixed', 'active', 'Nino',
    22000, 19500, 'EUR',
    '2025-01-15', '2025-06-30',
    'Shopify custom theme with editorial blog and lookbook. CR approved for Instagram feed integration.'
  ),

  -- VERDE ARCHITECTS (architecture, 2 projects)
  (
    p_verde_web, c_verde,
    'RS-2023-011', 'Verde Architects — Portfolio Website',
    'fixed', 'completed', 'Nino',
    12800, 12800, 'EUR',
    '2023-10-01', '2024-02-29',
    'Custom portfolio with project case studies and multilingual support (IT/EN).'
  ),
  (
    p_verde_maint, c_verde,
    'RS-2024-003', 'Verde Architects — Hosting & Maintenance',
    'maintenance', 'active', 'Nino',
    NULL, NULL, 'EUR',
    '2024-03-01', NULL,
    'Monthly maintenance, uptime monitoring, CMS updates.'
  ),

  -- PULSE MEDIA GROUP (media, 2 projects)
  (
    p_pulse_camp, c_pulse,
    'RS-2024-006', 'Pulse Media — Digital Campaign Q4',
    'fixed', 'completed', 'Nino',
    9500, 9500, 'EUR',
    '2024-09-15', '2024-12-15',
    'Social media campaign assets, motion graphics, paid ads creatives.'
  ),
  (
    p_pulse_maint, c_pulse,
    'RS-2025-002', 'Pulse Media — Retainer Dev',
    'variable', 'active', 'Nino',
    NULL, NULL, 'EUR',
    '2025-02-01', NULL,
    'Variable monthly hours for ongoing digital content production and web updates.'
  ),

  -- NORTHSTAR LOGISTICS (logistics, 1 project)
  (
    p_north_web, c_northstar,
    'RS-2024-009', 'NorthStar Logistics — Corporate Website',
    'fixed', 'completed', 'Nino',
    14500, 13000, 'EUR',
    '2024-07-01', '2024-11-30',
    'Corporate website + fleet tracking portal design. CR approved for live tracking embed.'
  ),

  -- AURORA WELLNESS (health, 2 projects)
  (
    p_aurora_brand, c_aurora,
    'RS-2024-012', 'Aurora Wellness — Brand & Packaging',
    'fixed', 'completed', 'Nino',
    7800, 7800, 'EUR',
    '2024-08-01', '2024-10-31',
    'Full brand identity, product packaging design for launch range of 6 SKUs.'
  ),
  (
    p_aurora_maint, c_aurora,
    'RS-2025-005', 'Aurora Wellness — Web Maintenance',
    'maintenance', 'active', 'Nino',
    NULL, NULL, 'EUR',
    '2025-02-01', NULL,
    'Monthly website support, newsletter design and social media templates.'
  ),

  -- SOLARIS ENERGY (renewable, 2 projects)
  (
    p_solaris_web, c_solaris,
    'RS-2025-007', 'Solaris Energy — Website & Brand',
    'fixed', 'active', 'Nino',
    28000, 24000, 'EUR',
    '2025-02-15', '2025-08-31',
    'Brand identity system + investor-grade website. Large scope, phased delivery. CR pending for interactive ROI calculator.'
  ),
  (
    p_solaris_camp, c_solaris,
    'RS-2025-011', 'Solaris Energy — Launch Campaign',
    'fixed', 'active', 'Nino',
    11500, 11500, 'EUR',
    '2025-05-01', '2025-09-30',
    'Product launch campaign: landing pages, social assets, email sequences.'
  ),

  -- CINEMATIC STUDIO (film, 2 projects)
  (
    p_cinematic_web, c_cinematic,
    'RS-2024-014', 'Cinematic Studio — Portfolio & Showreel',
    'fixed', 'completed', 'Nino',
    9200, 9200, 'EUR',
    '2024-11-01', '2025-02-28',
    'Portfolio site with full-screen video, case studies and client login area.'
  ),
  (
    p_cinematic_mnt, c_cinematic,
    'RS-2025-004', 'Cinematic Studio — Ongoing Support',
    'maintenance', 'active', 'Nino',
    NULL, NULL, 'EUR',
    '2025-03-01', NULL,
    'Monthly hosting, updates and seasonal content refreshes.'
  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  3. CHANGE REQUESTS
-- ============================================================

INSERT INTO change_requests (id, project_id, title, description, status,
                              amount, probability, deal_type, expected_month, notes, created_at)
VALUES
  -- Apex Web — 2 approved CRs (already billed into contract_value)
  (
    gen_random_uuid(), p_apex_web,
    'Cookie consent banner + GDPR compliance module',
    'Implement cookie consent management platform with granular consent options.',
    'billed', 1200, 100, 'one_time', '2025-01-01',
    'Approved Oct 2024. Delivered and billed in final invoice.',
    '2024-10-15'
  ),
  (
    gen_random_uuid(), p_apex_web,
    'Multilingual support (EN/IT/DE)',
    'Add full i18n support for three languages using next-intl.',
    'billed', 1200, 100, 'one_time', '2025-02-01',
    'Approved Dec 2024. Delivered Feb 2025.',
    '2024-12-01'
  ),

  -- Bloom Web — 1 approved CR, 1 pending
  (
    gen_random_uuid(), p_bloom_web,
    'Instagram product feed integration',
    'Embed live Instagram feed on homepage, synced with product catalog.',
    'approved', 2500, 100, 'one_time', '2025-05-01',
    'Client confirmed via email 14 Feb. Invoice to issue May.',
    '2025-02-14'
  ),
  (
    gen_random_uuid(), p_bloom_web,
    'Video background hero section',
    'Full-width MP4 hero with autoplay + mobile fallback image.',
    'pending', 900, 75, 'one_time', '2025-06-01',
    'Under review. Client wants to see a demo first.',
    '2025-03-10'
  ),

  -- NorthStar — 1 billed CR
  (
    gen_random_uuid(), p_north_web,
    'Live fleet tracking embed (Mapbox)',
    'Interactive Mapbox map showing live vehicle positions via API.',
    'billed', 1500, 100, 'one_time', '2024-11-01',
    'Approved and delivered in final sprint. Billed with project.',
    '2024-09-20'
  ),

  -- Solaris Web — 1 pending CR (high value)
  (
    gen_random_uuid(), p_solaris_web,
    'Interactive solar ROI calculator',
    'Custom React widget for investors to calculate projected returns based on location + system size.',
    'pending', 4000, 75, 'one_time', '2025-07-01',
    'Waiting on client sign-off. Technical spec sent 3 Mar.',
    '2025-03-03'
  ),
  (
    gen_random_uuid(), p_solaris_web,
    'Investor portal — private document library',
    'Secure login-gated area with downloadable reports, pitch deck and financial models.',
    'approved', 5500, 100, 'one_time', '2025-08-01',
    'Approved 10 Mar. Adds Phase 3 to project scope.',
    '2025-03-10'
  ),

  -- Pulse retainer — approved CR for extra sprint
  (
    gen_random_uuid(), p_pulse_maint,
    'Q1 campaign — extra production sprint',
    '40 extra hours for social media content production for Q1 push.',
    'approved', 2400, 100, 'one_time', '2025-03-01',
    'Approved verbally, email confirmation received.',
    '2025-02-25'
  ),

  -- Cinematic — pending scope extension
  (
    gen_random_uuid(), p_cinematic_web,
    'Behind-the-scenes blog + crew bios section',
    'Editorial blog with tagging system, and dedicated crew profiles page.',
    'pending', 1800, 50, 'one_time', '2025-04-01',
    'Nice to have — client has budget but no final decision.',
    '2025-03-01'
  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  4. MAINTENANCES
-- ============================================================

INSERT INTO maintenances (id, client_id, project_pn, name, monthly_retainer,
                          help_requests_included, hours_included,
                          contract_start, contract_end, status, notes, created_at)
VALUES
  (
    m_apex, c_apex,
    'RS-2025-003', 'Apex Digital — Priority Support',
    950, 10, 8,
    '2025-03-01', NULL,
    'active',
    'Priority 4-hour SLA. Covers hosting, monitoring, CMS, minor feature tweaks.',
    '2025-02-20'
  ),
  (
    m_verde, c_verde,
    'RS-2024-003', 'Verde Architects — Hosting & Maintenance',
    450, 5, 4,
    '2024-03-01', NULL,
    'active',
    'Basic monthly plan: hosting, uptime monitoring, CMS updates.',
    '2024-02-25'
  ),
  (
    m_pulse, c_pulse,
    'RS-2025-002', 'Pulse Media — Dev Retainer',
    1800, 0, 20,
    '2025-02-01', '2026-01-31',
    'active',
    '20 hrs/month variable dev. Invoiced at month-end based on usage. Max 1800 EUR/mo.',
    '2025-01-20'
  ),
  (
    m_aurora, c_aurora,
    'RS-2025-005', 'Aurora Wellness — Care Plan',
    320, 3, 3,
    '2025-02-01', NULL,
    'active',
    'Lite plan: hosting, monthly newsletter template, minor tweaks.',
    '2025-01-28'
  ),
  (
    m_solaris, c_solaris,
    'RS-2025-007', 'Solaris Energy — Hosting Plan',
    600, 5, 5,
    '2025-09-01', NULL,
    'active',
    'Starts when website goes live. Dedicated server + monitoring.',
    '2025-03-01'
  ),
  (
    m_cinema, c_cinematic,
    'RS-2025-004', 'Cinematic Studio — Content Plan',
    480, 4, 4,
    '2025-03-01', '2026-02-28',
    'active',
    'Annual contract for hosting, updates and quarterly content refresh.',
    '2025-02-20'
  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  5. HOSTING CLIENTS
-- ============================================================

INSERT INTO hosting_clients (id, client_id, project_pn, description, cycle, amount,
                              billing_since, next_invoice_date, status,
                              maintenance_id, accounting_email, notes)
VALUES
  (
    h_apex, c_apex,
    'RS-2025-003', 'VPS + CDN — Apex Digital app hosting',
    'monthly', 120,
    '2025-03-01', '2026-04-01',
    'active', m_apex, true,
    'Hetzner VPS CX41, Cloudflare CDN, daily backups.'
  ),
  (
    h_bloom, c_bloom,
    'RS-2025-001', 'Shopify Plus hosting contribution',
    'monthly', 80,
    '2025-07-01', '2026-04-01',
    'active', NULL, false,
    'Monthly pass-through for Shopify Plus plan. Billed with project go-live.'
  ),
  (
    h_verde, c_verde,
    'RS-2024-003', 'WordPress hosting — Verde Architects',
    'yearly', 480,
    '2024-03-01', '2026-03-01',
    'active', m_verde, true,
    'Managed WP hosting on Kinsta Starter plan. Renewal due March.'
  ),
  (
    h_pulse, c_pulse,
    'RS-2025-002', 'Media server & storage — Pulse',
    'monthly', 220,
    '2025-02-01', '2026-04-01',
    'active', m_pulse, true,
    'Hetzner storage box 10TB + VPS for media delivery.'
  ),
  (
    h_north, c_northstar,
    'RS-2024-009', 'Corporate site hosting — NorthStar',
    'yearly', 360,
    '2024-12-01', '2025-12-01',
    'active', NULL, false,
    'Basic VPS, SSL, automated backups. Annual plan renewed Dec 24.'
  ),
  (
    h_aurora, c_aurora,
    'RS-2025-005', 'WordPress hosting — Aurora Wellness',
    'monthly', 60,
    '2025-02-01', '2026-04-01',
    'active', m_aurora, false,
    'Shared hosting SiteGround GrowBig. Includes daily backups.'
  ),
  (
    h_solaris, c_solaris,
    'RS-2025-007', 'Dedicated server — Solaris investor portal',
    'monthly', 280,
    '2025-09-01', '2026-04-01',
    'active', m_solaris, true,
    'Hetzner dedicated AX41, 2x NVMe RAID. Goes live with website.'
  ),
  (
    h_cinema, c_cinematic,
    'RS-2025-004', 'Video portfolio hosting — Cinematic Studio',
    'monthly', 95,
    '2025-03-01', '2026-04-01',
    'active', m_cinema, false,
    'VPS with Bunny CDN for video delivery. High bandwidth plan.'
  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  6. INFRASTRUCTURE COSTS
-- ============================================================

INSERT INTO infrastructure_costs (id, provider, description, monthly_cost,
                                   billing_cycle, status, notes)
VALUES
  (
    gen_random_uuid(),
    'Hetzner Cloud',
    'Primary VPS fleet — 4x CX41 instances for client projects',
    280,
    'monthly', 'active',
    'Covers Apex, Pulse, Cinematic, Solaris (pre-live dev). Invoiced monthly in EUR.'
  ),
  (
    gen_random_uuid(),
    'Cloudflare Pro',
    'CDN, DDoS protection and DNS for all client domains',
    22,
    'monthly', 'active',
    'Pro plan subscription. Covers unlimited domains.'
  ),
  (
    gen_random_uuid(),
    'Kinsta',
    'Managed WordPress hosting (Verde + overflow)',
    40,
    'monthly', 'active',
    'Starter plan for Verde Architects. Monthly billing in USD, approx EUR equivalent.'
  ),
  (
    gen_random_uuid(),
    'Bunny CDN',
    'Video and asset delivery for Cinematic Studio + Pulse',
    18,
    'variable', 'active',
    'Pay-per-GB. Average ~18 EUR/mo based on last 3 months usage.'
  ),
  (
    gen_random_uuid(),
    'Adobe Creative Cloud',
    'Team plan — design tools for the studio',
    90,
    'monthly', 'active',
    '3-seat Creative Cloud All Apps plan. Core design tooling cost.'
  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  7. DOMAINS
-- ============================================================

INSERT INTO domains (id, client_id, project_pn, domain_name,
                     registered_date, expiry_date, yearly_amount,
                     registrar, auto_renew, billable, accounting_email, notes)
VALUES
  -- Apex Digital — 2 domains
  (
    dom_apex1, c_apex, 'RS-2025-003',
    'apexdigital.io',
    '2022-04-15', '2026-04-15',
    18, 'Namecheap', true, true, true,
    'Primary domain. Auto-renew active. Billed to client annually.'
  ),
  (
    dom_apex2, c_apex, 'RS-2025-003',
    'apexdigital.eu',
    '2022-04-15', '2025-04-15',
    12, 'Namecheap', false, true, false,
    'EU domain. Expiring soon — auto-renew disabled, check with client.'
  ),

  -- Bloom & Co — 1 domain (expiring very soon — critical)
  (
    dom_bloom1, c_bloom, 'RS-2025-001',
    'bloomandco.it',
    '2021-03-20', '2026-03-20',
    15, 'Aruba', true, true, true,
    'Main domain. CRITICAL: expires in ~5 days. Auto-renew queued with registrar.'
  ),

  -- Verde Architects — 2 domains
  (
    dom_verde1, c_verde, 'RS-2024-003',
    'verdearchitects.eu',
    '2020-05-10', '2026-05-10',
    20, 'GoDaddy', true, true, true,
    'Primary .eu domain.'
  ),
  (
    dom_verde2, c_verde, 'RS-2024-003',
    'verdearchitects.it',
    '2020-05-10', '2025-03-28',
    12, 'GoDaddy', false, true, false,
    'WARNING: expires 28 Mar 2025. Client requested not to renew — confirm before dropping.'
  ),

  -- Pulse Media — 1 domain
  (
    dom_pulse1, c_pulse, 'RS-2025-002',
    'pulsemedia.it',
    '2019-11-01', '2026-11-01',
    15, 'Register.it', true, true, true,
    'Main domain. Billed annually with hosting invoice.'
  ),

  -- NorthStar Logistics — 1 domain (already expired)
  (
    dom_north1, c_northstar, 'RS-2024-009',
    'northstarlogistics.eu',
    '2021-02-14', '2025-02-14',
    20, 'Namecheap', false, true, false,
    'EXPIRED: client chose not to renew .eu variant. Keeping .it instead — confirm domain redirect.'
  ),

  -- Aurora Wellness — 2 domains (1 expiring soon)
  (
    dom_aurora1, c_aurora, 'RS-2025-005',
    'aurorawellness.it',
    '2022-06-01', '2026-06-01',
    15, 'Aruba', true, true, false,
    'Primary domain.'
  ),
  (
    dom_aurora2, c_aurora, 'RS-2025-005',
    'aurora-wellness.com',
    '2022-06-01', '2026-04-01',
    18, 'Namecheap', true, true, true,
    'Secondary .com redirect. Expiring Apr 2026 — in good shape.'
  ),

  -- Solaris Energy — 1 domain
  (
    dom_solaris1, c_solaris, 'RS-2025-007',
    'solarisenergia.it',
    '2024-09-01', '2026-09-01',
    15, 'Namecheap', true, true, true,
    'Registered Sep 2024. Long runway.'
  ),

  -- Cinematic Studio — 2 domains
  (
    dom_cinema1, c_cinematic, 'RS-2025-004',
    'cinematicstudio.eu',
    '2023-03-01', '2026-03-01',
    20, 'Namecheap', true, true, false,
    'WARNING: expiry date 1 Mar 2026 — within 12 months but OK for now.'
  ),
  (
    dom_cinema2, c_cinematic, 'RS-2025-004',
    'cinematicstudio.it',
    '2023-03-01', '2025-03-10',
    15, 'Aruba', false, true, false,
    'EXPIRING SOON: expires 10 Mar 2025. Auto-renew disabled — client to confirm.'
  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  8. REVENUE PLANNER
--  Covers: Sep 2025 → Aug 2026 (past 6 + current + future 6)
--  Today = 2026-03-15
--  Past: Sep 2025, Oct 2025, Nov 2025, Dec 2025, Jan 2026, Feb 2026
--  Current: Mar 2026
--  Future: Apr 2026, May 2026, Jun 2026, Jul 2026, Aug 2026
-- ============================================================

INSERT INTO revenue_planner (id, project_id, maintenance_id, hosting_client_id, domain_id,
                              month, planned_amount, actual_amount,
                              status, probability, notes)
VALUES

  -- ── SEPTEMBER 2025 ─────────────────────────────────────

  -- Apex Web final invoice (Phase 3)
  (gen_random_uuid(), p_apex_web, NULL, NULL, NULL,
   '2025-09-01', 6500, 6500, 'paid', 100,
   'Final payment Apex Digital website. Phase 3 + i18n CR.'),

  -- Verde maintenance retainer
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2025-09-01', 450, 450, 'paid', 100,
   'Verde Architects monthly retainer Sep 2025.'),

  -- Pulse media retainer
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2025-09-01', 1800, 1620, 'paid', 100,
   'Pulse Media retainer Sep. 18 hrs logged, slight underage.'),

  -- Aurora maintenance
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2025-09-01', 320, 320, 'paid', 100,
   'Aurora Wellness care plan Sep.'),

  -- Hosting revenue — Apex, Pulse, Cinema
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2025-09-01', 120, 120, 'paid', 100,
   'Apex hosting Sep.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2025-09-01', 220, 220, 'paid', 100,
   'Pulse media server Sep.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2025-09-01', 95, 95, 'paid', 100,
   'Cinematic Studio hosting Sep.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2025-09-01', 60, 60, 'paid', 100,
   'Aurora hosting Sep.'),

  -- NorthStar website — milestone payment
  (gen_random_uuid(), p_north_web, NULL, NULL, NULL,
   '2025-09-01', 4500, 4500, 'paid', 100,
   'NorthStar — 50% milestone payment on project delivery.'),

  -- Infra cost (Hetzner)
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-09-01', -280, -280, 'cost', 100,
   'Hetzner VPS fleet — Sep 2025.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-09-01', -90, -90, 'cost', 100,
   'Adobe Creative Cloud team plan — Sep 2025.'),


  -- ── OCTOBER 2025 ───────────────────────────────────────

  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2025-10-01', 450, 450, 'paid', 100,
   'Verde maintenance Oct.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2025-10-01', 1800, 1800, 'paid', 100,
   'Pulse retainer Oct — full 20 hrs logged.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2025-10-01', 320, 320, 'paid', 100,
   'Aurora care plan Oct.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2025-10-01', 120, 120, 'paid', 100, 'Apex hosting Oct.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2025-10-01', 220, 220, 'paid', 100, 'Pulse hosting Oct.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2025-10-01', 95, 95, 'paid', 100, 'Cinema hosting Oct.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2025-10-01', 60, 60, 'paid', 100, 'Aurora hosting Oct.'),

  -- Aurora brand final invoice
  (gen_random_uuid(), p_aurora_brand, NULL, NULL, NULL,
   '2025-10-01', 7800, 7800, 'paid', 100,
   'Aurora Wellness brand & packaging — final invoice. Project complete.'),

  -- NorthStar final invoice (balance + CR)
  (gen_random_uuid(), p_north_web, NULL, NULL, NULL,
   '2025-10-01', 10000, 10000, 'paid', 100,
   'NorthStar website — final balance payment including fleet tracking CR.'),

  -- Costs
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-10-01', -280, -280, 'cost', 100, 'Hetzner Oct.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-10-01', -90, -90, 'cost', 100, 'Adobe CC Oct.'),


  -- ── NOVEMBER 2025 ──────────────────────────────────────

  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2025-11-01', 450, 450, 'paid', 100, 'Verde maintenance Nov.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2025-11-01', 1800, 1800, 'paid', 100, 'Pulse retainer Nov.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2025-11-01', 320, 320, 'paid', 100, 'Aurora care plan Nov.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2025-11-01', 120, 120, 'paid', 100, 'Apex hosting Nov.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2025-11-01', 220, 220, 'paid', 100, 'Pulse hosting Nov.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2025-11-01', 95, 95, 'paid', 100, 'Cinema hosting Nov.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2025-11-01', 60, 60, 'paid', 100, 'Aurora hosting Nov.'),

  -- Bloom brand final invoice
  (gen_random_uuid(), p_bloom_brand, NULL, NULL, NULL,
   '2025-11-01', 6200, 6200, 'paid', 100,
   'Bloom & Co visual identity — final invoice.'),

  -- Pulse Q4 campaign final
  (gen_random_uuid(), p_pulse_camp, NULL, NULL, NULL,
   '2025-11-01', 9500, 9500, 'paid', 100,
   'Pulse Media Q4 digital campaign — project close.'),

  -- Costs
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-11-01', -280, -280, 'cost', 100, 'Hetzner Nov.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-11-01', -90, -90, 'cost', 100, 'Adobe CC Nov.'),


  -- ── DECEMBER 2025 ──────────────────────────────────────

  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2025-12-01', 450, 450, 'paid', 100, 'Verde maintenance Dec.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2025-12-01', 1800, 1560, 'paid', 100,
   'Pulse retainer Dec — slight underage, partial holiday month.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2025-12-01', 320, 320, 'paid', 100, 'Aurora care plan Dec.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2025-12-01', 120, 120, 'paid', 100, 'Apex hosting Dec.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2025-12-01', 220, 220, 'paid', 100, 'Pulse hosting Dec.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2025-12-01', 95, 95, 'paid', 100, 'Cinema hosting Dec.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2025-12-01', 60, 60, 'paid', 100, 'Aurora hosting Dec.'),

  -- Verde yearly hosting renewal
  (gen_random_uuid(), NULL, NULL, h_verde, NULL,
   '2025-12-01', 480, 480, 'paid', 100,
   'Verde Architects hosting yearly renewal. Kinsta annual plan.'),

  -- Apex maintenance (started Dec 2024, 9 months → started Mar 2025, adjust)
  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2025-12-01', 950, 950, 'paid', 100, 'Apex priority support Dec.'),

  -- Solaris brand — Phase 1 deposit
  (gen_random_uuid(), p_solaris_web, NULL, NULL, NULL,
   '2025-12-01', 8000, 8000, 'paid', 100,
   'Solaris Energy — 40% deposit on brand & website project.'),

  -- Costs
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-12-01', -280, -280, 'cost', 100, 'Hetzner Dec.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-12-01', -90, -90, 'cost', 100, 'Adobe CC Dec.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-12-01', -22, -22, 'cost', 100, 'Cloudflare Pro Dec.'),


  -- ── JANUARY 2026 ───────────────────────────────────────

  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2026-01-01', 950, 950, 'paid', 100, 'Apex priority support Jan.'),
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2026-01-01', 450, 450, 'paid', 100, 'Verde maintenance Jan.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2026-01-01', 1800, 1800, 'paid', 100, 'Pulse retainer Jan — full month.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2026-01-01', 320, 320, 'paid', 100, 'Aurora care plan Jan.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2026-01-01', 120, 120, 'paid', 100, 'Apex hosting Jan.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2026-01-01', 220, 220, 'paid', 100, 'Pulse hosting Jan.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2026-01-01', 95, 95, 'paid', 100, 'Cinema hosting Jan.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2026-01-01', 60, 60, 'paid', 100, 'Aurora hosting Jan.'),
  (gen_random_uuid(), NULL, NULL, h_bloom, NULL,
   '2026-01-01', 80, 80, 'paid', 100, 'Bloom hosting Jan.'),

  -- Cinematic Studio — Phase 2 payment
  (gen_random_uuid(), p_cinematic_web, NULL, NULL, NULL,
   '2026-01-01', 4600, 4600, 'paid', 100,
   'Cinematic Studio website — Phase 2 milestone (50%). Client login area delivered.'),

  -- Bloom e-commerce website — milestone 1
  (gen_random_uuid(), p_bloom_web, NULL, NULL, NULL,
   '2026-01-01', 7000, 7000, 'paid', 100,
   'Bloom & Co e-commerce — 40% deposit on project kick-off.'),

  -- Solaris Phase 2 milestone
  (gen_random_uuid(), p_solaris_web, NULL, NULL, NULL,
   '2026-01-01', 8000, 8000, 'paid', 100,
   'Solaris Energy — 40% Phase 2 payment (brand system delivered).'),

  -- Costs
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-01-01', -280, -280, 'cost', 100, 'Hetzner Jan.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-01-01', -90, -90, 'cost', 100, 'Adobe CC Jan.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-01-01', -22, -22, 'cost', 100, 'Cloudflare Pro Jan.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-01-01', -40, -40, 'cost', 100, 'Kinsta Jan.'),


  -- ── FEBRUARY 2026 ──────────────────────────────────────

  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2026-02-01', 950, 950, 'paid', 100, 'Apex priority support Feb.'),
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2026-02-01', 450, 450, 'paid', 100, 'Verde maintenance Feb.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2026-02-01', 1800, 1800, 'paid', 100, 'Pulse retainer Feb.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2026-02-01', 320, 320, 'paid', 100, 'Aurora care plan Feb.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2026-02-01', 120, 120, 'paid', 100, 'Apex hosting Feb.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2026-02-01', 220, 220, 'paid', 100, 'Pulse hosting Feb.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2026-02-01', 95, 95, 'paid', 100, 'Cinema hosting Feb.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2026-02-01', 60, 60, 'paid', 100, 'Aurora hosting Feb.'),
  (gen_random_uuid(), NULL, NULL, h_bloom, NULL,
   '2026-02-01', 80, 80, 'paid', 100, 'Bloom hosting Feb.'),

  -- Cinematic final invoice
  (gen_random_uuid(), p_cinematic_web, NULL, NULL, NULL,
   '2026-02-01', 4600, 4600, 'paid', 100,
   'Cinematic Studio — final 50% payment. Site live.'),

  -- Apex maintenance start (Mar 2025 → billing history, now catching up)
  -- m_cinema start Feb 2026 — already seeded from March, skip

  -- NorthStar yearly hosting renewal (Dec)
  (gen_random_uuid(), NULL, NULL, h_north, NULL,
   '2026-02-01', 360, 360, 'paid', 100,
   'NorthStar yearly hosting — annual renewal due Dec, invoiced Feb.'),

  -- Bloom milestone 2
  (gen_random_uuid(), p_bloom_web, NULL, NULL, NULL,
   '2026-02-01', 7000, 7000, 'paid', 100,
   'Bloom & Co e-commerce — 40% Phase 2 (design complete, dev started).'),

  -- Costs
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-02-01', -280, -280, 'cost', 100, 'Hetzner Feb.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-02-01', -90, -90, 'cost', 100, 'Adobe CC Feb.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-02-01', -22, -22, 'cost', 100, 'Cloudflare Pro Feb.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-02-01', -40, -40, 'cost', 100, 'Kinsta Feb.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-02-01', -18, -18, 'cost', 100, 'Bunny CDN Feb.'),


  -- ── MARCH 2026 (current month, mix of issued/planned) ──

  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2026-03-01', 950, 950, 'issued', 100,
   'Apex support Mar — invoice issued, awaiting payment.'),
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2026-03-01', 450, 450, 'issued', 100,
   'Verde maintenance Mar — invoice issued.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2026-03-01', 1800, NULL, 'retainer', 100,
   'Pulse retainer Mar — in progress, to invoice at month-end.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2026-03-01', 320, NULL, 'retainer', 100,
   'Aurora care plan Mar.'),
  (gen_random_uuid(), NULL, m_cinema, NULL, NULL,
   '2026-03-01', 480, NULL, 'retainer', 100,
   'Cinematic content plan Mar — first month active.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2026-03-01', 120, NULL, 'planned', 100, 'Apex hosting Mar.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2026-03-01', 220, NULL, 'planned', 100, 'Pulse hosting Mar.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2026-03-01', 95, NULL, 'planned', 100, 'Cinema hosting Mar.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2026-03-01', 60, NULL, 'planned', 100, 'Aurora hosting Mar.'),
  (gen_random_uuid(), NULL, NULL, h_bloom, NULL,
   '2026-03-01', 80, NULL, 'planned', 100, 'Bloom hosting Mar.'),

  -- Bloom final milestone
  (gen_random_uuid(), p_bloom_web, NULL, NULL, NULL,
   '2026-03-01', 3500, NULL, 'issued', 100,
   'Bloom & Co — penultimate milestone issued. Shopify theme QA complete.'),

  -- Pulse extra sprint CR
  (gen_random_uuid(), p_pulse_maint, NULL, NULL, NULL,
   '2026-03-01', 2400, NULL, 'planned', 100,
   'Pulse Q1 campaign extra sprint (approved CR). To invoice end of March.'),

  -- Solaris — in-flight milestone (Phase 3 website dev)
  (gen_random_uuid(), p_solaris_web, NULL, NULL, NULL,
   '2026-03-01', 6000, NULL, 'planned', 100,
   'Solaris — Phase 3 website dev milestone (scheduled Mar delivery).'),

  -- Costs
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-03-01', -280, NULL, 'cost', 100, 'Hetzner Mar.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-03-01', -90, NULL, 'cost', 100, 'Adobe CC Mar.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-03-01', -22, NULL, 'cost', 100, 'Cloudflare Pro Mar.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-03-01', -40, NULL, 'cost', 100, 'Kinsta Mar.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-03-01', -18, NULL, 'cost', 100, 'Bunny CDN Mar.'),


  -- ── APRIL 2026 ─────────────────────────────────────────

  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2026-04-01', 950, NULL, 'planned', 100, 'Apex support Apr.'),
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2026-04-01', 450, NULL, 'planned', 100, 'Verde maintenance Apr.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2026-04-01', 1800, NULL, 'planned', 100, 'Pulse retainer Apr.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2026-04-01', 320, NULL, 'planned', 100, 'Aurora care plan Apr.'),
  (gen_random_uuid(), NULL, m_cinema, NULL, NULL,
   '2026-04-01', 480, NULL, 'planned', 100, 'Cinematic content plan Apr.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2026-04-01', 120, NULL, 'planned', 100, 'Apex hosting Apr.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2026-04-01', 220, NULL, 'planned', 100, 'Pulse hosting Apr.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2026-04-01', 95, NULL, 'planned', 100, 'Cinema hosting Apr.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2026-04-01', 60, NULL, 'planned', 100, 'Aurora hosting Apr.'),
  (gen_random_uuid(), NULL, NULL, h_bloom, NULL,
   '2026-04-01', 80, NULL, 'planned', 100, 'Bloom hosting Apr.'),

  -- Bloom final invoice (20% balance + approved CR)
  (gen_random_uuid(), p_bloom_web, NULL, NULL, NULL,
   '2026-04-01', 5000, NULL, 'planned', 100,
   'Bloom & Co — final 20% + Instagram feed CR (2500 EUR approved). Site live.'),

  -- Solaris investor portal (approved CR Phase 3)
  (gen_random_uuid(), p_solaris_web, NULL, NULL, NULL,
   '2026-04-01', 5500, NULL, 'planned', 100,
   'Solaris investor portal CR — approved, Phase 3 delivery Apr.'),

  -- Verde domain renewal
  (gen_random_uuid(), NULL, NULL, NULL, dom_verde1,
   '2026-04-01', 20, NULL, 'planned', 100,
   'Verde Architects .eu domain yearly renewal.'),

  -- Aurora domain renewal
  (gen_random_uuid(), NULL, NULL, NULL, dom_aurora2,
   '2026-04-01', 18, NULL, 'planned', 100,
   'Aurora-wellness.com domain renewal.'),

  -- Costs
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-04-01', -280, NULL, 'cost', 100, 'Hetzner Apr.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-04-01', -90, NULL, 'cost', 100, 'Adobe CC Apr.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-04-01', -22, NULL, 'cost', 100, 'Cloudflare Pro Apr.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-04-01', -40, NULL, 'cost', 100, 'Kinsta Apr.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-04-01', -18, NULL, 'cost', 100, 'Bunny CDN Apr.'),


  -- ── MAY 2026 ───────────────────────────────────────────

  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2026-05-01', 950, NULL, 'planned', 100, 'Apex support May.'),
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2026-05-01', 450, NULL, 'planned', 100, 'Verde maintenance May.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2026-05-01', 1800, NULL, 'planned', 100, 'Pulse retainer May.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2026-05-01', 320, NULL, 'planned', 100, 'Aurora care plan May.'),
  (gen_random_uuid(), NULL, m_cinema, NULL, NULL,
   '2026-05-01', 480, NULL, 'planned', 100, 'Cinematic content plan May.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2026-05-01', 120, NULL, 'planned', 100, 'Apex hosting May.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2026-05-01', 220, NULL, 'planned', 100, 'Pulse hosting May.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2026-05-01', 95, NULL, 'planned', 100, 'Cinema hosting May.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2026-05-01', 60, NULL, 'planned', 100, 'Aurora hosting May.'),
  (gen_random_uuid(), NULL, NULL, h_bloom, NULL,
   '2026-05-01', 80, NULL, 'planned', 100, 'Bloom hosting May.'),

  -- Bloom Instagram CR
  (gen_random_uuid(), p_bloom_web, NULL, NULL, NULL,
   '2026-05-01', 2500, NULL, 'planned', 100,
   'Bloom — Instagram feed CR invoice (standalone delivery May).'),

  -- Solaris launch campaign — 50% deposit
  (gen_random_uuid(), p_solaris_camp, NULL, NULL, NULL,
   '2026-05-01', 5750, NULL, 'planned', 100,
   'Solaris Energy launch campaign — 50% deposit on project start.'),

  -- Verde domain (verde.it renewal)
  (gen_random_uuid(), NULL, NULL, NULL, dom_verde2,
   '2026-05-01', 12, NULL, 'planned', 100,
   'Verde Architects .it domain renewal (if client confirms).'),

  -- Costs
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-05-01', -280, NULL, 'cost', 100, 'Hetzner May.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-05-01', -90, NULL, 'cost', 100, 'Adobe CC May.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-05-01', -22, NULL, 'cost', 100, 'Cloudflare Pro May.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-05-01', -40, NULL, 'cost', 100, 'Kinsta May.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-05-01', -18, NULL, 'cost', 100, 'Bunny CDN May.'),


  -- ── JUNE 2026 ──────────────────────────────────────────

  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2026-06-01', 950, NULL, 'planned', 100, 'Apex support Jun.'),
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2026-06-01', 450, NULL, 'planned', 100, 'Verde maintenance Jun.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2026-06-01', 1800, NULL, 'planned', 100, 'Pulse retainer Jun.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2026-06-01', 320, NULL, 'planned', 100, 'Aurora care plan Jun.'),
  (gen_random_uuid(), NULL, m_cinema, NULL, NULL,
   '2026-06-01', 480, NULL, 'planned', 100, 'Cinematic content plan Jun.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2026-06-01', 120, NULL, 'planned', 100, 'Apex hosting Jun.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2026-06-01', 220, NULL, 'planned', 100, 'Pulse hosting Jun.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2026-06-01', 95, NULL, 'planned', 100, 'Cinema hosting Jun.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2026-06-01', 60, NULL, 'planned', 100, 'Aurora hosting Jun.'),
  (gen_random_uuid(), NULL, NULL, h_bloom, NULL,
   '2026-06-01', 80, NULL, 'planned', 100, 'Bloom hosting Jun.'),

  -- Solaris hosting online
  (gen_random_uuid(), NULL, NULL, h_solaris, NULL,
   '2026-06-01', 280, NULL, 'planned', 100,
   'Solaris dedicated server — provisioned early for go-live prep.'),

  -- Bloom maintenance starts (post go-live)
  (gen_random_uuid(), NULL, NULL, h_bloom, NULL,
   '2026-06-01', 80, NULL, 'planned', 100, 'Bloom hosting Jun ongoing.'),

  -- Apex domain renewal
  (gen_random_uuid(), NULL, NULL, NULL, dom_apex1,
   '2026-06-01', 18, NULL, 'planned', 100,
   'Apex Digital .io domain renewal — yearly.'),

  -- Costs
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-06-01', -280, NULL, 'cost', 100, 'Hetzner Jun.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-06-01', -90, NULL, 'cost', 100, 'Adobe CC Jun.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-06-01', -22, NULL, 'cost', 100, 'Cloudflare Pro Jun.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-06-01', -40, NULL, 'cost', 100, 'Kinsta Jun.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-06-01', -18, NULL, 'cost', 100, 'Bunny CDN Jun.'),


  -- ── JULY 2026 ──────────────────────────────────────────

  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2026-07-01', 950, NULL, 'planned', 100, 'Apex support Jul.'),
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2026-07-01', 450, NULL, 'planned', 100, 'Verde maintenance Jul.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2026-07-01', 1800, NULL, 'planned', 100, 'Pulse retainer Jul.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2026-07-01', 320, NULL, 'planned', 100, 'Aurora care plan Jul.'),
  (gen_random_uuid(), NULL, m_cinema, NULL, NULL,
   '2026-07-01', 480, NULL, 'planned', 100, 'Cinematic content plan Jul.'),
  (gen_random_uuid(), NULL, m_solaris, NULL, NULL,
   '2026-07-01', 600, NULL, 'planned', 100,
   'Solaris hosting plan — pre-launch month, server warm-up.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2026-07-01', 120, NULL, 'planned', 100, 'Apex hosting Jul.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2026-07-01', 220, NULL, 'planned', 100, 'Pulse hosting Jul.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2026-07-01', 95, NULL, 'planned', 100, 'Cinema hosting Jul.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2026-07-01', 60, NULL, 'planned', 100, 'Aurora hosting Jul.'),
  (gen_random_uuid(), NULL, NULL, h_bloom, NULL,
   '2026-07-01', 80, NULL, 'planned', 100, 'Bloom hosting Jul.'),

  -- Solaris ROI calculator CR (if approved)
  (gen_random_uuid(), p_solaris_web, NULL, NULL, NULL,
   '2026-07-01', 4000, NULL, 'planned', 75,
   'Solaris ROI calculator CR — pending approval, 75% probability.'),

  -- Solaris launch campaign final
  (gen_random_uuid(), p_solaris_camp, NULL, NULL, NULL,
   '2026-07-01', 5750, NULL, 'planned', 100,
   'Solaris launch campaign — 50% balance, post-delivery.'),

  -- Costs
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-07-01', -280, NULL, 'cost', 100, 'Hetzner Jul.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-07-01', -90, NULL, 'cost', 100, 'Adobe CC Jul.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-07-01', -22, NULL, 'cost', 100, 'Cloudflare Pro Jul.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-07-01', -40, NULL, 'cost', 100, 'Kinsta Jul.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-07-01', -18, NULL, 'cost', 100, 'Bunny CDN Jul.'),


  -- ── AUGUST 2026 ────────────────────────────────────────

  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2026-08-01', 950, NULL, 'planned', 100, 'Apex support Aug.'),
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2026-08-01', 450, NULL, 'planned', 100, 'Verde maintenance Aug.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2026-08-01', 1800, NULL, 'planned', 100, 'Pulse retainer Aug.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2026-08-01', 320, NULL, 'planned', 100, 'Aurora care plan Aug.'),
  (gen_random_uuid(), NULL, m_cinema, NULL, NULL,
   '2026-08-01', 480, NULL, 'planned', 100, 'Cinematic content plan Aug.'),
  (gen_random_uuid(), NULL, m_solaris, NULL, NULL,
   '2026-08-01', 600, NULL, 'planned', 100, 'Solaris hosting Aug.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2026-08-01', 120, NULL, 'planned', 100, 'Apex hosting Aug.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2026-08-01', 220, NULL, 'planned', 100, 'Pulse hosting Aug.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2026-08-01', 95, NULL, 'planned', 100, 'Cinema hosting Aug.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2026-08-01', 60, NULL, 'planned', 100, 'Aurora hosting Aug.'),
  (gen_random_uuid(), NULL, NULL, h_bloom, NULL,
   '2026-08-01', 80, NULL, 'planned', 100, 'Bloom hosting Aug.'),
  (gen_random_uuid(), NULL, NULL, h_solaris, NULL,
   '2026-08-01', 280, NULL, 'planned', 100, 'Solaris server Aug.'),

  -- Solaris website final balance
  (gen_random_uuid(), p_solaris_web, NULL, NULL, NULL,
   '2026-08-01', 6500, NULL, 'planned', 100,
   'Solaris Energy — final 20% website balance on go-live + investor portal.'),

  -- Costs
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-08-01', -280, NULL, 'cost', 100, 'Hetzner Aug.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-08-01', -90, NULL, 'cost', 100, 'Adobe CC Aug.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-08-01', -22, NULL, 'cost', 100, 'Cloudflare Pro Aug.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-08-01', -40, NULL, 'cost', 100, 'Kinsta Aug.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-08-01', -18, NULL, 'cost', 100, 'Bunny CDN Aug.')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  9. PIPELINE ITEMS
-- ============================================================

INSERT INTO pipeline_items (id, client_id, company_name, title, description,
                             estimated_amount, probability, deal_type,
                             expected_month, expected_end_month,
                             status, notes, created_at)
VALUES
  -- Apex Digital — ongoing retainer extension upsell
  (
    gen_random_uuid(), c_apex, NULL,
    'Apex Digital — App UX Redesign',
    'Full UX/UI redesign of the SaaS dashboard. Discovery completed, proposal sent.',
    18000, 75, 'fixed',
    '2026-04-01', '2026-08-01',
    'proposal',
    'CTO is the decision maker. Demo booked 20 Mar.',
    '2026-02-10'
  ),

  -- Bloom & Co — brand extension
  (
    gen_random_uuid(), c_bloom, NULL,
    'Bloom & Co — SS27 Campaign Production',
    'Full photo and video content production for SS27 collection launch.',
    12000, 50, 'one_time',
    '2026-09-01', NULL,
    'proposal',
    'Preliminary discussion. Chiara interested but budget not confirmed.',
    '2026-03-01'
  ),

  -- Verde Architects — new microsite
  (
    gen_random_uuid(), c_verde, NULL,
    'Verde Architects — Projects Microsite',
    'Standalone microsite for their award-winning residential projects portfolio.',
    8500, 75, 'fixed',
    '2026-05-01', '2026-07-01',
    'proposal',
    'Marco very keen. Contract draft sent.',
    '2026-02-20'
  ),

  -- NorthStar — fleet management portal
  (
    gen_random_uuid(), c_northstar, NULL,
    'NorthStar — Driver Portal App (Phase 2)',
    'Mobile-first web app for drivers: route planning, time tracking, incident reporting.',
    32000, 50, 'fixed',
    '2026-07-01', '2026-12-01',
    'proposal',
    'Big scope. Phase 1 (website) delivered successfully, client happy. Formal brief expected Q2.',
    '2026-03-05'
  ),

  -- Solaris — new prospect upsell
  (
    gen_random_uuid(), c_solaris, NULL,
    'Solaris Energy — Investor App MVP',
    'React Native MVP for investor portfolio tracking linked to solar farm performance data.',
    45000, 25, 'fixed',
    '2026-10-01', '2027-04-01',
    'proposal',
    'Very early stage. Antonio mentioned it at last meeting. High upside if funded.',
    '2026-03-10'
  ),

  -- New prospect (not yet a client)
  (
    gen_random_uuid(), NULL, 'Ferro & Fiamma',
    'Ferro & Fiamma — Restaurant Brand & Website',
    'Full brand identity and website for a new upscale restaurant in Milan. Opening Oct 2026.',
    9500, 90, 'fixed',
    '2026-05-01', '2026-08-01',
    'proposal',
    'Referred by Bloom & Co. Meeting held 12 Mar. High confidence.',
    '2026-03-12'
  ),

  -- Another new prospect
  (
    gen_random_uuid(), NULL, 'Lumina Optics',
    'Lumina Optics — E-commerce Redesign',
    'Full Shopify redesign for optical eyewear brand. 200+ SKUs, B2C.',
    16000, 50, 'one_time',
    '2026-06-01', NULL,
    'proposal',
    'Inbound lead via website. Discovery call scheduled 25 Mar.',
    '2026-03-08'
  ),

  -- Won deal (already captured)
  (
    gen_random_uuid(), c_cinematic, NULL,
    'Cinematic Studio — BTS Documentary Microsite',
    'Dedicated microsite for behind-the-scenes documentary release.',
    6200, 100, 'fixed',
    '2026-04-01', '2026-06-01',
    'won',
    'Contract signed 5 Mar. Project kicks off 1 Apr.',
    '2026-02-15'
  )
ON CONFLICT (id) DO NOTHING;


END $$;
