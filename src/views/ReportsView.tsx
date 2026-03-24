import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const REPORTS = [
  {
    category: 'TEAM',
    categoryVariant: 'blue' as const,
    title: 'Resource Utilization',
    description: 'Allocation analytics by member, category and project. Billable vs unplanned breakdown.',
    route: '/resource-reports',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="18" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="2" y="13" width="4" height="8"/></svg>,
  },
  {
    category: 'TEAM',
    categoryVariant: 'blue' as const,
    title: 'Yearly Capacity',
    description: 'Full-year heatmap of team utilization across all 12 months.',
    route: '/resource-yearly',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  },
  {
    category: 'TEAM',
    categoryVariant: 'blue' as const,
    title: 'Monthly Breakdown',
    description: 'Week-by-week capacity grid for a selected month.',
    route: '/resource-monthly',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  },
  {
    category: 'FINANCE',
    categoryVariant: 'green' as const,
    title: 'Revenue & Forecast',
    description: 'Multi-year revenue forecast combining invoices, pipeline deals, and recurring contracts.',
    route: '/forecast',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  },
  {
    category: 'SALES',
    categoryVariant: 'amber' as const,
    title: 'Pipeline Impact',
    description: 'How open deals affect team capacity. Identify at-risk months before they happen.',
    route: '/reports/pipeline-impact',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  },
  {
    category: 'PROJECTS',
    categoryVariant: 'red' as const,
    title: 'Delay Impact',
    description: 'Delayed deliverables and confirmation delays. See displaced hours and affected members.',
    route: '/reports/delay-impact',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  },
  {
    category: 'AI',
    categoryVariant: 'navy' as const,
    title: 'Capacity Forecast',
    description: 'Estimated load vs capacity for 1–6 months. AI-generated delay scenarios and executive insights.',
    route: '/reports/capacity-forecast',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/><path d="M9.09 4.5A8 8 0 1 1 4.5 9.09"/></svg>,
  },
  {
    category: 'OVERVIEW',
    categoryVariant: 'navy' as const,
    title: 'Monthly Digest',
    description: 'Combined monthly summary: revenue, capacity, deliverables, and pipeline activity.',
    route: '/reports/monthly-digest',
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  },
]

export function ReportsView() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="flex items-center justify-between px-6 py-5 bg-white border-b border-border">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-[-0.3px] m-0">Reports</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Analytics and operational intelligence</p>
        </div>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-3 gap-4">
          {REPORTS.map(r => (
            <Card key={r.route} className="hover:border-[#0f172a]/20 transition-colors">
              <CardContent className="p-5 flex flex-col gap-3 h-full">
                <div className="flex items-start justify-between">
                  <div className="w-9 h-9 rounded-lg bg-[var(--c7)] flex items-center justify-center shrink-0">
                    {r.icon}
                  </div>
                  <Badge variant={r.categoryVariant}>{r.category}</Badge>
                </div>
                <div className="flex-1">
                  <div className="font-bold text-[15px] text-foreground mb-1">{r.title}</div>
                  <div className="text-[13px] text-muted-foreground leading-[1.55]">{r.description}</div>
                </div>
                <Link to={r.route}>
                  <Button variant="outline" size="sm" className="w-full">Open Report →</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
