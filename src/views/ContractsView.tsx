import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectsStore } from '../stores/projects'
import { useMaintenancesStore } from '../stores/maintenances'
import { useClientsStore } from '../stores/clients'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { PageHeader } from '../components/PageHeader'

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtEuro(n?: number | null) {
  if (!n) return '—'
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

function daysUntil(d: string) {
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
}

type ContractType = 'project' | 'retainer'

interface ContractRow {
  id: string
  type: ContractType
  ref: string
  name: string
  clientId: string
  clientName: string
  value: number | null
  valueLabel: string
  start: string | null
  end: string | null
  url: string | null
  status: string
  daysUntilEnd: number | null
}

export function ContractsView() {
  const navigate = useNavigate()
  const pStore = useProjectsStore()
  const mStore = useMaintenancesStore()
  const cStore = useClientsStore()

  const [typeFilter, setTypeFilter]     = useState<'all' | ContractType>('all')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring' | 'expired' | 'completed'>('all')
  const [search, setSearch]             = useState('')

  useEffect(() => {
    Promise.all([pStore.fetchAll(), mStore.fetchAll(), cStore.fetchAll()])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo<ContractRow[]>(() => {
    const projectRows: ContractRow[] = pStore.projects
      .filter(p => p.type !== 'internal' && p.name !== 'Other Income')
      .map(p => {
        const end = p.end_date ?? null
        const days = end ? daysUntil(end) : null
        let status: string = p.status
        if (end && days !== null && days < 0 && p.status === 'active') status = 'expired'
        return {
          id: p.id,
          type: 'project',
          ref: p.pn,
          name: p.name,
          clientId: p.client_id ?? '',
          clientName: p.client?.name ?? '—',
          value: p.contract_value ?? p.initial_contract_value ?? null,
          valueLabel: 'total',
          start: p.start_date ?? null,
          end,
          url: p.contract_url ?? null,
          status,
          daysUntilEnd: days,
        }
      })

    const retainerRows: ContractRow[] = mStore.maintenances.map(m => {
      const end = m.contract_end ?? null
      const days = end ? daysUntil(end) : null
      let status = m.status as string
      if (end && days !== null && days < 0 && m.status === 'active') status = 'expired'
      return {
        id: m.id,
        type: 'retainer',
        ref: m.contract_id ?? m.project_pn ?? '—',
        name: m.name,
        clientId: m.client_id,
        clientName: m.client?.name ?? '—',
        value: m.monthly_retainer,
        valueLabel: '/mo',
        start: m.contract_start,
        end,
        url: m.contract_url ?? null,
        status,
        daysUntilEnd: days,
      }
    })

    return [...projectRows, ...retainerRows].sort((a, b) => a.clientName.localeCompare(b.clientName))
  }, [pStore.projects, mStore.maintenances])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false
      if (clientFilter !== 'all' && r.clientId !== clientFilter) return false
      if (statusFilter === 'active' && r.status !== 'active') return false
      if (statusFilter === 'expiring' && (r.daysUntilEnd === null || r.daysUntilEnd < 0 || r.daysUntilEnd > 60)) return false
      if (statusFilter === 'expired' && r.status !== 'expired') return false
      if (statusFilter === 'completed' && r.status !== 'completed') return false
      if (search) {
        const q = search.toLowerCase()
        if (!r.name.toLowerCase().includes(q) && !r.clientName.toLowerCase().includes(q) && !r.ref.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [rows, typeFilter, clientFilter, statusFilter, search])

  const clients = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) if (r.clientId) seen.set(r.clientId, r.clientName)
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const expiringCount = rows.filter(r => r.daysUntilEnd !== null && r.daysUntilEnd >= 0 && r.daysUntilEnd <= 60).length
  const activeCount   = rows.filter(r => r.status === 'active').length

  function statusBadge(r: ContractRow) {
    if (r.status === 'expired') return <Badge variant="red">Expired</Badge>
    if (r.status === 'completed') return <Badge variant="gray">Completed</Badge>
    if (r.status === 'paused') return <Badge variant="amber">Paused</Badge>
    if (r.status === 'cancelled') return <Badge variant="red">Cancelled</Badge>
    if (r.daysUntilEnd !== null && r.daysUntilEnd <= 60 && r.daysUntilEnd >= 0)
      return <Badge variant="amber">Expiring {r.daysUntilEnd}d</Badge>
    return <Badge variant="green">Active</Badge>
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Contracts" subtitle="All project and retainer contracts" />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 px-6 pt-5 pb-1">
        <div className="bg-white rounded-[10px] border border-border p-4">
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-1">Total</div>
          <div className="text-[26px] font-extrabold">{rows.length}</div>
          <div className="text-xs text-muted-foreground">all contracts</div>
        </div>
        <div className="bg-white rounded-[10px] border border-border p-4">
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-1">Active</div>
          <div className="text-[26px] font-extrabold text-[#16a34a]">{activeCount}</div>
          <div className="text-xs text-muted-foreground">currently active</div>
        </div>
        <div className="bg-white rounded-[10px] border border-border p-4">
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-1">Expiring Soon</div>
          <div className={`text-[26px] font-extrabold ${expiringCount > 0 ? 'text-[#d97706]' : ''}`}>{expiringCount}</div>
          <div className="text-xs text-muted-foreground">within 60 days</div>
        </div>
        <div className="bg-white rounded-[10px] border border-border p-4">
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-1">Retainers</div>
          <div className="text-[26px] font-extrabold">{rows.filter(r => r.type === 'retainer').length}</div>
          <div className="text-xs text-muted-foreground">maintenance contracts</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3">
        <input
          className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white w-48 focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['all', 'project', 'retainer'] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded text-[12px] font-semibold border-none cursor-pointer transition-all ${typeFilter === t ? 'bg-white shadow-sm text-foreground' : 'bg-transparent text-muted-foreground'}`}>
              {t === 'all' ? 'All' : t === 'project' ? 'Projects' : 'Retainers'}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['all', 'active', 'expiring', 'expired', 'completed'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded text-[12px] font-semibold border-none cursor-pointer transition-all ${statusFilter === s ? 'bg-white shadow-sm text-foreground' : 'bg-transparent text-muted-foreground'}`}>
              {s === 'all' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={clientFilter}
          onChange={e => setClientFilter(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none"
        >
          <option value="all">All Clients</option>
          {clients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        {(typeFilter !== 'all' || clientFilter !== 'all' || statusFilter !== 'all' || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setTypeFilter('all'); setClientFilter('all'); setStatusFilter('all'); setSearch('') }}>
            Clear
          </Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} contracts</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        <Card>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Ref</th>
                <th>Name</th>
                <th>Client</th>
                <th>Value</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-muted-foreground py-10">No contracts found</td></tr>
              ) : filtered.map(r => (
                <tr key={r.type + r.id} className="hover:bg-[#fafaf9]">
                  <td>
                    <Badge variant={r.type === 'project' ? 'blue' : 'amber'}>
                      {r.type === 'project' ? 'Project' : 'Retainer'}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground text-[11px] font-semibold">{r.ref}</td>
                  <td
                    className="font-semibold text-primary hover:underline cursor-pointer"
                    onClick={() => navigate(r.type === 'project' ? `/projects/${r.id}` : `/maintenances/${r.id}`)}
                  >
                    {r.name}
                  </td>
                  <td className="text-sm text-muted-foreground">{r.clientName}</td>
                  <td className="text-right font-semibold text-[13px]">
                    {r.value ? (
                      <span>{fmtEuro(r.value)}<span className="text-[10px] text-muted-foreground font-normal"> {r.valueLabel}</span></span>
                    ) : '—'}
                  </td>
                  <td className="text-[13px] text-muted-foreground">{fmtDate(r.start)}</td>
                  <td className={`text-[13px] font-medium ${r.daysUntilEnd !== null && r.daysUntilEnd <= 60 && r.daysUntilEnd >= 0 ? 'text-[#d97706]' : r.daysUntilEnd !== null && r.daysUntilEnd < 0 ? 'text-[#dc2626]' : 'text-muted-foreground'}`}>
                    {fmtDate(r.end)}
                  </td>
                  <td>{statusBadge(r)}</td>
                  <td>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#E85C1A] text-xs hover:underline">View</a>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  )
}
