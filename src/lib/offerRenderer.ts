// src/lib/offerRenderer.ts
import type { Offer, OfferSection, OfferBlock } from './types'

const LOGO_URL = '' // set after Supabase storage setup

const OFFER_CSS = `
  :root {
    --black: #0a0a0a; --ink: #1a1a1a; --gray-dark: #0a0a0a;
    --gray-mid: #555550; --gray-light: #888883;
    --gray-bg: #f5f5f3; --gray-rule: #e0e0dd;
    --white: #ffffff; --orange: #E85C1A;
    --orange-light: #FDF0EA; --orange-dark: #c94a0f;
    --font: 'Figtree', sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font); background: var(--white); color: var(--ink); font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18mm 18mm 24mm; position: relative; background: var(--white); }
  @media screen { body { background: #e8e8e5; } .page { margin: 20px auto; box-shadow: 0 4px 40px rgba(0,0,0,0.12); } .page + .page { margin-top: 0; } }
  @media print { body { background: white; } .page { margin: 0; width: 210mm; height: 297mm; max-height: 297mm; overflow: hidden; page-break-after: always; break-after: page; box-shadow: none; } .page:last-child { page-break-after: avoid; break-after: avoid; } }
  .cover { padding: 0; overflow: hidden; display: flex; flex-direction: column; background: #F2EAE0 !important; position: relative; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .cover::before { content: ''; position: absolute; bottom: -10mm; right: -10mm; width: 160mm; height: 160mm; background: radial-gradient(ellipse at center, #E8320A 0%, #F05A1A 30%, #F5956A 60%, transparent 80%) !important; border-radius: 50%; filter: blur(18px); opacity: 0.92; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .cover::after { content: ''; position: absolute; inset: 0; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.08'/%3E%3C/svg%3E"); pointer-events: none; mix-blend-mode: multiply; }
  .cover-header { position: relative; z-index: 2; padding: 12mm 18mm 0; display: flex; justify-content: space-between; align-items: flex-start; }
  .cover-wordmark img { height: 28px; width: auto; }
  .cover-contact { text-align: right; font-size: 10px; font-weight: 400; color: var(--black); line-height: 1.6; }
  .cover-contact a { color: var(--black); text-decoration: underline; }
  .cover-body { position: relative; z-index: 2; flex: 1; padding: 0 18mm; display: flex; flex-direction: column; justify-content: center; }
  .cover-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--black); margin-bottom: 5mm; }
  .cover-title { font-size: 52px; font-weight: 700; color: var(--black); line-height: 0.95; letter-spacing: -0.03em; margin-bottom: 5mm; max-width: 140mm; }
  .cover-subtitle-main { font-size: 22px; font-weight: 700; color: var(--black); letter-spacing: -0.01em; margin-bottom: 4mm; }
  .cover-meta-row { position: relative; z-index: 2; padding: 7mm 18mm; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; }
  .cover-meta-item { padding-right: 6mm; }
  .cover-meta-item + .cover-meta-item { padding-left: 6mm; border-left: 1px solid rgba(0,0,0,0.15); }
  .cover-meta-label { font-size: 7.5px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--black); margin-bottom: 3px; }
  .cover-meta-value { font-size: 11px; font-weight: 500; color: var(--black); line-height: 1.5; }
  .cover .page-footer { display: none; }
  .doc-header { padding-bottom: 7mm; display: flex; flex-direction: column; }
  .doc-header-top { display: flex; justify-content: flex-end; align-items: flex-start; margin-bottom: 3mm; }
  .doc-header-logos { display: flex; align-items: center; gap: 8px; }
  .doc-header-logos img { height: 20px; width: auto; }
  .doc-header h1 { font-size: 34px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; color: var(--black); }
  .section-label { font-size: 16px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--black); padding-bottom: 4px; border-bottom: 2px solid var(--black); margin-bottom: 5mm; margin-top: 8mm; }
  .section-label:first-of-type { margin-top: 4mm; }
  .section-label.sub { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; padding-bottom: 3px; border-bottom: 1px solid var(--gray-rule); margin-top: 6mm; }
  .section-label.orange { color: var(--orange); border-bottom-color: var(--orange); }
  .page-footer { position: absolute; bottom: 10mm; left: 18mm; right: 18mm; display: flex; justify-content: space-between; align-items: center; padding-top: 3mm; }
  .page-footer span { font-size: 8.5px; color: var(--gray-light); font-weight: 400; }
  .page-footer .pn { font-weight: 600; color: var(--gray-mid); }
  .intro-text { font-size: 12px; line-height: 1.7; color: var(--gray-dark); margin-bottom: 6mm; white-space: pre-wrap; }
  .intro-text strong { color: var(--black); font-weight: 700; }
  .goal-list { display: flex; flex-direction: column; gap: 2px; margin-bottom: 6mm; }
  .goal-item { display: flex; align-items: center; gap: 8px; padding: 5px 10px; background: #F2EAE0; border-left: 3px solid var(--orange); font-size: 12px; font-weight: 500; color: var(--ink); line-height: 1.4; }
  .goal-item::before { content: '→'; color: var(--orange); font-weight: 800; font-size: 12px; flex-shrink: 0; }
  .audience-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; margin-bottom: 6mm; }
  .audience-card { background: #F2EAE0; padding: 5mm; }
  .audience-card.highlight { background: var(--black); }
  .audience-role { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--black); margin-bottom: 3mm; }
  .audience-card.highlight .audience-role { color: var(--orange); }
  .audience-need { font-size: 12px; color: var(--black); line-height: 1.5; }
  .audience-card.highlight .audience-need { color: rgba(255,255,255,0.7); }
  .pillar-block { border: 1px solid var(--gray-rule); margin-bottom: 3mm; break-inside: avoid; }
  .pillar-head { display: flex; align-items: stretch; background: var(--black); }
  .pillar-num { background: var(--orange) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: var(--white); font-size: 8px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; padding: 6px 10px; display: flex; align-items: center; min-width: 10mm; justify-content: center; }
  .pillar-head-info { padding: 6px 10px; flex: 1; }
  .pillar-title { font-size: 12px; font-weight: 800; color: var(--white); line-height: 1.2; text-transform: uppercase; letter-spacing: 0.04em; }
  .pillar-body { padding: 6px 10px 8px; display: flex; flex-direction: column; gap: 5px; }
  .pillar-text { font-size: 11px; line-height: 1.65; color: var(--gray-dark); }
  .pillar-text strong { color: var(--black); font-weight: 700; }
  .pillar-bullets { margin-top: 5px; display: flex; flex-direction: column; gap: 2px; }
  .pillar-bullet { font-size: 11px; color: var(--gray-dark); line-height: 1.5; display: flex; align-items: baseline; gap: 5px; }
  .pillar-bullet::before { content: '·'; color: var(--orange); font-weight: 900; flex-shrink: 0; }
  .pillar-aside { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--gray-rule); }
  .pillar-aside-label { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: var(--orange); margin-bottom: 4px; }
  .pillar-aside-items { display: flex; flex-wrap: wrap; gap: 3px; }
  .pillar-aside-item { font-size: 9.5px; font-weight: 600; background: var(--gray-bg); color: var(--black); border: 1px solid var(--gray-rule); padding: 2px 8px; border-left: 2px solid var(--orange); }
  .phase-block { margin-bottom: 4mm; border: 1px solid var(--gray-rule); break-inside: avoid; }
  .phase-head { display: flex; align-items: stretch; background: var(--black) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .phase-tag { background: var(--orange) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: var(--white); font-size: 8px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; padding: 6px 10px; display: flex; align-items: center; white-space: nowrap; }
  .phase-head-info { padding: 6px 10px; flex: 1; }
  .phase-title { font-size: 13px; font-weight: 800; color: var(--white); line-height: 1.2; }
  .phase-deadline { font-size: 8.5px; font-weight: 700; color: var(--white); background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); padding: 3px 9px; white-space: nowrap; align-self: center; margin-left: auto; flex-shrink: 0; }
  .phase-body { padding: 5px 10px 7px; background: var(--white); }
  .phase-items { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 8mm; }
  .phase-item { font-size: 12px; color: var(--gray-dark); line-height: 1.5; display: flex; align-items: baseline; gap: 5px; }
  .phase-item::before { content: '·'; color: var(--orange); font-weight: 900; flex-shrink: 0; }
  .phase-deliverables { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--gray-rule); }
  .phase-deliverables-label { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: var(--orange); margin-bottom: 4px; }
  .phase-deliverables-items { display: flex; flex-wrap: wrap; gap: 3px; }
  .phase-output { font-size: 9.5px; font-weight: 600; background: var(--gray-bg); color: var(--black); border: 1px solid var(--gray-rule); border-left: 2px solid var(--orange); padding: 2px 8px; }
  .service-block { margin-bottom: 5mm; break-inside: avoid; }
  .service-head { background: var(--orange) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; padding: 7px 12px; margin-bottom: 4px; }
  .service-title { font-size: 14px; font-weight: 800; color: var(--white); }
  .service-body { padding: 2px 0 0 13px; }
  .service-rich-items { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; margin-bottom: 4px; }
  .service-rich-item { font-size: 11.5px; line-height: 1.55; color: var(--gray-dark); border-left: 2px solid var(--orange); padding-left: 8px; }
  .service-rich-title { display: inline; font-weight: 700; color: var(--black); }
  .service-rich-title::after { content: ' — '; font-weight: 400; color: var(--gray-mid); }
  .service-rich-desc { display: inline; font-size: 11.5px; color: var(--gray-mid); }
  .service-output-box { margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--gray-rule); display: flex; align-items: baseline; flex-wrap: wrap; gap: 2px 6px; }
  .service-output-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--orange); margin-right: 6px; white-space: nowrap; }
  .service-output-item { font-size: 10px; font-weight: 500; color: var(--gray-dark); line-height: 1.5; }
  .service-output-item + .service-output-item::before { content: '·'; color: var(--orange); font-weight: 900; margin-right: 6px; }
  .func-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 4mm; }
  .func-card { border: 1px solid var(--gray-rule); break-inside: avoid; }
  .func-card-head { background: var(--black) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; display: flex; align-items: stretch; }
  .func-card-num { background: var(--orange) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: var(--white); font-size: 9px; font-weight: 800; padding: 5px 8px; display: flex; align-items: center; justify-content: center; min-width: 9mm; }
  .func-card-title { font-size: 11px; font-weight: 800; color: var(--white); padding: 5px 8px; display: flex; align-items: center; flex: 1; line-height: 1.2; }
  .func-card-body { padding: 5px 8px 7px; }
  .func-card-desc { font-size: 10.5px; line-height: 1.55; color: var(--gray-dark); margin-bottom: 4px; }
  .func-tags { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 4px; padding-top: 4px; border-top: 1px solid var(--gray-rule); }
  .func-tag { font-size: 8px; font-weight: 600; color: var(--black); background: var(--gray-bg); border: 1px solid var(--gray-rule); padding: 1.5px 5px; }
  .func-card.wide { grid-column: 1 / -1; }
  .func-card.wide .func-card-body { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .price-table { width: 100%; border-collapse: collapse; font-family: var(--font); margin-bottom: 5mm; }
  .price-table thead tr { background: var(--black) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .price-table thead th { font-size: 9px; font-weight: 700; color: var(--white); text-align: left; padding: 7px 10px; letter-spacing: 0.08em; text-transform: uppercase; }
  .price-table thead th:last-child { text-align: right; white-space: nowrap; }
  .price-table tbody tr { background: var(--white); }
  .price-table tbody tr:nth-child(even) { background: var(--gray-bg); }
  .price-table tbody td { font-size: 12px; color: var(--gray-dark); padding: 8px 10px; border-bottom: 1px solid var(--gray-rule); line-height: 1.4; vertical-align: top; }
  .price-table tbody td:first-child { color: var(--black); }
  .price-table tbody td:last-child { text-align: right; font-weight: 700; color: var(--black); white-space: nowrap; vertical-align: middle; }
  .price-table .td-name { font-size: 12px; font-weight: 700; color: var(--black); display: block; }
  .price-table .td-desc { font-size: 10px; font-weight: 400; color: var(--gray-mid); display: block; margin-top: 1px; }
  .price-table tfoot td { background: var(--black) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: var(--white); font-size: 12px; font-weight: 800; padding: 8px 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  .price-table tfoot td:last-child { text-align: right; color: var(--white); font-size: 16px; white-space: nowrap; }
  .badge { display: inline-block; font-size: 7.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 2px 6px; border-radius: 2px; margin-left: 5px; vertical-align: middle; }
  .badge-opt { background: var(--orange-light); color: var(--orange-dark); }
  .badge-rec { background: var(--black); color: var(--white); }
  .extra-card { border: 1px solid var(--gray-rule); margin-bottom: 4mm; break-inside: avoid; }
  .extra-card-head { background: var(--black) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; padding: 6px 10px; display: flex; align-items: center; gap: 8px; }
  .extra-card-title { font-size: 13px; font-weight: 800; color: var(--white); line-height: 1.2; }
  .extra-card-price-tag { margin-left: auto; text-align: right; flex-shrink: 0; }
  .extra-card-price { font-size: 14px; font-weight: 900; color: var(--orange); }
  .extra-card-price-label { font-size: 7.5px; color: var(--white); text-align: right; opacity: 0.75; }
  .extra-card-body { padding: 7px 10px 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .extra-card-desc { font-size: 12px; line-height: 1.6; color: var(--gray-dark); }
  .extra-card-value { background: var(--orange-light); padding: 6px 8px; border-left: 3px solid var(--orange); }
  .extra-card-value-label { font-size: 7.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--orange); margin-bottom: 3px; }
  .extra-card-value-text { font-size: 10.5px; line-height: 1.5; color: var(--gray-dark); font-weight: 500; }
  .extra-card-includes { margin-top: 5px; padding-top: 5px; border-top: 1px solid var(--gray-rule); display: flex; flex-wrap: wrap; gap: 3px; }
  .extra-tag { font-size: 9px; font-weight: 600; color: var(--gray-dark); background: var(--gray-bg); border: 1px solid var(--gray-rule); padding: 2px 7px; }
  .maint-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 5mm; }
  .maint-card { border: 1px solid var(--gray-rule); display: flex; flex-direction: column; }
  .maint-card.featured { border-color: var(--orange); }
  .maint-card-head { padding: 5px 8px; background: var(--gray-bg); border-bottom: 1px solid var(--gray-rule); display: flex; justify-content: space-between; align-items: center; }
  .maint-card.featured .maint-card-head { background: var(--orange) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; border-bottom-color: var(--orange); }
  .maint-card-name { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--black); }
  .maint-card.featured .maint-card-name { color: var(--white); }
  .maint-card-price { font-size: 13px; font-weight: 900; color: var(--black); }
  .maint-card.featured .maint-card-price { color: var(--white); }
  .maint-card-body { padding: 6px 8px 7px; flex: 1; }
  .maint-item { font-size: 10.5px; color: var(--gray-dark); line-height: 1.6; display: flex; gap: 5px; }
  .maint-item::before { content: '·'; color: var(--orange); font-weight: 900; }
  .sla-table { width: 100%; border-collapse: collapse; margin-bottom: 5mm; font-family: var(--font); }
  .sla-table thead tr { background: var(--black) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .sla-table thead th { font-size: 9px; font-weight: 700; color: var(--white); padding: 6px 10px; text-align: left; letter-spacing: 0.08em; text-transform: uppercase; }
  .sla-table tbody tr { background: var(--white); }
  .sla-table tbody tr:nth-child(even) { background: var(--gray-bg); }
  .sla-table tbody td { font-size: 11px; color: var(--gray-dark); padding: 7px 10px; border-bottom: 1px solid var(--gray-rule); vertical-align: top; line-height: 1.4; }
  .sla-table tbody td:first-child { font-weight: 700; color: var(--black); }
  .sla-priority { display: inline-block; font-size: 8px; font-weight: 800; padding: 2px 7px; text-transform: uppercase; letter-spacing: 0.06em; }
  .sla-priority.critical { background: #fee2e2; color: #b91c1c; }
  .sla-priority.high { background: var(--orange-light); color: var(--orange-dark); }
  .sla-priority.medium { background: #fef9c3; color: #92400e; }
  .sla-priority.low { background: var(--gray-bg); color: var(--gray-mid); }
  .team-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-bottom: 5mm; }
  .team-card { border: 1px solid var(--gray-rule); break-inside: avoid; }
  .team-card-head { background: var(--black) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; padding: 6px 8px; }
  .team-card-role { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--orange); margin-bottom: 2px; }
  .team-card-name { font-size: 12px; font-weight: 800; color: var(--white); line-height: 1.2; }
  .team-card-body { padding: 5px 8px 6px; }
  .team-card-resp { font-size: 10.5px; color: var(--gray-dark); line-height: 1.55; }
  .ref-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 5mm; }
  .ref-card { border: 1px solid var(--gray-rule); break-inside: avoid; }
  .ref-card-img { width: 100%; height: 22mm; background: var(--gray-bg); display: flex; align-items: center; justify-content: center; }
  .ref-card-img-placeholder { font-size: 9px; color: var(--gray-mid); letter-spacing: 0.06em; text-transform: uppercase; }
  .ref-card-body { padding: 5px 8px 7px; }
  .ref-card-client { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: var(--orange); margin-bottom: 2px; }
  .ref-card-title { font-size: 12px; font-weight: 800; color: var(--black); margin-bottom: 3px; line-height: 1.2; }
  .ref-card-desc { font-size: 10px; color: var(--gray-mid); line-height: 1.5; }
  .ref-tags { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 5px; padding-top: 4px; border-top: 1px solid var(--gray-rule); }
  .ref-tag { font-size: 7.5px; font-weight: 600; color: var(--black); background: var(--gray-bg); border: 1px solid var(--gray-rule); padding: 1.5px 5px; }
  .summary-box { background: var(--black) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; padding: 8mm 10mm; margin-top: 5mm; }
  .summary-box-label { font-size: 8px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--white); margin-bottom: 4mm; }
  .summary-rows { display: flex; flex-direction: column; gap: 3px; margin-bottom: 5mm; }
  .summary-row { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .summary-row-name { font-size: 12px; color: var(--white); font-weight: 400; }
  .summary-row-price { font-size: 11px; font-weight: 700; color: var(--white); }
  .summary-row.opt .summary-row-name { opacity: 0.55; }
  .summary-row.opt .summary-row-price { opacity: 0.55; }
  .summary-total { display: flex; justify-content: space-between; align-items: baseline; padding-top: 5mm; border-top: 1px solid rgba(255,255,255,0.2); }
  .summary-total-label { font-size: 12px; font-weight: 700; color: var(--white); text-transform: uppercase; letter-spacing: 0.04em; }
  .summary-total-price { font-size: 28px; font-weight: 900; color: var(--orange); letter-spacing: -0.02em; }
  .summary-total-sub { font-size: 9px; color: var(--white); font-weight: 300; margin-top: 2px; text-align: right; opacity: 0.5; }
  .cms-explainer { background: var(--gray-bg); border-left: 3px solid var(--orange); padding: 6mm 8mm; margin-top: 4mm; }
  .cms-explainer-title { font-size: 16px; font-weight: 800; color: var(--black); margin-bottom: 2mm; }
  .cms-explainer-body { font-size: 12px; line-height: 1.65; color: var(--gray-dark); margin-bottom: 3mm; }
  .cms-benefits { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; margin-top: 3mm; }
  .cms-benefit { display: flex; align-items: baseline; gap: 6px; padding: 4px 6px; font-size: 10.5px; color: var(--gray-dark); line-height: 1.4; }
  .cms-benefit::before { content: '✓'; color: var(--orange); font-weight: 900; font-size: 10px; flex-shrink: 0; }
  .lang-row { display: flex; gap: 2px; margin-bottom: 5mm; }
  .lang-pill { padding: 5px 10px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  .lang-pill.primary { background: var(--black); color: var(--white); }
  .lang-pill.required { background: var(--orange); color: var(--white); }
  .lang-pill.recommended { background: var(--gray-bg); color: var(--gray-mid); border: 1px solid var(--gray-rule); }
  .closing-block { background: var(--orange) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; padding: 8mm 10mm; margin-top: 6mm; }
  .closing-title { font-size: 18px; font-weight: 900; color: var(--white); letter-spacing: -0.01em; margin-bottom: 3mm; }
  .closing-body { font-size: 12px; color: rgba(255,255,255,0.85); line-height: 1.6; margin-bottom: 5mm; }
  .closing-contacts { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .closing-contact-label { font-size: 8px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 2px; }
  .closing-contact-name { font-size: 12px; font-weight: 800; color: var(--white); margin-bottom: 1px; }
  .closing-contact-role { font-size: 10px; color: rgba(255,255,255,0.65); }
  .tech-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 3mm; margin-bottom: 4mm; }
  .tech-item { background: var(--gray-bg); padding: 6px 8px; display: flex; align-items: center; gap: 7px; }
  .tech-name { font-size: 10px; font-weight: 700; color: var(--black); line-height: 1.2; }
  .tech-desc { font-size: 9.5px; color: var(--gray-mid); }
  .note { font-size: 10px; color: var(--gray-mid); line-height: 1.5; font-style: italic; margin-top: 3mm; }
  .divider { height: 1px; background: var(--gray-rule); margin: 5mm 0; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .col-label { font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gray-mid); margin-bottom: 3mm; padding-bottom: 3px; border-bottom: 1px solid var(--gray-rule); }
  .small-text { font-size: 10px; color: var(--gray-mid); line-height: 1.5; }
  .info-box { background: var(--orange-light); border-left: 3px solid var(--orange); padding: 5px 10px; margin-bottom: 4mm; font-size: 11px; line-height: 1.6; color: var(--ink); }
  .info-box strong { font-weight: 700; color: var(--black); }
  .detail-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; }
  .detail-table thead th { background: var(--orange) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: var(--white); font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 8px; text-align: left; }
  .detail-table thead th:nth-child(2) { text-align: center; width: 20mm; }
  .detail-table thead th:nth-child(3) { text-align: right; width: 28mm; }
  .detail-table thead th:last-child { text-align: right; width: 32mm; white-space: nowrap; }
  .detail-table .project-row td { padding: 8px 8px 6px; background: var(--white); font-size: 12px; font-weight: 700; color: var(--black); }
  .detail-table .desc-row td { padding: 0 8px 8px; background: var(--white); border-bottom: 1px solid var(--gray-rule); font-size: 10px; color: var(--ink); line-height: 1.6; }
  .bullet-list { list-style: none; padding: 0; margin: 0 0 6mm 0; }
  .bullet-list li { display: flex; gap: 6px; padding: 1px 0; font-size: 12px; line-height: 1.6; }
  .bullet-list li::before { content: '—'; color: var(--orange); font-weight: 700; flex-shrink: 0; }
  .detail-table tbody tr.data-row:nth-child(odd) { background: var(--white); }
  .detail-table tbody tr.data-row:nth-child(even) { background: var(--gray-bg); }
  .detail-table tbody tr.data-row td { padding: 7px 8px; border-bottom: 1px solid var(--gray-rule); font-size: 11px; color: var(--ink); vertical-align: middle; }
  .detail-table tbody tr.data-row td:first-child { font-weight: 600; color: var(--black); }
  .detail-table tbody tr.data-row td:nth-child(2) { text-align: center; }
  .detail-table tbody tr.data-row td:nth-child(3) { text-align: right; }
  .detail-table tbody tr.data-row td:last-child { text-align: right; font-weight: 600; }
  .detail-table .subtotal td { background: var(--black) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: var(--white); font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; border-bottom: none; padding: 8px; vertical-align: middle; }
  .detail-table .subtotal td:last-child { text-align: right; font-size: 14px; font-weight: 900; white-space: nowrap; }
  .detail-table .grandtotal td { background: var(--orange) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color: var(--white); font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; border-bottom: none; padding: 9px 8px; vertical-align: middle; }
  .detail-table .grandtotal td:last-child { text-align: right; font-size: 15px; font-weight: 900; white-space: nowrap; }
  .total-highlight { background: var(--black) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; padding: 8mm 10mm; display: flex; justify-content: space-between; align-items: center; margin-top: 4mm; }
  .total-highlight-label { font-size: 12px; font-weight: 700; color: var(--white); }
  .total-highlight-price { font-size: 36px; font-weight: 900; color: var(--orange); letter-spacing: -0.02em; line-height: 1; }
  .stat-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 3mm; margin-bottom: 7mm; }
  .stat-card-black { background: var(--black) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; padding: 6mm 7mm; }
  .stat-card-orange { background: var(--orange) !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; padding: 6mm 7mm; }
  .stat-card-light { background: var(--gray-bg); border: 1px solid var(--gray-rule); padding: 6mm 7mm; }
  .stat-num-orange { font-size: 32px; font-weight: 900; color: var(--orange); letter-spacing: -0.02em; line-height: 1; }
  .stat-num-white { font-size: 32px; font-weight: 900; color: var(--white); letter-spacing: -0.02em; line-height: 1; }
  .stat-num-black { font-size: 32px; font-weight: 900; color: var(--black); letter-spacing: -0.02em; line-height: 1; }
  .stat-label-white { font-size: 10px; font-weight: 600; color: var(--white); margin-top: 3px; text-transform: uppercase; letter-spacing: 0.06em; }
  .stat-label-black { font-size: 10px; font-weight: 600; color: var(--black); margin-top: 3px; text-transform: uppercase; letter-spacing: 0.06em; }
  .stat-sub-muted-white { font-size: 9px; color: rgba(255,255,255,0.45); margin-top: 2px; }
  .stat-sub-muted-gray { font-size: 9px; color: var(--gray-mid); margin-top: 2px; }
  .print-btn { position: fixed; top: 16px; right: 16px; background: #0a0a0a; color: #fff; border: none; padding: 8px 18px; font-family: 'Figtree', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; border-radius: 4px; z-index: 9999; }
  .print-hint { position: fixed; top: 56px; right: 16px; font-family: 'Figtree', sans-serif; font-size: 10px; color: #888; z-index: 9999; max-width: 180px; text-align: right; line-height: 1.4; }
  @media print { .print-btn { display: none; } .print-hint { display: none; } }
`

function renderBlock(block: OfferBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'notes':
    case 'boilerplate':
      return `<div class="intro-text">${block.content.replace(/\n/g, '<br>')}</div>`

    case 'bullet-list': {
      const items = block.content.split('\n').filter(line => line.trim())
      return `<ul class="bullet-list">${items.map(i => `<li>${i.replace(/^—\s*/, '')}</li>`).join('')}</ul>`
    }

    case 'goal-list': {
      const items = block.content.split('\n').filter(line => line.trim())
      return `<div class="goal-list">${items.map(i => `<div class="goal-item">${i}</div>`).join('')}</div>`
    }

    case 'phase-block': {
      try {
        const phase = JSON.parse(block.content) as {
          tag?: string; title: string; deadline?: string; items?: string[]; deliverables?: string[]
        }
        const itemsHtml = (phase.items ?? []).filter(Boolean).map(i => `<div class="phase-item">${i}</div>`).join('')
        const delivHtml = phase.deliverables && phase.deliverables.length
          ? `<div class="phase-deliverables">
              <div class="phase-deliverables-label">Deliverables</div>
              <div class="phase-deliverables-items">${phase.deliverables.filter(Boolean).map(d => `<div class="phase-output">${d}</div>`).join('')}</div>
            </div>`
          : ''
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
    ${delivHtml}
  </div>
</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'pillar-block': {
      try {
        const raw = JSON.parse(block.content)
        type PillarItem = { num?: string; title: string; text?: string; bullets?: string[]; asideLabel?: string; aside_label?: string; asideItems?: string[]; aside_items?: string[] }
        const pillars: PillarItem[] = Array.isArray(raw) ? raw : [raw]
        return pillars.map(p => {
          const bulletsHtml = p.bullets && p.bullets.length
            ? `<div class="pillar-bullets">${p.bullets.filter(Boolean).map(b => `<div class="pillar-bullet">${b}</div>`).join('')}</div>`
            : ''
          const aLabel = p.asideLabel ?? p.aside_label
          const aItems = p.asideItems ?? p.aside_items ?? []
          const asideHtml = aLabel && aItems.length
            ? `<div class="pillar-aside">
                <div class="pillar-aside-label">${aLabel}</div>
                <div class="pillar-aside-items">${aItems.filter(Boolean).map(i => `<div class="pillar-aside-item">${i}</div>`).join('')}</div>
              </div>`
            : ''
          return `
<div class="pillar-block">
  <div class="pillar-head">
    ${p.num ? `<div class="pillar-num">${p.num}</div>` : ''}
    <div class="pillar-head-info">
      <div class="pillar-title">${p.title}</div>
    </div>
  </div>
  <div class="pillar-body">
    ${p.text ? `<div class="pillar-text">${p.text}</div>` : ''}
    ${bulletsHtml}
    ${asideHtml}
  </div>
</div>`
        }).join('')
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'audience-grid': {
      try {
        const raw = JSON.parse(block.content)
        const cards: { role: string; need: string; highlight?: boolean }[] = Array.isArray(raw) ? raw : raw.cards ?? []
        return `<div class="audience-grid">${cards.map(c => `
  <div class="audience-card${c.highlight ? ' highlight' : ''}">
    <div class="audience-role">${c.role}</div>
    <div class="audience-need">${c.need}</div>
  </div>`).join('')}</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'func-grid': {
      try {
        const raw = JSON.parse(block.content)
        const items: { num?: string; title: string; desc: string; tags?: string[]; wide?: boolean }[] = Array.isArray(raw) ? raw : raw.items ?? []
        return `<div class="func-grid">${items.map(item => `
  <div class="func-card${item.wide ? ' wide' : ''}">
    <div class="func-card-head">
      ${item.num ? `<div class="func-card-num">${item.num}</div>` : ''}
      <div class="func-card-title">${item.title}</div>
    </div>
    <div class="func-card-body">
      <div class="func-card-desc">${item.desc}</div>
      ${item.tags && item.tags.length ? `<div class="func-tags">${item.tags.map(t => `<span class="func-tag">${t}</span>`).join('')}</div>` : ''}
    </div>
  </div>`).join('')}</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'service-block': {
      try {
        const sb = JSON.parse(block.content) as {
          title: string; items: { name: string; desc: string }[]; outputs?: string[]
        }
        const richItems = sb.items.map(it => `
  <div class="service-rich-item">
    <span class="service-rich-title">${it.name}</span>
    <span class="service-rich-desc">${it.desc}</span>
  </div>`).join('')
        const outputHtml = sb.outputs && sb.outputs.length
          ? `<div class="service-output-box">
              <span class="service-output-label">Output</span>
              ${sb.outputs.map(o => `<span class="service-output-item">${o}</span>`).join('')}
            </div>`
          : ''
        return `
<div class="service-block">
  <div class="service-head"><div class="service-title">${sb.title}</div></div>
  <div class="service-body">
    <div class="service-rich-items">${richItems}</div>
    ${outputHtml}
  </div>
</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'extra-card': {
      try {
        const raw = JSON.parse(block.content)
        // Support both array of cards and single card object
        const cards: { tag?: string; title: string; price?: string; priceLabel?: string; desc: string; value_label?: string; valueLabel?: string; value?: string; valueText?: string; includes?: string[]; tags?: string[] }[] = Array.isArray(raw) ? raw : [raw]
        return cards.map(ec => {
          const tagItems = ec.includes ?? ec.tags ?? []
          const tagsHtml = tagItems.length
            ? `<div class="extra-card-includes">${tagItems.map(t => `<span class="extra-tag">${t}</span>`).join('')}</div>`
            : ''
          const vLabel = ec.value_label ?? ec.valueLabel
          const vText = ec.value ?? ec.valueText
          return `
<div class="extra-card">
  <div class="extra-card-head">
    <div>
      ${ec.tag ? `<div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:var(--orange);margin-bottom:2px;">${ec.tag}</div>` : ''}
      <div class="extra-card-title">${ec.title}</div>
    </div>
    ${ec.price ? `<div class="extra-card-price-tag">
      <div class="extra-card-price">${ec.price}</div>
      ${ec.priceLabel ? `<div class="extra-card-price-label">${ec.priceLabel}</div>` : ''}
    </div>` : ''}
  </div>
  <div class="extra-card-body">
    <div class="extra-card-desc">${ec.desc}</div>
    ${vLabel ? `<div class="extra-card-value">
      <div class="extra-card-value-label">${vLabel}</div>
      <div class="extra-card-value-text">${vText ?? ''}</div>
    </div>` : ''}
    ${tagsHtml}
  </div>
</div>`
        }).join('')
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'maint-grid': {
      try {
        const raw = JSON.parse(block.content)
        const cards: { name: string; price: string; items: string[]; featured?: boolean; badge?: string; note?: string }[] = Array.isArray(raw) ? raw : raw.cards ?? []
        return `<div class="maint-grid">${cards.map(c => `
  <div class="maint-card${c.featured ? ' featured' : ''}">
    <div class="maint-card-head">
      <div>
        <div class="maint-card-name">${c.name}</div>
        ${c.badge ? `<div style="font-size:8px;font-weight:800;text-transform:uppercase;background:rgba(255,255,255,0.2);padding:2px 6px;display:inline-block;margin-top:2px;letter-spacing:0.06em;">${c.badge}</div>` : ''}
      </div>
      <div class="maint-card-price">${c.price}</div>
    </div>
    <div class="maint-card-body">${c.items.filter(Boolean).map(i => `<div class="maint-item">${i}</div>`).join('')}
    ${c.note ? `<div class="note" style="margin-top:6px;">${c.note}</div>` : ''}
    </div>
  </div>`).join('')}</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'sla-table': {
      try {
        const st = JSON.parse(block.content) as {
          rows: { priority: string; priorityClass: string; desc: string; response: string; resolution: string }[]
        }
        return `
<table class="sla-table">
  <thead><tr><th>Incident type</th><th>Priority</th><th>Description</th><th>Response</th><th>Resolution</th></tr></thead>
  <tbody>${st.rows.map(r => `
    <tr>
      <td>${r.priority}</td>
      <td><span class="sla-priority ${r.priorityClass}">${r.priorityClass}</span></td>
      <td>${r.desc}</td>
      <td>${r.response}</td>
      <td>${r.resolution}</td>
    </tr>`).join('')}
  </tbody>
</table>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'team-grid': {
      try {
        const raw = JSON.parse(block.content)
        const members: { role: string; name: string; responsibilities: string }[] = Array.isArray(raw) ? raw : raw.members ?? []
        return `<div class="team-grid">${members.map(m => `
  <div class="team-card">
    <div class="team-card-head">
      <div class="team-card-role">${m.role}</div>
      <div class="team-card-name">${m.name}</div>
    </div>
    <div class="team-card-body">
      <div class="team-card-resp">${m.responsibilities}</div>
    </div>
  </div>`).join('')}</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'ref-grid': {
      try {
        const raw = JSON.parse(block.content)
        const items: { client: string; title: string; desc: string; tags?: string[] }[] = Array.isArray(raw) ? raw : raw.items ?? []
        return `<div class="ref-grid">${items.map(item => `
  <div class="ref-card">
    <div class="ref-card-img"><span class="ref-card-img-placeholder">Project preview</span></div>
    <div class="ref-card-body">
      <div class="ref-card-client">${item.client}</div>
      <div class="ref-card-title">${item.title}</div>
      <div class="ref-card-desc">${item.desc}</div>
      ${item.tags && item.tags.length ? `<div class="ref-tags">${item.tags.map(t => `<span class="ref-tag">${t}</span>`).join('')}</div>` : ''}
    </div>
  </div>`).join('')}</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'price-table': {
      try {
        const pt = JSON.parse(block.content) as {
          rows: { name: string; desc?: string; price: string }[]; total?: string
        }
        const rowsHtml = pt.rows.map(r => `
  <tr>
    <td><span class="td-name">${r.name}</span>${r.desc ? `<span class="td-desc">${r.desc}</span>` : ''}</td>
    <td>${r.price}</td>
  </tr>`).join('')
        const footHtml = pt.total
          ? `<tfoot><tr><td>Skupaj</td><td>${pt.total}</td></tr></tfoot>`
          : ''
        return `
<table class="price-table">
  <thead><tr><th>Storitev</th><th style="text-align:right">Cena</th></tr></thead>
  <tbody>${rowsHtml}</tbody>
  ${footHtml}
</table>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'pricing-table': {
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

    case 'summary-box': {
      try {
        const sb = JSON.parse(block.content) as {
          label?: string
          rows: { name: string; price: string; optional?: boolean }[]
          totalLabel?: string; total_label?: string
          totalPrice?: string; total_price?: string
          totalSub?: string; total_sub?: string
        }
        const rowsHtml = sb.rows.map(r => `
  <div class="summary-row${r.optional ? ' opt' : ''}">
    <div class="summary-row-name">${r.name}</div>
    <div class="summary-row-price">${r.price}</div>
  </div>`).join('')
        const totalLabel = sb.totalLabel ?? sb.total_label ?? 'Skupaj'
        const totalPrice = sb.totalPrice ?? sb.total_price ?? ''
        const totalSub = sb.totalSub ?? sb.total_sub
        const boxLabel = sb.label ?? 'Povzetek ponudbe'
        return `
<div class="summary-box">
  <div class="summary-box-label">${boxLabel}</div>
  <div class="summary-rows">${rowsHtml}</div>
  <div class="summary-total">
    <div class="summary-total-label">${totalLabel}</div>
    <div>
      <div class="summary-total-price">${totalPrice}</div>
      ${totalSub ? `<div class="summary-total-sub">${totalSub}</div>` : ''}
    </div>
  </div>
</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'cms-explainer': {
      try {
        const ce = JSON.parse(block.content) as { title: string; body: string; benefits: string[] }
        return `
<div class="cms-explainer">
  <div class="cms-explainer-title">${ce.title}</div>
  <div class="cms-explainer-body">${ce.body}</div>
  <div class="cms-benefits">${ce.benefits.map(b => `<div class="cms-benefit">${b}</div>`).join('')}</div>
</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'tech-grid': {
      try {
        const raw = JSON.parse(block.content)
        const items: { name: string; desc: string }[] = Array.isArray(raw) ? raw : raw.items ?? []
        return `<div class="tech-grid">${items.map(i => `
  <div class="tech-item">
    <div>
      <div class="tech-name">${i.name}</div>
      <div class="tech-desc">${i.desc}</div>
    </div>
  </div>`).join('')}</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'closing-block': {
      try {
        const cb = JSON.parse(block.content) as {
          title: string; body: string
          contacts?: { label: string; name: string; role: string }[]
          contact1?: { label: string; name: string; role: string }
          contact2?: { label: string; name: string; role: string }
        }
        const contacts = cb.contacts ?? [cb.contact1, cb.contact2].filter(Boolean) as { label: string; name: string; role: string }[]
        return `
<div class="closing-block">
  <div class="closing-title">${cb.title}</div>
  <div class="closing-body">${cb.body}</div>
  <div class="closing-contacts">
    ${contacts.map(c => `<div>
      <div class="closing-contact-label">${c.label}</div>
      <div class="closing-contact-name">${c.name}</div>
      <div class="closing-contact-role">${c.role}</div>
    </div>`).join('')}
  </div>
</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'info-box':
      return `<div class="info-box">${block.content}</div>`

    case 'two-col': {
      try {
        const tc = JSON.parse(block.content) as {
          col1Label?: string; col1Text?: string; col2Label?: string; col2Text?: string
          left?: { label: string; text: string }; right?: { label: string; text: string }
        }
        const l1 = tc.col1Label ?? tc.left?.label ?? ''
        const t1 = tc.col1Text ?? tc.left?.text ?? ''
        const l2 = tc.col2Label ?? tc.right?.label ?? ''
        const t2 = tc.col2Text ?? tc.right?.text ?? ''
        return `
<div class="two-col">
  <div>
    <div class="col-label">${l1}</div>
    <div class="small-text">${t1.replace(/\n/g, '<br>')}</div>
  </div>
  <div>
    <div class="col-label">${l2}</div>
    <div class="small-text">${t2.replace(/\n/g, '<br>')}</div>
  </div>
</div>`
      } catch {
        return `<div class="intro-text">${block.content}</div>`
      }
    }

    case 'stat-grid': {
      try {
        const sg = JSON.parse(block.content) as {
          stats: { num: string; label: string; sub?: string; style: 'black' | 'orange' | 'light' }[]
        }
        const cardHtml = sg.stats.map(s => {
          if (s.style === 'black') {
            return `<div class="stat-card-black">
  <div class="stat-num-orange">${s.num}</div>
  <div class="stat-label-white">${s.label}</div>
  ${s.sub ? `<div class="stat-sub-muted-white">${s.sub}</div>` : ''}
</div>`
          } else if (s.style === 'orange') {
            return `<div class="stat-card-orange">
  <div class="stat-num-white">${s.num}</div>
  <div class="stat-label-white">${s.label}</div>
  ${s.sub ? `<div class="stat-sub-muted-white">${s.sub}</div>` : ''}
</div>`
          } else {
            return `<div class="stat-card-light">
  <div class="stat-num-black">${s.num}</div>
  <div class="stat-label-black">${s.label}</div>
  ${s.sub ? `<div class="stat-sub-muted-gray">${s.sub}</div>` : ''}
</div>`
          }
        }).join('')
        return `<div class="stat-grid">${cardHtml}</div>`
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
    const clientAddr = (m.client_address ?? offer.client_name).replace(/\n/g, '<br>')
    return `
<div class="page cover">
  <div class="cover-header">
    <div class="cover-wordmark">${LOGO_URL ? `<img src="${LOGO_URL}" alt="Renderspace" onerror="this.style.display='none'">` : '<strong style="font-size:18px;font-weight:900;letter-spacing:-0.02em;">RENDERSPACE</strong>'}</div>
    <div class="cover-contact">
      Vilharjeva cesta 36<br>SI-1000 Ljubljana<br>
      <a href="mailto:info@renderspace.si">info@renderspace.si</a><br>
      +386 (1) 23 91 200
    </div>
  </div>
  <div class="cover-body">
    <div class="cover-eyebrow">${m.offer_eyebrow ?? (offer.offer_number ? `Ponudba ${offer.offer_number}` : 'Ponudba')}</div>
    <div class="cover-title">${m.cover_title ?? offer.title}</div>
    <div class="cover-subtitle-main">${m.client_display_name ?? offer.client_name}</div>
  </div>
  <div class="cover-meta-row">
    <div class="cover-meta-item">
      <div class="cover-meta-label">Naročnik</div>
      <div class="cover-meta-value">${clientAddr}</div>
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
      <div class="doc-header-logos">${LOGO_URL ? `<img src="${LOGO_URL}" alt="Renderspace" onerror="this.style.display='none'">` : ''}</div>
    </div>
    <h1>${offer.meta.doc_title ?? 'Specifikacija ponudbe'}</h1>
  </div>
  <div class="section-label" style="margin-top:0;">${section.title}</div>
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
<div class="print-hint">Enable "Background graphics" in print dialog for full colours</div>
${pagesHtml}
</body>
</html>`
}
