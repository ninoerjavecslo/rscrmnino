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
import { OTHER_INCOME_PROJECT_NAME } from '../lib/types'
import { buildLogoHtml, openHtmlAsPdf } from '../lib/pdfExport'
import { useSettingsStore } from '../stores/settings'
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
  const store          = useClientsStore()
  const pStore         = useProjectsStore()
  const rpStore        = useRevenuePlannerStore()
  const infraStore     = useInfraStore()
  const domainStore    = useDomainsStore()
  const maintStore     = useMaintenancesStore()
  const crStore        = useChangeRequestsStore()
  const pipeStore      = usePipelineStore()
  const settingsStore  = useSettingsStore()
  const navigate       = useNavigate()
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

  function exportPDF() {
    const { agencyLogo, agencyName } = settingsStore
    const logoHtml = buildLogoHtml(agencyLogo, agencyName)
    const today = new Date().toLocaleDateString('en-GB')

    const clientCards = store.clients.map(c => {
      const clientProjects  = pStore.projects.filter(p => p.client_id === c.id)
      const clientMaint     = maintStore.maintenances.filter(m => m.client_id === c.id && m.status === 'active')
      const clientHosting   = infraStore.hostingClients.filter(h => h.client_id === c.id && h.status === 'active')
      const clientDomains   = domainStore.domains.filter(d => d.client_id === c.id && !d.archived)
      const projList = clientProjects.slice(0, 5).map(p =>
        `<span style="display:inline-block;margin:1px 2px;padding:1px 6px;border-radius:3px;font-size:8px;background:#f0f4ff;color:#1d4ed8;font-weight:600">${p.name}</span>`
      ).join('') + (clientProjects.length > 5 ? `<span style="font-size:8px;color:#6b7280"> +${clientProjects.length - 5} more</span>` : '')

      const maintList = clientMaint.map(m =>
        `<span style="display:inline-block;margin:1px 2px;padding:1px 6px;border-radius:3px;font-size:8px;background:#fef3c7;color:#92400e;font-weight:600">${m.name}</span>`
      ).join('')

      const hostList = clientHosting.map(h =>
        `<span style="display:inline-block;margin:1px 2px;padding:1px 6px;border-radius:3px;font-size:8px;background:#f0fdf4;color:#16a34a;font-weight:600">${h.description ?? h.project_pn ?? 'Hosting'}</span>`
      ).join('')

      const domList = clientDomains.slice(0, 6).map(d =>
        `<span style="display:inline-block;margin:1px 2px;padding:1px 6px;border-radius:3px;font-size:8px;background:#fafaf9;color:#374151;border:1px solid #e0e0dd">${d.domain_name}</span>`
      ).join('') + (clientDomains.length > 6 ? `<span style="font-size:8px;color:#6b7280"> +${clientDomains.length - 6}</span>` : '')

      const contact = [c.email, c.phone, c.website?.replace(/^https?:\/\//, ''), c.contact_person].filter(Boolean).join('  ·  ')

      return `
        <div class="client-card">
          <div class="card-header">
            <div>
              <div class="card-name">${c.name}</div>
              ${contact ? `<div class="card-contact">${contact}</div>` : ''}
            </div>
          </div>
          ${projList ? `<div class="card-section"><span class="tag-label">PROJECTS</span>${projList}</div>` : ''}
          ${maintList ? `<div class="card-section"><span class="tag-label">RETAINERS</span>${maintList}</div>` : ''}
          ${hostList ? `<div class="card-section"><span class="tag-label">HOSTING</span>${hostList}</div>` : ''}
          ${domList ? `<div class="card-section"><span class="tag-label">DOMAINS</span>${domList}</div>` : ''}
          ${c.notes ? `<div class="card-notes">${c.notes}</div>` : ''}
        </div>`
    }).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Figtree',sans-serif;background:#e8e8e5;color:#1a1a1a;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:210mm;min-height:297mm;margin:20px auto;padding:10mm 14mm;background:#fff;box-shadow:0 4px 40px rgba(0,0,0,.12)}
  @media print{body{background:#fff}.page{margin:0;box-shadow:none;width:210mm;min-height:unset}}
  @page{size:A4 portrait;margin:0}
  .doc-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6mm;border-bottom:2px solid #E85C1A;padding-bottom:5mm}
  .doc-title{font-size:13px;font-weight:700;color:#1a1a1a;margin-top:3px}
  .meta{text-align:right;font-size:9px;color:#6b7280;line-height:1.7}
  .summary{display:flex;gap:10px;margin-bottom:6mm}
  .sstat{background:#fafaf9;border:1px solid #e0e0dd;border-radius:6px;padding:5px 10px;flex:1;text-align:center}
  .sstat-val{font-size:13px;font-weight:800;color:#1a1a1a}
  .sstat-lbl{font-size:8px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
  .client-card{border:1px solid #e0e0dd;border-radius:8px;padding:9px 11px;margin-bottom:6px;break-inside:avoid}
  .card-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px}
  .card-name{font-size:13px;font-weight:800;color:#1a1a1a}
  .card-contact{font-size:9px;color:#6b7280;margin-top:1px}
  .card-stats{display:flex;gap:8px;shrink:0}
  .cstat{text-align:right}
  .cstat-val{font-size:11px;font-weight:800}
  .cstat-lbl{font-size:7px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
  .card-section{margin-top:4px;display:flex;align-items:flex-start;gap:4px;flex-wrap:wrap}
  .tag-label{font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;padding-top:2px;white-space:nowrap;min-width:52px}
  .card-notes{margin-top:4px;font-size:9px;color:#6b7280;font-style:italic;padding-top:3px;border-top:1px solid #f5f4f2}
  .footer{margin-top:8mm;border-top:1px solid #e0e0dd;padding-top:3mm;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8}
</style>
</head>
<body>
<div class="page">
  <div class="doc-header">
    <div>
      ${logoHtml}
      <div class="doc-title">Client Portfolio</div>
    </div>
    <div class="meta">
      <div>Exported ${today}</div>
      <div>${store.clients.length} active clients</div>
    </div>
  </div>
  <div class="summary">
    <div class="sstat"><div class="sstat-val">${store.clients.length}</div><div class="sstat-lbl">Active Clients</div></div>
    <div class="sstat"><div class="sstat-val">${pStore.projects.filter(p => p.status === 'active' && p.name !== OTHER_INCOME_PROJECT_NAME).length}</div><div class="sstat-lbl">Projects</div></div>
    <div class="sstat"><div class="sstat-val">${maintStore.maintenances.filter(m => m.status === 'active').length}</div><div class="sstat-lbl">Active Retainers</div></div>
    <div class="sstat"><div class="sstat-val">${infraStore.hostingClients.filter(h => h.status === 'active').length}</div><div class="sstat-lbl">Hosting</div></div>
    <div class="sstat"><div class="sstat-val">${domainStore.domains.filter(d => !d.archived).length}</div><div class="sstat-lbl">Domains</div></div>
  </div>
  ${clientCards}
  <div class="footer">
    <div>${agencyName || 'Renderspace'} · support@renderspace.si</div>
    <div>${today}</div>
  </div>
</div>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`

    openHtmlAsPdf(html)
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Clients</h1>
          <p>Manage client relationships and invoice history</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportPDF}>Export PDF</Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Client
          </Button>
        </div>
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
