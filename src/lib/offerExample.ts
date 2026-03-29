// src/lib/offerExample.ts
// Full example offer based on Template_All_Components.html — "Prenova spletnega mesta NMS"

import { v4 as uuidv4 } from 'uuid'
import type { Offer } from './types'

export function buildExampleOffer(): Omit<Offer, 'id' | 'created_at' | 'updated_at'> {
  return {
    title: 'Prenova spletnega mesta NMS d.o.o.',
    client_name: 'NMS d.o.o.',
    offer_number: '26_012',
    language: 'sl',
    mode: 'quick',
    brief_text: 'Celovita prenova spletnega mesta za podjetje NMS d.o.o.',
    status: 'draft',
    version: 1,
    pricing_total: 18900,
    meta: {
      offer_eyebrow: 'Ponudba 26_012',
      cover_title: 'Prenova spletnega mesta',
      client_display_name: 'NMS d.o.o.',
      client_address: 'Mag. Jana Novak\nNMS d.o.o.\nSlomškova ulica 12\n1000 Ljubljana',
      date_label: 'Marec 2026',
      doc_title: 'Specifikacija ponudbe',
    },
    sections: [
      // ── COVER ──────────────────────────────────────────────────
      {
        id: uuidv4(),
        type: 'cover',
        title: 'Naslovna stran',
        enabled: true,
        order: 0,
        blocks: [],
      },

      // ── INTRO & GOALS ──────────────────────────────────────────
      {
        id: uuidv4(),
        type: 'intro',
        title: 'Uvod & cilji projekta',
        enabled: true,
        order: 1,
        blocks: [
          {
            id: uuidv4(),
            type: 'paragraph',
            content: 'NMS d.o.o. želi celovito prenovo obstoječega spletnega mesta, ki bo postalo osrednje digitalno stičišče za stranke, partnerje in medije. Obstoječa platforma ne ustreza sodobnim standardom UX, hitrosti in mobilne prilagodljivosti. Renderspace pristopa celovito — od strategije in oblikovanja do razvoja in dolgoročnega vzdrževanja.',
          },
          {
            id: uuidv4(),
            type: 'goal-list',
            content: 'Zagotoviti sodobno, hitro in mobilno prijazno spletno mesto\nIzboljšati organsko vidnost (SEO) in dostopnost (WCAG 2.1 AA)\nOmogočiti uredniški ekipi avtonomno upravljanje vsebin prek CMS\nIntegrirati ključne sisteme (CRM, obrazci, analitika)\nVzpostaviti osnovo za dolgoročno digitalno rast',
          },
          {
            id: uuidv4(),
            type: 'audience-grid',
            content: JSON.stringify([
              { role: 'Stranke & uporabniki', need: 'Informacije o produktih, kontakt, podpora', highlight: false },
              { role: 'Poslovni partnerji', need: 'Predstavitev, partnerski portal, dokumentacija', highlight: true },
              { role: 'Mediji & novinarji', need: 'Press kit, sporočila za javnost, kontakt', highlight: false },
            ]),
          },
        ],
      },

      // ── STRATEGY ───────────────────────────────────────────────
      {
        id: uuidv4(),
        type: 'strategy',
        title: 'Strategija pristopa',
        enabled: true,
        order: 2,
        blocks: [
          {
            id: uuidv4(),
            type: 'paragraph',
            content: 'Naš pristop temelji na štirih ključnih stebrih, ki zagotavljajo, da je rešitev ne le tehnično brezhibna, temveč tudi strateško usmerjena in dolgoročno vzdržna.',
          },
          {
            id: uuidv4(),
            type: 'pillar-block',
            content: JSON.stringify([
              {
                num: '01',
                title: 'Razumevanje naročnika in ciljnih skupin',
                text: 'Vsak projekt začnemo z globinskim razumevanjem posla, ciljnih skupin in obstoječih digitalnih točk stika. Izvedemo hevrističen pregled obstoječe platforme, analizo konkurence in delavnice z naročnikovo ekipo.',
                aside_label: 'Outputi faze',
                aside_items: ['UX audit obstoječe rešitve', 'Uporabniški scenariji', 'Funkcionalna specifikacija'],
              },
              {
                num: '02',
                title: 'Oblikovanje in prototipiranje',
                text: 'Na osnovi raziskave oblikujemo vizualno identiteto in interaktivni prototip. Naročnik potrdi celoten dizajn sistem pred začetkom razvoja — brez presenečenj v kasnejših fazah.',
                aside_label: 'Outputi faze',
                aside_items: ['Wireframes vseh pogledov', 'UI dizajn sistem', 'Clickable prototip'],
              },
              {
                num: '03',
                title: 'Tehnični razvoj in integracije',
                text: 'Razvoj poteka agilno v dvotedenskih sprintih z rednimi pregledi. Uporabljamo moderne tehnologije (Next.js, Payload CMS) z osredotočenostjo na zmogljivost in varnost.',
                aside_label: 'Outputi faze',
                aside_items: ['Staging okolje za pregled', 'Integrirani sistemi', 'Dokumentacija'],
              },
              {
                num: '04',
                title: 'Lansiranje in prenos znanja',
                text: 'Pred lansiranjem izvedemo celovito testiranje (QA, dostopnost, hitrost). Po lansiranju zagotovimo 30-dnevno garancijsko vzdrževanje in izobraževanje naročnikove ekipe.',
                aside_label: 'Outputi faze',
                aside_items: ['Produkcijsko okolje', 'Izobraževanje ekipe', 'Dokumentacija CMS'],
              },
            ]),
          },
        ],
      },

      // ── PHASES ─────────────────────────────────────────────────
      {
        id: uuidv4(),
        type: 'phases',
        title: 'Faze izvedbe',
        enabled: true,
        order: 3,
        blocks: [
          {
            id: uuidv4(),
            type: 'phase-block',
            content: JSON.stringify({
              tag: 'FAZA 1',
              title: 'Odkrivanje & strategija',
              deadline: 'April 2026',
              items: [
                'Kick-off delavnica z naročnikovo ekipo',
                'UX audit obstoječe platforme',
                'Analiza konkurence in benchmarking',
                'Definicija informacijske arhitekture',
                'Funkcionalna specifikacija',
              ],
              deliverables: ['Strategški dokument', 'IA diagram', 'Funkcionalna specifikacija'],
            }),
          },
          {
            id: uuidv4(),
            type: 'phase-block',
            content: JSON.stringify({
              tag: 'FAZA 2',
              title: 'Oblikovanje & prototip',
              deadline: 'Maj 2026',
              items: [
                'Wireframes za vse ključne poglede',
                'UI dizajn sistem (barvna paleta, tipografija, komponente)',
                'High-fidelity dizajn vseh strani',
                'Interaktivni Figma prototip',
                'Naročnikova potrditev dizajna',
              ],
              deliverables: ['Figma dizajn sistem', 'Clickable prototip', 'Potrjeni dizajni'],
            }),
          },
          {
            id: uuidv4(),
            type: 'phase-block',
            content: JSON.stringify({
              tag: 'FAZA 3',
              title: 'Razvoj & integracije',
              deadline: 'Julij 2026',
              items: [
                'Postavitev Next.js + Payload CMS infrastrukture',
                'Frontend razvoj po potrjenih dizajnih',
                'CMS konfiguracija in vsebinski modeli',
                'Integracije: HubSpot CRM, Google Analytics 4, kontaktni obrazci',
                'SEO optimizacija in metadata',
                'Testiranje zmogljivosti (Core Web Vitals)',
              ],
              deliverables: ['Staging okolje', 'CMS dokumentacija', 'Integracijska poročila'],
            }),
          },
          {
            id: uuidv4(),
            type: 'phase-block',
            content: JSON.stringify({
              tag: 'FAZA 4',
              title: 'Testiranje & lansiranje',
              deadline: 'Avgust 2026',
              items: [
                'QA testiranje (cross-browser, mobilne naprave)',
                'Dostopnostni pregled (WCAG 2.1 AA)',
                'Prenos vsebine na produkcijsko okolje',
                'Izobraževanje uredniške ekipe (CMS)',
                'Lansiranje in monitoring',
                '30-dnevno garancijsko vzdrževanje',
              ],
              deliverables: ['Produkcijsko spletno mesto', 'QA poročilo', 'CMS navodila za uredništvo'],
            }),
          },
        ],
      },

      // ── FUNCTIONALITY ──────────────────────────────────────────
      {
        id: uuidv4(),
        type: 'functionality',
        title: 'Funkcionalnosti',
        enabled: true,
        order: 4,
        blocks: [
          {
            id: uuidv4(),
            type: 'func-grid',
            content: JSON.stringify([
              {
                num: '01',
                title: 'CMS — Upravljanje vsebin',
                desc: 'Payload CMS z vizualnim urejevalnikom za neodvisno urejanje strani, novic in produktov.',
                tags: ['Payload CMS', 'Rich text editor', 'Media manager'],
              },
              {
                num: '02',
                title: 'SEO & Zmogljivost',
                desc: 'Tehnični SEO vgrajen v strukturo: metadata, sitemap, robots.txt, structured data.',
                tags: ['Next.js SSG/ISR', 'Core Web Vitals', 'Sitemap'],
              },
              {
                num: '03',
                title: 'Večjezičnost',
                desc: 'Podpora za slovensko in angleško različico z avtomatskim SEO hreflang.',
                tags: ['SL + EN', 'i18n routing', 'hreflang'],
              },
              {
                num: '04',
                title: 'Obrazci & CRM integracija',
                desc: 'Kontaktni in povpraševalni obrazci z neposredno integracijo v HubSpot CRM.',
                tags: ['HubSpot', 'Email notifikacije', 'Spam zaščita'],
              },
              {
                num: '05',
                title: 'Analitika & sledenje',
                desc: 'Google Analytics 4, Hotjar za toplote klik, Cookie consent po GDPR.',
                tags: ['GA4', 'GTM', 'GDPR consent'],
              },
              {
                num: '06',
                title: 'Dostopnost (WCAG 2.1 AA)',
                desc: 'Certifikacija dostopnosti za javne vsebine in dostop osebam s posebnimi potrebami.',
                tags: ['WCAG 2.1 AA', 'Screen reader', 'Keyboard nav'],
              },
            ]),
          },
        ],
      },

      // ── TECH ───────────────────────────────────────────────────
      {
        id: uuidv4(),
        type: 'tech',
        title: 'Tehnološko okolje',
        enabled: true,
        order: 5,
        blocks: [
          {
            id: uuidv4(),
            type: 'tech-grid',
            content: JSON.stringify([
              { name: 'Next.js 15', desc: 'React framework z SSG/ISR, App Router, optimizacija zmogljivosti' },
              { name: 'Payload CMS', desc: 'Headless CMS z vizualnim urejevalnikom, media managerjem in API-jem' },
              { name: 'TypeScript', desc: 'Strogi tipi za zanesljiv in vzdržen kod' },
              { name: 'PostgreSQL', desc: 'Relacijska baza podatkov za vsebine in uporabniške podatke' },
              { name: 'Vercel / AWS', desc: 'Cloud hosting z globalnim CDN in avtomatskim skaliranjem' },
              { name: 'Figma', desc: 'Oblikovanje in prototipiranje z dzajn sistemom' },
            ]),
          },
          {
            id: uuidv4(),
            type: 'cms-explainer',
            content: JSON.stringify({
              title: 'Zakaj Payload CMS?',
              body: 'Payload CMS je sodobna, odprtokodna rešitev, ki naročnikovi ekipi omogoča popolno avtonomijo pri urejanju vsebin — brez tehničnega znanja. Za razliko od WordPress nima varnostnih ranljivosti in ne zahteva stalnih posodobitev vtičnikov.',
              benefits: [
                'Vizualni urejevalnik — urejanje kar na strani',
                'Brez mesečnih licenčnih stroškov',
                'Polno lastništvo podatkov',
                'Hitro in varno po definiciji',
                'API-first — enostavne integracije',
                'Skalira z rastjo podjetja',
              ],
            }),
          },
        ],
      },

      // ── OPTIONAL SERVICES ──────────────────────────────────────
      {
        id: uuidv4(),
        type: 'optional-services',
        title: 'Opcijske storitve',
        enabled: true,
        order: 6,
        blocks: [
          {
            id: uuidv4(),
            type: 'extra-card',
            content: JSON.stringify([
              {
                tag: 'OPCIJA A',
                title: 'E-commerce modul',
                desc: 'Dodajanje spletne trgovine z integracijo Stripe in upravljanjem zalog. Primerno za do 500 izdelkov.',
                value_label: 'Dodatna investicija',
                value: '+3.200 EUR',
                includes: ['Stripe checkout', 'Katalog izdelkov', 'Upravljanje naročil', 'Email potrditve'],
              },
              {
                tag: 'OPCIJA B',
                title: 'Napredni SEO paket',
                desc: 'Mesečna SEO optimizacija z vsebinsko strategijo, link buildingom in mesečnimi poročili.',
                value_label: 'Mesečna naročnina',
                value: '490 EUR/mes',
                includes: ['Keyword research', 'Vsebinska strategija', 'Link building', 'Mesečno poročilo'],
              },
              {
                tag: 'OPCIJA C',
                title: 'Chatbot integracijo',
                desc: 'AI-powered chatbot za podporo strankam z integracijo v obstoječe sisteme in bazo znanja.',
                value_label: 'Postavitev + naročnina',
                value: '1.800 EUR + 120/mes',
                includes: ['AI chatbot', 'Integracija CRM', 'Baza znanja', 'Analytics'],
              },
            ]),
          },
        ],
      },

      // ── MAINTENANCE ────────────────────────────────────────────
      {
        id: uuidv4(),
        type: 'maintenance',
        title: 'Vzdrževanje in podpora',
        enabled: true,
        order: 7,
        blocks: [
          {
            id: uuidv4(),
            type: 'maint-grid',
            content: JSON.stringify([
              {
                name: 'OSNOVNI',
                price: '150 €/mes',
                featured: false,
                items: [
                  'Mesečni pregled spletne strani',
                  'Mesečne posodobitve in vzdrževanje',
                  'Varnostno kopiranje',
                  'Do 5 podpornih zahtevkov/mes',
                  'Do 1h reševanja težav/mes',
                  'Podpora e-pošta & portal',
                  'Dosegljivost pon–pet, 9–17',
                  'Odzivni čas: 24 ur',
                ],
                note: 'Ne vključuje proaktivnega spremljanja, podpore izven delovnega časa ali razvoja novih funkcij.',
              },
              {
                name: 'PROFESIONALNI',
                price: '300 €/mes',
                featured: true,
                badge: 'PRIPOROČENO',
                items: [
                  'Tedenski pregled spletne strani',
                  'Tedenske posodobitve in vzdrževanje',
                  'Varnostno kopiranje',
                  'Do 12 podpornih zahtevkov/mes',
                  'Do 2h reševanja težav/mes',
                  'Podpora e-pošta & portal',
                  'Dosegljivost pon–pet, 9–17',
                  'Odzivni čas: 8 ur',
                  'Proaktivno vzdrževanje',
                  'Mesečni pregled delovanja',
                  'Osnovno spremljanje kritičnih funkcij',
                ],
              },
              {
                name: 'NAPREDNI',
                price: '800 €/mes',
                featured: false,
                items: [
                  'Dnevni pregled spletne strani',
                  'Tedenske posodobitve in vzdrževanje',
                  'Varnostno kopiranje',
                  'Do 30 podpornih zahtevkov/mes',
                  'Do 5h reševanja težav/mes',
                  'Podpora telefon, e-pošta & portal',
                  'Dosegljivost pon–pet, 9–20',
                  'Odzivni čas: 2 uri',
                  'Celovito reaktivno & proaktivno vzdrž.',
                  'Varnostne revizije & upravljanje kopij',
                  '5 ur razvoja novih funkcij/mes',
                ],
              },
            ]),
          },
          {
            id: uuidv4(),
            type: 'info-box',
            content: '<strong>Za NMS priporočamo prilagojeni paket</strong> — 500 EUR/mes za vzdrževanje spletnega mesta (Payload CMS), vključno z 12 podpornimi zahtevki in 5 urami tehničnega dela mesečno.',
          },
        ],
      },

      // ── TEAM ───────────────────────────────────────────────────
      {
        id: uuidv4(),
        type: 'team',
        title: 'Projektna ekipa',
        enabled: true,
        order: 8,
        blocks: [
          {
            id: uuidv4(),
            type: 'team-grid',
            content: JSON.stringify([
              {
                role: 'Vodja projekta',
                name: 'Nino Erjavec',
                responsibilities: 'Koordinacija projekta, komunikacija z naročnikom, zagotavljanje kakovosti in rokov. Odgovorna kontaktna oseba skozi celoten projekt.',
              },
              {
                role: 'Senior UX/UI dizajner',
                name: 'Ana Kovač',
                responsibilities: 'UX research, wireframes, vizualni dizajn sistem, prototipiranje v Figmi. 8 let izkušenj z digitalnimi produkti.',
              },
              {
                role: 'Senior developer',
                name: 'Marko Breznik',
                responsibilities: 'Next.js razvoj, Payload CMS konfiguracija, integracije API, performance optimizacija in deployment.',
              },
              {
                role: 'Frontend developer',
                name: 'Tina Zorman',
                responsibilities: 'Implementacija UI komponent, animacije, cross-browser testiranje in dostopnostni pregled.',
              },
              {
                role: 'SEO specialist',
                name: 'Luka Petrovič',
                responsibilities: 'Tehnični SEO, keyword research, structured data, Core Web Vitals optimizacija.',
              },
              {
                role: 'QA tester',
                name: 'Maja Horvat',
                responsibilities: 'Funkcionalno in regresijsko testiranje, mobilne naprave, dostopnostni audit.',
              },
            ]),
          },
        ],
      },

      // ── REFERENCES ─────────────────────────────────────────────
      {
        id: uuidv4(),
        type: 'references',
        title: 'Reference',
        enabled: true,
        order: 9,
        blocks: [
          {
            id: uuidv4(),
            type: 'ref-grid',
            content: JSON.stringify([
              {
                client: 'Pirnar d.o.o.',
                title: 'Globalna korporativna platforma',
                desc: 'Večjezično spletno mesto za premium vrata in vhodne sisteme — SLO, EN, DE, FR, IT. Payload CMS, Next.js, 12 jezikovnih različic.',
                tags: ['Next.js', 'Payload CMS', 'Večjezičnost', 'B2B'],
              },
              {
                client: 'Olympic.si',
                title: 'Olimpijski komite Slovenije',
                desc: 'Prenova uradnega spletnega mesta slovenskega olimpijskega komiteja z integriranim novičarskim centrom in medijsko knjižnico.',
                tags: ['WordPress', 'Custom theme', 'Media library', 'SEO'],
              },
              {
                client: 'Hisense Evropa',
                title: 'B2B partner portal',
                desc: 'Interni portal za distributorje in partnerje z upravljanjem dokumentacije, naročil in price listov za 15 evropskih trgov.',
                tags: ['React', 'Node.js', 'B2B portal', 'API integracije'],
              },
              {
                client: 'Studio Moderna',
                title: 'E-commerce platforma',
                desc: 'Spletna trgovina z več kot 1.000 produkti, integracijo plačilnih sistemov in avtomatiziranim upravljanjem zalog za 8 regij.',
                tags: ['WooCommerce', 'Stripe', 'ERP integracija', 'Multi-region'],
              },
            ]),
          },
        ],
      },

      // ── PRICING ────────────────────────────────────────────────
      {
        id: uuidv4(),
        type: 'pricing',
        title: 'Finančna ponudba',
        enabled: true,
        order: 10,
        blocks: [
          {
            id: uuidv4(),
            type: 'pricing-table',
            content: JSON.stringify({
              rows: [
                { label: 'Odkrivanje & strategija (Faza 1)', qty: '16', rate: '90', total: '1440' },
                { label: 'UX/UI dizajn & prototip (Faza 2)', qty: '60', rate: '70', total: '4200' },
                { label: 'Frontend razvoj — Next.js', qty: '80', rate: '70', total: '5600' },
                { label: 'Payload CMS konfiguracija', qty: '24', rate: '70', total: '1680' },
                { label: 'Integracije (HubSpot, GA4, obrazci)', qty: '20', rate: '70', total: '1400' },
                { label: 'SEO optimizacija & Core Web Vitals', qty: '12', rate: '70', total: '840' },
                { label: 'Testiranje & QA', qty: '16', rate: '70', total: '1120' },
                { label: 'Projektno vodenje', qty: '24', rate: '90', total: '2160' },
                { label: 'Izobraževanje ekipe & dokumentacija', qty: '8', rate: '70', total: '560' },
              ],
              grandTotal: '19000',
            }),
          },
          {
            id: uuidv4(),
            type: 'summary-box',
            content: JSON.stringify({
              label: 'Povzetek investicije',
              rows: [
                { name: 'Razvoj spletnega mesta (faze 1–4)', price: '19.000 EUR', optional: false },
                { name: 'Opcija A: E-commerce modul', price: '+3.200 EUR', optional: true },
                { name: 'Vzdrževanje (Profesionalni paket)', price: '300 EUR/mes', optional: false },
              ],
              total_label: 'Skupaj (osnova)',
              total_price: '19.000 EUR',
              total_sub: 'Cene so brez DDV (22%). Plačilo v 3 obrokih.',
            }),
          },
        ],
      },

      // ── NOTES ──────────────────────────────────────────────────
      {
        id: uuidv4(),
        type: 'notes',
        title: 'Splošne opombe',
        enabled: true,
        order: 11,
        blocks: [
          {
            id: uuidv4(),
            type: 'two-col',
            content: JSON.stringify({
              left: {
                label: 'Plačilni pogoji',
                text: 'Plačilo se izvede v treh obrokih: 30% ob podpisu pogodbe, 40% ob predaji prototipa v pregled in 30% ob lansiranju. Vsi zneski so brez DDV.',
              },
              right: {
                label: 'Veljavnost ponudbe',
                text: 'Ponudba velja 30 dni od datuma izdaje (do 26. aprila 2026). Po izteku tega roka se cene in pogoji lahko spremenijo.',
              },
            }),
          },
          {
            id: uuidv4(),
            type: 'paragraph',
            content: 'Ponudba velja za v stroškovniku definirani obseg del. Morebitne spremembe obsega se dogovorijo pisno in zaračunajo ločeno. Vsebine niso vključene v ponudbo — naročnik se zavezuje, da bo pravočasno zagotovil potrebne materiale, tekstovne vsebine in slikovni material.',
          },
        ],
      },

      // ── CLOSING ────────────────────────────────────────────────
      {
        id: uuidv4(),
        type: 'closing',
        title: 'Zaključek',
        enabled: true,
        order: 12,
        blocks: [
          {
            id: uuidv4(),
            type: 'closing-block',
            content: JSON.stringify({
              title: 'Skupaj naredimo nekaj izjemnega.',
              body: 'Verjamemo, da je ta projekt priložnost za NMS d.o.o., da vzpostavi digitalno prisotnost, ki bo odražala kakovost vaših storitev in postala osnova za dolgoročno rast. Renderspace je partner, ki bo z vami od prve ideje do lansiranja in naprej.',
              contacts: [
                { label: 'Vodja projekta', name: 'Nino Erjavec', role: 'nino@renderspace.si · +386 41 123 456' },
                { label: 'Komerciala', name: 'Sara Oblak', role: 'sara@renderspace.si · +386 41 654 321' },
              ],
            }),
          },
        ],
      },
    ],
  }
}
