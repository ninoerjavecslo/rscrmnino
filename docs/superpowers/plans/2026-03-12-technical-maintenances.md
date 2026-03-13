# Technical Maintenances Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone Technical Maintenances page for tracking monthly retainer support contracts, with automatic revenue_planner integration.

**Architecture:** New `maintenances` Supabase table + `revenue_planner` schema alteration (add `maintenance_id`, make `project_id` nullable). Zustand store following existing patterns. New `/maintenances` route + view. No separate detail page — all CRUD via modals on the list page.

**Tech Stack:** React 19, TypeScript strict, Zustand v5, Supabase JS, custom CSS design system (no Tailwind), React Router v7.

**Spec:** `docs/superpowers/specs/2026-03-12-technical-maintenances-design.md`

---

## Chunk 1: Database & Types

### Task 1: Run Supabase migrations

**Files:**
- Create: `supabase/migrations/20260312_maintenances.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Create maintenances table
CREATE TABLE maintenances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES clients(id),
  name            text NOT NULL,
  monthly_retainer numeric NOT NULL DEFAULT 0,
  help_requests_included integer NOT NULL DEFAULT 0,
  hours_included  numeric NOT NULL DEFAULT 0,
  contract_start  date NOT NULL,
  contract_end    date,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Allow revenue_planner to reference a maintenance instead of a project
ALTER TABLE revenue_planner
  ADD COLUMN IF NOT EXISTS maintenance_id uuid REFERENCES maintenances(id),
  ALTER COLUMN project_id DROP NOT NULL;
```

- [ ] **Step 2: Apply migration via Supabase MCP or dashboard**

Go to Supabase Dashboard → SQL Editor, paste and run the migration. Or use the MCP `apply_migration` tool with the SQL above.

- [ ] **Step 3: Verify tables exist**

In Supabase Dashboard → Table Editor, confirm `maintenances` table is visible and `revenue_planner` has `maintenance_id` column and `project_id` is nullable.

---

### Task 2: Add TypeScript types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `Maintenance` interface after the `Domain` interface**

```typescript
export interface Maintenance {
  id: string
  client_id: string
  name: string
  monthly_retainer: number
  help_requests_included: number
  hours_included: number
  contract_start: string   // YYYY-MM-DD
  contract_end?: string | null
  status: 'active' | 'paused' | 'cancelled'
  notes?: string | null
  created_at: string
  // Joined
  client?: Pick<Client, 'id' | 'name'> | null
}
```

- [ ] **Step 2: Update `RevenuePlanner` interface — make `project_id` optional, add `maintenance_id`**

Find the `RevenuePlanner` interface and update:
```typescript
export interface RevenuePlanner {
  id: string
  project_id?: string | null   // was: project_id: string
  maintenance_id?: string | null  // NEW
  month: string
  planned_amount?: number | null
  actual_amount?: number | null
  status: 'planned' | 'paid' | 'issued' | 'retainer' | 'cost'
  probability: number
  invoice_id?: string | null
  notes?: string | null
  // Joined
  project?: Pick<Project, 'id' | 'pn' | 'name' | 'type' | 'client_id'> | null
  maintenance?: Pick<Maintenance, 'id' | 'name' | 'client_id'> | null  // NEW
}
```

- [ ] **Step 3: Add `maintenances` table to `Database` interface**

Inside the `Database.public.Tables` object:
```typescript
maintenances: {
  Row: Omit<Maintenance, 'client'>
  Insert: Omit<Maintenance, 'id' | 'created_at' | 'client'>
  Update: Partial<Omit<Maintenance, 'id' | 'created_at' | 'client'>>
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts supabase/migrations/20260312_maintenances.sql
git commit -m "feat: add Maintenance type and DB migration"
```

---

## Chunk 2: Store

### Task 3: Create maintenances Zustand store

**Files:**
- Create: `src/stores/maintenances.ts`

This store follows the same pattern as `src/stores/projects.ts`. It also handles writing `retainer` rows to `revenue_planner` when a maintenance is created or updated.

- [ ] **Step 1: Create `src/stores/maintenances.ts`**

```typescript
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Maintenance } from '../lib/types'

// Generate all YYYY-MM-DD month strings from start to end (inclusive).
// If end is null, generate 12 months from start.
function monthsInRange(start: string, end: string | null | undefined): string[] {
  const result: string[] = []
  const s = new Date(start + 'T00:00:00')
  const e = end
    ? new Date(end + 'T00:00:00')
    : new Date(s.getFullYear(), s.getMonth() + 12, 1)
  const cur = new Date(s.getFullYear(), s.getMonth(), 1)
  while (cur <= e) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    result.push(`${y}-${m}-01`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return result
}

async function upsertRetainerRows(maintenance: Maintenance) {
  const months = monthsInRange(maintenance.contract_start, maintenance.contract_end)
  const rows = months.map(month => ({
    maintenance_id: maintenance.id,
    project_id: null as string | null,
    month,
    planned_amount: maintenance.monthly_retainer,
    status: 'retainer' as const,
    probability: 100,
  }))
  // Upsert using maintenance_id + month as unique key
  const { error } = await supabase
    .from('revenue_planner')
    .upsert(rows, { onConflict: 'maintenance_id,month', ignoreDuplicates: false })
  if (error) throw error
}

interface MaintenancesState {
  maintenances: Maintenance[]
  loading: boolean
  error: string | null
  fetchAll: () => Promise<void>
  add: (data: Omit<Maintenance, 'id' | 'created_at' | 'client'>) => Promise<void>
  update: (id: string, data: Partial<Omit<Maintenance, 'id' | 'created_at' | 'client'>>) => Promise<void>
}

export const useMaintenancesStore = create<MaintenancesState>((set, get) => ({
  maintenances: [],
  loading: false,
  error: null,

  fetchAll: async () => {
    set({ loading: true, error: null })
    try {
      const { data, error } = await supabase
        .from('maintenances')
        .select('*, client:clients(id, name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      set({ maintenances: (data ?? []) as Maintenance[] })
    } catch (err) {
      set({ error: (err as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  add: async (data) => {
    const { data: inserted, error } = await supabase
      .from('maintenances')
      .insert(data)
      .select('*, client:clients(id, name)')
      .single()
    if (error) throw error
    await upsertRetainerRows(inserted as Maintenance)
    await get().fetchAll()
  },

  update: async (id, data) => {
    const { error } = await supabase
      .from('maintenances')
      .update(data)
      .eq('id', id)
    if (error) throw error
    // Re-fetch to get full record for retainer re-sync
    const { data: updated } = await supabase
      .from('maintenances')
      .select('*, client:clients(id, name)')
      .eq('id', id)
      .single()
    if (updated) await upsertRetainerRows(updated as Maintenance)
    await get().fetchAll()
  },
}))
```

> **Note on upsert conflict:** The `onConflict: 'maintenance_id,month'` requires a unique constraint on `(maintenance_id, month)` in the DB. Add this to the migration:
> ```sql
> CREATE UNIQUE INDEX IF NOT EXISTS revenue_planner_maintenance_month
>   ON revenue_planner(maintenance_id, month)
>   WHERE maintenance_id IS NOT NULL;
> ```
> Run this in Supabase SQL Editor if not already in the migration.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/stores/maintenances.ts
git commit -m "feat: add maintenances store with retainer sync"
```

---

## Chunk 3: View

### Task 4: Create MaintenancesView

**Files:**
- Create: `src/views/MaintenancesView.tsx`

Follow the pattern of `src/views/InfrastructureView.tsx` — stats strip, table, add/edit modal.

- [ ] **Step 1: Create `src/views/MaintenancesView.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useMaintenancesStore } from '../stores/maintenances'
import { useClientsStore } from '../stores/clients'
import { toast } from '../lib/toast'
import type { Maintenance } from '../lib/types'

function fmtEuro(n: number) {
  return '€' + n.toLocaleString('en-EU')
}
function fmtDate(d?: string | null) {
  if (!d) return 'Open-ended'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function daysUntil(d: string) {
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
}

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green',
  paused: 'badge-amber',
  cancelled: 'badge-red',
}

function Modal({ open, title, onClose, children, footer }: {
  open: boolean; title: string
  onClose: () => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

interface FormState {
  client_id: string
  name: string
  monthly_retainer: string
  help_requests_included: string
  hours_included: string
  contract_start: string
  contract_end: string
  status: 'active' | 'paused' | 'cancelled'
  notes: string
}

const EMPTY_FORM: FormState = {
  client_id: '', name: '', monthly_retainer: '',
  help_requests_included: '', hours_included: '',
  contract_start: '', contract_end: '',
  status: 'active', notes: '',
}

export function MaintenancesView() {
  const store = useMaintenancesStore()
  const cStore = useClientsStore()

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Maintenance | null>(null)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    store.fetchAll()
    cStore.fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const active = store.maintenances.filter(m => m.status === 'active')
  const totalMonthly = active.reduce((s, m) => s + m.monthly_retainer, 0)
  const totalHours = active.reduce((s, m) => s + m.hours_included, 0)
  const expiringSoon = store.maintenances.filter(m =>
    m.status === 'active' && m.contract_end && daysUntil(m.contract_end) <= 30
  ).length

  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setShowModal(true)
  }

  function openEdit(m: Maintenance) {
    setEditing(m)
    setForm({
      client_id: m.client_id,
      name: m.name,
      monthly_retainer: String(m.monthly_retainer),
      help_requests_included: String(m.help_requests_included),
      hours_included: String(m.hours_included),
      contract_start: m.contract_start.slice(0, 7),
      contract_end: m.contract_end ? m.contract_end.slice(0, 7) : '',
      status: m.status,
      notes: m.notes ?? '',
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm({ ...EMPTY_FORM })
  }

  async function save() {
    if (!form.client_id || !form.name || !form.monthly_retainer || !form.contract_start) return
    setSaving(true)
    try {
      const payload = {
        client_id: form.client_id,
        name: form.name.trim(),
        monthly_retainer: Number(form.monthly_retainer),
        help_requests_included: Number(form.help_requests_included) || 0,
        hours_included: Number(form.hours_included) || 0,
        contract_start: form.contract_start + '-01',
        contract_end: form.contract_end ? form.contract_end + '-01' : null,
        status: form.status,
        notes: form.notes.trim() || null,
      }
      if (editing) {
        await store.update(editing.id, payload)
        toast('success', 'Maintenance contract updated')
      } else {
        await store.add(payload)
        toast('success', 'Maintenance contract added')
      }
      closeModal()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const f = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }))

  return (
    <div>
      <Modal
        open={showModal}
        title={editing ? 'Edit Maintenance Contract' : 'New Maintenance Contract'}
        onClose={closeModal}
        footer={
          <>
            <button className="btn btn-secondary btn-sm" onClick={closeModal}>Cancel</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={save}
              disabled={saving || !form.client_id || !form.name || !form.monthly_retainer || !form.contract_start}
            >
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create contract'}
            </button>
          </>
        }
      >
        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label">Client</label>
            <select value={form.client_id} onChange={f('client_id')}>
              <option value="">Select client…</option>
              {cStore.clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select value={form.status} onChange={f('status')}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label className="form-label">Contract name</label>
          <input
            value={form.name}
            onChange={f('name')}
            placeholder="e.g. Website Support"
            autoFocus={!editing}
          />
        </div>

        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label">Monthly retainer (€)</label>
            <input type="number" value={form.monthly_retainer} onChange={f('monthly_retainer')} placeholder="500" />
          </div>
          <div className="form-group">
            <label className="form-label">Help requests / mo</label>
            <input type="number" value={form.help_requests_included} onChange={f('help_requests_included')} placeholder="5" />
          </div>
          <div className="form-group">
            <label className="form-label">Hours / mo</label>
            <input type="number" step="0.5" value={form.hours_included} onChange={f('hours_included')} placeholder="4" />
          </div>
        </div>

        <div className="form-row" style={{ marginBottom: 14 }}>
          <div className="form-group">
            <label className="form-label">Contract start</label>
            <input type="month" value={form.contract_start} onChange={f('contract_start')} />
          </div>
          <div className="form-group">
            <label className="form-label">
              Contract end
              <span className="form-hint" style={{ display: 'inline', marginLeft: 6 }}>optional</span>
            </label>
            <input type="month" value={form.contract_end} onChange={f('contract_end')} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Notes <span className="form-hint" style={{ display: 'inline', marginLeft: 6 }}>optional</span></label>
          <textarea
            value={form.notes}
            onChange={f('notes')}
            rows={2}
            placeholder="Any additional notes…"
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
      </Modal>

      <div className="page-header">
        <div>
          <h1>Maintenances</h1>
          <p style={{ color: 'var(--c3)', fontSize: 13, margin: 0 }}>Technical support retainer contracts</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ New Contract</button>
      </div>

      <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="stat-card" style={{ '--left-color': 'var(--navy)' } as React.CSSProperties}>
          <div className="stat-card-label">ACTIVE CONTRACTS</div>
          <div className="stat-card-value">{active.length}</div>
          <div className="stat-card-sub">{store.maintenances.length} total</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--green)' } as React.CSSProperties}>
          <div className="stat-card-label">MONTHLY RETAINER</div>
          <div className="stat-card-value" style={{ color: 'var(--green)' }}>{fmtEuro(totalMonthly)}</div>
          <div className="stat-card-sub">active contracts</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--blue)' } as React.CSSProperties}>
          <div className="stat-card-label">HOURS INCLUDED / MO</div>
          <div className="stat-card-value">{totalHours}h</div>
          <div className="stat-card-sub">across active contracts</div>
        </div>
        <div className="stat-card" style={{ '--left-color': expiringSoon > 0 ? 'var(--amber)' : 'var(--c4)' } as React.CSSProperties}>
          <div className="stat-card-label">EXPIRING SOON</div>
          <div className="stat-card-value" style={{ color: expiringSoon > 0 ? 'var(--amber)' : undefined }}>
            {expiringSoon}
          </div>
          <div className="stat-card-sub">within 30 days</div>
        </div>
      </div>

      <div className="page-content">
        <div className="section-bar" style={{ marginBottom: 10 }}>
          <h2>Contracts</h2>
          <button className="btn btn-primary btn-sm" onClick={openAdd}>+ New Contract</button>
        </div>
        <div className="card">
          {store.loading ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>Loading…</div>
          ) : store.maintenances.length === 0 ? (
            <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
              No maintenance contracts yet.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>CLIENT</th>
                  <th>CONTRACT</th>
                  <th className="th-right">RETAINER / MO</th>
                  <th className="th-right">REQUESTS / MO</th>
                  <th className="th-right">HOURS / MO</th>
                  <th>START</th>
                  <th>END</th>
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {store.maintenances.map((m: Maintenance) => {
                  const expiring = m.contract_end && m.status === 'active' && daysUntil(m.contract_end) <= 30
                  return (
                    <tr key={m.id}>
                      <td style={{ fontSize: 13, color: 'var(--c1)', fontWeight: 600 }}>
                        {m.client?.name ?? '—'}
                      </td>
                      <td style={{ fontWeight: 700 }}>{m.name}</td>
                      <td className="td-right text-mono" style={{ fontWeight: 600, color: 'var(--green)' }}>
                        {fmtEuro(m.monthly_retainer)}
                      </td>
                      <td className="td-right text-mono" style={{ color: 'var(--c2)' }}>
                        {m.help_requests_included}
                      </td>
                      <td className="td-right text-mono" style={{ color: 'var(--c2)' }}>
                        {m.hours_included}h
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--c3)' }}>
                        {fmtDate(m.contract_start)}
                      </td>
                      <td style={{ fontSize: 13, color: expiring ? 'var(--amber)' : 'var(--c3)', fontWeight: expiring ? 700 : 400 }}>
                        {fmtDate(m.contract_end)}
                      </td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[m.status] ?? 'badge-gray'}`}>
                          {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-secondary btn-xs" onClick={() => openEdit(m)}>Edit</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/MaintenancesView.tsx
git commit -m "feat: add MaintenancesView"
```

---

## Chunk 4: Routing & Navigation

### Task 5: Wire up route and sidebar

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Add import and route in `src/App.tsx`**

Add import near the other view imports:
```typescript
import { MaintenancesView } from './views/MaintenancesView'
```

Add route inside the inner `<Routes>`, after the projects routes:
```tsx
<Route path="/maintenances" element={<MaintenancesView />} />
```

- [ ] **Step 2: Add sidebar nav item in `src/components/layout/Sidebar.tsx`**

Add a wrench/tool icon function at the top with the other icon functions:
```typescript
function IconWrench() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
    </svg>
  )
}
```

Add nav link after the Projects link (inside the "Clients & Projects" group):
```tsx
<NavLink to="/maintenances" className={nav}><IconWrench /> Maintenances</NavLink>
```

- [ ] **Step 3: Type-check and verify dev server**

```bash
npx tsc --noEmit
```

Open http://localhost:5173/maintenances — should render the empty state page with stats strip.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components/layout/Sidebar.tsx
git commit -m "feat: add /maintenances route and sidebar link"
```

---

## Final Check

- [ ] Run `npx tsc --noEmit` — must pass with zero errors
- [ ] Open the app, navigate to Maintenances, add a contract
- [ ] Confirm retainer rows appear in Supabase `revenue_planner` table for the contract months
- [ ] Confirm the contract appears in the list with correct stats in the strip
