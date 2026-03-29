# Offer Generator MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Offer Generator tool to the Agency OS that lets Nino manually create, edit, and print Renderspace proposals using the existing short-template visual style.

**Architecture:** Three new views (list, new/editor, standalone preview) + Zustand store + Supabase table. The editor is a two-panel layout: dark sidebar with section toggles, right panel with structured form fields per section. The preview renders a standalone HTML document matching Template_Short_Ponudba.html exactly — isolated from Tailwind, opened in a new tab via `window.open`.

**Tech Stack:** React 19, TypeScript strict, Zustand v5, Supabase JS client, Tailwind CSS v4 + shadcn/ui (editor UI only), Figtree font (preview HTML only), `window.open` + `window.print()` for PDF export.

**Scope:** Manual mode only. Short template only. No Claude generation in this plan.

---

## Chunk 1: Data Layer

### Task 1: Supabase migration — `offers` and `offer_versions` tables

**Files:**
- Create: `supabase/migrations/20260327000001_offers.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/20260327000001_offers.sql

create table offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_name text not null default '',
  offer_number text not null default '',
  language text not null default 'sl' check (language in ('sl', 'en')),
  mode text not null default 'manual' check (mode in ('quick', 'structured', 'manual')),
  brief_text text,
  sections jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  pricing_total numeric not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table offer_versions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offers(id) on delete cascade,
  version integer not null,
  sections_snapshot jsonb not null default '[]'::jsonb,
  meta_snapshot jsonb not null default '{}'::jsonb,
  pricing_total_snapshot numeric not null default 0,
  created_at timestamptz not null default now()
);

-- RLS: same user sees all (single-tenant app)
alter table offers enable row level security;
alter table offer_versions enable row level security;

create policy "authenticated read offers" on offers for select using (auth.role() = 'authenticated');
create policy "authenticated write offers" on offers for all using (auth.role() = 'authenticated');
create policy "authenticated read offer_versions" on offer_versions for select using (auth.role() = 'authenticated');
create policy "authenticated write offer_versions" on offer_versions for all using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Apply the migration**

```bash
cd /Users/nino/Documents/GitHub/rscrmnino
npx supabase db push
```

Expected: migration applied without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260327000001_offers.sql
git commit -m "feat: add offers and offer_versions tables"
```

---

### Task 2: TypeScript types

**Files:**
- Modify: `src/lib/types.ts` (append at end)

- [ ] **Step 1: Add types**

Append to `src/lib/types.ts`:

```typescript
// ── Offer Generator ──────────────────────────────────────────

export type OfferLanguage = 'sl' | 'en'
export type OfferMode = 'quick' | 'structured' | 'manual'
export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'rejected'

export interface OfferBlock {
  id: string
  type: 'paragraph' | 'bullet-list' | 'phase-block' | 'pricing-table' | 'goal-list' | 'audience-grid' | 'service-block' | 'notes'
  content: string // HTML string for paragraph/notes; JSON string for structured types
}

export interface OfferSection {
  id: string
  type: 'cover' | 'intro' | 'scope' | 'pricing' | 'timeline' | 'notes' | 'terms' | 'copyright' | 'payment' | 'custom'
  title: string
  enabled: boolean
  order: number
  blocks: OfferBlock[]
}

export interface OfferMeta {
  // Cover page fields
  offer_eyebrow?: string       // e.g. "Ponudba 26_012"
  cover_title?: string         // Big heading e.g. "Ponudba za prenovo spletne strani"
  client_display_name?: string // e.g. "Pirnar d.o.o."
  client_address?: string      // multiline
  client_contact?: string
  agency_address?: string
  date_label?: string          // e.g. "Marec 2026 · v1.0"
  doc_title?: string           // Inner page h1 e.g. "Specifikacija ponudbe"
}

export interface Offer {
  id: string
  title: string
  client_name: string
  offer_number: string
  language: OfferLanguage
  mode: OfferMode
  brief_text?: string | null
  sections: OfferSection[]
  meta: OfferMeta
  pricing_total: number
  status: OfferStatus
  version: number
  created_at: string
  updated_at: string
}

export interface OfferVersion {
  id: string
  offer_id: string
  version: number
  sections_snapshot: OfferSection[]
  meta_snapshot: OfferMeta
  pricing_total_snapshot: number
  created_at: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/nino/Documents/GitHub/rscrmnino
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add Offer, OfferSection, OfferBlock types"
```

---

### Task 3: Zustand store

**Files:**
- Create: `src/stores/offers.ts`

- [ ] **Step 1: Write the store**

```typescript
// src/stores/offers.ts
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Offer, OfferVersion, OfferSection, OfferMeta } from '../lib/types'

interface OffersState {
  offers: Offer[]
  currentOffer: Offer | null
  versions: OfferVersion[]
  loading: boolean
  saving: boolean

  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<void>
  create: (data: Omit<Offer, 'id' | 'created_at' | 'updated_at'>) => Promise<string>
  update: (id: string, data: Partial<Omit<Offer, 'id' | 'created_at'>>) => Promise<void>
  deleteOffer: (id: string) => Promise<void>

  fetchVersions: (offerId: string) => Promise<void>
  saveVersion: (offerId: string) => Promise<void>
  restoreVersion: (versionId: string) => Promise<void>
}

export const useOffersStore = create<OffersState>((set, get) => ({
  offers: [],
  currentOffer: null,
  versions: [],
  loading: false,
  saving: false,

  fetchAll: async () => {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) throw error
      set({ offers: (data ?? []) as Offer[] })
    } finally {
      set({ loading: false })
    }
  },

  fetchById: async (id) => {
    set({ loading: true })
    try {
      const { data, error } = await supabase
        .from('offers')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      set({ currentOffer: data as Offer })
    } finally {
      set({ loading: false })
    }
  },

  create: async (data) => {
    const { data: row, error } = await supabase
      .from('offers')
      .insert(data)
      .select()
      .single()
    if (error) throw error
    await get().fetchAll()
    return row.id
  },

  update: async (id, data) => {
    set({ saving: true })
    try {
      const { error } = await supabase
        .from('offers')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      // Update currentOffer in place if it's the same offer
      const current = get().currentOffer
      if (current?.id === id) {
        set({ currentOffer: { ...current, ...data } as Offer })
      }
    } finally {
      set({ saving: false })
    }
  },

  deleteOffer: async (id) => {
    const { error } = await supabase.from('offers').delete().eq('id', id)
    if (error) throw error
    await get().fetchAll()
  },

  fetchVersions: async (offerId) => {
    const { data, error } = await supabase
      .from('offer_versions')
      .select('*')
      .eq('offer_id', offerId)
      .order('version', { ascending: false })
    if (error) throw error
    set({ versions: (data ?? []) as OfferVersion[] })
  },

  saveVersion: async (offerId) => {
    const current = get().currentOffer
    if (!current || current.id !== offerId) return
    const nextVersion = current.version + 1
    const { error: vErr } = await supabase.from('offer_versions').insert({
      offer_id: offerId,
      version: current.version,
      sections_snapshot: current.sections,
      meta_snapshot: current.meta,
      pricing_total_snapshot: current.pricing_total,
    })
    if (vErr) throw vErr
    await get().update(offerId, { version: nextVersion })
    await get().fetchVersions(offerId)
  },

  restoreVersion: async (versionId) => {
    const { data: v, error } = await supabase
      .from('offer_versions')
      .select('*')
      .eq('id', versionId)
      .single()
    if (error) throw error
    const version = v as OfferVersion
    // Snapshot current state first
    await get().saveVersion(version.offer_id)
    // Restore
    await get().update(version.offer_id, {
      sections: version.sections_snapshot,
      meta: version.meta_snapshot,
      pricing_total: version.pricing_total_snapshot,
    })
    await get().fetchById(version.offer_id)
  },
}))
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/stores/offers.ts
git commit -m "feat: add useOffersStore with CRUD and version history"
```

---

## Chunk 2: Boilerplate Library

### Task 4: Boilerplate constants

**Files:**
- Create: `src/lib/offerBoilerplate.ts`

This file contains all reusable text blocks from `RS_SALES/Renderspace_offer_analysis.md` sections 2 and 3. It is the single source of truth — used in the editor's "Insert block" UI.

- [ ] **Step 1: Write the boilerplate file**

```typescript
// src/lib/offerBoilerplate.ts
// All standard text blocks from Renderspace offer analysis (2025–2026)

export interface BoilerplateBlock {
  key: string
  label: string
  content: string // plain text with newlines; rendered as HTML in preview
}

export const BOILERPLATE_SL: BoilerplateBlock[] = [
  {
    key: 'payment_terms',
    label: 'Plačilni pogoji',
    content: `Fakturiranje se izvede po uspešno opravljenem projektu. Plačilo se izvede v 30 dneh od datuma izstavitve računa s strani izvajalca.
V primeru zamika planirane časovne izvedbe s strani naročnika, si izvajalec pridrži pravico do izstavitve fakture v dogovorjenem planu.`,
  },
  {
    key: 'copyright',
    label: 'Avtorske pravice',
    content: `Naročnik ima pravico, da naročeno delo uporablja izključno za namene, za katere je bilo izdelano. Ideje in koncepti, ki so bili predstavljeni naročniku, vendar jih naročnik ni sprejel, ostajajo lastnina izvajalca.

Vse opravljene storitve te ponudbe predstavljajo avtorsko delo izvajalca. Izvajalec na naročnika prenese naslednje materialne avtorske pravice na avtorskih delih:
a) uporabo dela v telesni obliki, zlasti pravico do reproduciranja;
b) uporabo dela v netelesni obliki (priobčitev javnosti), ki obsega pravico javnega izvajanja, pravico javnega prenašanja, pravico javnega prikazovanja, pravico radiodifuznega oddajanja, pravico radiodifuzne retransmisije, pravico sekundarnega radiodifuznega oddajanja, pravico dajanja na voljo javnosti;
c) uporabo dela v spremenjeni obliki, ki obsega pravico predelave in pravico avdiovizualne priredbe;
d) uporabo primerkov avtorskega dela, ki obsega pravico distribuiranja in pravico dajanja v najem.

Prenos materialnih je izključen in časovno ter teritorialno neomejen tj. velja tako za področje Republike Slovenije kot za tujino tj. ves svet. Prenos materialnih avtorskih pravic z izvajalca na naročnika, se izvrši z izvedbo plačila, ki se podrobneje uredijo v pogodbi.`,
  },
  {
    key: 'scope_notes',
    label: 'Obseg del in časovnica',
    content: `Ponudba velja za v stroškovniku definiran obseg del ter izdelkov. Za dodatna dela, ki niso opredeljena v stroškovniku, se izdela ločena ponudba.

Izvedba del po tej ponudbi se prične s pisno potrjenim odgovorom na ponudbo. Za izvedbo del se uporabi časovnica opredeljena v tej ponudbi. V kolikor predlagana časovnica potrebuje dodatno uskladitev z naročnikom, se le ta opravi in potrdi pred pričetkom projekta.`,
  },
  {
    key: 'general_notes',
    label: 'Splošne opombe',
    content: `Naročnik se zavezuje, da bo predčasno zagotovil potrebne materiale, reference in vse s projektom povezane dokumente.
Izvajalec in naročnik se zavezujeta varovati poslovne skrivnosti, skladno z veljavno zakonodajo. Ta ponudba predstavlja poslovno skrivnost.

V cenah ni vključen DDV.

Ponudba velja 30 dni.`,
  },
  {
    key: 'project_setup',
    label: 'Vzpostavitev projekta in analiza',
    content: `Uvodni sestanek z naročnikom, kjer:
— definiramo zahteve in želje naročnika
— spoznamo trenutno stanje in problematiko
— prepoznamo morebitne projektne omejitve
— določimo gabarite za časovnico
— pojasnimo način izvedbe projekta
— določimo projektno ekipo in pristojnosti
— določimo naslednje korake
— popišemo seznam podatkov, ki jih priskrbi naročnik za naslednje korake

Izvedba po delavnici:
— priprava projektnega plana
— priprava okvirne časovnice projekta, ocena tveganja in identifikacije mejnikov projekta
— dodelitev ekipe, opredelitev principov dela in določitev orodij, ki jih bomo uporabljali pri izvedbi projekta`,
  },
  {
    key: 'hosting_standard',
    label: 'Gostovanje spletnega mesta',
    content: `Gostovanje spletnega mesta (mesečno)

4 GB prostora na disku; redno varnostno kopiranje – dnevno, tedensko in mesečno; podatkovni center skladen s standardom ISO27001; redundantno električno napajanje in hlajenje; profesionalni protivlomni sistem; 24 urna fizična zaščita; beleženje vhodov in izhodov; profesionalna pristopna kontrola; CISCO komunikacijska oprema za visoko razpoložljivost; več redundantnih optičnih povezav z večimi domačimi in tujimi operaterji; DDOS zaščita Arbor networks; zagotovljena razpoložljivost tehnične infrastrukture (omrežje, spletni strežnik, baze podatkov): 99,8% na tromesečni ravni; odzivni čas: 8 ur; dosegljivost 8/5; rok za odpravo napake: 12 ur (ciljni čas).`,
  },
  {
    key: 'maintenance_basic',
    label: 'Tehnično vzdrževanje — Osnovni paket',
    content: `Tehnično vzdrževanje — osnovni paket
Namen osnovnega tehničnega vzdrževanja je zagotavljati nivo razpoložljivosti in delovanja spletnih mest.

Vključuje:
— mesečni pregled spletne strani
— mesečne posodobitve in vzdrževanje
— varnostno kopiranje spletne strani
— do 5 podpornih zahtevkov na mesec
— do 1h reševanja težav nepovzročenih na strani izvajalca
— podpora preko e-pošte in portala za podporo
— dosegljivost od ponedeljka do petka od 9.00 do 17.00
— odzivni čas: v 24 urah

Cena: €150/mesec`,
  },
  {
    key: 'maintenance_pro',
    label: 'Tehnično vzdrževanje — Profesionalni paket',
    content: `Tehnično vzdrževanje — profesionalni paket
Namen tehničnega vzdrževanja je zagotavljati nivo razpoložljivosti in delovanja spletnih mest.

Vključuje:
— mesečni pregled spletne strani
— mesečne posodobitve in vzdrževanje
— varnostno kopiranje spletne strani
— do 5 podpornih zahtevkov na mesec
— do 3h reševanja težav nepovzročenih na strani izvajalca
— podpora preko e-pošte in portala za podporo
— vključuje proaktivno vzdrževanje ter mesečne preglede delovanja in optimizacije
— dosegljivost od ponedeljka do petka od 9.00 do 17.00
— odzivni čas: v 24 urah

Cena: €450/mesec`,
  },
]

export const BOILERPLATE_EN: BoilerplateBlock[] = [
  {
    key: 'payment_terms',
    label: 'Payment Terms',
    content: `Invoicing is performed upon successful completion of the project. Payment is due within 30 days of the invoice date.
In case of a delay caused by the client, the agency reserves the right to invoice according to the agreed schedule.`,
  },
  {
    key: 'general_notes',
    label: 'General Notes',
    content: `The client undertakes to provide all necessary materials, references and project-related documents in a timely manner.
Both parties undertake to protect business confidentiality in accordance with applicable law. This offer constitutes a business secret.

Prices do not include VAT.

This offer is valid for 30 days.`,
  },
]

export function getBoilerplate(language: 'sl' | 'en'): BoilerplateBlock[] {
  return language === 'en' ? BOILERPLATE_EN : BOILERPLATE_SL
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/offerBoilerplate.ts
git commit -m "feat: add Renderspace boilerplate library (SLO + EN)"
```

---

## Chunk 3: Preview HTML Renderer

### Task 5: Offer-to-HTML renderer

**Files:**
- Create: `src/lib/offerRenderer.ts`

This function takes an `Offer` object and returns a complete standalone HTML string that exactly matches the `Template_Short_Ponudba.html` visual style. It is used by the preview route.

- [ ] **Step 1: Write the renderer**

```typescript
// src/lib/offerRenderer.ts
// Renders an Offer to a standalone HTML string matching Template_Short_Ponudba.html

import type { Offer, OfferSection, OfferBlock } from './types'

const LOGO_URL = 'https://leyqpykakzsxhucjkslx.supabase.co/storage/v1/object/public/offer-assets/Logo/Primary%20logo_black.png'

// ── CSS (copied verbatim from Template_Short_Ponudba.html) ─────────────────
const OFFER_CSS = `
  :root {
    --black: #0a0a0a; --ink: #1a1a1a; --gray-dark: #0a0a0a; --gray-mid: #0a0a0a;
    --gray-light: #0a0a0a; --gray-bg: #f5f5f3; --gray-rule: #e0e0dd;
    --white: #ffffff; --orange: #E85C1A; --orange-light: #FDF0EA;
    --orange-dark: #c94a0f; --font: 'Figtree', sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font); background: var(--white); color: var(--ink); font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 10mm 18mm 24mm; position: relative; background: var(--white); }
  @media screen { body { background: #e8e8e5; } .page { margin: 20px auto; box-shadow: 0 4px 40px rgba(0,0,0,0.12); } .page + .page { margin-top: 0; } }
  @media print { body { background: white; } .page { margin: 0; width: 210mm; height: 297mm; max-height: 297mm; overflow: hidden; page-break-after: always; break-after: page; box-shadow: none; } .page:last-child { page-break-after: avoid; break-after: avoid; } }
  .cover { padding: 0; overflow: hidden; display: flex; flex-direction: column; background: #F2EAE0; position: relative; }
  .cover::before { content: ''; position: absolute; bottom: -10mm; right: -10mm; width: 160mm; height: 160mm; background: radial-gradient(ellipse at center, #E8320A 0%, #F05A1A 30%, #F5956A 60%, transparent 80%); border-radius: 50%; filter: blur(18px); opacity: 0.92; }
  .cover::after { content: ''; position: absolute; inset: 0; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E"); pointer-events: none; mix-blend-mode: multiply; }
  .cover-header { position: relative; z-index: 2; padding: 12mm 18mm 0; display: flex; justify-content: space-between; align-items: flex-start; }
  .cover-wordmark img { height: 28px; width: auto; }
  .cover-contact { text-align: right; font-size: 10px; font-weight: 400; color: var(--black); line-height: 1.6; }
  .cover-contact a { color: var(--black); text-decoration: underline; }
  .cover-body { position: relative; z-index: 2; flex: 1; padding: 0 18mm; display: flex; flex-direction: column; justify-content: center; }
  .cover-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--black); margin-bottom: 5mm; }
  .cover-title { font-size: 52px; font-weight: 700; color: var(--black); line-height: 0.95; letter-spacing: -0.03em; margin-bottom: 5mm; max-width: 140mm; }
  .cover-subtitle-main { font-size: 22px; font-weight: 700; color: var(--black); letter-spacing: -0.01em; margin-bottom: 4mm; }
  .cover-meta-row { position: relative; z-index: 2; background: transparent; padding: 7mm 18mm; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; }
  .cover-meta-item { padding-right: 6mm; }
  .cover-meta-item + .cover-meta-item { padding-left: 6mm; border-left: 1px solid rgba(0,0,0,0.15); }
  .cover-meta-label { font-size: 7.5px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--black); margin-bottom: 3px; }
  .cover-meta-value { font-size: 11px; font-weight: 500; color: var(--black); line-height: 1.5; }
  .cover .page-footer { display: none; }
  .doc-header { padding-bottom: 7mm; margin-bottom: 0; display: flex; flex-direction: column; }
  .doc-header-top { display: flex; justify-content: flex-end; align-items: flex-start; margin-bottom: 3mm; }
  .doc-header-logos img { height: 20px; width: auto; }
  .doc-header h1 { font-size: 34px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; color: var(--black); }
  .section-label { font-size: 16px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--black); padding-bottom: 4px; border-bottom: 2px solid var(--black); margin-bottom: 5mm; margin-top: 8mm; }
  .section-label:first-of-type { margin-top: 4mm; }
  .page-footer { position: absolute; bottom: 10mm; left: 18mm; right: 18mm; display: flex; justify-content: space-between; align-items: center; padding-top: 3mm; }
  .page-footer span { font-size: 8.5px; color: var(--gray-light); font-weight: 400; }
  .page-footer .pn { font-weight: 600; color: var(--gray-mid); }
  .intro-text { font-size: 12px; line-height: 1.7; color: var(--gray-dark); margin-bottom: 6mm; }
  .intro-text strong { color: var(--black); font-weight: 700; }
  .goal-list { display: flex; flex-direction: column; gap: 2px; margin-bottom: 6mm; }
  .goal-item { display: flex; align-items: center; gap: 8px; padding: 5px 10px; background: #F2EAE0; border-left: 3px solid var(--orange); font-size: 12px; font-weight: 500; color: var(--ink); line-height: 1.4; }
  .goal-item::before { content: '→'; color: var(--orange); font-weight: 800; font-size: 12px; flex-shrink: 0; }
  .phase-block { margin-bottom: 4mm; border: 1px solid var(--gray-rule); break-inside: avoid; }
  .phase-head { display: flex; align-items: stretch; background: var(--black); }
  .phase-tag { background: var(--orange); color: var(--white); font-size: 8px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; padding: 6px 10px; display: flex; align-items: center; white-space: nowrap; }
  .phase-head-info { padding: 6px 10px; flex: 1; }
  .phase-title { font-size: 13px; font-weight: 800; color: var(--white); line-height: 1.2; }
  .phase-deadline { font-size: 8.5px; font-weight: 700; color: var(--white); background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); padding: 3px 9px; white-space: nowrap; align-self: center; margin-left: auto; flex-shrink: 0; letter-spacing: 0.02em; }
  .phase-body { padding: 5px 10px 7px; background: var(--white); }
  .phase-items { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 8mm; }
  .phase-item { font-size: 12px; color: var(--gray-dark); line-height: 1.5; display: flex; align-items: baseline; gap: 5px; }
  .phase-item::before { content: '·'; color: var(--orange); font-weight: 900; flex-shrink: 0; }
  .detail-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; }
  .detail-table thead th { background: var(--orange); color: var(--white); font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 8px; text-align: left; }
  .detail-table thead th:nth-child(2) { text-align: center; width: 20mm; }
  .detail-table thead th:nth-child(3) { text-align: right; width: 28mm; }
  .detail-table thead th:last-child { text-align: right; width: 32mm; white-space: nowrap; }
  .detail-table .project-row td { padding: 8px 8px 6px; background: var(--white); border-bottom: none; font-size: 12px; font-weight: 700; color: var(--black); }
  .detail-table .desc-row td { padding: 0 8px 8px; background: var(--white); border-bottom: 1px solid var(--gray-rule); font-size: 10px; color: var(--ink); line-height: 1.6; }
  .bullet-list { list-style: none; padding: 0; margin: 0; }
  .bullet-list li { display: flex; gap: 6px; padding: 1px 0; }
  .bullet-list li::before { content: '—'; color: var(--orange); font-weight: 700; flex-shrink: 0; }
  .detail-table tbody tr.data-row:nth-child(odd) { background: var(--white); }
  .detail-table tbody tr.data-row:nth-child(even) { background: var(--gray-bg); }
  .detail-table tbody tr.data-row td { padding: 7px 8px; border-bottom: 1px solid var(--gray-rule); font-size: 11px; color: var(--ink); vertical-align: middle; }
  .detail-table tbody tr.data-row td:first-child { font-weight: 600; color: var(--black); }
  .detail-table tbody tr.data-row td:nth-child(2) { text-align: center; }
  .detail-table tbody tr.data-row td:nth-child(3) { text-align: right; }
  .detail-table tbody tr.data-row td:last-child { text-align: right; font-weight: 600; }
  .detail-table .subtotal td { background: var(--black); color: var(--white); font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; border-bottom: none; padding: 8px 8px; vertical-align: middle; }
  .detail-table .subtotal td:last-child { text-align: right; font-size: 14px; font-weight: 900; white-space: nowrap; }
  .detail-table .grandtotal td { background: var(--orange); color: var(--white); font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; border-bottom: none; padding: 9px 8px; vertical-align: middle; }
  .detail-table .grandtotal td:last-child { text-align: right; font-size: 15px; font-weight: 900; white-space: nowrap; }
  .detail-table .gap td { padding: 3mm 0; background: var(--white); border: none; }
  .opombe { display: flex; flex-direction: column; gap: 2px; margin-top: 2mm; }
  .opomba-item { display: flex; align-items: baseline; gap: 8px; padding: 4px 0; font-size: 12px; color: var(--black); line-height: 1.5; }
  .opomba-item .dash { color: var(--orange); font-weight: 800; flex-shrink: 0; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #0a0a0a; color: #fff; border: none; padding: 8px 18px; font-family: 'Figtree', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 4px; z-index: 9999; }
  @media print { .print-btn { display: none; } }
`

function renderBlock(block: OfferBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'notes':
      return `<div class="intro-text">${block.content}</div>`

    case 'bullet-list': {
      const items = block.content.split('\n').filter(Boolean)
      return `<ul class="bullet-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`
    }

    case 'goal-list': {
      const items = block.content.split('\n').filter(Boolean)
      return `<div class="goal-list">${items.map(i => `<div class="goal-item">${i}</div>`).join('')}</div>`
    }

    case 'phase-block': {
      // content is JSON: { tag, title, deadline, items: string[] }
      try {
        const phase = JSON.parse(block.content) as { tag?: string; title: string; deadline?: string; items?: string[] }
        const itemsHtml = (phase.items ?? []).map(i => `<div class="phase-item">${i}</div>`).join('')
        return `
<div class="phase-block">
  <div class="phase-head">
    ${phase.tag ? `<div class="phase-tag">${phase.tag}</div>` : ''}
    <div class="phase-head-info">
      <div class="phase-title">${phase.title}</div>
    </div>
    ${phase.deadline ? `<div class="phase-deadline">${phase.deadline}</div>` : ''}
  </div>
  <div class="phase-body">
    <div class="phase-items">${itemsHtml}</div>
  </div>
</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'pricing-table': {
      // content is JSON: { rows: { label: string, qty: string, rate: string, total: string }[], subtotals: { label: string, total: string }[], grandTotal: string }
      try {
        const pricing = JSON.parse(block.content) as {
          rows: { label: string; qty: string; rate: string; total: string }[]
          subtotals?: { label: string; total: string }[]
          grandTotal?: string
        }
        const rowsHtml = pricing.rows.map(r =>
          `<tr class="data-row"><td>${r.label}</td><td>${r.qty}</td><td>${r.rate}</td><td>${r.total}</td></tr>`
        ).join('')
        const subtotalsHtml = (pricing.subtotals ?? []).map(s =>
          `<tr class="subtotal"><td colspan="3">${s.label}</td><td>${s.total}</td></tr><tr class="gap"><td colspan="4"></td></tr>`
        ).join('')
        const grandTotalHtml = pricing.grandTotal
          ? `<tr class="grandtotal"><td colspan="3">Skupaj za vse postavke</td><td>${pricing.grandTotal}</td></tr>`
          : ''
        return `
<table class="detail-table">
  <thead><tr><th>Storitev</th><th>Količina</th><th>Cena / enoto</th><th>Neto cena v EUR</th></tr></thead>
  <tbody>${rowsHtml}${subtotalsHtml}${grandTotalHtml}</tbody>
</table>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    default:
      return `<div class="intro-text">${block.content}</div>`
  }
}

function renderSection(section: OfferSection, pageNum: number, offer: Offer): string {
  if (!section.enabled) return ''

  if (section.type === 'cover') {
    const m = offer.meta
    return `
<div class="page cover">
  <div class="cover-header">
    <div class="cover-wordmark"><img src="${LOGO_URL}" alt="Renderspace" onerror="this.style.display='none'"></div>
    <div class="cover-contact">
      Vilharjeva cesta 36<br>SI-1000 Ljubljana<br>
      <a href="mailto:info@renderspace.si">info@renderspace.si</a><br>
      +386 (1) 23 91 200
    </div>
  </div>
  <div class="cover-body">
    <div class="cover-eyebrow">${m.offer_eyebrow ?? offer.offer_number}</div>
    <div class="cover-title">${m.cover_title ?? offer.title}</div>
    <div class="cover-subtitle-main">${m.client_display_name ?? offer.client_name}</div>
  </div>
  <div class="cover-meta-row">
    <div class="cover-meta-item">
      <div class="cover-meta-label">Naročnik</div>
      <div class="cover-meta-value">${(m.client_address ?? offer.client_name).replace(/\n/g, '<br>')}</div>
    </div>
    <div class="cover-meta-item">
      <div class="cover-meta-label">Agencija</div>
      <div class="cover-meta-value">Renderspace d.o.o.<br>Vilharjeva cesta 36<br>1000 Ljubljana</div>
    </div>
    <div class="cover-meta-item">
      <div class="cover-meta-label">Datum · Verzija</div>
      <div class="cover-meta-value">${m.date_label ?? new Date().toLocaleDateString('sl-SI', { month: 'long', year: 'numeric' })} · v${offer.version}.0</div>
    </div>
  </div>
</div>`
  }

  const blocksHtml = section.blocks.map(b => renderBlock(b)).join('\n')
  return `
<div class="page">
  <div class="doc-header">
    <div class="doc-header-top">
      <div class="doc-header-logos"><img src="${LOGO_URL}" alt="Renderspace" onerror="this.style.display='none'"></div>
    </div>
    <h1>${offer.meta.doc_title ?? 'Specifikacija ponudbe'}</h1>
  </div>
  <div class="section-label">${section.title}</div>
  ${blocksHtml}
  <div class="page-footer">
    <span>Renderspace d.o.o.</span>
    <span class="pn">${pageNum}</span>
  </div>
</div>`
}

export function renderOfferToHtml(offer: Offer): string {
  const enabledSections = offer.sections
    .filter(s => s.enabled)
    .sort((a, b) => a.order - b.order)

  const pagesHtml = enabledSections.map((s, i) => renderSection(s, i + 1, offer)).join('\n')

  return `<!DOCTYPE html>
<html lang="${offer.language}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${offer.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,300;1,400&display=swap" rel="stylesheet">
<style>${OFFER_CSS}</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Print / Save PDF</button>
${pagesHtml}
</body>
</html>`
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/offerRenderer.ts
git commit -m "feat: add offer-to-HTML renderer matching short template style"
```

---

## Chunk 4: Views

### Task 6: Offers list view

**Files:**
- Create: `src/views/OfferGeneratorView.tsx`

- [ ] **Step 1: Write the list view**

```tsx
// src/views/OfferGeneratorView.tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOffersStore } from '../stores/offers'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { toast } from '../lib/toast'
import type { Offer } from '../lib/types'

const STATUS_VARIANT: Record<string, 'green' | 'amber' | 'blue' | 'gray' | 'red'> = {
  draft: 'gray',
  sent: 'blue',
  accepted: 'green',
  rejected: 'red',
}

export function OfferGeneratorView() {
  const navigate = useNavigate()
  const { offers, loading, fetchAll, deleteOffer } = useOffersStore()

  useEffect(() => { fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(offer: Offer) {
    if (!confirm(`Delete "${offer.title}"?`)) return
    try {
      await deleteOffer(offer.id)
      toast('success', 'Offer deleted')
    } catch {
      toast('error', 'Failed to delete offer')
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-primary">Offer Generator</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Create and manage client proposals</p>
        </div>
        <Button onClick={() => navigate('/tools/offer-generator/new')}>
          + New Offer
        </Button>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {!loading && offers.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">No offers yet.</p>
          <Button className="mt-4" onClick={() => navigate('/tools/offer-generator/new')}>
            Create your first offer
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {offers.map(offer => (
          <div
            key={offer.id}
            className="bg-white rounded-[10px] border border-border p-4 flex items-center justify-between cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate(`/tools/offer-generator/${offer.id}`)}
          >
            <div className="flex items-center gap-4">
              <div>
                <div className="font-semibold text-sm text-primary">{offer.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {offer.offer_number && <span className="mr-2">{offer.offer_number}</span>}
                  {offer.client_name}
                  {offer.pricing_total > 0 && (
                    <span className="ml-2">· €{offer.pricing_total.toLocaleString('sl-SI')}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={STATUS_VARIANT[offer.status] ?? 'gray'}>
                {offer.status}
              </Badge>
              <span className="text-xs text-muted-foreground">v{offer.version}</span>
              <Button
                size="xs"
                variant="ghost"
                onClick={e => { e.stopPropagation(); handleDelete(offer) }}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/OfferGeneratorView.tsx
git commit -m "feat: add OfferGeneratorView (offers list)"
```

---

### Task 7: New offer form view

**Files:**
- Create: `src/views/OfferNewView.tsx`

This view lets the user set cover page details and create an empty offer with a default section structure. Mode is always `manual` for this MVP.

- [ ] **Step 1: Write the new offer form**

```tsx
// src/views/OfferNewView.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOffersStore } from '../stores/offers'
import { Button } from '../components/ui/button'
import { toast } from '../lib/toast'
import { v4 as uuidv4 } from 'uuid'
import type { OfferSection } from '../lib/types'

function defaultSections(): OfferSection[] {
  return [
    { id: uuidv4(), type: 'cover', title: 'Naslovna stran', enabled: true, order: 0, blocks: [] },
    { id: uuidv4(), type: 'intro', title: 'Uvod', enabled: true, order: 1, blocks: [] },
    { id: uuidv4(), type: 'scope', title: 'Obseg del', enabled: true, order: 2, blocks: [] },
    { id: uuidv4(), type: 'pricing', title: 'Stroškovnik', enabled: true, order: 3, blocks: [] },
    { id: uuidv4(), type: 'notes', title: 'Splošne opombe', enabled: true, order: 4, blocks: [] },
    { id: uuidv4(), type: 'payment', title: 'Plačilni pogoji', enabled: false, order: 5, blocks: [] },
    { id: uuidv4(), type: 'copyright', title: 'Avtorske pravice', enabled: false, order: 6, blocks: [] },
  ]
}

export function OfferNewView() {
  const navigate = useNavigate()
  const { create } = useOffersStore()

  const [title, setTitle] = useState('')
  const [clientName, setClientName] = useState('')
  const [offerNumber, setOfferNumber] = useState('')
  const [language, setLanguage] = useState<'sl' | 'en'>('sl')
  const [coverTitle, setCoverTitle] = useState('Ponudba za razvoj spletne strani')
  const [clientAddress, setClientAddress] = useState('')
  const [dateLabel, setDateLabel] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !clientName.trim()) return
    setSaving(true)
    try {
      const id = await create({
        title: title.trim(),
        client_name: clientName.trim(),
        offer_number: offerNumber.trim(),
        language,
        mode: 'manual',
        brief_text: null,
        sections: defaultSections(),
        meta: {
          offer_eyebrow: offerNumber.trim() ? `Ponudba ${offerNumber.trim()}` : '',
          cover_title: coverTitle.trim(),
          client_display_name: clientName.trim(),
          client_address: clientAddress.trim(),
          date_label: dateLabel.trim(),
          doc_title: 'Specifikacija ponudbe',
        },
        pricing_total: 0,
        status: 'draft',
        version: 1,
      })
      toast('success', 'Offer created')
      navigate(`/tools/offer-generator/${id}`)
    } catch {
      toast('error', 'Failed to create offer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6 max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/tools/offer-generator')}
          className="text-muted-foreground hover:text-primary text-sm"
        >
          ← Offers
        </button>
        <h1 className="text-xl font-bold text-primary">New Offer</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="mb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
            Offer title *
          </label>
          <input
            className="w-full border border-border rounded-md px-3 py-2 text-sm"
            placeholder="Pirnar — Prenova spletne strani"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Client name *
            </label>
            <input
              className="w-full border border-border rounded-md px-3 py-2 text-sm"
              placeholder="Pirnar d.o.o."
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Offer number
            </label>
            <input
              className="w-full border border-border rounded-md px-3 py-2 text-sm"
              placeholder="26_012"
              value={offerNumber}
              onChange={e => setOfferNumber(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
            Language
          </label>
          <div className="flex gap-2">
            {(['sl', 'en'] as const).map(lang => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                className={`px-4 py-1.5 text-sm rounded-md border transition-colors ${
                  language === lang
                    ? 'bg-primary text-white border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {lang === 'sl' ? 'Slovenščina' : 'English'}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-4 mb-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Cover page
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Main heading</label>
              <input
                className="w-full border border-border rounded-md px-3 py-2 text-sm"
                value={coverTitle}
                onChange={e => setCoverTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Client address (cover)</label>
              <textarea
                className="w-full border border-border rounded-md px-3 py-2 text-sm"
                rows={3}
                placeholder={'Ime Priimek\nPodjetje d.o.o.\n1000 Ljubljana'}
                value={clientAddress}
                onChange={e => setClientAddress(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date label</label>
              <input
                className="w-full border border-border rounded-md px-3 py-2 text-sm"
                placeholder="Marec 2026"
                value={dateLabel}
                onChange={e => setDateLabel(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Creating…' : 'Create offer →'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/tools/offer-generator')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Check that `uuid` is available**

```bash
cd /Users/nino/Documents/GitHub/rscrmnino && npm list uuid 2>/dev/null | head -3
```

If not found, run: `npm install uuid && npm install -D @types/uuid`

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/OfferNewView.tsx
git commit -m "feat: add OfferNewView (new offer form)"
```

---

### Task 8: Offer editor view

**Files:**
- Create: `src/views/OfferEditorView.tsx`
- Create: `src/views/offer-editor/SectionSidebar.tsx`
- Create: `src/views/offer-editor/SectionEditor.tsx`

The editor is the two-panel layout. Left: dark sidebar with sections + versions. Right: editor for the selected section with block management and boilerplate insertion.

- [ ] **Step 1: Write SectionSidebar**

```tsx
// src/views/offer-editor/SectionSidebar.tsx
import type { OfferSection } from '../../lib/types'

interface Props {
  sections: OfferSection[]
  selectedId: string | null
  onSelect: (id: string) => void
  onToggle: (id: string) => void
  versions: { id: string; version: number; created_at: string }[]
  onRestoreVersion: (versionId: string) => void
  onSaveVersion: () => void
  saving: boolean
}

export function SectionSidebar({ sections, selectedId, onSelect, onToggle, versions, onRestoreVersion, onSaveVersion, saving }: Props) {
  const sorted = [...sections].sort((a, b) => a.order - b.order)
  return (
    <div style={{ width: 220, background: '#1a1a1a', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '14px 12px 8px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#666' }}>
        Sections
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {sorted.map(section => (
          <div
            key={section.id}
            onClick={() => onSelect(section.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px',
              borderRadius: 4, marginBottom: 2, cursor: 'pointer',
              background: selectedId === section.id ? '#E85C1A' : 'transparent',
              color: section.enabled ? '#fff' : '#555',
            }}
          >
            <button
              onClick={e => { e.stopPropagation(); onToggle(section.id) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: section.enabled ? '#E85C1A' : '#444', fontSize: 11, padding: 0, flexShrink: 0 }}
              title={section.enabled ? 'Hide section' : 'Show section'}
            >
              {section.enabled ? '●' : '○'}
            </button>
            <span style={{ fontSize: 12, fontWeight: selectedId === section.id ? 700 : 400 }}>
              {section.title}
            </span>
          </div>
        ))}
      </div>

      {/* Versions */}
      <div style={{ borderTop: '1px solid #2a2a2a', padding: '10px 12px' }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#555', marginBottom: 6 }}>
          Versions
        </div>
        {versions.slice(0, 5).map(v => (
          <div
            key={v.id}
            onClick={() => { if (confirm(`Restore v${v.version}? Current state will be saved first.`)) onRestoreVersion(v.id) }}
            style={{ fontSize: 10, color: '#666', padding: '3px 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
          >
            <span>v{v.version}</span>
            <span style={{ fontSize: 9, color: '#444' }}>
              {new Date(v.created_at).toLocaleDateString('sl-SI')}
            </span>
          </div>
        ))}
        <button
          onClick={onSaveVersion}
          disabled={saving}
          style={{ marginTop: 8, width: '100%', background: '#2a2a2a', border: 'none', color: '#aaa', fontSize: 10, padding: '5px 0', borderRadius: 3, cursor: 'pointer' }}
        >
          {saving ? 'Saving…' : 'Save version'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write SectionEditor**

```tsx
// src/views/offer-editor/SectionEditor.tsx
import { useState } from 'react'
import { Button } from '../../components/ui/button'
import { getBoilerplate } from '../../lib/offerBoilerplate'
import type { OfferSection, OfferBlock, OfferLanguage } from '../../lib/types'
import { v4 as uuidv4 } from 'uuid'

interface Props {
  section: OfferSection
  language: OfferLanguage
  onChange: (updated: OfferSection) => void
}

function BlockEditor({ block, onChange, onDelete }: {
  block: OfferBlock
  onChange: (b: OfferBlock) => void
  onDelete: () => void
}) {
  if (block.type === 'phase-block') {
    let parsed = { tag: '', title: '', deadline: '', items: [''] }
    try { parsed = { ...parsed, ...JSON.parse(block.content) } } catch { /* ok */ }

    function save(updated: typeof parsed) {
      onChange({ ...block, content: JSON.stringify(updated) })
    }

    return (
      <div style={{ border: '1px solid #e8e3ea', borderRadius: 6, padding: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#E85C1A' }}>Phase</span>
          <button onClick={onDelete} style={{ fontSize: 10, color: '#999', border: 'none', background: 'none', cursor: 'pointer' }}>Remove</button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Tag (e.g. FAZA 1)</label>
            <input className="w-full border border-border rounded px-2 py-1 text-sm" value={parsed.tag} onChange={e => save({ ...parsed, tag: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Deadline</label>
            <input className="w-full border border-border rounded px-2 py-1 text-sm" value={parsed.deadline} onChange={e => save({ ...parsed, deadline: e.target.value })} />
          </div>
        </div>
        <div className="mb-3">
          <label className="text-xs text-muted-foreground block mb-1">Phase title</label>
          <input className="w-full border border-border rounded px-2 py-1 text-sm" value={parsed.title} onChange={e => save({ ...parsed, title: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Deliverables (one per line)</label>
          <textarea
            className="w-full border border-border rounded px-2 py-1 text-sm"
            rows={4}
            value={parsed.items.join('\n')}
            onChange={e => save({ ...parsed, items: e.target.value.split('\n') })}
          />
        </div>
      </div>
    )
  }

  if (block.type === 'pricing-table') {
    let parsed = { rows: [{ label: '', qty: '', rate: '', total: '' }], subtotals: [] as { label: string; total: string }[], grandTotal: '' }
    try { parsed = { ...parsed, ...JSON.parse(block.content) } } catch { /* ok */ }

    function save(updated: typeof parsed) {
      onChange({ ...block, content: JSON.stringify(updated) })
    }

    function addRow() {
      save({ ...parsed, rows: [...parsed.rows, { label: '', qty: '', rate: '', total: '' }] })
    }
    function removeRow(i: number) {
      save({ ...parsed, rows: parsed.rows.filter((_, idx) => idx !== i) })
    }
    function updateRow(i: number, key: string, val: string) {
      const rows = parsed.rows.map((r, idx) => idx === i ? { ...r, [key]: val } : r)
      save({ ...parsed, rows })
    }

    return (
      <div style={{ border: '1px solid #e8e3ea', borderRadius: 6, padding: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#E85C1A' }}>Pricing table</span>
          <button onClick={onDelete} style={{ fontSize: 10, color: '#999', border: 'none', background: 'none', cursor: 'pointer' }}>Remove</button>
        </div>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', marginBottom: 8 }}>
          <thead>
            <tr style={{ background: '#f5f5f3' }}>
              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Service</th>
              <th style={{ width: 60, padding: '4px 6px', fontWeight: 600 }}>Qty</th>
              <th style={{ width: 80, padding: '4px 6px', fontWeight: 600 }}>Rate</th>
              <th style={{ width: 90, padding: '4px 6px', fontWeight: 600 }}>Total</th>
              <th style={{ width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((row, i) => (
              <tr key={i}>
                <td style={{ padding: '2px 4px' }}><input className="w-full border border-border rounded px-1 py-0.5 text-xs" value={row.label} onChange={e => updateRow(i, 'label', e.target.value)} /></td>
                <td style={{ padding: '2px 4px' }}><input className="w-full border border-border rounded px-1 py-0.5 text-xs" value={row.qty} onChange={e => updateRow(i, 'qty', e.target.value)} /></td>
                <td style={{ padding: '2px 4px' }}><input className="w-full border border-border rounded px-1 py-0.5 text-xs" value={row.rate} onChange={e => updateRow(i, 'rate', e.target.value)} /></td>
                <td style={{ padding: '2px 4px' }}><input className="w-full border border-border rounded px-1 py-0.5 text-xs" value={row.total} onChange={e => updateRow(i, 'total', e.target.value)} /></td>
                <td style={{ padding: '2px 4px' }}><button onClick={() => removeRow(i)} style={{ color: '#999', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <button onClick={addRow} style={{ fontSize: 11, color: '#E85C1A', border: '1px dashed #E85C1A', background: 'none', cursor: 'pointer', padding: '2px 10px', borderRadius: 3 }}>+ Row</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="text-xs text-muted-foreground">Grand total:</label>
          <input className="border border-border rounded px-2 py-0.5 text-sm w-36" value={parsed.grandTotal} onChange={e => save({ ...parsed, grandTotal: e.target.value })} placeholder="5.900,00 EUR" />
        </div>
      </div>
    )
  }

  // paragraph / bullet-list / notes / goal-list
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{block.type}</span>
        <button onClick={onDelete} style={{ fontSize: 10, color: '#999', border: 'none', background: 'none', cursor: 'pointer' }}>Remove</button>
      </div>
      <textarea
        className="w-full border border-border rounded-md px-3 py-2 text-sm"
        rows={block.type === 'paragraph' ? 5 : 4}
        value={block.content}
        onChange={e => onChange({ ...block, content: e.target.value })}
        placeholder={block.type === 'bullet-list' ? 'One item per line' : block.type === 'goal-list' ? 'One goal per line' : 'Text…'}
      />
    </div>
  )
}

export function SectionEditor({ section, language, onChange }: Props) {
  const [showBoilerplate, setShowBoilerplate] = useState(false)
  const boilerplate = getBoilerplate(language)

  function addBlock(type: OfferBlock['type'], content = '') {
    const block: OfferBlock = { id: uuidv4(), type, content }
    onChange({ ...section, blocks: [...section.blocks, block] })
  }

  function updateBlock(id: string, updated: OfferBlock) {
    onChange({ ...section, blocks: section.blocks.map(b => b.id === id ? updated : b) })
  }

  function deleteBlock(id: string) {
    onChange({ ...section, blocks: section.blocks.filter(b => b.id !== id) })
  }

  function insertBoilerplate(content: string) {
    addBlock('paragraph', content)
    setShowBoilerplate(false)
  }

  if (section.type === 'cover') {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Cover page</div>
        <div className="text-xs text-muted-foreground mb-4">Cover page fields are set during offer creation. Edit them by going back to the offer list and recreating, or update meta directly.</div>
        <div style={{ background: '#f5f5f3', borderRadius: 6, padding: 12, fontSize: 12, color: '#555' }}>
          Cover page layout is auto-generated from the offer meta. Preview to see it.
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{section.title}</div>

      {/* Blocks */}
      {section.blocks.map(block => (
        <BlockEditor
          key={block.id}
          block={block}
          onChange={updated => updateBlock(block.id, updated)}
          onDelete={() => deleteBlock(block.id)}
        />
      ))}

      {section.blocks.length === 0 && (
        <div style={{ color: '#aaa', fontSize: 12, marginBottom: 16 }}>
          No blocks yet. Add one below.
        </div>
      )}

      {/* Add block buttons */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        <button onClick={() => addBlock('paragraph')} style={{ fontSize: 11, border: '1px dashed #ccc', background: 'none', cursor: 'pointer', padding: '3px 10px', borderRadius: 3 }}>+ Text</button>
        <button onClick={() => addBlock('bullet-list')} style={{ fontSize: 11, border: '1px dashed #ccc', background: 'none', cursor: 'pointer', padding: '3px 10px', borderRadius: 3 }}>+ Bullet list</button>
        <button onClick={() => addBlock('goal-list')} style={{ fontSize: 11, border: '1px dashed #ccc', background: 'none', cursor: 'pointer', padding: '3px 10px', borderRadius: 3 }}>+ Goal list</button>
        <button onClick={() => addBlock('phase-block', JSON.stringify({ tag: 'FAZA 1', title: '', deadline: '', items: [] }))} style={{ fontSize: 11, border: '1px dashed #ccc', background: 'none', cursor: 'pointer', padding: '3px 10px', borderRadius: 3 }}>+ Phase</button>
        <button onClick={() => addBlock('pricing-table', JSON.stringify({ rows: [{ label: '', qty: '', rate: '', total: '' }], subtotals: [], grandTotal: '' }))} style={{ fontSize: 11, border: '1px dashed #ccc', background: 'none', cursor: 'pointer', padding: '3px 10px', borderRadius: 3 }}>+ Pricing table</button>
        <button onClick={() => setShowBoilerplate(v => !v)} style={{ fontSize: 11, border: '1px dashed #E85C1A', color: '#E85C1A', background: 'none', cursor: 'pointer', padding: '3px 10px', borderRadius: 3 }}>+ Boilerplate</button>
      </div>

      {/* Boilerplate picker */}
      {showBoilerplate && (
        <div style={{ border: '1px solid #e8e3ea', borderRadius: 6, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>Insert standard block</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {boilerplate.map(bp => (
              <button
                key={bp.key}
                onClick={() => insertBoilerplate(bp.content)}
                style={{ textAlign: 'left', background: '#f5f5f3', border: 'none', borderRadius: 4, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}
              >
                {bp.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Write OfferEditorView**

```tsx
// src/views/OfferEditorView.tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOffersStore } from '../stores/offers'
import { Button } from '../components/ui/button'
import { toast } from '../lib/toast'
import { SectionSidebar } from './offer-editor/SectionSidebar'
import { SectionEditor } from './offer-editor/SectionEditor'
import { renderOfferToHtml } from '../lib/offerRenderer'
import type { OfferSection } from '../lib/types'

export function OfferEditorView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentOffer, versions, loading, saving, fetchById, fetchVersions, update, saveVersion, restoreVersion } = useOffersStore()
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      fetchById(id)
      fetchVersions(id)
    }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentOffer && !selectedSectionId) {
      const first = [...currentOffer.sections].sort((a, b) => a.order - b.order).find(s => s.type !== 'cover')
      setSelectedSectionId(first?.id ?? currentOffer.sections[0]?.id ?? null)
    }
  }, [currentOffer]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !currentOffer) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>
  }

  const selectedSection = currentOffer.sections.find(s => s.id === selectedSectionId) ?? null

  function handleSectionChange(updated: OfferSection) {
    const sections = currentOffer!.sections.map(s => s.id === updated.id ? updated : s)
    update(currentOffer!.id, { sections })
  }

  function handleToggleSection(sectionId: string) {
    const sections = currentOffer!.sections.map(s =>
      s.id === sectionId ? { ...s, enabled: !s.enabled } : s
    )
    update(currentOffer!.id, { sections })
  }

  async function handleSave() {
    try {
      await update(currentOffer!.id, { sections: currentOffer!.sections, meta: currentOffer!.meta })
      toast('success', 'Saved')
    } catch {
      toast('error', 'Save failed')
    }
  }

  async function handleSaveVersion() {
    try {
      await saveVersion(currentOffer!.id)
      toast('success', 'Version saved')
    } catch {
      toast('error', 'Failed to save version')
    }
  }

  async function handleRestoreVersion(versionId: string) {
    try {
      await restoreVersion(versionId)
      toast('success', 'Version restored')
    } catch {
      toast('error', 'Failed to restore version')
    }
  }

  function handlePreview() {
    const html = renderOfferToHtml(currentOffer!)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    // Revoke after a short delay to allow the tab to load
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/tools/offer-generator')}
            className="text-muted-foreground hover:text-primary text-sm"
          >
            ←
          </button>
          <div>
            <div className="font-semibold text-sm text-primary">{currentOffer.title}</div>
            <div className="text-xs text-muted-foreground">{currentOffer.client_name} · {currentOffer.offer_number}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handlePreview}>
            Preview PDF
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Two-panel editor */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <SectionSidebar
          sections={currentOffer.sections}
          selectedId={selectedSectionId}
          onSelect={setSelectedSectionId}
          onToggle={handleToggleSection}
          versions={versions}
          onRestoreVersion={handleRestoreVersion}
          onSaveVersion={handleSaveVersion}
          saving={saving}
        />

        <div style={{ flex: 1, overflowY: 'auto', background: '#fafaf8' }}>
          {selectedSection ? (
            <SectionEditor
              section={selectedSection}
              language={currentOffer.language}
              onChange={handleSectionChange}
            />
          ) : (
            <div className="p-6 text-muted-foreground text-sm">Select a section from the sidebar.</div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/views/OfferEditorView.tsx src/views/offer-editor/SectionSidebar.tsx src/views/offer-editor/SectionEditor.tsx
git commit -m "feat: add OfferEditorView with two-panel section editor"
```

---

## Chunk 5: Wiring

### Task 9: Add routes and sidebar link

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add imports and routes to App.tsx**

Add these imports after the existing view imports:

```tsx
import { OfferGeneratorView } from './views/OfferGeneratorView'
import { OfferNewView } from './views/OfferNewView'
import { OfferEditorView } from './views/OfferEditorView'
```

Add these routes inside the main `<Routes>` block (alongside the other tool routes):

```tsx
<Route path="/tools/offer-generator" element={<OfferGeneratorView />} />
<Route path="/tools/offer-generator/new" element={<OfferNewView />} />
<Route path="/tools/offer-generator/:id" element={<OfferEditorView />} />
```

- [ ] **Step 2: Add sidebar link**

In `src/components/layout/Sidebar.tsx`, find the Tools section (around the `IconTool` NavLink) and add the Offer Generator link:

```tsx
<NavLink to="/tools/offer-generator" className={nav}>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
  Offers
</NavLink>
```

Add it directly below the existing `<NavLink to="/tools" ...>` line.

- [ ] **Step 3: Verify TypeScript compiles and dev server starts**

```bash
npx tsc --noEmit && npm run dev
```

Expected: no TypeScript errors, dev server starts on port 5173.

- [ ] **Step 4: Manual smoke test**
  1. Open http://localhost:5173
  2. Click "Offers" in sidebar → should show empty list with "New Offer" button
  3. Click "New Offer" → fill in title "Test Offer", client "Test Client", click Create
  4. Should land on the editor with a dark sidebar showing section names
  5. Click "Intro" in sidebar → should show the editor with "No blocks yet"
  6. Click "+ Text" → a textarea should appear
  7. Type some text in the textarea
  8. Click "Save" in top bar → "Saved" toast should appear
  9. Click "Preview PDF" → a new tab should open showing the styled A4 document

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: wire offer generator routes and sidebar link"
```

---

### Task 10: Upload logo to Supabase storage

The preview renderer references a logo URL in Supabase storage. This is a one-time setup.

- [ ] **Step 1: Create the storage bucket**

In Supabase dashboard → Storage → New bucket:
- Name: `offer-assets`
- Public: yes

- [ ] **Step 2: Upload logo**

Upload `RS_SALES/Logo/Primary logo_black.png` to the bucket under path `Logo/Primary logo_black.png`.

- [ ] **Step 3: Verify the URL**

The public URL should be:
`https://<project-ref>.supabase.co/storage/v1/object/public/offer-assets/Logo/Primary%20logo_black.png`

- [ ] **Step 4: Update LOGO_URL in offerRenderer.ts**

Replace the placeholder `LOGO_URL` constant at the top of `src/lib/offerRenderer.ts` with the actual URL from step 3.

```bash
# Find the project ref
cat /Users/nino/Documents/GitHub/rscrmnino/.env.local 2>/dev/null || cat /Users/nino/Documents/GitHub/rscrmnino/.env 2>/dev/null | head -5
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/offerRenderer.ts
git commit -m "chore: update logo URL to Supabase storage bucket"
```

---

## Done

At this point the MVP is working:
- `/tools/offer-generator` — list of saved offers with status badges
- `/tools/offer-generator/new` — form to create a new offer (sets cover page data)
- `/tools/offer-generator/:id` — two-panel editor: section sidebar + block editor, boilerplate insertion, version history
- Preview PDF button → opens standalone HTML in new tab matching the Renderspace template, `Print / Save PDF` button calls `window.print()`

**Next milestones (separate plans):**
- Quick mode: paste brief → Claude generates full proposal
- Structured mode: fill form → Claude writes narrative
- Offer status management (mark as sent/accepted/rejected)
- Pricing total auto-compute from pricing-table blocks
