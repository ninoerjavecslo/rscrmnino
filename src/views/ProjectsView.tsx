import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { useSettingsStore } from '../stores/settings'
import { supabase } from '../lib/supabase'
import type { Project } from '../lib/types'
import { OTHER_INCOME_PROJECT_NAME } from '../lib/types'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

const CURRENT_YEAR = new Date().getFullYear()

// Wide range: YEAR-1 through YEAR+2 to capture multi-year contracts
const ALL_MONTHS: string[] = []
for (let y = CURRENT_YEAR - 1; y <= CURRENT_YEAR + 2; y++) {
  for (let m = 1; m <= 12; m++) {
    ALL_MONTHS.push(`${y}-${String(m).padStart(2, '0')}-01`)
  }
}

function nextPn(projects: { pn: string }[]) {
  const year = CURRENT_YEAR
  const prefix = `RS-${year}-`
  const nums = projects
    .map(p => p.pn)
    .filter(pn => pn.startsWith(prefix))
    .map(pn => parseInt(pn.slice(prefix.length), 10))
    .filter(n => !isNaN(n))
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

const STATUS_BADGE: Record<string, 'green' | 'amber' | 'gray' | 'red'> = {
  active: 'green', paused: 'amber',
  completed: 'gray', cancelled: 'red'
}

const TYPE_BADGE: Record<string, 'blue' | 'amber' | 'green' | 'gray'> = {
  fixed: 'blue', maintenance: 'amber', variable: 'green', internal: 'gray'
}
const TYPE_LABEL: Record<string, string> = {
  fixed: 'Fixed', maintenance: 'Recurring', variable: 'Variable', internal: 'Internal'
}

// ── Type selector pills ───────────────────────────────────────────────────────

function TypePills({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const types = [
    { key: 'fixed',       label: 'Fixed',       sub: 'Known total',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> },
    { key: 'maintenance', label: 'Recurring',  sub: 'Monthly recurring',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg> },
    { key: 'variable',    label: 'Variable',      sub: 'Hourly / usage-based',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg> },
    { key: 'internal',    label: 'Internal',    sub: 'Non-billable',
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> },
  ]
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">Project type</div>
      <div className="flex gap-2">
        {types.map(t => (
          <div key={t.key} onClick={() => onChange(t.key)}
            style={{flex:1,border:`2px solid ${value===t.key?'var(--navy)':'var(--c6)'}`,borderRadius:'var(--r)',padding:'12px 10px',cursor:'pointer',background:value===t.key?'var(--navy-light)':'#fff',textAlign:'center',transition:'all .12s'}}>
            <div className="flex justify-center mb-1.5">{t.icon}</div>
            <div style={{fontWeight:700,fontSize:13,color:value===t.key?'var(--navy)':'var(--c1)'}}>{t.label}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

const EMPTY = { pn:'', name:'', client_id:'', type:'fixed', pm:'Nino', value:'', start_month:'', end_month:'', starting_from:'', probability:'50', num_months:'12', is_maintenance: false, cms: '' }

interface VarRow { month: string; amount: string; probability: string }

function buildVarRows(startMonth: string, endMonth: string, defaultAmount: string, defaultProb: string): VarRow[] {
  const [sy, sm] = startMonth.split('-').map(Number)
  const [ey, em] = endMonth.split('-').map(Number)
  const rows: VarRow[] = []
  let y = sy, m = sm
  while ((y < ey || (y === ey && m <= em)) && rows.length < 60) {
    rows.push({ month: `${y}-${String(m).padStart(2, '0')}`, amount: defaultAmount, probability: defaultProb })
    m++; if (m > 12) { m = 1; y++ }
  }
  return rows
}

export function ProjectsView() {
  const pStore = useProjectsStore()
  const cStore = useClientsStore()
  const rpStore = useRevenuePlannerStore()
  const crStore = useChangeRequestsStore()
  const settingsStore = useSettingsStore()
  const navigate = useNavigate()
  const pmOptions = settingsStore.projectManagers.map(m => ({ value: m, label: m }))
  const [showAdd, setShowAdd]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [form, setForm]               = useState({ ...EMPTY })
  const [newClientName, setNewClientName] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [varRows, setVarRows]         = useState<VarRow[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [deleting, setDeleting]       = useState(false)

  useEffect(() => { pStore.fetchAll(); cStore.fetchAll(); rpStore.fetchByMonths(ALL_MONTHS); crStore.fetchAllApproved(); settingsStore.fetch() }, [])

  function setF(k: string, v: string) {
    setForm(f => {
      const next = { ...f, [k]: v }
      if (next.type === 'variable' && next.start_month && next.end_month &&
          (k === 'start_month' || k === 'end_month' || k === 'type')) {
        setVarRows(buildVarRows(next.start_month, next.end_month, next.value, next.probability))
      }
      return next
    })
  }

  function handleClientChange(v: string) {
    if (v === '__new__') { setShowNewClient(true); setF('client_id', '') }
    else { setShowNewClient(false); setNewClientName(''); setF('client_id', v) }
  }

  function closeModal() { setShowAdd(false); setForm({ ...EMPTY }); setShowNewClient(false); setNewClientName(''); setVarRows([]) }

  function updateVarRow(i: number, field: 'amount' | 'probability', val: string) {
    setVarRows(rows => rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await pStore.remove(deleteTarget.id)
      setDeleteTarget(null)
    } catch (e) { alert((e as Error).message) }
    finally { setDeleting(false) }
  }

  async function handleCreate() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      let clientId = form.client_id || null
      if (showNewClient && newClientName.trim()) {
        const { data: nc, error: ce } = await supabase
          .from('clients').insert({ name: newClientName.trim() }).select('id').single()
        if (ce) throw ce
        clientId = nc.id
        await cStore.fetchAll()
      }

      const { data: proj, error: pe } = await supabase
        .from('projects')
        .insert({
          pn:             form.pn.trim() || nextPn(pStore.projects),
          name:           form.name.trim(),
          client_id:      clientId,
          type:           form.type,
          status:         'active',
          pm:             form.pm || null,
          contract_value: form.type === 'variable'
            ? (varRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0) || null)
            : form.value ? parseFloat(form.value) : null,
          initial_contract_value: form.type === 'maintenance' && form.value
            ? parseFloat(form.value) * Math.max(1, Math.min(60, parseInt(form.num_months) || 12))
            : form.type === 'variable'
              ? (varRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0) || null)
              : form.value ? parseFloat(form.value) : null,
          currency:       'EUR',
          start_date:     form.start_month ? form.start_month + '-01' : null,
          end_date:       form.end_month   ? form.end_month   + '-01' : null,
          notes:          null,
          is_maintenance: form.type !== 'internal' ? form.is_maintenance : false,
          cms:            form.cms.trim() || null,
        })
        .select('id').single()
      if (pe) throw pe

      // Auto-generate monthly invoice plan rows
      if (form.type === 'maintenance' && form.starting_from && form.value) {
        const numMonths = Math.max(1, Math.min(60, parseInt(form.num_months) || 12))
        const [y, m] = form.starting_from.split('-').map(Number)
        const rows = Array.from({ length: numMonths }, (_, i) => {
          const d = new Date(y, m - 1 + i, 1)
          return {
            project_id:     proj.id,
            month:          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
            planned_amount: parseFloat(form.value),
            actual_amount:  null,
            status:         'planned',
            probability:    100,
            notes:          form.name.trim() || null,
          }
        })
        const { error: re } = await supabase.from('revenue_planner').insert(rows)
        if (re) throw re
      } else if (form.type === 'variable' && varRows.length > 0) {
        const rows = varRows
          .filter(r => r.amount && parseFloat(r.amount) > 0)
          .map(r => ({
            project_id:     proj.id,
            month:          r.month + '-01',
            planned_amount: parseFloat(r.amount),
            actual_amount:  null,
            status:         'planned',
            probability:    Math.max(0, Math.min(100, parseInt(r.probability) || 50)),
            notes:          null,
          }))
        if (rows.length > 0) {
          const { error: re } = await supabase.from('revenue_planner').insert(rows)
          if (re) throw re
        }
      }

      await pStore.fetchAll()
      closeModal()
    } catch (e) { alert((e as Error).message) }
    finally { setSaving(false) }
  }

  const activeCount    = pStore.projects.filter(p => p.status === 'active').length
  const portfolioValue = pStore.projects
    .filter(p => p.status === 'active' && p.type !== 'internal')
    .reduce((sum, p) => {
      const isRecurring = p.type === 'maintenance' || p.type === 'variable'
      const regularRows = rpStore.rows.filter(r => r.project_id === p.id && !r.notes?.startsWith('CR:') && r.status !== 'cost')
      const crTotal = crStore.approvedCRs.filter(cr => cr.project_id === p.id).reduce((s, cr) => s + (cr.amount ?? 0), 0)
      const base = isRecurring
        ? regularRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
        : (p.initial_contract_value ?? p.contract_value ?? 0)
      return sum + base + crTotal
    }, 0)
  const invoicedYTD    = rpStore.rows.filter(r => r.project_id != null && r.hosting_client_id == null && r.maintenance_id == null && r.domain_id == null && r.status !== 'cost').reduce((s, r) => s + (r.actual_amount ?? 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Projects</h1>
          <p>Manage your project portfolio</p>
        </div>
        <Button size="sm" onClick={() => { setForm(f => ({ ...f, pn: nextPn(pStore.projects) })); setShowAdd(true) }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Project
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3 mb-4 px-6 pt-6">
        {[
          { label:'Total projects',  value:String(pStore.projects.length), sub:`${activeCount} active` },
          { label:'Portfolio value', value: portfolioValue ? `${portfolioValue.toLocaleString()} €` : '—', sub:'active contracts' },
          { label:'Invoiced YTD',    value: invoicedYTD ? `${invoicedYTD.toLocaleString(undefined,{maximumFractionDigits:0})} €` : '—', sub:'from invoices' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
            <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">{s.label}</div>
            <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {pStore.error && (
          <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c] mb-4">
            Failed to load projects. Please check your connection.
          </div>
        )}

        {(() => {
          const clientProjects = pStore.projects.filter((p: Project) => p.type !== 'internal')
          const internalProjects = pStore.projects.filter((p: Project) => p.type === 'internal')

          function ProjectRow({ p }: { p: Project }) {
            return (
              <tr key={p.id}>
                <td className="text-muted-foreground text-[11px] font-semibold whitespace-nowrap">{p.pn}</td>
                <td className="font-medium text-primary hover:underline cursor-pointer font-bold" onClick={() => navigate(`/projects/${p.id}`)}>
                  {p.name === OTHER_INCOME_PROJECT_NAME ? `${p.client?.name ?? 'Unknown'} — One time projects` : p.name}
                </td>
                <td className="text-sm text-muted-foreground" style={{cursor: p.client ? 'pointer' : 'default'}}
                  onClick={() => p.client && navigate(`/clients/${p.client!.id}`)}>{p.client?.name ?? '—'}</td>
                <td><Badge variant={TYPE_BADGE[p.type] ?? 'gray'}>{TYPE_LABEL[p.type] ?? p.type}</Badge></td>
                <td className="text-right font-semibold">
                  {(() => {
                    const isRecurring = p.type === 'maintenance' || p.type === 'variable'
                    const isOtherIncome = p.name === OTHER_INCOME_PROJECT_NAME
                    const regularRows = rpStore.rows.filter(r => r.project_id === p.id && !r.notes?.startsWith('CR:') && r.status !== 'cost')
                    const crTotal = crStore.approvedCRs.filter(cr => cr.project_id === p.id).reduce((s, cr) => s + (cr.amount ?? 0), 0)
                    const base = (isRecurring || isOtherIncome)
                      ? regularRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
                      : (p.initial_contract_value ?? p.contract_value ?? null)
                    const val = base != null ? base + crTotal : null
                    return val ? `${val.toLocaleString()} €` : <span className="text-muted-foreground">—</span>
                  })()}
                </td>
                <td className="text-sm text-[#374151]">{p.pm ?? <span className="text-muted-foreground">—</span>}</td>
                <td><Badge variant={STATUS_BADGE[p.status] ?? 'gray'}>{p.status.charAt(0).toUpperCase()+p.status.slice(1)}</Badge></td>
                <td className="whitespace-nowrap">
                  <Button variant="outline" size="xs" onClick={() => navigate(`/projects/${p.id}`)}>Edit</Button>
                  {' '}
                  <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeleteTarget(p)}>Delete</Button>
                </td>
              </tr>
            )
          }

          return (
            <>
              {!pStore.loading && clientProjects.length === 0 ? (
                <Card>
                  <div className="text-center py-14 px-5">
                    <div className="text-3xl mb-2">📁</div>
                    <div className="font-bold text-[15px] text-[#374151] mb-1">No projects yet</div>
                    <div className="text-sm mb-4">Create your first project</div>
                    <Button size="sm" onClick={() => setShowAdd(true)}>New Project</Button>
                  </div>
                </Card>
              ) : (
                <Card className="mb-4">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th><th>Project</th><th>Client</th><th>Type</th>
                        <th className="text-right">Value</th><th>PM</th><th>Status</th><th style={{width:60}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pStore.loading ? (
                        <tr><td colSpan={8} className="text-center text-muted-foreground" style={{padding:32}}>Loading…</td></tr>
                      ) : clientProjects.map((p: Project) => <ProjectRow key={p.id} p={p} />)}
                    </tbody>
                  </table>
                </Card>
              )}

              {internalProjects.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 mt-2">Internal Projects</div>
                  <Card>
                    <table>
                      <thead>
                        <tr>
                          <th>#</th><th>Project</th><th>Client</th><th>Type</th>
                          <th className="text-right">Value</th><th>PM</th><th>Status</th><th style={{width:60}}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {internalProjects.map((p: Project) => <ProjectRow key={p.id} p={p} />)}
                      </tbody>
                    </table>
                  </Card>
                </div>
              )}
            </>
          )
        })()}
      </div>

      <Modal open={showAdd} title="New Project" onClose={closeModal} maxWidth={form.type === 'variable' ? 680 : 560}
        footer={<>
          <Button variant="outline" size="sm" onClick={closeModal}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={saving || !form.name.trim()}>
            {saving ? <span className="spinner" style={{borderTopColor:'#fff'}}/> : null}
            Create project
          </Button>
        </>}
      >
        <TypePills value={form.type} onChange={v => setF('type', v)} />

        {form.type !== 'internal' && (
          <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_maintenance}
              onChange={e => setForm(f => ({ ...f, is_maintenance: e.target.checked }))}
              style={{ width: 15, height: 15, accentColor: 'var(--navy)' }}
            />
            <div>
              <div className="text-[13px] font-semibold">Is Maintenance</div>
              <div className="text-xs text-muted-foreground">Include this project in maintenance planning</div>
            </div>
          </label>
        )}

        <div className="grid grid-cols-2 gap-4 mb-3">
          <div className="mb-4" style={{maxWidth:160}}>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Project #</label>
            <input value={form.pn} onChange={e => setF('pn', e.target.value)} placeholder="RS-2026-001" className="font-mono" />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Project name</label>
            <input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="e.g. Petrol — Prenova" autoFocus />
          </div>
          {form.type !== 'internal' && (
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Client</label>
              <Select
                value={showNewClient ? '__new__' : form.client_id}
                onChange={handleClientChange}
                placeholder="— Select client —"
                options={[
                  ...cStore.clients.map(c => ({ value: c.id, label: c.name })),
                  { value: '__new__', label: '+ New client…' },
                ]}
              />
              {showNewClient && (
                <input className="mt-2" value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="New client name…" />
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-3">
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Project Manager</label>
            <Select
              value={form.pm}
              onChange={val => setF('pm', val)}
              options={pmOptions}
            />
          </div>
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">CMS / Technology</label>
            <Select
              value={form.cms}
              onChange={val => setF('cms', val)}
              placeholder="— None —"
              options={[{ value: '', label: '— None —' }, ...settingsStore.cmsOptions.map(c => ({ value: c, label: c }))]}
            />
          </div>
          {form.type !== 'variable' && form.type !== 'internal' && (
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
                {form.type === 'maintenance' ? 'Monthly amount (€)' : 'Project value (€)'}
              </label>
              <input type="number" value={form.value} onChange={e => setF('value', e.target.value)} placeholder={form.type === 'maintenance' ? '2000' : '45000'} />
            </div>
          )}
        </div>


        {form.type === 'maintenance' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Starting from</label>
                <input type="month" value={form.starting_from} onChange={e => setF('starting_from', e.target.value)} />
              </div>
              <div className="mb-4" style={{maxWidth:140}}>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Number of months</label>
                <input type="number" min="1" max="60" value={form.num_months} onChange={e => setF('num_months', e.target.value)} placeholder="12" />
              </div>
            </div>
            {form.value && form.num_months && (
              <div className="flex items-center gap-2 mb-2.5 px-3 py-2 bg-[var(--c7)] rounded">
                <span className="text-xs text-muted-foreground">Initial value:</span>
                <span className="text-sm font-bold text-primary">
                  {(parseFloat(form.value) * Math.max(1, Math.min(60, parseInt(form.num_months) || 12))).toLocaleString()} €
                </span>
                <span className="text-[11px] text-muted-foreground">({form.value} €/mo × {form.num_months} mo)</span>
              </div>
            )}
            <div className="info-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {form.num_months && form.starting_from
                ? `${form.num_months} monthly invoice plans will be created from ${form.starting_from}.`
                : 'Invoice plans will be auto-generated for each month.'}
            </div>
          </>
        )}

        {form.type === 'variable' && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Start month</label>
                <input type="month" value={form.start_month} onChange={e => setF('start_month', e.target.value)} />
              </div>
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">End month</label>
                <input type="month" value={form.end_month} onChange={e => setF('end_month', e.target.value)} />
              </div>
              <div className="mb-4" style={{maxWidth:140}}>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Default amount (€)</label>
                <input type="number" value={form.value} onChange={e => {
                  setF('value', e.target.value)
                  setVarRows(rows => rows.map(r => ({ ...r, amount: e.target.value })))
                }} placeholder="0" />
              </div>
              <div className="mb-4" style={{maxWidth:200}}>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Set all rows to</label>
                <div className="flex gap-1.5">
                  <select value={form.probability} onChange={e => setF('probability', e.target.value)}
                    style={{flex:1,height:42,border:'1px solid var(--c6)',borderRadius:10,padding:'0 10px',fontSize:14,background:'#fff',fontFamily:'inherit'}}>
                    <option value="25">25%</option>
                    <option value="50">50%</option>
                    <option value="100">100%</option>
                  </select>
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => setVarRows(rows => rows.map(r => ({ ...r, probability: form.probability })))}>
                    Apply
                  </Button>
                </div>
              </div>
            </div>
            {varRows.length > 0 && (
              <div className="mb-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Monthly plan</span>
                  <span className="text-xs text-muted-foreground">
                    {(() => {
                      const total = varRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
                      const weighted = varRows.reduce((s, r) => s + (parseFloat(r.amount) || 0) * (parseInt(r.probability) || 0) / 100, 0)
                      return total > 0 ? `Total ${total.toLocaleString()} € · Expected cash ${weighted.toLocaleString(undefined, {maximumFractionDigits:0})} €` : ''
                    })()}
                  </span>
                </div>
                <div style={{border:'1px solid var(--c6)',borderRadius:'var(--r)',overflow:'hidden'}}>
                  <table style={{width:'100%',borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{background:'var(--c7)',borderBottom:'1px solid var(--c6)'}}>
                        <th style={{padding:'8px 14px',fontWeight:600,fontSize:11,textAlign:'left',color:'var(--c3)'}}>MONTH</th>
                        <th style={{padding:'8px 14px',fontWeight:600,fontSize:11,textAlign:'right',color:'var(--c3)'}}>AMOUNT (€)</th>
                        <th style={{padding:'8px 14px',fontWeight:600,fontSize:11,textAlign:'right',color:'var(--c3)'}}>LIKELIHOOD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {varRows.map((r, i) => (
                        <tr key={r.month} style={{borderBottom: i < varRows.length-1 ? '1px solid var(--c6)' : undefined}}>
                          <td style={{padding:'8px 14px',color:'var(--c1)',fontWeight:600,fontSize:13}}>
                            {new Date(r.month + '-01T00:00:00').toLocaleDateString('en-GB', {month:'long',year:'numeric'})}
                          </td>
                          <td style={{padding:'6px 8px'}}>
                            <input
                              type="number"
                              value={r.amount}
                              onChange={e => updateVarRow(i, 'amount', e.target.value)}
                              placeholder="0"
                              style={{width:'100%',textAlign:'right',padding:'6px 10px',fontSize:13,border:'1px solid var(--c6)',borderRadius:4}}
                            />
                          </td>
                          <td style={{padding:'6px 8px',minWidth:110}}>
                            <select value={r.probability} onChange={e => updateVarRow(i, 'probability', e.target.value)}
                              style={{width:'100%',height:36,border:'1px solid var(--c6)',borderRadius:6,padding:'0 8px',fontSize:13,background:'#fff',fontFamily:'inherit'}}>
                              <option value="25">25%</option>
                              <option value="50">50%</option>
                              <option value="100">100%</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {(!form.start_month || !form.end_month) && (
              <div className="info-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Set start and end months to generate the per-month plan table.
              </div>
            )}
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete project"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}" (${deleteTarget.pn})? This will also delete all invoice plans for this project. This cannot be undone.` : ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmLabel={deleting ? 'Deleting…' : 'Delete project'}
      />
    </div>
  )
}
