# Maintenance Jira Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Jira integration to maintenance contracts — a Usage tab showing live bug/CR/hours usage vs. contract limits, a Reports tab to generate downloadable client reports, and an email intake system that creates Jira tasks from forwarded client emails.

**Architecture:** Jira API calls are proxied through a Supabase Edge Function (`jira-proxy`) so credentials never reach the browser. Hours can come from Tempo (via Jira API) with manual overrides stored in a new `maintenance_hours_log` table. Email intake uses a second Edge Function (`email-intake`) triggered by an inbound email webhook, matching sender domain or keyword to the correct Jira project.

**Tech Stack:** React 19, TypeScript strict, Zustand v5, Supabase Edge Functions (Deno), Jira REST API v3, Tailwind CSS v4, shadcn/ui

> **Note on Tempo:** Tempo Cloud uses a separate API base URL (`https://api.tempo.io/4`) and a separate Tempo API token — it is NOT accessible via the Jira Basic Auth token. The `jira-proxy` Edge Function attempts the Tempo endpoint but gracefully returns `{ totalHours: 0, available: false }` if it fails. Tempo support can be extended later by adding a `tempo_api_token` setting and using the correct base URL.

---

## Chunk 1: Database migrations + types

### Task 1: Migration — add `jira_project_key` to maintenances

**Files:**
- Create: `supabase/migrations/010_jira_integration.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/010_jira_integration.sql

-- Add Jira project key to maintenance contracts
alter table maintenances
  add column if not exists jira_project_key text;

-- Hours log: manual + Tempo overrides per maintenance per month
create table if not exists maintenance_hours_log (
  id              uuid primary key default uuid_generate_v4(),
  maintenance_id  uuid not null references maintenances(id) on delete cascade,
  month           date not null,           -- first day of month: 2026-03-01
  hours_used      numeric(6,2) not null default 0,
  source          text not null default 'manual' check (source in ('tempo','manual')),
  notes           text,
  created_at      timestamptz not null default now(),
  unique (maintenance_id, month)
);

-- Email intake rules: map sender domain or keyword → maintenance
create table if not exists email_intake_rules (
  id                  uuid primary key default uuid_generate_v4(),
  maintenance_id      uuid not null references maintenances(id) on delete cascade,
  sender_domain       text,                -- e.g. pirnar.si  (checked first)
  keyword             text,                -- fallback match in subject/body
  default_issue_type  text not null default 'Bug',
  created_at          timestamptz not null default now()
);

-- RLS: same pattern as other tables (authenticated users full access)
alter table maintenance_hours_log enable row level security;
create policy "auth_all" on maintenance_hours_log
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table email_intake_rules enable row level security;
create policy "auth_all" on email_intake_rules
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
```

- [ ] **Step 2: Apply migration via Supabase dashboard or CLI**

```bash
# If using Supabase CLI:
supabase db push
# Or paste into Supabase Dashboard → SQL Editor and run
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/010_jira_integration.sql
git commit -m "feat: add jira integration migrations"
```

---

### Task 2: Update TypeScript types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add new interfaces at end of types.ts**

Add after the last interface in `src/lib/types.ts`:

```typescript
export interface MaintenanceHoursLog {
  id: string
  maintenance_id: string
  month: string           // YYYY-MM-DD
  hours_used: number
  source: 'tempo' | 'manual'
  notes?: string | null
  created_at: string
}

export interface EmailIntakeRule {
  id: string
  maintenance_id: string
  sender_domain?: string | null
  keyword?: string | null
  default_issue_type: string
  created_at: string
  // Joined
  maintenance?: Pick<Maintenance, 'id' | 'name'> | null
}

export interface JiraIssue {
  key: string               // e.g. ACME-42
  summary: string
  status: string            // e.g. "In Progress", "Done"
  issueType: string         // e.g. "Bug", "Story"
  assignee?: string | null
  hoursLogged: number       // from Tempo worklogs, 0 if unavailable
  created: string           // ISO date string
}

export interface JiraUsageSummary {
  bugsUsed: number
  crsUsed: number
  hoursUsed: number         // from Tempo (may be 0 if Tempo not configured)
  hoursManualOverride?: number | null
  issues: JiraIssue[]
}
```

- [ ] **Step 2: Add `jira_project_key` to `Maintenance` interface**

In `src/lib/types.ts`, find the `Maintenance` interface and add:
```typescript
  jira_project_key?: string | null
```
after the `cms` field.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add Jira types to shared types"
```

---

## Chunk 2: Settings store + Jira settings UI

### Task 3: Extend settings store with Jira credentials

**Files:**
- Modify: `src/stores/settings.ts`

The settings store uses `app_settings` key-value table. We add Jira credentials following the exact same pattern.

- [ ] **Step 1: Add Jira fields to `SettingsState` interface**

In `src/stores/settings.ts`, add to the `SettingsState` interface:
```typescript
  jiraBaseUrl: string
  jiraUserEmail: string
  jiraApiToken: string
  setJiraBaseUrl: (url: string) => Promise<void>
  setJiraUserEmail: (email: string) => Promise<void>
  setJiraApiToken: (token: string) => Promise<void>
```

- [ ] **Step 2: Add initial values in `create<SettingsState>`**

Add to the initial state object:
```typescript
  jiraBaseUrl: '',
  jiraUserEmail: '',
  jiraApiToken: '',
```

- [ ] **Step 3: Load values in `fetch` action**

Read `src/stores/settings.ts` first. Find the single `set({...})` call inside `fetch` that sets `agencyName`, `agencyLogo`, etc. ADD the new fields to that existing `set({...})` call — do NOT replace it or create a second `set(...)` call, as that would drop the existing fields:
```typescript
set({
  agencyName: map['agency_name'] ?? '',
  agencyLogo: map['agency_logo'] ?? '',
  projectManagers: pms,
  internalHourlyRate: parseFloat(map['internal_hourly_rate'] ?? '0') || 0,
  cmsOptions: cms,
  // ADD these three:
  jiraBaseUrl: map['jira_base_url'] ?? '',
  jiraUserEmail: map['jira_user_email'] ?? '',
  jiraApiToken: map['jira_api_token'] ?? '',
})
```

- [ ] **Step 4: Add setter actions**

```typescript
setJiraBaseUrl: async (url: string) => {
  await supabase.from('app_settings').upsert({ key: 'jira_base_url', value: url })
  set({ jiraBaseUrl: url })
},
setJiraUserEmail: async (email: string) => {
  await supabase.from('app_settings').upsert({ key: 'jira_user_email', value: email })
  set({ jiraUserEmail: email })
},
setJiraApiToken: async (token: string) => {
  await supabase.from('app_settings').upsert({ key: 'jira_api_token', value: token })
  set({ jiraApiToken: token })
},
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/stores/settings.ts
git commit -m "feat: add Jira credentials to settings store"
```

---

### Task 4: Add Jira Integration section to SettingsView

**Files:**
- Modify: `src/views/SettingsView.tsx`

- [ ] **Step 1: Read the current SettingsView to understand structure**

Read `src/views/SettingsView.tsx` before editing to follow the existing section/card pattern.

- [ ] **Step 2: Add Jira Integration section**

Read `src/views/SettingsView.tsx` fully before editing. The file uses `settingsStore` (not `settings`) as the store variable name, uses `FUNCTIONS_URL` + `ANON_KEY` constants for Edge Function calls (not the `supabase` client), and already imports `Select`, `Card`, `CardContent`, `Button`, `toast`, and `useState`.

Add local state variables near the top of the `SettingsView` component (after existing state):
```tsx
const [jiraBaseUrlLocal, setJiraBaseUrlLocal] = useState(settingsStore.jiraBaseUrl)
const [jiraUserEmailLocal, setJiraUserEmailLocal] = useState(settingsStore.jiraUserEmail)
const [jiraApiTokenLocal, setJiraApiTokenLocal] = useState(settingsStore.jiraApiToken)
const [testingJira, setTestingJira] = useState(false)
const [jiraTestResult, setJiraTestResult] = useState<'ok' | 'fail' | null>(null)
```

Add a `useEffect` to sync local state when settingsStore loads:
```tsx
useEffect(() => {
  setJiraBaseUrlLocal(settingsStore.jiraBaseUrl)
  setJiraUserEmailLocal(settingsStore.jiraUserEmail)
  setJiraApiTokenLocal(settingsStore.jiraApiToken)
}, [settingsStore.jiraBaseUrl, settingsStore.jiraUserEmail, settingsStore.jiraApiToken])
```

Add handler (uses `fetch` with `FUNCTIONS_URL` consistent with the existing SettingsView pattern):
```tsx
async function handleTestJira() {
  setTestingJira(true)
  setJiraTestResult(null)
  try {
    const res = await fetch(`${FUNCTIONS_URL}/jira-proxy`, {
      method: 'POST',
      headers: fnHeaders(),
      body: JSON.stringify({ action: 'ping' }),
    })
    const data = await res.json()
    setJiraTestResult(data?.error ? 'fail' : 'ok')
  } catch {
    setJiraTestResult('fail')
  } finally {
    setTestingJira(false)
  }
}
```

Add the UI section after the existing settings sections:
```tsx
{/* ── Jira Integration ──────────────────────────────────────── */}
<div className="mb-6">
  <h2 className="mb-3">Jira Integration</h2>
  <Card>
    <CardContent className="p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Jira Base URL</label>
          <input
            value={jiraBaseUrlLocal}
            onChange={e => setJiraBaseUrlLocal(e.target.value)}
            onBlur={e => settingsStore.setJiraBaseUrl(e.target.value)}
            placeholder="https://yourcompany.atlassian.net"
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Jira User Email</label>
          <input
            value={jiraUserEmailLocal}
            onChange={e => setJiraUserEmailLocal(e.target.value)}
            onBlur={e => settingsStore.setJiraUserEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>
      </div>
      <div>
        <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Jira API Token</label>
        <input
          type="password"
          value={jiraApiTokenLocal}
          onChange={e => setJiraApiTokenLocal(e.target.value)}
          onBlur={e => settingsStore.setJiraApiToken(e.target.value)}
          placeholder="••••••••••••••••"
        />
        <p className="text-xs text-muted-foreground mt-1">Generate at id.atlassian.net → Security → API tokens</p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={handleTestJira} disabled={testingJira}>
          {testingJira ? 'Testing…' : 'Test connection'}
        </Button>
        {jiraTestResult === 'ok' && <span className="text-xs text-green-600 font-medium">Connected ✓</span>}
        {jiraTestResult === 'fail' && <span className="text-xs text-red-600 font-medium">Failed — check credentials</span>}
      </div>
    </CardContent>
  </Card>
</div>
```
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/views/SettingsView.tsx
git commit -m "feat: add Jira integration settings UI"
```

---

## Chunk 3: Supabase Edge Function — jira-proxy

### Task 5: Create jira-proxy Edge Function

**Files:**
- Create: `supabase/functions/jira-proxy/index.ts`

This function reads Jira credentials from `app_settings`, calls Jira REST API v3 and Tempo v4, returns structured data. Never exposes credentials to the browser.

- [ ] **Step 1: Create the Edge Function**

```typescript
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

    // Tempo Timesheets API v4
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
```

- [ ] **Step 2: Deploy the function**

```bash
supabase functions deploy jira-proxy
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/jira-proxy/
git commit -m "feat: add jira-proxy Edge Function"
```

---

## Chunk 4: Jira store (client-side)

### Task 6: Create useJiraStore

**Files:**
- Create: `src/stores/jira.ts`

This store caches Jira data per maintenance+month so we don't re-fetch on every render.

- [ ] **Step 1: Create the store**

```typescript
// src/stores/jira.ts
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { JiraIssue, JiraUsageSummary, MaintenanceHoursLog } from '../lib/types'

interface JiraCache {
  [key: string]: JiraUsageSummary  // key = `${maintenanceId}:${month}`
}

interface JiraState {
  cache: JiraCache
  loading: Record<string, boolean>
  error: Record<string, string | null>
  fetchUsage: (maintenanceId: string, jiraProjectKey: string, month: string, bugType: string, crType: string) => Promise<void>
  saveManualHours: (maintenanceId: string, month: string, hours: number, notes?: string) => Promise<void>
  loadManualHours: (maintenanceId: string) => Promise<MaintenanceHoursLog[]>
}

export const useJiraStore = create<JiraState>((set, get) => ({
  cache: {},
  loading: {},
  error: {},

  fetchUsage: async (maintenanceId, jiraProjectKey, month, bugType, crType) => {
    const cacheKey = `${maintenanceId}:${month}`
    set(s => ({ loading: { ...s.loading, [cacheKey]: true }, error: { ...s.error, [cacheKey]: null } }))

    try {
      // Fetch bugs + CRs in parallel
      const [bugsRes, crsRes, tempoRes] = await Promise.all([
        supabase.functions.invoke('jira-proxy', {
          body: { action: 'get-issues', projectKey: jiraProjectKey, month, issueTypes: [bugType] }
        }),
        supabase.functions.invoke('jira-proxy', {
          body: { action: 'get-issues', projectKey: jiraProjectKey, month, issueTypes: [crType] }
        }),
        supabase.functions.invoke('jira-proxy', {
          body: { action: 'get-tempo-hours', projectKey: jiraProjectKey, month }
        }),
      ])

      const bugs: JiraIssue[] = (bugsRes.data?.issues ?? [])
      const crs: JiraIssue[]  = (crsRes.data?.issues ?? [])
      const tempoHours: number = tempoRes.data?.totalHours ?? 0

      // Check for manual hours override
      const { data: manualLog } = await supabase
        .from('maintenance_hours_log')
        .select('*')
        .eq('maintenance_id', maintenanceId)
        .eq('month', month + '-01')
        .eq('source', 'manual')
        .maybeSingle()

      const summary: JiraUsageSummary = {
        bugsUsed: bugs.length,
        crsUsed: crs.length,
        hoursUsed: tempoHours,
        hoursManualOverride: manualLog?.hours_used ?? null,
        issues: [...bugs, ...crs],
      }

      set(s => ({ cache: { ...s.cache, [cacheKey]: summary } }))
    } catch (e) {
      set(s => ({ error: { ...s.error, [cacheKey]: (e as Error).message } }))
    } finally {
      set(s => ({ loading: { ...s.loading, [cacheKey]: false } }))
    }
  },

  saveManualHours: async (maintenanceId, month, hours, notes) => {
    await supabase.from('maintenance_hours_log').upsert({
      maintenance_id: maintenanceId,
      month: month + '-01',
      hours_used: hours,
      source: 'manual',
      notes: notes ?? null,
    })
    // Invalidate cache for this month so it reloads
    const cacheKey = `${maintenanceId}:${month}`
    set(s => {
      const newCache = { ...s.cache }
      delete newCache[cacheKey]
      return { cache: newCache }
    })
  },

  loadManualHours: async (maintenanceId) => {
    const { data } = await supabase
      .from('maintenance_hours_log')
      .select('*')
      .eq('maintenance_id', maintenanceId)
      .order('month', { ascending: false })
    return (data ?? []) as MaintenanceHoursLog[]
  },
}))
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/stores/jira.ts
git commit -m "feat: add Jira Zustand store"
```

---

## Chunk 5: MaintenanceDetailView — tabs + Usage tab

### Task 7: Add tab navigation to MaintenanceDetailView

**Files:**
- Modify: `src/views/MaintenanceDetailView.tsx`

The view currently has no tabs. We add 4 tabs: Overview, Invoice Planning, Usage, Reports. Existing content moves into Overview and Invoice Planning.

- [ ] **Step 1: Read the full current MaintenanceDetailView**

Read the full file at `src/views/MaintenanceDetailView.tsx` to understand all existing sections before modifying.

- [ ] **Step 2: Add tab state**

Add near the top of the component (after existing state declarations):
```tsx
const [activeTab, setActiveTab] = useState<'overview' | 'invoice-planning' | 'usage' | 'reports'>('overview')
```

- [ ] **Step 3: Add tab bar JSX**

Add this tab bar immediately after the page header `<div>` (before the main content):
```tsx
{/* Tab bar */}
<div className="flex border-b border-border px-6 bg-white">
  {(['overview', 'invoice-planning', 'usage', 'reports'] as const).map(tab => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-colors ${
        activeTab === tab
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {tab === 'overview' ? 'Overview'
        : tab === 'invoice-planning' ? 'Invoice Planning'
        : tab === 'usage' ? 'Usage'
        : 'Reports'}
    </button>
  ))}
</div>
```

- [ ] **Step 4: Wrap existing content in tab conditionals**

Wrap the existing Overview content in `{activeTab === 'overview' && (...)}` and Invoice Planning content in `{activeTab === 'invoice-planning' && (...)}`.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/views/MaintenanceDetailView.tsx
git commit -m "feat: add tab navigation to MaintenanceDetailView"
```

---

### Task 8: Add jira_project_key field to edit form in MaintenanceDetailView

**Files:**
- Modify: `src/views/MaintenanceDetailView.tsx`

- [ ] **Step 1: Add `jira_project_key` to `EditForm` interface**

```typescript
interface EditForm {
  // ... existing fields ...
  jira_project_key: string
}
```

- [ ] **Step 2: Initialize in `openEdit`**

```typescript
jira_project_key: maint.jira_project_key ?? '',
```

- [ ] **Step 3: Add input field in the edit modal**

Add a new field in the edit modal (e.g. next to CMS):
```tsx
<div className="mb-4">
  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">
    Jira Project Key <span className="text-xs text-muted-foreground ml-1">optional</span>
  </label>
  <input
    value={editForm.jira_project_key}
    onChange={e => setEditForm(f => f ? { ...f, jira_project_key: e.target.value.toUpperCase() } : f)}
    placeholder="e.g. ACME"
  />
</div>
```

- [ ] **Step 4: Include in save payload**

In `handleSaveEdit`, add to the payload:
```typescript
jira_project_key: editForm.jira_project_key.trim() || null,
```

- [ ] **Step 5: Verify `useMaintenancesStore` passes `jira_project_key` through**

Read `src/stores/maintenances.ts` and find the `update` method. It should accept a `Partial<Omit<Maintenance, 'id' | 'created_at' | ...>>` and pass it directly to Supabase `.update(payload)`. Since `jira_project_key` is now part of the `Maintenance` type (added in Task 2), it will be included automatically in the partial payload — no code change needed. Confirm this is the case; if the store uses an explicit allow-list of columns, add `jira_project_key` to that list.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/views/MaintenanceDetailView.tsx
git commit -m "feat: add Jira project key to maintenance edit form"
```

---

### Task 9: Create UsageTab component

**Files:**
- Create: `src/views/maintenance/UsageTab.tsx`

- [ ] **Step 1: Create the directory and component**

```bash
mkdir -p src/views/maintenance
```

```tsx
// src/views/maintenance/UsageTab.tsx
import { useEffect, useState } from 'react'
import { useJiraStore } from '../../stores/jira'
import { useSettingsStore } from '../../stores/settings'
import type { Maintenance } from '../../lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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

  // Issue type names — could be made configurable later
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
      // Re-fetch to update cache
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
              {summary.issues.map(issue => (
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
```

- [ ] **Step 2: Wire UsageTab into MaintenanceDetailView**

In `src/views/MaintenanceDetailView.tsx`, import and render:
```tsx
import { UsageTab } from './maintenance/UsageTab'
// ...
{activeTab === 'usage' && maint && <UsageTab maintenance={maint} />}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/views/maintenance/UsageTab.tsx src/views/MaintenanceDetailView.tsx
git commit -m "feat: add Usage tab with Jira issue/hours dashboard"
```

---

## Chunk 6: Reports tab

### Task 10: Create ReportsTab component

**Files:**
- Create: `src/views/maintenance/ReportsTab.tsx`

- [ ] **Step 1: Create the component**

```tsx
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

      const issueRow = (i: (typeof summary.issues)[0]) =>
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
```

- [ ] **Step 2: Wire ReportsTab into MaintenanceDetailView**

```tsx
import { ReportsTab } from './maintenance/ReportsTab'
// ...
{activeTab === 'reports' && maint && <ReportsTab maintenance={maint} />}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/views/maintenance/ReportsTab.tsx src/views/MaintenanceDetailView.tsx
git commit -m "feat: add Reports tab with downloadable HTML report"
```

---

## Chunk 7: Email intake

### Task 11: Email intake Edge Function

**Files:**
- Create: `supabase/functions/email-intake/index.ts`

This function is called by an inbound email webhook (Postmark/Resend). It parses the request, matches sender domain or keyword to an `email_intake_rules` record, creates a Jira issue, and returns a confirmation.

- [ ] **Step 1: Create the function**

```typescript
// supabase/functions/email-intake/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const INTAKE_SECRET = Deno.env.get('EMAIL_INTAKE_SECRET') ?? ''

Deno.serve(async (req) => {
  // Optional shared secret for webhook security
  const secret = req.headers.get('x-intake-secret') ?? new URL(req.url).searchParams.get('secret')
  if (INTAKE_SECRET && secret !== INTAKE_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Parse inbound email payload (Postmark/Resend format)
  const body = await req.json()
  const fromFull: string  = body.From ?? body.from ?? ''
  const subject: string   = body.Subject ?? body.subject ?? '(no subject)'
  const textBody: string  = body.TextBody ?? body.text ?? body.plain ?? ''
  const htmlBody: string  = body.HtmlBody ?? body.html ?? ''

  // Extract sender domain
  const emailMatch = fromFull.match(/@([\w.-]+)/)
  const senderDomain = emailMatch ? emailMatch[1].toLowerCase() : ''

  // Load all intake rules
  const { data: rules } = await supabase
    .from('email_intake_rules')
    .select('*, maintenance:maintenances(id, name, jira_project_key, client:clients(name))')

  if (!rules || rules.length === 0) {
    return new Response(JSON.stringify({ error: 'No intake rules configured' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Match: domain first, then keyword in subject+body
  const combined = (subject + ' ' + textBody + ' ' + htmlBody).toLowerCase()
  type Rule = typeof rules[0]
  let matched: Rule | null = null

  // 1. Domain match
  if (senderDomain) {
    matched = rules.find((r: Rule) => r.sender_domain && senderDomain.endsWith(r.sender_domain.toLowerCase())) ?? null
  }
  // 2. Keyword fallback
  if (!matched) {
    matched = rules.find((r: Rule) => r.keyword && combined.includes(r.keyword.toLowerCase())) ?? null
  }

  if (!matched) {
    return new Response(JSON.stringify({ error: `No rule matched for sender: ${fromFull}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const maintenance = matched.maintenance as Record<string, unknown>
  const jiraProjectKey = maintenance.jira_project_key as string | null
  if (!jiraProjectKey) {
    return new Response(JSON.stringify({ error: 'Matched maintenance has no Jira project key' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Load Jira credentials
  const { data: settingsRows } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['jira_base_url', 'jira_user_email', 'jira_api_token'])

  const settings = Object.fromEntries(
    (settingsRows ?? []).map((r: { key: string; value: string }) => [r.key, r.value])
  )

  const jiraBase  = settings['jira_base_url']
  const jiraEmail = settings['jira_user_email']
  const jiraToken = settings['jira_api_token']

  if (!jiraBase || !jiraEmail || !jiraToken) {
    return new Response(JSON.stringify({ error: 'Jira credentials not configured' }), { status: 200 })
  }

  const authBasic = btoa(`${jiraEmail}:${jiraToken}`)

  // Resolve issue type ID for this project
  const metaRes = await fetch(
    `${jiraBase}/rest/api/3/issue/createmeta/${jiraProjectKey}/issuetypes`,
    { headers: { Authorization: `Basic ${authBasic}`, Accept: 'application/json' } }
  )
  const metaData = await metaRes.json()
  const issueTypes = (metaData.issueTypes ?? metaData.values ?? []) as Array<{ id: string; name: string }>
  const issueType = issueTypes.find(t => t.name === matched!.default_issue_type) ?? issueTypes[0]

  if (!issueType) {
    return new Response(JSON.stringify({ error: 'Could not find issue type in Jira project' }), { status: 200 })
  }

  // Create Jira issue
  const createRes = await fetch(`${jiraBase}/rest/api/3/issue`, {
    method: 'POST',
    headers: { Authorization: `Basic ${authBasic}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      fields: {
        project: { key: jiraProjectKey },
        summary: subject,
        description: {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: textBody || htmlBody || '(email body empty)' }]
          }]
        },
        issuetype: { id: issueType.id },
        labels: [(maintenance.client as Record<string, unknown>)?.name as string ?? 'email-intake'],
      }
    })
  })

  if (!createRes.ok) {
    const err = await createRes.text()
    return new Response(JSON.stringify({ error: `Jira create failed: ${err}` }), { status: 200 })
  }

  const created = await createRes.json()
  return new Response(JSON.stringify({ ok: true, issueKey: created.key }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy email-intake
```

Set the secret in Supabase dashboard → Edge Functions → email-intake → Secrets:
- `EMAIL_INTAKE_SECRET` — any random string you choose

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/email-intake/
git commit -m "feat: add email-intake Edge Function"
```

---

### Task 12: Email Intake settings UI

**Files:**
- Modify: `src/views/SettingsView.tsx`

- [ ] **Step 1: Create `useEmailIntakeStore`**

Create `src/stores/emailIntake.ts`:

```typescript
// src/stores/emailIntake.ts
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { EmailIntakeRule } from '../lib/types'

interface EmailIntakeState {
  rules: EmailIntakeRule[]
  loading: boolean
  fetchAll: () => Promise<void>
  add: (rule: Omit<EmailIntakeRule, 'id' | 'created_at' | 'maintenance'>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useEmailIntakeStore = create<EmailIntakeState>((set) => ({
  rules: [],
  loading: false,

  fetchAll: async () => {
    set({ loading: true })
    try {
      const { data } = await supabase
        .from('email_intake_rules')
        .select('*, maintenance:maintenances(id, name)')
        .order('created_at')
      set({ rules: (data ?? []) as EmailIntakeRule[] })
    } finally {
      set({ loading: false })
    }
  },

  add: async (rule) => {
    const { data } = await supabase
      .from('email_intake_rules')
      .insert(rule)
      .select('*, maintenance:maintenances(id, name)')
      .single()
    if (data) {
      set(s => ({ rules: [...s.rules, data as EmailIntakeRule] }))
    }
  },

  remove: async (id) => {
    await supabase.from('email_intake_rules').delete().eq('id', id)
    set(s => ({ rules: s.rules.filter(r => r.id !== id) }))
  },
}))
```

- [ ] **Step 2: Add missing imports to SettingsView**

At the top of `src/views/SettingsView.tsx`, add these imports (the file does NOT currently import these):
```tsx
import { useEmailIntakeStore } from '../stores/emailIntake'
import { useMaintenancesStore } from '../stores/maintenances'
```

- [ ] **Step 3: Add Email Intake section to SettingsView**

Add a new section in `src/views/SettingsView.tsx` after Jira Integration:

```tsx
{/* ── Email Intake ──────────────────────────────────────────── */}
<div className="mb-6">
  <h2 className="mb-3">Email Intake</h2>
  <Card>
    <CardContent className="p-5">
      <p className="text-[13px] text-muted-foreground mb-4">
        Forward client emails to your intake webhook URL. Rules below map sender domains or keywords to maintenance contracts.
      </p>

      {/* Rule list */}
      {intakeStore.rules.length === 0 ? (
        <p className="text-xs text-muted-foreground mb-3">No rules yet.</p>
      ) : (
        <table className="mb-4">
          <thead>
            <tr>
              <th>SENDER DOMAIN</th>
              <th>KEYWORD</th>
              <th>MAINTENANCE</th>
              <th>ISSUE TYPE</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {intakeStore.rules.map(rule => (
              <tr key={rule.id}>
                <td className="text-[13px]">{rule.sender_domain ?? '—'}</td>
                <td className="text-[13px]">{rule.keyword ?? '—'}</td>
                <td className="text-[13px]">{rule.maintenance?.name ?? '—'}</td>
                <td className="text-[13px]">{rule.default_issue_type}</td>
                <td>
                  <Button variant="destructive" size="xs" onClick={() => intakeStore.remove(rule.id)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Add rule form */}
      <div className="border-t border-border pt-4">
        <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Add rule</div>
        <div className="grid grid-cols-4 gap-3 mb-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Sender domain</label>
            <input value={intakeForm.sender_domain} onChange={e => setIntakeForm(f => ({ ...f, sender_domain: e.target.value }))} placeholder="pirnar.si" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Keyword (fallback)</label>
            <input value={intakeForm.keyword} onChange={e => setIntakeForm(f => ({ ...f, keyword: e.target.value }))} placeholder="pirnar" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Maintenance</label>
            <Select
              value={intakeForm.maintenance_id}
              onChange={v => setIntakeForm(f => ({ ...f, maintenance_id: v }))}
              placeholder="Select…"
              options={maintenancesStore.maintenances.map(m => ({ value: m.id, label: m.name }))}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Default issue type</label>
            <input value={intakeForm.default_issue_type} onChange={e => setIntakeForm(f => ({ ...f, default_issue_type: e.target.value }))} placeholder="Bug" />
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleAddIntakeRule}
          disabled={!intakeForm.maintenance_id || (!intakeForm.sender_domain && !intakeForm.keyword)}
        >
          Add rule
        </Button>
      </div>
    </CardContent>
  </Card>
</div>
```

Add local state and handler in the SettingsView component:
```tsx
const intakeStore = useEmailIntakeStore()
const maintenancesStore = useMaintenancesStore()
const [intakeForm, setIntakeForm] = useState({
  sender_domain: '', keyword: '', maintenance_id: '', default_issue_type: 'Bug'
})

useEffect(() => {
  intakeStore.fetchAll()
  maintenancesStore.fetchAll()
}, []) // eslint-disable-line react-hooks/exhaustive-deps

async function handleAddIntakeRule() {
  try {
    await intakeStore.add({
      maintenance_id: intakeForm.maintenance_id,
      sender_domain: intakeForm.sender_domain.trim() || null,
      keyword: intakeForm.keyword.trim() || null,
      default_issue_type: intakeForm.default_issue_type.trim() || 'Bug',
    })
    setIntakeForm({ sender_domain: '', keyword: '', maintenance_id: '', default_issue_type: 'Bug' })
    toast('success', 'Rule added')
  } catch {
    toast('error', 'Failed to add rule')
  }
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/stores/emailIntake.ts src/views/SettingsView.tsx
git commit -m "feat: add email intake store and settings UI"
```

---

## Chunk 8: Build verification

### Task 13: Full build + type check

- [ ] **Step 1: Run full type check**

```bash
npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 2: Run production build**

```bash
npm run build
```
Expected: build completes with no errors.

- [ ] **Step 3: Fix any remaining issues**

If there are TS6133 (unused variable) errors, remove the unused variable. If there are import errors, verify paths. Do not declare workaround variables.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: maintenance Jira dashboard complete"
```

---

## Summary of files

| File | Action |
|------|--------|
| `supabase/migrations/010_jira_integration.sql` | Create |
| `src/lib/types.ts` | Modify — add 4 interfaces, add `jira_project_key` to `Maintenance` |
| `src/stores/settings.ts` | Modify — add Jira credential fields |
| `src/stores/jira.ts` | Create |
| `src/stores/emailIntake.ts` | Create |
| `src/views/SettingsView.tsx` | Modify — add Jira + Email Intake sections |
| `src/views/MaintenanceDetailView.tsx` | Modify — add tabs, jira_project_key field, wire new tabs |
| `src/views/maintenance/UsageTab.tsx` | Create |
| `src/views/maintenance/ReportsTab.tsx` | Create |
| `supabase/functions/jira-proxy/index.ts` | Create |
| `supabase/functions/email-intake/index.ts` | Create |
