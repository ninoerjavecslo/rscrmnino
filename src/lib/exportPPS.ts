import type { ResourceAllocation } from './types'

/**
 * Generate a PPS-format CSV for timesheet export.
 * Columns: Project Number | Description | Hours | Date
 */
export function generatePPSCsv(allocations: ResourceAllocation[], memberName: string): string {
  const rows: string[] = []
  rows.push('Project Number,Description,Hours,Date')

  for (const a of allocations) {
    const projectNumber = a.project?.pn ?? (a.category === 'maintenance' ? 'MAINT' : a.category.toUpperCase())
    const description = a.project
      ? `${a.project.name}${a.label ? ' - ' + a.label : ''}`
      : (a.label || a.category)
    const hours = a.hours
    const date = a.date

    // Escape CSV fields
    const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
    rows.push(`${escape(projectNumber)},${escape(description)},${hours},${date}`)
  }

  // memberName is used by the caller to build the filename
  void memberName

  return rows.join('\n')
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
