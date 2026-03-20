import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { usePixelStore } from '../stores/pixel'
import type { PixelMessage } from '../lib/types'

const SUGGESTED = [
  "What's our revenue this month?",
  'Which domains expire soon?',
  'Active hosting clients?',
  'Pipeline summary',
  'Draft a client follow-up email',
]

type ModelChoice = 'auto' | 'claude' | 'gpt4o'

const MODEL_TABS: { value: ModelChoice; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'claude', label: 'Claude' },
  { value: 'gpt4o', label: 'GPT-4o' },
]

// ── Markdown renderer ───────────────────────────────────────────────────────

marked.setOptions({ breaks: true })

function MarkdownContent({ content }: { content: string }) {
  const raw = marked.parse(content) as string
  const html = DOMPurify.sanitize(raw)
  return <div className="pixel-md" dangerouslySetInnerHTML={{ __html: html }} />
}

// ── Animated dots ──────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', padding: '2px 0' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--c4)',
          display: 'inline-block',
          animation: 'pixelDot 1.2s ease-in-out infinite',
          animationDelay: `${i * 0.2}s`,
        }} />
      ))}
      <style>{`
        @keyframes pixelDot {
          0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </span>
  )
}

// ── Model badge ────────────────────────────────────────────────────────────

function ModelBadge({ model }: { model: PixelMessage['model'] }) {
  if (!model) return null
  const isClaude = model === 'claude'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
      padding: '2px 6px', borderRadius: 4,
      background: isClaude ? '#fef3c7' : '#dcfce7',
      color: isClaude ? '#92400e' : '#14532d',
      marginLeft: 8, verticalAlign: 'middle', textTransform: 'uppercase',
    }}>
      {isClaude ? 'Claude' : 'GPT-4o'}
    </span>
  )
}

// ── Avatar ─────────────────────────────────────────────────────────────────

function PixelAvatar({ size = 30 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 800, fontSize: size * 0.38,
      boxShadow: '0 2px 8px rgba(99,102,241,0.35)',
    }}>P</div>
  )
}

// ── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: PixelMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      alignItems: 'flex-end',
      gap: 10, marginBottom: 20,
      animation: 'slideIn 0.18s ease-out',
    }}>
      {!isUser && <PixelAvatar size={30} />}
      <div style={{ maxWidth: isUser ? '72%' : '82%' }}>
        <div style={{
          fontSize: 13, lineHeight: 1.65,
          wordBreak: 'break-word',
          ...(isUser ? {
            padding: '11px 16px',
            whiteSpace: 'pre-wrap',
            background: 'var(--navy)',
            color: '#fff',
            borderRadius: '18px 18px 4px 18px',
            boxShadow: '0 2px 8px rgba(26,58,108,0.18)',
          } : {
            padding: '12px 16px',
            background: '#fff',
            color: 'var(--c1)',
            borderRadius: '4px 18px 18px 18px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)',
          }),
        }}>
          {isUser
            ? msg.content
            : (
              <>
                <MarkdownContent content={msg.content} />
                <ModelBadge model={msg.model} />
              </>
            )
          }
        </div>
      </div>
      {isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: 'var(--navy-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: 'var(--navy)',
        }}>N</div>
      )}
    </div>
  )
}

// ── Model tab strip ─────────────────────────────────────────────────────────

function ModelTabStrip({ value, onChange }: { value: ModelChoice; onChange: (v: ModelChoice) => void }) {
  return (
    <div style={{
      display: 'flex', gap: 2,
      background: '#f0f0f8', borderRadius: 20, padding: 2,
      border: '1px solid #e0e0f0',
    }}>
      {MODEL_TABS.map(tab => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          style={{
            padding: '3px 10px', borderRadius: 16,
            fontSize: 10, fontWeight: 600,
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background 0.12s, color 0.12s, box-shadow 0.12s',
            ...(value === tab.value ? {
              background: '#fff',
              color: 'var(--c1)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
            } : {
              background: 'transparent',
              color: 'var(--c4)',
            }),
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── Markdown styles ─────────────────────────────────────────────────────────

const MD_STYLES = `
  .pixel-md { font-size: 13px; line-height: 1.65; color: var(--c1); }
  .pixel-md p { margin: 0 0 8px; }
  .pixel-md p:last-child { margin-bottom: 0; }
  .pixel-md strong { font-weight: 700; color: var(--c0); }
  .pixel-md em { font-style: italic; }
  .pixel-md h1, .pixel-md h2, .pixel-md h3 { font-weight: 700; color: var(--c0); margin: 12px 0 5px; line-height: 1.3; }
  .pixel-md h1:first-child, .pixel-md h2:first-child, .pixel-md h3:first-child { margin-top: 0; }
  .pixel-md h1 { font-size: 15px; }
  .pixel-md h2 { font-size: 14px; }
  .pixel-md h3 { font-size: 13px; }
  .pixel-md ul, .pixel-md ol { padding-left: 18px; margin: 6px 0 8px; }
  .pixel-md li { margin-bottom: 3px; }
  .pixel-md hr { border: none; border-top: 1px solid var(--c6); margin: 10px 0; }
  .pixel-md code { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11.5px; background: #f4f4f8; padding: 1px 5px; border-radius: 4px; color: #6366f1; }
  .pixel-md pre { background: #f4f4f8; border-radius: 8px; padding: 12px 14px; overflow-x: auto; margin: 8px 0; }
  .pixel-md pre code { background: none; padding: 0; color: var(--c1); }
  .pixel-md table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; }
  .pixel-md thead th { text-align: left; padding: 5px 10px; background: #f4f4f8; font-weight: 700; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.03em; color: var(--c3); border-bottom: 2px solid #e8e8f0; }
  .pixel-md tbody td { padding: 5px 10px; border-bottom: 1px solid #f0f0f5; color: var(--c2); }
  .pixel-md tbody tr:last-child td { border-bottom: none; }
  .pixel-md tbody tr:hover td { background: #fafafd; }
  .pixel-md blockquote { border-left: 3px solid var(--c5); margin: 8px 0; padding: 4px 12px; color: var(--c3); font-style: italic; }
`

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

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  const isEmpty = store.messages.length === 0
  const canSend = input.trim().length > 0 && !store.sending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#f9f9fb' }}>
      <style>{MD_STYLES}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 56, flexShrink: 0,
        background: '#fff', borderBottom: '1px solid var(--c6)',
        boxShadow: '0 1px 0 var(--c6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <PixelAvatar size={30} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--c1)', lineHeight: 1.2 }}>Pixel AI</div>
            <div style={{ fontSize: 10, color: 'var(--c3)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              Agency Intelligence Assistant
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {store.activeConversationId && (
            <button className="btn btn-ghost btn-sm" onClick={store.newConversation}
              style={{ fontSize: 11, color: 'var(--c3)' }}>
              + New chat
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(h => !h)}
              style={{ fontSize: 11, color: 'var(--c3)', gap: 4 }}>
              History
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {showHistory && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowHistory(false)} />
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)',
                  background: '#fff', border: '1px solid var(--c6)', borderRadius: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.10)', minWidth: 260, zIndex: 100, overflow: 'hidden',
                }}>
                  <div style={{ padding: '8px 8px 4px', borderBottom: '1px solid var(--c6)' }}>
                    <button className="btn btn-ghost btn-xs"
                      style={{ width: '100%', justifyContent: 'flex-start', gap: 6, color: 'var(--c2)', fontWeight: 600 }}
                      onClick={() => { store.newConversation(); setShowHistory(false) }}>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      New conversation
                    </button>
                  </div>
                  <div style={{ maxHeight: 280, overflowY: 'auto', padding: '4px 8px 8px' }}>
                    {store.conversations.length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--c4)', padding: '8px 6px' }}>No conversations yet</div>
                    )}
                    {store.conversations.map(c => (
                      <button key={c.id} className="btn btn-ghost btn-xs"
                        style={{
                          width: '100%', justifyContent: 'flex-start',
                          fontWeight: store.activeConversationId === c.id ? 600 : 400,
                          color: store.activeConversationId === c.id ? 'var(--navy)' : 'var(--c2)',
                          background: store.activeConversationId === c.id ? 'var(--navy-light)' : 'transparent',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
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
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
        {isEmpty ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '65vh', gap: 20 }}>
            <div style={{ position: 'relative' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 28,
                boxShadow: '0 8px 24px rgba(99,102,241,0.30)',
              }}>P</div>
              <div style={{
                position: 'absolute', bottom: 2, right: 2,
                width: 14, height: 14, borderRadius: '50%',
                background: '#22c55e', border: '2px solid #f9f9fb',
              }} />
            </div>
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
              <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--c1)', marginBottom: 6 }}>Hello, Nino 👋</div>
              <div style={{ fontSize: 13, color: 'var(--c3)', lineHeight: 1.6 }}>
                Ask me anything about your agency — revenue, clients, domains, pipeline, or let me draft something for you.
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 500 }}>
              {SUGGESTED.map(s => (
                <button key={s}
                  onClick={() => { setInput(s); textareaRef.current?.focus() }}
                  style={{
                    padding: '7px 14px', fontSize: 12, fontWeight: 500,
                    background: '#fff', border: '1px solid var(--c6)',
                    borderRadius: 20, cursor: 'pointer', color: 'var(--c2)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = '#6366f1'; (e.target as HTMLElement).style.color = '#6366f1' }}
                  onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--c6)'; (e.target as HTMLElement).style.color = 'var(--c2)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 700, margin: '0 auto', paddingTop: 28, paddingBottom: 12 }}>
            {store.messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}

            {store.sending && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 20 }}>
                <PixelAvatar size={30} />
                <div style={{
                  padding: '12px 16px',
                  background: '#fff',
                  borderRadius: '4px 18px 18px 18px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.05)',
                }}>
                  <ThinkingDots />
                </div>
              </div>
            )}

            {store.error && (
              <div className="alert alert-red" style={{ marginBottom: 16, fontSize: 12 }}>{store.error}</div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{ padding: '12px 24px 24px', flexShrink: 0 }}>
        <div style={{
          maxWidth: 700, margin: '0 auto',
          background: '#fff',
          border: '1px solid var(--c6)',
          borderRadius: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKey}
            placeholder="Ask Pixel AI anything..."
            rows={1}
            style={{
              display: 'block', width: '100%',
              resize: 'none', padding: '14px 16px 0',
              fontSize: 13, fontFamily: 'inherit',
              border: 'none', outline: 'none',
              background: 'transparent', color: 'var(--c1)',
              lineHeight: 1.6, minHeight: 48, maxHeight: 160,
              overflowY: 'auto',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px 10px' }}>
            <ModelTabStrip value={model} onChange={setModel} />
            <button
              onClick={handleSend}
              disabled={!canSend}
              style={{
                width: 32, height: 32, borderRadius: 10, border: 'none',
                cursor: canSend ? 'pointer' : 'default',
                background: canSend ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--c6)',
                color: canSend ? '#fff' : 'var(--c4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s, box-shadow 0.15s',
                boxShadow: canSend ? '0 2px 8px rgba(99,102,241,0.35)' : 'none',
                flexShrink: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 12V2M3 6l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div style={{ maxWidth: 700, margin: '6px auto 0', fontSize: 10, color: 'var(--c5)', textAlign: 'center' }}>
          Press Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  )
}
