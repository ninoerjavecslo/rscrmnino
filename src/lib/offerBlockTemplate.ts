import type { TemplateVars, OrderedSection } from './blocksToTemplate'

// ── Ordered section renderer ─────────────────────────────────────────────────

function renderOrderedSections(sections: OrderedSection[]): string {
  let html = ''
  let inBulletList = false
  let inNumberedList = false

  const closeList = () => {
    if (inBulletList) { html += '</ul>'; inBulletList = false }
    if (inNumberedList) { html += '</ol>'; inNumberedList = false }
  }

  for (const s of sections) {
    if (s.type !== 'bulletListItem' && inBulletList) closeList()
    if (s.type !== 'numberedListItem' && inNumberedList) closeList()

    switch (s.type) {
      case 'heading': {
        const tag = s.level === 1 ? 'h2' : s.level === 2 ? 'h3' : 'h4'
        const cls = s.level === 1 ? 'free-h1' : s.level === 2 ? 'free-h2' : 'free-h3'
        html += `<${tag} class="${cls}">${s.html}</${tag}>`
        break
      }
      case 'paragraph':
        html += `<p class="free-p">${s.html}</p>`
        break
      case 'bulletListItem':
        if (!inBulletList) { html += '<ul class="free-list">'; inBulletList = true }
        html += `<li>${s.html}</li>`
        break
      case 'numberedListItem':
        if (!inNumberedList) { html += '<ol class="free-ol">'; inNumberedList = true }
        html += `<li>${s.html}</li>`
        break
      case 'serviceBlock': {
        const tableHtml = s.lineItems && s.lineItems.length > 0 ? `
          <table class="price-table" style="margin-top:3mm;">
            <thead><tr>
              <th style="width:42%">Opis / Description</th>
              <th style="width:8%">Kol.</th>
              <th style="width:8%">Enota</th>
              <th style="width:14%;text-align:right">Cena/enoto</th>
              <th style="width:14%;text-align:right">Skupaj</th>
            </tr></thead>
            <tbody>
              ${s.lineItems.map((item, i) => `
                <tr style="${i % 2 === 1 ? 'background:#f5f5f3' : ''}">
                  <td><span class="td-name">${item.description || '—'}</span></td>
                  <td>${item.quantity}</td>
                  <td>${item.unit}</td>
                  <td style="text-align:right">€${item.unitPrice.toFixed(2)}</td>
                  <td style="text-align:right;font-weight:700">€${item.total.toFixed(2)}</td>
                </tr>`).join('')}
            </tbody>
            ${s.subtotal ? `<tfoot><tr>
              <td colspan="4" style="text-align:right">Skupaj / Subtotal</td>
              <td style="text-align:right">€${s.subtotal.toFixed(2)}</td>
            </tr></tfoot>` : ''}
          </table>` : ''
        html += `
          <div class="service-block">
            <div class="service-head"><div class="service-title">${s.title || ''}</div></div>
            <div class="service-body">${tableHtml}</div>
          </div>`
        break
      }
      case 'phaseBlock':
        html += `
          <div class="phase-block">
            <div class="phase-head"><span class="phase-title">${s.title}</span></div>
            <div class="phase-body">
              ${s.description ? `<div class="free-p" style="margin:2mm 0 3mm">${s.description}</div>` : ''}
              ${s.items.filter(Boolean).length > 0 ? `<ul class="phase-list">${s.items.filter(Boolean).map(i => `<li>${i}</li>`).join('')}</ul>` : ''}
            </div>
          </div>`
        break
      case 'contentGridBlock':
        html += `
          ${s.sectionTitle ? `<div class="section-label" style="margin-top:7mm">${s.sectionTitle}</div>` : '<div style="margin-top:5mm"></div>'}
          <div class="content-grid" style="grid-template-columns:repeat(${s.columns === '1' ? 1 : 2},1fr)">
            ${s.items.map(item => `
              <div class="grid-card">
                ${item.title ? `<div class="grid-card-title">${item.title}</div>` : ''}
                ${item.body ? `<p class="grid-card-body">${item.body}</p>` : ''}
              </div>`).join('')}
          </div>`
        break
      case 'bulletListBlock': {
        const blColor = s.accent === 'black' ? '#0a0a0a' : '#E85C1A'
        html += `
          ${s.title ? `<div class="section-label${s.accent === 'black' ? '' : ' orange'}" style="margin-top:6mm">${s.title}</div>` : '<div style="margin-top:4mm"></div>'}
          <ul class="bullet-list${s.accent === 'black' ? ' black' : ''}" style="--bl-color:${blColor}">
            ${s.items.filter(Boolean).map(item => `<li>${item}</li>`).join('')}
          </ul>`
        break
      }
      case 'infoBoxBlock': {
        const boxColors: Record<string, string> = { highlight: '#E85C1A', note: '#3B82F6', warning: '#F59E0B' }
        const boxBgs: Record<string, string> = { highlight: '#FDF0EA', note: '#EFF6FF', warning: '#FFFBEB' }
        const c = boxColors[s.style] ?? '#E85C1A'
        const bg = boxBgs[s.style] ?? '#FDF0EA'
        html += `
          <div class="info-box" style="border-left-color:${c};background:${bg};margin-top:5mm">
            ${s.title ? `<div class="info-box-title" style="color:${c}">${s.title}</div>` : ''}
            <p class="info-box-body">${s.body}</p>
          </div>`
        break
      }
      case 'maintenancePackage': {
        const isFeatured = sections.filter(x => x.type === 'maintenancePackage').indexOf(s) === 0
        html += `
          <div class="maint-card${isFeatured ? ' featured' : ''}">
            <div class="maint-card-head">
              <span class="maint-card-name">${s.name}</span>
              <span class="maint-card-price">€${s.priceMonthly.toFixed(2)}<span style="font-size:9px;font-weight:400;opacity:0.65">/mes</span></span>
            </div>
            <div class="maint-card-body">${s.features.map(f => `<div class="maint-item">${f}</div>`).join('')}</div>
          </div>`
        break
      }
      case 'slaTable':
        html += `
          <div class="section-label" style="margin-top:6mm">SLA — Parametri storitve</div>
          <table class="sla-table">
            <thead><tr><th>Parameter</th><th>Vrednost</th></tr></thead>
            <tbody>
              <tr><td>Odzivni čas / Response time</td><td>${s.responseTimeHours}h</td></tr>
              <tr><td>Zagotovljeno delovanje / Uptime</td><td>${s.uptimePct}%</td></tr>
              <tr><td>Vključene ure podpore / Support hours</td><td>${s.includedHours}h/mes</td></tr>
              ${s.notes ? `<tr><td>Opombe / Notes</td><td>${s.notes}</td></tr>` : ''}
            </tbody>
          </table>`
        break
    }
  }

  closeList()

  html = html.replace(
    /(<div class="maint-card(?:[^"]*)"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>)+/g,
    match => `<div class="section-label" style="margin-top:8mm">Vzdrževanje / Maintenance</div><div class="maint-grid">${match}</div>`
  )

  return html
}

export function renderOfferBlocksHtml(vars: TemplateVars): string {
  const title = vars.projectTitle || 'Ponudba'
  const client = vars.clientName || 'Client'

  const hasPricing = vars.pricing.total > 0 || vars.serviceBlocks.some(s => s.subtotal > 0)
  const pricingHtml = hasPricing ? `
    <div class="summary-box">
      <div class="summary-box-label">Cenovna rekapitulacija / Pricing Summary</div>
      <div class="summary-rows">
        ${vars.serviceBlocks.filter(s => s.title && s.subtotal).map(s => `
          <div class="summary-row">
            <span class="summary-row-name">${s.title}</span>
            <span class="summary-row-price">€${s.subtotal.toFixed(2)}</span>
          </div>`).join('')}
        ${vars.pricing.discount > 0 ? `
          <div class="summary-row">
            <span class="summary-row-name" style="opacity:0.6">Popust / Discount</span>
            <span class="summary-row-price" style="opacity:0.6">−€${vars.pricing.discount.toFixed(2)}</span>
          </div>` : ''}
      </div>
      <div class="summary-total">
        <div>
          <div class="summary-total-label">Skupaj / Total</div>
          <div class="summary-total-sub">brez DDV / excl. VAT</div>
        </div>
        <div class="summary-total-price">€${vars.pricing.total.toFixed(2)}</div>
      </div>
    </div>` : ''

  const bpEntries: [string, string][] = [
    vars.boilerplate.paymentTerms && ['Plačilni pogoji / Payment Terms', vars.boilerplate.paymentTerms],
    vars.boilerplate.scopeAndTimeline && ['Obseg in terminski plan / Scope & Timeline', vars.boilerplate.scopeAndTimeline],
    vars.boilerplate.copyright && ['Avtorske pravice / Copyright', vars.boilerplate.copyright],
    vars.boilerplate.generalNotes && ['Splošne opombe / Notes', vars.boilerplate.generalNotes],
  ].filter(Boolean) as [string, string][]

  const boilerplateHtml = bpEntries.length > 0 ? `
    <div style="margin-top:8mm;border-top:1px solid #e0e0dd;padding-top:6mm;">
      <div class="two-col">
        ${bpEntries.map(([label, body]) => `
          <div>
            <div class="col-label">${label}</div>
            <p class="small-text">${body}</p>
          </div>`).join('')}
      </div>
    </div>` : ''

  return `<!DOCTYPE html>
<html lang="sl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — ${client}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root {
    --black: #0a0a0a; --ink: #1a1a1a; --gray-mid: #555550; --gray-light: #888883;
    --gray-bg: #f5f5f3; --gray-rule: #e0e0dd; --white: #ffffff;
    --orange: #E85C1A; --orange-light: #FDF0EA;
    --font: 'Figtree', -apple-system, sans-serif;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--font); background: var(--white); color: var(--ink); font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 18mm 18mm 24mm; position: relative; background: var(--white); }
  @media screen { body { background: #e8e8e5; } .page { margin: 20px auto; box-shadow: 0 4px 40px rgba(0,0,0,0.12); } }
  @media print { body { background: white; } .page { margin: 0; width: 210mm; height: 297mm; page-break-after: always; break-after: page; box-shadow: none; } .page:last-child { page-break-after: avoid; break-after: avoid; } }
  .cover { padding: 0; overflow: hidden; display: flex; flex-direction: column; background: #F2EAE0; position: relative; height: 297mm; min-height: 297mm; max-height: 297mm; }
  .cover::before { content: ''; position: absolute; bottom: -10mm; right: -10mm; width: 160mm; height: 160mm; background: radial-gradient(ellipse at center, #E8320A 0%, #F05A1A 30%, #F5956A 60%, transparent 80%); border-radius: 50%; filter: blur(18px); opacity: 0.92; }
  .cover::after { content: ''; position: absolute; inset: 0; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.07'/%3E%3C/svg%3E"); pointer-events: none; mix-blend-mode: multiply; }
  .cover-header { position: relative; z-index: 2; padding: 12mm 18mm 0; display: flex; justify-content: space-between; align-items: flex-start; }
  .cover-wordmark { font-family: var(--font); font-size: 15px; font-weight: 800; letter-spacing: -0.02em; color: var(--black); }
  .cover-body { position: relative; z-index: 2; flex: 1; padding: 28mm 18mm 0; display: flex; flex-direction: column; justify-content: flex-start; }
  .cover-eyebrow { display: inline-block; width: fit-content; font-size: 9px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--white); background: var(--orange); padding: 3px 8px; margin-bottom: 5mm; }
  .cover-title { font-size: 52px; font-weight: 700; color: var(--black); line-height: 0.95; letter-spacing: -0.03em; margin-bottom: 5mm; max-width: 160mm; }
  .cover-subtitle { font-size: 22px; font-weight: 700; color: var(--black); letter-spacing: -0.01em; }
  .cover-meta-row { position: relative; z-index: 2; padding: 7mm 18mm; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; }
  .cover-meta-item { padding-right: 6mm; }
  .cover-meta-item + .cover-meta-item { padding-left: 6mm; border-left: 1px solid rgba(0,0,0,0.15); }
  .cover-meta-label { font-size: 9px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--black); margin-bottom: 3px; }
  .cover-meta-value { font-size: 12px; font-weight: 600; color: var(--black); line-height: 1.5; }
  .doc-header { padding-bottom: 6mm; margin-bottom: 6mm; border-bottom: 2px solid var(--black); }
  .doc-header-agency { font-size: 10px; font-weight: 800; color: var(--gray-light); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 2mm; }
  .doc-header h1 { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; color: var(--black); }
  .intro-text { font-size: 12px; line-height: 1.7; color: var(--gray-mid); margin-bottom: 5mm; }
  .intro-text strong { color: var(--black); font-weight: 700; }
  .section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--black); padding-bottom: 4px; border-bottom: 2px solid var(--black); margin-bottom: 4mm; margin-top: 7mm; }
  .section-label.orange { color: var(--orange); border-bottom-color: var(--orange); }
  .service-block { margin-bottom: 5mm; break-inside: avoid; }
  .service-head { background: var(--orange); padding: 7px 12px; }
  .service-title { font-size: 13px; font-weight: 800; color: var(--white); text-transform: uppercase; letter-spacing: 0.04em; }
  .service-body { padding: 3px 0 0 0; }
  .price-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-family: var(--font); }
  .price-table thead tr { background: var(--black); }
  .price-table thead th { font-size: 9px; font-weight: 700; color: var(--white); text-align: left; padding: 7px 10px; letter-spacing: 0.08em; text-transform: uppercase; }
  .price-table thead th:last-child { text-align: right; }
  .price-table tbody td { font-size: 11.5px; color: var(--gray-mid); padding: 7px 10px; border-bottom: 1px solid var(--gray-rule); line-height: 1.4; vertical-align: top; word-wrap: break-word; }
  .price-table tbody td:first-child { color: var(--black); }
  .price-table tbody td:last-child { text-align: right; font-weight: 700; color: var(--black); white-space: nowrap; vertical-align: middle; }
  .td-name { font-size: 12px; font-weight: 600; color: var(--black); display: block; }
  .price-table tfoot td { background: var(--black); color: var(--white); font-size: 11px; font-weight: 800; padding: 8px 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  .price-table tfoot td:last-child { text-align: right; font-size: 14px; }
  .summary-box { background: var(--black); padding: 7mm 9mm; margin-top: 6mm; break-inside: avoid; }
  .summary-box-label { font-size: 8px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--white); opacity: 0.5; margin-bottom: 4mm; }
  .summary-rows { display: flex; flex-direction: column; gap: 2px; margin-bottom: 4mm; }
  .summary-row { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .summary-row-name { font-size: 12px; color: var(--white); font-weight: 400; }
  .summary-row-price { font-size: 12px; font-weight: 700; color: var(--white); }
  .summary-total { display: flex; justify-content: space-between; align-items: baseline; padding-top: 4mm; border-top: 1px solid rgba(255,255,255,0.18); }
  .summary-total-label { font-size: 13px; font-weight: 700; color: var(--white); text-transform: uppercase; letter-spacing: 0.04em; }
  .summary-total-sub { font-size: 9px; color: rgba(255,255,255,0.4); font-weight: 300; margin-top: 2px; }
  .summary-total-price { font-size: 32px; font-weight: 900; color: var(--orange); letter-spacing: -0.02em; }
  .maint-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 5mm; }
  .maint-card { border: 1px solid var(--gray-rule); display: flex; flex-direction: column; }
  .maint-card.featured { border-color: var(--orange); }
  .maint-card-head { padding: 5px 9px; background: var(--gray-bg); border-bottom: 1px solid var(--gray-rule); display: flex; justify-content: space-between; align-items: center; }
  .maint-card.featured .maint-card-head { background: var(--orange); border-bottom-color: var(--orange); }
  .maint-card-name { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--black); }
  .maint-card.featured .maint-card-name { color: var(--white); }
  .maint-card-price { font-size: 14px; font-weight: 900; color: var(--black); }
  .maint-card.featured .maint-card-price { color: var(--white); }
  .maint-card-body { padding: 6px 9px 8px; flex: 1; }
  .maint-item { font-size: 10.5px; color: var(--gray-mid); line-height: 1.6; display: flex; gap: 5px; padding: 1px 0; }
  .maint-item::before { content: '·'; color: var(--orange); font-weight: 900; flex-shrink: 0; }
  .sla-table { width: 100%; border-collapse: collapse; margin-bottom: 5mm; }
  .sla-table thead tr { background: var(--black); }
  .sla-table thead th { font-size: 9px; font-weight: 700; color: var(--white); padding: 6px 10px; text-align: left; letter-spacing: 0.08em; text-transform: uppercase; }
  .sla-table tbody tr:nth-child(even) { background: var(--gray-bg); }
  .sla-table tbody td { font-size: 11px; color: var(--gray-mid); padding: 7px 10px; border-bottom: 1px solid var(--gray-rule); }
  .sla-table tbody td:first-child { color: var(--black); font-weight: 600; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .col-label { font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gray-mid); margin-bottom: 3mm; padding-bottom: 3px; border-bottom: 1px solid var(--gray-rule); }
  .small-text { font-size: 10px; color: var(--gray-mid); line-height: 1.55; }
  .phase-block { margin-bottom: 5mm; break-inside: avoid; }
  .phase-head { background: var(--black); padding: 7px 12px; }
  .phase-title { font-size: 13px; font-weight: 800; color: var(--white); text-transform: uppercase; letter-spacing: 0.04em; }
  .phase-body { padding: 4px 0 0; }
  .phase-list { list-style: none; margin: 2mm 0; padding: 0; }
  .phase-list li { font-size: 11px; color: var(--gray-mid); padding: 3px 0 3px 12px; border-left: 2px solid var(--orange); margin-bottom: 2px; line-height: 1.5; }
  .content-grid { display: grid; gap: 3mm; margin-bottom: 5mm; }
  .grid-card { background: var(--gray-bg); border: 1px solid var(--gray-rule); padding: 5px 9px 8px; break-inside: avoid; }
  .grid-card-title { font-size: 11px; font-weight: 700; color: var(--black); margin-bottom: 2px; }
  .grid-card-body { font-size: 10px; color: var(--gray-mid); line-height: 1.55; margin: 0; }
  .bullet-list { list-style: none; margin: 0 0 4mm; padding: 0; }
  .bullet-list li { font-size: 11.5px; color: var(--gray-mid); padding: 3px 0 3px 12px; border-left: 2px solid var(--orange); margin-bottom: 3px; line-height: 1.55; }
  .bullet-list.black li { border-left-color: var(--black); }
  .info-box { border-left: 3px solid var(--orange); padding: 5px 10px 7px; break-inside: avoid; }
  .info-box-title { font-size: 11px; font-weight: 700; margin-bottom: 3px; }
  .info-box-body { font-size: 11px; color: var(--gray-mid); line-height: 1.6; margin: 0; }
  .free-h1 { font-size: 22px; font-weight: 800; color: var(--black); letter-spacing: -0.02em; line-height: 1.15; margin: 6mm 0 3mm; }
  .free-h2 { font-size: 17px; font-weight: 700; color: var(--black); letter-spacing: -0.01em; line-height: 1.2; margin: 5mm 0 2mm; }
  .free-h3 { font-size: 13px; font-weight: 700; color: var(--black); margin: 4mm 0 2mm; }
  .free-p { font-size: 12px; line-height: 1.7; color: var(--gray-mid); margin-bottom: 3mm; }
  .free-p strong { color: var(--black); }
  .free-list { list-style: none; margin: 0 0 4mm 0; padding: 0; }
  .free-list li { font-size: 11.5px; color: var(--gray-mid); padding: 2px 0 2px 12px; border-left: 2px solid var(--orange); margin-bottom: 2px; line-height: 1.55; }
  .free-ol { margin: 0 0 4mm 0; padding: 0 0 0 16px; }
  .free-ol li { font-size: 11.5px; color: var(--gray-mid); padding: 2px 0; line-height: 1.55; }
  .inline-code { font-family: monospace; font-size: 10.5px; background: var(--gray-bg); padding: 1px 4px; border-radius: 2px; }
  .page-footer { position: absolute; bottom: 10mm; left: 18mm; right: 18mm; display: flex; justify-content: space-between; align-items: center; padding-top: 3mm; border-top: 1px solid var(--gray-rule); }
  .page-footer span { font-size: 8.5px; color: var(--gray-light); font-weight: 400; }
  .page-footer .pn { font-weight: 600; color: var(--gray-mid); }
</style>
</head>
<body>

<div class="page cover">
  <div class="cover-header">
    <div class="cover-wordmark">Renderspace</div>
  </div>
  <div class="cover-body">
    ${vars.offerNumber ? `<div class="cover-eyebrow">${vars.offerNumber}</div>` : ''}
    <div class="cover-title">${title}</div>
    <div class="cover-subtitle">${client}</div>
  </div>
  <div class="cover-meta-row">
    <div class="cover-meta-item">
      <div class="cover-meta-label">Naročnik / Client</div>
      <div class="cover-meta-value">${client}${vars.contactPerson ? `<br>${vars.contactPerson}` : ''}</div>
    </div>
    <div class="cover-meta-item">
      <div class="cover-meta-label">Agencija / Agency</div>
      <div class="cover-meta-value">Renderspace d.o.o.<br>Vilharjeva cesta 36<br>1000 Ljubljana</div>
    </div>
    <div class="cover-meta-item">
      <div class="cover-meta-label">Datum · Veljavnost</div>
      <div class="cover-meta-value">${vars.date || '—'}${vars.validUntil ? `<br>do ${vars.validUntil}` : ''}</div>
    </div>
  </div>
</div>

<div class="page">
  <div class="doc-header">
    <div class="doc-header-agency">Renderspace d.o.o.</div>
    <h1>${title}</h1>
  </div>

  ${vars.introText ? `<p class="intro-text">${vars.introText}</p>` : ''}
  ${vars.orderedSections.length > 0 ? renderOrderedSections(vars.orderedSections) : ''}
  ${pricingHtml}
  ${boilerplateHtml}

  <div class="page-footer">
    <span>Renderspace d.o.o. · ${title}</span>
    <span class="pn">2</span>
  </div>
</div>

</body>
</html>`
}
