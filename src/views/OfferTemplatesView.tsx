import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/button'

type Category = 'all' | 'design' | 'development' | 'marketing' | 'support' | 'ecommerce'

interface Template {
  slug: string
  title: string
  desc: string
  category: Category
  accent: string
  accentBg: string
  // bars: [widths...] — colored bars mixed in with gray lines
  accentRows: number[]  // which rows (0-indexed) get the accent color
}

const TEMPLATES: Template[] = [
  { slug: 'short-offer',       title: 'Short Offer',            desc: 'Table-only pricing. Clean, one-page, no fluff.',                       category: 'all',         accent: '#3B82F6', accentBg: '#EFF6FF', accentRows: [2, 5] },
  { slug: 'website-redesign',  title: 'Website Redesign',       desc: 'Full redesign with UX, design, development, and launch.',               category: 'design',      accent: '#6366F1', accentBg: '#EEF2FF', accentRows: [1, 4] },
  { slug: 'mobile-app',        title: 'Mobile App Development', desc: 'iOS / Android scoping, design, and development proposal.',              category: 'development', accent: '#8B5CF6', accentBg: '#F5F3FF', accentRows: [2, 5] },
  { slug: 'analytics',         title: 'Analytics',              desc: 'Data analytics setup, dashboards, and reporting implementation.',        category: 'development', accent: '#0D9488', accentBg: '#F0FDFA', accentRows: [1, 3] },
  { slug: 'maintenance',       title: 'Maintenance',            desc: 'Monthly support package with SLA table and maintenance plan.',           category: 'support',     accent: '#F97316', accentBg: '#FFF7ED', accentRows: [0, 4] },
  { slug: 'change-request',    title: 'Change Request',         desc: 'Scoped change request with effort estimate and pricing.',                category: 'support',     accent: '#F59E0B', accentBg: '#FFFBEB', accentRows: [2, 4] },
  { slug: 'copywriting',       title: 'Copywriting',            desc: 'Copywriting services with word count and deliverables.',                 category: 'marketing',   accent: '#EC4899', accentBg: '#FDF2F8', accentRows: [1, 5] },
  { slug: 'ux-ui-design',      title: 'UX/UI Design',           desc: 'Discovery, wireframes, prototyping, and visual design — no dev.',       category: 'design',      accent: '#7C3AED', accentBg: '#F5F3FF', accentRows: [2, 4] },
  { slug: 'seo',               title: 'SEO',                    desc: 'Technical audit, on-page SEO, content strategy, and tracking.',         category: 'marketing',   accent: '#10B981', accentBg: '#ECFDF5', accentRows: [1, 3] },
  { slug: 'development-only',  title: 'Development Only',       desc: 'Pure development scope — design provided. Phase-based.',                category: 'development', accent: '#475569', accentBg: '#F8FAFC', accentRows: [0, 3] },
  { slug: 'ecommerce',         title: 'E-commerce',             desc: 'Online store with design, development, integrations, and launch.',      category: 'ecommerce',   accent: '#EF4444', accentBg: '#FEF2F2', accentRows: [2, 5] },
]

const CATEGORIES: { key: Category | 'all'; label: string }[] = [
  { key: 'all',         label: 'All' },
  { key: 'design',      label: 'Design' },
  { key: 'development', label: 'Development' },
  { key: 'marketing',   label: 'Marketing' },
  { key: 'support',     label: 'Support' },
  { key: 'ecommerce',   label: 'E-commerce' },
]

// widths of the 6 content bar rows
const BAR_WIDTHS = [72, 55, 85, 48, 65, 38]

function DocThumbnail({ template }: { template: Template }) {
  return (
    <div className="rounded-t-[9px] overflow-hidden" style={{ background: template.accentBg, paddingBottom: 0 }}>
      {/* Top accent line */}
      <div style={{ height: 3, background: template.accent }} />

      {/* Bar rows */}
      <div className="px-4 pt-3 pb-1 flex flex-col gap-[7px]">
        {BAR_WIDTHS.map((w, i) => (
          <div
            key={i}
            style={{
              height: 5,
              width: `${w}%`,
              background: template.accentRows.includes(i) ? template.accent : '#d1d5db',
              borderRadius: 3,
              opacity: template.accentRows.includes(i) ? 0.85 : 1,
            }}
          />
        ))}
      </div>

      {/* Bottom pricing bar */}
      <div
        className="flex items-center justify-between px-4 py-2 mt-1"
        style={{ background: template.accent }}
      >
        <div style={{ height: 4, width: 36, background: 'rgba(255,255,255,0.45)', borderRadius: 2 }} />
        <div style={{ height: 4, width: 24, background: 'rgba(255,255,255,0.75)', borderRadius: 2 }} />
      </div>
    </div>
  )
}

export function OfferTemplatesView() {
  const navigate = useNavigate()
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all')

  const filtered = activeCategory === 'all'
    ? TEMPLATES
    : TEMPLATES.filter(t => t.category === activeCategory)

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-primary">Template Library</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Start from a template or build from scratch</p>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-0 mb-5 border-b border-border">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key as Category | 'all')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeCategory === cat.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-primary'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Grid — max-width keeps cards from getting too wide */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', maxWidth: 960 }}>

        {/* Start from scratch */}
        <div
          className="bg-white rounded-[10px] border-2 border-dashed border-border hover:border-primary/40 transition-colors cursor-pointer flex flex-col items-center justify-center gap-2 p-5"
          style={{ minHeight: 240 }}
          onClick={() => navigate('/offers/new')}
        >
          <div className="w-9 h-9 rounded-full border-2 border-border flex items-center justify-center text-muted-foreground font-light text-xl leading-none">
            +
          </div>
          <div className="font-semibold text-sm text-primary">Start from Scratch</div>
          <div className="text-xs text-muted-foreground text-center">Build block by block</div>
        </div>

        {filtered.map(t => (
          <div
            key={t.slug}
            className="bg-white rounded-[10px] border border-border hover:shadow-md hover:border-primary/20 transition-all cursor-pointer flex flex-col overflow-hidden"
            onClick={() => navigate('/offers/new')}
          >
            {/* Thumbnail */}
            <div className="relative">
              <span
                className="absolute top-0 left-0 z-10 text-[9px] font-bold tracking-widest text-white uppercase px-2 py-0.5"
                style={{ background: t.accent }}
              >
                TEMPLATE
              </span>
              <DocThumbnail template={t} />
            </div>

            {/* Content */}
            <div className="flex flex-col gap-3 p-3 flex-1">
              <div>
                <div className="font-semibold text-sm text-primary mb-0.5">{t.title}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{t.desc}</div>
              </div>
              <div className="mt-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={e => { e.stopPropagation(); navigate('/offers/new') }}
                >
                  Use Template
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
