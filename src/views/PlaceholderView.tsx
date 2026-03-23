import { Card, CardContent } from '@/components/ui/card'

export function PlaceholderView({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <Card className="max-w-[480px]">
          <CardContent className="text-center px-5 py-10">
            <div className="text-[32px] mb-[10px]">🚧</div>
            <div className="mb-[6px]">{title}</div>
            <div className="text-sm text-muted-foreground">This screen is coming next.</div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
