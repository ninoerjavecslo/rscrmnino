// supabase/functions/jira-proxy/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface JiraProxyRequest {
  action: 'ping' | 'get-issues' | 'get-tempo-hours'
  projectKey?: string
  month?: string   // YYYY-MM
  issueTypes?: string[]  // e.g. ['Bug', 'Story']
}

Deno.serve(async (req) => {
  // CORS for browser calls
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  // Verify authenticated user
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Load Jira credentials from app_settings
  const { data: settingsRows } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['jira_base_url', 'jira_user_email', 'jira_api_token'])

  const settings = Object.fromEntries(
    (settingsRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
  )

  const baseUrl = settings['jira_base_url']
  const email   = settings['jira_user_email']
  const token   = settings['jira_api_token']

  if (!baseUrl || !email || !token) {
    return new Response(JSON.stringify({ error: 'Jira credentials not configured' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const authBasic = btoa(`${email}:${token}`)
  const jiraHeaders = {
    'Authorization': `Basic ${authBasic}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }

  const body: JiraProxyRequest = await req.json()

  // ── Ping ────────────────────────────────────────────────────────────────────
  if (body.action === 'ping') {
    const res = await fetch(`${baseUrl}/rest/api/3/myself`, { headers: jiraHeaders })
    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'Jira auth failed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    const user = await res.json()
    return new Response(JSON.stringify({ ok: true, displayName: user.displayName }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // ── Get issues ──────────────────────────────────────────────────────────────
  if (body.action === 'get-issues') {
    const { projectKey, month, issueTypes } = body
    if (!projectKey || !month) {
      return new Response(JSON.stringify({ error: 'projectKey and month required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Build JQL: issues created in this month for this project
    const [year, mon] = month.split('-').map(Number)
    const startDate = `${year}-${String(mon).padStart(2, '0')}-01`
    const endDate = new Date(year, mon, 1).toISOString().split('T')[0]  // first day of next month

    let jql = `project = "${projectKey}" AND created >= "${startDate}" AND created < "${endDate}"`
    if (issueTypes && issueTypes.length > 0) {
      const types = issueTypes.map(t => `"${t}"`).join(', ')
      jql += ` AND issuetype in (${types})`
    }
    jql += ' ORDER BY created DESC'

    const searchUrl = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&fields=summary,status,issuetype,assignee&maxResults=100`
    const searchRes = await fetch(searchUrl, { headers: jiraHeaders })

    if (!searchRes.ok) {
      const text = await searchRes.text()
      return new Response(JSON.stringify({ error: `Jira search failed: ${text}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const searchData = await searchRes.json()
    const issues = (searchData.issues ?? []).map((issue: Record<string, unknown>) => {
      const fields = issue.fields as Record<string, unknown>
      const statusObj = fields.status as Record<string, unknown>
      const issueTypeObj = fields.issuetype as Record<string, unknown>
      const assigneeObj = fields.assignee as Record<string, unknown> | null
      return {
        key: issue.key,
        summary: fields.summary,
        status: (statusObj?.name as string) ?? 'Unknown',
        issueType: (issueTypeObj?.name as string) ?? 'Unknown',
        assignee: (assigneeObj?.displayName as string) ?? null,
        hoursLogged: 0,  // filled by get-tempo-hours or left 0
        created: fields.created ?? '',
      }
    })

    return new Response(JSON.stringify({ issues }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // ── Get Tempo hours ─────────────────────────────────────────────────────────
  if (body.action === 'get-tempo-hours') {
    const { projectKey, month } = body
    if (!projectKey || !month) {
      return new Response(JSON.stringify({ error: 'projectKey and month required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const [year, mon] = month.split('-').map(Number)
    const from = `${year}-${String(mon).padStart(2, '0')}-01`
    const to   = new Date(year, mon, 0).toISOString().split('T')[0]  // last day of month

    // Tempo Timesheets API v4 (gracefully returns 0 if unavailable)
    const tempoUrl = `${baseUrl}/rest/tempo-timesheets/4/worklogs?projectKey=${projectKey}&dateFrom=${from}&dateTo=${to}&limit=1000`
    const tempoRes = await fetch(tempoUrl, { headers: jiraHeaders })

    if (!tempoRes.ok) {
      // Tempo not available — return 0 gracefully
      return new Response(JSON.stringify({ totalHours: 0, available: false }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const tempoData = await tempoRes.json()
    const worklogs = (tempoData.results ?? tempoData ?? []) as Array<Record<string, unknown>>
    const totalSeconds = worklogs.reduce((s: number, w: Record<string, unknown>) => s + (Number(w.timeSpentSeconds) || 0), 0)
    const totalHours = Math.round((totalSeconds / 3600) * 100) / 100

    return new Response(JSON.stringify({ totalHours, available: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
})
