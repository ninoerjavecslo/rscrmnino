-- Agency Intelligence OS — Demo Data Seed v2
-- Date context: today = 2026-04-25 (April = current month)
-- Run this in Supabase SQL editor on a clean/demo database.
-- Rollback: run demo-seed-rollback.sql

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
  p_bloom_app     uuid := 'b1000000-0000-0000-0000-000000000017'; -- paused
  p_north_portal  uuid := 'b1000000-0000-0000-0000-000000000018'; -- cancelled
  p_internal      uuid := 'b1000000-0000-0000-0000-000000000019'; -- internal

  -- ── MAINTENANCE IDs ──────────────────────────────────────────
  m_apex    uuid := 'c1000000-0000-0000-0000-000000000001';
  m_verde   uuid := 'c1000000-0000-0000-0000-000000000002';
  m_pulse   uuid := 'c1000000-0000-0000-0000-000000000003';
  m_aurora  uuid := 'c1000000-0000-0000-0000-000000000004';
  m_solaris uuid := 'c1000000-0000-0000-0000-000000000005';
  m_cinema  uuid := 'c1000000-0000-0000-0000-000000000006';
  m_north   uuid := 'c1000000-0000-0000-0000-000000000007'; -- cancelled

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

BEGIN


-- ============================================================
--  1. CLIENTS
-- ============================================================

INSERT INTO clients (id, name, email, phone, address, vat_id,
                     contact_person, contact_email, contact_phone,
                     notes, created_at, updated_at)
VALUES
  (c_apex, 'Apex Digital', 'hello@apexdigital.io', '+39 02 8765 4321',
   'Via della Innovazione 12, 20121 Milano MI', 'IT04512378901',
   'Lorenzo Ferretti', 'l.ferretti@apexdigital.io', '+39 348 123 4567',
   'Fast-growing SaaS startup. Very responsive team. Decision maker is Lorenzo.',
   now() - interval '18 months', now() - interval '2 weeks'),

  (c_bloom, 'Bloom & Co', 'studio@bloomandco.it', '+39 055 234 5678',
   'Via dei Servi 44, 50122 Firenze FI', 'IT03298765401',
   'Chiara Mancini', 'chiara@bloomandco.it', '+39 339 876 5432',
   'Fashion and lifestyle brand. Great client for creative projects. Pays on time.',
   now() - interval '14 months', now() - interval '1 month'),

  (c_verde, 'Verde Architects', 'info@verdearchitects.eu', '+39 06 5544 3322',
   'Via Giulia 78, 00186 Roma RM', 'IT02156789012',
   'Marco Rinaldi', 'm.rinaldi@verdearchitects.eu', '+39 335 567 8901',
   'Architecture studio with international projects. Needs detailed invoicing.',
   now() - interval '22 months', now() - interval '3 weeks'),

  (c_pulse, 'Pulse Media Group', 'contracts@pulsemedia.it', '+39 02 3456 7890',
   'Corso Buenos Aires 18, 20124 Milano MI', 'IT05678901234',
   'Alessia Conti', 'a.conti@pulsemedia.it', '+39 347 234 5678',
   'Media company producing digital content. Monthly retainer active. Accounting email required.',
   now() - interval '20 months', now() - interval '1 week'),

  (c_northstar, 'NorthStar Logistics', 'admin@northstarlogistics.eu', '+39 011 765 4321',
   'Via Nizza 55, 10125 Torino TO', 'IT06789012345',
   'Davide Gallo', 'd.gallo@northstarlogistics.eu', '+39 320 345 6789',
   'Logistics and transport company. Conservative brand. Corporate website delivered.',
   now() - interval '12 months', now() - interval '2 months'),

  (c_aurora, 'Aurora Wellness', 'ciao@aurorawellness.it', '+39 02 1234 5678',
   'Via Brera 9, 20121 Milano MI', 'IT07890123456',
   'Sofia Greco', 'sofia@aurorawellness.it', '+39 331 456 7890',
   'Health & wellness brand. Visual identity complete. Now on maintenance.',
   now() - interval '10 months', now() - interval '3 weeks'),

  (c_solaris, 'Solaris Energy', 'info@solarisenergia.it', '+39 0805 567 890',
   'Via del Mare 103, 70126 Bari BA', 'IT08901234567',
   'Antonio Riva', 'a.riva@solarisenergia.it', '+39 360 567 8901',
   'Renewable energy startup backed by VC. Large budget. Potentially big pipeline.',
   now() - interval '6 months', now() - interval '1 week'),

  (c_cinematic, 'Cinematic Studio', 'hello@cinematicstudio.eu', '+39 02 9876 5432',
   'Via Savona 97, 20144 Milano MI', 'IT09012345678',
   'Elena Fontana', 'e.fontana@cinematicstudio.eu', '+39 340 678 9012',
   'Film production house. Portfolio site + maintenance. Creative direction needed.',
   now() - interval '8 months', now() - interval '1 month')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  2. PROJECTS — all types (fixed, variable, maintenance, internal)
--               all statuses (active, paused, completed, cancelled)
-- ============================================================

INSERT INTO projects (id, client_id, pn, name, type, status, pm,
                      contract_value, initial_contract_value, currency,
                      start_date, end_date, notes)
VALUES
  -- APEX DIGITAL
  (p_apex_brand, c_apex, 'RS-2024-001', 'Apex Digital — Brand Identity System',
   'fixed', 'completed', 'Nino', 8500, 8500, 'EUR',
   '2024-06-01', '2024-09-30',
   'Full brand identity: logo, typography, color system, brand guidelines PDF.'),
  (p_apex_web, c_apex, 'RS-2024-008', 'Apex Digital — Marketing Website',
   'fixed', 'completed', 'Nino', 18400, 16000, 'EUR',
   '2024-10-01', '2025-02-28',
   'Next.js marketing site with CMS. Contract grew due to two approved CRs.'),
  (p_apex_maint, c_apex, 'RS-2025-003', 'Apex Digital — Monthly Support',
   'maintenance', 'active', 'Nino', NULL, NULL, 'EUR',
   '2025-03-01', NULL,
   'Ongoing maintenance, hosting and technical support. Priority SLA.'),

  -- BLOOM & CO
  (p_bloom_brand, c_bloom, 'RS-2024-004', 'Bloom & Co — Visual Identity',
   'fixed', 'completed', 'Nino', 6200, 6200, 'EUR',
   '2024-09-01', '2024-11-30',
   'Logo redesign, packaging templates and brand guidelines for SS25 launch.'),
  (p_bloom_web, c_bloom, 'RS-2025-001', 'Bloom & Co — E-commerce Website',
   'fixed', 'active', 'Nino', 22000, 19500, 'EUR',
   '2025-01-15', '2026-04-30',
   'Shopify custom theme with editorial blog and lookbook. CR approved for Instagram feed.'),
  (p_bloom_app, c_bloom, 'RS-2025-009', 'Bloom & Co — Customer Loyalty App',
   'fixed', 'paused', 'Nino', 14000, 14000, 'EUR',
   '2025-08-01', NULL,
   'React Native loyalty app — paused after Phase 1 design. Client requested hold due to internal restructure.'),

  -- VERDE ARCHITECTS
  (p_verde_web, c_verde, 'RS-2023-011', 'Verde Architects — Portfolio Website',
   'fixed', 'completed', 'Nino', 12800, 12800, 'EUR',
   '2023-10-01', '2024-02-29',
   'Custom portfolio with project case studies and multilingual support (IT/EN).'),
  (p_verde_maint, c_verde, 'RS-2024-003', 'Verde Architects — Hosting & Maintenance',
   'maintenance', 'active', 'Nino', NULL, NULL, 'EUR',
   '2024-03-01', NULL,
   'Monthly maintenance, uptime monitoring, CMS updates.'),

  -- PULSE MEDIA GROUP
  (p_pulse_camp, c_pulse, 'RS-2024-006', 'Pulse Media — Digital Campaign Q4',
   'fixed', 'completed', 'Nino', 9500, 9500, 'EUR',
   '2024-09-15', '2024-12-15',
   'Social media campaign assets, motion graphics, paid ads creatives.'),
  (p_pulse_maint, c_pulse, 'RS-2025-002', 'Pulse Media — Retainer Dev',
   'variable', 'active', 'Nino', NULL, NULL, 'EUR',
   '2025-02-01', NULL,
   'Variable monthly hours for ongoing digital content production and web updates.'),

  -- NORTHSTAR LOGISTICS
  (p_north_web, c_northstar, 'RS-2024-009', 'NorthStar Logistics — Corporate Website',
   'fixed', 'completed', 'Nino', 14500, 13000, 'EUR',
   '2024-07-01', '2024-11-30',
   'Corporate website + fleet tracking portal design. CR approved for live tracking embed.'),
  (p_north_portal, c_northstar, 'RS-2025-008', 'NorthStar — Driver Self-Service Portal',
   'fixed', 'cancelled', 'Nino', 28000, 28000, 'EUR',
   '2025-06-01', NULL,
   'Cancelled after discovery phase. Client decided to use off-the-shelf TMS instead. Deposit retained.'),

  -- AURORA WELLNESS
  (p_aurora_brand, c_aurora, 'RS-2024-012', 'Aurora Wellness — Brand & Packaging',
   'fixed', 'completed', 'Nino', 7800, 7800, 'EUR',
   '2024-08-01', '2024-10-31',
   'Full brand identity, product packaging design for launch range of 6 SKUs.'),
  (p_aurora_maint, c_aurora, 'RS-2025-005', 'Aurora Wellness — Web Maintenance',
   'maintenance', 'active', 'Nino', NULL, NULL, 'EUR',
   '2025-02-01', NULL,
   'Monthly website support, newsletter design and social media templates.'),

  -- SOLARIS ENERGY
  (p_solaris_web, c_solaris, 'RS-2025-007', 'Solaris Energy — Website & Brand',
   'fixed', 'active', 'Nino', 28000, 24000, 'EUR',
   '2025-02-15', '2026-08-31',
   'Brand identity system + investor-grade website. Phased delivery. CR pending for ROI calculator.'),
  (p_solaris_camp, c_solaris, 'RS-2025-011', 'Solaris Energy — Launch Campaign',
   'fixed', 'active', 'Nino', 11500, 11500, 'EUR',
   '2026-05-01', '2026-09-30',
   'Product launch campaign: landing pages, social assets, email sequences.'),

  -- CINEMATIC STUDIO
  (p_cinematic_web, c_cinematic, 'RS-2024-014', 'Cinematic Studio — Portfolio & Showreel',
   'fixed', 'completed', 'Nino', 9200, 9200, 'EUR',
   '2024-11-01', '2025-02-28',
   'Portfolio site with full-screen video, case studies and client login area.'),
  (p_cinematic_mnt, c_cinematic, 'RS-2025-004', 'Cinematic Studio — Ongoing Support',
   'maintenance', 'active', 'Nino', NULL, NULL, 'EUR',
   '2025-03-01', NULL,
   'Monthly hosting, updates and seasonal content refreshes.'),

  -- INTERNAL
  (p_internal, NULL, 'RS-INT-001', 'Renderspace — Studio Operations & Tooling',
   'internal', 'active', 'Nino', NULL, NULL, 'EUR',
   '2025-01-01', NULL,
   'Internal project for studio infrastructure, tooling setup (Insighty), and process documentation.')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  3. CHANGE REQUESTS
-- ============================================================

INSERT INTO change_requests (id, project_id, title, description, status,
                              amount, probability, deal_type, expected_month, notes, created_at)
VALUES
  (gen_random_uuid(), p_apex_web,
   'Cookie consent banner + GDPR compliance module', 'Implement cookie consent management with granular consent options.',
   'billed', 1200, 100, 'one_time', '2025-01-01',
   'Approved Oct 2024. Delivered and billed in final invoice.', '2024-10-15'),

  (gen_random_uuid(), p_apex_web,
   'Multilingual support (EN/IT/DE)', 'Add full i18n support using next-intl.',
   'billed', 1200, 100, 'one_time', '2025-02-01',
   'Approved Dec 2024. Delivered Feb 2025.', '2024-12-01'),

  (gen_random_uuid(), p_bloom_web,
   'Instagram product feed integration', 'Embed live Instagram feed on homepage, synced with product catalog.',
   'approved', 2500, 100, 'one_time', '2026-04-01',
   'Client confirmed via email 14 Feb. Invoice to issue this month.', '2026-02-14'),

  (gen_random_uuid(), p_bloom_web,
   'Video background hero section', 'Full-width MP4 hero with autoplay + mobile fallback image.',
   'pending', 900, 75, 'one_time', '2026-05-01',
   'Under review. Client wants to see a demo first.', '2026-03-10'),

  (gen_random_uuid(), p_north_web,
   'Live fleet tracking embed (Mapbox)', 'Interactive Mapbox map showing live vehicle positions via API.',
   'billed', 1500, 100, 'one_time', '2024-11-01',
   'Approved and delivered in final sprint. Billed with project.', '2024-09-20'),

  (gen_random_uuid(), p_solaris_web,
   'Interactive solar ROI calculator', 'Custom React widget for investors to calculate projected returns.',
   'pending', 4000, 75, 'one_time', '2026-07-01',
   'Waiting on client sign-off. Technical spec sent 3 Mar.', '2026-03-03'),

  (gen_random_uuid(), p_solaris_web,
   'Investor portal — private document library', 'Secure login-gated area with downloadable reports and pitch deck.',
   'approved', 5500, 100, 'one_time', '2026-05-01',
   'Approved 10 Mar. Adds Phase 3 to project scope.', '2026-03-10'),

  (gen_random_uuid(), p_pulse_maint,
   'Q1 campaign — extra production sprint', '40 extra hours for social media content production.',
   'approved', 2400, 100, 'one_time', '2026-03-01',
   'Approved verbally, email confirmation received.', '2026-02-25'),

  (gen_random_uuid(), p_cinematic_web,
   'Behind-the-scenes blog + crew bios section', 'Editorial blog with tagging system, and dedicated crew profiles page.',
   'pending', 1800, 50, 'one_time', '2026-05-01',
   'Nice to have — client has budget but no final decision.', '2026-03-01'),

  (gen_random_uuid(), p_apex_maint,
   'Performance audit + Core Web Vitals sprint', 'Two-week sprint to optimise LCP/CLS/FID. Lighthouse target 90+.',
   'approved', 1600, 100, 'one_time', '2026-05-01',
   'Lorenzo confirmed. Scheduled for May.', '2026-04-10')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  4. MAINTENANCES
-- ============================================================

INSERT INTO maintenances (id, client_id, project_pn, name, monthly_retainer,
                          help_requests_included, hours_included,
                          contract_start, contract_end, status, notes, created_at)
VALUES
  (m_apex, c_apex, 'RS-2025-003', 'Apex Digital — Priority Support',
   950, 10, 8, '2025-03-01', NULL, 'active',
   'Priority 4-hour SLA. Covers hosting, monitoring, CMS, minor feature tweaks.',
   '2025-02-20'),

  (m_verde, c_verde, 'RS-2024-003', 'Verde Architects — Hosting & Maintenance',
   450, 5, 4, '2024-03-01', NULL, 'active',
   'Basic monthly plan: hosting, uptime monitoring, CMS updates.',
   '2024-02-25'),

  (m_pulse, c_pulse, 'RS-2025-002', 'Pulse Media — Dev Retainer',
   1800, 0, 20, '2025-02-01', '2027-01-31', 'active',
   '20 hrs/month variable dev. Invoiced at month-end based on usage. Max 1800 EUR/mo.',
   '2025-01-20'),

  (m_aurora, c_aurora, 'RS-2025-005', 'Aurora Wellness — Care Plan',
   320, 3, 3, '2025-02-01', NULL, 'active',
   'Lite plan: hosting, monthly newsletter template, minor tweaks.',
   '2025-01-28'),

  (m_solaris, c_solaris, 'RS-2025-007', 'Solaris Energy — Hosting Plan',
   600, 5, 5, '2026-09-01', NULL, 'active',
   'Starts when website goes live. Dedicated server + monitoring.',
   '2025-03-01'),

  (m_cinema, c_cinematic, 'RS-2025-004', 'Cinematic Studio — Content Plan',
   480, 4, 4, '2025-03-01', '2026-02-28', 'active',
   'Annual contract for hosting, updates and quarterly content refresh.',
   '2025-02-20'),

  (m_north, c_northstar, 'RS-2024-009', 'NorthStar Logistics — Basic Support',
   280, 3, 2, '2024-12-01', '2025-11-30', 'cancelled',
   'Basic annual plan — client did not renew after portal project was cancelled.',
   '2024-11-25')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  5. HOSTING CLIENTS
-- ============================================================

INSERT INTO hosting_clients (id, client_id, project_pn, description, cycle, amount,
                              billing_since, next_invoice_date, status,
                              maintenance_id, accounting_email, notes)
VALUES
  (h_apex, c_apex, 'RS-2025-003', 'VPS + CDN — Apex Digital app hosting',
   'monthly', 120, '2025-03-01', '2026-05-01', 'active', m_apex, true,
   'Hetzner VPS CX41, Cloudflare CDN, daily backups.'),

  (h_bloom, c_bloom, 'RS-2025-001', 'Shopify Plus hosting contribution',
   'monthly', 80, '2025-07-01', '2026-05-01', 'active', NULL, false,
   'Monthly pass-through for Shopify Plus plan.'),

  (h_verde, c_verde, 'RS-2024-003', 'WordPress hosting — Verde Architects',
   'yearly', 480, '2024-03-01', '2027-03-01', 'active', m_verde, true,
   'Managed WP hosting on Kinsta Starter. Renewal due March.'),

  (h_pulse, c_pulse, 'RS-2025-002', 'Media server & storage — Pulse',
   'monthly', 220, '2025-02-01', '2026-05-01', 'active', m_pulse, true,
   'Hetzner storage box 10TB + VPS for media delivery.'),

  (h_north, c_northstar, 'RS-2024-009', 'Corporate site hosting — NorthStar',
   'yearly', 360, '2024-12-01', '2025-12-01', 'active', NULL, false,
   'Basic VPS, SSL, automated backups. Annual plan renewed Dec 24.'),

  (h_aurora, c_aurora, 'RS-2025-005', 'WordPress hosting — Aurora Wellness',
   'monthly', 60, '2025-02-01', '2026-05-01', 'active', m_aurora, false,
   'Shared hosting SiteGround GrowBig. Includes daily backups.'),

  (h_solaris, c_solaris, 'RS-2025-007', 'Dedicated server — Solaris investor portal',
   'monthly', 280, '2026-09-01', '2026-09-01', 'active', m_solaris, true,
   'Hetzner dedicated AX41, 2x NVMe RAID. Goes live with website.'),

  (h_cinema, c_cinematic, 'RS-2025-004', 'Video portfolio hosting — Cinematic Studio',
   'monthly', 95, '2025-03-01', '2026-05-01', 'active', m_cinema, false,
   'VPS with Bunny CDN for video delivery. High bandwidth plan.')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  6. INFRASTRUCTURE COSTS
-- ============================================================

INSERT INTO infrastructure_costs (id, provider, description, monthly_cost,
                                   billing_cycle, status, notes)
VALUES
  (gen_random_uuid(), 'Hetzner Cloud',
   'Primary VPS fleet — 4x CX41 instances for client projects',
   280, 'monthly', 'active',
   'Covers Apex, Pulse, Cinematic, Solaris dev. Invoiced monthly in EUR.'),

  (gen_random_uuid(), 'Cloudflare Pro',
   'CDN, DDoS protection and DNS for all client domains',
   22, 'monthly', 'active',
   'Pro plan subscription. Covers unlimited domains.'),

  (gen_random_uuid(), 'Kinsta',
   'Managed WordPress hosting (Verde + overflow)',
   40, 'monthly', 'active',
   'Starter plan for Verde Architects. Billed in USD, EUR equivalent.'),

  (gen_random_uuid(), 'Bunny CDN',
   'Video and asset delivery for Cinematic Studio + Pulse',
   18, 'variable', 'active',
   'Pay-per-GB. Average ~18 EUR/mo based on last 3 months usage.'),

  (gen_random_uuid(), 'Adobe Creative Cloud',
   'Team plan — design tools for the studio',
   90, 'monthly', 'active',
   '3-seat Creative Cloud All Apps plan.'),

  (gen_random_uuid(), 'GitHub Teams',
   'Version control and CI/CD for all client repos',
   16, 'monthly', 'active',
   'Teams plan. 5 seats active.')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  7. DOMAINS
-- ============================================================

INSERT INTO domains (id, client_id, project_pn, domain_name,
                     registered_date, expiry_date, yearly_amount,
                     registrar, auto_renew, billable, accounting_email, notes)
VALUES
  (dom_apex1, c_apex, 'RS-2025-003', 'apexdigital.io',
   '2022-04-15', '2027-04-15', 18, 'Namecheap', true, true, true,
   'Primary domain. Auto-renew active.'),

  (dom_apex2, c_apex, 'RS-2025-003', 'apexdigital.eu',
   '2022-04-15', '2026-04-15', 12, 'Namecheap', false, true, false,
   'EU domain. Expiring soon — auto-renew disabled, check with client.'),

  (dom_bloom1, c_bloom, 'RS-2025-001', 'bloomandco.it',
   '2021-03-20', '2026-05-20', 15, 'Aruba', true, true, true,
   'Main domain. Auto-renew queued with registrar.'),

  (dom_verde1, c_verde, 'RS-2024-003', 'verdearchitects.eu',
   '2020-05-10', '2026-05-10', 20, 'GoDaddy', true, true, true,
   'Primary .eu domain.'),

  (dom_verde2, c_verde, 'RS-2024-003', 'verdearchitects.it',
   '2020-05-10', '2025-03-28', 12, 'GoDaddy', false, true, false,
   'Expired — client confirmed not renewing. Redirect to .eu.'),

  (dom_pulse1, c_pulse, 'RS-2025-002', 'pulsemedia.it',
   '2019-11-01', '2026-11-01', 15, 'Register.it', true, true, true,
   'Main domain. Billed annually with hosting invoice.'),

  (dom_north1, c_northstar, 'RS-2024-009', 'northstarlogistics.eu',
   '2021-02-14', '2025-02-14', 20, 'Namecheap', false, true, false,
   'EXPIRED: client chose not to renew. Domain dropped.'),

  (dom_aurora1, c_aurora, 'RS-2025-005', 'aurorawellness.it',
   '2022-06-01', '2026-06-01', 15, 'Aruba', true, true, false,
   'Primary domain.'),

  (dom_aurora2, c_aurora, 'RS-2025-005', 'aurora-wellness.com',
   '2022-06-01', '2026-06-01', 18, 'Namecheap', true, true, true,
   'Secondary .com redirect. Up for renewal June 2026.'),

  (dom_solaris1, c_solaris, 'RS-2025-007', 'solarisenergia.it',
   '2024-09-01', '2026-09-01', 15, 'Namecheap', true, true, true,
   'Registered Sep 2024. Long runway.'),

  (dom_cinema1, c_cinematic, 'RS-2025-004', 'cinematicstudio.eu',
   '2023-03-01', '2026-04-30', 20, 'Namecheap', true, true, false,
   'Expiring end of April — auto-renew queued.'),

  (dom_cinema2, c_cinematic, 'RS-2025-004', 'cinematicstudio.it',
   '2023-03-01', '2027-03-01', 15, 'Aruba', true, true, false,
   'Renewed March 2026. Good for 2 years.')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  8. REVENUE PLANNER  (Sep 2025 → Oct 2026)
--  April 2026 = current month
--  Past: Sep 2025 – Mar 2026 → status = 'paid'
--  Current: Apr 2026 → mix of 'issued' / 'retainer' / 'planned'
--  Future: May 2026 → Oct 2026 → 'planned'
-- ============================================================

INSERT INTO revenue_planner (id, project_id, maintenance_id, hosting_client_id, domain_id,
                              month, planned_amount, actual_amount,
                              status, probability, notes)
VALUES

  -- ── SEP 2025 ─────────────────────────────────────────────
  (gen_random_uuid(), p_apex_web, NULL, NULL, NULL,
   '2025-09-01', 6500, 6500, 'paid', 100, 'Apex website Phase 3 final payment.'),
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2025-09-01', 450, 450, 'paid', 100, 'Verde maintenance Sep.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2025-09-01', 1800, 1620, 'paid', 100, 'Pulse retainer Sep — 18 hrs logged.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2025-09-01', 320, 320, 'paid', 100, 'Aurora care plan Sep.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2025-09-01', 120, 120, 'paid', 100, 'Apex hosting Sep.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2025-09-01', 220, 220, 'paid', 100, 'Pulse hosting Sep.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2025-09-01', 95, 95, 'paid', 100, 'Cinema hosting Sep.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2025-09-01', 60, 60, 'paid', 100, 'Aurora hosting Sep.'),
  (gen_random_uuid(), p_north_web, NULL, NULL, NULL,
   '2025-09-01', 4500, 4500, 'paid', 100, 'NorthStar 50% milestone.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-09-01', -280, -280, 'cost', 100, 'Hetzner Sep.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-09-01', -90, -90, 'cost', 100, 'Adobe CC Sep.'),

  -- ── OCT 2025 ─────────────────────────────────────────────
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2025-10-01', 450, 450, 'paid', 100, 'Verde maintenance Oct.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2025-10-01', 1800, 1800, 'paid', 100, 'Pulse retainer Oct — full 20 hrs.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2025-10-01', 320, 320, 'paid', 100, 'Aurora care plan Oct.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2025-10-01', 120, 120, 'paid', 100, 'Apex hosting Oct.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2025-10-01', 220, 220, 'paid', 100, 'Pulse hosting Oct.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2025-10-01', 95, 95, 'paid', 100, 'Cinema hosting Oct.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2025-10-01', 60, 60, 'paid', 100, 'Aurora hosting Oct.'),
  (gen_random_uuid(), p_aurora_brand, NULL, NULL, NULL,
   '2025-10-01', 7800, 7800, 'paid', 100, 'Aurora brand & packaging final invoice.'),
  (gen_random_uuid(), p_north_web, NULL, NULL, NULL,
   '2025-10-01', 10000, 10000, 'paid', 100, 'NorthStar final balance + fleet tracking CR.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-10-01', -280, -280, 'cost', 100, 'Hetzner Oct.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-10-01', -90, -90, 'cost', 100, 'Adobe CC Oct.'),

  -- ── NOV 2025 ─────────────────────────────────────────────
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
  (gen_random_uuid(), p_bloom_brand, NULL, NULL, NULL,
   '2025-11-01', 6200, 6200, 'paid', 100, 'Bloom visual identity final invoice.'),
  (gen_random_uuid(), p_pulse_camp, NULL, NULL, NULL,
   '2025-11-01', 9500, 9500, 'paid', 100, 'Pulse Q4 digital campaign close.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-11-01', -280, -280, 'cost', 100, 'Hetzner Nov.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-11-01', -90, -90, 'cost', 100, 'Adobe CC Nov.'),

  -- ── DEC 2025 ─────────────────────────────────────────────
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2025-12-01', 450, 450, 'paid', 100, 'Verde maintenance Dec.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2025-12-01', 1800, 1560, 'paid', 100, 'Pulse retainer Dec — partial holiday month.'),
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
  (gen_random_uuid(), NULL, NULL, h_verde, NULL,
   '2025-12-01', 480, 480, 'paid', 100, 'Verde hosting yearly renewal.'),
  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2025-12-01', 950, 950, 'paid', 100, 'Apex priority support Dec.'),
  (gen_random_uuid(), p_solaris_web, NULL, NULL, NULL,
   '2025-12-01', 8000, 8000, 'paid', 100, 'Solaris 40% deposit on brand & website.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-12-01', -280, -280, 'cost', 100, 'Hetzner Dec.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-12-01', -90, -90, 'cost', 100, 'Adobe CC Dec.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2025-12-01', -22, -22, 'cost', 100, 'Cloudflare Pro Dec.'),

  -- ── JAN 2026 ─────────────────────────────────────────────
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
  (gen_random_uuid(), p_cinematic_web, NULL, NULL, NULL,
   '2026-01-01', 4600, 4600, 'paid', 100, 'Cinematic website Phase 2 milestone.'),
  (gen_random_uuid(), p_bloom_web, NULL, NULL, NULL,
   '2026-01-01', 7000, 7000, 'paid', 100, 'Bloom e-commerce 40% deposit.'),
  (gen_random_uuid(), p_solaris_web, NULL, NULL, NULL,
   '2026-01-01', 8000, 8000, 'paid', 100, 'Solaris 40% Phase 2 (brand system delivered).'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-01-01', -280, -280, 'cost', 100, 'Hetzner Jan.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-01-01', -90, -90, 'cost', 100, 'Adobe CC Jan.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-01-01', -22, -22, 'cost', 100, 'Cloudflare Pro Jan.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-01-01', -40, -40, 'cost', 100, 'Kinsta Jan.'),

  -- ── FEB 2026 ─────────────────────────────────────────────
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
  (gen_random_uuid(), p_cinematic_web, NULL, NULL, NULL,
   '2026-02-01', 4600, 4600, 'paid', 100, 'Cinematic website final 50%. Site live.'),
  (gen_random_uuid(), NULL, NULL, h_north, NULL,
   '2026-02-01', 360, 360, 'paid', 100, 'NorthStar yearly hosting renewal.'),
  (gen_random_uuid(), p_bloom_web, NULL, NULL, NULL,
   '2026-02-01', 7000, 7000, 'paid', 100, 'Bloom e-commerce Phase 2 (design complete).'),
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

  -- ── MAR 2026 ─────────────────────────────────────────────
  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2026-03-01', 950, 950, 'paid', 100, 'Apex support Mar.'),
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2026-03-01', 450, 450, 'paid', 100, 'Verde maintenance Mar.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2026-03-01', 1800, 1800, 'paid', 100, 'Pulse retainer Mar — 20 hrs logged.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2026-03-01', 320, 320, 'paid', 100, 'Aurora care plan Mar.'),
  (gen_random_uuid(), NULL, m_cinema, NULL, NULL,
   '2026-03-01', 480, 480, 'paid', 100, 'Cinematic content plan Mar.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2026-03-01', 120, 120, 'paid', 100, 'Apex hosting Mar.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2026-03-01', 220, 220, 'paid', 100, 'Pulse hosting Mar.'),
  (gen_random_uuid(), NULL, NULL, h_cinema, NULL,
   '2026-03-01', 95, 95, 'paid', 100, 'Cinema hosting Mar.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2026-03-01', 60, 60, 'paid', 100, 'Aurora hosting Mar.'),
  (gen_random_uuid(), NULL, NULL, h_bloom, NULL,
   '2026-03-01', 80, 80, 'paid', 100, 'Bloom hosting Mar.'),
  (gen_random_uuid(), p_bloom_web, NULL, NULL, NULL,
   '2026-03-01', 3500, 3500, 'paid', 100, 'Bloom penultimate milestone. Shopify QA complete.'),
  (gen_random_uuid(), p_pulse_maint, NULL, NULL, NULL,
   '2026-03-01', 2400, 2400, 'paid', 100, 'Pulse Q1 campaign extra sprint CR.'),
  (gen_random_uuid(), p_solaris_web, NULL, NULL, NULL,
   '2026-03-01', 6000, 6000, 'paid', 100, 'Solaris Phase 3 website dev milestone.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-03-01', -280, -280, 'cost', 100, 'Hetzner Mar.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-03-01', -90, -90, 'cost', 100, 'Adobe CC Mar.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-03-01', -22, -22, 'cost', 100, 'Cloudflare Pro Mar.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-03-01', -40, -40, 'cost', 100, 'Kinsta Mar.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-03-01', -18, -18, 'cost', 100, 'Bunny CDN Mar.'),

  -- ── APR 2026 — CURRENT MONTH ─────────────────────────────
  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2026-04-01', 950, 950, 'issued', 100, 'Apex support Apr — invoice issued, awaiting payment.'),
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2026-04-01', 450, 450, 'issued', 100, 'Verde maintenance Apr — invoice issued.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2026-04-01', 1800, NULL, 'retainer', 100, 'Pulse retainer Apr — in progress, invoice at month-end.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2026-04-01', 320, NULL, 'retainer', 100, 'Aurora care plan Apr.'),
  (gen_random_uuid(), NULL, m_cinema, NULL, NULL,
   '2026-04-01', 480, NULL, 'retainer', 100, 'Cinematic content plan Apr.'),
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
  (gen_random_uuid(), p_bloom_web, NULL, NULL, NULL,
   '2026-04-01', 5000, NULL, 'issued', 100, 'Bloom final 20% + Instagram feed CR (2500 EUR). Site live.'),
  (gen_random_uuid(), p_solaris_web, NULL, NULL, NULL,
   '2026-04-01', 5500, NULL, 'issued', 100, 'Solaris investor portal CR — Phase 3 delivery.'),
  (gen_random_uuid(), NULL, NULL, NULL, dom_verde1,
   '2026-04-01', 20, NULL, 'planned', 100, 'Verde .eu domain yearly renewal.'),
  (gen_random_uuid(), NULL, NULL, NULL, dom_aurora2,
   '2026-04-01', 18, NULL, 'planned', 100, 'Aurora-wellness.com domain renewal.'),
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
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-04-01', -16, NULL, 'cost', 100, 'GitHub Teams Apr.'),

  -- ── MAY 2026 ─────────────────────────────────────────────
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
  (gen_random_uuid(), p_solaris_camp, NULL, NULL, NULL,
   '2026-05-01', 5750, NULL, 'planned', 100, 'Solaris launch campaign 50% deposit.'),
  (gen_random_uuid(), p_apex_maint, NULL, NULL, NULL,
   '2026-05-01', 1600, NULL, 'planned', 100, 'Apex Core Web Vitals sprint CR.'),
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

  -- ── JUN 2026 ─────────────────────────────────────────────
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
  (gen_random_uuid(), NULL, NULL, h_solaris, NULL,
   '2026-06-01', 280, NULL, 'planned', 100, 'Solaris dedicated server provisioned for go-live prep.'),
  (gen_random_uuid(), NULL, NULL, NULL, dom_apex1,
   '2026-06-01', 18, NULL, 'planned', 100, 'Apex .io domain yearly renewal.'),
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

  -- ── JUL 2026 ─────────────────────────────────────────────
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
   '2026-07-01', 600, NULL, 'planned', 100, 'Solaris hosting plan pre-launch.'),
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
  (gen_random_uuid(), NULL, NULL, h_solaris, NULL,
   '2026-07-01', 280, NULL, 'planned', 100, 'Solaris server Jul.'),
  (gen_random_uuid(), p_solaris_web, NULL, NULL, NULL,
   '2026-07-01', 4000, NULL, 'planned', 75, 'Solaris ROI calculator CR — 75% probability.'),
  (gen_random_uuid(), p_solaris_camp, NULL, NULL, NULL,
   '2026-07-01', 5750, NULL, 'planned', 100, 'Solaris launch campaign 50% balance.'),
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

  -- ── AUG 2026 ─────────────────────────────────────────────
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
  (gen_random_uuid(), p_solaris_web, NULL, NULL, NULL,
   '2026-08-01', 6500, NULL, 'planned', 100, 'Solaris final 20% website balance on go-live.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-08-01', -280, NULL, 'cost', 100, 'Hetzner Aug.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-08-01', -90, NULL, 'cost', 100, 'Adobe CC Aug.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-08-01', -22, NULL, 'cost', 100, 'Cloudflare Pro Aug.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-08-01', -40, NULL, 'cost', 100, 'Kinsta Aug.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-08-01', -18, NULL, 'cost', 100, 'Bunny CDN Aug.'),

  -- ── SEP 2026 ─────────────────────────────────────────────
  (gen_random_uuid(), NULL, m_apex, NULL, NULL,
   '2026-09-01', 950, NULL, 'planned', 100, 'Apex support Sep.'),
  (gen_random_uuid(), NULL, m_verde, NULL, NULL,
   '2026-09-01', 450, NULL, 'planned', 100, 'Verde maintenance Sep.'),
  (gen_random_uuid(), NULL, m_pulse, NULL, NULL,
   '2026-09-01', 1800, NULL, 'planned', 100, 'Pulse retainer Sep.'),
  (gen_random_uuid(), NULL, m_aurora, NULL, NULL,
   '2026-09-01', 320, NULL, 'planned', 100, 'Aurora care plan Sep.'),
  (gen_random_uuid(), NULL, m_solaris, NULL, NULL,
   '2026-09-01', 600, NULL, 'planned', 100, 'Solaris hosting plan Sep — live.'),
  (gen_random_uuid(), NULL, NULL, h_apex, NULL,
   '2026-09-01', 120, NULL, 'planned', 100, 'Apex hosting Sep.'),
  (gen_random_uuid(), NULL, NULL, h_pulse, NULL,
   '2026-09-01', 220, NULL, 'planned', 100, 'Pulse hosting Sep.'),
  (gen_random_uuid(), NULL, NULL, h_aurora, NULL,
   '2026-09-01', 60, NULL, 'planned', 100, 'Aurora hosting Sep.'),
  (gen_random_uuid(), NULL, NULL, h_bloom, NULL,
   '2026-09-01', 80, NULL, 'planned', 100, 'Bloom hosting Sep.'),
  (gen_random_uuid(), NULL, NULL, h_solaris, NULL,
   '2026-09-01', 280, NULL, 'planned', 100, 'Solaris server Sep.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-09-01', -280, NULL, 'cost', 100, 'Hetzner Sep.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-09-01', -90, NULL, 'cost', 100, 'Adobe CC Sep.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-09-01', -22, NULL, 'cost', 100, 'Cloudflare Pro Sep.'),
  (gen_random_uuid(), NULL, NULL, NULL, NULL,
   '2026-09-01', -40, NULL, 'cost', 100, 'Kinsta Sep.')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  9. PIPELINE ITEMS — proposal, won, lost
-- ============================================================

INSERT INTO pipeline_items (id, client_id, company_name, title, description,
                             estimated_amount, probability, deal_type,
                             expected_month, expected_end_month,
                             status, notes, created_at)
VALUES
  (gen_random_uuid(), c_apex, NULL,
   'Apex Digital — App UX Redesign',
   'Full UX/UI redesign of the SaaS dashboard. Discovery completed, proposal sent.',
   18000, 75, 'fixed', '2026-05-01', '2026-09-01', 'proposal',
   'CTO is decision maker. Demo scheduled 28 Apr.', '2026-02-10'),

  (gen_random_uuid(), c_bloom, NULL,
   'Bloom & Co — SS27 Campaign Production',
   'Photo and video content production for SS27 collection launch.',
   12000, 50, 'one_time', '2026-09-01', NULL, 'proposal',
   'Preliminary discussion. Chiara interested but budget not confirmed.', '2026-03-01'),

  (gen_random_uuid(), c_verde, NULL,
   'Verde Architects — Projects Microsite',
   'Standalone microsite for their award-winning residential projects portfolio.',
   8500, 75, 'fixed', '2026-05-01', '2026-07-01', 'proposal',
   'Marco very keen. Contract draft sent.', '2026-02-20'),

  (gen_random_uuid(), c_northstar, NULL,
   'NorthStar — Driver Portal App (Phase 2)',
   'Mobile-first web app for drivers: route planning, time tracking, incident reporting.',
   32000, 50, 'fixed', '2026-08-01', '2027-02-01', 'proposal',
   'Phase 1 (website) delivered successfully. Formal brief expected Q3.', '2026-04-05'),

  (gen_random_uuid(), c_solaris, NULL,
   'Solaris Energy — Investor App MVP',
   'React Native MVP for investor portfolio tracking linked to solar farm performance.',
   45000, 25, 'fixed', '2026-10-01', '2027-06-01', 'proposal',
   'Very early stage. Antonio mentioned at last meeting. High upside if funded.', '2026-03-10'),

  (gen_random_uuid(), NULL, 'Ferro & Fiamma',
   'Ferro & Fiamma — Restaurant Brand & Website',
   'Full brand identity and website for new upscale restaurant in Milan. Opening Oct 2026.',
   9500, 90, 'fixed', '2026-05-01', '2026-08-01', 'proposal',
   'Referred by Bloom & Co. Meeting held 12 Mar. High confidence.', '2026-03-12'),

  (gen_random_uuid(), NULL, 'Lumina Optics',
   'Lumina Optics — E-commerce Redesign',
   'Full Shopify redesign for optical eyewear brand. 200+ SKUs, B2C.',
   16000, 50, 'one_time', '2026-06-01', NULL, 'proposal',
   'Inbound lead via website. Discovery call done 25 Mar.', '2026-03-08'),

  -- Won deal
  (gen_random_uuid(), c_cinematic, NULL,
   'Cinematic Studio — BTS Documentary Microsite',
   'Dedicated microsite for behind-the-scenes documentary release.',
   6200, 100, 'fixed', '2026-05-01', '2026-07-01', 'won',
   'Contract signed 5 Apr. Project kicks off 1 May.', '2026-02-15'),

  -- Won deal — existing client upsell
  (gen_random_uuid(), c_pulse, NULL,
   'Pulse Media — Annual Strategy Deck',
   'Annual brand strategy presentation design, 60 slides. Fast turnaround.',
   3200, 100, 'one_time', '2026-04-01', NULL, 'won',
   'Signed 8 Apr. Delivery end of month.', '2026-04-02'),

  -- Lost deals
  (gen_random_uuid(), NULL, 'Nexus SRL',
   'Nexus SRL — Corporate Rebrand',
   'Full rebranding: logo, stationery, website. Lost to lower-cost competitor.',
   11000, 0, 'fixed', '2026-03-01', NULL, 'lost',
   'Lost on price. Client went with local agency at 7K. Note for future: they may return.', '2026-01-20'),

  (gen_random_uuid(), NULL, 'Aria Consulting',
   'Aria Consulting — Website Redesign',
   'Corporate website for B2B consulting firm. Client paused project indefinitely.',
   7500, 0, 'fixed', '2026-04-01', NULL, 'lost',
   'Project frozen — client undergoing M&A process. Revisit Q4 2026.', '2026-02-05')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  10. TEAMS
--  Requires: teams table (created via resource planning migration)
-- ============================================================

INSERT INTO teams (id, name, color, display_order, created_at)
VALUES
  (t_design, 'Design', '#7c3aed', 1, now() - interval '12 months'),
  (t_dev,    'Development', '#2563eb', 2, now() - interval '12 months')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  11. TEAM MEMBERS
-- ============================================================

INSERT INTO team_members (id, name, email, role, team_id,
                          hours_per_day, skills, display_order, active, created_at)
VALUES
  (tm_nino, 'Nino', 'nino@renderspace.si', 'Creative Director & PM',
   t_design, 8, 'Brand Strategy, UI/UX, Product Design, Client Management',
   1, true, now() - interval '24 months'),

  (tm_ana, 'Ana', 'ana@renderspace.si', 'Senior Designer',
   t_design, 8, 'Visual Identity, Packaging, Motion Design, Illustration',
   2, true, now() - interval '18 months'),

  (tm_luka, 'Luka', 'luka@renderspace.si', 'Frontend Developer',
   t_dev, 8, 'React, Next.js, TypeScript, Shopify, WordPress, Tailwind',
   3, true, now() - interval '14 months')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  12. AUTOMATIONS + AUTOMATION ITEMS
--  automations table: automated email batch configs
--  automation_items table: invoice line templates per automation
-- ============================================================

INSERT INTO automations (id, name, recipient_email, send_day, active,
                          subject, message, notes, sent_count, last_sent_at,
                          created_at, updated_at)
VALUES
  (aut_retainers,
   'Monthly Retainer Invoices',
   'accounting@renderspace.si',
   1,   -- send on 1st of month
   true,
   'Monthly Retainer Invoices — {month} {year}',
   'Please find attached the recurring invoice for the {month} {year} billing cycle.',
   'Covers all active maintenance retainers. Runs on 1st of each month.',
   14, now() - interval '1 month',
   now() - interval '14 months', now() - interval '1 month'),

  (aut_hosting,
   'Monthly Hosting Invoices',
   'accounting@renderspace.si',
   3,   -- send on 3rd of month
   true,
   'Hosting Invoices — {month} {year}',
   'Attached are the hosting invoices for {month} {year}.',
   'Covers all monthly hosting clients. Separate from retainers.',
   12, now() - interval '1 month',
   now() - interval '12 months', now() - interval '1 month'),

  (aut_domains,
   'Domain Renewal Invoices',
   'accounting@renderspace.si',
   5,   -- send on 5th of month
   false,
   'Domain Renewal — {year}',
   'Invoices for domain renewals due this month.',
   'Inactive — domains billed manually via the Domains module.',
   3, now() - interval '4 months',
   now() - interval '12 months', now() - interval '4 months')

ON CONFLICT (id) DO NOTHING;

INSERT INTO automation_items (id, automation_id, client_id, contract_ref,
                               pn, description_template, quantity, unit_price,
                               due_days, sort_order, hosting_client_id, created_at)
VALUES
  -- Retainer automation items
  (gen_random_uuid(), aut_retainers, c_apex, 'RS-2025-003',
   '6820', 'Priority Support Retainer — {month} {year}',
   1, 950, 30, 1, NULL, now() - interval '14 months'),

  (gen_random_uuid(), aut_retainers, c_verde, 'RS-2024-003',
   '6820', 'Hosting & Maintenance — {month} {year}',
   1, 450, 30, 2, NULL, now() - interval '14 months'),

  (gen_random_uuid(), aut_retainers, c_pulse, 'RS-2025-002',
   '6820', 'Development Retainer — {month} {year}',
   1, 1800, 30, 3, NULL, now() - interval '12 months'),

  (gen_random_uuid(), aut_retainers, c_aurora, 'RS-2025-005',
   '6820', 'Website Care Plan — {month} {year}',
   1, 320, 30, 4, NULL, now() - interval '11 months'),

  (gen_random_uuid(), aut_retainers, c_cinematic, 'RS-2025-004',
   '6820', 'Content & Hosting Plan — {month} {year}',
   1, 480, 30, 5, NULL, now() - interval '13 months'),

  -- Hosting automation items
  (gen_random_uuid(), aut_hosting, c_apex, 'RS-2025-003',
   '6820', 'VPS + CDN Hosting — {month} {year}',
   1, 120, 15, 1, h_apex, now() - interval '12 months'),

  (gen_random_uuid(), aut_hosting, c_pulse, 'RS-2025-002',
   '6820', 'Media Server Hosting — {month} {year}',
   1, 220, 15, 2, h_pulse, now() - interval '12 months'),

  (gen_random_uuid(), aut_hosting, c_cinema, 'RS-2025-004',
   '6820', 'Video Portfolio Hosting — {month} {year}',
   1, 95, 15, 3, h_cinema, now() - interval '12 months')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  13. INVOICE AUTOMATIONS (newer standalone table)
--  Flat recurring invoice lines per client, no parent automation.
-- ============================================================

INSERT INTO invoice_automations (id, name, client_id, contract_ref,
                                  pn, description_template, quantity, unit_price,
                                  due_days, hosting_client_id, maintenance_id,
                                  active, sort_order, created_at, updated_at)
VALUES
  (gen_random_uuid(),
   'Apex — Priority Support', c_apex, 'RS-2025-003',
   '6820', 'Priority Support Retainer — {month} {year}',
   1, 950, 30, h_apex, m_apex,
   true, 1, now() - interval '13 months', now() - interval '1 month'),

  (gen_random_uuid(),
   'Verde — Hosting & Maintenance', c_verde, 'RS-2024-003',
   '6820', 'Hosting & Maintenance — {month} {year}',
   1, 450, 30, h_verde, m_verde,
   true, 2, now() - interval '13 months', now() - interval '1 month'),

  (gen_random_uuid(),
   'Pulse — Dev Retainer', c_pulse, 'RS-2025-002',
   '6820', 'Development Retainer — {month} {year}',
   1, 1800, 30, h_pulse, m_pulse,
   true, 3, now() - interval '11 months', now() - interval '1 month'),

  (gen_random_uuid(),
   'Aurora — Care Plan', c_aurora, 'RS-2025-005',
   '6820', 'Website Care Plan — {month} {year}',
   1, 320, 30, h_aurora, m_aurora,
   true, 4, now() - interval '10 months', now() - interval '1 month'),

  (gen_random_uuid(),
   'Cinema — Content Plan', c_cinematic, 'RS-2025-004',
   '6820', 'Content & Hosting Plan — {month} {year}',
   1, 480, 30, h_cinema, m_cinema,
   true, 5, now() - interval '13 months', now() - interval '1 month'),

  (gen_random_uuid(),
   'Bloom — Shopify Hosting', c_bloom, 'RS-2025-001',
   '6820', 'Shopify Hosting Contribution — {month} {year}',
   1, 80, 15, h_bloom, NULL,
   true, 6, now() - interval '9 months', now() - interval '1 month')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  14. REMINDER RULES
-- ============================================================

INSERT INTO reminder_rules (id, name, trigger_type, days_before, recipient_email,
                             active, notes, invoice_email, invoice_pn,
                             invoice_unit_price, invoice_due_days,
                             created_at, updated_at)
VALUES
  (gen_random_uuid(),
   'Domain Expiry — 60 days notice',
   'domain_expiry', 60, 'nino@renderspace.si',
   true,
   'Alerts 60 days before any domain expires. Enough lead time to confirm renewal with client.',
   'accounting@renderspace.si', '6820', 20, 30,
   now() - interval '8 months', now() - interval '1 month'),

  (gen_random_uuid(),
   'Domain Expiry — 14 days final warning',
   'domain_expiry', 14, 'nino@renderspace.si',
   true,
   'Final warning 14 days before domain expires.',
   NULL, NULL, NULL, NULL,
   now() - interval '8 months', now() - interval '1 month'),

  (gen_random_uuid(),
   'Maintenance Contract End — 90 days',
   'maintenance_end', 90, 'nino@renderspace.si',
   true,
   'Prompts renewal conversation 3 months before contract end date.',
   NULL, NULL, NULL, NULL,
   now() - interval '6 months', now() - interval '2 months'),

  (gen_random_uuid(),
   'Hosting Renewal — 30 days',
   'hosting_renewal', 30, 'nino@renderspace.si',
   true,
   'Reminder to prepare hosting renewal invoice 30 days before next_invoice_date.',
   'accounting@renderspace.si', '6820', NULL, 15,
   now() - interval '6 months', now() - interval '1 month'),

  (gen_random_uuid(),
   'Stale Pipeline — 30 days no update',
   'pipeline_stale', 30, 'nino@renderspace.si',
   true,
   'Flags pipeline proposals with no activity for 30+ days.',
   NULL, NULL, NULL, NULL,
   now() - interval '4 months', now() - interval '1 month')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  15. RESOURCE ALLOCATIONS
--  Current week: Apr 21–25 2026 + previous week Apr 14–18 2026
-- ============================================================

INSERT INTO resource_allocations (id, member_id, project_id, category,
                                   date, hours, label, notes,
                                   is_billable, is_unplanned, created_at)
VALUES
  -- Week of Apr 14–18 (last week)
  -- Nino: Solaris brand review + Apex support + meetings
  (gen_random_uuid(), tm_nino, p_solaris_web, 'project',
   '2026-04-14', 4, 'Solaris investor portal — UX review', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, p_bloom_web, 'project',
   '2026-04-14', 3, 'Bloom final QA walkthrough', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, NULL, 'meeting',
   '2026-04-14', 1, 'Internal stand-up', NULL, false, false, now()),
  (gen_random_uuid(), tm_nino, p_apex_maint, 'maintenance',
   '2026-04-15', 3, 'Apex support — Lighthouse audit', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, p_solaris_web, 'project',
   '2026-04-15', 4, 'Solaris — investor portal wireframes', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, NULL, 'meeting',
   '2026-04-15', 1, 'Apex client call', NULL, false, false, now()),
  (gen_random_uuid(), tm_nino, p_solaris_web, 'project',
   '2026-04-16', 5, 'Solaris — portal UI design', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, NULL, 'admin',
   '2026-04-16', 2, 'Monthly invoicing prep', NULL, false, false, now()),
  (gen_random_uuid(), tm_nino, NULL, 'sales',
   '2026-04-16', 1, 'Ferro & Fiamma proposal prep', NULL, false, false, now()),
  (gen_random_uuid(), tm_nino, p_cinematic_mnt, 'maintenance',
   '2026-04-17', 2, 'Cinematic content refresh', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, p_solaris_web, 'project',
   '2026-04-17', 5, 'Solaris portal — final design comps', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, NULL, 'meeting',
   '2026-04-17', 1, 'Solaris client review call', NULL, false, false, now()),
  (gen_random_uuid(), tm_nino, p_bloom_web, 'project',
   '2026-04-18', 3, 'Bloom Instagram integration — design handoff', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, NULL, 'admin',
   '2026-04-18', 2, 'Weekly recap, timesheet filing', NULL, false, false, now()),

  -- Ana: Cinematic microsite design + Verde proposals
  (gen_random_uuid(), tm_ana, p_cinematic_web, 'project',
   '2026-04-14', 6, 'Cinematic BTS microsite — moodboard & concept', NULL, true, false, now()),
  (gen_random_uuid(), tm_ana, NULL, 'meeting',
   '2026-04-14', 1, 'Internal stand-up', NULL, false, false, now()),
  (gen_random_uuid(), tm_ana, p_cinematic_web, 'project',
   '2026-04-15', 7, 'Cinematic microsite — wireframes', NULL, true, false, now()),
  (gen_random_uuid(), tm_ana, p_aurora_maint, 'maintenance',
   '2026-04-16', 3, 'Aurora newsletter template — April edition', NULL, true, false, now()),
  (gen_random_uuid(), tm_ana, p_cinematic_web, 'project',
   '2026-04-16', 5, 'Cinematic microsite — visual design', NULL, true, false, now()),
  (gen_random_uuid(), tm_ana, p_cinematic_web, 'project',
   '2026-04-17', 6, 'Cinematic microsite — desktop designs', NULL, true, false, now()),
  (gen_random_uuid(), tm_ana, NULL, 'meeting',
   '2026-04-17', 1, 'Cinematic client presentation', NULL, false, false, now()),
  (gen_random_uuid(), tm_ana, p_cinematic_web, 'project',
   '2026-04-18', 6, 'Cinematic microsite — mobile responsive design', NULL, true, false, now()),

  -- Luka: Bloom e-commerce launch + Pulse dev work
  (gen_random_uuid(), tm_luka, p_bloom_web, 'project',
   '2026-04-14', 7, 'Bloom Shopify — Instagram feed integration dev', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, NULL, 'meeting',
   '2026-04-14', 1, 'Internal stand-up', NULL, false, false, now()),
  (gen_random_uuid(), tm_luka, p_bloom_web, 'project',
   '2026-04-15', 6, 'Bloom — integration testing + bug fixes', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, p_pulse_maint, 'maintenance',
   '2026-04-15', 2, 'Pulse — content API updates', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, p_bloom_web, 'project',
   '2026-04-16', 8, 'Bloom — pre-launch QA + performance tuning', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, p_apex_maint, 'maintenance',
   '2026-04-17', 3, 'Apex — core web vitals fixes (prep for CR sprint)', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, p_verde_maint, 'maintenance',
   '2026-04-17', 2, 'Verde — WordPress plugin updates', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, p_pulse_maint, 'maintenance',
   '2026-04-17', 3, 'Pulse — media player component rebuild', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, p_bloom_web, 'project',
   '2026-04-18', 5, 'Bloom — go-live deployment + monitoring', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, NULL, 'admin',
   '2026-04-18', 2, 'Documentation update', NULL, false, false, now()),

  -- Week of Apr 21–25 (current week)
  -- Nino
  (gen_random_uuid(), tm_nino, p_solaris_web, 'project',
   '2026-04-21', 5, 'Solaris portal — development handoff + annotations', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, NULL, 'meeting',
   '2026-04-21', 2, 'Weekly team sync', NULL, false, false, now()),
  (gen_random_uuid(), tm_nino, p_cinematic_mnt, 'maintenance',
   '2026-04-21', 1, 'Cinematic — review content refresh', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, NULL, 'sales',
   '2026-04-22', 3, 'Ferro & Fiamma — proposal presentation', NULL, false, false, now()),
  (gen_random_uuid(), tm_nino, p_apex_maint, 'maintenance',
   '2026-04-22', 2, 'Apex — monthly report review', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, p_verde_maint, 'maintenance',
   '2026-04-22', 2, 'Verde — website content updates', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, NULL, 'meeting',
   '2026-04-22', 1, 'NorthStar intro call — Phase 2 exploration', NULL, false, false, now()),
  (gen_random_uuid(), tm_nino, p_solaris_camp, 'project',
   '2026-04-23', 4, 'Solaris campaign — strategy brief + concept', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, NULL, 'admin',
   '2026-04-23', 2, 'April invoicing', NULL, false, false, now()),
  (gen_random_uuid(), tm_nino, NULL, 'meeting',
   '2026-04-23', 2, 'Solaris campaign kick-off call', NULL, false, false, now()),
  (gen_random_uuid(), tm_nino, p_cinematic_web, 'project',
   '2026-04-24', 3, 'Cinematic BTS microsite — design feedback session', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, p_solaris_camp, 'project',
   '2026-04-24', 4, 'Solaris campaign — creative concept deck', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, p_pulse_maint, 'maintenance',
   '2026-04-25', 2, 'Pulse — monthly retainer review', NULL, true, false, now()),
  (gen_random_uuid(), tm_nino, NULL, 'admin',
   '2026-04-25', 2, 'End of week admin + planning', NULL, false, false, now()),

  -- Ana: current week
  (gen_random_uuid(), tm_ana, p_cinematic_web, 'project',
   '2026-04-21', 7, 'Cinematic microsite — design iterations from feedback', NULL, true, false, now()),
  (gen_random_uuid(), tm_ana, NULL, 'meeting',
   '2026-04-21', 1, 'Weekly team sync', NULL, false, false, now()),
  (gen_random_uuid(), tm_ana, p_solaris_camp, 'project',
   '2026-04-22', 5, 'Solaris campaign — visual identity exploration', NULL, true, false, now()),
  (gen_random_uuid(), tm_ana, p_aurora_maint, 'maintenance',
   '2026-04-22', 2, 'Aurora social media templates — May pack', NULL, true, false, now()),
  (gen_random_uuid(), tm_ana, p_cinematic_web, 'project',
   '2026-04-23', 6, 'Cinematic microsite — final screens + prototype', NULL, true, false, now()),
  (gen_random_uuid(), tm_ana, p_solaris_camp, 'project',
   '2026-04-24', 6, 'Solaris campaign — concept presentation assets', NULL, true, false, now()),
  (gen_random_uuid(), tm_ana, p_cinematic_web, 'project',
   '2026-04-25', 5, 'Cinematic microsite — handoff to dev', NULL, true, false, now()),
  (gen_random_uuid(), tm_ana, NULL, 'admin',
   '2026-04-25', 1, 'Asset organisation + delivery prep', NULL, false, false, now()),

  -- Luka: current week
  (gen_random_uuid(), tm_luka, p_bloom_web, 'project',
   '2026-04-21', 4, 'Bloom — post-launch monitoring + hotfixes', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, p_apex_maint, 'maintenance',
   '2026-04-21', 3, 'Apex — Core Web Vitals sprint start', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, NULL, 'meeting',
   '2026-04-21', 1, 'Weekly team sync', NULL, false, false, now()),
  (gen_random_uuid(), tm_luka, p_apex_maint, 'maintenance',
   '2026-04-22', 6, 'Apex — image optimisation + lazy loading', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, p_pulse_maint, 'maintenance',
   '2026-04-22', 2, 'Pulse — media player fixes', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, p_apex_maint, 'maintenance',
   '2026-04-23', 5, 'Apex — CSS bundle splitting + font optimisation', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, p_verde_maint, 'maintenance',
   '2026-04-23', 3, 'Verde — WooCommerce security patch', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, p_cinematic_web, 'project',
   '2026-04-24', 6, 'Cinematic microsite — HTML/CSS scaffolding from design', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, p_apex_maint, 'maintenance',
   '2026-04-25', 4, 'Apex — final Lighthouse audit + report', NULL, true, false, now()),
  (gen_random_uuid(), tm_luka, NULL, 'admin',
   '2026-04-25', 2, 'Staging deployment docs', NULL, false, false, now())

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  16. PROJECT DELIVERABLES
-- ============================================================

INSERT INTO project_deliverables (id, project_id, title, due_date, start_date,
                                   estimated_hours, status, notes, created_at)
VALUES
  -- Bloom e-commerce
  (gen_random_uuid(), p_bloom_web, 'Shopify theme — Design System', '2025-04-30', '2025-03-15',
   40, 'completed', 'Tokens, typography, components all done.', now() - interval '6 months'),
  (gen_random_uuid(), p_bloom_web, 'Homepage + Collection pages', '2025-06-15', '2025-05-01',
   60, 'completed', 'All templates delivered and approved.', now() - interval '5 months'),
  (gen_random_uuid(), p_bloom_web, 'Instagram Feed Integration', '2026-04-25', '2026-04-14',
   16, 'active', 'CR approved. Dev in progress this week.', now() - interval '2 weeks'),
  (gen_random_uuid(), p_bloom_web, 'Go-live & UAT', '2026-04-30', '2026-04-21',
   8, 'active', 'Final testing, DNS cutover, client sign-off.', now() - interval '1 week'),

  -- Solaris web
  (gen_random_uuid(), p_solaris_web, 'Brand Identity System', '2026-01-15', '2025-11-01',
   80, 'completed', 'Logo, color system, typography, brand guidelines.', now() - interval '5 months'),
  (gen_random_uuid(), p_solaris_web, 'Website Design (all pages)', '2026-03-31', '2026-01-20',
   120, 'completed', '12 pages designed. Client approved v3.', now() - interval '1 month'),
  (gen_random_uuid(), p_solaris_web, 'Investor Portal — Phase 3', '2026-04-30', '2026-03-15',
   60, 'active', 'Secure document library. In development now.', now() - interval '3 weeks'),
  (gen_random_uuid(), p_solaris_web, 'Website Development', '2026-08-15', '2026-04-01',
   140, 'active', 'Next.js build. Dev started.', now() - interval '3 weeks'),

  -- Cinematic BTS microsite
  (gen_random_uuid(), p_cinematic_web, 'Moodboard & Concept', '2026-04-18', '2026-04-14',
   12, 'completed', 'Approved by Elena on 18 Apr.', now() - interval '2 weeks'),
  (gen_random_uuid(), p_cinematic_web, 'UI Design — All Screens', '2026-04-30', '2026-04-19',
   30, 'active', 'Ana working on desktop + mobile this week.', now() - interval '1 week'),
  (gen_random_uuid(), p_cinematic_web, 'Frontend Development', '2026-05-20', '2026-04-28',
   40, 'active', 'Starts after design handoff.', now() - interval '1 week'),

  -- Solaris campaign
  (gen_random_uuid(), p_solaris_camp, 'Campaign Strategy Brief', '2026-05-10', '2026-04-21',
   20, 'active', 'Kick-off done 23 Apr. Strategy doc in progress.', now() - interval '3 days'),
  (gen_random_uuid(), p_solaris_camp, 'Landing Page Design', '2026-06-01', '2026-05-12',
   24, 'active', 'Starts after brief approval.', now() - interval '3 days'),

  -- Apex Core Web Vitals
  (gen_random_uuid(), p_apex_maint, 'Performance Audit', '2026-04-25', '2026-04-21',
   8, 'active', 'Luka running full Lighthouse audit. Due end of week.', now() - interval '4 days'),
  (gen_random_uuid(), p_apex_maint, 'Optimisation Sprint', '2026-05-15', '2026-04-28',
   30, 'active', 'CWV fixes: images, fonts, JS splitting.', now() - interval '4 days')

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  17. TIMESHEET ENTRIES  (Feb, Mar, Apr 2026)
-- ============================================================

INSERT INTO timesheet_entries (id, month, project_pn, project_name, description,
                                hours, ai_generated, created_at)
VALUES
  -- February 2026
  (gen_random_uuid(), '2026-02-01', 'RS-2025-001', 'Bloom & Co — E-commerce Website',
   'Phase 2: Design system completion and homepage templates', 42, false, now() - interval '2 months'),
  (gen_random_uuid(), '2026-02-01', 'RS-2025-007', 'Solaris Energy — Website & Brand',
   'Brand identity revisions + investor deck assets', 38, false, now() - interval '2 months'),
  (gen_random_uuid(), '2026-02-01', 'RS-2025-003', 'Apex Digital — Monthly Support',
   'Maintenance: CMS updates, bug fixes, hosting monitoring', 18, false, now() - interval '2 months'),
  (gen_random_uuid(), '2026-02-01', 'RS-2024-003', 'Verde Architects — Hosting & Maintenance',
   'WP updates, plugin maintenance, client requests', 8, false, now() - interval '2 months'),
  (gen_random_uuid(), '2026-02-01', 'RS-2025-002', 'Pulse Media — Retainer Dev',
   'Content API development and media player improvements', 20, false, now() - interval '2 months'),
  (gen_random_uuid(), '2026-02-01', 'RS-INT-001', 'Renderspace — Studio Operations & Tooling',
   'Insighty setup, invoicing system improvements', 10, false, now() - interval '2 months'),

  -- March 2026
  (gen_random_uuid(), '2026-03-01', 'RS-2025-001', 'Bloom & Co — E-commerce Website',
   'Phase 3: Collection pages + Instagram integration dev', 55, false, now() - interval '1 month'),
  (gen_random_uuid(), '2026-03-01', 'RS-2025-007', 'Solaris Energy — Website & Brand',
   'Investor portal Phase 3: design + partial dev handoff', 40, false, now() - interval '1 month'),
  (gen_random_uuid(), '2026-03-01', 'RS-2025-011', 'Solaris Energy — Launch Campaign',
   'Campaign brief preparation and initial concept', 8, false, now() - interval '1 month'),
  (gen_random_uuid(), '2026-03-01', 'RS-2025-003', 'Apex Digital — Monthly Support',
   'Priority support tickets, hosting, monthly report', 16, false, now() - interval '1 month'),
  (gen_random_uuid(), '2026-03-01', 'RS-2025-002', 'Pulse Media — Retainer Dev',
   'Q1 campaign extra sprint: content assets + web updates', 20, false, now() - interval '1 month'),
  (gen_random_uuid(), '2026-03-01', 'RS-2025-004', 'Cinematic Studio — Ongoing Support',
   'Content refresh, hosting, client request handling', 6, false, now() - interval '1 month'),

  -- April 2026 (current, partial — AI-assisted)
  (gen_random_uuid(), '2026-04-01', 'RS-2025-001', 'Bloom & Co — E-commerce Website',
   'Go-live: Instagram integration, QA, deployment, hotfixes', 28, true, now()),
  (gen_random_uuid(), '2026-04-01', 'RS-2025-007', 'Solaris Energy — Website & Brand',
   'Investor portal dev + design handoff review', 22, true, now()),
  (gen_random_uuid(), '2026-04-01', 'RS-2025-011', 'Solaris Energy — Launch Campaign',
   'Campaign strategy + creative concept development', 12, true, now()),
  (gen_random_uuid(), '2026-04-01', 'RS-2025-003', 'Apex Digital — Monthly Support',
   'Core Web Vitals sprint kick-off + performance audit', 14, true, now()),
  (gen_random_uuid(), '2026-04-01', 'RS-2025-002', 'Pulse Media — Retainer Dev',
   'Media player rebuild, API work', 10, true, now()),
  (gen_random_uuid(), '2026-04-01', 'RS-2025-004', 'Cinematic Studio — Ongoing Support',
   'BTS microsite: concept, design, content refresh', 18, true, now())

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  18. MAINTENANCE HOURS LOGS
-- ============================================================

INSERT INTO maintenance_hours_logs (id, maintenance_id, month,
                                     hours_used, source, notes, created_at)
VALUES
  -- Apex (8 hrs included)
  (gen_random_uuid(), m_apex, '2026-02-01', 7.5, 'manual',
   'Feb: CMS updates, hosting check, 2 support tickets', now() - interval '2 months'),
  (gen_random_uuid(), m_apex, '2026-03-01', 8.0, 'manual',
   'Mar: Priority support, monthly report, hosting', now() - interval '1 month'),
  (gen_random_uuid(), m_apex, '2026-04-01', 5.5, 'manual',
   'Apr (partial): Performance audit in progress', now()),

  -- Verde (4 hrs included)
  (gen_random_uuid(), m_verde, '2026-02-01', 3.0, 'manual',
   'Feb: WP updates, plugin maintenance', now() - interval '2 months'),
  (gen_random_uuid(), m_verde, '2026-03-01', 4.0, 'manual',
   'Mar: Full month — updates, content changes, security patch', now() - interval '1 month'),
  (gen_random_uuid(), m_verde, '2026-04-01', 2.5, 'manual',
   'Apr (partial): Security patch, plugin update', now()),

  -- Pulse (20 hrs included)
  (gen_random_uuid(), m_pulse, '2026-02-01', 20.0, 'manual',
   'Feb: Full 20 hrs — media player, content API, deployments', now() - interval '2 months'),
  (gen_random_uuid(), m_pulse, '2026-03-01', 20.0, 'manual',
   'Mar: Full 20 hrs + Q1 campaign sprint (billed as CR)', now() - interval '1 month'),
  (gen_random_uuid(), m_pulse, '2026-04-01', 12.0, 'manual',
   'Apr (partial): media player rebuild in progress', now()),

  -- Aurora (3 hrs included)
  (gen_random_uuid(), m_aurora, '2026-02-01', 2.5, 'manual',
   'Feb: Newsletter template, minor fixes', now() - interval '2 months'),
  (gen_random_uuid(), m_aurora, '2026-03-01', 3.0, 'manual',
   'Mar: Newsletter + social templates, hosting', now() - interval '1 month'),
  (gen_random_uuid(), m_aurora, '2026-04-01', 1.5, 'manual',
   'Apr: May newsletter template in progress', now()),

  -- Cinema (4 hrs included)
  (gen_random_uuid(), m_cinema, '2026-03-01', 3.5, 'manual',
   'Mar: Content updates, hosting check', now() - interval '1 month'),
  (gen_random_uuid(), m_cinema, '2026-04-01', 2.0, 'manual',
   'Apr: Content refresh review, BTS microsite project started', now())

ON CONFLICT (id) DO NOTHING;


-- ============================================================
--  19. RESOURCE PROJECTS (pinned projects for resource view)
-- ============================================================

INSERT INTO resource_projects (id, project_id, display_order, created_at)
VALUES
  (gen_random_uuid(), p_solaris_web,   1, now()),
  (gen_random_uuid(), p_cinematic_web, 2, now()),
  (gen_random_uuid(), p_solaris_camp,  3, now()),
  (gen_random_uuid(), p_bloom_web,     4, now()),
  (gen_random_uuid(), p_apex_maint,    5, now()),
  (gen_random_uuid(), p_pulse_maint,   6, now())

ON CONFLICT (project_id) DO NOTHING;


END $$;
