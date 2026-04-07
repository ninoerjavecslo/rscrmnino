// Derives template variables from the BlockNote block array.
// This adapter is the bridge between the BlockNote document and the HTML print templates.

// ── Inline content helpers ───────────────────────────────────────────────────

type InlineStyle = Partial<Record<'bold' | 'italic' | 'underline' | 'strikethrough' | 'code', boolean>>
type InlineText = { type: 'text'; text: string; styles: InlineStyle }
type InlineLink = { type: 'link'; href: string; content: InlineText[] }
type InlineContent = InlineText | InlineLink

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function applyStyles(text: string, styles: InlineStyle = {}): string {
  let s = esc(text)
  if (styles.bold) s = `<strong>${s}</strong>`
  if (styles.italic) s = `<em>${s}</em>`
  if (styles.underline) s = `<u>${s}</u>`
  if (styles.strikethrough) s = `<s>${s}</s>`
  if (styles.code) s = `<code class="inline-code">${s}</code>`
  return s
}

function inlineToHtml(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return (content as InlineContent[]).map(item => {
    if (item.type === 'link') {
      const inner = (item.content ?? []).map(c => applyStyles(c.text, c.styles)).join('')
      return `<a href="${esc(item.href)}">${inner}</a>`
    }
    if (item.type === 'text') return applyStyles(item.text, item.styles)
    return ''
  }).join('')
}

// ── Ordered section types (all non-structural blocks, in document order) ─────

export type OrderedSection =
  | { type: 'heading'; level: number; html: string }
  | { type: 'paragraph'; html: string }
  | { type: 'bulletListItem'; html: string }
  | { type: 'numberedListItem'; html: string }
  | { type: 'serviceBlock'; title: string; lineItems: LineItem[]; subtotal: number }
  | { type: 'phaseBlock'; title: string; description: string; items: string[] }
  | { type: 'contentGridBlock'; sectionTitle: string; items: Array<{ title: string; body: string }>; columns: string }
  | { type: 'bulletListBlock'; title: string; items: string[]; accent: string }
  | { type: 'infoBoxBlock'; title: string; body: string; style: string }
  | { type: 'maintenancePackage'; name: string; priceMonthly: number; features: string[] }
  | { type: 'slaTable'; responseTimeHours: number; uptimePct: number; includedHours: number; notes: string }

interface LineItem {
  description: string; quantity: number; unit: string; unitPrice: number; total: number
}

// ── TemplateVars ─────────────────────────────────────────────────────────────

export interface TemplateVars {
  offerNumber: string
  projectTitle: string
  clientName: string
  contactPerson: string
  date: string
  validUntil: string
  introText: string
  orderedSections: OrderedSection[]
  serviceBlocks: Array<{
    title: string
    description: string
    lineItems: LineItem[]
    subtotal: number
  }>
  pricing: { subtotal: number; discount: number; total: number; paymentType: string }
  boilerplate: { paymentTerms: string; copyright: string; scopeAndTimeline: string; generalNotes: string }
  maintenancePackages?: Array<{ name: string; priceMonthly: number; features: string[] }>
  sla?: { responseTimeHours: number; uptimePct: number; includedHours: number; notes: string }
  phaseBlocks?: Array<{ title: string; description: string; items: string[] }>
  contentGridBlocks?: Array<{ sectionTitle: string; items: Array<{ title: string; body: string }>; columns: string }>
  bulletLists?: Array<{ title: string; items: string[]; accent: string }>
  infoBoxes?: Array<{ title: string; body: string; style: string }>
}

// ── Main extraction function ─────────────────────────────────────────────────

export function blocksToTemplateVars(blocks: unknown[]): TemplateVars {
  const vars: TemplateVars = {
    offerNumber: '', projectTitle: '', clientName: '', contactPerson: '', date: '', validUntil: '', introText: '',
    orderedSections: [],
    serviceBlocks: [],
    pricing: { subtotal: 0, discount: 0, total: 0, paymentType: 'one_time' },
    boilerplate: { paymentTerms: '', copyright: '', scopeAndTimeline: '', generalNotes: '' },
  }

  for (const block of blocks as Array<{ type: string; props: Record<string, string>; content?: unknown }>) {
    switch (block.type) {
      case 'clientMeta':
        vars.offerNumber = block.props.offerNumber
        vars.projectTitle = block.props.projectTitle || ''
        vars.clientName = block.props.clientName
        vars.contactPerson = block.props.contactPerson
        vars.date = block.props.date
        vars.validUntil = block.props.validUntil
        vars.introText = block.props.introText
        break

      case 'boilerplateBlock':
        switch (block.props.sectionKey) {
          case 'payment_terms': vars.boilerplate.paymentTerms = block.props.body; break
          case 'copyright': vars.boilerplate.copyright = block.props.body; break
          case 'scope_and_timeline': vars.boilerplate.scopeAndTimeline = block.props.body; break
          default: vars.boilerplate.generalNotes = block.props.body
        }
        break

      case 'heading': {
        const level = parseInt(String((block.props as unknown as Record<string, unknown>).level ?? 1))
        const html = inlineToHtml(block.content)
        if (html.trim()) vars.orderedSections.push({ type: 'heading', level, html })
        break
      }
      case 'paragraph': {
        const html = inlineToHtml(block.content)
        if (html.trim()) vars.orderedSections.push({ type: 'paragraph', html })
        break
      }
      case 'bulletListItem': {
        const html = inlineToHtml(block.content)
        if (html.trim()) vars.orderedSections.push({ type: 'bulletListItem', html })
        break
      }
      case 'numberedListItem': {
        const html = inlineToHtml(block.content)
        if (html.trim()) vars.orderedSections.push({ type: 'numberedListItem', html })
        break
      }

      case 'serviceBlock': {
        const entry = { title: block.props.title, description: '', lineItems: [] as LineItem[], subtotal: 0 }
        vars.serviceBlocks.push(entry)
        vars.orderedSections.push({ type: 'serviceBlock', title: block.props.title, lineItems: [], subtotal: 0 })
        break
      }
      case 'pricingTable': {
        const items: Array<{ description: string; quantity: number; unit: string; unit_price: number; total: number }> =
          JSON.parse(block.props.itemsJson || '[]')
        const subtotal = items.reduce((s, i) => s + i.total, 0)
        const discount = parseFloat(block.props.discount) || 0
        vars.pricing = { subtotal, discount, total: subtotal - discount, paymentType: block.props.paymentType }
        const lineItems: LineItem[] = items.map(i => ({
          description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unit_price, total: i.total,
        }))
        if (vars.serviceBlocks.length > 0) {
          const last = vars.serviceBlocks[vars.serviceBlocks.length - 1]
          last.lineItems = lineItems
          last.subtotal = subtotal
        } else {
          vars.serviceBlocks.push({ title: '', description: '', lineItems, subtotal })
        }
        let foundServiceBlock = false
        for (let i = vars.orderedSections.length - 1; i >= 0; i--) {
          const s = vars.orderedSections[i]
          if (s.type === 'serviceBlock') {
            vars.orderedSections[i] = { ...s, lineItems, subtotal }
            foundServiceBlock = true
            break
          }
        }
        if (!foundServiceBlock) {
          vars.orderedSections.push({ type: 'serviceBlock', title: '', lineItems, subtotal })
        }
        break
      }
      case 'phaseBlock': {
        const entry = { title: block.props.title, description: block.props.description, items: JSON.parse(block.props.itemsJson || '[]') }
        if (!vars.phaseBlocks) vars.phaseBlocks = []
        vars.phaseBlocks.push(entry)
        vars.orderedSections.push({ type: 'phaseBlock', ...entry })
        break
      }
      case 'contentGridBlock': {
        const entry = { sectionTitle: block.props.sectionTitle, items: JSON.parse(block.props.itemsJson || '[]'), columns: block.props.columns }
        if (!vars.contentGridBlocks) vars.contentGridBlocks = []
        vars.contentGridBlocks.push(entry)
        vars.orderedSections.push({ type: 'contentGridBlock', ...entry })
        break
      }
      case 'bulletListBlock': {
        const entry = { title: block.props.title, items: JSON.parse(block.props.itemsJson || '[]'), accent: block.props.accent }
        if (!vars.bulletLists) vars.bulletLists = []
        vars.bulletLists.push(entry)
        vars.orderedSections.push({ type: 'bulletListBlock', ...entry })
        break
      }
      case 'infoBoxBlock': {
        const entry = { title: block.props.title, body: block.props.body, style: block.props.style }
        if (!vars.infoBoxes) vars.infoBoxes = []
        vars.infoBoxes.push(entry)
        vars.orderedSections.push({ type: 'infoBoxBlock', ...entry })
        break
      }
      case 'maintenancePackage': {
        const entry = { name: block.props.name, priceMonthly: parseFloat(block.props.priceMonthly), features: JSON.parse(block.props.featuresJson || '[]') }
        if (!vars.maintenancePackages) vars.maintenancePackages = []
        vars.maintenancePackages.push(entry)
        vars.orderedSections.push({ type: 'maintenancePackage', ...entry })
        break
      }
      case 'slaTable': {
        const entry = { responseTimeHours: parseFloat(block.props.responseTimeHours), uptimePct: parseFloat(block.props.uptimePct), includedHours: parseFloat(block.props.includedHours), notes: block.props.notes }
        vars.sla = entry
        vars.orderedSections.push({ type: 'slaTable', ...entry })
        break
      }
    }
  }

  return vars
}
