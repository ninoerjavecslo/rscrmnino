import { supabase } from './supabase'

export interface OgProjectType {
  id: string
  name_sl: string
  name_en: string
  slug: string
  default_sections: string[]
}

export interface OgContentLibraryEntry {
  id: string
  category: string
  type: string
  name_sl: string
  name_en: string
  body_sl: string
  body_en: string
  sort_order: number
}

const BOILERPLATE_KEY_MAP: Record<string, string> = {
  'Plačilni pogoji': 'payment_terms',
  'Payment Terms': 'payment_terms',
  'Avtorske pravice': 'copyright',
  'Copyright': 'copyright',
  'Obseg del in časovnica': 'scope_and_timeline',
  'Scope & Timeline': 'scope_and_timeline',
  'Splošne opombe': 'general_notes',
  'General Notes': 'general_notes',
}

function generateOfferNumber(): string {
  const year = new Date().getFullYear().toString().slice(-2)
  const random = Math.floor(Math.random() * 9000) + 1000
  return `${year}_${random}`
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export async function loadDefaultBlocksForProjectType(
  projectTypeSlug: string,
  language: 'sl' | 'en' = 'sl'
): Promise<unknown[]> {
  const now = new Date()
  const offerNumber = generateOfferNumber()

  const { data: libraryEntries } = await supabase
    .from('og_content_library')
    .select('*')
    .in('category', [projectTypeSlug, 'boilerplate'])
    .order('sort_order')

  const entries = (libraryEntries || []) as OgContentLibraryEntry[]
  const boilerplateEntries = entries.filter(e => e.category === 'boilerplate')
  const serviceEntries = entries.filter(e => e.type === 'service_description')

  const nameKey = language === 'sl' ? 'name_sl' : 'name_en'
  const bodyKey = language === 'sl' ? 'body_sl' : 'body_en'

  return [
    {
      type: 'clientMeta',
      props: {
        offerNumber,
        clientName: '',
        contactPerson: '',
        date: formatDate(now),
        validUntil: formatDate(addDays(now, 30)),
        introText: '',
      },
    },
    ...serviceEntries.map(e => ({
      type: 'serviceBlock',
      props: {
        title: (e as unknown as Record<string, string>)[nameKey] || e.name_sl,
        collapsed: 'false',
      },
    })),
    {
      type: 'pricingTable',
      props: { itemsJson: '[]', discount: '0', paymentType: 'one_time' },
    },
    ...boilerplateEntries.map(b => ({
      type: 'boilerplateBlock',
      props: {
        title: (b as unknown as Record<string, string>)[nameKey] || b.name_sl,
        sectionKey: BOILERPLATE_KEY_MAP[b.name_sl] || BOILERPLATE_KEY_MAP[b.name_en] || 'general_notes',
        body: (b as unknown as Record<string, string>)[bodyKey] || '',
        collapsed: 'true',
      },
    })),
  ]
}

export async function getContentLibraryForCategory(category: string): Promise<OgContentLibraryEntry[]> {
  const { data } = await supabase
    .from('og_content_library')
    .select('*')
    .eq('category', category)
    .order('sort_order')
  return (data || []) as OgContentLibraryEntry[]
}
