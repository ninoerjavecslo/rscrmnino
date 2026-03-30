import { Select } from './Select'

interface HostingFormFieldsProps {
  description: string
  project_pn: string
  cycle: 'monthly' | 'yearly'
  amount: string
  onDescriptionChange: (value: string) => void
  onProjectPnChange: (value: string) => void
  onCycleChange: (value: string) => void
  onAmountChange: (value: string) => void
}

export function HostingFormFields({
  description,
  project_pn,
  cycle,
  amount,
  onDescriptionChange,
  onProjectPnChange,
  onCycleChange,
  onAmountChange,
}: HostingFormFieldsProps) {
  return (
    <div className="bg-white rounded-lg border border-border p-3 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Description</label>
          <input
            value={description}
            onChange={e => onDescriptionChange(e.target.value)}
            placeholder="e.g. Production server"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Project #</label>
          <input
            value={project_pn}
            onChange={e => onProjectPnChange(e.target.value)}
            placeholder="e.g. RS-2026-001"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Cycle</label>
          <Select
            value={cycle}
            onChange={onCycleChange}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'yearly', label: 'Yearly' },
            ]}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Amount (€)</label>
          <input
            type="number"
            value={amount}
            onChange={e => onAmountChange(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>
    </div>
  )
}
