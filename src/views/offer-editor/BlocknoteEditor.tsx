import React, { useEffect } from 'react'
import { BlockNoteView } from '@blocknote/mantine'
import {
  useCreateBlockNote,
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
} from '@blocknote/react'
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core'
import { en } from '@blocknote/core/locales'
import { AIExtension } from '@blocknote/xl-ai'
import { DefaultChatTransport } from 'ai'
import { en as aiEn } from '@blocknote/xl-ai/locales'
import '@blocknote/mantine/style.css'
import '@blocknote/xl-ai/style.css'
import { ClientMetaBlock } from '../../components/offer-blocks/ClientMetaBlock'
import { ServiceBlock } from '../../components/offer-blocks/ServiceBlock'
import { PricingTableBlock } from '../../components/offer-blocks/PricingTableBlock'
import { BoilerplateBlock } from '../../components/offer-blocks/BoilerplateBlock'
import { MaintenancePackageBlock } from '../../components/offer-blocks/MaintenancePackageBlock'
import { SLATableBlock } from '../../components/offer-blocks/SLATableBlock'
import { PhaseBlock } from '../../components/offer-blocks/PhaseBlock'
import { ContentGridBlock } from '../../components/offer-blocks/ContentGridBlock'
import { BulletListBlock } from '../../components/offer-blocks/BulletListBlock'
import { InfoBoxBlock } from '../../components/offer-blocks/InfoBoxBlock'

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    clientMeta: ClientMetaBlock(),
    serviceBlock: ServiceBlock(),
    pricingTable: PricingTableBlock(),
    boilerplateBlock: BoilerplateBlock(),
    maintenancePackage: MaintenancePackageBlock(),
    slaTable: SLATableBlock(),
    phaseBlock: PhaseBlock(),
    contentGridBlock: ContentGridBlock(),
    bulletListBlock: BulletListBlock(),
    infoBoxBlock: InfoBoxBlock(),
  },
})

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const CUSTOM_BLOCK_DEFS = [
  { key: 'clientMeta',        title: 'Offer Details',        subtext: 'Client info, date, and intro text',         aliases: ['client', 'meta', 'offer', 'details'],       icon: '📋' },
  { key: 'serviceBlock',      title: 'Service Section',       subtext: 'Named section with description',            aliases: ['service', 'section'],                       icon: '📦' },
  { key: 'pricingTable',      title: 'Pricing Table',         subtext: 'Line items with quantities and prices',     aliases: ['price', 'pricing', 'table', 'invoice'],     icon: '💶' },
  { key: 'boilerplateBlock',  title: 'Boilerplate Section',   subtext: 'Payment terms, copyright, notes',          aliases: ['boilerplate', 'terms', 'notes', 'legal'],   icon: '📄' },
  { key: 'maintenancePackage',title: 'Maintenance Package',   subtext: 'Monthly support package with features',    aliases: ['maintenance', 'support', 'package'],        icon: '🔧' },
  { key: 'slaTable',          title: 'SLA Table',             subtext: 'Response time, uptime and support hours',  aliases: ['sla', 'uptime'],                            icon: '📊' },
  { key: 'phaseBlock',        title: 'Project Phase',         subtext: 'Phase header with deliverables list',      aliases: ['phase', 'milestone', 'stage'],              icon: '🏁' },
  { key: 'contentGridBlock',  title: 'Content Grid',          subtext: '2-column card grid for features/benefits', aliases: ['grid', 'cards', 'features', 'benefits'],    icon: '▦' },
  { key: 'bulletListBlock',   title: 'Bullet List',           subtext: 'Styled list with accent color',            aliases: ['list', 'bullets', 'items'],                 icon: '•' },
  { key: 'infoBoxBlock',      title: 'Info Box',              subtext: 'Callout box — highlight, note, or warning', aliases: ['info', 'callout', 'note', 'highlight', 'warning'], icon: 'ℹ' },
] as const

interface BlocknoteEditorProps {
  initialBlocks?: unknown[]
  onChange: (blocks: unknown[]) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editorRef?: React.MutableRefObject<any>
  onBlockSelect?: (block: unknown | null) => void
}

export function BlocknoteEditor({ initialBlocks, onChange, editorRef, onBlockSelect }: BlocknoteEditorProps) {
  const editor = useCreateBlockNote({
    schema,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialContent: initialBlocks?.length ? (initialBlocks as any) : undefined,
    dictionary: { ...en, ai: aiEn },
    extensions: [
      AIExtension({
        transport: new DefaultChatTransport({
          api: `${supabaseUrl}/functions/v1/ai-blocknote`,
          headers: {
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        }),
      }),
    ],
  })

  useEffect(() => {
    if (editorRef) editorRef.current = editor
  }, [editor, editorRef])

  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      onChange(editor.document as unknown[])
    })
    return () => unsubscribe?.()
  }, [editor, onChange])

  useEffect(() => {
    if (!onBlockSelect) return
    const unsubscribe = editor.onSelectionChange(() => {
      try {
        const pos = editor.getTextCursorPosition()
        onBlockSelect(pos.block ?? null)
      } catch {
        // no cursor position (editor unfocused)
      }
    })
    return () => unsubscribe?.()
  }, [editor, onBlockSelect])

  return (
    <div className="h-full overflow-y-auto">
      <BlockNoteView editor={editor} theme="light" slashMenu={false}>
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <SuggestionMenuController
          triggerCharacter="/"
          {...({} as any)}
          getItems={async (query) => {
            const defaults = getDefaultReactSlashMenuItems(editor)
            const custom = CUSTOM_BLOCK_DEFS.map(({ key, title, subtext, aliases, icon }) => ({
              title,
              subtext,
              aliases,
              group: 'Offer blocks',
              icon: <span style={{ fontSize: 16 }}>{icon}</span>,
              onItemClick: () => {
                editor.insertBlocks(
                  [{ type: key }],
                  editor.getTextCursorPosition().block,
                  'after',
                )
              },
            }))
            const all = [...custom, ...defaults]
            if (!query) return all
            const q = query.toLowerCase()
            return all.filter(item =>
              item.title.toLowerCase().includes(q) ||
              item.aliases?.some(a => a.toLowerCase().includes(q))
            )
          }}
        />
      </BlockNoteView>
    </div>
  )
}
