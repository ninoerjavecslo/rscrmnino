import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { usePixelStore } from '../stores/pixel'
import type { PixelState } from '../stores/pixel'
import type { PixelMessage } from '../lib/types'
import { Button } from '@/components/ui/button'

type ModelChoice = 'auto' | 'claude' | 'gpt4o'

const MODEL_PILLS: { value: ModelChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'claude', label: 'Claude' },
  { value: 'gpt4o', label: 'GPT-4o' },
]

const CHIPS: { text: string }[] = [
  { text: "What's our revenue this month?" },
  { text: 'Which domains expire soon?' },
  { text: 'Active hosting clients?' },
  { text: 'Pipeline summary' },
  { text: 'Draft a client follow-up email' },
]

// ── Icons ────────────────────────────────────────────────────────────────────

function SparkleIcon({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
      <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z"/>
    </svg>
  )
}

function ChipIcon({ index }: { index: number }) {
  const icons = [
    <svg key={0} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    <svg key={1} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    <svg key={2} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>,
    <svg key={3} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    <svg key={4} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  ]
  return icons[index] ?? icons[0]
}

// ── Markdown renderer ───────────────────────────────────────────────────────

marked.setOptions({ breaks: true })

function MarkdownContent({ content }: { content: string }) {
  const raw = marked.parse(content) as string
  const clean = DOMPurify.sanitize(raw)
  // DOMPurify-sanitized output rendered safely
  return <div className="pixel-md" dangerouslySetInnerHTML={{ __html: clean }} />
}

// ── Animated dots ──────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <span className="inline-flex gap-[3px] items-center py-[2px]">
      {[0, 1, 2].map(i => (
        <span key={i} className="inline-block rounded-full w-[6px] h-[6px] bg-muted-foreground"
          style={{
            animation: 'pixelDot 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </span>
  )
}

// ── Model badge ────────────────────────────────────────────────────────────

function ModelBadge({ model }: { model: PixelMessage['model'] }) {
  if (!model) return null
  const isClaude = model === 'claude'
  return (
    <span className={`inline-flex items-center font-bold uppercase ml-2 align-middle rounded-[3px] px-[6px] py-[2px] text-[9px] tracking-[0.03em] ${isClaude ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#dcfce7] text-[#14532d]'}`}>
      {isClaude ? 'Claude' : 'GPT-4o'}
    </span>
  )
}

// ── Avatars ────────────────────────────────────────────────────────────────

function AIAvatar({ size = 30 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center flex-shrink-0 rounded-[6px] bg-primary"
      style={{ width: size, height: size }}>
      <SparkleIcon size={Math.round(size * 0.55)} color="#fff" />
    </div>
  )
}

function UserAvatar({ size = 30 }: { size?: number }) {
  return (
    <div className="rounded-full flex-shrink-0 flex items-center justify-center font-bold bg-[#eef2f9] text-primary"
      style={{
        width: size, height: size,
        fontSize: Math.round(size * 0.37),
      }}>N</div>
  )
}

// ── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: PixelMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex items-end gap-[10px] mb-5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && <AIAvatar size={30} />}
      <div style={{ maxWidth: isUser ? '72%' : '82%' }}>
        <div className="text-[13px] leading-[1.65] break-words"
          style={isUser ? {
            padding: '11px 16px', whiteSpace: 'pre-wrap',
            background: 'var(--navy)', color: '#fff',
            borderRadius: '12px 12px 3px 12px',
          } : {
            padding: '12px 16px', background: '#fff', color: 'var(--c1)',
            borderRadius: '3px 12px 12px 12px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)',
          }}>
          {isUser ? msg.content : <><MarkdownContent content={msg.content} /><ModelBadge model={msg.model} /></>}
        </div>
      </div>
      {isUser && <UserAvatar size={30} />}
    </div>
  )
}

// ── History controls (rendered once, outside isEmpty branch) ───────────────

function HistoryControls({ store, showHistory, setShowHistory }: {
  store: PixelState
  showHistory: boolean
  setShowHistory: (v: boolean) => void
}) {
  return (
    <div className="flex gap-[6px] items-center">
      {store.activeConversationId && (
        <Button variant="ghost" size="sm" onClick={store.newConversation} className="text-muted-foreground">
          + New chat
        </Button>
      )}
      <div className="relative">
        <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)} className="text-muted-foreground gap-1">
          History
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Button>
        {showHistory && (
          <>
            <div className="fixed inset-0 z-[99]" onClick={() => setShowHistory(false)} />
            <div className="absolute right-0 bg-white rounded-[10px] overflow-hidden z-[100] border border-border shadow-lg min-w-[260px]"
              style={{ top: 'calc(100% + 6px)' }}>
              <div className="px-2 pt-2 pb-1 border-b border-border">
                <Button variant="ghost" size="xs" className="w-full justify-start gap-[6px] font-semibold text-[#374151]"
                  onClick={() => { store.newConversation(); setShowHistory(false) }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  New conversation
                </Button>
              </div>
              <div className="overflow-y-auto px-2 pb-2 pt-1 max-h-[280px]">
                {store.conversations.length === 0 && (
                  <div className="text-[11px] text-muted-foreground px-[6px] py-2">No conversations yet</div>
                )}
                {store.conversations.map(c => (
                  <Button key={c.id} variant="ghost" size="xs"
                    className="w-full justify-start truncate"
                    style={{
                      fontWeight: store.activeConversationId === c.id ? 600 : 400,
                      color: store.activeConversationId === c.id ? 'var(--navy)' : 'var(--c2)',
                      background: store.activeConversationId === c.id ? 'var(--navy-light)' : 'transparent',
                    }}
                    onClick={() => { store.loadConversation(c.id); setShowHistory(false) }}>
                    {c.title ?? 'Untitled'}
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main view ──────────────────────────────────────────────────────────────

export function PixelView() {
  const store = usePixelStore()
  const [input, setInput] = useState('')
  const [model, setModel] = useState<ModelChoice>('auto')
  const [showHistory, setShowHistory] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { store.fetchConversations() }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [store.messages, store.streamingContent])

  function handleSend() {
    const text = input.trim()
    if (!text || store.sending) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    store.sendMessage(text, model === 'auto' ? undefined : model)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }

  const isEmpty = store.messages.length === 0 && store.streamingContent === null
  const canSend = input.trim().length > 0 && !store.sending

  return (
    <div className="flex flex-col pb-[120px]" style={{ minHeight: 'calc(100vh - 52px)' }}>

      {/* History controls — floated top right regardless of state */}
      <div className="absolute z-10" style={{ top: 60, right: 24 }}>
        <HistoryControls store={store} showHistory={showHistory} setShowHistory={setShowHistory} />
      </div>

      {/* Messages / Empty state */}
      <div className="flex-1 overflow-y-auto px-6">
        {isEmpty ? (
          <div className="flex flex-col items-center pt-[60px]">

            {/* Navy square icon */}
            <div className="flex items-center justify-center rounded-[12px] bg-primary w-14 h-14">
              <SparkleIcon size={28} color="#fff" />
            </div>

            <h1 className="font-extrabold text-center mt-5 text-primary font-[Manrope,sans-serif] text-[32px]">
              Hello, Nino 👋
            </h1>
            <p className="text-sm text-muted-foreground text-center leading-[1.6] mt-2 max-w-[440px]">
              Ask me anything about your agency — revenue, clients, domains, pipeline, or let me draft something for you.
            </p>

            {/* 2×2 + 1 full-width chip grid */}
            <div className="grid gap-[10px] mt-8 w-full max-w-[600px]" style={{ gridTemplateColumns: '1fr 1fr' }}>
              {CHIPS.map((chip, i) => (
                <button
                  key={chip.text}
                  onClick={() => { setInput(chip.text); textareaRef.current?.focus() }}
                  className="bg-white cursor-pointer flex items-center gap-[10px] rounded-lg px-[18px] py-[14px] text-left transition-colors hover:bg-[#f8f7f9] border border-border font-[inherit]"
                  style={{
                    gridColumn: i === CHIPS.length - 1 ? '1 / -1' : undefined,
                  }}
                >
                  <span className="text-muted-foreground flex-shrink-0"><ChipIcon index={i} /></span>
                  <span className="text-[13px] font-medium leading-[1.4] text-foreground">{chip.text}</span>
                </button>
              ))}
            </div>

          </div>
        ) : (
          <div className="mx-auto pt-[60px] pb-3 max-w-[640px]">
            {store.messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            {store.streamingContent !== null ? (
              <div className="flex items-end gap-[10px] mb-5">
                <AIAvatar size={30} />
                <div style={{ maxWidth: '82%', padding: '12px 16px', background: '#fff', color: 'var(--c1)', borderRadius: '3px 12px 12px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)', fontSize: 13, lineHeight: 1.65 }}>
                  <MarkdownContent content={store.streamingContent || '​'} />
                </div>
              </div>
            ) : store.sending && (
              <div className="flex items-end gap-[10px] mb-5">
                <AIAvatar size={30} />
                <div className="px-4 py-3 bg-white rounded-[3px_12px_12px_12px] shadow-sm">
                  <ThinkingDots />
                </div>
              </div>
            )}
            {store.error && (
              <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-xs text-[#be123c] mb-4">{store.error}</div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Fixed input bar */}
      <div className="fixed bottom-0 right-0 z-[80] border-t border-border px-8 py-4"
        style={{
          left: 'var(--sidebar-w)',
          background: 'rgba(240,238,242,0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>
        <div className="mx-auto max-w-[600px]">
          <div className="bg-white rounded-[10px] relative border border-border" style={{ padding: '14px 54px 42px 18px' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKey}
              placeholder="Message Pixel AI…"
              rows={1}
              className="border-0 outline-none bg-transparent w-full resize-none overflow-y-auto leading-[1.5] text-sm text-foreground font-[inherit]"
              style={{ minHeight: 20, maxHeight: 120 }}
            />
            {/* Model pills */}
            <div className="absolute bottom-[10px] left-[14px] flex items-center gap-[6px]">
              {MODEL_PILLS.map(pill => (
                <button
                  key={pill.value}
                  onClick={() => setModel(pill.value)}
                  className="rounded-[3px] cursor-pointer uppercase font-bold leading-[1.4] font-[Manrope,sans-serif] text-[10px] tracking-[0.04em]"
                  style={{
                    background: model === pill.value ? 'var(--navy)' : 'transparent',
                    border: `1px solid ${model === pill.value ? 'var(--navy)' : 'var(--c6)'}`,
                    padding: '3px 10px',
                    color: model === pill.value ? '#fff' : 'var(--c3)',
                  }}
                >
                  {pill.label}
                </button>
              ))}
            </div>
            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="absolute bottom-[10px] right-[10px] flex items-center justify-center rounded-[6px] border-0 transition-colors w-9 h-9"
              style={{
                background: canSend ? 'var(--navy)' : 'var(--c6)',
                cursor: canSend ? 'pointer' : 'default',
                opacity: canSend ? 1 : 0.6,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={canSend ? '#fff' : 'var(--c4)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
              </svg>
            </button>
          </div>
          <p className="text-center mt-2 font-bold uppercase text-muted-foreground font-[Manrope,sans-serif] text-[9px] tracking-[0.06em]">
            Pixel AI may produce inaccurate information · Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  )
}
