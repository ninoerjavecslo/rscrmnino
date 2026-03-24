// src/views/maintenance/ReportsTab.tsx
import { useState } from 'react'
import { useJiraStore } from '../../stores/jira'
import { useSettingsStore } from '../../stores/settings'
import type { Maintenance } from '../../lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from '../../lib/toast'

interface Props {
  maintenance: Maintenance
}

function prevMonth() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })
}

export function ReportsTab({ maintenance }: Props) {
  const jiraStore = useJiraStore()
  const settings = useSettingsStore()
  const [month, setMonth] = useState(prevMonth())
  const [includeBugs, setIncludeBugs] = useState(true)
  const [includeCRs, setIncludeCRs] = useState(true)
  const [includeHours, setIncludeHours] = useState(true)
  const [generating, setGenerating] = useState(false)

  const BUG_TYPE = 'Bug'
  const CR_TYPE  = 'Story'

  async function handleGenerate() {
    if (!maintenance.jira_project_key) {
      toast('error', 'No Jira project key on this maintenance contract')
      return
    }
    setGenerating(true)
    try {
      const cacheKey = `${maintenance.id}:${month}`
      if (!jiraStore.cache[cacheKey]) {
        await jiraStore.fetchUsage(maintenance.id, maintenance.jira_project_key, month, BUG_TYPE, CR_TYPE)
      }
      const summary = jiraStore.cache[cacheKey]
      if (!summary) throw new Error('No data returned from Jira')

      const hoursUsed = summary.hoursManualOverride ?? summary.hoursUsed
      const bugs  = summary.issues.filter(i => i.issueType === BUG_TYPE)
      const crs   = summary.issues.filter(i => i.issueType === CR_TYPE)
      const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

      const issueRow = (i: typeof summary.issues[0]) =>
        `<tr>
          <td style="font-family:monospace;font-size:12px;padding:6px 12px;border-bottom:1px solid #f0edf3;white-space:nowrap">${i.key}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0edf3;font-size:13px">${i.summary}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0edf3;font-size:13px">${i.status}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0edf3;font-size:13px;text-align:right">${i.hoursLogged > 0 ? i.hoursLogged + 'h' : '—'}</td>
        </tr>`

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Maintenance Report — ${maintenance.name} — ${fmtMonth(month)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e1b2e; margin: 0; padding: 40px; max-width: 800px; }
    h1 { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
    .subtitle { color: #64748b; font-size: 13px; margin: 0 0 32px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
    .kpi { background: #f9f7fb; border: 1px solid #e8e3ea; border-radius: 10px; padding: 16px 20px; }
    .kpi-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .09em; color: #64748b; margin-bottom: 6px; }
    .kpi-value { font-size: 28px; font-weight: 800; letter-spacing: -.5px; }
    .kpi-sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin: 24px 0 10px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .09em; color: #94a3b8; padding: 6px 12px; text-align: left; border-bottom: 2px solid #e8e3ea; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e8e3ea; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <h1>${maintenance.name}</h1>
  <div class="subtitle">${maintenance.client?.name ?? ''} · ${fmtMonth(month)}</div>

  <div class="kpi-grid">
    ${includeHours ? `
    <div class="kpi">
      <div class="kpi-label">Hours Used</div>
      <div class="kpi-value">${hoursUsed}h</div>
      <div class="kpi-sub">of ${maintenance.hours_included}h included</div>
    </div>` : ''}
    ${includeBugs ? `
    <div class="kpi">
      <div class="kpi-label">Bugs Reported</div>
      <div class="kpi-value">${bugs.length}</div>
      <div class="kpi-sub">of ${maintenance.help_requests_included} included</div>
    </div>` : ''}
    ${includeCRs ? `
    <div class="kpi">
      <div class="kpi-label">Change Requests</div>
      <div class="kpi-value">${crs.length}</div>
      <div class="kpi-sub">of ${maintenance.help_requests_included} included</div>
    </div>` : ''}
  </div>

  ${includeBugs && bugs.length > 0 ? `
  <h2>Bug Reports</h2>
  <table>
    <thead><tr><th>Key</th><th>Summary</th><th>Status</th><th style="text-align:right">Hours</th></tr></thead>
    <tbody>${bugs.map(issueRow).join('')}</tbody>
  </table>` : ''}

  ${includeCRs && crs.length > 0 ? `
  <h2>Change Requests</h2>
  <table>
    <thead><tr><th>Key</th><th>Summary</th><th>Status</th><th style="text-align:right">Hours</th></tr></thead>
    <tbody>${crs.map(issueRow).join('')}</tbody>
  </table>` : ''}

  <div class="footer">
    <span>${settings.agencyName || 'Agency'}</span>
    <span>Generated ${today}</span>
  </div>
</body>
</html>`

      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `maintenance-report-${maintenance.name.replace(/\s+/g, '-').toLowerCase()}-${month}.html`
      a.click()
      URL.revokeObjectURL(url)
      toast('success', 'Report downloaded')
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="grid grid-cols-[340px_1fr] gap-6 items-start">
        {/* Config panel */}
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-[13px] mb-4">Configuration</h3>

            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Month</label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} />
            </div>

            <div className="mb-5">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-2">Include sections</label>
              <div className="space-y-2">
                {[
                  { key: 'bugs', label: 'Bug reports list', val: includeBugs, set: setIncludeBugs },
                  { key: 'crs',  label: 'Change requests list', val: includeCRs, set: setIncludeCRs },
                  { key: 'hrs',  label: 'Hours breakdown', val: includeHours, set: setIncludeHours },
                ].map(opt => (
                  <label key={opt.key} className="flex items-center gap-2.5 cursor-pointer text-[13px]">
                    <input
                      type="checkbox"
                      checked={opt.val}
                      onChange={e => opt.set(e.target.checked)}
                      className="w-4 h-4"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              {generating ? 'Generating…' : 'Download Report'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">Downloads as HTML — open in browser and Print → Save as PDF</p>
          </CardContent>
        </Card>

        {/* Preview panel */}
        <Card>
          <CardContent className="p-6">
            <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-4">Preview</div>
            <div className="font-extrabold text-[18px] mb-0.5">{maintenance.name}</div>
            <div className="text-muted-foreground text-[13px] mb-5">{maintenance.client?.name} · {fmtMonth(month)}</div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              {includeHours && (
                <div className="bg-[#f9f7fb] border border-border rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.06em] mb-1">Hours Used</div>
                  <div className="text-[22px] font-extrabold">—h</div>
                  <div className="text-xs text-muted-foreground">of {maintenance.hours_included}h</div>
                </div>
              )}
              {includeBugs && (
                <div className="bg-[#f9f7fb] border border-border rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.06em] mb-1">Bugs</div>
                  <div className="text-[22px] font-extrabold">—</div>
                  <div className="text-xs text-muted-foreground">of {maintenance.help_requests_included}</div>
                </div>
              )}
              {includeCRs && (
                <div className="bg-[#f9f7fb] border border-border rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.06em] mb-1">CRs</div>
                  <div className="text-[22px] font-extrabold">—</div>
                  <div className="text-xs text-muted-foreground">of {maintenance.help_requests_included}</div>
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground">Task breakdown will appear in the downloaded report.</div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
