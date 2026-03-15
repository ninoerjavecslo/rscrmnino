import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { useInfraStore } from '../stores/infrastructure'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { supabase } from '../lib/supabase'
import type { Project } from '../lib/types'
import { Select } from '../components/Select'

const CURRENT_YEAR = new Date().getFullYear()
function currentYearMonths() {
  return Array.from({ length: 12 }, (_, i) => `${CURRENT_YEAR}-${String(i + 1).padStart(2, '0')}-01`)
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

function Modal({ open, title, onClose, children, footer }: {
  open: boolean; title: string; onClose: () => void
  children: React.ReactNode; footer?: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <div className="modal-header"><h2>{title}</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

const EMPTY = { pn:'', name:'', client_id:'', type:'fixed', pm:'Nino', value:'', start_month:'', end_month:'', starting_from:'', probability:'70', num_months:'12' }

export function ProjectsView() {
  const pStore = useProjectsStore()
  const cStore = useClientsStore()
  const iStore = useInfraStore()
  const rpStore = useRevenuePlannerStore()
  const navigate = useNavigate()
  const [showAdd, setShowAdd]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [form, setForm]               = useState({ ...EMPTY })
  const [newClientName, setNewClientName] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)

  const months = useMemo(() => currentYearMonths(), [])
  useEffect(() => { pStore.fetchAll(); cStore.fetchAll(); iStore.fetchAll(); rpStore.fetchByMonths(months) }, [])

  function setF(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function handleClientChange(v: string) {
    if (v === '__new__') { setShowNewClient(true); setF('client_id', '') }
    else { setShowNewClient(false); setNewClientName(''); setF('client_id', v) }
  }

  function closeModal() { setShowAdd(false); setForm({ ...EMPTY }); setShowNewClient(false); setNewClientName('') }

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
          contract_value: form.value ? parseFloat(form.value) : null,
          currency:       'EUR',
          start_date:     form.start_month ? form.start_month + '-01' : null,
          end_date:       form.end_month   ? form.end_month   + '-01' : null,
          notes:          null,
        })
        .select('id').single()
      if (pe) throw pe

      // Auto-generate monthly invoice plan rows for maintenance/retainer
      if ((form.type === 'maintenance' || form.type === 'variable') && form.starting_from && form.value) {
        const numMonths = Math.max(1, Math.min(60, parseInt(form.num_months) || 12))
        const [y, m] = form.starting_from.split('-').map(Number)
        const defaultProb = form.type === 'variable' ? 75 : 100
        const rows = Array.from({ length: numMonths }, (_, i) => {
          const d = new Date(y, m - 1 + i, 1)
          return {
            project_id:     proj.id,
            month:          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
            planned_amount: parseFloat(form.value),
            actual_amount:  null,
            status:         'planned',
            probability:    defaultProb,
            notes:          null,
          }
        })
        const { error: re } = await supabase.from('revenue_planner').insert(rows)
        if (re) throw re
      }

      await pStore.fetchAll()
      closeModal()
    } catch (e) { alert((e as Error).message) }
    finally { setSaving(false) }
  }

  const activeCount    = pStore.projects.filter(p => p.status === 'active').length
  const portfolioValue = pStore.projects
    .filter(p => p.status === 'active')
    .reduce((sum, p) => sum + (p.contract_value ?? 0), 0)
  const monthsElapsed  = new Date().getMonth() + 1
  const costsYTD       = iStore.totalMonthlyCost() * monthsElapsed
  const invoicedYTD    = rpStore.rows.reduce((s, r) => s + (r.actual_amount ?? 0), 0)

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
          { label:'Costs YTD',       value: costsYTD ? `${costsYTD.toLocaleString(undefined,{maximumFractionDigits:0})} €` : '—', sub:'infrastructure costs', color:'var(--red)' },
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
                      {p.contract_value
                        ? `${p.contract_value.toLocaleString()} €${p.type === 'maintenance' || p.type === 'variable' ? '/mo' : ''}`
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="text-sm" style={{color:'var(--c2)'}}>{p.pm ?? <span className="text-muted">—</span>}</td>
                    <td><span className={`badge ${STATUS_BADGE[p.status] ?? 'badge-gray'}`}>{p.status.charAt(0).toUpperCase()+p.status.slice(1)}</span></td>
                    <td><button className="btn btn-secondary btn-xs" onClick={() => navigate(`/projects/${p.id}`)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showAdd} title="New Project" onClose={closeModal}
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

        <div className="form-row" style={{marginBottom: form.type !== 'fixed' ? 14 : 0}}>
          <div className="form-group">
            <label className="form-label">Project Manager</label>
            <Select
              value={form.pm}
              onChange={val => setF('pm', val)}
              options={[
                { value: 'Nino', label: 'Nino' },
                { value: 'Ana', label: 'Ana' },
                { value: 'Maja', label: 'Maja' },
              ]}
            />
          </div>
          <div className="form-group">
            <label className="form-label">
              {form.type === 'maintenance' ? 'Monthly amount (€)' : form.type === 'variable' ? 'Est. monthly (€)' : 'Project value (€)'}
            </label>
            <input type="number" value={form.value} onChange={e => setF('value', e.target.value)} placeholder={form.type === 'fixed' ? '45000' : '2000'} />
          </div>
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
            <div className="info-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {form.num_months && form.starting_from
                ? `${form.num_months} monthly invoice plans will be created from ${form.starting_from}.`
                : 'Invoice plans will be auto-generated for each month.'}
            </div>
          </>
        )}

        {form.type === 'variable' && (
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Probability (%)</label>
              <input type="number" value={form.probability} onChange={e => setF('probability', e.target.value)} placeholder="70" />
            </div>
            <div className="form-group">
              <label className="form-label">Starting from</label>
              <input type="month" value={form.starting_from} onChange={e => setF('starting_from', e.target.value)} />
            </div>
            <div className="form-group" style={{maxWidth:130}}>
              <label className="form-label">Number of months</label>
              <input type="number" min="1" max="60" value={form.num_months} onChange={e => setF('num_months', e.target.value)} placeholder="12" />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
