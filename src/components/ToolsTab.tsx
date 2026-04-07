import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAgencyToolsStore, type AgencyTool } from '../stores/agencyTools'
import { useProjectsStore } from '../stores/projects'
import { toast } from '../lib/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Modal } from './Modal'
import { ConfirmDialog } from './ConfirmDialog'
import { Select } from './Select'

interface Props {
  clientId?: string
  projectId?: string
}

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

export function ToolsTab({ clientId, projectId }: Props) {
  const toolsStore = useAgencyToolsStore()
  const { projects, fetchAll: fetchProjects } = useProjectsStore()
  const [showAdd, setShowAdd]           = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AgencyTool | null>(null)
  const [deleting, setDeleting]         = useState(false)
  const [saving, setSaving]             = useState(false)

  const [mode, setMode]                 = useState<'select' | 'create'>('select')
  const [selectedToolId, setSelectedToolId] = useState('')
  const [newTool, setNewTool]           = useState<NewToolForm>(EMPTY_NEW_TOOL)
  const [billingFrom, setBillingFrom]   = useState('')
  const [assignProjectId, setAssignProjectId] = useState('')
  const [notes, setNotes]               = useState('')

  useEffect(() => {
    if (!toolsStore.tools.length) toolsStore.fetchAll()
    if (!projects.length) fetchProjects()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Filtering logic:
  // - project context: show client-level tools (no project) + tools for this project
  // - client context: show all tools for this client
  const links = (() => {
    if (!clientId) return []
    if (projectId) {
      return toolsStore.tools.filter(t =>
        (t.client_id === clientId && !t.project_id) || t.project_id === projectId
      )
    }
    return toolsStore.tools.filter(t => t.client_id === clientId)
  })()

  // Client projects for the dropdown in "Add" modal
  const clientProjects = clientId
    ? projects.filter(p => p.client_id === clientId)
    : []

  function openAdd() {
    setMode('select')
    setSelectedToolId('')
    setNewTool(EMPTY_NEW_TOOL)
    setBillingFrom('')
    setAssignProjectId(projectId ?? '')
    setNotes('')
    setShowAdd(true)
  }

  async function handleAdd() {
    if (!clientId) return
    setSaving(true)
    try {
      if (mode === 'create') {
        if (!newTool.name.trim() || !newTool.cost) return
        await toolsStore.add({
          name:          newTool.name.trim(),
          category:      newTool.category || 'Other',
          billing_cycle: newTool.billing_cycle,
          cost:          parseFloat(newTool.cost) || 0,
          url:           newTool.url || null,
          email:         newTool.email || null,
          status:        'active',
          billable:      !!billingFrom,
          client_id:     clientId,
          billing_from:  billingFrom ? billingFrom + '-01' : null,
          project_id:    assignProjectId || null,
          notes:         notes || null,
        })
      } else {
        if (!selectedToolId) return
        await toolsStore.update(selectedToolId, {
          client_id:    clientId,
          billing_from: billingFrom ? billingFrom + '-01' : null,
          billable:     !!billingFrom,
          project_id:   assignProjectId || null,
          notes:        notes || null,
        })
      }
      setShowAdd(false)
      toast('success', 'Tool added')
    } catch {
      toast('error', 'Failed to add tool')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('agency_tools')
        .update({ client_id: null, billing_from: null, billable: false, project_id: null })
        .eq('id', deleteTarget.id)
      if (error) throw error
      await toolsStore.fetchAll()
      setDeleteTarget(null)
      toast('success', 'Tool unlinked')
    } catch {
      toast('error', 'Failed to unlink tool')
    } finally {
      setDeleting(false)
    }
  }

  // Tools not yet assigned to any client (available to assign)
  const usedIds = new Set(links.map(t => t.id))
  const availableTools = toolsStore.tools.filter(t => !t.client_id && !usedIds.has(t.id))

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

  const contextLabel = projectId
    ? '· assigned to this project or client-wide'
    : '· tools assigned to this client'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-3">
        <h2>Tools <span className="font-normal text-[13px] normal-case tracking-normal text-muted-foreground">
          {contextLabel}
        </span></h2>
        <Button size="sm" onClick={openAdd}>+ Add Tool</Button>
      </div>

      {toolsStore.loading ? (
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
                <th>Project</th>
                <th>Category</th>
                <th>Billing</th>
                <th>Cost</th>
                <th>Billable</th>
                <th>Paying from</th>
                <th>Billing from</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {links.map(t => {
                const proj = projects.find(p => p.id === t.project_id)
                return (
                  <tr key={t.id}>
                    <td className="font-semibold text-[13px]">
                      {t.url ? (
                        <a href={t.url.startsWith('http') ? t.url : `https://${t.url}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t.name}</a>
                      ) : t.name}
                    </td>
                    <td className="text-[13px] text-muted-foreground">
                      {proj ? <Badge variant="blue">{proj.name}</Badge> : <span className="text-[12px] text-muted-foreground">All projects</span>}
                    </td>
                    <td><Badge variant="gray">{t.category}</Badge></td>
                    <td>
                      <Badge variant={t.billing_cycle === 'monthly' ? 'blue' : t.billing_cycle === 'yearly' ? 'amber' : 'gray'}>
                        {t.billing_cycle === 'monthly' ? 'Monthly' : t.billing_cycle === 'yearly' ? 'Yearly' : 'One-time'}
                      </Badge>
                    </td>
                    <td className="font-semibold text-[13px]">
                      {fmtEuro(t.cost)}<span className="text-[10px] text-muted-foreground font-normal"> {cycleSuffix(t)}</span>
                    </td>
                    <td>
                      <Badge variant={t.billable ? 'green' : 'gray'}>
                        {t.billable ? 'Billable' : 'Non-billable'}
                      </Badge>
                    </td>
                    <td className="text-[13px] text-muted-foreground">{fmtMonth(t.paying_from)}</td>
                    <td className="text-[13px] text-muted-foreground">{fmtMonth(t.billing_from)}</td>
                    <td className="text-[12px] text-muted-foreground">{t.notes ?? '—'}</td>
                    <td>
                      <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeleteTarget(t)}>Remove</Button>
                    </td>
                  </tr>
                )
              })}
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
              <p className="text-xs text-muted-foreground mt-1">No unassigned tools. Switch to "Create new tool".</p>
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
                <input value={newTool.email} onChange={e => setNewTool(f => ({ ...f, email: e.target.value }))} placeholder="account@agency.com" />
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Billing From</label>
            <input type="month" value={billingFrom} onChange={e => setBillingFrom(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">When to start invoicing client</p>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. shared seat…" />
          </div>
        </div>

        {clientProjects.length > 0 && (
          <div className="mb-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">
              Project <span className="font-normal normal-case text-muted-foreground">(optional — leave blank for all projects)</span>
            </label>
            <Select
              value={assignProjectId}
              onChange={setAssignProjectId}
              placeholder="— All projects —"
              options={clientProjects.map(p => ({ value: p.id, label: p.name }))}
            />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove Tool"
        message={`Unlink ${deleteTarget?.name} from this client? The tool will remain in the global tools list.`}
        confirmLabel="Remove"
        onConfirm={handleRemove}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
