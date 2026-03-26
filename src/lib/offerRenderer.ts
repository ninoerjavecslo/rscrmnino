// src/lib/offerRenderer.ts
import type { Offer, OfferSection, OfferBlock } from './types'

const LOGO_URL = '' // updated after Supabase storage setup

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
  .intro-text { font-size: 12px; line-height: 1.7; color: var(--gray-dark); margin-bottom: 6mm; white-space: pre-wrap; }
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
  .bullet-list { list-style: none; padding: 0; margin: 0 0 6mm 0; }
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
        const phase = JSON.parse(block.content) as { tag?: string; title: string; deadline?: string; items?: string[] }
        const itemsHtml = (phase.items ?? []).filter(Boolean).map(i => `<div class="phase-item">${i}</div>`).join('')
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
