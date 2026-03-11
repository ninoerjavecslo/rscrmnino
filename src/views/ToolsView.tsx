import { useNavigate } from 'react-router-dom'

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function ClockIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function FileTextIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToolCard {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  available: boolean
  path?: string
}

// ── Tool data ─────────────────────────────────────────────────────────────────

const TOOLS: ToolCard[] = [
  {
    id: 'timesheet',
    name: 'Timesheet',
    description: 'Track monthly hours per project with smart AI distribution',
    icon: <ClockIcon />,
    available: true,
    path: '/tools/timesheet',
  },
  {
    id: 'email-tool',
    name: 'Email Tool',
    description: 'Generate Slovenian invoice requests for your accountant',
    icon: <MailIcon />,
    available: true,
    path: '/email-tool',
  },
  {
    id: 'invoice-generator',
    name: 'Invoice Generator',
    description: 'Generate PDF invoices from project data',
    icon: <DocumentIcon />,
    available: false,
  },
  {
    id: 'contract-templates',
    name: 'Contract Templates',
    description: 'Standard contract templates for fixed, maintenance and retainer projects',
    icon: <FileTextIcon />,
    available: false,
  },
  {
    id: 'offer-generator',
    name: 'Offer Generator',
    description: 'Create client offers with automatic pricing',
    icon: <EditIcon />,
    available: false,
  },
]

// ── Tool card component ───────────────────────────────────────────────────────

function ToolCardItem({ tool }: { tool: ToolCard }) {
  const navigate = useNavigate()

  function handleClick() {
    if (tool.available && tool.path) {
      navigate(tool.path)
    }
  }

  return (
    <div
      className="card"
      onClick={handleClick}
      style={{
        padding: 20,
        cursor: tool.available ? 'pointer' : 'default',
        transition: 'box-shadow 0.12s',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
      onMouseEnter={e => {
        if (tool.available) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = ''
      }}
    >
      {/* Icon + badge row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--r)',
            background: tool.available ? 'var(--navy-light, #eef2f9)' : 'var(--c7, #f5f5f5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: tool.available ? 'var(--navy, #1a3a6c)' : 'var(--c4, #aaa)',
            flexShrink: 0,
          }}
        >
          {tool.icon}
        </div>
        <span className={`badge ${tool.available ? 'badge-green' : 'badge-gray'}`}>
          {tool.available ? 'Available' : 'Coming soon'}
        </span>
      </div>

      {/* Name + description */}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--c1, #111)', marginBottom: 4 }}>
          {tool.name}
        </div>
        <div className="text-muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          {tool.description}
        </div>
      </div>

      {/* Action button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {tool.available ? (
          <button
            className="btn btn-primary btn-sm"
            onClick={e => {
              e.stopPropagation()
              if (tool.path) navigate(tool.path)
            }}
          >
            Open
          </button>
        ) : (
          <button className="btn btn-secondary btn-sm" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
            Coming soon
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function ToolsView() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Tools</h1>
          <p>Studio utilities and generators</p>
        </div>
      </div>

      <div className="page-content">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}
        >
          {TOOLS.map(tool => (
            <ToolCardItem key={tool.id} tool={tool} />
          ))}
        </div>
      </div>
    </div>
  )
}
