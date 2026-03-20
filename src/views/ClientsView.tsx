import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import { useMaintenancesStore } from '../stores/maintenances'
import { useChangeRequestsStore } from '../stores/changeRequests'
import type { Client } from '../lib/types'

const CURRENT_YEAR = new Date().getFullYear()

// Wide range for total value calculation (same as ClientDetailView)
const ALL_MONTHS: string[] = []
for (let y = CURRENT_YEAR - 2; y <= CURRENT_YEAR + 1; y++) {
  for (let m = 1; m <= 12; m++) {
    ALL_MONTHS.push(`${y}-${String(m).padStart(2, '0')}-01`)
  }
}

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
  const maintStore  = useMaintenancesStore()
  const crStore     = useChangeRequestsStore()
  const navigate    = useNavigate()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [search, setSearch]   = useState('')
  const [page, setPage]       = useState(1)
  const PAGE_SIZE = 15

  useEffect(() => {
    store.fetchAll()
    pStore.fetchAll()
    rpStore.fetchByMonths(ALL_MONTHS)
    infraStore.fetchAll()
    domainStore.fetchAll()
    maintStore.fetchAll()
    crStore.fetchAllApproved()
  }, [])

  // invoiced YTD per client — all issued/paid rows across projects, maintenance, hosting, domains
  const invoicedByClient = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rpStore.rows) {
      if (r.status === 'cost') continue
      if (r.status !== 'issued' && r.status !== 'paid') continue
      const amount = r.actual_amount ?? r.planned_amount ?? 0
      if (!amount) continue
      const clientId = r.project?.client_id
        ?? r.maintenance?.client?.id
        ?? r.hosting?.client?.id
        ?? r.domain?.client?.id
      if (!clientId) continue
      map.set(clientId, (map.get(clientId) ?? 0) + amount)
    }
    return map
  }, [rpStore.rows])

  const filteredClients = useMemo(() => {
    setPage(1)
    const q = search.trim().toLowerCase()
    return q ? store.clients.filter(c => c.name.toLowerCase().includes(q)) : store.clients
  }, [store.clients, search])

  const totalPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE))
  const pagedClients = filteredClients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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

        <div style={{ marginBottom: 16 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clients…"
            style={{ maxWidth: 320 }}
          />
        </div>

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
                  <th className="th-right" style={{width:70}}>Projects</th>
                  <th style={{width:70}}>Hosting</th>
                  <th style={{width:70}}>Domains</th>
                  <th style={{width:100}}>Maintenance</th>
                  <th className="th-right" style={{width:140}}>Invoiced YTD</th>
                  <th style={{width:80}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {store.loading ? (
                  <tr><td colSpan={7} style={{textAlign:'center',padding:32,color:'var(--c4)'}}>Loading…</td></tr>
                ) : pagedClients.map((c: Client) => {
                  const clientProjects = pStore.projects.filter(p => p.client_id === c.id)

                  // Hosting: any active hosting entry for this client
                  const hasHosting = infraStore.hostingClients.some(h => h.client_id === c.id && h.status === 'active')
                  // Domains: any non-archived domain entry for this client
                  const hasDomains = domainStore.domains.some(d => d.client_id === c.id && !d.archived)
                  // Maintenance: any active maintenance contract for this client
                  const hasMaintenance = maintStore.maintenances.some(m => m.client_id === c.id && m.status === 'active')

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
                      <td><YesNo yes={hasMaintenance} /></td>

                      <td className="td-right">
                        {(() => {
                          const inv = invoicedByClient.get(c.id)
                          return inv
                            ? <span className="text-mono" style={{fontWeight:600,color:'var(--green)'}}>{inv.toLocaleString()} €</span>
                            : <span className="text-muted">—</span>
                        })()}
                      </td>

                      <td><button className="btn btn-secondary btn-xs" onClick={() => navigate(`/clients/${c.id}`)}>View →</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filteredClients.length === 0 && !store.loading && (
              <div style={{ padding: '28px 20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
                No clients match "{search}"
              </div>
            )}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--c6)', fontSize: 13, color: 'var(--c3)' }}>
                <span>{filteredClients.length} clients · page {page} of {totalPages}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-secondary btn-xs" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <button key={p} className={`btn btn-xs ${p === page ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPage(p)}>{p}</button>
                  ))}
                  <button className="btn btn-secondary btn-xs" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next ›</button>
                </div>
              </div>
            )}
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
