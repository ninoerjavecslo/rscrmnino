import { Card, CardContent } from '@/components/ui/card'

interface StatCardProps {
  label: string
  value: string | number
  sub: string
}

export function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.08em] mb-2">{label}</div>
        <div className="text-[24px] font-extrabold tracking-[-0.5px] leading-none mb-1">{String(value)}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  )
}
