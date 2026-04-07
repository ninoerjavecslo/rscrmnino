-- Add BlockNote blocks storage to offers
-- Blocks are stored in meta.blocks (jsonb) — no schema change needed,
-- but we add a dedicated og_ prefixed tables for the offer generator's
-- content library and project types.

-- ── OG Project Types ──────────────────────────────────────────────────────────
create table if not exists og_project_types (
  id uuid primary key default gen_random_uuid(),
  name_sl text not null,
  name_en text not null,
  slug text unique not null,
  default_sections jsonb not null default '[]'
);

alter table og_project_types enable row level security;
create policy "authenticated read og_project_types" on og_project_types
  for select using (auth.role() = 'authenticated');

-- ── OG Content Library ────────────────────────────────────────────────────────
create table if not exists og_content_library (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  type text not null check (type in ('service_description', 'boilerplate')),
  name_sl text not null,
  name_en text not null,
  body_sl text not null default '',
  body_en text not null default '',
  sort_order int not null default 0
);

alter table og_content_library enable row level security;
create policy "authenticated read og_content_library" on og_content_library
  for select using (auth.role() = 'authenticated');
create policy "authenticated write og_content_library" on og_content_library
  for all using (auth.role() = 'authenticated');

-- ── Seed: Project types ───────────────────────────────────────────────────────
insert into og_project_types (name_sl, name_en, slug, default_sections) values
('Prenova / razvoj spletne strani', 'Website redesign / development', 'website-redesign', '["project-setup", "ux-design", "development", "testing", "launch"]'),
('Tehnično vzdrževanje in gostovanje', 'Technical maintenance & hosting', 'technical-maintenance', '["maintenance-package", "sla"]'),
('Kompleksne spletne aplikacije', 'Complex web applications', 'complex-webapp', '["project-setup", "architecture", "development", "testing", "launch"]'),
('SEO', 'SEO', 'seo', '["seo-audit", "on-page", "technical-seo"]'),
('E-commerce', 'E-commerce', 'ecommerce', '["project-setup", "design", "development", "testing", "launch"]'),
('Razvoj po meri / integracije', 'Custom dev / integrations', 'custom-dev', '["project-setup", "development", "testing"]'),
('Chatbot / AI funkcionalnosti', 'Chatbot / AI features', 'chatbot-ai', '["project-setup", "development", "testing"]'),
('Kampanja / pristajalna stran', 'Campaign / landing page', 'campaign', '["project-setup", "design", "development", "launch"]')
on conflict (slug) do nothing;

-- ── Seed: Boilerplate blocks ──────────────────────────────────────────────────
insert into og_content_library (category, type, name_sl, name_en, body_sl, body_en, sort_order) values
('boilerplate', 'boilerplate', 'Plačilni pogoji', 'Payment Terms',
'Fakturiranje se izvede po uspešno opravljenem projektu. Plačilo se izvede v 30 dneh od datuma izstavitve računa s strani izvajalca.
V primeru zamika planirane časovne izvedbe s strani naročnika, si izvajalec pridrži pravico do izstavitve fakture v dogovorjenem planu.',
'Invoicing is performed upon successful project completion. Payment is due within 30 days of the invoice date issued by the contractor.
In case of a delay in the planned execution timeline on the part of the client, the contractor reserves the right to issue an invoice according to the agreed schedule.',
1),
('boilerplate', 'boilerplate', 'Splošne opombe', 'General Notes',
'Naročnik se zavezuje, da bo predčasno zagotovil potrebne materiale, reference in vse s projektom povezane dokumente.
Izvajalec in naročnik se zavezujeta varovati poslovne skrivnosti, skladno z veljavno zakonodajo.',
'The client undertakes to provide the necessary materials, references, and all project-related documents in a timely manner.
The contractor and client agree to maintain business confidentiality in accordance with applicable law.',
2),
('boilerplate', 'boilerplate', 'Avtorske pravice', 'Copyright',
'Po plačilu celotnega zneska ponudbe naročnik pridobi lastništvo nad vsemi avtorskimi pravicami izdelanega dela.
Izvajalec si pridržuje pravico, da projekt navede med svojimi referencami.',
'Upon full payment of the offer amount, the client acquires ownership of all intellectual property rights for the created work.
The contractor reserves the right to reference the project in their portfolio.',
3)
on conflict do nothing;
