import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { useSettingsStore } from '../stores/settings'
import { supabase } from '../lib/supabase'
import type { Project } from '../lib/types'
import { Select } from '../components/Select'

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

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green', paused: 'badge-amber',
  completed: 'badge-gray', cancelled: 'badge-red'
}

const TYPE_BADGE: Record<string, string> = {
  fixed: 'badge-blue', maintenance: 'badge-amber', variable: 'badge-green'
}
const TYPE_LABEL: Record<string, string> = {
  fixed: 'Fixed', maintenance: 'Recurring', variable: 'Variable'
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
  ]
  return (
    <div style={{marginBottom:16}}>
      <div className="form-label" style={{marginBottom:8}}>Project type</div>
      <div style={{display:'flex',gap:8}}>
        {types.map(t => (
          <div key={t.key} onClick={() => onChange(t.key)}
            style={{flex:1,border:`2px solid ${value===t.key?'var(--navy)':'var(--c6)'}`,borderRadius:'var(--r)',padding:'12px 10px',cursor:'pointer',background:value===t.key?'var(--navy-light)':'#fff',textAlign:'center',transition:'all .12s'}}>
            <div style={{display:'flex',justifyContent:'center',marginBottom:6}}>{t.icon}</div>
            <div style={{fontWeight:700,fontSize:13,color:value===t.key?'var(--navy)':'var(--c1)'}}>{t.label}</div>
            <div style={{fontSize:11,color:'var(--c4)',marginTop:2}}>{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ open, title, onClose, children, footer, wide }: {
  open: boolean; title: string; onClose: () => void
  children: React.ReactNode; footer?: React.ReactNode; wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: wide ? 680 : 560 }}>
        <div className="modal-header"><h2>{title}</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

const EMPTY = { pn:'', name:'', client_id:'', type:'fixed', pm:'Nino', value:'', start_month:'', end_month:'', starting_from:'', probability:'50', num_months:'12' }

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
    .filter(p => p.status === 'active')
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
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p>Manage your project portfolio</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setForm(f => ({ ...f, pn: nextPn(pStore.projects) })); setShowAdd(true) }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Project
        </button>
      </div>

      {/* Stats strip */}
      <div className="stats-strip">
        {[
          { label:'Total projects',  value:String(pStore.projects.length), sub:`${activeCount} active`, color:'var(--c5)' },
          { label:'Portfolio value', value: portfolioValue ? `${portfolioValue.toLocaleString()} €` : '—', sub:'active contracts', color:'var(--navy)' },
          { label:'Invoiced YTD',    value: invoicedYTD ? `${invoicedYTD.toLocaleString(undefined,{maximumFractionDigits:0})} €` : '—', sub:'from invoices', color:'var(--green)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{'--left-color':s.color} as React.CSSProperties}>
            <div className="stat-card-label">{s.label}</div>
            <div className="stat-card-value">{s.value}</div>
            <div className="stat-card-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="page-content">
        {pStore.error && <div className="alert alert-red" style={{marginBottom:16}}>Failed to load projects. Please check your connection.</div>}

        {!pStore.loading && pStore.projects.length === 0 ? (
          <div className="card">
            <div className="card-body" style={{textAlign:'center',padding:'52px 20px'}}>
              <div style={{fontSize:32,marginBottom:10}}>📁</div>
              <div style={{fontWeight:700,fontSize:15,color:'var(--c2)',marginBottom:5}}>No projects yet</div>
              <div className="text-sm" style={{marginBottom:16}}>Create your first project</div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>New Project</button>
            </div>
          </div>
        ) : (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Project</th><th>Client</th><th>Type</th>
                  <th className="th-right">Value</th><th>PM</th><th>Status</th><th style={{width:60}}></th>
                </tr>
              </thead>
              <tbody>
                {pStore.loading ? (
                  <tr><td colSpan={8} style={{textAlign:'center',padding:32,color:'var(--c4)'}}>Loading…</td></tr>
                ) : pStore.projects.map((p: Project) => (
                  <tr key={p.id}>
                    <td style={{color:'var(--c3)',fontSize:11,fontWeight:600,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{p.pn}</td>
                    <td className="table-link" style={{fontWeight:700}} onClick={() => navigate(`/projects/${p.id}`)}>{p.name}</td>
                    <td className="text-sm text-muted" style={{cursor: p.client ? 'pointer' : 'default'}}
                      onClick={() => p.client && navigate(`/clients/${p.client.id}`)}>{p.client?.name ?? '—'}</td>
                    <td><span className={`badge ${TYPE_BADGE[p.type] ?? 'badge-gray'}`}>{TYPE_LABEL[p.type] ?? p.type}</span></td>
                    <td className="td-right text-mono" style={{fontWeight:600}}>
                      {(() => {
                        const isRecurring = p.type === 'maintenance' || p.type === 'variable'
                        const regularRows = rpStore.rows.filter(r => r.project_id === p.id && !r.notes?.startsWith('CR:') && r.status !== 'cost')
                        const crTotal = crStore.approvedCRs.filter(cr => cr.project_id === p.id).reduce((s, cr) => s + (cr.amount ?? 0), 0)
                        const base = isRecurring
                          ? regularRows.reduce((s, r) => s + (r.planned_amount ?? 0), 0)
                          : (p.initial_contract_value ?? p.contract_value ?? null)
                        const val = base != null ? base + crTotal : null
                        return val ? `${val.toLocaleString()} €` : <span className="text-muted">—</span>
                      })()}
                    </td>
                    <td className="text-sm" style={{color:'var(--c2)'}}>{p.pm ?? <span className="text-muted">—</span>}</td>
                    <td><span className={`badge ${STATUS_BADGE[p.status] ?? 'badge-gray'}`}>{p.status.charAt(0).toUpperCase()+p.status.slice(1)}</span></td>
                    <td style={{whiteSpace:'nowrap'}}>
                      <button className="btn btn-secondary btn-xs" onClick={() => navigate(`/projects/${p.id}`)}>Edit</button>
                      {' '}
                      <button className="btn btn-ghost btn-xs" style={{color:'var(--red)'}} onClick={() => setDeleteTarget(p)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showAdd} title="New Project" onClose={closeModal} wide={form.type === 'variable'}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={closeModal}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={saving || !form.name.trim()}>
            {saving ? <span className="spinner" style={{borderTopColor:'#fff'}}/> : null}
            Create project
          </button>
        </>}
      >
        <TypePills value={form.type} onChange={v => setF('type', v)} />

        <div className="form-row" style={{marginBottom:14}}>
          <div className="form-group" style={{maxWidth:160}}>
            <label className="form-label">Project #</label>
            <input value={form.pn} onChange={e => setF('pn', e.target.value)} placeholder="RS-2026-001" className="text-mono" />
          </div>
          <div className="form-group">
            <label className="form-label">Project name</label>
            <input value={form.name} onChange={e => setF('name', e.target.value)} placeholder="e.g. Petrol — Prenova" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Client</label>
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
              <input style={{marginTop:8}} value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="New client name…" />
            )}
          </div>
        </div>

        <div className="form-row" style={{marginBottom: 14}}>
          <div className="form-group">
            <label className="form-label">Project Manager</label>
            <Select
              value={form.pm}
              onChange={val => setF('pm', val)}
              options={pmOptions}
            />
          </div>
          {form.type !== 'variable' && (
            <div className="form-group">
              <label className="form-label">
                {form.type === 'maintenance' ? 'Monthly amount (€)' : 'Project value (€)'}
              </label>
              <input type="number" value={form.value} onChange={e => setF('value', e.target.value)} placeholder={form.type === 'maintenance' ? '2000' : '45000'} />
            </div>
          )}
        </div>


        {form.type === 'maintenance' && (
          <>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Starting from</label>
                <input type="month" value={form.starting_from} onChange={e => setF('starting_from', e.target.value)} />
              </div>
              <div className="form-group" style={{maxWidth:140}}>
                <label className="form-label">Number of months</label>
                <input type="number" min="1" max="60" value={form.num_months} onChange={e => setF('num_months', e.target.value)} placeholder="12" />
              </div>
            </div>
            {form.value && form.num_months && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 12px', background: 'var(--c7)', borderRadius: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--c3)' }}>Initial value:</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)' }}>
                  {(parseFloat(form.value) * Math.max(1, Math.min(60, parseInt(form.num_months) || 12))).toLocaleString()} €
                </span>
                <span style={{ fontSize: 11, color: 'var(--c4)' }}>({form.value} €/mo × {form.num_months} mo)</span>
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
            <div className="form-row" style={{marginBottom: 12}}>
              <div className="form-group">
                <label className="form-label">Start month</label>
                <input type="month" value={form.start_month} onChange={e => setF('start_month', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">End month</label>
                <input type="month" value={form.end_month} onChange={e => setF('end_month', e.target.value)} />
              </div>
              <div className="form-group" style={{maxWidth:140}}>
                <label className="form-label">Default amount (€)</label>
                <input type="number" value={form.value} onChange={e => {
                  setF('value', e.target.value)
                  setVarRows(rows => rows.map(r => ({ ...r, amount: e.target.value })))
                }} placeholder="0" />
              </div>
              <div className="form-group" style={{maxWidth:200}}>
                <label className="form-label">Set all rows to</label>
                <div style={{display:'flex',gap:6}}>
                  <select value={form.probability} onChange={e => setF('probability', e.target.value)}
                    style={{flex:1,height:42,border:'1px solid var(--c6)',borderRadius:10,padding:'0 10px',fontSize:14,background:'#fff',fontFamily:'inherit'}}>
                    <option value="25">25%</option>
                    <option value="50">50%</option>
                    <option value="100">100%</option>
                  </select>
                  <button type="button" className="btn btn-secondary btn-sm"
                    onClick={() => setVarRows(rows => rows.map(r => ({ ...r, probability: form.probability })))}>
                    Apply
                  </button>
                </div>
              </div>
            </div>
            {varRows.length > 0 && (
              <div style={{marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                  <span className="form-label" style={{marginBottom:0}}>Monthly plan</span>
                  <span style={{fontSize:12,color:'var(--c3)'}}>
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

      {deleteTarget && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="modal-box" style={{maxWidth:420}}>
            <div className="modal-header">
              <h2>Delete project</h2>
              <button className="modal-close" onClick={() => setDeleteTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete <strong>{deleteTarget.name}</strong> ({deleteTarget.pn})?</p>
              <p style={{color:'var(--red)',fontSize:13,marginTop:8}}>This will also delete all invoice plans for this project. This cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" style={{background:'var(--red)',borderColor:'var(--red)'}} onClick={handleDelete} disabled={deleting}>
                {deleting ? <span className="spinner" style={{borderTopColor:'#fff'}}/> : null}
                Delete project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
