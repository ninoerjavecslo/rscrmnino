import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSettingsStore } from '../stores/settings'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface InternalProject {
  id: string
  pn: string
  name: string
  status: string
  created_at: string
  deliverables: Array<{ estimated_hours: number | null; status: string; team: string | null }>
}

export function InternalView() {
  const settingsStore = useSettingsStore()
  const [projects, setProjects] = useState<InternalProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    settingsStore.fetch()
    supabase
      .from('projects')
      .select('id, pn, name, status, created_at, deliverables:project_deliverables(estimated_hours, status, team)')
      .eq('type', 'internal')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setProjects((data ?? []) as InternalProject[])
        setLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rate = settingsStore.internalHourlyRate

  const stats = useMemo(() => {
    const activeCount = projects.filter(p => p.status === 'active').length
    let totalHours = 0
    projects.forEach(p => {
      p.deliverables
        .filter(d => d.status !== 'completed')
        .forEach(d => { totalHours += d.estimated_hours ?? 0 })
    })
    return { activeCount, totalHours, cost: totalHours * rate }
  }, [projects, rate])

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Internal Projects</h1>
          <p>Non-billable internal work and initiatives.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="px-6 py-5">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px] mb-2">Active Projects</div>
              <div className="text-[32px] font-extrabold text-foreground font-[Manrope,sans-serif] leading-none">
                {stats.activeCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-6 py-5">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px] mb-2">Estimated Hours</div>
              <div className="text-[32px] font-extrabold text-foreground font-[Manrope,sans-serif] leading-none">
                {stats.totalHours.toLocaleString()}
                <span className="text-base font-medium text-muted-foreground ml-1.5">h</span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">Active deliverables only</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="px-6 py-5">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px] mb-2">Internal Cost</div>
              <div className="text-[32px] font-extrabold text-foreground font-[Manrope,sans-serif] leading-none">
                {rate === 0
                  ? <span className="text-base text-muted-foreground">Set rate in Settings</span>
                  : stats.cost > 0 ? `${stats.cost.toLocaleString()} €` : '—'}
              </div>
              {rate > 0 && <div className="text-xs text-muted-foreground mt-2">@ {rate} €/h</div>}
            </CardContent>
          </Card>
        </div>

        {/* Project list */}
        <Card>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading…</div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No internal projects yet. Create one from Projects → New Project → Internal.</div>
          ) : (
            <table style={{ width: '100%' }}>
              <thead>
                <tr className="bg-[var(--c7)]">
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px]">#</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px]">Project</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px]">Status</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px]">Est. Hours</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px]">Cost</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-bold text-muted-foreground uppercase tracking-[0.5px]">Teams</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => {
                  const activeDelivs = p.deliverables.filter(d => d.status !== 'completed')
                  const hours = activeDelivs.reduce((s, d) => s + (d.estimated_hours ?? 0), 0)
                  const cost = hours * rate
                  const teams = [...new Set(activeDelivs.flatMap(d => d.team ? d.team.split(',').map(t => t.trim()) : []))].filter(Boolean)
                  return (
                    <tr key={p.id} className="border-t border-[var(--c6)] hover:bg-[var(--c7)] transition-colors">
                      <td className="px-4 py-3 text-[12px] text-muted-foreground font-mono">{p.pn}</td>
                      <td className="px-4 py-3">
                        <Link to={`/projects/${p.id}`} className="font-semibold text-[14px] text-foreground no-underline hover:underline">{p.name}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={p.status === 'active' ? 'green' : p.status === 'paused' ? 'amber' : 'gray'}>{p.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right text-[14px] font-semibold">{hours > 0 ? `${hours}h` : '—'}</td>
                      <td className="px-4 py-3 text-right text-[14px] font-semibold">{cost > 0 ? `${cost.toLocaleString()} €` : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {teams.map(t => <Badge key={t} variant="secondary">{t}</Badge>)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  )
}
