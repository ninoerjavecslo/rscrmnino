import { useEffect, useState } from 'react'
import { useDomainsStore } from '../stores/domains'
import { useClientsStore } from '../stores/clients'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { Domain } from '../lib/types'
import { Select } from '../components/Select'

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(d: string) {
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
}
function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function ExpiryBadge({ expiryDate }: { expiryDate: string }) {
  const days = daysUntil(expiryDate)
  if (days < 0)   return <span className="badge badge-red">Expired</span>
  if (days <= 7)  return <span className="badge badge-red">{days}d</span>
  if (days <= 30) return <span className="badge badge-amber">{days}d</span>
  return <span className="badge badge-green">Safe</span>
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

// ── Confirm popup ─────────────────────────────────────────────────────────────

function ConfirmModal({ open, title, message, confirmLabel, danger, onConfirm, onClose }: {
  open: boolean; title: string; message: string; confirmLabel: string; danger?: boolean
  onConfirm: () => void; onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <div className="modal-header"><h2>{title}</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body">
          <p style={{margin:0,fontSize:14,color:'var(--c1)'}}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className={`btn btn-sm ${danger ? 'btn-primary' : 'btn-primary'}`}
            style={danger ? {background:'var(--red)',borderColor:'var(--red)'} : {}}
            onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function DomainsView() {
  const store = useDomainsStore()
  const cStore = useClientsStore()

  const [showAdd, setShowAdd]           = useState(false)
  const [saving, setSaving]             = useState(false)
  const [search, setSearch]             = useState('')
  const [showHistory, setShowHistory]   = useState(false)

  // Add form
  const [clientId, setClientId]               = useState('')
  const [newClientName, setNewClientName]     = useState('')
  const [showNewClient, setShowNewClient]     = useState(false)
  const [projectPn, setProjectPn]             = useState('')
  const [contractId, setContractId]           = useState('')
  const [accountingEmail, setAccountingEmail] = useState(false)
  const [domainRows, setDomainRows]           = useState<DomainRow[]>([{ domain_name: '', expiry_date: '', yearly_amount: '' }])
  const [domainError, setDomainError]         = useState<string | null>(null)

  // Edit form
  const [editDomain, setEditDomain] = useState<Domain | null>(null)

  // Confirm modals
  const [archiveTarget, setArchiveTarget] = useState<Domain | null>(null)
  const [deleteTarget, setDeleteTarget]   = useState<Domain | null>(null)

  useEffect(() => { store.fetchAll(); cStore.fetchAll() }, [])

  const activeDomains   = store.domains.filter(d => !d.archived)
  const archivedDomains = store.domains.filter(d => d.archived)
  const critical        = store.critical()
  const warningSoon     = store.warningSoon()
  const q               = search.trim().toLowerCase()
  const filtered        = q
    ? activeDomains.filter(d => d.domain_name.toLowerCase().includes(q) || (d.client?.name ?? '').toLowerCase().includes(q))
    : activeDomains

  const totalYearly = filtered.reduce((s, d) => s + (d.yearly_amount ?? 0), 0)

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
          .from('clients').insert({ name: newClientName.trim() }).select('id').single()
        if (ce) throw ce
        resolvedClientId = newClient.id
        await cStore.fetchAll()
      }
      await store.addDomains(resolvedClientId, projectPn, valid.map(r => ({
        domain_name:      r.domain_name,
        expiry_date:      r.expiry_date,
        yearly_amount:    r.yearly_amount ? parseFloat(r.yearly_amount) : undefined,
        contract_id:      contractId || undefined,
        accounting_email: accountingEmail,
      })))
      toast('success', `${valid.length} domain${valid.length > 1 ? 's' : ''} added`)
      setShowAdd(false)
      setClientId(''); setProjectPn(''); setContractId('')
      setNewClientName(''); setShowNewClient(false); setAccountingEmail(false)
      setDomainRows([{ domain_name: '', expiry_date: '', yearly_amount: '' }])
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveEdit() {
    if (!editDomain) return
    setSaving(true)
    try {
      await store.updateDomain(editDomain.id, {
        domain_name:   editDomain.domain_name,
        expiry_date:   editDomain.expiry_date,
        yearly_amount: editDomain.yearly_amount,
        project_pn:    editDomain.project_pn,
        contract_id:   editDomain.contract_id,
        registrar:     editDomain.registrar,
        auto_renew:    editDomain.auto_renew,
        notes:         editDomain.notes,
      })
      toast('success', 'Domain updated')
      setEditDomain(null)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(d: Domain) {
    try {
      await store.updateDomain(d.id, { archived: true })
      toast('success', `${d.domain_name} archived`)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setArchiveTarget(null)
    }
  }

  async function handleDelete(d: Domain) {
    try {
      await store.deleteDomain(d.id)
      toast('success', `${d.domain_name} deleted`)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setDeleteTarget(null)
    }
  }

  async function toggleAccounting(d: Domain) {
    try {
      await store.updateDomain(d.id, { accounting_email: !d.accounting_email })
      toast('success', d.accounting_email ? 'Removed from accounting' : 'Added to accounting')
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

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
              style={{paddingLeft:28,maxWidth:180,width:'100%',height:34,fontSize:13}} />
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

        <div className="section-bar">
          <h2>Active Domains <span className="text-xs" style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>· {filtered.length} domain{filtered.length !== 1 ? 's' : ''}</span></h2>
        </div>

        <div className="card">
          {filtered.length === 0 ? (
            <div style={{padding:'40px 20px',textAlign:'center',color:'var(--c4)'}}>
              <div style={{fontWeight:600,color:'var(--c3)',marginBottom:4}}>No domains tracked yet</div>
              <div className="text-sm">Add client domains to start monitoring expiry dates</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Domain</th>
                  <th>Project #</th>
                  <th>Expiry</th>
                  <th className="th-right">€/yr</th>
                  <th>Status</th>
                  <th>Acct</th>
                  <th style={{width:120}}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d: Domain) => (
                  <tr key={d.id}>
                    <td style={{fontWeight:700}}>{d.client?.name ?? '—'}</td>
                    <td style={{fontWeight:600,color:'var(--c0)'}}>{d.domain_name}</td>
                    <td>{d.project_pn ? <span className="badge badge-gray">{d.project_pn}</span> : <span className="text-xs">—</span>}</td>
                    <td className="text-xs">{fmtDate(d.expiry_date)}</td>
                    <td className="td-right text-mono" style={{fontWeight:600}}>
                      {d.yearly_amount ? `€${d.yearly_amount}` : <span className="text-xs">—</span>}
                    </td>
                    <td><ExpiryBadge expiryDate={d.expiry_date} /></td>
                    <td>
                      <button
                        onClick={() => toggleAccounting(d)}
                        className={`badge ${d.accounting_email ? 'badge-amber' : 'badge-gray'}`}
                        style={{cursor:'pointer',border:'none',background:'none',padding:0,font:'inherit'}}
                        title={d.accounting_email ? 'Remove from accounting' : 'Send to accounting'}
                      >
                        ACCT
                      </button>
                    </td>
                    <td>
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                        <button className="btn btn-secondary btn-xs" onClick={() => setEditDomain({ ...d })}>Edit</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => setArchiveTarget(d)} title="Archive">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                        </button>
                        <button className="btn btn-ghost btn-xs" onClick={() => setDeleteTarget(d)} title="Delete"
                          style={{color:'var(--red)'}}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {totalYearly > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={4} style={{textAlign:'right',fontSize:10,fontWeight:700,color:'var(--c3)',textTransform:'uppercase',letterSpacing:'0.6px'}}>Total / year</td>
                    <td className="td-right text-mono" style={{fontSize:16,fontWeight:800,color:'var(--navy)'}}>€{totalYearly.toFixed(0)}</td>
                    <td colSpan={3}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        {/* Archived history */}
        {archivedDomains.length > 0 && (
          <div style={{marginTop:24}}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(h => !h)} style={{marginBottom:10,color:'var(--c4)'}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{transform:showHistory?'rotate(0deg)':'rotate(-90deg)',transition:'transform .15s'}}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              History ({archivedDomains.length} archived)
            </button>
            {showHistory && (
              <div className="card" style={{opacity:0.7}}>
                <table>
                  <thead><tr><th>Client</th><th>Domain</th><th>Expiry</th><th style={{width:80}}></th></tr></thead>
                  <tbody>
                    {archivedDomains.map(d => (
                      <tr key={d.id}>
                        <td className="text-sm">{d.client?.name ?? '—'}</td>
                        <td style={{fontWeight:600,color:'var(--c3)'}}>{d.domain_name}</td>
                        <td className="text-sm">{fmtDate(d.expiry_date)}</td>
                        <td>
                          <button className="btn btn-ghost btn-xs" style={{color:'var(--red)'}} onClick={() => setDeleteTarget(d)} title="Delete">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add domains modal */}
      <Modal open={showAdd} title="Add Client Domains" onClose={() => setShowAdd(false)}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? <span className="spinner"/> : null} Save domains</button>
        </>}>
        {domainError && <div className="alert alert-red" style={{marginBottom:12}}>{domainError}</div>}
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
              <Select
                value={clientId}
                onChange={setClientId}
                placeholder="— Select client —"
                options={cStore.clients.map(c => ({ value: c.id, label: c.name }))}
              />
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Project # (billing)</label>
            <input placeholder="e.g. RS-2026-001" value={projectPn} onChange={e => setProjectPn(e.target.value)} />
          </div>
        </div>
        <div className="form-group" style={{marginBottom:14}}>
          <label className="form-label">Contract / Order ID <span className="form-hint" style={{display:'inline'}}>optional</span></label>
          <input placeholder="e.g. PO-2026-042" value={contractId} onChange={e => setContractId(e.target.value)} />
        </div>
        <div className="form-group" style={{marginBottom:14}}>
          <label className="toggle-label">
            <input type="checkbox" checked={accountingEmail} onChange={e => setAccountingEmail(e.target.checked)} />
            <span className="toggle-track"/>
            <span style={{fontSize:14,fontWeight:600,color:'var(--c1)'}}>Send to accounting</span>
            <span className="text-xs" style={{color:'var(--c4)'}}>appears in Outbox</span>
          </label>
        </div>
        <div className="form-group">
          <label className="form-label">Domains</label>
          <DomainRowInputs rows={domainRows} onChange={setDomainRows} />
        </div>
      </Modal>

      {/* Edit domain modal */}
      {editDomain && (
        <Modal open={!!editDomain} title="Edit Domain" onClose={() => setEditDomain(null)}
          footer={<>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditDomain(null)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} disabled={saving}>{saving ? <span className="spinner"/> : null} Save</button>
          </>}>
          <div className="form-row" style={{marginBottom:14}}>
            <div className="form-group">
              <label className="form-label">Domain name</label>
              <input value={editDomain.domain_name} onChange={e => setEditDomain(d => d ? {...d, domain_name: e.target.value} : d)} />
            </div>
            <div className="form-group">
              <label className="form-label">Expiry date</label>
              <input type="date" value={editDomain.expiry_date} onChange={e => setEditDomain(d => d ? {...d, expiry_date: e.target.value} : d)} />
            </div>
          </div>
          <div className="form-row" style={{marginBottom:14}}>
            <div className="form-group">
              <label className="form-label">Project #</label>
              <input placeholder="RS-2026-001" value={editDomain.project_pn} onChange={e => setEditDomain(d => d ? {...d, project_pn: e.target.value} : d)} />
            </div>
            <div className="form-group">
              <label className="form-label">€ / year</label>
              <input type="number" value={editDomain.yearly_amount ?? ''} onChange={e => setEditDomain(d => d ? {...d, yearly_amount: e.target.value ? parseFloat(e.target.value) : null} : d)} />
            </div>
          </div>
          <div className="form-row" style={{marginBottom:14}}>
            <div className="form-group">
              <label className="form-label">Registrar</label>
              <input placeholder="e.g. Arnes" value={editDomain.registrar ?? ''} onChange={e => setEditDomain(d => d ? {...d, registrar: e.target.value || null} : d)} />
            </div>
            <div className="form-group">
              <label className="form-label">Contract ID</label>
              <input value={editDomain.contract_id ?? ''} onChange={e => setEditDomain(d => d ? {...d, contract_id: e.target.value || null} : d)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <input value={editDomain.notes ?? ''} onChange={e => setEditDomain(d => d ? {...d, notes: e.target.value || null} : d)} />
          </div>
        </Modal>
      )}

      {/* Archive confirm */}
      <ConfirmModal
        open={!!archiveTarget}
        title="Archive domain"
        message={`Archive ${archiveTarget?.domain_name ?? ''}? It will no longer be billed and will move to history.`}
        confirmLabel="Archive"
        onConfirm={() => archiveTarget && handleArchive(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
      />

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete domain"
        message={`Permanently delete ${deleteTarget?.domain_name ?? ''}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
