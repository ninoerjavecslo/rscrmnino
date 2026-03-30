import { Modal } from './Modal'
import { Button } from '@/components/ui/button'
import { Select } from './Select'
import { HostingFormFields } from './HostingFormFields'

export interface MaintenanceFormState {
  client_id: string
  project_pn: string
  name: string
  monthly_retainer: string
  billing_cycle: 'monthly' | 'annual'
  billing_month: string
  help_requests_included: string
  hours_included: string
  contract_start: string
  contract_duration_months: string
  contract_url: string
  status: 'active' | 'paused' | 'cancelled'
  notes: string
  cms: string
  hosting_enabled: boolean
  hosting_project_pn: string
  hosting_description: string
  hosting_cycle: 'monthly' | 'yearly'
  hosting_amount: string
}

interface EditMaintenanceModalProps {
  open: boolean
  isNew?: boolean
  onClose: () => void
  onSave: () => void
  saving: boolean
  form: MaintenanceFormState
  onChange: <K extends keyof MaintenanceFormState>(field: K, value: MaintenanceFormState[K]) => void
  clients: Array<{ id: string; name: string }>
  cmsOptions: Array<{ value: string; label: string }>
}

export function validateHostingFields(form: MaintenanceFormState): string | null {
  if (!form.hosting_enabled) return null
  if (!form.hosting_project_pn.trim()) return 'Project # is required for hosting'
  if (!form.hosting_amount || Number(form.hosting_amount) <= 0) return 'Hosting amount is required and must be greater than 0'
  if (!form.hosting_description.trim()) return 'Hosting description is required'
  return null
}

export function EditMaintenanceModal({
  open,
  isNew,
  onClose,
  onSave,
  saving,
  form,
  onChange,
  clients,
  cmsOptions,
}: EditMaintenanceModalProps) {
  return (
    <Modal
      open={open}
      title={isNew ? 'New Maintenance Contract' : 'Edit Maintenance Contract'}
      onClose={onClose}
      maxWidth={640}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            CANCEL
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving || !form.client_id || !form.name || !form.monthly_retainer || !form.contract_start}>
            {saving ? 'Saving…' : isNew ? 'CREATE CONTRACT' : 'SAVE CHANGES'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Client</label>
          <Select
            value={form.client_id}
            onChange={(val) => onChange('client_id', val)}
            placeholder="Select client…"
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Status</label>
          <Select
            value={form.status}
            onChange={(val) => onChange('status', val as MaintenanceFormState['status'])}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Contract name</label>
          <input value={form.name} onChange={(e) => onChange('name', e.target.value)} placeholder="e.g. ACME - Technical support" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Project # <span className="text-xs text-muted-foreground ml-1">optional</span>
          </label>
          <input value={form.project_pn} onChange={(e) => onChange('project_pn', e.target.value)} placeholder="e.g. ACME" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Monthly retainer (€)</label>
          <input type="number" value={form.monthly_retainer} onChange={(e) => onChange('monthly_retainer', e.target.value)} placeholder="500" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Billing cycle <span className="text-xs text-muted-foreground ml-1">optional</span>
          </label>
          <Select
            value={form.billing_cycle}
            onChange={(val) => onChange('billing_cycle', val as MaintenanceFormState['billing_cycle'])}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'annual', label: 'Annual' },
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Help requests / mo <span className="text-xs text-muted-foreground ml-1">optional</span>
          </label>
          <input type="number" value={form.help_requests_included} onChange={(e) => onChange('help_requests_included', e.target.value)} placeholder="5" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Hours / mo <span className="text-xs text-muted-foreground ml-1">optional</span>
          </label>
          <input type="number" value={form.hours_included} onChange={(e) => onChange('hours_included', e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Contract start</label>
          <input type="month" value={form.contract_start} onChange={(e) => onChange('contract_start', e.target.value)} />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Duration (months) <span className="text-xs text-muted-foreground ml-1">optional</span>
          </label>
          <input type="number" value={form.contract_duration_months} onChange={(e) => onChange('contract_duration_months', e.target.value)} placeholder="12" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            CMS / Technology <span className="text-xs text-muted-foreground ml-1">optional</span>
          </label>
          <Select
            value={form.cms}
            onChange={(val) => onChange('cms', val)}
            placeholder="Select CMS…"
            options={cmsOptions}
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
            Contract URL <span className="text-xs text-muted-foreground ml-1">optional</span>
          </label>
          <input type="url" value={form.contract_url} onChange={(e) => onChange('contract_url', e.target.value)} placeholder="https://…" />
        </div>
      </div>

      <div className="mb-4">
        <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
          Notes <span className="text-xs text-muted-foreground ml-1">optional</span>
        </label>
        <textarea
          value={form.notes}
          onChange={(e) => onChange('notes', e.target.value)}
          rows={2}
          placeholder="Any additional notes…"
          className="w-full"
          style={{ resize: 'vertical' }}
        />
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium">Hosting</label>
          <button
            type="button"
            onClick={() => onChange('hosting_enabled', !form.hosting_enabled)}
            className={`text-xs font-medium px-2.5 py-1 rounded border transition-colors ${
              form.hosting_enabled
                ? 'bg-[var(--navy)] text-white border-[var(--navy)]'
                : 'bg-transparent text-[var(--c3)] border-border'
            }`}
          >
            {form.hosting_enabled ? 'Hide' : '+ Add hosting'}
          </button>
        </div>

        {form.hosting_enabled ? (
          <HostingFormFields
            description={form.hosting_description}
            project_pn={form.hosting_project_pn}
            cycle={form.hosting_cycle}
            amount={form.hosting_amount}
            onDescriptionChange={(val) => onChange('hosting_description', val)}
            onProjectPnChange={(val) => onChange('hosting_project_pn', val)}
            onCycleChange={(val) => onChange('hosting_cycle', val as MaintenanceFormState['hosting_cycle'])}
            onAmountChange={(val) => onChange('hosting_amount', val)}
          />
        ) : (
          <div className="text-xs text-muted-foreground bg-[#f8f8fa] rounded-lg border border-border px-3 py-2.5">
            No hosting linked to this contract.
          </div>
        )}
      </div>
    </Modal>
  )
}
