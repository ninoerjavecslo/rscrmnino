import { Link } from 'react-router-dom'

interface ReportHeaderProps {
  title: string
  extra?: React.ReactNode
}

export function ReportHeader({ title, extra }: ReportHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-6 py-5 bg-white border-b border-border">
      <Link to="/reports" className="text-xs text-muted-foreground font-semibold flex items-center gap-1 no-underline">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Reports
      </Link>
      <span className="text-muted-foreground text-xs">/</span>
      <h1 className="text-[18px] font-extrabold tracking-[-0.2px] m-0">{title}</h1>
      {extra && <div className="ml-auto">{extra}</div>}
    </div>
  )
}
