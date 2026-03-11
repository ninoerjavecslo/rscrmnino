import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import type { Client } from '../lib/types'

const CURRENT_YEAR = new Date().getFullYear()
const YEAR_MONTHS = Array.from({ length: 12 }, (_, i) => `${CURRENT_YEAR}-${String(i + 1).padStart(2, '0')}-01`)

function YesNo({ yes }: { yes: boolean }) {
  return yes
    ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, padding: '2px 7px' }}>Yes</span>
    : <span style={{ fontSize: 11, color: 'var(--c4)', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, padding: '2px 7px' }}>No</span>
}

function Modal({ open, title, onClose, children, footer }: {
  open: boolean; title: string; onClose: () => void
  children: React.ReactNode; footer?: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <div className="modal-header"><h2>{title}</h2><button className="modal-close" onClick={onClose}>×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function ClientsView() {
  const store       = useClientsStore()
  const pStore      = useProjectsStore()
  const rpStore     = useRevenuePlannerStore()
  const infraStore  = useInfraStore()
  const domainStore = useDomainsStore()
  const navigate    = useNavigate()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName]       = useState('')
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    store.fetchAll()
    pStore.fetchAll()
    rpStore.fetchByMonths(YEAR_MONTHS)
    infraStore.fetchAll()
    domainStore.fetchAll()
  }, [])

  // invoiced YTD per client — sum actual_amount from revenue_planner (covers projects + hosting rows)
  const invoicedByClient = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rpStore.rows) {
      if (!r.actual_amount) continue
      const clientId = r.project?.client_id
      if (!clientId) continue
      map.set(clientId, (map.get(clientId) ?? 0) + r.actual_amount)
    }
    return map
  }, [rpStore.rows])

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await store.add({ name: name.trim(), email: null, phone: null, address: null, vat_id: null, notes: null })
      setName(''); setShowAdd(false)
    } catch (e) { alert((e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p>Manage client relationships and invoice history</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Client
        </button>
      </div>

      <div className="page-content">
        {store.error && <div className="alert alert-red" style={{marginBottom:16}}>Failed to load clients. Please check your connection.</div>}

        {!store.loading && store.clients.length === 0 ? (
          <div className="card">
            <div className="card-body" style={{textAlign:'center',padding:'52px 20px'}}>
              <div style={{fontSize:32,marginBottom:10}}>👥</div>
              <div style={{fontWeight:700,fontSize:15,color:'var(--c2)',marginBottom:5}}>No clients yet</div>
              <div className="text-sm" style={{marginBottom:16}}>Add your first client to get started</div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>New Client</button>
            </div>
          </div>
        ) : (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Client name</th>
                  <th className="th-right" style={{width:80}}>Projects</th>
                  <th style={{width:80}}>Hosting</th>
                  <th style={{width:80}}>Domains</th>
                  <th className="th-right">Active value</th>
                  <th className="th-right">Invoiced YTD</th>
                  <th style={{width:80}}></th>
                </tr>
              </thead>
              <tbody>
                {store.loading ? (
                  <tr><td colSpan={7} style={{textAlign:'center',padding:32,color:'var(--c4)'}}>Loading…</td></tr>
                ) : store.clients.map((c: Client) => {
                  const clientProjects = pStore.projects.filter(p => p.client_id === c.id)
                  const activeProjects = clientProjects.filter(p => p.status === 'active')

                  // Fixed / recurring value — sum only projects with a contract_value
                  const fixedValue = activeProjects.reduce((sum, p) => sum + (p.contract_value ?? 0), 0)
                  // Variable = any active project has no contract_value set
                  const hasVariable = activeProjects.some(p => p.contract_value == null)

                  // Hosting: any active hosting entry for this client
                  const hasHosting = infraStore.hostingClients.some(h => h.client_id === c.id && h.status === 'active')
                  // Domains: any domain entry for this client
                  const hasDomains = domainStore.domains.some(d => d.client_id === c.id)

                  return (
                    <tr key={c.id}>
                      <td className="table-link" style={{fontWeight:700}} onClick={() => navigate(`/clients/${c.id}`)}>{c.name}</td>

                      <td className="td-right">
                        {clientProjects.length === 0
                          ? <span className="text-muted">—</span>
                          : <span style={{fontWeight:600,fontSize:13}}>{clientProjects.length}</span>}
                      </td>

                      <td><YesNo yes={hasHosting} /></td>
                      <td><YesNo yes={hasDomains} /></td>

                      <td className="td-right">
                        {fixedValue > 0 || hasVariable ? (
                          <span className="text-mono" style={{fontWeight:600}}>
                            {fixedValue > 0 && `€${fixedValue.toLocaleString()}`}
                            {fixedValue > 0 && hasVariable && ' '}
                            {hasVariable && (
                              <span style={{fontSize:11,color:'var(--c4)',fontWeight:500,fontFamily:'inherit'}}>
                                {fixedValue > 0 ? '+ variable' : 'variable'}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>

                      <td className="td-right">
                        {(() => {
                          const inv = invoicedByClient.get(c.id)
                          return inv
                            ? <span className="text-mono" style={{fontWeight:600,color:'var(--green)'}}>€{inv.toLocaleString()}</span>
                            : <span className="text-muted">—</span>
                        })()}
                      </td>

                      <td><button className="btn btn-secondary btn-xs" onClick={() => navigate(`/clients/${c.id}`)}>View</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={showAdd} title="New Client" onClose={() => { setShowAdd(false); setName('') }}
        footer={<>
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowAdd(false); setName('') }}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving ? <span className="spinner" style={{borderTopColor:'#fff'}}/> : null}
            Create client
          </button>
        </>}
      >
        <div className="form-group">
          <label className="form-label">Client name</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Moderna galerija d.o.o."
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
        </div>
      </Modal>
    </div>
  )
}
