import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAgencyToolsStore, type AgencyTool } from '../stores/agencyTools'
import { toast } from '../lib/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Modal } from './Modal'
import { ConfirmDialog } from './ConfirmDialog'
import { Select } from './Select'

interface ToolLink {
  id: string
  tool_id: string
  billing_from: string | null
  billable: boolean
  notes: string | null
  tool: AgencyTool
}

interface Props {
  projectId?: string
  maintenanceId?: string
}

const TABLE = 'resource_tools'

const CATEGORIES = [
  'Design', 'Development', 'Communication', 'Project Management',
  'Marketing', 'Analytics', 'Finance', 'Security', 'Storage',
  'AI', 'Hosting', 'Other',
]

interface NewToolForm {
  name: string
  category: string
  billing_cycle: 'monthly' | 'yearly' | 'one-time'
  cost: string
  url: string
  email: string
}

const EMPTY_NEW_TOOL: NewToolForm = {
  name: '', category: '', billing_cycle: 'monthly', cost: '', url: '', email: '',
}

export function ToolsTab({ projectId, maintenanceId }: Props) {
  const toolsStore = useAgencyToolsStore()
  const [links, setLinks]               = useState<ToolLink[]>([])
  const [loading, setLoading]           = useState(true)
  const [showAdd, setShowAdd]           = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ToolLink | null>(null)
  const [deleting, setDeleting]         = useState(false)
  const [saving, setSaving]             = useState(false)

  const [mode, setMode]                 = useState<'select' | 'create'>('select')
  const [selectedToolId, setSelectedToolId] = useState('')
  const [newTool, setNewTool]           = useState<NewToolForm>(EMPTY_NEW_TOOL)
  const [billingFrom, setBillingFrom]   = useState('')
  const [billable, setBillable]         = useState(true)
  const [notes, setNotes]               = useState('')

  useEffect(() => {
    if (!toolsStore.tools.length) toolsStore.fetchAll()
    fetchLinks()
  }, [projectId, maintenanceId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchLinks() {
    setLoading(true)
    const query = supabase
      .from(TABLE)
      .select('*, tool:agency_tools(*)')
      .order('created_at')
    if (projectId)     query.eq('project_id', projectId)
    if (maintenanceId) query.eq('maintenance_id', maintenanceId)
    const { data } = await query
    setLinks((data ?? []) as ToolLink[])
    setLoading(false)
  }

  function openAdd() {
    setMode('select')
    setSelectedToolId('')
    setNewTool(EMPTY_NEW_TOOL)
    setBillingFrom('')
    setBillable(true)
    setNotes('')
    setShowAdd(true)
  }

  async function handleAdd() {
    setSaving(true)
    try {
      let toolId = selectedToolId

      if (mode === 'create') {
        if (!newTool.name.trim() || !newTool.cost) return
        const { data, error } = await supabase.from('agency_tools').insert({
          name:          newTool.name.trim(),
          category:      newTool.category || 'Other',
          billing_cycle: newTool.billing_cycle,
          cost:          parseFloat(newTool.cost) || 0,
          url:           newTool.url || null,
          email:         newTool.email || null,
          status:        'active',
        }).select().single()
        if (error) throw error
        toolId = data.id
        toolsStore.fetchAll()
      }

      if (!toolId) return

      const { error } = await supabase.from(TABLE).insert({
        project_id:     projectId ?? null,
        maintenance_id: maintenanceId ?? null,
        tool_id:        toolId,
        billing_from:   billable ? (billingFrom || null) : null,
        billable,
        notes:          notes || null,
      })
      if (error) throw error
      await fetchLinks()
      setShowAdd(false)
      toast('success', 'Tool added')
    } catch {
      toast('error', 'Failed to add tool')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { error } = await supabase.from(TABLE).delete().eq('id', deleteTarget.id)
      if (error) throw error
      setLinks(l => l.filter(x => x.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast('success', 'Tool removed')
    } catch {
      toast('error', 'Failed to remove tool')
    } finally {
      setDeleting(false)
    }
  }

  const usedIds = new Set(links.map(l => l.tool_id))
  const availableTools = toolsStore.tools.filter(t => !usedIds.has(t.id))

  const canSave = mode === 'select'
    ? !!selectedToolId
    : !!newTool.name.trim() && !!newTool.cost

  function cycleSuffix(t: AgencyTool) {
    if (t.billing_cycle === 'monthly') return '/mo'
    if (t.billing_cycle === 'yearly') return '/yr'
    return ''
  }

  function fmtMonth(d?: string | null) {
    if (!d) return '—'
    const [y, m] = d.split('-')
    return `${m}/${y}`
  }

  function fmtEuro(n: number) {
    return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-3">
        <h2>Tools <span className="font-normal text-[13px] normal-case tracking-normal text-muted-foreground">· assigned to this client</span></h2>
        <Button size="sm" onClick={openAdd}>+ Add Tool</Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-4">Loading…</div>
      ) : links.length === 0 ? (
        <Card>
          <div className="text-center py-10 text-muted-foreground text-sm">
            No tools assigned yet.
          </div>
        </Card>
      ) : (
        <Card>
          <table>
            <thead>
              <tr>
                <th>Tool</th>
                <th>Category</th>
                <th>Billing</th>
                <th>Cost</th>
                <th>Billable</th>
                <th>Billing from</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {links.map(l => (
                <tr key={l.id}>
                  <td className="font-semibold text-[13px]">
                    {l.tool.url ? (
                      <a href={l.tool.url.startsWith('http') ? l.tool.url : `https://${l.tool.url}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{l.tool.name}</a>
                    ) : l.tool.name}
                  </td>
                  <td><Badge variant="gray">{l.tool.category}</Badge></td>
                  <td>
                    <Badge variant={l.tool.billing_cycle === 'monthly' ? 'blue' : l.tool.billing_cycle === 'yearly' ? 'amber' : 'gray'}>
                      {l.tool.billing_cycle === 'monthly' ? 'Monthly' : l.tool.billing_cycle === 'yearly' ? 'Yearly' : 'One-time'}
                    </Badge>
                  </td>
                  <td className="font-semibold text-[13px]">
                    {fmtEuro(l.tool.cost)}<span className="text-[10px] text-muted-foreground font-normal"> {cycleSuffix(l.tool)}</span>
                  </td>
                  <td>
                    <Badge variant={l.billable ? 'green' : 'gray'}>{l.billable ? 'Billable' : 'Non-billable'}</Badge>
                  </td>
                  <td className="text-[13px] text-muted-foreground">{l.billable ? fmtMonth(l.billing_from) : '—'}</td>
                  <td className="text-[12px] text-muted-foreground">{l.notes ?? '—'}</td>
                  <td>
                    <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeleteTarget(l)}>Remove</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal
        open={showAdd}
        title="Add Tool"
        onClose={() => setShowAdd(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !canSave}>
              {saving ? 'Adding…' : 'Add Tool'}
            </Button>
          </>
        }
      >
        {/* Mode toggle */}
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 mb-4">
          {(['select', 'create'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`flex-1 py-1.5 rounded text-[13px] border-none cursor-pointer font-inherit transition-all ${
                mode === m ? 'bg-white shadow-sm font-bold text-foreground' : 'bg-transparent font-medium text-muted-foreground'
              }`}>
              {m === 'select' ? 'Select existing' : 'Create new tool'}
            </button>
          ))}
        </div>

        {mode === 'select' ? (
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Tool *</label>
            <Select
              value={selectedToolId}
              onChange={setSelectedToolId}
              placeholder="— Select tool —"
              options={availableTools.map(t => ({
                value: t.id,
                label: `${t.name} · ${t.category} · ${t.cost} € ${cycleSuffix(t)}`,
              }))}
            />
            {availableTools.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">All tools already added. Switch to "Create new tool" to add one.</p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Tool Name *</label>
              <input value={newTool.name} onChange={e => setNewTool(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Figma" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Category</label>
                <Select
                  value={newTool.category}
                  onChange={v => setNewTool(f => ({ ...f, category: v }))}
                  placeholder="— Select —"
                  options={CATEGORIES.map(c => ({ value: c, label: c }))}
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Cost (€) *</label>
                <input type="number" min="0" step="0.01" value={newTool.cost} onChange={e => setNewTool(f => ({ ...f, cost: e.target.value }))} placeholder="29.00" />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Billing Cycle</label>
              <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
                {(['monthly', 'yearly', 'one-time'] as const).map(c => (
                  <button key={c} type="button" onClick={() => setNewTool(f => ({ ...f, billing_cycle: c }))}
                    className={`flex-1 py-1.5 rounded text-[12px] border-none cursor-pointer font-inherit transition-all ${
                      newTool.billing_cycle === c ? 'bg-white shadow-sm font-bold text-foreground' : 'bg-transparent font-medium text-muted-foreground'
                    }`}>
                    {c === 'one-time' ? 'One-time' : c.charAt(0).toUpperCase() + c.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Website</label>
                <input value={newTool.url} onChange={e => setNewTool(f => ({ ...f, url: e.target.value }))} placeholder="https://figma.com" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Account Email</label>
                <input type="email" value={newTool.email} onChange={e => setNewTool(f => ({ ...f, email: e.target.value }))} placeholder="account@agency.com" />
              </div>
            </div>
          </>
        )}

        {/* Billable toggle */}
        <div className="mb-4">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Billing Type</label>
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {([true, false] as const).map(b => (
              <button key={String(b)} type="button" onClick={() => setBillable(b)}
                className={`flex-1 py-1.5 rounded text-[13px] border-none cursor-pointer font-inherit transition-all ${
                  billable === b
                    ? `bg-white shadow-sm font-bold ${b ? 'text-[#16a34a]' : 'text-muted-foreground'}`
                    : 'bg-transparent font-medium text-muted-foreground'
                }`}>
                {b ? 'Billable' : 'Non-billable'}
              </button>
            ))}
          </div>
        </div>

        {billable && (
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Billing From</label>
            <input type="month" value={billingFrom} onChange={e => setBillingFrom(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Month to start charging the client</p>
          </div>
        )}

        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Notes</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Client's own licence, shared seat…" />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove Tool"
        message={`Remove ${deleteTarget?.tool.name} from this ${projectId ? 'project' : 'maintenance'}?`}
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
