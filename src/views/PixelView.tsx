import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { usePixelStore } from '../stores/pixel'
import type { PixelState } from '../stores/pixel'
import type { PixelMessage } from '../lib/types'

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
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', padding: '2px 0' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--c4)', display: 'inline-block',
          animation: 'pixelDot 1.2s ease-in-out infinite',
          animationDelay: `${i * 0.2}s`,
        }} />
      ))}
    </span>
  )
}

// ── Model badge ────────────────────────────────────────────────────────────

function ModelBadge({ model }: { model: PixelMessage['model'] }) {
  if (!model) return null
  const isClaude = model === 'claude'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
      padding: '2px 6px', borderRadius: 3,
      background: isClaude ? '#fef3c7' : '#dcfce7',
      color: isClaude ? '#92400e' : '#14532d',
      marginLeft: 8, verticalAlign: 'middle', textTransform: 'uppercase',
    }}>
      {isClaude ? 'Claude' : 'GPT-4o'}
    </span>
  )
}

// ── Avatars ────────────────────────────────────────────────────────────────

function AIAvatar({ size = 30 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, background: 'var(--navy)',
      borderRadius: 6, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
    }}>
      <SparkleIcon size={Math.round(size * 0.55)} color="#fff" />
    </div>
  )
}

function UserAvatar({ size = 30 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--navy-light)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.37), fontWeight: 700, color: 'var(--navy)',
    }}>N</div>
  )
}

// ── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: PixelMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      alignItems: 'flex-end', gap: 10, marginBottom: 20,
    }}>
      {!isUser && <AIAvatar size={30} />}
      <div style={{ maxWidth: isUser ? '72%' : '82%' }}>
        <div style={{
          fontSize: 13, lineHeight: 1.65, wordBreak: 'break-word',
          ...(isUser ? {
            padding: '11px 16px', whiteSpace: 'pre-wrap',
            background: 'var(--navy)', color: '#fff',
            borderRadius: '12px 12px 3px 12px',
          } : {
            padding: '12px 16px', background: '#fff', color: 'var(--c1)',
            borderRadius: '3px 12px 12px 12px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)',
          }),
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
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {store.activeConversationId && (
        <button className="btn btn-ghost btn-sm" onClick={store.newConversation} style={{ color: 'var(--c3)' }}>
          + New chat
        </button>
      )}
      <div style={{ position: 'relative' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(!showHistory)} style={{ color: 'var(--c3)', gap: 4 }}>
          History
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {showHistory && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowHistory(false)} />
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: '#fff', border: '1px solid var(--c6)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.10)', minWidth: 260, zIndex: 100, overflow: 'hidden' }}>
              <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid var(--c6)' }}>
                <button className="btn btn-ghost btn-xs" style={{ width: '100%', justifyContent: 'flex-start', gap: 6, color: 'var(--c2)', fontWeight: 600 }}
                  onClick={() => { store.newConversation(); setShowHistory(false) }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  New conversation
                </button>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto', padding: '4px 8px 8px' }}>
                {store.conversations.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--c4)', padding: '8px 6px' }}>No conversations yet</div>
                )}
                {store.conversations.map(c => (
                  <button key={c.id} className="btn btn-ghost btn-xs"
                    style={{ width: '100%', justifyContent: 'flex-start', fontWeight: store.activeConversationId === c.id ? 600 : 400, color: store.activeConversationId === c.id ? 'var(--navy)' : 'var(--c2)', background: store.activeConversationId === c.id ? 'var(--navy-light)' : 'transparent', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    onClick={() => { store.loadConversation(c.id); setShowHistory(false) }}>
                    {c.title ?? 'Untitled'}
                  </button>
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
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [store.messages])

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

  const isEmpty = store.messages.length === 0
  const canSend = input.trim().length > 0 && !store.sending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 52px)', paddingBottom: 120 }}>

      {/* History controls — floated top right regardless of state */}
      <div style={{ position: 'absolute', top: 60, right: 24, zIndex: 10 }}>
        <HistoryControls store={store} showHistory={showHistory} setShowHistory={setShowHistory} />
      </div>

      {/* Messages / Empty state */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
        {isEmpty ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 60 }}>

            {/* Navy square icon */}
            <div style={{ width: 56, height: 56, background: 'var(--navy)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SparkleIcon size={28} color="#fff" />
            </div>

            <h1 style={{ fontFamily: 'Manrope, sans-serif', fontWeight: 800, fontSize: 32, color: 'var(--navy)', marginTop: 20, textAlign: 'center' }}>
              Hello, Nino 👋
            </h1>
            <p style={{ fontSize: 14, color: 'var(--c3)', textAlign: 'center', lineHeight: 1.6, marginTop: 8, maxWidth: 440 }}>
              Ask me anything about your agency — revenue, clients, domains, pipeline, or let me draft something for you.
            </p>

            {/* 2×2 + 1 full-width chip grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 32, width: '100%', maxWidth: 600 }}>
              {CHIPS.map((chip, i) => (
                <button
                  key={chip.text}
                  onClick={() => { setInput(chip.text); textareaRef.current?.focus() }}
                  style={{
                    background: '#fff', border: '1px solid var(--c6)', borderRadius: 8,
                    padding: '14px 18px', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', gap: 10, transition: 'background .12s, border-color .12s',
                    fontFamily: 'inherit', textAlign: 'left',
                    gridColumn: i === CHIPS.length - 1 ? '1 / -1' : undefined,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f8f7f9'; e.currentTarget.style.borderColor = '#d9d3dc' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = 'var(--c6)' }}
                >
                  <span style={{ color: 'var(--c3)', flexShrink: 0 }}><ChipIcon index={i} /></span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--c0)', lineHeight: 1.4 }}>{chip.text}</span>
                </button>
              ))}
            </div>

          </div>
        ) : (
          <div style={{ maxWidth: 640, margin: '0 auto', paddingTop: 60, paddingBottom: 12 }}>
            {store.messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            {store.sending && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 20 }}>
                <AIAvatar size={30} />
                <div style={{ padding: '12px 16px', background: '#fff', borderRadius: '3px 12px 12px 12px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
                  <ThinkingDots />
                </div>
              </div>
            )}
            {store.error && <div className="alert alert-red" style={{ marginBottom: 16, fontSize: 12 }}>{store.error}</div>}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Fixed input bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 'var(--sidebar-w)', right: 0,
        background: 'rgba(240,238,242,0.95)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)', borderTop: '1px solid var(--c6)',
        padding: '16px 32px', zIndex: 80,
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ background: '#fff', border: '1px solid var(--c6)', borderRadius: 10, padding: '14px 54px 42px 18px', position: 'relative' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKey}
              placeholder="Message Pixel AI…"
              rows={1}
              style={{
                border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'inherit', fontSize: 14, color: 'var(--c0)',
                width: '100%', resize: 'none', minHeight: 20, maxHeight: 120,
                lineHeight: 1.5, overflowY: 'auto',
              }}
            />
            {/* Model pills */}
            <div style={{ position: 'absolute', bottom: 10, left: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              {MODEL_PILLS.map(pill => (
                <button
                  key={pill.value}
                  onClick={() => setModel(pill.value)}
                  style={{
                    background: model === pill.value ? 'var(--navy)' : 'transparent',
                    border: `1px solid ${model === pill.value ? 'var(--navy)' : 'var(--c6)'}`,
                    borderRadius: 3, padding: '3px 10px',
                    fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 10,
                    color: model === pill.value ? '#fff' : 'var(--c3)',
                    cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.04em', lineHeight: 1.4,
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
              style={{
                position: 'absolute', bottom: 10, right: 10,
                width: 36, height: 36, background: canSend ? 'var(--navy)' : 'var(--c6)',
                border: 'none', borderRadius: 6,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: canSend ? 'pointer' : 'default', opacity: canSend ? 1 : 0.6,
                transition: 'background .12s',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={canSend ? '#fff' : 'var(--c4)'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
              </svg>
            </button>
          </div>
          <p style={{ textAlign: 'center', marginTop: 8, fontFamily: 'Manrope, sans-serif', fontWeight: 700, fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--c4)' }}>
            Pixel AI may produce inaccurate information · Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  )
}
