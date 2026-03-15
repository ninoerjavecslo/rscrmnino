import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import { useMaintenancesStore } from '../stores/maintenances'
import type { Client } from '../lib/types'
import { hostingContractValue } from '../lib/types'

const CURRENT_YEAR = new Date().getFullYear()

function maintMonthsThisYear(m: { contract_start?: string | null; contract_end?: string | null }): number {
  const yearStart = `${CURRENT_YEAR}-01`
  const yearEnd   = `${CURRENT_YEAR}-12`
  const cStart = m.contract_start ? m.contract_start.slice(0, 7) : yearStart
  const cEnd   = m.contract_end   ? m.contract_end.slice(0, 7)   : yearEnd
  const effStart = cStart > yearStart ? cStart : yearStart
  const effEnd   = cEnd   < yearEnd   ? cEnd   : yearEnd
  if (effStart > effEnd) return 0
  const [sy, sm] = effStart.split('-').map(Number)
  const [ey, em] = effEnd.split('-').map(Number)
  return (ey - sy) * 12 + (em - sm) + 1
}

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
  const navigate    = useNavigate()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName]       = useState('')
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    store.fetchAll()
    pStore.fetchAll()
    rpStore.fetchByMonths(ALL_MONTHS)
    infraStore.fetchAll()
    domainStore.fetchAll()
    maintStore.fetchAll()
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
                  <th className="th-right" style={{width:70}}>Projects</th>
                  <th style={{width:70}}>Hosting</th>
                  <th style={{width:70}}>Domains</th>
                  <th style={{width:100}}>Maintenance</th>
                  <th className="th-right" style={{width:150}}>Total value</th>
                  <th className="th-right" style={{width:140}}>Invoiced YTD</th>
                  <th style={{width:80}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {store.loading ? (
                  <tr><td colSpan={8} style={{textAlign:'center',padding:32,color:'var(--c4)'}}>Loading…</td></tr>
                ) : store.clients.map((c: Client) => {
                  const clientProjects = pStore.projects.filter(p => p.client_id === c.id)
                  const activeProjects = clientProjects.filter(p => p.status === 'active')

                  const clientProjectIds = new Set(clientProjects.map(p => p.id))
                  const hasVariable = activeProjects.some(p => p.contract_value == null)

                  // Project value from rpRows (same as ClientDetailView)
                  const projectRpSum = rpStore.rows
                    .filter(r => r.project_id != null && clientProjectIds.has(r.project_id))
                    .reduce((sum, r) => sum + (r.planned_amount ?? 0), 0)

                  // Hosting annual equivalent
                  const hostingAnnual = infraStore.hostingClients
                    .filter(h => h.client_id === c.id && h.status === 'active')
                    .reduce((sum, h) => sum + hostingContractValue(h), 0)

                  // Domains annual
                  const domainsAnnual = domainStore.domains
                    .filter(d => d.client_id === c.id && !d.archived)
                    .reduce((sum, d) => sum + (d.yearly_amount ?? 0), 0)

                  // Maintenance annual
                  const maintAnnual = maintStore.maintenances
                    .filter(m => m.client_id === c.id && m.status === 'active')
                    .reduce((sum, m) => sum + m.monthly_retainer * maintMonthsThisYear(m), 0)

                  const fixedValue = projectRpSum + hostingAnnual + domainsAnnual + maintAnnual

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
                        {fixedValue > 0 || hasVariable ? (
                          <span className="text-mono" style={{fontWeight:600}}>
                            {fixedValue > 0 && `${fixedValue.toLocaleString()} €`}
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
