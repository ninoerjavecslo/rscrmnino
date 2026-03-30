import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  children?: ReactNode  // action buttons on the right
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="text-muted-foreground text-[13px] m-0">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
