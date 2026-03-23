import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function ClockIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
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
    <Card
      onClick={handleClick}
      className={`p-5 flex flex-col gap-3 transition-shadow ${tool.available ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}`}
    >
      {/* Icon + badge row */}
      <div className="flex items-start justify-between">
        <div
          className={`flex items-center justify-center flex-shrink-0 rounded-lg w-12 h-12 ${tool.available ? 'bg-[#eef2f9] text-[#1a3a6c]' : 'bg-[#f5f5f5] text-[#aaa]'}`}
        >
          {tool.icon}
        </div>
        <Badge variant={tool.available ? 'green' : 'gray'}>
          {tool.available ? 'Available' : 'Coming soon'}
        </Badge>
      </div>

      {/* Name + description */}
      <div className="flex-1">
        <div className="font-bold text-base mb-1 text-foreground">
          {tool.name}
        </div>
        <div className="text-muted-foreground text-[13px] leading-[1.5]">
          {tool.description}
        </div>
      </div>

      {/* Action button */}
      <div className="flex justify-end">
        {tool.available ? (
          <Button size="sm"
            onClick={e => {
              e.stopPropagation()
              if (tool.path) navigate(tool.path)
            }}
          >
            Open
          </Button>
        ) : (
          <Button variant="outline" size="sm" disabled className="opacity-50 cursor-not-allowed">
            Coming soon
          </Button>
        )}
      </div>
    </Card>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function ToolsView() {
  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Tools</h1>
          <p>Studio utilities and generators</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-2 gap-4">
          {TOOLS.map(tool => (
            <ToolCardItem key={tool.id} tool={tool} />
          ))}
        </div>
      </div>
    </div>
  )
}
