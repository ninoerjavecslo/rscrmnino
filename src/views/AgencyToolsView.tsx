import { useEffect, useMemo, useState } from 'react'
import { useAgencyToolsStore, type AgencyTool } from '../stores/agencyTools'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { toast } from '../lib/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PageHeader } from '../components/PageHeader'
import { Select } from '../components/Select'
import * as XLSX from 'xlsx'
import { buildLogoHtml, openHtmlAsPdf } from '../lib/pdfExport'
import { useSettingsStore } from '../stores/settings'

const CATEGORIES = [
  'Design', 'Development', 'Communication', 'Project Management',
  'Marketing', 'Analytics', 'Finance', 'Security', 'Storage',
  'AI', 'Hosting', 'Other',
]

type FormState = {
  name: string
  category: string
  billing_cycle: 'monthly' | 'yearly' | 'one-time'
  cost: string
  url: string
  email: string
  notes: string
  status: 'active' | 'inactive'
  paying_from: string
  billable: boolean
  client_id: string
  billing_from: string
  project_id: string
}

const EMPTY_FORM: FormState = {
  name: '', category: '', billing_cycle: 'monthly',
  cost: '', url: '', email: '', notes: '', status: 'active', paying_from: '',
  billable: false, client_id: '', billing_from: '', project_id: '',
}

function monthlyEquivalent(t: AgencyTool) {
  if (t.billing_cycle === 'one-time') return 0
  return t.billing_cycle === 'yearly' ? t.cost / 12 : t.cost
}

function yearlyEquivalent(t: AgencyTool) {
  if (t.billing_cycle === 'one-time') return t.cost
  return t.billing_cycle === 'monthly' ? t.cost * 12 : t.cost
}

export function AgencyToolsView() {
  const store = useAgencyToolsStore()
  const { clients, fetchAll: fetchClients } = useClientsStore()
  const { projects, fetchAll: fetchProjects } = useProjectsStore()
  const settingsStore = useSettingsStore()
  const [showModal, setShowModal]       = useState(false)
  const [editTarget, setEditTarget]     = useState<AgencyTool | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AgencyTool | null>(null)
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving]             = useState(false)
  const [search, setSearch]             = useState('')
  const [catFilter, setCatFilter]       = useState('all')
  const [cycleFilter, setCycleFilter]   = useState<'all' | 'monthly' | 'yearly'>('all')

  useEffect(() => { store.fetchAll(); fetchClients(); fetchProjects() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function openAdd() {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(t: AgencyTool) {
    setEditTarget(t)
    setForm({
      name:          t.name,
      category:      t.category,
      billing_cycle: t.billing_cycle,
      cost:          String(t.cost),
      url:           t.url ?? '',
      email:         t.email ?? '',
      notes:         t.notes ?? '',
      status:        t.status,
      paying_from:   t.paying_from ? t.paying_from.slice(0, 7) : '',
      billable:      t.billable,
      client_id:     t.client_id ?? '',
      billing_from:  t.billing_from ? t.billing_from.slice(0, 7) : '',
      project_id:    t.project_id ?? '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.cost) return
    setSaving(true)
    try {
      const payload = {
        name:          form.name.trim(),
        category:      form.category || 'Other',
        billing_cycle: form.billing_cycle,
        cost:          parseFloat(form.cost) || 0,
        url:           form.url || null,
        email:         form.email || null,
        notes:         form.notes || null,
        status:        form.status,
        paying_from:   form.paying_from ? form.paying_from + '-01' : null,
        billable:      form.billable,
        client_id:     form.billable && form.client_id ? form.client_id : null,
        billing_from:  form.billable && form.billing_from ? form.billing_from + '-01' : null,
        project_id:    form.billable && form.client_id && form.project_id ? form.project_id : null,
      }
      if (editTarget) {
        await store.update(editTarget.id, payload)
        toast('success', 'Tool updated')
      } else {
        await store.add(payload)
        toast('success', 'Tool added')
      }
      setShowModal(false)
    } catch {
      toast('error', 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await store.remove(deleteTarget.id)
      toast('success', 'Tool removed')
      setDeleteTarget(null)
    } catch {
      toast('error', 'Failed to delete')
    }
  }

  const activeTools = store.tools.filter(t => t.status === 'active')

  const totalMonthly = useMemo(() =>
    activeTools.reduce((s, t) => s + monthlyEquivalent(t), 0)
  , [activeTools])

  const totalYearly = useMemo(() =>
    activeTools.reduce((s, t) => s + yearlyEquivalent(t), 0)
  , [activeTools])

  const categories = useMemo(() =>
    [...new Set(store.tools.map(t => t.category))].sort()
  , [store.tools])

  const filtered = useMemo(() => {
    return store.tools.filter(t => {
      if (catFilter !== 'all' && t.category !== catFilter) return false
      if (cycleFilter !== 'all' && t.billing_cycle !== cycleFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!t.name.toLowerCase().includes(q) && !t.category.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [store.tools, catFilter, cycleFilter, search])

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, AgencyTool[]>()
    for (const t of filtered) {
      const arr = map.get(t.category) ?? []
      arr.push(t)
      map.set(t.category, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  function fmtMonth(d?: string | null) {
    if (!d) return '—'
    const [y, m] = d.split('-')
    return `${m}/${y}`
  }

  function fmtEuro(n: number) {
    return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  }

  function exportRows() {
    return store.tools.map(t => ({
      tool:         t.name,
      category:     t.category,
      billing:      t.billing_cycle,
      cost_mo:      t.billing_cycle === 'one-time' ? 0 : (t.billing_cycle === 'yearly' ? t.cost / 12 : t.cost),
      cost_yr:      yearlyEquivalent(t),
      billable:     t.billable ? 'Yes' : 'No',
      client:       clients.find(c => c.id === t.client_id)?.name ?? '—',
      project:      projects.find(p => p.id === t.project_id)?.name ?? '—',
      paying_from:  fmtMonth(t.paying_from),
      billing_from: fmtMonth(t.billing_from),
      status:       t.status,
      notes:        t.notes ?? '',
    }))
  }

  function exportPDF() {
    const { agencyLogo, agencyName } = settingsStore
    const logoHtml = buildLogoHtml(agencyLogo, agencyName)
    const today = new Date().toLocaleDateString('en-GB')
    const activeTools = store.tools.filter(t => t.status === 'active')
    const totalMo = activeTools.reduce((s, t) => s + monthlyEquivalent(t), 0)
    const totalYr = activeTools.reduce((s, t) => s + yearlyEquivalent(t), 0)
    const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

    const rows = exportRows().map(r => `
      <tr>
        <td class="tool-name">${r.tool}</td>
        <td>${r.category}</td>
        <td><span class="badge badge-${r.billing}">${r.billing}</span></td>
        <td class="num">${r.cost_mo > 0 ? fmt(r.cost_mo) : '—'}</td>
        <td class="num">${fmt(r.cost_yr)}</td>
        <td><span class="badge badge-${r.billable === 'Yes' ? 'yes' : 'no'}">${r.billable}</span></td>
        <td>${r.client}</td>
        <td>${r.project}</td>
        <td class="mono">${r.paying_from}</td>
        <td class="mono">${r.billing_from}</td>
        <td><span class="badge badge-${r.status}">${r.status}</span></td>
        <td class="notes">${r.notes}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Figtree',sans-serif;background:#e8e8e5;color:#1a1a1a;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:297mm;min-height:210mm;margin:20px auto;padding:10mm 14mm;background:#fff;box-shadow:0 4px 40px rgba(0,0,0,.12)}
  @media print{body{background:#fff}.page{margin:0;box-shadow:none;width:297mm;min-height:unset}}
  @page{size:A4 landscape;margin:0}
  .doc-header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:6mm;border-bottom:2px solid #E85C1A;padding-bottom:5mm}
  .doc-title{font-size:13px;font-weight:700;color:#1a1a1a;margin-top:3px}
  .meta{text-align:right;font-size:9px;color:#6b7280;line-height:1.7}
  .summary{display:flex;gap:10px;margin-bottom:6mm}
  .sstat{background:#fafaf9;border:1px solid #e0e0dd;border-radius:6px;padding:5px 10px;flex:1;text-align:center}
  .sstat-val{font-size:14px;font-weight:800;color:#1a1a1a}
  .sstat-val.red{color:#dc2626}
  .sstat-lbl{font-size:7.5px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-top:1px}
  table{width:100%;border-collapse:collapse;font-size:9px}
  thead tr{background:#0f172a;color:#fff}
  thead th{padding:5px 7px;text-align:left;font-weight:700;font-size:8px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
  thead th.num{text-align:right}
  tbody tr:nth-child(even){background:#f8fafc}
  tbody tr:hover{background:#f1f5f9}
  td{padding:5px 7px;border-bottom:1px solid #f0f0ee;vertical-align:middle}
  td.tool-name{font-weight:700;color:#1a1a1a}
  td.num{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
  td.mono{color:#6b7280;font-variant-numeric:tabular-nums}
  td.notes{color:#6b7280;font-style:italic;max-width:120px}
  .badge{display:inline-block;padding:1px 6px;border-radius:3px;font-size:7.5px;font-weight:700;text-transform:capitalize}
  .badge-monthly{background:#dbeafe;color:#1d4ed8}
  .badge-yearly{background:#fef3c7;color:#92400e}
  .badge-one-time{background:#f3f4f6;color:#374151}
  .badge-yes{background:#dcfce7;color:#16a34a}
  .badge-no{background:#f3f4f6;color:#6b7280}
  .badge-active{background:#dcfce7;color:#16a34a}
  .badge-inactive{background:#f3f4f6;color:#6b7280}
  .footer{margin-top:6mm;border-top:1px solid #e0e0dd;padding-top:3mm;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8}
</style>
</head>
<body>
<div class="page">
  <div class="doc-header">
    <div>
      ${logoHtml}
      <div class="doc-title">Software &amp; Tools</div>
    </div>
    <div class="meta">
      <div>Exported ${today}</div>
      <div>${store.tools.length} tools total · ${activeTools.length} active</div>
    </div>
  </div>
  <div class="summary">
    <div class="sstat"><div class="sstat-val">${activeTools.length}</div><div class="sstat-lbl">Active Tools</div></div>
    <div class="sstat"><div class="sstat-val red">${fmt(totalMo)}</div><div class="sstat-lbl">Monthly Cost</div></div>
    <div class="sstat"><div class="sstat-val red">${fmt(totalYr)}</div><div class="sstat-lbl">Yearly Cost</div></div>
    <div class="sstat"><div class="sstat-val">${store.tools.filter(t => t.billable).length}</div><div class="sstat-lbl">Billable</div></div>
    <div class="sstat"><div class="sstat-val">${[...new Set(store.tools.map(t => t.category))].length}</div><div class="sstat-lbl">Categories</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Tool</th><th>Category</th><th>Billing</th>
        <th class="num">Cost /mo</th><th class="num">Cost /yr</th>
        <th>Billable</th><th>Client</th><th>Project</th>
        <th>Paying From</th><th>Billing From</th><th>Status</th><th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <div>${agencyName || 'Renderspace'}</div>
    <div>${today}</div>
  </div>
</div>
<script>window.onload=function(){window.print()}</script>
</body>
</html>`

    openHtmlAsPdf(html)
  }

  function exportExcel() {
    const rows = exportRows()
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'Tool':         r.tool,
      'Category':     r.category,
      'Billing':      r.billing,
      'Cost /mo (€)': r.cost_mo,
      'Cost /yr (€)': r.cost_yr,
      'Billable':     r.billable,
      'Client':       r.client,
      'Project':      r.project,
      'Paying From':  r.paying_from,
      'Billing From': r.billing_from,
      'Status':       r.status,
      'Notes':        r.notes,
    })))
    // Column widths
    ws['!cols'] = [22,16,10,14,14,10,20,20,12,12,10,30].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Tools')
    XLSX.writeFile(wb, 'tools.xlsx')
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Software & Tools" subtitle="Agency subscriptions and SaaS costs">
        <Button variant="outline" size="sm" onClick={exportExcel}>↓ Excel</Button>
        <Button variant="outline" size="sm" onClick={exportPDF}>↓ PDF</Button>
        <Button onClick={openAdd}>+ Add Tool</Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 px-6 pt-5 pb-1">
        <div className="bg-white rounded-[10px] border border-border p-4">
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-1">Active Tools</div>
          <div className="text-[26px] font-extrabold">{activeTools.length}</div>
          <div className="text-xs text-muted-foreground">subscriptions</div>
        </div>
        <div className="bg-white rounded-[10px] border border-border p-4">
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-1">Monthly Cost</div>
          <div className="text-[26px] font-extrabold text-[#dc2626]">{fmtEuro(totalMonthly)}</div>
          <div className="text-xs text-muted-foreground">avg per month</div>
        </div>
        <div className="bg-white rounded-[10px] border border-border p-4">
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-1">Yearly Cost</div>
          <div className="text-[26px] font-extrabold text-[#dc2626]">{fmtEuro(totalYearly)}</div>
          <div className="text-xs text-muted-foreground">total per year</div>
        </div>
        <div className="bg-white rounded-[10px] border border-border p-4">
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-[.09em] mb-1">Categories</div>
          <div className="text-[26px] font-extrabold">{categories.length}</div>
          <div className="text-xs text-muted-foreground">tool categories</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-6 py-3">
        <div style={{ width: 160, flexShrink: 0 }}>
          <input
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select
          compact
          value={catFilter}
          onChange={setCatFilter}
          style={{ width: 160, flexShrink: 0 }}
          options={[{ value: 'all', label: 'All Categories' }, ...categories.map(c => ({ value: c, label: c }))]}
        />
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {(['all', 'monthly', 'yearly'] as const).map(c => (
            <button key={c} onClick={() => setCycleFilter(c)}
              className={`px-3 py-1 rounded text-[12px] font-semibold border-none cursor-pointer transition-all ${cycleFilter === c ? 'bg-white shadow-sm text-foreground' : 'bg-transparent text-muted-foreground'}`}>
              {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
        {(catFilter !== 'all' || cycleFilter !== 'all' || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setCatFilter('all'); setCycleFilter('all'); setSearch('') }}>Clear</Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} tools</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto px-6 pb-6 flex flex-col gap-5">
        {store.loading ? (
          <div className="text-center text-muted-foreground py-10">Loading…</div>
        ) : grouped.length === 0 ? (
          <Card>
            <div className="text-center py-14 px-5">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2 text-muted-foreground opacity-40">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
              <div className="font-bold text-[15px] text-[#374151] mb-1">No tools yet</div>
              <div className="text-sm text-muted-foreground mb-4">Track your agency's software subscriptions</div>
              <Button size="sm" onClick={openAdd}>+ Add Tool</Button>
            </div>
          </Card>
        ) : grouped.map(([category, tools]) => (
          <div key={category}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">{category}</h2>
              <span className="text-[11px] text-muted-foreground flex flex-col items-end gap-0">
                {(() => {
                  const active = tools.filter(t => t.status === 'active')
                  const mo = active.reduce((s, t) => s + monthlyEquivalent(t), 0)
                  const yr = active.reduce((s, t) => s + yearlyEquivalent(t), 0)
                  return <>
                    {mo > 0 && <span>{fmtEuro(mo)} /mo</span>}
                    <span>{fmtEuro(yr)} /yr</span>
                  </>
                })()}
              </span>
            </div>
            <Card>
              <table>
                <thead>
                  <tr>
                    <th>Tool</th>
                    <th>Client</th>
                    <th>Project</th>
                    <th>Category</th>
                    <th>Billing</th>
                    <th>Cost</th>
                    <th>Billable</th>
                    <th>Paying From</th>
                    <th>Billing From</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map(t => {
                    const client = clients.find(c => c.id === t.client_id)
                    const project = projects.find(p => p.id === t.project_id)
                    return (
                    <tr key={t.id} className={t.status === 'inactive' ? 'opacity-50' : ''}>
                      <td>
                        <div className="font-semibold text-[13px]">
                          {t.url ? (
                            <a href={t.url.startsWith('http') ? t.url : `https://${t.url}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t.name}</a>
                          ) : t.name}
                        </div>
                        {t.notes && <div className="text-[11px] text-muted-foreground">{t.notes}</div>}
                      </td>
                      <td className="text-[13px] text-muted-foreground">{client ? client.name : '—'}</td>
                      <td className="text-[13px] text-muted-foreground">{project ? project.name : '—'}</td>
                      <td><Badge variant="gray">{t.category}</Badge></td>
                      <td>
                        <Badge variant={t.billing_cycle === 'monthly' ? 'blue' : t.billing_cycle === 'yearly' ? 'amber' : 'gray'}>
                          {t.billing_cycle === 'monthly' ? 'Monthly' : t.billing_cycle === 'yearly' ? 'Yearly' : 'One-time'}
                        </Badge>
                      </td>
                      <td className="font-semibold text-[13px]">
                        {t.billing_cycle === 'one-time' ? (
                          <>
                            {fmtEuro(t.cost)}
                            <div className="text-[10px] text-muted-foreground font-normal">one-time</div>
                          </>
                        ) : (
                          <>
                            {fmtEuro(t.billing_cycle === 'yearly' ? t.cost / 12 : t.cost)}
                            <span className="text-[10px] text-muted-foreground font-normal">/mo</span>
                            <div className="text-[10px] text-muted-foreground font-normal">{fmtEuro(yearlyEquivalent(t))}/yr</div>
                          </>
                        )}
                      </td>
                      <td>
                        <Badge variant={t.billable ? 'green' : 'gray'}>{t.billable ? 'Billable' : 'Non-billable'}</Badge>
                      </td>
                      <td className="text-[13px] text-muted-foreground">{fmtMonth(t.paying_from)}</td>
                      <td className="text-[13px] text-muted-foreground">{fmtMonth(t.billing_from)}</td>
                      <td>
                        <Badge variant={t.status === 'active' ? 'green' : 'gray'}>
                          {t.status === 'active' ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap">
                        <Button variant="outline" size="xs" onClick={() => openEdit(t)}>Edit</Button>
                        {' '}
                        <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeleteTarget(t)}>Delete</Button>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          </div>
        ))}
      </div>

      {/* Modal */}
      <Modal
        open={showModal}
        title={editTarget ? 'Edit Tool' : 'New Tool'}
        onClose={() => setShowModal(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.cost}>
              {saving ? 'Saving…' : editTarget ? 'Save' : 'Add Tool'}
            </Button>
          </>
        }
      >
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Tool Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Figma" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Category</label>
            <Select
              value={form.category}
              onChange={v => setForm(f => ({ ...f, category: v }))}
              placeholder="— Select —"
              options={CATEGORIES.map(c => ({ value: c, label: c }))}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Status</label>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 mt-0.5">
              {(['active', 'inactive'] as const).map(s => (
                <button key={s} type="button" onClick={() => setForm(f => ({ ...f, status: s }))}
                  className={`flex-1 py-1.5 rounded text-[13px] border-none cursor-pointer font-inherit transition-all ${
                    form.status === s ? `bg-white shadow-sm font-bold ${s === 'active' ? 'text-[#16a34a]' : 'text-muted-foreground'}` : 'bg-transparent font-medium text-muted-foreground'
                  }`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Cost (€) *</label>
            <input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} placeholder="29.00" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Billing Cycle</label>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 mt-0.5">
              {(['monthly', 'yearly', 'one-time'] as const).map(c => (
                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, billing_cycle: c }))}
                  className={`flex-1 py-1.5 rounded text-[12px] border-none cursor-pointer font-inherit transition-all ${
                    form.billing_cycle === c ? 'bg-white shadow-sm font-bold text-foreground' : 'bg-transparent font-medium text-muted-foreground'
                  }`}>
                  {c === 'one-time' ? 'One-time' : c.charAt(0).toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Website URL</label>
            <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://figma.com" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Account Email</label>
            <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="account@renderspace.si" />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Paying From</label>
          <input type="month" value={form.paying_from} onChange={e => setForm(f => ({ ...f, paying_from: e.target.value }))} />
          <p className="text-xs text-muted-foreground mt-1">Month the agency subscription started</p>
        </div>

        {/* Billable section */}
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-2">Billable to Client</label>
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {([false, true] as const).map(b => (
              <button key={String(b)} type="button" onClick={() => setForm(f => ({ ...f, billable: b }))}
                className={`flex-1 py-1.5 rounded text-[13px] border-none cursor-pointer font-inherit transition-all ${
                  form.billable === b
                    ? `bg-white shadow-sm font-bold ${b ? 'text-[#16a34a]' : 'text-muted-foreground'}`
                    : 'bg-transparent font-medium text-muted-foreground'
                }`}>
                {b ? 'Billable' : 'Non-billable'}
              </button>
            ))}
          </div>
        </div>
        {form.billable && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Client</label>
                <Select
                  value={form.client_id}
                  onChange={v => setForm(f => ({ ...f, client_id: v, project_id: '' }))}
                  placeholder="— Select client —"
                  options={clients.map(c => ({ value: c.id, label: c.name }))}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Billing From</label>
                <input type="month" value={form.billing_from} onChange={e => setForm(f => ({ ...f, billing_from: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">Month to start charging</p>
              </div>
            </div>
            {form.client_id && (
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Project <span className="font-normal normal-case text-muted-foreground">(optional — leave blank for all projects)</span></label>
                <Select
                  value={form.project_id}
                  onChange={v => setForm(f => ({ ...f, project_id: v }))}
                  placeholder="— All projects —"
                  options={projects
                    .filter(p => p.client_id === form.client_id)
                    .map(p => ({ value: p.id, label: p.name }))}
                />
              </div>
            )}
          </>
        )}

        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Plan, seats, usage…" rows={2} />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove Tool"
        message={`Remove ${deleteTarget?.name} from the stack?`}
        confirmLabel="Remove"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
