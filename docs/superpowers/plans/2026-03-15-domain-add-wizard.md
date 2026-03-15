# Domain Add Wizard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the "Add Client Domains" modal into a 2-step wizard that adds a New/Renewal toggle per domain row, optional inline invoice planning, and a post-save email copy panel (Siel order + accounting).

**Architecture:** All changes are confined to `DomainsView.tsx` (UI + wizard state) and `stores/domains.ts` (return inserted IDs). The wizard is two logical "screens" rendered inside the existing `Modal` component — Step 1 is the current form extended, Step 2 replaces modal content after save. No new files needed.

**Tech Stack:** React 19, TypeScript strict, Zustand v5, Supabase JS, custom CSS design system

---

## Chunk 1: Store change — addDomains returns inserted records

### Task 1: Update `addDomains` to return Domain[]

**Files:**
- Modify: `src/stores/domains.ts`

- [ ] **Step 1: Update the `DomainState` interface signature**

In `src/stores/domains.ts`, change the `addDomains` signature from returning `Promise<void>` to `Promise<Domain[]>`:

```ts
addDomains: (
  clientId: string,
  projectPn: string,
  entries: { domain_name: string; expiry_date: string; yearly_amount?: number; contract_id?: string; accounting_email?: boolean }[]
) => Promise<Domain[]>
```

- [ ] **Step 2: Update the implementation to use `.select()` and return records**

Replace the `addDomains` implementation body:

```ts
addDomains: async (clientId, projectPn, entries) => {
  const rows = entries.map(e => ({
    client_id: clientId,
    project_pn: projectPn,
    domain_name: e.domain_name,
    expiry_date: e.expiry_date,
    yearly_amount: e.yearly_amount ?? null,
    contract_id: e.contract_id ?? null,
    accounting_email: e.accounting_email ?? false,
    auto_renew: true,
  }))
  const { data, error } = await supabase
    .from('domains')
    .insert(rows)
    .select('*, client:clients(id, name)')
  if (error) throw error
  await get().fetchAll()
  return (data ?? []) as Domain[]
},
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/stores/domains.ts
git commit -m "feat: addDomains returns inserted Domain records"
```

---

## Chunk 2: Step 1 UI — New/Renewal toggle per domain row

### Task 2: Add `isRenewal` field to `DomainRow` and render the toggle

**Files:**
- Modify: `src/views/DomainsView.tsx` (the `DomainRow` interface and `DomainRowInputs` component)

- [ ] **Step 1: Extend the `DomainRow` interface**

Find this line near the top of `DomainsView.tsx`:
```ts
interface DomainRow { domain_name: string; expiry_date: string; yearly_amount: string }
```

Replace with:
```ts
interface DomainRow { domain_name: string; expiry_date: string; yearly_amount: string; isRenewal: boolean }
```

- [ ] **Step 2: Update `DomainRowInputs` default row, `add`, and `update` functions**

The `update` function currently accepts `v: string`. Since `isRenewal` is a boolean, update it to a generic. Leave `remove` unchanged.
```ts
function update<K extends keyof DomainRow>(i: number, f: K, v: DomainRow[K]) {
  onChange(rows.map((r, idx) => idx === i ? { ...r, [f]: v } : r))
}
function add() { onChange([...rows, { domain_name: '', expiry_date: '', yearly_amount: '', isRenewal: false }]) }
function remove(i: number) { onChange(rows.filter((_, idx) => idx !== i)) }
```

- [ ] **Step 3: Update the grid layout and add the toggle column**

Replace the grid inside `DomainRowInputs`. Change the header row:
```tsx
<div style={{display:'grid',gridTemplateColumns:'1fr 130px 80px 110px 28px',gap:'4px 8px',marginBottom:4}}>
  <span className="form-label">Domain</span>
  <span className="form-label">Expiry date</span>
  <span className="form-label">€ / year</span>
  <span className="form-label">Type</span>
  <span></span>
</div>
```

And each data row:
```tsx
<div key={i} style={{display:'grid',gridTemplateColumns:'1fr 130px 80px 110px 28px',gap:'6px 8px',alignItems:'center',marginBottom:8}}>
  <input value={row.domain_name}    onChange={e => update(i,'domain_name',e.target.value)}    placeholder="example.si" />
  <input type="date" value={row.expiry_date}   onChange={e => update(i,'expiry_date',e.target.value)} />
  <input type="number" value={row.yearly_amount} onChange={e => update(i,'yearly_amount',e.target.value)} placeholder="25" />
  <div style={{display:'flex',border:'1px solid var(--c6)',borderRadius:6,overflow:'hidden',height:36}}>
    <button
      type="button"
      onClick={() => update(i,'isRenewal',false)}
      style={{
        flex:1,fontSize:11,fontWeight:700,border:'none',cursor:'pointer',
        background: !row.isRenewal ? 'var(--navy)' : '#fff',
        color: !row.isRenewal ? '#fff' : 'var(--c4)',
      }}>
      New
    </button>
    <button
      type="button"
      onClick={() => update(i,'isRenewal',true)}
      style={{
        flex:1,fontSize:11,fontWeight:700,border:'none',borderLeft:'1px solid var(--c6)',cursor:'pointer',
        background: row.isRenewal ? 'var(--amber)' : '#fff',
        color: row.isRenewal ? '#fff' : 'var(--c4)',
      }}>
      Renew
    </button>
  </div>
  <button onClick={() => remove(i)} disabled={rows.length === 1}
    style={{width:32,height:36,border:'1px solid var(--c6)',borderRadius:8,background:'#fff',cursor:'pointer',color:'var(--c4)',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
</div>
```

- [ ] **Step 4: Update `domainRows` initial state**

Find the `useState` for `domainRows` and update the default:
```ts
const [domainRows, setDomainRows] = useState<DomainRow[]>([{ domain_name: '', expiry_date: '', yearly_amount: '', isRenewal: false }])
```

And update `resetAddForm`:
```ts
setDomainRows([{ domain_name: '', expiry_date: '', yearly_amount: '', isRenewal: false }])
```

- [ ] **Step 5: Verify TypeScript and visual check**

```bash
npx tsc --noEmit
npm run dev
```

Open `localhost:5173/domains`, click "Add Client Domains". Each domain row should show a New/Renew toggle button. Toggling should switch the active highlight.

- [ ] **Step 6: Commit**

```bash
git add src/views/DomainsView.tsx
git commit -m "feat: add New/Renewal toggle per domain row in add modal"
```

---

## Chunk 3: Step 1 UI — Invoice planning section

### Task 3: Add invoice planning state and UI to the add modal

**Files:**
- Modify: `src/views/DomainsView.tsx`

- [ ] **Step 1: Add invoice planning state variables**

Add these new `useState` declarations alongside the existing add-form state (near lines 152–158):

```ts
const [invoicePlanMonth, setInvoicePlanMonth]   = useState('')
const [invoicePlanStatus, setInvoicePlanStatus] = useState<'planned' | 'issued' | null>(null)
```

- [ ] **Step 2: Add `invoicePlanMonth` to `resetAddForm`**

```ts
function resetAddForm() {
  setClientId(''); setProjectPn(''); setContractId('')
  setNewClientName(''); setShowNewClient(false)
  setDomainRows([{ domain_name: '', expiry_date: '', yearly_amount: '', isRenewal: false }])
  setDomainError(null)
  setInvoicePlanMonth('')
  setInvoicePlanStatus(null)
}
```

- [ ] **Step 3: Render the invoice planning section inside the Add modal**

After the `<DomainRowInputs ... />` line and before the closing `</Modal>` children, add:

```tsx
{/* Invoice planning */}
<div style={{borderTop:'1px solid var(--c6)',paddingTop:14,marginTop:14}}>
  <p style={{margin:'0 0 10px',fontWeight:700,fontSize:13,color:'var(--c0)'}}>
    📅 Invoice planning <span style={{fontWeight:400,fontSize:11,color:'var(--c4)'}}>— optional</span>
  </p>
  <div style={{display:'flex',alignItems:'flex-end',gap:12,flexWrap:'wrap'}}>
    <div className="form-group" style={{marginBottom:0,minWidth:160}}>
      <label className="form-label">Invoice month</label>
      <input
        type="month"
        value={invoicePlanMonth}
        onChange={e => {
          setInvoicePlanMonth(e.target.value)
          if (!invoicePlanStatus) setInvoicePlanStatus('planned')
        }}
      />
    </div>
    {invoicePlanMonth && (
      <div className="form-group" style={{marginBottom:0}}>
        <label className="form-label">Status</label>
        <div style={{display:'flex',gap:6}}>
          <button
            type="button"
            onClick={() => setInvoicePlanStatus('planned')}
            className={`btn btn-sm${invoicePlanStatus === 'planned' ? ' btn-primary' : ' btn-secondary'}`}>
            Plan
          </button>
          <button
            type="button"
            onClick={() => setInvoicePlanStatus('issued')}
            className={`btn btn-sm${invoicePlanStatus === 'issued' ? ' btn-primary' : ' btn-secondary'}`}
            style={invoicePlanStatus === 'issued' ? {background:'var(--green)',borderColor:'var(--green)'} : {}}>
            Already billed
          </button>
        </div>
      </div>
    )}
  </div>
  {!invoicePlanMonth && (
    <p style={{margin:'8px 0 0',fontSize:11,color:'var(--c4)'}}>
      Leave empty to skip — you can invoice from the table later.
    </p>
  )}
</div>
```

- [ ] **Step 4: Verify TypeScript and visual check**

```bash
npx tsc --noEmit
```

In the browser, the invoice planning section should appear below the domain rows. Setting a month should reveal the Plan / Already billed buttons.

- [ ] **Step 5: Commit**

```bash
git add src/views/DomainsView.tsx
git commit -m "feat: invoice planning section in add domains modal"
```

---

## Chunk 4: Wizard state + save logic

### Task 4: Add wizard step state and update handleSave to create revenue_planner rows

**Files:**
- Modify: `src/views/DomainsView.tsx`

- [ ] **Step 1: Add wizard state variables**

```ts
const [wizardStep, setWizardStep]           = useState<1 | 2>(1)
const [savedDomains, setSavedDomains]       = useState<Domain[]>([])
const [invoicePlanned, setInvoicePlanned]   = useState(false)
```

- [ ] **Step 2: Add a helper to format date for accounting email**

Add this near the top helpers section in `DomainsView.tsx`:

```ts
function fmtSloDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  return `${dt.getDate()}. ${dt.getMonth() + 1}. ${dt.getFullYear()}`
}
```

- [ ] **Step 3: Update `handleSave` to accept a `goToStep2` flag and create revenue_planner rows**

Replace the existing `handleSave` function entirely:

```ts
async function handleSave(keepOpen = false) {
  const valid = domainRows.filter(r => r.domain_name && r.expiry_date)
  if (!clientId && !showNewClient) { setDomainError('Select or create a client'); return }
  if (showNewClient && !newClientName.trim()) { setDomainError('Enter a client name'); return }
  if (valid.length === 0) { setDomainError('Add at least one domain with a name and expiry date'); return }
  setDomainError(null)
  setSaving(true)
  // Capture form state before any awaits (prevents async narrowing issues and survives resetAddForm)
  const planMonth  = invoicePlanMonth
  const planStatus = invoicePlanStatus
  try {
    let resolvedClientId = clientId
    if (showNewClient) {
      const { data: newClient, error: ce } = await supabase
        .from('clients').insert({ name: newClientName.trim() }).select('id').single()
      if (ce) throw ce
      resolvedClientId = newClient.id
      await cStore.fetchAll()
    }

    // Snapshot form rows so Step 2 can use isRenewal after resetAddForm clears domainRows
    setDomainRowsSnapshot([...valid])
    setInvoicePlanMonthSnap(planMonth)
    setInvoicePlanStatusSnap(planStatus)

    const inserted = await store.addDomains(resolvedClientId, projectPn, valid.map(r => ({
      domain_name:   r.domain_name,
      expiry_date:   r.expiry_date,
      yearly_amount: r.yearly_amount ? parseFloat(r.yearly_amount) : undefined,
      contract_id:   contractId || undefined,
    })))

    // Insert revenue_planner rows if invoice month was set
    let invoiceSuccess = false
    if (planMonth && planStatus) {
      try {
        const planRows = inserted.map(d => ({
          domain_id:      d.id,
          month:          planMonth + '-01',
          planned_amount: d.yearly_amount ?? null,
          actual_amount:  null,
          status:         planStatus,   // narrowed local const — not the state var
          probability:    100,
          notes:          null,
        }))
        const { error: pe } = await supabase.from('revenue_planner').insert(planRows)
        if (pe) throw pe
        setBilledDomainIds(prev => new Set([...prev, ...inserted.map(d => d.id)]))
        invoiceSuccess = true
      } catch (err) {
        toast('error', 'Domains saved but invoice planning failed: ' + (err as Error).message)
      }
    }

    toast('success', `${inserted.length} domain${inserted.length > 1 ? 's' : ''} added`)

    if (keepOpen) {
      resetAddForm()
    } else {
      // Go to Step 2
      setSavedDomains(inserted)
      setInvoicePlanned(invoiceSuccess && !!planMonth)
      setWizardStep(2)
      resetAddForm()
    }
  } catch (err) {
    toast('error', (err as Error).message)
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 4: Add a `closeWizard` helper**

```ts
function closeWizard() {
  setShowAdd(false)
  setWizardStep(1)
  setSavedDomains([])
  setInvoicePlanned(false)
  resetAddForm()
}
```

- [ ] **Step 5: Update the modal's `onClose` handler**

Find `<Modal open={showAdd} ...` and update its `onClose`:
```tsx
<Modal open={showAdd} title={wizardStep === 1 ? 'Add Client Domains' : 'Next steps'} onClose={closeWizard}
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/views/DomainsView.tsx
git commit -m "feat: wizard save logic with revenue_planner row creation"
```

---

## Chunk 5: Step 2 UI — email copy panel

### Task 5: Render Step 2 inside the modal

**Files:**
- Modify: `src/views/DomainsView.tsx`

- [ ] **Step 1: Add payment days state**

```ts
const [paymentDays, setPaymentDays] = useState(30)
```

Reset it in `closeWizard`:
```ts
setPaymentDays(30)
```

- [ ] **Step 2: Add snapshot state variable declarations**

These three state vars must exist before `handleSave` can call their setters (already included in Chunk 4 Step 3). Declare them with the other add-form state vars:

```ts
const [domainRowsSnapshot, setDomainRowsSnapshot]       = useState<DomainRow[]>([])
const [invoicePlanMonthSnap, setInvoicePlanMonthSnap]   = useState('')
const [invoicePlanStatusSnap, setInvoicePlanStatusSnap] = useState<'planned' | 'issued' | null>(null)
```

Add resets to `closeWizard`:
```ts
setDomainRowsSnapshot([])
setInvoicePlanMonthSnap('')
setInvoicePlanStatusSnap(null)
```

- [ ] **Step 3: Add email generation helpers**

Add these two functions inside `DomainsView` (after the other helpers, before the return):

```ts
function buildSielEmail() {
  const names = savedDomains.map(d => `- ${d.domain_name}`).join('\n')
  return `Pozdravljeni,\n\nprosimo vas, da registrirate naslednje domene:\n\n${names}\n\nHvala in lep pozdrav,\nRenderspace`
}

function buildAccountingEmail() {
  const today = new Date()
  const dateStr = `${today.getDate()}. ${today.getMonth() + 1}. ${today.getFullYear()}`
  const header = `Stranka: ${savedDomains[0]?.client?.name ?? '—'}\nDatum storitve: ${dateStr}\nRok plačila: ${paymentDays} dni`
  const lines = savedDomains.map(d => {
    const verb = (domainRowsSnapshot.find(r => r.domain_name === d.domain_name)?.isRenewal)
      ? 'Podaljšanje' : 'Zakup'
    const expiry = fmtSloDate(d.expiry_date)
    const amount = d.yearly_amount != null ? ` — ${d.yearly_amount} EUR` : ''
    return `${d.project_pn} — ${verb} domene ${d.domain_name} za 1 leto (velja do ${expiry})${amount}`
  }).join('\n')
  return `${header}\n\n${lines}`
}
```

- [ ] **Step 4: Add copy-to-clipboard helper**

```ts
function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text).then(() => toast('success', `${label} copied`))
}
```

- [ ] **Step 5: Add Step 2 render inside the add modal**

The modal currently renders Step 1 form content unconditionally. Wrap it in a condition and add Step 2:

```tsx
<Modal open={showAdd} title={wizardStep === 1 ? 'Add Client Domains' : 'Next steps'} onClose={closeWizard}
  footer={
    wizardStep === 1 ? (
      <>
        <button className="btn btn-secondary btn-sm" onClick={() => { setShowAdd(false); resetAddForm() }}>Cancel</button>
        <button className="btn btn-secondary btn-sm" onClick={() => handleSave(true)} disabled={saving}>Save &amp; add new</button>
        <button className="btn btn-primary btn-sm" onClick={() => handleSave(false)} disabled={saving}>
          {saving ? <span className="spinner"/> : null} Save › Next step
        </button>
      </>
    ) : (
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',width:'100%'}}>
        <span style={{fontSize:12,color:'var(--c4)'}}>Kopirajte kar potrebujete, nato zaprite</span>
        <button className="btn btn-primary btn-sm" onClick={closeWizard}>Done</button>
      </div>
    )
  }>

  {wizardStep === 1 ? (
    <>
      {domainError && <div className="alert alert-red" style={{marginBottom:12}}>{domainError}</div>}

      {/* Client */}
      <div className="form-group" style={{marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
          <label className="form-label" style={{marginBottom:0}}>Client</label>
          <button type="button" onClick={() => { setShowNewClient(!showNewClient); setClientId('') }}
            style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'var(--navy)',fontWeight:600,padding:0,fontFamily:'inherit'}}>
            {showNewClient ? '← Pick existing' : '+ New client'}
          </button>
        </div>
        {showNewClient ? (
          <input placeholder="Enter new client name" value={newClientName} onChange={e => setNewClientName(e.target.value)} autoFocus />
        ) : (
          <Select
            value={clientId}
            onChange={setClientId}
            placeholder="Select client"
            options={cStore.clients.map(c => ({ value: c.id, label: c.name }))}
          />
        )}
      </div>

      {/* Project # + Contract ID */}
      <div className="form-row" style={{marginBottom:14}}>
        <div className="form-group">
          <label className="form-label">Project #</label>
          <input placeholder="e.g. 1159" value={projectPn} onChange={e => setProjectPn(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Contract / Order ID <span className="form-hint" style={{display:'inline'}}>optional</span></label>
          <input placeholder="e.g. PO-2026-042" value={contractId} onChange={e => setContractId(e.target.value)} />
        </div>
      </div>

      {/* Domains */}
      <div style={{borderTop:'1px solid var(--c6)',paddingTop:14}}>
        <p style={{margin:'0 0 10px',fontWeight:700,fontSize:15,color:'var(--c0)'}}>Domains</p>
        <DomainRowInputs rows={domainRows} onChange={setDomainRows} />
      </div>

      {/* Invoice planning */}
      <div style={{borderTop:'1px solid var(--c6)',paddingTop:14,marginTop:14}}>
        <p style={{margin:'0 0 10px',fontWeight:700,fontSize:13,color:'var(--c0)'}}>
          📅 Invoice planning <span style={{fontWeight:400,fontSize:11,color:'var(--c4)'}}>— optional</span>
        </p>
        <div style={{display:'flex',alignItems:'flex-end',gap:12,flexWrap:'wrap'}}>
          <div className="form-group" style={{marginBottom:0,minWidth:160}}>
            <label className="form-label">Invoice month</label>
            <input
              type="month"
              value={invoicePlanMonth}
              onChange={e => {
                setInvoicePlanMonth(e.target.value)
                if (!invoicePlanStatus) setInvoicePlanStatus('planned')
              }}
            />
          </div>
          {invoicePlanMonth && (
            <div className="form-group" style={{marginBottom:0}}>
              <label className="form-label">Status</label>
              <div style={{display:'flex',gap:6}}>
                <button type="button" onClick={() => setInvoicePlanStatus('planned')}
                  className={`btn btn-sm${invoicePlanStatus === 'planned' ? ' btn-primary' : ' btn-secondary'}`}>
                  Plan
                </button>
                <button type="button" onClick={() => setInvoicePlanStatus('issued')}
                  className={`btn btn-sm${invoicePlanStatus === 'issued' ? ' btn-primary' : ' btn-secondary'}`}
                  style={invoicePlanStatus === 'issued' ? {background:'var(--green)',borderColor:'var(--green)'} : {}}>
                  Already billed
                </button>
              </div>
            </div>
          )}
        </div>
        {!invoicePlanMonth && (
          <p style={{margin:'8px 0 0',fontSize:11,color:'var(--c4)'}}>
            Leave empty to skip — you can invoice from the table later.
          </p>
        )}
      </div>
    </>
  ) : (
    <Step2Panel
      savedDomains={savedDomains}
      invoicePlanned={invoicePlanned}
      invoicePlanMonth={invoicePlanMonthSnap}
      invoicePlanStatus={invoicePlanStatusSnap}
      paymentDays={paymentDays}
      onPaymentDaysChange={setPaymentDays}
      sielEmail={buildSielEmail()}
      accountingEmail={buildAccountingEmail()}
      onCopy={copyText}
    />
  )}
</Modal>
```

- [ ] **Step 6: Implement Step2Panel as a local component**

Add this component near the top of the file (with the other local components like `DomainRowInputs` and `Modal`):

```tsx
function Step2Panel({
  savedDomains, invoicePlanned, invoicePlanMonth, invoicePlanStatus,
  paymentDays, onPaymentDaysChange, sielEmail, accountingEmail, onCopy
}: {
  savedDomains: Domain[]
  invoicePlanned: boolean
  invoicePlanMonth: string
  invoicePlanStatus: 'planned' | 'issued' | null
  paymentDays: number
  onPaymentDaysChange: (n: number) => void
  sielEmail: string
  accountingEmail: string
  onCopy: (text: string, label: string) => void
}) {
  const domainNames = savedDomains.map(d => d.domain_name).join(', ')
  const monthLabel = invoicePlanMonth
    ? new Date(invoicePlanMonth + '-01T00:00:00').toLocaleString('en', { month: 'long', year: 'numeric' })
    : ''
  const statusLabel = invoicePlanStatus === 'issued' ? 'Already billed' : 'Planned'

  return (
    <div>
      {/* Step indicator */}
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
        <span style={{fontSize:12,color:'var(--c3)',background:'var(--c7)',padding:'3px 10px',borderRadius:20}}>Step 2 of 2</span>
      </div>

      {/* Success banner */}
      <div style={{display:'flex',alignItems:'center',gap:10,background:'#e8f5e9',border:'1px solid #c8e6c9',borderRadius:8,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#2e7d32',fontWeight:600}}>
        <span>✓</span>
        <span>{savedDomains.length} domain{savedDomains.length > 1 ? 's' : ''} saved — {domainNames}</span>
        {invoicePlanned && (
          <span className="badge badge-green" style={{marginLeft:'auto'}}>{statusLabel}: {monthLabel}</span>
        )}
      </div>

      {/* Invoice summary */}
      {invoicePlanned && (
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',background:'#f0f4ff',border:'1px solid #d0d8f0',borderRadius:8,marginBottom:14,fontSize:13}}>
          {'📅'} <span>Dodano v plan računov za <strong>{monthLabel}</strong> · {fmtEur(savedDomains.reduce((s, d) => s + (d.yearly_amount ?? 0), 0))} · <strong>{statusLabel}</strong></span>
        </div>
      )}

      {/* Siel email */}
      <div style={{border:'1px solid var(--c6)',borderRadius:8,marginBottom:12,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'var(--c7)',borderBottom:'1px solid var(--c6)'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--c3)'}}>Naročilo — Siel</div>
            <div style={{fontSize:12,color:'var(--c1)',fontWeight:600}}>registrar@siel.si</div>
          </div>
          <button className="btn btn-secondary btn-xs" onClick={() => onCopy(sielEmail, 'Siel email')}>Copy</button>
        </div>
        <pre style={{margin:0,padding:'12px 14px',fontSize:12,lineHeight:1.7,color:'var(--c1)',fontFamily:'inherit',whiteSpace:'pre-wrap',background:'#fff'}}>{sielEmail}</pre>
      </div>

      {/* Accounting email */}
      <div style={{border:'1px solid var(--c6)',borderRadius:8,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'var(--c7)',borderBottom:'1px solid var(--c6)'}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px',color:'var(--c3)'}}>Obvestilo — računovodstvo</div>
            <div style={{fontSize:12,color:'var(--c1)',fontWeight:600}}>fakturiranje@pristop.si</div>
          </div>
          <button className="btn btn-secondary btn-xs" onClick={() => onCopy(accountingEmail, 'Accounting email')}>Copy</button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderBottom:'1px solid var(--c6)',background:'#fafbfd'}}>
          <span style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.4px',color:'var(--c3)'}}>Rok plačila (dni):</span>
          <input
            type="number"
            value={paymentDays}
            onChange={e => onPaymentDaysChange(Number(e.target.value) || 30)}
            style={{width:60,height:28,textAlign:'center',fontSize:13,fontWeight:600}}
          />
          <span style={{fontSize:11,color:'var(--c4)'}}>— spremenite pred kopiranjem</span>
        </div>
        <pre style={{margin:0,padding:'12px 14px',fontSize:12,lineHeight:1.7,color:'var(--c1)',fontFamily:'inherit',whiteSpace:'pre-wrap',background:'#fff'}}>{accountingEmail}</pre>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verify TypeScript compiles clean**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Manual end-to-end test**

Start dev server: `npm run dev`

Test flow:
1. Open Domains → Add Client Domains
2. Select client, enter project #, add two domains (one New, one Renew), set invoice month, click "Plan"
3. Click "Save › Next step" — modal should switch to Step 2
4. Verify: success banner shows both domain names + "Planned: [month]"
5. Invoice summary row should appear
6. Copy Siel email — paste and verify Slovenian text with both domains
7. Change payment days to 14 — verify accounting email body updates
8. Copy accounting email — verify Zakup / Podaljšanje per toggle, correct expiry dates
9. Click Done — modal closes
10. In the domains table, both domains should have "Billed" badge in the Billing column

Also test "Save & add new": domains saved, form resets, no Step 2.

- [ ] **Step 9: Commit**

```bash
git add src/views/DomainsView.tsx
git commit -m "feat: domain add wizard Step 2 email copy panel"
```

---

## Chunk 6: Polish and .gitignore

### Task 6: Cleanup

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add `.superpowers/` to .gitignore if not already there**

```bash
grep -q '.superpowers' .gitignore || echo '.superpowers/' >> .gitignore
```

- [ ] **Step 2: Final type check and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: no errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .superpowers brainstorm dir"
```
