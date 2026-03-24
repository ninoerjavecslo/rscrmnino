// src/views/maintenance/UsageTab.tsx
import { useEffect, useState } from 'react'
import { useJiraStore } from '../../stores/jira'
import { useSettingsStore } from '../../stores/settings'
import type { Maintenance } from '../../lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { toast } from '../../lib/toast'

interface Props {
  maintenance: Maintenance
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function UsageBar({ used, included, label }: { used: number; included: number; label: string }) {
  const pct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0
  const color = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-[var(--navy)]'
  return (
    <div className="bg-white rounded-[10px] border border-border p-4">
      <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-2">{label}</div>
      <div className="flex items-end gap-1 mb-2">
        <span className={`text-[28px] font-extrabold tracking-[-0.5px] ${pct >= 100 ? 'text-red-600' : pct >= 80 ? 'text-amber-600' : 'text-foreground'}`}>
          {used}
        </span>
        <span className="text-sm text-muted-foreground mb-1">/ {included} included</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {pct >= 80 && (
        <div className={`text-xs mt-1.5 font-medium ${pct >= 100 ? 'text-red-600' : 'text-amber-600'}`}>
          {pct >= 100 ? 'Over limit' : `${pct}% used`}
        </div>
      )}
    </div>
  )
}

export function UsageTab({ maintenance }: Props) {
  const jiraStore = useJiraStore()
  const settings = useSettingsStore()
  const [month, setMonth] = useState(currentMonth())
  const [editingHours, setEditingHours] = useState(false)
  const [manualHoursInput, setManualHoursInput] = useState('')
  const [savingHours, setSavingHours] = useState(false)

  const cacheKey = `${maintenance.id}:${month}`
  const summary = jiraStore.cache[cacheKey]
  const loading = jiraStore.loading[cacheKey]
  const error   = jiraStore.error[cacheKey]

  const BUG_TYPE = 'Bug'
  const CR_TYPE  = 'Story'

  useEffect(() => {
    if (!maintenance.jira_project_key) return
    if (!jiraStore.cache[cacheKey]) {
      jiraStore.fetchUsage(maintenance.id, maintenance.jira_project_key, month, BUG_TYPE, CR_TYPE)
    }
  }, [month, maintenance.jira_project_key]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSaveManualHours() {
    const h = parseFloat(manualHoursInput)
    if (isNaN(h) || h < 0) return
    setSavingHours(true)
    try {
      await jiraStore.saveManualHours(maintenance.id, month, h)
      if (maintenance.jira_project_key) {
        await jiraStore.fetchUsage(maintenance.id, maintenance.jira_project_key, month, BUG_TYPE, CR_TYPE)
      }
      setEditingHours(false)
      toast('success', 'Hours updated')
    } catch {
      toast('error', 'Failed to save hours')
    } finally {
      setSavingHours(false)
    }
  }

  if (!maintenance.jira_project_key) {
    return (
      <div className="flex-1 p-6">
        <div className="rounded-lg border border-border bg-white p-8 text-center text-muted-foreground text-[13px]">
          No Jira project key configured for this maintenance contract.
          <br />
          <span className="text-xs">Edit the contract and add the Jira Project Key.</span>
        </div>
      </div>
    )
  }

  const hoursUsed = summary?.hoursManualOverride ?? summary?.hoursUsed ?? 0

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Month picker + refresh */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <label className="text-xs text-muted-foreground font-medium">Month</label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="text-sm"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (maintenance.jira_project_key) {
              jiraStore.fetchUsage(maintenance.id, maintenance.jira_project_key, month, BUG_TYPE, CR_TYPE)
            }
          }}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c] mb-4">
          Jira error: {error}
        </div>
      )}

      {/* Usage cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <UsageBar used={summary?.bugsUsed ?? 0} included={maintenance.help_requests_included} label="Bugs this month" />
        <UsageBar used={summary?.crsUsed ?? 0} included={maintenance.help_requests_included} label="Change requests" />
        <div className="bg-white rounded-[10px] border border-border p-4">
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-2">Hours this month</div>
          <div className="flex items-end gap-1 mb-2">
            <span className="text-[28px] font-extrabold tracking-[-0.5px]">{hoursUsed}h</span>
            <span className="text-sm text-muted-foreground mb-1">/ {maintenance.hours_included}h included</span>
          </div>
          {summary?.hoursManualOverride != null && (
            <div className="text-xs text-muted-foreground mb-1">Manual override (Tempo: {summary.hoursUsed}h)</div>
          )}
          {!editingHours ? (
            <button
              onClick={() => { setManualHoursInput(String(hoursUsed)); setEditingHours(true) }}
              className="text-xs text-primary underline cursor-pointer bg-transparent border-none p-0"
            >
              Override hours
            </button>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                step="0.5"
                value={manualHoursInput}
                onChange={e => setManualHoursInput(e.target.value)}
                className="w-20 text-sm"
              />
              <Button size="xs" onClick={handleSaveManualHours} disabled={savingHours}>Save</Button>
              <Button variant="ghost" size="xs" onClick={() => setEditingHours(false)}>Cancel</Button>
            </div>
          )}
        </div>
      </div>

      {/* Issue list */}
      <div className="flex items-center justify-between mb-2.5">
        <h2>Issues — {month}</h2>
      </div>
      <Card>
        {loading ? (
          <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">Loading Jira data…</div>
        ) : !summary || summary.issues.length === 0 ? (
          <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">No issues found for this month.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>KEY</th>
                <th>TITLE</th>
                <th>TYPE</th>
                <th>STATUS</th>
                <th className="text-right">HOURS</th>
                <th>ASSIGNEE</th>
              </tr>
            </thead>
            <tbody>
              {summary.issues.map((issue) => (
                <tr key={issue.key}>
                  <td>
                    <a
                      href={`${settings.jiraBaseUrl}/browse/${issue.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary font-mono text-xs hover:underline"
                    >
                      {issue.key}
                    </a>
                  </td>
                  <td className="text-[13px]">{issue.summary}</td>
                  <td>
                    <Badge variant={issue.issueType === 'Bug' ? 'red' : 'blue'}>
                      {issue.issueType}
                    </Badge>
                  </td>
                  <td>
                    <Badge variant="gray">{issue.status}</Badge>
                  </td>
                  <td className="text-right text-[13px]">
                    {issue.hoursLogged > 0 ? `${issue.hoursLogged}h` : '—'}
                  </td>
                  <td className="text-[13px] text-muted-foreground">{issue.assignee ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
