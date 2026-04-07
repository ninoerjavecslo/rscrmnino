import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMaintenancesStore } from '../stores/maintenances'
import { useSettingsStore } from '../stores/settings'
import type { HostingPayload } from '../stores/maintenances'
import { useClientsStore } from '../stores/clients'
import { useProjectsStore } from '../stores/projects'
import { useInfraStore } from '../stores/infrastructure'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import type { Maintenance } from '../lib/types'
import { buildLogoHtml, openHtmlAsPdf } from '../lib/pdfExport'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EditMaintenanceModal, validateHostingFields } from '../components/EditMaintenanceModal'
import type { MaintenanceFormState } from '../components/EditMaintenanceModal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { usePagePermission } from '../lib/usePagePermission'
import * as XLSX from 'xlsx'

function fmtEuro(n: number) {
  return n.toLocaleString('en-EU') + ' €'
}
function fmtDate(d?: string | null) {
  if (!d) return 'Open-ended'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
function daysUntil(d: string) {
  return Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
}

const STATUS_BADGE: Record<string, 'green' | 'amber' | 'red'> = {
  active: 'green',
  paused: 'amber',
  cancelled: 'red',
}


const EMPTY_FORM: MaintenanceFormState = {
  client_id: '', project_pn: '', name: '', monthly_retainer: '', billing_cycle: 'monthly', billing_month: '1',
  help_requests_included: '', hours_included: '',
  contract_id: '', contract_start: '', contract_duration_months: '', contract_url: '',
  status: 'active', notes: '', cms: '',
  hosting_enabled: false,
  hosting_project_pn: '', hosting_description: '',
  hosting_cycle: 'monthly', hosting_amount: '',
}

function computeContractEnd(start: string, durationMonths: string): string | null {
  if (!start || !durationMonths) return null
  const n = parseInt(durationMonths)
  if (!n || n <= 0) return null
  const [y, m] = start.split('-').map(Number)
  const d = new Date(y, m - 1 + n - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export function MaintenancesView() {
  const store = useMaintenancesStore()
  const cStore = useClientsStore()
  const pStore = useProjectsStore()
  const settingsStore = useSettingsStore()
  const infraStore = useInfraStore()
  const navigate = useNavigate()
  const { canEdit } = usePagePermission('maintenances')

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Maintenance | null>(null)
  const [form, setForm] = useState<MaintenanceFormState>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Maintenance | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function init() {
      await Promise.all([store.fetchAll(), cStore.fetchAll(), pStore.fetchAll(), infraStore.fetchAll()])
      // Deep-link: ?edit=<id> from ClientDetailView
      const params = new URLSearchParams(window.location.search)
      const editId = params.get('edit')
      if (editId) {
        const m = store.maintenances.find(m => m.id === editId)
        if (m) openEdit(m)
      }
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const active = store.maintenances.filter(m => m.status === 'active')
  const totalMonthly = active.reduce((s, m) => s + m.monthly_retainer, 0)
  const totalHours = active.reduce((s, m) => s + m.hours_included, 0)
  const expiringSoon = store.maintenances.filter(m =>
    m.status === 'active' && m.contract_end && daysUntil(m.contract_end) <= 30
  ).length

  function openAdd() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setShowModal(true)
  }

  async function openEdit(m: Maintenance) {
    setEditing(m)
    // Check for linked hosting — first by maintenance_id, then fall back to client_id
    let { data: hosting } = await supabase
      .from('hosting_clients')
      .select('*')
      .eq('maintenance_id', m.id)
      .maybeSingle()
    if (!hosting) {
      const { data: fallback } = await supabase
        .from('hosting_clients')
        .select('*')
        .eq('client_id', m.client_id)
        .is('maintenance_id', null)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      hosting = fallback
    }

    setForm({
      client_id: m.client_id,
      project_pn: m.project_pn ?? '',
      name: m.name,
      monthly_retainer: String(m.monthly_retainer),
      billing_cycle: m.billing_cycle ?? 'monthly',
      billing_month: String(m.billing_month ?? 1),
      help_requests_included: String(m.help_requests_included),
      hours_included: String(m.hours_included),
      contract_start: m.contract_start.slice(0, 7),
      contract_duration_months: (() => {
        if (!m.contract_end) return ''
        const from = new Date(m.contract_start + 'T00:00:00')
        const to = new Date(m.contract_end + 'T00:00:00')
        return String((to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1)
      })(),
      contract_id: m.contract_id ?? '',
      contract_url: m.contract_url ?? '',
      status: m.status,
      notes: m.notes ?? '',
      cms: m.cms ?? '',
      hosting_enabled: !!hosting,
      hosting_project_pn: hosting?.project_pn ?? '',
      hosting_description: hosting?.description ?? '',
      hosting_cycle: hosting?.cycle ?? 'monthly',
      hosting_amount: hosting ? String(hosting.amount) : '',
    })
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditing(null)
    setForm({ ...EMPTY_FORM })
  }


  async function save() {
    if (!form.client_id || !form.name || !form.monthly_retainer || !form.contract_start) return

    const hostingError = validateHostingFields(form)
    if (hostingError) { toast('error', hostingError); return }

    setSaving(true)
    try {
      const payload = {
        client_id: form.client_id,
        project_pn: form.project_pn.trim() || null,
        name: form.name.trim(),
        monthly_retainer: Number(form.monthly_retainer),
        billing_cycle: form.billing_cycle,
        billing_month: form.billing_cycle === 'annual' ? Number(form.billing_month) || 1 : null,
        help_requests_included: Number(form.help_requests_included) || 0,
        hours_included: Number(form.hours_included) || 0,
        contract_id: form.contract_id.trim() || null,
        contract_start: form.contract_start + '-01',
        contract_end: computeContractEnd(form.contract_start, form.contract_duration_months),
        contract_url: form.contract_url.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
        cms: form.cms.trim() || null,
      }

      const hosting: HostingPayload | null = form.hosting_enabled && form.hosting_project_pn && form.hosting_amount
        ? {
            project_pn: form.hosting_project_pn,
            description: form.hosting_description.trim(),
            cycle: form.hosting_cycle,
            amount: Number(form.hosting_amount),
            billing_since: form.contract_start + '-01',
            contract_id: form.contract_id.trim() || null,
          }
        : null

      if (editing) {
        await store.update(editing.id, payload, hosting)
        toast('success', 'Maintenance contract updated')
      } else {
        await store.add(payload, hosting)
        toast('success', 'Maintenance contract added')
      }
      closeModal()
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await store.remove(deleteTarget.id)
      toast('success', 'Contract deleted')
      setDeleteTarget(null)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setDeleting(false)
    }
  }

  function exportExcel() {
    const rows = store.maintenances.map(m => ({
      Client:            m.client?.name ?? '',
      Contract:          m.name,
      'Contract ID':     m.contract_id ?? '',
      'Project #':       m.project_pn ?? '',
      Status:            m.status,
      'Retainer (€/mo)': m.monthly_retainer,
      'Billing Cycle':   m.billing_cycle,
      'Requests/mo':     m.help_requests_included,
      'Hours/mo':        m.hours_included,
      CMS:               m.cms ?? '',
      Start:             m.contract_start ? m.contract_start.slice(0, 7) : '',
      End:               m.contract_end   ? m.contract_end.slice(0, 7)   : 'Open-ended',
      Hosting:           (m.hosting_clients && m.hosting_clients.length > 0) ? 'Yes' : 'No',
      Notes:             m.notes ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Maintenances')
    XLSX.writeFile(wb, `maintenances-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function exportPDF() {
    const { agencyLogo, agencyName } = settingsStore
    const logoHtml = buildLogoHtml(agencyLogo, agencyName)
    const today = new Date().toLocaleDateString('en-GB')
    const statusColor: Record<string, string> = { active: '#16a34a', paused: '#d97706', cancelled: '#dc2626' }
    const statusBg: Record<string, string> = { active: '#f0fdf4', paused: '#fffbeb', cancelled: '#fff1f2' }

    const rows = store.maintenances.map((m, i) => {
      const hosting = infraStore.hostingClients.find(h => h.maintenance_id === m.id)
      const bg = i % 2 === 0 ? '#ffffff' : '#fafaf9'
      const endCell = m.contract_end
        ? (m.status === 'active' && daysUntil(m.contract_end) <= 30
          ? `<td style="background:${bg};color:#d97706;font-weight:700">${m.contract_end.slice(0,7)}</td>`
          : `<td style="background:${bg}">${m.contract_end.slice(0,7)}</td>`)
        : `<td style="background:${bg};color:#94a3b8">Open</td>`
      const hostingCell = hosting
        ? `<td style="background:${bg}"><span style="color:#E85C1A;font-weight:600">${hosting.amount} € <span style="font-weight:400;font-size:9px;color:#6b7280">/ ${hosting.cycle === 'yearly' ? 'yr' : 'mo'}</span></span><br><span style="font-size:9px;color:#6b7280">${hosting.description ?? ''}</span></td>`
        : `<td style="background:${bg};color:#d1d5db">—</td>`
      return `<tr>
        <td style="background:${bg};font-weight:600;color:#1a1a1a">${m.client?.name ?? '—'}</td>
        <td style="background:${bg}"><span style="font-weight:700">${m.name}</span>${m.contract_id ? `<br><span style="font-size:9px;color:#6b7280">${m.contract_id}${m.project_pn ? ' · ' + m.project_pn : ''}</span>` : (m.project_pn ? `<br><span style="font-size:9px;color:#6b7280">${m.project_pn}</span>` : '')}</td>
        <td style="background:${bg}"><span style="display:inline-block;padding:2px 7px;border-radius:99px;font-size:9px;font-weight:700;color:${statusColor[m.status]};background:${statusBg[m.status]}">${m.status.charAt(0).toUpperCase() + m.status.slice(1)}</span></td>
        <td style="background:${bg};font-weight:700;color:#16a34a;text-align:right">${m.monthly_retainer} €<br><span style="font-size:9px;font-weight:400;color:#6b7280">${m.billing_cycle === 'annual' ? '/yr' : '/mo'}</span></td>
        <td style="background:${bg};text-align:right">${m.help_requests_included}</td>
        <td style="background:${bg};text-align:right">${m.hours_included}h</td>
        <td style="background:${bg}">${m.contract_start.slice(0,7)}</td>
        ${endCell}
        <td style="background:${bg};color:#6b7280">${m.cms ?? '—'}</td>
        ${hostingCell}
      </tr>`
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
  .page{width:297mm;min-height:210mm;margin:20px auto;padding:10mm 14mm;background:#fff;box-shadow:0 4px 40px rgba(0,0,0,.12)}
  @media print{body{background:#fff}.page{margin:0;box-shadow:none;width:297mm;height:210mm}}
  @page{size:A4 landscape;margin:0}
  .header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8mm;border-bottom:2px solid #E85C1A;padding-bottom:5mm}
.doc-title{font-size:13px;font-weight:700;color:#1a1a1a;margin-top:2px}
  .meta{text-align:right;font-size:10px;color:#6b7280;line-height:1.7}
  .stats{display:flex;gap:12px;margin-bottom:6mm}
  .stat{background:#fafaf9;border:1px solid #e0e0dd;border-radius:6px;padding:6px 12px;flex:1;text-align:center}
  .stat-val{font-size:15px;font-weight:800;color:#1a1a1a}
  .stat-lbl{font-size:9px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-top:1px}
  table{width:100%;border-collapse:collapse}
  th{background:#1a1a1a;color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;padding:5px 8px;text-align:left;white-space:nowrap}
  th.r{text-align:right}
  td{padding:5px 8px;border-bottom:1px solid #f0efed;font-size:10.5px;vertical-align:top}
  .footer{margin-top:6mm;border-top:1px solid #e0e0dd;padding-top:3mm;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      ${logoHtml}
      <div class="doc-title">Maintenance Contracts</div>
    </div>
    <div class="meta">
      <div>Exported ${today}</div>
      <div>support@renderspace.si</div>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-val">${active.length}</div><div class="stat-lbl">Active</div></div>
    <div class="stat"><div class="stat-val">${store.maintenances.length}</div><div class="stat-lbl">Total</div></div>
    <div class="stat"><div class="stat-val" style="color:#16a34a">${fmtEuro(totalMonthly)}</div><div class="stat-lbl">Monthly Retainer</div></div>
    <div class="stat"><div class="stat-val">${totalHours}h</div><div class="stat-lbl">Hours / mo</div></div>
    <div class="stat"><div class="stat-val" style="color:${expiringSoon > 0 ? '#d97706' : '#1a1a1a'}">${expiringSoon}</div><div class="stat-lbl">Expiring Soon</div></div>
  </div>
  <table>
    <thead><tr>
      <th>Client</th><th>Contract</th><th>Status</th><th class="r">Retainer</th>
      <th class="r">Req</th><th class="r">Hrs</th><th>Start</th><th>End</th><th>CMS</th><th>Hosting</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <div>Renderspace d.o.o. · support@renderspace.si · +386 (1) 23 91 200</div>
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
      <EditMaintenanceModal
        open={showModal}
        isNew={!editing}
        onClose={closeModal}
        onSave={save}
        saving={saving}
        form={form}
        onChange={(field, value) => setForm((prev: MaintenanceFormState) => ({ ...prev, [field]: value }))}
        clients={cStore.clients}
        cmsOptions={[{ value: '', label: '— None —' }, ...settingsStore.cmsOptions.map(c => ({ value: c, label: c }))]}
      />

      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Maintenances</h1>
          <p className="text-muted-foreground text-[13px] m-0">Technical support retainer contracts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportExcel}>Export Excel</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}>Export PDF</Button>
          {canEdit && <Button size="sm" onClick={openAdd}>+ New Contract</Button>}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4 px-6 pt-6">
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">ACTIVE CONTRACTS</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{active.length}</div>
          <div className="text-xs text-muted-foreground mt-1">{store.maintenances.length} total</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">MONTHLY RETAINER</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-[#16a34a]">{fmtEuro(totalMonthly)}</div>
          <div className="text-xs text-muted-foreground mt-1">active contracts</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">HOURS INCLUDED / MO</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{totalHours}h</div>
          <div className="text-xs text-muted-foreground mt-1">across active contracts</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">EXPIRING SOON</div>
          <div className={`text-[28px] font-extrabold tracking-[-0.5px] mb-2 ${expiringSoon > 0 ? 'text-[#d97706]' : 'text-foreground'}`}>
            {expiringSoon}
          </div>
          <div className="text-xs text-muted-foreground mt-1">within 30 days</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        <div className="flex items-center justify-between mb-2.5">
          <h2>Contracts</h2>
        </div>
        <Card>
          {store.loading ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">Loading…</div>
          ) : store.maintenances.length === 0 ? (
            <div className="px-5 py-7 text-center text-muted-foreground text-[13px]">
              No maintenance contracts yet.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>CLIENT</th>
                  <th>CONTRACT</th>
                  <th className="text-right">REQUESTS</th>
                  <th className="text-right">HOURS</th>
                  <th>START</th>
                  <th>END</th>
                  <th>HOSTING</th>
                  <th>STATUS</th>
                  <th className="text-right">RETAINER / MO</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {store.maintenances.map((m: Maintenance) => {
                  const expiring = m.contract_end && m.status === 'active' && daysUntil(m.contract_end) <= 30
                  const hasHosting = m.hosting_clients && m.hosting_clients.length > 0
                  return (
                    <tr key={m.id}>
                      <td className="text-[13px] text-[var(--c1)] font-semibold">{m.client?.name ?? '—'}</td>
                      <td className="font-bold">
                        <span className="font-medium text-primary hover:underline cursor-pointer" onClick={() => navigate(`/maintenances/${m.id}`)}>{m.name}</span>
                      </td>
                      <td className="text-right text-[#374151]">{m.help_requests_included}</td>
                      <td className="text-right text-[#374151]">{m.hours_included}h</td>
                      <td className="text-[13px] text-muted-foreground">{fmtDate(m.contract_start)}</td>
                      <td className={`text-[13px] ${expiring ? 'text-[#d97706] font-bold' : 'text-muted-foreground'}`}>
                        {fmtDate(m.contract_end)}
                      </td>
                      <td>
                        {hasHosting
                          ? <Badge variant="green">Yes</Badge>
                          : <Badge variant="gray">No</Badge>
                        }
                      </td>
                      <td>
                        <Badge variant={STATUS_BADGE[m.status] ?? 'gray'}>
                          {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="text-right font-semibold text-[#16a34a]">
                        {fmtEuro(m.monthly_retainer)}
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">{m.billing_cycle === 'annual' ? '/yr' : '/mo'}</span>
                      </td>
                      <td className="flex gap-1 items-center">
                        <Button variant="outline" size="xs" onClick={() => openEdit(m)}>Edit</Button>
                        <Button variant="destructive" size="xs" onClick={() => setDeleteTarget(m)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Contract"
        message={deleteTarget ? `This will permanently delete "${deleteTarget.name}" and all associated revenue planner entries.` : ''}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
      />
    </div>
  )
}
