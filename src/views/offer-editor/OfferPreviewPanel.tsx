import { useEffect, useRef, useState } from 'react'
import type { TemplateVars } from '../../lib/blocksToTemplate'
import { renderOfferBlocksHtml } from '../../lib/offerBlockTemplate'

const A4_WIDTH = 793

interface OfferPreviewPanelProps {
  vars: TemplateVars
}

export function OfferPreviewPanel({ vars }: OfferPreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)

  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const available = containerRef.current.clientWidth - 24
        setScale(Math.min(available / A4_WIDTH, 1))
      }
    }
    updateScale()
    const ro = new ResizeObserver(updateScale)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const doc = iframe.contentDocument
    if (!doc) return
    doc.open()
    doc.write(renderOfferBlocksHtml(vars))
    doc.close()
  }, [vars])

  function handleOpenInTab() {
    const html = renderOfferBlocksHtml(vars)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) win.addEventListener('load', () => setTimeout(() => URL.revokeObjectURL(url), 5000))
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#141416' }}>
      <div
        className="flex items-center justify-between px-4 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid #222224' }}
      >
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Preview
        </span>
        <button
          onClick={handleOpenInTab}
          className="text-xs font-medium px-3 py-1 rounded transition-colors"
          style={{ color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.07)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.13)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
        >
          Open in tab ↗
        </button>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto p-3" style={{ background: '#1c1c1e' }}>
        <div
          style={{
            width: A4_WIDTH,
            transformOrigin: 'top left',
            transform: `scale(${scale})`,
            height: `calc(100% / ${scale})`,
          }}
        >
          <iframe
            ref={iframeRef}
            title="Offer preview"
            style={{
              width: A4_WIDTH,
              height: '100%',
              border: 'none',
              background: 'white',
            }}
          />
        </div>
      </div>
    </div>
  )
}
