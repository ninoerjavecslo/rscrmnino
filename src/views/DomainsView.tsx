import { useEffect, useState } from 'react'
import { useDomainsStore } from '../stores/domains'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { Domain } from '../lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000)
}
function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function ExpiryLabel({ expiryDate }: { expiryDate: string }) {
  const days = daysUntil(expiryDate)
  if (days < 0)   return <span style={{color:'var(--red)',fontWeight:700,fontSize:13}}>Expired</span>
  if (days <= 7)  return <span style={{color:'var(--red)',fontWeight:700,fontSize:13}}>{days}d</span>
  if (days <= 30) return <span style={{color:'var(--amber)',fontWeight:700,fontSize:13}}>{days}d</span>
  return <span style={{color:'var(--green)',fontWeight:600,fontSize:13}}>Safe</span>
}

// ── Domain row input (in add modal) ──────────────────────────────────────────

interface DomainRow { domain_name: string; expiry_date: string; yearly_amount: string }

function DomainRowInputs({ rows, onChange }: { rows: DomainRow[]; onChange: (r: DomainRow[]) => void }) {
  function update(i: number, f: keyof DomainRow, v: string) {
    onChange(rows.map((r, idx) => idx === i ? { ...r, [f]: v } : r))
  }
  function add()     { onChange([...rows, { domain_name: '', expiry_date: '', yearly_amount: '' }]) }
  function remove(i: number) { onChange(rows.filter((_, idx) => idx !== i)) }

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 145px 100px 32px',gap:'4px 8px',marginBottom:4}}>
        <span className="form-label">Domain</span>
        <span className="form-label">Expiry date</span>
        <span className="form-label">€ / year</span>
        <span></span>
      </div>
      {rows.map((row, i) => (
        <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 145px 100px 32px',gap:'6px 8px',alignItems:'center',marginBottom:8}}>
          <input value={row.domain_name}    onChange={e => update(i,'domain_name',e.target.value)}    placeholder="example.si" />
          <input type="date" value={row.expiry_date}   onChange={e => update(i,'expiry_date',e.target.value)} />
          <input type="number" value={row.yearly_amount} onChange={e => update(i,'yearly_amount',e.target.value)} placeholder="25" />
          <button onClick={() => remove(i)} disabled={rows.length === 1}
            style={{width:32,height:42,border:'1px solid var(--c6)',borderRadius:8,background:'#fff',cursor:'pointer',color:'var(--c4)',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
        </div>
      ))}
      <button className="btn btn-ghost btn-xs" onClick={add} style={{marginTop:2}}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add domain
      </button>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ open, title, maxWidth = 580, onClose, children, footer }: {
  open: boolean; title: string; maxWidth?: number
  onClose: () => void; children: React.ReactNode; footer?: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth }}>
        <div className="modal-header"><h2>{title}</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function DomainsView() {
  const store = useDomainsStore()
  const cStore = useClientsStore()
  const pStore = useProjectsStore()
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  // Add form state
  const [clientId, setClientId]         = useState('')
  const [newClientName, setNewClientName] = useState('')
  const [showNewClient, setShowNewClient] = useState(false)
  const [projectPn, setProjectPn]       = useState('')
  const [domainError, setDomainError]   = useState<string | null>(null)
  const [contractId, setContractId]     = useState('')
  const [domainRows, setDomainRows]     = useState<DomainRow[]>([{ domain_name: '', expiry_date: '', yearly_amount: '' }])

  useEffect(() => { store.fetchAll(); cStore.fetchAll(); pStore.fetchAll() }, [])

  // Open all groups once data loads
  useEffect(() => {
    if (store.domains.length > 0) {
      setOpenGroups(new Set(store.byClient().map(g => g.clientName)))
    }
  }, [store.domains.length])

  function toggleGroup(name: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  async function handleSave() {
    const valid = domainRows.filter(r => r.domain_name && r.expiry_date)
    if (!clientId && !showNewClient) { setDomainError('Select or create a client'); return }
    if (showNewClient && !newClientName.trim()) { setDomainError('Enter a client name'); return }
    if (valid.length === 0) { setDomainError('Add at least one domain with a name and expiry date'); return }
    setDomainError(null)
    setSaving(true)
    try {
      let resolvedClientId = clientId
      if (showNewClient) {
        const { data: newClient, error: ce } = await supabase
          .from('clients')
          .insert({ name: newClientName.trim() })
          .select('id')
          .single()
        if (ce) throw ce
        resolvedClientId = newClient.id
        await cStore.fetchAll()
      }
      await store.addDomains(resolvedClientId, projectPn, valid.map(r => ({
        domain_name:   r.domain_name,
        expiry_date:   r.expiry_date,
        yearly_amount: r.yearly_amount ? parseFloat(r.yearly_amount) : undefined,
        contract_id:   contractId || undefined,
      })))
      toast('success', `${valid.length} domain${valid.length > 1 ? 's' : ''} added`)
      setShowAdd(false)
      setClientId(''); setProjectPn(''); setContractId('')
      setNewClientName(''); setShowNewClient(false)
      setDomainRows([{ domain_name: '', expiry_date: '', yearly_amount: '' }])
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const critical    = store.critical()
  const warningSoon = store.warningSoon()
  const q = search.trim().toLowerCase()
  const groups      = store.byClient().map(g => ({
    ...g,
    domains: q ? g.domains.filter((d: Domain) => d.domain_name.toLowerCase().includes(q)) : g.domains,
  })).filter(g => !q || g.domains.length > 0 || g.clientName.toLowerCase().includes(q))

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>Domains</h1>
          <p>Domain expiry tracking &amp; renewals</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={{position:'relative'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{position:'absolute',left:9,top:'50%',transform:'translateY(-50%)',color:'var(--c4)',pointerEvents:'none'}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input placeholder="Search domains…" value={search} onChange={e => setSearch(e.target.value)}
              style={{paddingLeft:28,width:180,height:34,fontSize:13}} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Client Domains
          </button>
        </div>
      </div>

      <div className="page-content">
        {store.error && (
          <div className="alert alert-red" style={{marginBottom:12}}>Failed to load data. Please check your connection.</div>
        )}

        {/* Alert strips */}
        {critical.length > 0 && (
          <div className="alert alert-red" style={{marginBottom:6}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <strong>Critical — expires within 7 days:</strong>&nbsp;{critical.map((d: Domain) => d.domain_name).join(', ')}
          </div>
        )}
        {warningSoon.length > 0 && (
          <div className="alert alert-amber" style={{marginBottom:16}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <strong>Renewing within 30 days:</strong>&nbsp;{warningSoon.map((d: Domain) => d.domain_name).join(', ')}
          </div>
        )}

        {/* Empty state */}
        {!store.loading && groups.length === 0 && (
          <div className="card">
            <div className="card-body" style={{textAlign:'center',padding:'48px 20px'}}>
              <div style={{fontSize:32,marginBottom:10}}>🌐</div>
              <div style={{fontWeight:700,fontSize:15,color:'var(--c2)',marginBottom:5}}>No domains tracked yet</div>
              <div className="text-sm">Add client domains to start monitoring expiry dates</div>
            </div>
          </div>
        )}

        {/* Client groups */}
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {groups.map(({ clientName, domains }) => {
            const isOpen    = openGroups.has(clientName)
            const critCount = domains.filter((d: Domain) => { const n = daysUntil(d.expiry_date); return n >= 0 && n <= 7 }).length
            const warnCount = domains.filter((d: Domain) => { const n = daysUntil(d.expiry_date); return n > 7 && n <= 30 }).length

            return (
              <div key={clientName} className="card">
                {/* Group header */}
                <div onClick={() => toggleGroup(clientName)}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',cursor:'pointer',userSelect:'none',borderBottom:isOpen?'1px solid var(--c7)':'none'}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{transform:isOpen?'rotate(0deg)':'rotate(-90deg)',transition:'transform .15s',flexShrink:0,color:'var(--c4)'}}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                  <span style={{fontWeight:700,fontSize:14,color:'var(--c0)',flex:1}}>{clientName}</span>
                  <span className="text-xs">{domains.length} domain{domains.length !== 1 ? 's' : ''}</span>
                  {critCount > 0 && <span className="badge badge-red">{critCount} critical</span>}
                  {warnCount > 0 && <span className="badge badge-amber">{warnCount} expiring</span>}
                </div>

                {/* Domain rows */}
                {isOpen && domains.map((d: Domain, i: number) => (
                  <div key={d.id} style={{display:'flex',alignItems:'center',padding:'11px 16px',borderBottom:i<domains.length-1?'1px solid var(--c7)':'none',gap:12}}>
                    <div style={{flex:1}}>
                      <span style={{fontWeight:600,fontSize:14,color:'var(--c0)'}}>{d.domain_name}</span>
                    </div>
                    <div style={{width:140}}>
                      <div style={{fontSize:13,color:'var(--c2)',fontWeight:500}}>Exp. {fmtDate(d.expiry_date)}</div>
                    </div>
                    <div style={{width:80,textAlign:'right',fontSize:13,color:'var(--c2)'}}>
                      {d.yearly_amount ? `€${d.yearly_amount}/yr` : '—'}
                    </div>
                    <div style={{width:60,textAlign:'right'}}>
                      <ExpiryLabel expiryDate={d.expiry_date} />
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Add domains modal */}
      <Modal open={showAdd} title="Add Client Domains" onClose={() => setShowAdd(false)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner"/> : null} Save domains</button>
        </>}>
        {domainError && (
          <div className="alert alert-red" style={{marginBottom:12}}>{domainError}</div>
        )}
        <div className="form-row" style={{marginBottom:14}}>
          <div className="form-group">
            <label className="form-label" style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              Client
              <button type="button" className="btn btn-ghost btn-xs" style={{padding:'0 4px',fontWeight:500}}
                onClick={() => { setShowNewClient(!showNewClient); setClientId('') }}>
                {showNewClient ? '← Pick existing' : '+ New client'}
              </button>
            </label>
            {showNewClient ? (
              <input placeholder="Client name" value={newClientName} onChange={e => setNewClientName(e.target.value)} autoFocus />
            ) : (
              <select value={clientId} onChange={e => setClientId(e.target.value)}>
                <option value="">— Select client —</option>
                {cStore.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Project # (billing)</label>
            <input placeholder="e.g. RS-2026-001" value={projectPn} onChange={e => setProjectPn(e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{marginBottom:16}}>
          <label className="form-label">Contract / Order ID <span className="form-hint" style={{display:'inline'}}>optional</span></label>
          <input placeholder="e.g. PO-2026-042" value={contractId} onChange={e => setContractId(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Domains</label>
          <DomainRowInputs rows={domainRows} onChange={setDomainRows} />
        </div>
      </Modal>
    </div>
  )
}
