import { useState } from 'react'
import type { Advisory } from '../lib/planningAdvisor'

interface AdvisorPanelProps {
  advisories: Advisory[]
  summary?: string
  loading?: boolean
  onRefresh?: () => void
}

export function AdvisorPanel({ advisories, summary, loading, onRefresh }: AdvisorPanelProps) {
  const [open, setOpen] = useState(true)

  const highCount = advisories.filter(a => a.priority === 'high').length

  const priorityColor = (p: Advisory['priority']) => {
    if (p === 'high') return 'var(--red)'
    if (p === 'medium') return 'var(--amber)'
    return 'var(--c3)'
  }

  const priorityBg = (p: Advisory['priority']) => {
    if (p === 'high') return '#fce4ec'
    if (p === 'medium') return '#fff8e1'
    return 'var(--c7)'
  }

  const typeIcon = (t: Advisory['type']) => {
    switch (t) {
      case 'overallocation': return '⚡'
      case 'underallocation': return '💤'
      case 'deadline_risk': return '🗓'
      case 'unplanned_spike': return '⚠️'
      case 'low_billable': return '💰'
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div
        style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--c1)' }}>
          Weekly Advisor
          {highCount > 0 && (
            <span style={{ marginLeft: 8, background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
              {highCount} urgent
            </span>
          )}
          {advisories.length === 0 && !loading && (
            <span style={{ marginLeft: 8, color: 'var(--green)', fontSize: 12, fontWeight: 400 }}>✓ All good</span>
          )}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onRefresh && !loading && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={e => { e.stopPropagation(); onRefresh?.() }}
              style={{ fontSize: 11, padding: '2px 8px' }}
            >
              ↻ AI
            </button>
          )}
          <span style={{ color: 'var(--c4)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--c6)', padding: '8px 12px' }}>
          {summary && (
            <p style={{ fontSize: 12, color: 'var(--c3)', fontStyle: 'italic', margin: '4px 4px 10px', lineHeight: 1.5 }}>
              {summary}
            </p>
          )}
          {loading && <p style={{ fontSize: 13, color: 'var(--c4)', margin: '8px 4px' }}>Analyzing...</p>}
          {!loading && advisories.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--c4)', margin: '8px 4px' }}>No issues detected for this week.</p>
          )}
          {advisories.map(a => (
            <div key={a.id} style={{
              display: 'flex', gap: 10, padding: '8px 4px',
              borderBottom: '1px solid var(--c6)',
            }}>
              <span style={{ fontSize: 16, marginTop: 1 }}>{typeIcon(a.type)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: priorityColor(a.priority) }}>{a.title}</div>
                <div style={{ fontSize: 12, color: 'var(--c3)', marginTop: 2 }}>{a.body}</div>
              </div>
              <div style={{
                alignSelf: 'flex-start',
                background: priorityBg(a.priority),
                color: priorityColor(a.priority),
                borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
              }}>
                {a.priority}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
