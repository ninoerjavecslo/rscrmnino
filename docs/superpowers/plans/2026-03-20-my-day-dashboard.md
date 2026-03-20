# My Day Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign MyWeekView into a full 3-panel "My Day" dashboard with per-task EOD check-in, smart unplanned work reporting, team presence strip, and AI reschedule suggestions.

**Architecture:** The existing `MyWeekView` (standalone route `/my-week/:token`) is fully replaced with a 3-panel layout — left sidebar (week strip + team), center (selected day with per-task check-in), right (AI advisor). Per-task actual hours are stored in a new `allocation_actuals` table. A new `day-advisor` edge function provides 3 reschedule options when actuals differ from plan. Unplanned work uses client-side fuzzy matching against the project list.

**Tech Stack:** React 19 + TypeScript strict, Supabase JS client, Deno edge function (Anthropic SDK `claude-sonnet-4-6`), custom CSS design system (no Tailwind), Figtree font, CSS variables (`--navy`, `--c0`–`--c8`, `--green`, `--amber`, `--red`).

---

## Chunk 1: DB + Types + Edge Function

### Task 1: DB migration — allocation_actuals table

**Files:**
- Create: `supabase/migrations/add_allocation_actuals.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/add_allocation_actuals.sql
create table if not exists allocation_actuals (
  id            uuid primary key default gen_random_uuid(),
  allocation_id uuid not null references resource_allocations(id) on delete cascade,
  member_id     uuid not null references team_members(id) on delete cascade,
  date          date not null,
  actual_hours  numeric(4,1) not null check (actual_hours >= 0),
  note          text,
  created_at    timestamptz default now()
);

-- Only one actual per allocation
create unique index if not exists allocation_actuals_alloc_idx
  on allocation_actuals(allocation_id);

-- RLS
alter table allocation_actuals enable row level security;
create policy "allow all" on allocation_actuals for all using (true) with check (true);
```

- [ ] **Step 2: Apply the migration via Supabase dashboard**

Go to Supabase Dashboard → SQL Editor → paste and run the migration above.

- [ ] **Step 3: Verify table exists**

In SQL editor run: `select * from allocation_actuals limit 1;` — should return empty result with no error.

---

### Task 2: TypeScript types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `AllocationActual` interface after `ResourceConfirmation`**

```ts
export interface AllocationActual {
  id: string
  allocation_id: string
  member_id: string
  date: string           // YYYY-MM-DD
  actual_hours: number
  note?: string | null
  created_at: string
}
```

- [ ] **Step 2: Verify no TS errors**

```bash
npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/add_allocation_actuals.sql src/lib/types.ts
git commit -m "feat: add allocation_actuals table and type"
```

---

### Task 3: Day advisor edge function

**Files:**
- Create: `supabase/functions/day-advisor/index.ts`

- [ ] **Step 1: Write the edge function**

```ts
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.53.0'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

interface AllocationWithActual {
  id: string
  project_pn?: string
  project_name?: string
  category: string
  planned_hours: number
  actual_hours: number | null   // null = not confirmed yet
  note?: string
}

interface WeekAllocation {
  date: string
  project_name?: string
  category: string
  hours: number
}

interface RescheduleOption {
  id: string
  title: string
  description: string
  impact: string
}

interface DayAdvisorResponse {
  reschedule_options: RescheduleOption[]
  insights: Array<{ label: string; text: string }>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }
    })
  }

  try {
    const { member_name, date, capacity_hours, today_tasks, remaining_week } = await req.json() as {
      member_name: string
      date: string
      capacity_hours: number
      today_tasks: AllocationWithActual[]
      remaining_week: WeekAllocation[]
    }

    // Calculate deltas
    const deltaLines = today_tasks
      .filter(t => t.actual_hours !== null && t.actual_hours !== t.planned_hours)
      .map(t => {
        const diff = (t.actual_hours ?? 0) - t.planned_hours
        const sign = diff > 0 ? '+' : ''
        return `- ${t.project_name || t.category}: planned ${t.planned_hours}h, actual ${t.actual_hours}h (${sign}${diff}h)${t.note ? ` — "${t.note}"` : ''}`
      })

    if (deltaLines.length === 0) {
      return new Response(JSON.stringify({ reschedule_options: [], insights: [] }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const remainingLines = remaining_week.map(a =>
      `  ${a.date}: ${a.project_name || a.category} ${a.hours}h`
    ).join('\n')

    const prompt = `You are a resource planning assistant for a digital agency.

Team member: ${member_name}
Date: ${date}
Daily capacity: ${capacity_hours}h

=== TODAY'S ACTUAL vs PLANNED ===
${deltaLines.join('\n')}

=== REMAINING WEEK (scheduled) ===
${remainingLines || '  (nothing else scheduled)'}

Based on these actual hours vs plan, suggest exactly 3 reschedule options.
Be specific: name the project, the hours, the day.
Keep each option short and actionable.

Also provide 1-2 brief insights (patterns, risks, opportunities).

Return ONLY valid JSON:
{
  "reschedule_options": [
    {
      "id": "opt1",
      "title": "Short title (max 40 chars)",
      "description": "One sentence with specifics: project, hours, day",
      "impact": "one-word impact: low | medium | high"
    }
  ],
  "insights": [
    { "label": "Pattern", "text": "One sentence observation" }
  ]
}`

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed: DayAdvisorResponse = JSON.parse(clean)

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
```

- [ ] **Step 2: Deploy via Supabase dashboard**

Go to Supabase Dashboard → Edge Functions → New Function → name: `day-advisor` → paste code → Deploy.

Alternatively via CLI (if authenticated):
```bash
npx supabase functions deploy day-advisor --project-ref bitodtrjpebcqolpubgq
```

- [ ] **Step 3: Commit the local file**

```bash
git add supabase/functions/day-advisor/index.ts
git commit -m "feat: add day-advisor edge function for EOD reschedule suggestions"
```

---

## Chunk 2: MyWeekView Redesign

### Task 4: Remove unused helpers + update imports

**Files:**
- Modify: `src/views/MyWeekView.tsx`

The rewrite removes the old single-column JSX that used several helpers. Remove them proactively to avoid TS6133 errors.

- [ ] **Step 1: Update the React import line to include `useMemo`**

Change:
```tsx
import { useState, useEffect } from 'react'
```
To:
```tsx
import { useState, useEffect, useMemo } from 'react'
```

- [ ] **Step 2: Remove or keep-but-use these helpers**

The following are used only in the old JSX being replaced. Remove them entirely:
- `formatDayLong` (line ~26) — replaced by inline `toLocaleDateString` calls
- `categoryBg` (line ~40) — not used in new layout
- `categoryColor` (line ~50) — not used in new layout

Leave `formatWeekRange` — still used in topbar.

- [ ] **Step 3: Remove unused state declarations**

Remove these state variables (they belong to the old confirm/delay flow being replaced):
```tsx
// Remove:
const [confirmingDate, setConfirmingDate] = useState<string | null>(null)
const [actualHours, setActualHours] = useState<number>(8)
const [delayDate, setDelayDate] = useState<string | null>(null)
const [delayReason, setDelayReason] = useState('')
```

Also remove `handleDelay` function (the new UI uses inline "Mark delayed" via a simplified upsert). Replace it with:
```tsx
async function markDelayed(date: string) {
  if (!member) return
  await supabase.from('resource_confirmations').upsert(
    { member_id: member.id, date, status: 'delayed', delay_reason: null },
    { onConflict: 'member_id,date' }
  )
  setConfirmations(prev => [
    ...prev.filter(c => c.date !== date),
    { id: '', member_id: member.id, date, status: 'delayed', delay_reason: null, confirmed_at: new Date().toISOString() },
  ])
}
```

Update the "Mark delayed" button in Task 6 to call `markDelayed(selectedDate)` instead of `handleDelay(selectedDate)`.

- [ ] **Step 4: Type check — should be clean**

```bash
npx tsc --noEmit
```

---

### Task 5: Layout scaffold — 3-panel grid

**Files:**
- Modify: `src/views/MyWeekView.tsx` (full rewrite)

The view is a standalone page (no app sidebar). Replace the current `maxWidth:600` single-column layout with a full-viewport 3-column CSS grid.

**Grid definition:**
```
grid-template-columns: 220px 1fr 280px
grid-template-rows: 52px 1fr
height: 100vh
```

- [ ] **Step 1: Replace the outermost container and add the topbar structure**

Keep all existing state variables and data-fetching logic. Only change the return JSX starting at line 192.

The new `return` structure (replace everything from `return (` to closing):

```tsx
return (
  <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', gridTemplateRows: '52px 1fr', height: '100vh', background: 'var(--bg)', fontFamily: "'Figtree', sans-serif" }}>

    {/* Topbar — spans all 3 columns */}
    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--c6)' }}>
      {/* left: avatar + greeting + week nav */}
      {/* right: Export PPS + Report Unplanned (red) */}
    </div>

    {/* Left sidebar */}
    <div style={{ borderRight: '1px solid var(--c6)', background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(12px)', overflowY: 'auto', padding: '14px 10px' }}>
      {/* week strip + team */}
    </div>

    {/* Main — selected day */}
    <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* day title + stats strip + EOD check-in + unplanned trigger */}
    </div>

    {/* Right panel — AI */}
    <div style={{ borderLeft: '1px solid var(--c6)', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(12px)', overflowY: 'auto', padding: '16px 14px' }}>
      {/* AI suggestions */}
    </div>

  </div>
)
```

- [ ] **Step 2: Add `selectedDate` state (which day is active in the left sidebar)**

Add near existing state declarations:
```tsx
const [selectedDate, setSelectedDate] = useState(() => localDate(new Date()))
```

Initialize to today, or first day of week if today not in the week.

- [ ] **Step 3: Verify app still compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

---

### Task 6: Left sidebar — week strip + team presence

**Files:**
- Modify: `src/views/MyWeekView.tsx`

The left sidebar shows:
1. Label "This week"
2. Five day pills (Mon–Fri) — clickable, shows hours bar + status indicator
3. Divider
4. Label "Team"
5. Team member rows with status badges

For team data, we need to fetch all team members and their week allocations. Add new state and effect.

- [ ] **Step 1: Add team state**

```tsx
const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; hours_per_day: number }>>([])
const [teamAllocations, setTeamAllocations] = useState<Array<{ member_id: string; date: string; hours: number }>>([])
```

- [ ] **Step 2: Add team fetch effect** (runs when `weekStart`/`weekEnd` change)

```tsx
useEffect(() => {
  if (!member) return
  Promise.all([
    supabase.from('team_members').select('id, name, hours_per_day').eq('active', true).order('display_order'),
    supabase.from('resource_allocations').select('member_id, date, hours').gte('date', weekStart).lte('date', weekEnd),
  ]).then(([membersRes, allocRes]) => {
    if (membersRes.data) setTeamMembers(membersRes.data)
    if (allocRes.data) setTeamAllocations(allocRes.data)
  })
}, [member, weekStart, weekEnd])
```

- [ ] **Step 3: Write `getTeamMemberStatus` helper**

```tsx
function getTeamMemberStatus(
  memberId: string,
  weekDays: string[],
  allAllocations: Array<{ member_id: string; date: string; hours: number }>,
  capacityHours: number
): 'ok' | 'busy' | 'light' {
  const total = allAllocations
    .filter(a => a.member_id === memberId && weekDays.includes(a.date))
    .reduce((s, a) => s + a.hours, 0)
  const cap = weekDays.length * capacityHours
  const pct = cap > 0 ? total / cap : 0
  if (pct >= 0.9) return 'busy'
  if (pct < 0.3) return 'light'
  return 'ok'
}
```

- [ ] **Step 4: Write `DayPill` inline component helper** (inside the file, above `return`)

```tsx
function DayPill({
  dateStr, label, hours, capacity, status, isSelected, isToday,
  onClick
}: {
  dateStr: string; label: string; hours: number; capacity: number
  status?: 'confirmed' | 'delayed' | null; isSelected: boolean; isToday: boolean
  onClick: () => void
}) {
  const pct = Math.min(1, capacity > 0 ? hours / capacity : 0)
  const barColor = status === 'confirmed' ? 'var(--green)' : status === 'delayed' ? 'var(--amber)' : isToday ? 'var(--navy)' : 'var(--c5)'
  const borderLeft = status === 'confirmed' ? '3px solid var(--green)' : status === 'delayed' ? '3px solid var(--amber)' : isToday ? '3px solid var(--navy)' : '3px solid transparent'

  return (
    <div
      onClick={onClick}
      style={{
        padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
        background: isSelected ? 'var(--navy-light)' : 'transparent',
        border: isSelected ? '1.5px solid var(--navy-muted)' : '1.5px solid transparent',
        borderLeft: isSelected ? undefined : borderLeft,
        marginBottom: 4, transition: 'all 0.12s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: isToday ? 'var(--navy)' : 'var(--c1)' }}>{label}</div>
          <div style={{ fontSize: 10, color: 'var(--c3)', marginTop: 1 }}>{dateStr}{isToday ? ' · Today' : ''}</div>
        </div>
        {status === 'confirmed' && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)' }}>✓</span>}
        {status === 'delayed' && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--amber)' }}>⚠</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5 }}>
        <div style={{ flex: 1, height: 3, background: 'var(--c6)', borderRadius: 2 }}>
          <div style={{ width: `${pct * 100}%`, height: 3, borderRadius: 2, background: barColor }} />
        </div>
        <span style={{ fontSize: 10, color: hours > capacity ? 'var(--red)' : 'var(--c3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {hours}h{hours > capacity ? '!' : ''}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Populate the left sidebar JSX**

Replace the left sidebar `{/* week strip + team */}` placeholder:

```tsx
<>
  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--c3)', padding: '2px 6px', marginBottom: 6 }}>This week</div>

  {weekDays.map((d, i) => {
    const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
    const dayAllocHours = allocations.filter(a => a.date === d).reduce((s, a) => s + a.hours, 0)
    const conf = confirmations.find(c => c.date === d)
    const shortDate = new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return (
      <DayPill
        key={d}
        dateStr={shortDate}
        label={dayLabels[i]}
        hours={dayAllocHours}
        capacity={member?.hours_per_day ?? 8}
        status={conf?.status ?? null}
        isSelected={selectedDate === d}
        isToday={d === today}
        onClick={() => setSelectedDate(d)}
      />
    )
  })}

  <div style={{ height: 1, background: 'var(--c6)', margin: '10px 4px' }} />

  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--c3)', padding: '2px 6px', marginBottom: 6 }}>Team</div>

  {teamMembers.filter(tm => tm.id !== member?.id).map(tm => {
    const st = getTeamMemberStatus(tm.id, weekDays, teamAllocations, tm.hours_per_day)
    const statusColor = st === 'busy' ? 'var(--amber)' : st === 'light' ? 'var(--c3)' : 'var(--green)'
    const statusBg = st === 'busy' ? 'var(--amber-bg)' : st === 'light' ? 'var(--c7)' : 'var(--green-bg)'
    const statusBorder = st === 'busy' ? 'var(--amber-border)' : st === 'light' ? 'var(--c6)' : 'var(--green-border)'
    const statusLabel = st === 'busy' ? 'busy' : st === 'light' ? 'light' : 'ok'
    const initials = tm.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    return (
      <div key={tm.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', borderRadius: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>
          {initials}
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: 'var(--c1)' }}>{tm.name}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: statusBg, color: statusColor, border: `1px solid ${statusBorder}` }}>
          {statusLabel}
        </span>
      </div>
    )
  })}
</>
```

- [ ] **Step 6: Type check**

```bash
npx tsc --noEmit
```

---

### Task 7: Main panel — EOD check-in per task

**Files:**
- Modify: `src/views/MyWeekView.tsx`

The main panel shows the selected day. Key states needed for EOD:
- Per-allocation actual hours map
- Per-allocation note map
- AI advisor loading/result state

- [ ] **Step 1: Add EOD state**

```tsx
// Per-allocation actual hours: key = allocation.id, value = actual hours (null = unchanged/confirmed-as-planned)
const [actualMap, setActualMap] = useState<Record<string, number>>({})
// Per-allocation notes
const [noteMap, setNoteMap] = useState<Record<string, string>>({})
// EOD submit loading
const [eodLoading, setEodLoading] = useState(false)
```

- [ ] **Step 2: Add `handleActualChange` helper**

```tsx
function handleActualChange(allocId: string, hours: number) {
  setActualMap(prev => ({ ...prev, [allocId]: hours }))
}
function handleNoteChange(allocId: string, note: string) {
  setNoteMap(prev => ({ ...prev, [allocId]: note }))
}
```

- [ ] **Step 3: Add `handleEodSubmit` async function**

```tsx
async function handleEodSubmit() {
  if (!member) return
  setEodLoading(true)
  const selectedAllocs = allocations.filter(a => a.date === selectedDate)

  // Upsert actuals for each allocation
  const inserts = selectedAllocs.map(a => ({
    allocation_id: a.id,
    member_id: member.id,
    date: selectedDate,
    actual_hours: actualMap[a.id] ?? a.hours,
    note: noteMap[a.id] || null,
  }))

  await supabase.from('allocation_actuals').upsert(inserts, { onConflict: 'allocation_id' })

  // Also upsert day-level confirmation
  await supabase.from('resource_confirmations').upsert(
    { member_id: member.id, date: selectedDate, status: 'confirmed' },
    { onConflict: 'member_id,date' }
  )
  setConfirmations(prev => [
    ...prev.filter(c => c.date !== selectedDate),
    { id: '', member_id: member.id, date: selectedDate, status: 'confirmed', delay_reason: null, confirmed_at: new Date().toISOString() },
  ])

  // Trigger AI advisor if any deltas exist
  const hasDeltas = selectedAllocs.some(a => (actualMap[a.id] ?? a.hours) !== a.hours)
  if (hasDeltas) {
    await fetchAiAdvice(selectedAllocs)
  }

  setEodLoading(false)
}
```

- [ ] **Step 4: Add AI advisor state + `fetchAiAdvice`**

```tsx
const [aiOptions, setAiOptions] = useState<Array<{ id: string; title: string; description: string; impact: string }>>([])
const [aiInsights, setAiInsights] = useState<Array<{ label: string; text: string }>>([])
const [aiLoading, setAiLoading] = useState(false)

async function fetchAiAdvice(selectedAllocs: ResourceAllocation[]) {
  if (!member) return
  setAiLoading(true)
  const today_tasks = selectedAllocs.map(a => ({
    id: a.id,
    project_pn: a.project?.pn,
    project_name: a.project?.name ?? a.label ?? a.category,
    category: a.category,
    planned_hours: a.hours,
    actual_hours: actualMap[a.id] ?? null,
    note: noteMap[a.id] || undefined,
  }))

  const remaining_week = allocations
    .filter(a => a.date > selectedDate)
    .map(a => ({
      date: a.date,
      project_name: a.project?.name ?? a.label ?? a.category,
      category: a.category,
      hours: a.hours,
    }))

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/day-advisor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        member_name: member.name,
        date: selectedDate,
        capacity_hours: member.hours_per_day,
        today_tasks,
        remaining_week,
      }),
    })
    const json = await res.json()
    setAiOptions(json.reschedule_options ?? [])
    setAiInsights(json.insights ?? [])
  } catch { /* silent */ }
  setAiLoading(false)
}
```

Note: The `day-advisor` edge function is called with the anon key (public route, no JWT required on the function). Adjust `verify_jwt: false` when deploying if needed, or pass the anon key directly.

- [ ] **Step 5: Write `HourChips` inline helper component**

```tsx
function HourChips({ planned, actual, onChange }: { planned: number; actual: number; onChange: (h: number) => void }) {
  // Generate chips: planned-2 to planned+3, in 0.5 steps, min 0.5
  const options: number[] = []
  for (let h = Math.max(0.5, planned - 2); h <= planned + 3; h += 0.5) {
    options.push(Math.round(h * 2) / 2)
  }
  // Deduplicate
  const unique = [...new Set(options)]

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
      {unique.map(h => {
        const isPlanned = h === planned
        const isSelected = h === actual
        const isLess = h < planned
        const isMore = h > planned
        let bg = 'var(--c7)', color = 'var(--c2)', border = 'var(--c6)'
        if (isSelected && isPlanned) { bg = 'var(--navy-light)'; color = 'var(--navy)'; border = 'var(--navy-muted)' }
        else if (isSelected && isLess) { bg = 'var(--amber-bg)'; color = 'var(--amber)'; border = 'var(--amber-border)' }
        else if (isSelected && isMore) { bg = 'var(--blue-bg)'; color = 'var(--blue)'; border = 'var(--blue-border)' }

        return (
          <button
            key={h}
            onClick={() => onChange(h)}
            style={{
              padding: '5px 12px', borderRadius: 100, fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${border}`, background: bg, color, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.1s',
            }}
          >
            {h}h{isPlanned && !isSelected ? ' (plan)' : ''}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 6: Build the main panel JSX**

Replace the main panel placeholder with the full day view:

```tsx
{/* Day title */}
<div>
  <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.4px', color: 'var(--c0)' }}>
    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
  </div>
  {(() => {
    const dayAllocs = allocations.filter(a => a.date === selectedDate)
    const totalH = dayAllocs.reduce((s, a) => s + a.hours, 0)
    const cap = member?.hours_per_day ?? 8
    const conf = confirmations.find(c => c.date === selectedDate)
    const subText = conf
      ? `${conf.status === 'confirmed' ? '✓ Confirmed' : '⚠ Delayed'} · ${totalH}h`
      : `${totalH}h planned · ${cap}h capacity${totalH > cap ? ` · over by ${totalH - cap}h` : ''}`
    return <div style={{ fontSize: 12, color: 'var(--c3)', marginTop: 3 }}>{subText}</div>
  })()}
</div>

{/* Stats strip */}
{(() => {
  const confirmedH = allocations.filter(a => {
    const c = confirmations.find(c => c.date === a.date)
    return c?.status === 'confirmed'
  }).reduce((s, a) => s + a.hours, 0)
  const todayH = allocations.filter(a => a.date === selectedDate).reduce((s, a) => s + a.hours, 0)
  const billableH = allocations.filter(a => weekDays.includes(a.date) && a.is_billable).reduce((s, a) => s + a.hours, 0)
  const totalH = allocations.filter(a => weekDays.includes(a.date)).reduce((s, a) => s + a.hours, 0)
  const billPct = totalH > 0 ? Math.round(billableH / totalH * 100) : 0
  const delayedDays = confirmations.filter(c => c.status === 'delayed').length
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
      {[
        { val: `${confirmedH}h`, label: 'Confirmed' },
        { val: `${todayH}h`, label: 'Today planned', warn: todayH > (member?.hours_per_day ?? 8) },
        { val: `${billPct}%`, label: 'Billable' },
        { val: String(delayedDays), label: 'Delayed', warn: delayedDays > 0 },
      ].map(({ val, label, warn }) => (
        <div key={label} style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(12px)', border: '1px solid var(--c6)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: warn ? 'var(--amber)' : 'var(--c0)', letterSpacing: '-0.3px' }}>{val}</div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c3)', marginTop: 2 }}>{label}</div>
        </div>
      ))}
    </div>
  )
})()}

{/* EOD check-in or confirmed message */}
{(() => {
  const dayAllocs = allocations.filter(a => a.date === selectedDate)
  const conf = confirmations.find(c => c.date === selectedDate)
  const isPast = selectedDate <= today

  if (!isPast || dayAllocs.length === 0) return null

  if (conf?.status === 'confirmed') {
    return (
      <div style={{ padding: '12px 16px', background: 'var(--green-bg)', border: '1px solid var(--green-border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 16 }}>✓</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>Day confirmed</span>
      </div>
    )
  }

  return (
    <>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--c3)', marginBottom: 10 }}>
          End of day check-in — how many hours did you actually work?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {dayAllocs.map(a => {
            const actual = actualMap[a.id] ?? a.hours
            const changed = actual !== a.hours
            const cardBorder = changed ? 'var(--amber-border)' : 'var(--c6)'
            const cardBg = changed ? 'var(--amber-bg)' : '#fff'
            return (
              <div key={a.id} style={{ padding: '14px 16px', border: `1.5px solid ${cardBorder}`, borderRadius: 10, background: cardBg, boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 3, borderRadius: 2, background: 'var(--navy)', alignSelf: 'stretch', flexShrink: 0, minHeight: 36 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--c0)' }}>
                      {a.project?.name ?? a.label ?? a.category}
                    </div>
                    {a.project?.pn && <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 2 }}>{a.project.pn} · {a.category}</div>}
                    <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 4 }}>Planned: {a.hours}h</div>
                    <HourChips
                      planned={a.hours}
                      actual={actual}
                      onChange={h => handleActualChange(a.id, h)}
                    />
                    {changed && (
                      <input
                        value={noteMap[a.id] ?? ''}
                        onChange={e => handleNoteChange(a.id, e.target.value)}
                        placeholder="Quick note: why different? (optional)"
                        style={{ marginTop: 8, width: '100%', padding: '7px 12px', border: '1.5px solid var(--c6)', borderRadius: 8, fontSize: 12, fontFamily: 'inherit', color: 'var(--c1)', background: '#fff' }}
                      />
                    )}
                    {changed && (
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid var(--amber-border)' }}>
                          {actual > a.hours ? `+${actual - a.hours}h vs plan` : `−${a.hours - actual}h vs plan`}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 600 }}>→ AI will suggest reschedule</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add unplanned */}
          <div
            onClick={() => setShowUnplanned(true)}
            style={{ padding: '12px 16px', border: '2px solid var(--red-border)', background: 'var(--red-bg)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fff', border: '1px solid var(--red-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⚡</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>Report unplanned work</div>
                <div style={{ fontSize: 11, color: '#f87171', marginTop: 1 }}>Something came up? Log it here</div>
              </div>
            </div>
            <span style={{ color: 'var(--red)', fontSize: 18, opacity: 0.5 }}>→</span>
          </div>
        </div>
      </div>

      {/* Submit row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'var(--navy-light)', border: '1.5px solid var(--navy-muted)', borderRadius: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>Submit end-of-day check-in</div>
          <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 2 }}>
            {Object.keys(actualMap).some(id => {
              const a = allocations.find(x => x.id === id)
              return a && actualMap[id] !== a.hours
            }) ? 'Changes detected — AI will suggest reschedule' : 'Confirm day as planned'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleDelay(selectedDate)}
          >
            ⚠ Mark delayed
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleEodSubmit}
            disabled={eodLoading}
          >
            {eodLoading ? 'Saving…' : 'Submit →'}
          </button>
        </div>
      </div>
    </>
  )
})()}
```

- [ ] **Step 7: Type check**

```bash
npx tsc --noEmit
```

Expected: clean.

---

### Task 8: Right panel — AI advisor

**Files:**
- Modify: `src/views/MyWeekView.tsx`

The right panel shows AI options (populated after EOD submit) and static insights when empty.

- [ ] **Step 1: Populate the right panel JSX**

Replace the right panel placeholder:

```tsx
{/* AI Header */}
<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
  <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>✦</div>
  <div>
    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--c0)' }}>AI Advisor</div>
    <div style={{ fontSize: 11, color: 'var(--c3)' }}>Updates after check-in</div>
  </div>
</div>

{aiLoading && (
  <div style={{ padding: '14px', background: 'var(--navy-light)', border: '1px solid var(--navy-muted)', borderRadius: 10, fontSize: 13, color: 'var(--navy)', fontWeight: 600 }}>
    ✦ Analyzing changes…
  </div>
)}

{!aiLoading && aiOptions.length > 0 && (
  <>
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--c3)', marginBottom: 8 }}>Reschedule options</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {aiOptions.map((opt, i) => (
        <div
          key={opt.id}
          style={{ padding: '11px 13px', border: '1.5px solid var(--c6)', borderRadius: 9, background: '#fff', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,.04)' }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--navy)', marginBottom: 4 }}>
            Option {i + 1} {opt.impact === 'low' ? '· easy' : opt.impact === 'high' ? '· significant' : ''}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c0)', marginBottom: 4 }}>{opt.title}</div>
          <div style={{ fontSize: 12, color: 'var(--c2)', lineHeight: 1.55 }}>{opt.description}</div>
        </div>
      ))}
    </div>
    <div style={{ height: 1, background: 'var(--c6)' }} />
  </>
)}

{!aiLoading && aiInsights.length > 0 && (
  <>
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--c3)', marginBottom: 8 }}>Insights</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {aiInsights.map((ins, i) => (
        <div key={i} style={{ padding: '11px 13px', background: 'var(--c7)', border: '1px solid var(--c6)', borderRadius: 9 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--c3)', marginBottom: 4 }}>{ins.label}</div>
          <div style={{ fontSize: 12, color: 'var(--c2)', lineHeight: 1.55 }}>{ins.text}</div>
        </div>
      ))}
    </div>
  </>
)}

{!aiLoading && aiOptions.length === 0 && (
  <div style={{ padding: '14px', background: 'var(--c7)', border: '1px solid var(--c6)', borderRadius: 10, fontSize: 12, color: 'var(--c3)', lineHeight: 1.6 }}>
    Complete your end-of-day check-in. If any hours differ from the plan, AI will suggest how to reschedule.
  </div>
)}

{/* Team overload alerts — always visible */}
{teamMembers.length > 0 && (() => {
  const overloaded = teamMembers.filter(tm => {
    const total = teamAllocations.filter(a => a.member_id === tm.id && weekDays.includes(a.date)).reduce((s, a) => s + a.hours, 0)
    const cap = tm.hours_per_day * weekDays.length
    return total > cap * 0.95
  })
  if (overloaded.length === 0) return null
  return (
    <div style={{ padding: '12px 14px', background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', borderRadius: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber)', marginBottom: 5 }}>Team overload this week</div>
      {overloaded.map(tm => (
        <div key={tm.id} style={{ fontSize: 12, color: 'var(--c2)' }}>{tm.name} is above capacity</div>
      ))}
    </div>
  )
})()}
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

---

## Chunk 3: Unplanned Work Modal Redesign + Topbar

### Task 9: Topbar

**Files:**
- Modify: `src/views/MyWeekView.tsx`

- [ ] **Step 1: Replace topbar placeholder with full content**

```tsx
{/* Topbar left */}
<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
    {member ? member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?'}
  </div>
  <div>
    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)' }}>
      {member ? `Hi, ${member.name.split(' ')[0]}` : 'My Day'}
    </div>
    <div style={{ fontSize: 11, color: 'var(--c3)' }}>
      {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
    </div>
  </div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
    <button
      className="btn btn-ghost btn-sm"
      onClick={() => {
        const newMonday = getOffsetMonday(weekOffset - 1)
        setWeekOffset(w => w - 1)
        setSelectedDate(getWeekDays(newMonday)[0])
      }}
    >
      ← Prev
    </button>
    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--c1)' }}>
      {formatWeekRange(weekStart)}
    </span>
    <button
      className="btn btn-ghost btn-sm"
      disabled={weekOffset >= 0}
      onClick={() => {
        const newMonday = getOffsetMonday(weekOffset + 1)
        setWeekOffset(w => w + 1)
        setSelectedDate(getWeekDays(newMonday)[0])
      }}
    >
      Next →
    </button>
  </div>
</div>

{/* Topbar right */}
<div style={{ display: 'flex', gap: 8 }}>
  <button className="btn btn-ghost btn-sm" onClick={handleExportPPS}>
    Export PPS
  </button>
  <button
    className="btn btn-sm"
    style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1.5px solid var(--red-border)' }}
    onClick={() => setShowUnplanned(true)}
  >
    🤒 Report sick
  </button>
</div>
```

- [ ] **Step 2: Type check**

```bash
npx tsc --noEmit
```

---

### Task 10: Report Unplanned modal — redesign with fuzzy match

**Files:**
- Modify: `src/views/MyWeekView.tsx`

Replace the existing unplanned modal with a glass-card modal. Key behavior:
- Text input filters `projectList` client-side (case-insensitive substring match on `pn + name`)
- Shows top match with confidence indicator OR "no match" + create hint
- Hour chips replace the number input
- Note = optional textarea
- AI preview section shows what will happen

- [ ] **Step 1: Add `unplannedQuery` state for the search field**

```tsx
const [unplannedQuery, setUnplannedQuery] = useState('')
```

- [ ] **Step 2: Add `matchedProject` derived value** (computed from `unplannedQuery` + `projectList`)

```tsx
const matchedProject = useMemo(() => {
  if (!unplannedQuery.trim()) return null
  const q = unplannedQuery.toLowerCase()
  const scored = projectList
    .map(p => {
      const haystack = `${p.pn} ${p.name}`.toLowerCase()
      const score = haystack.includes(q) ? 1 : q.split(' ').filter(w => haystack.includes(w)).length / q.split(' ').length
      return { ...p, score }
    })
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored[0] ?? null
}, [unplannedQuery, projectList])
```

Add `useMemo` to imports.

- [ ] **Step 3: Replace the unplanned modal JSX entirely**

Remove the existing `showUnplanned` modal (find it after the main day loop). Replace with:

```tsx
{showUnplanned && (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
    <div style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.95)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.12)', width: '100%', maxWidth: 480, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px', borderBottom: '1px solid var(--c6)' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--c0)', letterSpacing: '-0.3px' }}>⚡ Report unplanned work</div>
          <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 2 }}>
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {member?.name}
          </div>
        </div>
        <button onClick={() => setShowUnplanned(false)} style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--c7)', border: 'none', fontSize: 16, color: 'var(--c3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
      </div>

      <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Smart search */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c2)', marginBottom: 7 }}>What did you work on?</div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--c3)' }}>🔍</span>
            <input
              value={unplannedQuery}
              onChange={e => { setUnplannedQuery(e.target.value); setUnplannedProject('') }}
              placeholder="Type project name, client, or what you did…"
              style={{ width: '100%', padding: '10px 14px 10px 38px', border: '2px solid var(--navy-muted)', borderRadius: 10, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', color: 'var(--c0)', background: '#fff' }}
              autoFocus
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 5 }}>AI matches to a project — or creates a new one if not found</div>
        </div>

        {/* Match result */}
        {unplannedQuery.trim() && matchedProject && (
          <div
            onClick={() => setUnplannedProject(matchedProject.id)}
            style={{ padding: '11px 14px', background: unplannedProject === matchedProject.id ? 'var(--navy-light)' : 'var(--c7)', border: `1.5px solid ${unplannedProject === matchedProject.id ? 'var(--navy-muted)' : 'var(--c6)'}`, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <span style={{ fontSize: 15 }}>🏢</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)' }}>{matchedProject.name}</div>
              <div style={{ fontSize: 11, color: 'var(--c3)', marginTop: 1 }}>{matchedProject.pn}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'var(--navy)', color: '#fff' }}>matched</span>
          </div>
        )}
        {unplannedQuery.trim() && !matchedProject && (
          <div style={{ padding: '11px 14px', background: 'var(--amber-bg)', border: '1.5px solid var(--amber-border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)', flex: 1 }}>No project found for "{unplannedQuery}"</span>
            <button className="btn btn-sm" style={{ background: 'var(--amber)', color: '#fff', border: 'none' }}>+ Log anyway</button>
          </div>
        )}

        {/* Hours */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c2)', marginBottom: 7 }}>How many hours?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8].map(h => (
              <button
                key={h}
                onClick={() => setUnplannedHours(h)}
                style={{
                  padding: '6px 14px', borderRadius: 100, fontSize: 13, fontWeight: 700,
                  border: `1.5px solid ${unplannedHours === h ? 'var(--navy)' : 'var(--c6)'}`,
                  background: unplannedHours === h ? 'var(--navy)' : 'var(--c7)',
                  color: unplannedHours === h ? '#fff' : 'var(--c2)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {h}h
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--c2)', marginBottom: 7 }}>Quick note (optional)</div>
          <textarea
            value={unplannedDesc}
            onChange={e => setUnplannedDesc(e.target.value)}
            placeholder="e.g. urgent client call, production bug fix…"
            rows={2}
            style={{ width: '100%', padding: '8px 12px', border: '1.5px solid var(--c6)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', color: 'var(--c1)', background: '#fff', resize: 'none' }}
          />
        </div>

      </div>

      {/* Footer */}
      <div style={{ padding: '12px 22px', borderTop: '1px solid var(--c6)', background: 'var(--c8)', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => { setShowUnplanned(false); setUnplannedQuery('') }}>Cancel</button>
        <button
          className="btn btn-primary btn-sm"
          disabled={unplannedHours <= 0}
          onClick={() => {
            // Pass category directly — don't rely on async state update
            handleReportUnplanned('project')
            setUnplannedQuery('')
          }}
        >
          Log & save →
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Update `handleReportUnplanned` to accept a `category` param and use `selectedDate`**

Update the function signature and body:
```tsx
async function handleReportUnplanned(categoryOverride: AllocationCategory = unplannedCategory) {
  if (!member) return
  const { error: insErr } = await supabase.from('resource_allocations').insert({
    member_id: member.id,
    project_id: unplannedProject || null,
    category: categoryOverride,
    date: selectedDate,        // use selectedDate, not unplannedDate
    hours: unplannedHours,
    label: unplannedDesc || null,
    is_unplanned: true,
    is_billable: true,
  })
  // ... rest unchanged
}
```

Remove `unplannedDate` state and `setUnplannedDate` — no longer needed (always logs to selected day).

- [ ] **Step 5: Remove unused `unplannedDate`/`setUnplannedDate` state declaration**

```tsx
// Remove this line:
const [unplannedDate, setUnplannedDate] = useState(() => localDate(new Date()))
```

- [ ] **Step 6: Type check**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/views/MyWeekView.tsx
git commit -m "feat: redesign MyWeekView — 3-panel layout, per-task EOD check-in, smart unplanned modal, AI advisor panel"
```

---

## Chunk 4: Polish + Loading States

### Task 11: Loading and error states for new layout

**Files:**
- Modify: `src/views/MyWeekView.tsx`

- [ ] **Step 1: Update loading/error to fill the new full-screen grid**

The current `if (loading)` returns early with a small message. Update to render inside the 3-panel grid:

```tsx
if (loading) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', fontFamily: "'Figtree', sans-serif" }}>
      <div style={{ fontSize: 14, color: 'var(--c3)', fontWeight: 600 }}>Loading your week…</div>
    </div>
  )
}

if (error || !member) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', fontFamily: "'Figtree', sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--c0)', marginBottom: 8 }}>Link not found</div>
        <div style={{ fontSize: 14, color: 'var(--c3)' }}>{error ?? 'This link may be invalid or expired.'}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Remove old `{loading && ...}` / `{error && ...}` / `{!loading && !error && !member && ...}` blocks** inside the main return — they're now handled before the main render.

- [ ] **Step 3: Type check + final build check**

```bash
npx tsc --noEmit
npm run build 2>&1 | tail -5
```

Expected: both clean.

- [ ] **Step 4: Smoke test**

Open `/my-week/<token>` in browser. Verify:
- [ ] 3-panel layout renders
- [ ] Left sidebar shows 5 day pills, clicking switches main panel
- [ ] Today is highlighted in navy
- [ ] Past days with confirmations show green/amber
- [ ] Hour chips appear for today's allocations
- [ ] Changing a chip to different value shows amber card + note input + "AI will suggest reschedule"
- [ ] Submit button is visible and calls `handleEodSubmit`
- [ ] "⚡ Report unplanned work" trigger opens the new modal
- [ ] Typing in modal filters project list and shows top match
- [ ] Hour chips in modal work, Cancel closes it

- [ ] **Step 5: Final commit**

```bash
git add src/views/MyWeekView.tsx
git commit -m "feat: polish loading states, smoke test passing"
```

---

## Environment Notes

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are already in `.env` — used by the `day-advisor` edge function call in Task 6
- The `day-advisor` edge function should be deployed with `verify_jwt: false` so the standalone MyWeekView (no auth session) can call it with just the anon key
- If the `day-advisor` call fails silently, the UI still works — AI panel just stays empty with the "complete check-in" message
- The `allocation_actuals` table migration must be applied before testing Task 6
