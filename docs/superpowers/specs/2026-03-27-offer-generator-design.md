# Offer Generator — Design Spec
*Date: 2026-03-27 | Project: Renderspace Agency OS*

---

## 1. Overview

A tool inside the Agency OS (`/tools/offer-generator`) that lets Renderspace create, edit, and export professional client proposals. Three entry modes feed into a shared editor. The final output is a print-ready HTML document that exactly matches the existing Renderspace offer template (Figtree font, orange accents, A4 pages, cover page with gradient). The tool UI itself uses Agency OS design conventions (Tailwind + shadcn/ui, navy sidebar, existing layout patterns).

---

## 2. Route & Navigation

- Route: `/tools/offer-generator` — list view (all saved offers)
- Route: `/tools/offer-generator/new` — mode selection + brief input
- Route: `/tools/offer-generator/:id` — editor view for a specific offer
- Route: `/tools/offer-generator/:id/preview` — full A4 preview, opens as a standalone HTML page in a new browser tab (no React shell, no sidebar)

Added to the sidebar under **Tools**, alongside Timesheet.

---

## 3. Data Model (Supabase)

### `offers` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `title` | text | e.g. "Pirnar — Prenova spletne strani" |
| `client_name` | text | Client/prospect name |
| `offer_number` | text | e.g. "26_012" — manually typed by user; no auto-increment (duplicates are the user's responsibility) |
| `language` | text | `'sl'` or `'en'` |
| `mode` | text | `'quick'`, `'structured'`, `'manual'` |
| `brief_text` | text | Raw pasted brief (Quick/Structured modes) |
| `sections` | jsonb | Array of section objects (see below) |
| `meta` | jsonb | Cover page data: client address, date, version, contact person |
| `pricing_total` | numeric | Computed grand total in EUR |
| `status` | text | `'draft'`, `'sent'`, `'accepted'`, `'rejected'` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `version` | integer | Current version number |

### `offer_versions` table
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `offer_id` | uuid | FK → offers |
| `version` | integer | Snapshot version number |
| `sections_snapshot` | jsonb | Full sections array at time of snapshot |
| `meta_snapshot` | jsonb | Full meta (cover page data) at time of snapshot |
| `pricing_total_snapshot` | numeric | Grand total at time of snapshot |
| `created_at` | timestamptz | |

### Section object schema (inside `offers.sections` jsonb array)
```json
{
  "id": "uuid",
  "type": "cover | intro | scope | pricing | timeline | notes | terms | copyright | payment | custom",
  "title": "Displayed section name",
  "enabled": true,
  "order": 1,
  "blocks": [
    {
      "id": "uuid",
      "type": "paragraph | table | bullet-list | phase-block | pricing-table | boilerplate",
      "content": "HTML string or structured JSON depending on type",
      "boilerplate_ref": "optional key linking to source from offer analysis"
    }
  ]
}
```

---

## 4. Three Entry Modes

### 4.1 Quick Mode
- Single large textarea: "Paste client brief, email, or any project description"
- Fields: Client name, Offer number (auto-suggested), Language (SLO/EN), Section toggles (which sections to include)
- On submit: sends brief + section selection + language to Claude API
- Claude returns: complete `sections` JSON with all blocks written in Renderspace voice
- Generation is **not streamed** — the Edge Function calls Claude with `stream: false` and returns the complete `sections` JSON in one response. The frontend shows a loading spinner with section-by-section progress labels (simulated, not real streaming) while awaiting the response.
- On success: offer is saved to Supabase, user is redirected to the Editor
- On failure (API error, malformed JSON, timeout): error toast is shown, form input is preserved so the user can retry without losing the brief

### 4.2 Structured Mode
- A form covering:
  - **Cover info**: client name, client address, contact person, offer number, date
  - **Project info**: project name/title, short description, platform goals (textarea), target audiences, languages supported, tech stack (multi-select chips: Statamic, Payload CMS, Next.js, custom, etc.)
  - **Phases**: repeatable rows — phase name, description, deadline, line items (role, hours, rate, subtotal)
  - **Optional sections**: toggles for AI features, e-shop, SEO, UX testing, accessibility, email marketing, maintenance
  - **Pricing**: auto-computed from phases + optional add-ons; manual override possible
  - Language toggle (SLO/EN)
- On submit: sends structured data to Claude API
- Claude writes: intro narrative, scope descriptions, phase descriptions, optional section texts — in Renderspace voice
- Boilerplate blocks (payment terms, copyright, general notes) are auto-inserted from the analysis library based on language
- After generation: lands in the Editor

### 4.3 Manual Mode
- Skips Claude generation entirely
- User selects which sections to include (toggles)
- Each section starts with boilerplate options from the offer analysis library (e.g. click "Insert standard payment terms SLO")
- User writes/edits all content directly in the editor
- All editing tools available (same editor as other modes)

---

## 5. Editor (Two-Panel Layout)

### 5.1 Left Sidebar (240px, dark `#1a1a1a`)
- List of sections in order, each showing:
  - Section name
  - Toggle (eye icon) to include/exclude from output
  - Active highlight (orange) on selected section
  - Drag handle for reordering
- Versions panel at bottom:
  - Shows v1, v2, v3... with dates
  - Click any version to restore it (creates a new version snapshot first)
- "Save version" button — manual snapshot

### 5.2 Right Panel (flex-1)
- **Section header**: section name + block controls
- **Content area**: renders current section's blocks as editable HTML
  - Paragraph blocks: contenteditable div, renders in Renderspace offer styles at reduced scale
  - Pricing tables: structured row editor (add/remove rows, edit hours/rate, auto-compute totals)
  - Bullet lists: editable list items with add/remove
  - Phase blocks: structured form (name, description bullets, data rows, subtotal)
- **Claude instruction bar** (always visible at bottom of panel):
  - Input: "Rewrite shorter", "Add paragraph about Payload CMS", "Make more formal"
  - Send button → calls Edge Function with the section's current content + instruction; shows loading state
  - Rewrite response is held in **ephemeral Zustand state** (`pendingRewrite: { sectionId, blocks } | null`) — not persisted until accepted
  - UI shows the proposed rewrite below the current content with "Accept" and "Discard" buttons
  - Accepting: replaces section blocks in the offer, clears `pendingRewrite`, auto-saves a version snapshot
  - Discarding: clears `pendingRewrite`, original content remains untouched
  - Navigating away with a pending rewrite: discard silently (no confirmation needed — original is intact)
- **Block controls** (on hover over each block): delete, move up/move down, duplicate

### 5.3 Preview
- Button in top bar: "Preview PDF" → opens `/tools/offer-generator/:id/preview` in new tab
- Preview page renders the full offer HTML exactly matching the template (all CSS from Template_All_Components.html preserved verbatim)
- `window.print()` button in preview tab exports to PDF
- Logo images served from Supabase storage (uploaded once, referenced in all offers)

---

## 6. Generated HTML Output

The stored `sections` JSON is rendered to HTML at preview time using the exact CSS from the existing templates:
- Figtree font (Google Fonts)
- A4 `.page` divs (210mm × 297mm)
- `.cover` with orange radial gradient and noise texture
- `.detail-table` with orange `thead`, black subtotal rows, orange grand total
- `.section-label` with black bottom border
- `.bullet-list` with orange `—` bullets
- `.page-footer` with page numbers
- Print media query for clean PDF output

Logo path: served from Supabase storage bucket `offer-assets` (public bucket). Files `Logo/Primary logo_black.png` and `Logo/Primary logo_white.png` are uploaded once as a one-time setup step during deployment. The preview template uses the public URL. If the image 404s, it degrades gracefully (the `<img>` hides via CSS `object-fit` and no visible broken image appears).

---

## 7. Boilerplate Library

Embedded in the frontend as a TypeScript constant (no DB needed — comes from the offer analysis):

```ts
BOILERPLATE = {
  sl: {
    payment_terms: "Fakturiranje se izvede po uspešno opravljenem projektu...",
    copyright: "Naročnik ima pravico, da naročeno delo uporablja...",
    scope_notes: "Ponudba velja za v stroškovniku definiran obseg del...",
    general_notes: "Naročnik se zavezuje, da bo predčasno zagotovil...",
    // ... all blocks from offer analysis section 2
  },
  en: {
    payment_terms: "Invoicing is performed upon successful completion...",
    // English equivalents
  }
}
```

Service description snippets (section 3 of analysis) are also stored here and surfaced in Manual mode as "Insert standard block" options per service type.

The boilerplate constant is the **single canonical source** — it is imported by the frontend for Manual mode inserts AND passed as part of the Edge Function request payload for Quick/Structured generation (not duplicated in the Edge Function code itself).

---

## 8. Claude Integration

- Uses the Anthropic API directly from a Supabase Edge Function (`offer-generate`)
- Model: `claude-sonnet-4-6` for both full generation and section rewrites (balances quality and speed)
- System prompt includes:
  - Renderspace voice/style guidelines (professional but direct, Slovenian digital agency)
  - Full boilerplate library in the selected language
  - Pricing intelligence: standard rate card (Designer 70 EUR/h, Developer 70 EUR/h, PM 90 EUR/h)
  - Instruction to return structured JSON matching the section schema
  - Examples from 2-3 past offers (selected from boilerplate library based on project type)
- For Quick mode: Claude extracts structured data from the brief, then generates sections
- For Structured mode: Claude receives the filled form data and writes narrative
- For section rewrites: Claude receives only the current section HTML and the user's instruction

---

## 9. Zustand Store

`useOffersStore` in `src/stores/offers.ts`:
- `offers: Offer[]` — list of all offers
- `currentOffer: Offer | null` — offer being edited
- `versions: OfferVersion[]` — versions for current offer
- `generating: boolean` — Claude generation in progress (full offer generation)
- `rewriting: boolean` — Claude section rewrite in progress
- `pendingRewrite: { sectionId: string; blocks: Block[] } | null` — proposed rewrite awaiting accept/discard
- `fetchAll()`, `fetchById(id)`, `create(data)`, `update(id, data)`, `deleteOffer(id)`
- `saveVersion(offerId)` — snapshot current state
- `restoreVersion(versionId)` — restore + auto-snapshot current before restoring
- `generateFromBrief(brief, options)` — calls Edge Function
- `rewriteSection(offerId, sectionId, instruction)` — calls Edge Function for targeted rewrite

---

## 10. Pricing Intelligence

- When pricing rows are entered (hours × rate), totals auto-compute
- Claude checks total vs. scope: if total seems low/high relative to hours/complexity it surfaces a subtle warning ("€1.200 for 40h of dev work seems low — typical rate is €70/h")
- Rate card hard-coded in the Edge Function system prompt: Designer 70 EUR/h, Developer 70 EUR/h, PM 90 EUR/h
- Configurable rate card is out of scope for Phase 1

---

## 11. UI Styling Rules

- **Offer Generator UI** (list, mode selection, editor chrome): Agency OS conventions — Tailwind, shadcn/ui components, navy `Button`, `Card`, `Badge`, `Modal`
- **Generated offer HTML** (preview + output): exact template CSS, completely isolated from Tailwind — served as a standalone HTML document
- The editor's content area shows blocks in a simplified preview of the offer style (not full A4, but matching fonts/colors) so the user can see what they're editing

---

## 12. Section Types Available

| Section | SLO label | Optional |
|---------|-----------|----------|
| Cover | Naslovna stran | No |
| Intro / Letter | Uvodno besedilo | Yes |
| Scope & Phases | Obseg del in faze | No |
| Pricing Table | Stroškovnik | No |
| Timeline | Časovnica | Yes |
| Optional features | Opcijske storitve | Yes |
| Maintenance | Vzdrževanje | Yes |
| SEO | SEO | Yes |
| Analytics | Analitika | Yes |
| Accessibility | Dostopnost | Yes |
| AI / Chatbot | AI funkcionalnosti | Yes |
| E-commerce | E-trgovina | Yes |
| Email marketing | E-poštni marketing | Yes |
| General notes | Splošne opombe | No |
| Payment terms | Plačilni pogoji | No |
| Copyright | Avtorske pravice | Yes (default on) |

---

## 13. Version History

- Auto-snapshot: every time Claude generates (Quick/Structured), a version is saved before overwriting
- Auto-snapshot: every time a section is Claude-rewritten and accepted
- Manual snapshot: "Save version" button in editor sidebar
- Versions stored in `offer_versions` table, shown in sidebar with timestamp
- Restore: clicking a version shows a diff-like preview, confirm to restore (saves current as a version first)

---

## 14. Out of Scope (Phase 1)

- Linking offers to existing clients/projects (future)
- Email sending of offers directly from the tool (future)
- Multi-user collaboration / comments (future)
- Offer analytics (open tracking, etc.) (future)
- Full diff/compare between versions (future — just restore for now)
