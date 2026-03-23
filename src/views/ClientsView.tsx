import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import { useMaintenancesStore } from '../stores/maintenances'
import { useChangeRequestsStore } from '../stores/changeRequests'
import { usePipelineStore } from '../stores/pipeline'
import type { Client } from '../lib/types'
import { Modal } from '../components/Modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

const CURRENT_YEAR = new Date().getFullYear()

// Wide range for total value calculation (same as ClientDetailView)
const ALL_MONTHS: string[] = []
for (let y = CURRENT_YEAR - 2; y <= CURRENT_YEAR + 1; y++) {
  for (let m = 1; m <= 12; m++) {
    ALL_MONTHS.push(`${y}-${String(m).padStart(2, '0')}-01`)
  }
}

function YesNo({ yes }: { yes: boolean }) {
  return yes ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#16a34a" strokeWidth="1.8"/>
      <path d="M7.5 12l3 3 6-6" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#d1d5db" strokeWidth="1.8"/>
      <line x1="8" y1="12" x2="16" y2="12" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round"/>
    </svg>
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
  const pipeStore   = usePipelineStore()
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
    pipeStore.fetchAll()
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

  const pipelineByClient = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of pipeStore.items) {
      if (item.status !== 'proposal') continue
      if (!item.client_id) continue
      map.set(item.client_id, (map.get(item.client_id) ?? 0) + 1)
    }
    return map
  }, [pipeStore.items])

  const filteredClients = useMemo(() => {
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
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Clients</h1>
          <p>Manage client relationships and invoice history</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Client
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {store.error && (
          <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c] mb-4">
            Failed to load clients. Please check your connection.
          </div>
        )}

        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1" style={{ maxWidth: 360 }}>
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search clients…"
              style={{ paddingLeft: 34, width: '100%' }}
            />
          </div>
        </div>

        {!store.loading && store.clients.length === 0 ? (
          <Card>
            <CardContent className="text-center py-14 px-5">
              <div className="text-3xl mb-2">👥</div>
              <div className="font-bold text-[15px] text-[#374151] mb-1">No clients yet</div>
              <div className="text-sm mb-4">Add your first client to get started</div>
              <Button size="sm" onClick={() => setShowAdd(true)}>New Client</Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <table>
              <thead>
                <tr>
                  <th>Client Name</th>
                  <th className="text-right" style={{width:80}}>Projects</th>
                  <th className="text-right" style={{width:80}}>Pipeline</th>
                  <th style={{width:80}}>Hosting</th>
                  <th style={{width:80}}>Domains</th>
                  <th style={{width:110}}>Maintenance</th>
                  <th className="text-right" style={{width:140}}>Invoiced YTD</th>
                  <th style={{width:80}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {store.loading ? (
                  <tr><td colSpan={8} className="text-center text-muted-foreground" style={{padding:32}}>Loading…</td></tr>
                ) : pagedClients.map((c: Client) => {
                  const clientProjects = pStore.projects.filter(p => p.client_id === c.id)
                  const hasHosting     = infraStore.hostingClients.some(h => h.client_id === c.id && h.status === 'active')
                  const hasDomains     = domainStore.domains.some(d => d.client_id === c.id && !d.archived)
                  const hasMaintenance = maintStore.maintenances.some(m => m.client_id === c.id && m.status === 'active')
                  const pipelineCount  = pipelineByClient.get(c.id) ?? 0

                  return (
                    <tr key={c.id}>
                      <td className="font-medium text-primary hover:underline cursor-pointer font-bold" onClick={() => navigate(`/clients/${c.id}`)}>{c.name}</td>

                      <td className="text-right">
                        {clientProjects.length === 0
                          ? <span className="text-muted-foreground">—</span>
                          : <span className="font-semibold text-[13px]">{clientProjects.length}</span>}
                      </td>

                      <td className="text-right">
                        {pipelineCount === 0
                          ? <span className="text-muted-foreground">—</span>
                          : <Badge variant="amber">{pipelineCount}</Badge>}
                      </td>

                      <td><YesNo yes={hasHosting} /></td>
                      <td><YesNo yes={hasDomains} /></td>
                      <td><YesNo yes={hasMaintenance} /></td>

                      <td className="text-right">
                        {(() => {
                          const inv = invoicedByClient.get(c.id)
                          return inv
                            ? <span className="font-semibold text-[#16a34a]">{inv.toLocaleString()} €</span>
                            : <span className="text-muted-foreground">—</span>
                        })()}
                      </td>

                      <td><Button variant="outline" size="xs" onClick={() => navigate(`/clients/${c.id}`)}>View →</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border text-[13px] text-muted-foreground">
                <span>Displaying {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredClients.length)} of {filteredClients.length}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="xs" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                    <Button key={p} variant={p === page ? 'default' : 'outline'} size="xs" onClick={() => setPage(p)}>{p}</Button>
                  ))}
                  <Button variant="outline" size="xs" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next ›</Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      <Modal open={showAdd} title="New Client" onClose={() => { setShowAdd(false); setName('') }}
        footer={<>
          <Button variant="outline" size="sm" onClick={() => { setShowAdd(false); setName('') }}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving ? <span className="spinner" style={{borderTopColor:'#fff'}}/> : null}
            Create client
          </Button>
        </>}
      >
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Client name</label>
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
