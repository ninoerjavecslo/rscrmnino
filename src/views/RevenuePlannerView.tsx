import React, { useEffect, useRef, useState } from 'react'
import { useProjectsStore } from '../stores/projects'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import { useSettingsStore } from '../stores/settings'
import type { Project, RevenuePlanner } from '../lib/types'
import { buildLogoHtml, openHtmlAsPdf } from '../lib/pdfExport'
import { hostingActiveInMonth } from '../lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import * as XLSX from 'xlsx'

// ── Half-year helpers ──────────────────────────────────────────────────────────

type Half = 'H1' | 'H2'

function getHalfYearMonths(half: Half, year: number): string[] {
  const startMonth = half === 'H1' ? 0 : 6
  const months: string[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(year, startMonth + i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`)
  }
  return months
}

function fmtMonthShort(m: string): string {
  const d = new Date(m + 'T00:00:00')
  return d.toLocaleString('en', { month: 'short' }).toUpperCase()
}

function fmtAmt(n: number): string {
  if (n === 0) return '0 €'
  return n.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €'
}

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: Project['type'] }) {
  const cls: Record<Project['type'], string> = {
    fixed: 'bg-[#e0f2fe] text-[#0369a1] border border-[#bae6fd]',
    maintenance: 'bg-[#dbeafe] text-[#1d4ed8] border border-[#bfdbfe]',
    variable: 'bg-[#fef3c7] text-[#92400e] border border-[#fde68a]',
    internal: 'bg-[#f4f2f6] text-[#374151] border border-[#e8e3ea]',
  }
  const labels: Record<Project['type'], string> = { fixed: 'Fixed', maintenance: 'Recurring', variable: 'Variable', internal: 'Internal' }
  return (
    <span className={`inline-block text-[9px] font-bold tracking-[0.4px] uppercase px-[5px] py-px rounded-[3px] ${cls[type]}`}>
      {labels[type]}
    </span>
  )
}

// ── Probability helpers ───────────────────────────────────────────────────────

function probColors(p: number): { bg: string; text: string; border: string } {
  if (p === 100) return { bg: '#f0fdf4', text: '#15803d', border: '#86efac' }
  if (p >= 50)   return { bg: '#fffbeb', text: '#92400e', border: '#fde68a' }
  return                { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' }
}


// ── Cell background helpers ───────────────────────────────────────────────────

interface AggCell {
  planned_amount: number | null
  actual_amount: number | null
  status: RevenuePlanner['status']
  probability: number
  notes: string | null
}

function statusRank(s: RevenuePlanner['status']): number {
  if (s === 'paid') return 5
  if (s === 'issued') return 4
  if (s === 'planned') return 3
  if (s === 'retainer') return 2
  if (s === 'deferred') return 1
  return 0
}

function getCellBg(row: AggCell | undefined): string {
  if (!row) return 'transparent'
  if (row.status === 'deferred') return '#fef2f2'
  if (row.status === 'issued' || row.status === 'paid') return '#f0fdf4'
  if (row.status === 'retainer') return '#fffbf0'
  if (row.status === 'planned') return probColors(row.probability ?? 100).bg
  return 'transparent'
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function RevenuePlannerView() {
  const pStore = useProjectsStore()
  const rpStore = useRevenuePlannerStore()
  const infraStore = useInfraStore()
  const domainsStore = useDomainsStore()
  const settingsStore = useSettingsStore()

  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() // 0-indexed
  const defaultHalf: Half = currentMonth < 6 ? 'H1' : 'H2'

  const [half, setHalf] = useState<Half>(defaultHalf)
  const [year, setYear] = useState<number>(currentYear)

  const months = getHalfYearMonths(half, year)

  useEffect(() => {
    rpStore.fetchByMonths(months)
    pStore.fetchAll()
    infraStore.fetchAll()
    domainsStore.fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [half, year])

  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportOpen) return
    function handleOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [exportOpen])

  const activeProjects = pStore.projects.filter(p => p.status === 'active' && p.type !== 'internal')

  // Build aggregated lookup: `${projectId}:${month}` → summed cell data
  // Deferred and cost rows are excluded from planned_amount (they don't count as active invoices)
  const rowMap = new Map<string, AggCell>()
  for (const r of rpStore.rows) {
    if (!r.project_id) continue
    const key = `${r.project_id}:${r.month}`
    const existing = rowMap.get(key)
    const isIssuedOrPaid = r.status === 'issued' || r.status === 'paid'
    const countsAsPlanned = r.status !== 'deferred' && r.status !== 'cost'
    if (!existing) {
      rowMap.set(key, {
        planned_amount: countsAsPlanned ? (r.planned_amount ?? null) : null,
        actual_amount: isIssuedOrPaid ? (r.actual_amount ?? null) : null,
        status: r.status,
        probability: r.probability ?? 100,
        notes: r.notes ?? null,
      })
    } else {
      const addPlanned = countsAsPlanned ? (r.planned_amount ?? 0) : 0
      rowMap.set(key, {
        planned_amount: ((existing.planned_amount ?? 0) + addPlanned) || null,
        actual_amount: isIssuedOrPaid
          ? ((existing.actual_amount ?? 0) + (r.actual_amount ?? 0)) || null
          : existing.actual_amount,
        status: statusRank(r.status) > statusRank(existing.status) ? r.status : existing.status,
        probability: Math.min(existing.probability, r.probability ?? 100),
        notes: [existing.notes, r.notes].filter(Boolean).join(' | ') || null,
      })
    }
  }

  // Maintenance retainer rows for this half — exclude CR add-on rows
  const retainerRows = rpStore.rows.filter(r => r.maintenance_id != null && !r.notes?.startsWith('CR:'))
  // Group by maintenance_id
  const retainerByMaint = new Map<string, { name: string; clientName: string; rows: RevenuePlanner[] }>()

  // CR rows — group by maintenance
  const crRows = rpStore.rows.filter(r => r.maintenance_id != null && r.notes?.startsWith('CR:'))
  const crByMaint = new Map<string, { maintName: string; clientName: string; crs: { title: string; rowByMonth: Map<string, RevenuePlanner> }[] }>()
  for (const r of retainerRows) {
    const mid = r.maintenance_id!
    if (!retainerByMaint.has(mid)) {
      retainerByMaint.set(mid, {
        name: r.maintenance?.name ?? 'Maintenance',
        clientName: r.maintenance?.client?.name ?? '—',
        rows: [],
      })
    }
    retainerByMaint.get(mid)!.rows.push(r)
  }

  // Build CR lookup: group by maintenance, then by CR title
  for (const r of crRows) {
    const mid = r.maintenance_id!
    const title = r.notes?.startsWith('CR:') ? r.notes.slice(3).trim() : r.notes ?? '—'
    if (!crByMaint.has(mid)) {
      crByMaint.set(mid, {
        maintName: r.maintenance?.name ?? 'Maintenance',
        clientName: r.maintenance?.client?.name ?? '—',
        crs: [],
      })
    }
    const entry = crByMaint.get(mid)!
    let crEntry = entry.crs.find(c => c.title === title)
    if (!crEntry) { crEntry = { title, rowByMonth: new Map() }; entry.crs.push(crEntry) }
    crEntry.rowByMonth.set(r.month, r)
  }

  // Effective display amount for a cell
  // For issued/paid rows: use actual_amount (what was really invoiced)
  // For planned rows: use planned_amount
  function cellAmount(project: Project, month: string): number | null {
    const key = `${project.id}:${month}`
    const row = rowMap.get(key)
    if (row) {
      if ((row.status === 'issued' || row.status === 'paid') && row.actual_amount != null) {
        return row.actual_amount
      }
      return row.planned_amount ?? row.actual_amount ?? null
    }
    // Auto-fill maintenance from contract value
    if (project.type === 'maintenance' && project.contract_value) {
      return project.contract_value
    }
    return null
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  // Sum invoices where probability >= minProb (additive scenario, not weighted)
  function scenarioSum(minProb: number): number {
    return months.reduce((sum, m) => {
      return sum + activeProjects.reduce((s, p) => {
        const row = rowMap.get(`${p.id}:${m}`)
        const prob = row?.probability ?? 100
        if (prob < minProb) return s
        return s + (cellAmount(p, m) ?? 0)
      }, 0)
    }, 0)
  }

  function actualIssuedTotal(): number {
    return rpStore.rows.reduce((sum, r) => {
      if (r.status === 'issued' || r.status === 'paid') {
        return sum + (r.actual_amount ?? r.planned_amount ?? 0)
      }
      return sum
    }, 0)
  }

  const confirmedTotal = scenarioSum(100)   // 100% only
  const likelyTotal    = scenarioSum(50)    // 100% + 50%
  const bestCaseTotal  = scenarioSum(25)    // 100% + 50% + 25%
  const totalPlanned   = bestCaseTotal
  const actualSum      = actualIssuedTotal()

  // Recurring revenue totals (hosting + retainers + domains) — always confirmed
  // These are computed after hostingGrandTotal / domainsGrandTotal / retainerByMaint are available,
  // so we inline them as lazy references resolved after those are declared.
  function recurringTotal(): number {
    const hosting  = months.reduce((s, m) => s + hostingMonthTotal(m), 0)
    const retainer = months.reduce((s, m) =>
      s + [...retainerByMaint.entries()].reduce((rs, [mid, { rows }]) => {
        const r = rows.find(r => r.month === m)
        if (!r) return rs
        const hAmt = infraStore.hostingClients.find(h => h.maintenance_id === mid && h.cycle === 'monthly')?.amount ?? 0
        if (r.status === 'issued' || r.status === 'paid') {
          return rs + Math.max(0, (r.actual_amount ?? r.planned_amount ?? 0) - hAmt)
        }
        return rs + (r.planned_amount ?? 0)
      }, 0), 0)
    const domain = months.reduce((s, m) => s + domainMonthTotal(m), 0)
    return hosting + retainer + domain
  }

  // ── Monthly column totals ──────────────────────────────────────────────────
  function monthPlannedTotal(month: string): number {
    return activeProjects.reduce((sum, p) => {
      const row = rowMap.get(`${p.id}:${month}`)
      return sum + (row?.planned_amount ?? 0)
    }, 0)
  }

  function monthActualTotal(month: string): number {
    return activeProjects.reduce((sum, p) => {
      const row = rowMap.get(`${p.id}:${month}`)
      if (row?.status === 'issued' || row?.status === 'paid') {
        return sum + (row.actual_amount ?? row.planned_amount ?? 0)
      }
      return sum
    }, 0)
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  function navigate(dir: -1 | 1) {
    if (half === 'H1' && dir === 1) { setHalf('H2') }
    else if (half === 'H2' && dir === 1) { setHalf('H1'); setYear(y => y + 1) }
    else if (half === 'H2' && dir === -1) { setHalf('H1') }
    else if (half === 'H1' && dir === -1) { setHalf('H2'); setYear(y => y - 1) }
  }

  // ── Hosting revenue helpers ────────────────────────────────────────────────
  const activeHostingClients = infraStore.hostingClients.filter(
    h => h.status === 'active' || (h.status === 'cancelled' && h.cancelled_from != null)
  )

  function hostingCellAmount(hostingId: string, month: string): number | null {
    const h = activeHostingClients.find(hc => hc.id === hostingId)
    if (!h) return null
    // Stop showing after cancellation
    if (!hostingActiveInMonth(h, month)) return null
    // Stop showing after contract expiry
    if (h.contract_expiry && month > h.contract_expiry) return null
    if (h.cycle === 'monthly') return h.amount
    // Yearly: show amount only in the billing_month
    if (h.cycle === 'yearly' && h.billing_month) {
      if (parseInt(month.slice(5, 7)) === h.billing_month) return h.amount
    }
    return null
  }

  function hostingCellStatus(hostingId: string, month: string): string | null {
    const row = rpStore.rows.find(r => r.hosting_client_id === hostingId && r.month === month)
    return row?.status ?? null
  }

  function hostingRowTotal(hostingId: string): number {
    return months.reduce((sum, m) => sum + (hostingCellAmount(hostingId, m) ?? 0), 0)
  }

  function hostingMonthTotal(month: string): number {
    return activeHostingClients.reduce((sum, h) => sum + (hostingCellAmount(h.id, month) ?? 0), 0)
  }

  const hostingGrandTotal = months.reduce((sum, m) => sum + hostingMonthTotal(m), 0)

  // ── Domain helpers ──────────────────────────────────────────────────────────
  function domainInvoiceMonth(d: { registered_date?: string | null; expiry_date: string }) {
    const monthNum = (d.registered_date ?? d.expiry_date).slice(5, 7)
    return `${year}-${monthNum}-01`
  }

  const domainsInHalf = domainsStore.domains.filter(d => months.includes(domainInvoiceMonth(d)))

  function domainMonthTotal(month: string): number {
    return domainsInHalf
      .filter(d => domainInvoiceMonth(d) === month)
      .reduce((sum, d) => sum + (d.yearly_amount ?? 0), 0)
  }

  const domainsGrandTotal = months.reduce((sum, m) => sum + domainMonthTotal(m), 0)

  const recurringTotalValue = recurringTotal()

  const isLoading = pStore.loading && activeProjects.length === 0

  // ── Export ─────────────────────────────────────────────────────────────────

  function exportExcel() {
    type Row = (string | number | null)[]
    const data: Row[] = []
    const monthLabels = months.map(m => fmtMonthShort(m))

    data.push([`Invoice Plan — ${half} ${year}`])
    data.push([])
    data.push(['SUMMARY'])
    data.push(['Confirmed', 'Likely', 'Best Case', 'Actual Issued'])
    data.push([
      confirmedTotal + recurringTotalValue,
      likelyTotal + recurringTotalValue,
      bestCaseTotal + recurringTotalValue,
      actualSum,
    ])
    data.push([])

    // Projects
    data.push(['PROJECTS'])
    const projHeader: Row = ['Project', 'Client', 'Type']
    for (const label of monthLabels) projHeader.push(`${label} Plan`, `${label} Actual`)
    projHeader.push('Total')
    data.push(projHeader)

    for (const p of activeProjects) {
      const row: Row = [p.name, p.client?.name ?? '', p.type]
      let rowPlanned = 0
      let rowActual = 0
      for (const m of months) {
        const cell = rowMap.get(`${p.id}:${m}`)
        const planned = cell?.planned_amount ?? 0
        const isIssuedPaid = cell?.status === 'issued' || cell?.status === 'paid'
        const actual = isIssuedPaid ? (cell?.actual_amount ?? 0) : 0
        row.push(planned || null, actual || null)
        rowPlanned += planned
        rowActual += actual
      }
      row.push(rowActual > 0 ? rowActual : rowPlanned || null)
      data.push(row)

      // Costs sub-row (only if any costs exist)
      const costsData: (number | null)[] = []
      let hasCosts = false
      for (const m of months) {
        const costEntry = rpStore.rows.find(r => r.project_id === p.id && r.month === m && r.status === 'cost')
        const amt = costEntry?.actual_amount ?? null
        costsData.push(null, amt)
        if (amt) hasCosts = true
      }
      if (hasCosts) data.push(['  (costs)', '', '', ...costsData, null])
    }

    const totRow: Row = ['MONTHLY TOTAL', '', '']
    for (const m of months) totRow.push(monthPlannedTotal(m) || null, monthActualTotal(m) || null)
    totRow.push(totalPlanned || null)
    data.push(totRow)

    // Maintenance Retainers
    if (retainerByMaint.size > 0) {
      data.push([])
      data.push(['MAINTENANCE RETAINERS'])
      const retHeader: Row = ['Contract', 'Client']
      for (const label of monthLabels) retHeader.push(`${label} Plan`, `${label} Actual`)
      retHeader.push('Total')
      data.push(retHeader)

      for (const [mid, { name, clientName, rows: retRows }] of retainerByMaint) {
        const linkedHosting = infraStore.hostingClients.find(h => h.maintenance_id === mid && h.cycle === 'monthly')
        const hostingAmt = linkedHosting?.amount ?? 0
        const rowByMonth = new Map(retRows.map(r => [r.month, r]))
        const retRow: Row = [name, clientName]
        let rowTotal = 0
        for (const m of months) {
          const r = rowByMonth.get(m)
          const isIssued = r?.status === 'issued' || r?.status === 'paid'
          const plan = r?.planned_amount ?? 0
          const actual = isIssued ? Math.max(0, (r?.actual_amount ?? 0) - hostingAmt) : 0
          retRow.push(plan || null, actual || null)
          rowTotal += isIssued && actual > 0 ? actual : plan
        }
        retRow.push(rowTotal || null)
        data.push(retRow)
      }
    }

    // Hosting
    if (activeHostingClients.length > 0) {
      data.push([])
      data.push(['HOSTING'])
      data.push(['Client', 'Description', 'Cycle', ...monthLabels, 'Total'])
      for (const h of activeHostingClients) {
        const hostRow: Row = [h.client?.name ?? '', h.description ?? '', h.cycle]
        for (const m of months) hostRow.push(hostingCellAmount(h.id, m) ?? null)
        hostRow.push(hostingRowTotal(h.id) || null)
        data.push(hostRow)
      }
      const hostTot: Row = ['HOSTING TOTAL', '', '']
      for (const m of months) hostTot.push(hostingMonthTotal(m) || null)
      hostTot.push(hostingGrandTotal || null)
      data.push(hostTot)
    }

    // Domains
    if (domainsInHalf.length > 0) {
      data.push([])
      data.push(['DOMAIN RENEWALS'])
      data.push(['Domain', 'Client', 'Month', 'Amount'])
      for (const d of domainsInHalf) {
        data.push([d.domain_name, d.client?.name ?? '', fmtMonthShort(domainInvoiceMonth(d)), d.yearly_amount ?? null])
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Invoice Plan')
    XLSX.writeFile(wb, `invoice-plan-${half}-${year}.xlsx`)
    setExportOpen(false)
  }

  function exportPDF() {
    setExportOpen(false)
    const { agencyLogo, agencyName } = settingsStore
    const logoHtml = buildLogoHtml(agencyLogo, agencyName)
    const today = new Date().toLocaleDateString('en-GB')
    const monthLabels = months.map(m => fmtMonthShort(m))
    const rec = recurringTotal()

    const typeColors: Record<string, { bg: string; color: string }> = {
      fixed:       { bg: '#e0f2fe', color: '#0369a1' },
      maintenance: { bg: '#dbeafe', color: '#1d4ed8' },
      variable:    { bg: '#fef3c7', color: '#92400e' },
      internal:    { bg: '#f4f2f6', color: '#374151' },
    }
    const typeLabels: Record<string, string> = { fixed: 'Fixed', maintenance: 'Recurring', variable: 'Variable', internal: 'Internal' }
    function typePill(type: string) {
      const c = typeColors[type] ?? { bg: '#f4f2f6', color: '#374151' }
      return `<span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:8px;font-weight:700;background:${c.bg};color:${c.color}">${typeLabels[type] ?? type}</span>`
    }

    // ── Projects table ─────────────────────────────────────────────────────────
    const projHeaderCols = monthLabels.flatMap(l =>
      [`<th class="r">${l}<br>Plan</th>`, `<th class="r">${l}<br>Act</th>`]
    ).join('')

    let projGrandTotal = 0
    const projRows = activeProjects.map((p, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#fafaf9'
      let projPlanned = 0, projActual = 0
      const cells = months.map(m => {
        const c = rowMap.get(`${p.id}:${m}`)
        const planned = c?.planned_amount ?? 0
        const isIssuedPaid = c?.status === 'issued' || c?.status === 'paid'
        const actual = isIssuedPaid ? (c?.actual_amount ?? 0) : 0
        projPlanned += planned
        projActual += actual
        const planBg = getCellBg(c) !== 'transparent' ? getCellBg(c) : bg
        return `<td style="background:${planBg};text-align:right">${planned || '—'}</td><td style="background:${actual ? '#f0fdf4' : bg};text-align:right;color:${actual ? '#16a34a' : '#94a3b8'}">${actual || '—'}</td>`
      }).join('')
      const total = projActual > 0 ? projActual : projPlanned
      projGrandTotal += total
      return `<tr>
        <td style="background:${bg};font-weight:600">${p.name}</td>
        <td style="background:${bg};color:#6b7280">${p.client?.name ?? ''}</td>
        <td style="background:${bg}">${typePill(p.type)}</td>
        ${cells}
        <td style="background:${bg};font-weight:700;text-align:right;color:#16a34a">${total || '—'}</td>
      </tr>`
    }).join('')

    const totCells = months.map(m => {
      const plan = monthPlannedTotal(m)
      const actual = monthActualTotal(m)
      return `<td style="text-align:right;font-weight:700;background:#f0f4ff">${plan || '—'}</td><td style="text-align:right;font-weight:700;background:#f0f4ff;color:#16a34a">${actual || '—'}</td>`
    }).join('')

    const projHtml = `
      <div class="section-title">Projects</div>
      <table>
        <thead><tr><th>Project</th><th>Client</th><th>Type</th>${projHeaderCols}<th class="r">Total</th></tr></thead>
        <tbody>
          ${projRows}
          <tr>
            <td colspan="3" style="font-weight:700;background:#f0f4ff">Monthly Total</td>
            ${totCells}
            <td style="text-align:right;font-weight:700;background:#f0f4ff;color:#16a34a">${projGrandTotal || '—'}</td>
          </tr>
        </tbody>
      </table>`

    // ── Maintenance Retainers ──────────────────────────────────────────────────
    let retHtml = ''
    if (retainerByMaint.size > 0) {
      const retHeaderCols = monthLabels.flatMap(l =>
        [`<th class="r">${l}<br>Plan</th>`, `<th class="r">${l}<br>Act</th>`]
      ).join('')
      const retRows = [...retainerByMaint.entries()].map(([mid, { name, clientName, rows: rr }], i) => {
        const bg = i % 2 === 0 ? '#ffffff' : '#fafaf9'
        const linkedHosting = infraStore.hostingClients.find(h => h.maintenance_id === mid && h.cycle === 'monthly')
        const hostingAmt = linkedHosting?.amount ?? 0
        const byMonth = new Map(rr.map(r => [r.month, r]))
        let rowTotal = 0
        const cells = months.map(m => {
          const r = byMonth.get(m)
          const isIssued = r?.status === 'issued' || r?.status === 'paid'
          const plan = r?.planned_amount ?? 0
          const actual = isIssued ? Math.max(0, (r?.actual_amount ?? 0) - hostingAmt) : 0
          rowTotal += isIssued && actual > 0 ? actual : plan
          return `<td style="background:${bg};text-align:right">${plan || '—'}</td><td style="background:${actual ? '#f0fdf4' : bg};text-align:right;color:${actual ? '#16a34a' : '#94a3b8'}">${actual || '—'}</td>`
        }).join('')
        return `<tr>
          <td style="background:${bg};font-weight:600">${name}</td>
          <td style="background:${bg};color:#6b7280">${clientName}</td>
          ${cells}
          <td style="background:${bg};font-weight:700;text-align:right;color:#16a34a">${rowTotal || '—'}</td>
        </tr>`
      }).join('')
      retHtml = `
        <div class="section-title">Maintenance Retainers</div>
        <table>
          <thead><tr><th>Contract</th><th>Client</th>${retHeaderCols}<th class="r">Total</th></tr></thead>
          <tbody>${retRows}</tbody>
        </table>`
    }

    // ── Hosting ────────────────────────────────────────────────────────────────
    let hostHtml = ''
    if (activeHostingClients.length > 0) {
      const hostRows = activeHostingClients.map((h, i) => {
        const bg = i % 2 === 0 ? '#ffffff' : '#fafaf9'
        const cells = months.map(m => {
          const amt = hostingCellAmount(h.id, m)
          return `<td style="background:${bg};text-align:right">${amt != null ? amt : '—'}</td>`
        }).join('')
        return `<tr>
          <td style="background:${bg};font-weight:600">${h.client?.name ?? ''}</td>
          <td style="background:${bg};color:#6b7280">${h.description ?? ''}</td>
          <td style="background:${bg}">${h.cycle}</td>
          ${cells}
          <td style="background:${bg};font-weight:700;text-align:right;color:#16a34a">${hostingRowTotal(h.id) || '—'}</td>
        </tr>`
      }).join('')
      hostHtml = `
        <div class="section-title">Hosting</div>
        <table>
          <thead><tr><th>Client</th><th>Description</th><th>Cycle</th>${monthLabels.map(l => `<th class="r">${l}</th>`).join('')}<th class="r">Total</th></tr></thead>
          <tbody>${hostRows}</tbody>
        </table>`
    }

    // ── Domains ────────────────────────────────────────────────────────────────
    let domHtml = ''
    if (domainsInHalf.length > 0) {
      const domRows = domainsInHalf.map((d, i) => {
        const bg = i % 2 === 0 ? '#ffffff' : '#fafaf9'
        return `<tr>
          <td style="background:${bg};font-weight:600">${d.domain_name}</td>
          <td style="background:${bg};color:#6b7280">${d.client?.name ?? ''}</td>
          <td style="background:${bg}">${fmtMonthShort(domainInvoiceMonth(d))}</td>
          <td style="background:${bg};text-align:right;font-weight:700;color:#16a34a">${d.yearly_amount ?? '—'} €</td>
        </tr>`
      }).join('')
      domHtml = `
        <div class="section-title">Domain Renewals</div>
        <table>
          <thead><tr><th>Domain</th><th>Client</th><th>Month</th><th class="r">Amount</th></tr></thead>
          <tbody>${domRows}</tbody>
        </table>`
    }

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
  .page{width:297mm;min-height:210mm;margin:20px auto;padding:8mm 12mm;background:#fff;box-shadow:0 4px 40px rgba(0,0,0,.12)}
  @media print{body{background:#fff}.page{margin:0;box-shadow:none;width:297mm}}
  @page{size:A4 landscape;margin:0}
  .header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:5mm;border-bottom:2px solid #E85C1A;padding-bottom:4mm}
  .doc-title{font-size:12px;font-weight:700;color:#1a1a1a;margin-top:3px}
  .meta{text-align:right;font-size:9px;color:#6b7280;line-height:1.7}
  .stats{display:flex;gap:10px;margin-bottom:5mm}
  .stat{background:#fafaf9;border:1px solid #e0e0dd;border-radius:6px;padding:5px 10px;flex:1;text-align:center}
  .stat-val{font-size:13px;font-weight:800;color:#1a1a1a}
  .stat-lbl{font-size:8px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-top:1px}
  .section-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#6b7280;margin:5mm 0 2mm}
  table{width:100%;border-collapse:collapse;margin-bottom:1mm}
  th{background:#1a1a1a;color:#fff;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:4px 6px;text-align:left;white-space:nowrap}
  th.r{text-align:right}
  td{padding:4px 6px;border-bottom:1px solid #f0efed;font-size:9.5px;vertical-align:middle}
  .footer{margin-top:5mm;border-top:1px solid #e0e0dd;padding-top:2mm;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      ${logoHtml}
      <div class="doc-title">Invoice Plan — ${half} ${year}</div>
    </div>
    <div class="meta">
      <div>Exported ${today}</div>
      <div>support@renderspace.si</div>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-val">${fmtAmt(confirmedTotal + rec)}</div><div class="stat-lbl">Confirmed</div></div>
    <div class="stat"><div class="stat-val">${fmtAmt(likelyTotal + rec)}</div><div class="stat-lbl">Likely</div></div>
    <div class="stat"><div class="stat-val">${fmtAmt(bestCaseTotal + rec)}</div><div class="stat-lbl">Best Case</div></div>
    <div class="stat"><div class="stat-val" style="color:#16a34a">${fmtAmt(actualSum)}</div><div class="stat-lbl">Actual Issued</div></div>
  </div>
  ${projHtml}
  ${retHtml}
  ${hostHtml}
  ${domHtml}
  <div class="footer">
    <div>${agencyName || 'Renderspace'} · support@renderspace.si · +386 (1) 23 91 200</div>
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
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Invoice Planning</h1>
          <p>Plan and track invoices across projects</p>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Period nav */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(-1)}
              className="px-2.5 min-w-0"
            >
              ‹
            </Button>
            <div className="flex items-center overflow-hidden rounded-[7px] border-[1.5px] border-border">
              {(['H1', 'H2'] as Half[]).map(h => (
                <button
                  key={h}
                  onClick={() => setHalf(h)}
                  className="px-3 py-1 text-xs font-bold border-none cursor-pointer transition-colors"
                  style={{
                    background: half === h ? 'var(--navy)' : '#fff',
                    color: half === h ? '#fff' : 'var(--c3)',
                    fontFamily: 'inherit',
                    letterSpacing: '0.3px',
                  }}
                >
                  {h} {year}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(1)}
              className="px-2.5 min-w-0"
            >
              ›
            </Button>
          </div>
          <div className="relative" ref={exportRef}>
            <Button variant="outline" size="sm" onClick={() => setExportOpen(o => !o)}>
              Export ▾
            </Button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-[7px] shadow-md z-50 min-w-[160px] overflow-hidden">
                <button
                  onClick={exportExcel}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[#f5f3f8] cursor-pointer"
                  style={{ fontFamily: 'inherit', border: 'none', background: 'transparent', display: 'block' }}
                >
                  Export Excel (.xlsx)
                </button>
                <button
                  onClick={exportPDF}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[#f5f3f8] cursor-pointer"
                  style={{ fontFamily: 'inherit', border: 'none', background: 'transparent', display: 'block' }}
                >
                  Export PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error banners */}
      {(pStore.error || rpStore.error) && (
        <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c] mx-7 mb-4">
          <span>Failed to load data. Please check your connection.</span>
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-3 mb-4 px-6 pt-5">
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Confirmed</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtAmt(confirmedTotal + recurringTotalValue)}</div>
          <div className="text-xs text-muted-foreground mt-1">projects + hosting + retainers</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Likely</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtAmt(likelyTotal + recurringTotalValue)}</div>
          <div className="text-xs text-muted-foreground mt-1">confirmed + 50% invoices</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Best Case</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtAmt(bestCaseTotal + recurringTotalValue)}</div>
          <div className="text-xs text-muted-foreground mt-1">confirmed + 50% + 25%</div>
        </div>
        <div className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
          <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">Actual Issued</div>
          <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{fmtAmt(actualSum)}</div>
          <div className="text-xs text-muted-foreground mt-1">issued + paid</div>
        </div>
      </div>

      {/* Main grid */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="card">
            <div className="text-center px-5 py-[52px] text-muted-foreground">
              <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              <div className="font-semibold mt-3">Loading projects…</div>
            </div>
          </div>
        ) : activeProjects.length === 0 ? (
          <div className="card">
            <div className="text-center px-5 py-[52px]">
              <div className="font-bold text-[15px] text-[#374151] mb-1">No active projects</div>
              <div className="text-sm">Mark projects as active to see them in Invoice Planning.</div>
            </div>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 900 }}>
                <colgroup>
                  <col style={{ width: 210 }} />
                  {months.map(m => (
                    <React.Fragment key={m}>
                      <col style={{ width: 80 }} />
                      <col style={{ width: 80 }} />
                    </React.Fragment>
                  ))}
                  <col style={{ width: 100 }} />
                </colgroup>

                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th rowSpan={2} style={{
                      padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.7px', color: '#6b7280',
                      background: '#f9fafb', position: 'sticky', left: 0, zIndex: 2,
                      borderRight: '2px solid #e5e7eb', borderBottom: '2px solid #e5e7eb', verticalAlign: 'bottom',
                    }}>
                      Project / Client
                    </th>
                    {months.map(m => (
                      <th key={m} colSpan={2} style={{
                        padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.7px', color: '#6b7280',
                        background: '#f9fafb', borderLeft: '2px solid #e5e7eb', whiteSpace: 'nowrap',
                        borderBottom: '1px solid #e5e7eb',
                      }}>
                        {fmtMonthShort(m)}
                      </th>
                    ))}
                    <th rowSpan={2} style={{
                      padding: '10px 10px', textAlign: 'right', fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.7px', color: '#6b7280',
                      background: '#f9fafb', borderLeft: '2px solid #d1d5db', borderBottom: '2px solid #e5e7eb',
                      whiteSpace: 'nowrap', verticalAlign: 'bottom',
                    }}>
                      Total
                    </th>
                  </tr>
                  <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                    {months.map(m => (
                      <React.Fragment key={m}>
                        <th style={{
                          padding: '4px 6px', textAlign: 'right', fontSize: 9, fontWeight: 600,
                          color: '#9ca3af', background: '#f9fafb', borderLeft: '2px solid #e5e7eb',
                          whiteSpace: 'nowrap', letterSpacing: '0.3px',
                        }}>Plan</th>
                        <th style={{
                          padding: '4px 6px', textAlign: 'right', fontSize: 9, fontWeight: 600,
                          color: '#9ca3af', background: '#f9fafb', borderLeft: '1px solid #e5e7eb',
                          whiteSpace: 'nowrap', letterSpacing: '0.3px',
                        }}>Actual</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {activeProjects.map((project, rowIdx) => {
                    const rowBg = rowIdx % 2 === 0 ? '#fff' : '#fafafa'
                    const rowPlanned = months.reduce((s, m) => {
                      const row = rowMap.get(`${project.id}:${m}`)
                      return s + (row?.planned_amount ?? 0)
                    }, 0)
                    const rowActual = months.reduce((s, m) => {
                      const row = rowMap.get(`${project.id}:${m}`)
                      if (row?.status === 'issued' || row?.status === 'paid') return s + (row.actual_amount ?? row.planned_amount ?? 0)
                      return s
                    }, 0)

                    return (
                      <React.Fragment key={project.id}>
                        <tr style={{ background: rowBg, borderBottom: '1px solid #f3f4f6' }}>
                          {/* Project label */}
                          <td style={{
                            padding: '10px 16px', position: 'sticky', left: 0, zIndex: 1,
                            background: rowBg, borderRight: '2px solid #e5e7eb', verticalAlign: 'middle',
                          }}>
                            <div style={{ marginBottom: 3 }}>
                              <TypeBadge type={project.type} />
                            </div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', lineHeight: 1.3, marginBottom: 2 }}>
                              {project.name}
                            </div>
                            {project.client?.name && (
                              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
                                {project.client.name}
                              </div>
                            )}
                          </td>

                          {/* Plan + Actual cells per month */}
                          {months.map(month => {
                            const popKey = `${project.id}:${month}`
                            const row = rowMap.get(popKey)
                            const prob = row?.probability ?? 100
                            const { text: probText } = probColors(prob)
                            const isIssued = row?.status === 'issued' || row?.status === 'paid'
                            const isDeferred = row?.status === 'deferred'
                            const planned = row?.planned_amount ?? null
                            const actual = isIssued ? (row?.actual_amount ?? null) : null
                            const cellBg = row ? getCellBg(row) : rowBg

                            return (
                              <React.Fragment key={month}>
                                {/* Plan cell */}
                                <td style={{
                                  padding: '6px 6px', borderLeft: '2px solid #e5e7eb',
                                  background: row ? cellBg : rowBg, verticalAlign: 'middle', textAlign: 'right',
                                }}>
                                  {planned != null ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <span style={{
                                          fontWeight: 600, fontSize: 11, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                                          color: isDeferred ? '#ef4444' : isIssued ? '#9ca3af' : probText,
                                          textDecoration: isDeferred ? 'line-through' : undefined,
                                        }}>
                                          {fmtAmt(planned)}
                                        </span>
                                        {isDeferred && (
                                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', whiteSpace: 'nowrap' }}>
                                            defer
                                          </span>
                                        )}
                                      </div>
                                      {!isIssued && !isDeferred && row && (
                                        <span style={{
                                          display: 'inline-block', fontSize: 9, fontWeight: 700,
                                          padding: '1px 3px', borderRadius: 3,
                                          background: probColors(prob).bg, color: probColors(prob).text,
                                          border: `1px solid ${probColors(prob).border}`,
                                          whiteSpace: 'nowrap',
                                        }}>
                                          {prob}%
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                                  )}
                                </td>
                                {/* Actual cell */}
                                <td style={{
                                  padding: '6px 6px', borderLeft: '1px solid #e5e7eb',
                                  background: isIssued ? '#f0fdf4' : isDeferred ? '#fef2f2' : rowBg, verticalAlign: 'middle', textAlign: 'right',
                                }}>
                                  {actual != null ? (
                                    <span style={{ fontWeight: 700, fontSize: 11, color: '#1d4ed8', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                      {fmtAmt(actual)}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                                  )}
                                </td>
                              </React.Fragment>
                            )
                          })}

                          {/* Row total — shows actual if any issued/paid, else planned */}
                          <td style={{
                            padding: '8px 10px', textAlign: 'right', borderLeft: '2px solid #d1d5db',
                            fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 12,
                            color: rowActual > 0 ? 'var(--blue)' : rowPlanned > 0 ? 'var(--navy)' : '#d1d5db', whiteSpace: 'nowrap', background: rowBg,
                          }}>
                            {rowActual > 0 ? fmtAmt(rowActual) : rowPlanned > 0 ? fmtAmt(rowPlanned) : '—'}
                          </td>
                        </tr>

                        {/* Costs sub-row */}
                        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{
                            padding: '4px 16px 4px 28px', position: 'sticky', left: 0, zIndex: 1,
                            background: '#fafafa', borderRight: '2px solid #e5e7eb',
                          }}>
                            <span style={{ fontSize: 10, fontStyle: 'italic', fontWeight: 600, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                              costs
                            </span>
                          </td>
                          {months.map(month => {
                            const costRow = rpStore.rows.find(
                              r => r.project_id === project.id && r.month === month && r.status === 'cost'
                            )
                            const hasCost = costRow && (costRow.actual_amount ?? 0) > 0
                            return (
                              <td key={month} colSpan={2} style={{ padding: '4px 8px', borderLeft: '2px solid #e5e7eb', background: hasCost ? '#fef2f2' : '#fafafa', textAlign: 'right' }}>
                                {hasCost ? (
                                  <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                                    {fmtAmt(costRow!.actual_amount!)}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 10, color: '#d1d5db' }}>—</span>
                                )}
                              </td>
                            )
                          })}
                          <td style={{ borderLeft: '2px solid #d1d5db', background: '#fafafa' }} />
                        </tr>
                      </React.Fragment>
                    )
                  })}
                </tbody>

                {/* Footer totals */}
                <tfoot>
                  <tr style={{ borderTop: '2px solid #d1d5db', background: '#f0f4ff' }}>
                    <td style={{
                      padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.7px', color: 'var(--navy)', position: 'sticky', left: 0,
                      background: '#f0f4ff', borderRight: '2px solid #e5e7eb', zIndex: 1,
                    }}>
                      Monthly Total
                    </td>
                    {months.map(m => {
                      const planned = monthPlannedTotal(m)
                      const actual = monthActualTotal(m)
                      return (
                        <React.Fragment key={m}>
                          <td style={{
                            padding: '10px 6px', textAlign: 'right', borderLeft: '2px solid #e5e7eb',
                            fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                            color: planned > 0 ? 'var(--navy)' : '#d1d5db', whiteSpace: 'nowrap',
                          }}>
                            {planned > 0 ? fmtAmt(planned) : '—'}
                          </td>
                          <td style={{
                            padding: '10px 6px', textAlign: 'right', borderLeft: '1px solid #e5e7eb',
                            fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                            color: actual > 0 ? '#1d4ed8' : '#d1d5db', whiteSpace: 'nowrap',
                            background: actual > 0 ? '#f0fdf4' : undefined,
                          }}>
                            {actual > 0 ? fmtAmt(actual) : '—'}
                          </td>
                        </React.Fragment>
                      )
                    })}
                    <td style={{
                      padding: '10px 10px', textAlign: 'right', borderLeft: '2px solid #d1d5db',
                      fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 13,
                      color: totalPlanned > 0 ? 'var(--navy)' : '#d1d5db', whiteSpace: 'nowrap',
                    }}>
                      {totalPlanned > 0 ? fmtAmt(totalPlanned) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '10px 16px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', flexWrap: 'wrap' }}>
              {[
                { color: '#f0fdf4', border: '#86efac', label: '100% — Confirmed' },
                { color: '#fffbeb', border: '#fde68a', label: '50% — Likely' },
                { color: '#fff7ed', border: '#fed7aa', label: '25% — Unlikely' },
                { color: '#f0fdf4', border: '#93c5fd', label: 'Issued/Paid' },
                { color: '#fef2f2', border: '#fca5a5', label: 'Costs / Deferred' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color, border: `1px solid ${item.border}`, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Maintenance Retainers ── */}
        {retainerByMaint.size > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="flex items-center justify-between mb-3">
              <h2>Maintenance Retainers</h2>
            </div>

            <div className="card overflow-hidden">
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  tableLayout: 'fixed',
                  minWidth: 800,
                }}>
                  <colgroup>
                    <col style={{ width: 220 }} />
                    {months.map(m => (
                      <React.Fragment key={m}>
                        <col />
                        <col />
                      </React.Fragment>
                    ))}
                    <col style={{ width: 100 }} />
                  </colgroup>

                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th rowSpan={2} style={{
                        padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.7px', color: '#6b7280',
                        background: '#f9fafb', position: 'sticky', left: 0, zIndex: 2,
                        borderRight: '2px solid #e5e7eb', borderBottom: '2px solid #e5e7eb', verticalAlign: 'bottom',
                      }}>
                        Contract
                      </th>
                      {months.map(m => (
                        <th key={m} colSpan={2} style={{
                          padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.7px', color: '#6b7280',
                          background: '#f9fafb', borderLeft: '2px solid #e5e7eb', whiteSpace: 'nowrap',
                          borderBottom: '1px solid #e5e7eb',
                        }}>
                          {fmtMonthShort(m)}
                        </th>
                      ))}
                      <th rowSpan={2} style={{
                        padding: '10px 10px', textAlign: 'right', fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.7px', color: '#6b7280',
                        background: '#f9fafb', borderLeft: '2px solid #d1d5db', borderBottom: '2px solid #e5e7eb',
                        whiteSpace: 'nowrap', verticalAlign: 'bottom',
                      }}>
                        Total
                      </th>
                    </tr>
                    <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                      {months.map(m => (
                        <React.Fragment key={m}>
                          <th style={{
                            padding: '4px 6px', textAlign: 'right', fontSize: 9, fontWeight: 600,
                            color: '#9ca3af', background: '#f9fafb', borderLeft: '2px solid #e5e7eb',
                            whiteSpace: 'nowrap', letterSpacing: '0.3px',
                          }}>Plan</th>
                          <th style={{
                            padding: '4px 6px', textAlign: 'right', fontSize: 9, fontWeight: 600,
                            color: '#9ca3af', background: '#f9fafb', borderLeft: '1px solid #e5e7eb',
                            whiteSpace: 'nowrap', letterSpacing: '0.3px',
                          }}>Actual</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {[...retainerByMaint.entries()].map(([mid, { name, clientName, rows }], rowIdx) => {
                      const linkedHosting = infraStore.hostingClients.find(
                        h => h.maintenance_id === mid && h.cycle === 'monthly'
                      )
                      const hostingAmt = linkedHosting?.amount ?? 0
                      const rowByMonth = new Map(rows.map(r => [r.month, r]))
                      const rowBg = rowIdx % 2 === 0 ? '#fff' : '#fafafa'
                      const rowTotal = months.reduce((s, m) => {
                        const r = rowByMonth.get(m)
                        const isIssued = r?.status === 'issued' || r?.status === 'paid'
                        if (isIssued && r?.actual_amount != null) {
                          return s + Math.max(0, r.actual_amount - hostingAmt)
                        }
                        return s + (r?.planned_amount ?? 0)
                      }, 0)

                      return (
                        <tr key={name} style={{ background: rowBg, borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{
                            padding: '10px 16px', position: 'sticky', left: 0, zIndex: 1,
                            background: rowBg, borderRight: '2px solid #e5e7eb', verticalAlign: 'middle',
                          }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', lineHeight: 1.3, marginBottom: 2 }}>
                              {name}
                            </div>
                            <div style={{ fontSize: 11, color: '#6b7280' }}>{clientName}</div>
                          </td>

                          {months.map(m => {
                            const r = rowByMonth.get(m)
                            const planned = r?.planned_amount ?? null
                            const isIssued = r?.status === 'issued' || r?.status === 'paid'
                            const rawActual = isIssued ? (r?.actual_amount ?? null) : null
                            // Show retainer portion only: subtract linked hosting amount
                            const actual = rawActual != null ? Math.max(0, rawActual - hostingAmt) : null
                            // Show 0 only when explicitly marked not invoiced (deferred/retainer)
                            const isExplicitlyNotIssued = r != null && (r.status === 'deferred' || r.status === 'retainer')
                            const isUnissued = planned != null && !isIssued && isExplicitlyNotIssued
                            const hasActual = actual != null
                            const showPlan = planned != null
                            const planCellBg = showPlan && !isIssued ? '#fffbeb' : rowBg
                            const actualCellBg = hasActual
                              ? actual! >= (planned ?? 0) ? '#f0fdf4' : '#fef2f2'
                              : isUnissued ? '#fef2f2' : rowBg

                            return (
                              <React.Fragment key={m}>
                                {/* Plan cell */}
                                <td style={{
                                  padding: '6px 6px', borderLeft: '2px solid #e5e7eb',
                                  background: planCellBg, verticalAlign: 'middle', textAlign: 'right',
                                }}>
                                  {showPlan ? (
                                    <span style={{
                                      fontWeight: 600, fontSize: 11, color: '#92400e',
                                      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                                    }}>
                                      {fmtAmt(planned!)}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                                  )}
                                </td>
                                {/* Actual cell */}
                                <td style={{
                                  padding: '6px 6px', borderLeft: '1px solid #e5e7eb',
                                  background: hasActual ? actualCellBg : isUnissued ? '#fef2f2' : rowBg,
                                  verticalAlign: 'middle', textAlign: 'right',
                                }}>
                                  {hasActual ? (
                                    <span style={{
                                      fontWeight: 700, fontSize: 11,
                                      color: actual! >= (planned ?? 0) ? 'var(--green)' : '#dc2626',
                                      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                                    }}>
                                      {fmtAmt(actual!)}
                                    </span>
                                  ) : isUnissued ? (
                                    <span style={{ fontWeight: 700, fontSize: 11, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{fmtAmt(0)}</span>
                                  ) : (
                                    <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                                  )}
                                </td>
                              </React.Fragment>
                            )
                          })}

                          <td style={{
                            padding: '8px 10px', textAlign: 'right', borderLeft: '2px solid #d1d5db',
                            fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 12,
                            color: rowTotal > 0 ? 'var(--navy)' : '#d1d5db',
                            whiteSpace: 'nowrap', background: rowBg,
                          }}>
                            {rowTotal > 0 ? fmtAmt(rowTotal) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    {/* Total Plan row */}
                    <tr style={{ borderTop: '2px solid #d1d5db', background: '#f0f4ff' }}>
                      <td style={{
                        padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.7px', color: 'var(--navy)', position: 'sticky', left: 0,
                        background: '#f0f4ff', borderRight: '2px solid #e5e7eb', zIndex: 1,
                      }}>
                        Total Plan
                      </td>
                      {months.map(m => {
                        const planned = [...retainerByMaint.values()].reduce((s, { rows }) => {
                          const r = rows.find(r => r.month === m)
                          return s + (r?.planned_amount ?? 0)
                        }, 0)
                        return (
                          <React.Fragment key={m}>
                            <td style={{
                              padding: '10px 6px', textAlign: 'right', borderLeft: '2px solid #e5e7eb',
                              fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                              color: planned > 0 ? 'var(--navy)' : '#d1d5db', whiteSpace: 'nowrap',
                            }}>
                              {planned > 0 ? fmtAmt(planned) : '—'}
                            </td>
                            <td style={{ borderLeft: '1px solid #e5e7eb' }} />
                          </React.Fragment>
                        )
                      })}
                      <td style={{
                        padding: '10px 10px', textAlign: 'right', borderLeft: '2px solid #d1d5db',
                        fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 14,
                        color: 'var(--navy)', whiteSpace: 'nowrap',
                      }}>
                        {fmtAmt(months.reduce((s, m) =>
                          s + [...retainerByMaint.values()].reduce((rs, { rows }) => {
                            const r = rows.find(r => r.month === m)
                            return rs + (r?.planned_amount ?? 0)
                          }, 0), 0))}
                      </td>
                    </tr>
                    {/* Total Actual row */}
                    <tr style={{ background: '#f0f4ff' }}>
                      <td style={{
                        padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.7px', color: 'var(--navy)', position: 'sticky', left: 0,
                        background: '#f0f4ff', borderRight: '2px solid #e5e7eb', zIndex: 1,
                      }}>
                        Total Actual
                      </td>
                      {months.map(m => {
                        const planned = [...retainerByMaint.values()].reduce((s, { rows }) => {
                          const r = rows.find(r => r.month === m)
                          return s + (r?.planned_amount ?? 0)
                        }, 0)
                        const actual = [...retainerByMaint.entries()].reduce((s, [mid, { rows }]) => {
                          const r = rows.find(r => r.month === m)
                          const isIssued = r?.status === 'issued' || r?.status === 'paid'
                          const rawA = isIssued ? (r?.actual_amount ?? 0) : 0
                          const hAmt = infraStore.hostingClients.find(
                            h => h.maintenance_id === mid && h.cycle === 'monthly'
                          )?.amount ?? 0
                          return s + Math.max(0, rawA - hAmt)
                        }, 0)
                        const hasActual = actual > 0
                        return (
                          <React.Fragment key={m}>
                            <td style={{ borderLeft: '2px solid #e5e7eb' }} />
                            <td style={{
                              padding: '10px 6px', textAlign: 'right', borderLeft: '1px solid #e5e7eb',
                              fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                              color: hasActual ? (actual >= planned ? 'var(--green)' : '#dc2626') : '#d1d5db',
                              whiteSpace: 'nowrap',
                            }}>
                              {hasActual ? fmtAmt(actual) : '—'}
                            </td>
                          </React.Fragment>
                        )
                      })}
                      <td style={{
                        padding: '10px 10px', textAlign: 'right', borderLeft: '2px solid #d1d5db',
                        fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 14,
                        color: 'var(--green)', whiteSpace: 'nowrap',
                      }}>
                        {fmtAmt(months.reduce((s, m) =>
                          s + [...retainerByMaint.entries()].reduce((rs, [mid, { rows }]) => {
                            const r = rows.find(r => r.month === m)
                            const isIssued = r?.status === 'issued' || r?.status === 'paid'
                            const hAmt = infraStore.hostingClients.find(h => h.maintenance_id === mid && h.cycle === 'monthly')?.amount ?? 0
                            if (isIssued && r?.actual_amount != null) return rs + Math.max(0, r.actual_amount - hAmt)
                            return rs
                          }, 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Change Requests */}
        {crByMaint.size > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="flex items-center justify-between mb-3">
              <h2>Change Requests</h2>
            </div>

            <div className="card overflow-hidden">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 800 }}>
                  <colgroup>
                    <col style={{ width: 220 }} />
                    {months.map(m => (
                      <React.Fragment key={m}>
                        <col />
                        <col />
                      </React.Fragment>
                    ))}
                    <col style={{ width: 100 }} />
                  </colgroup>

                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th rowSpan={2} style={{
                        padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.7px', color: '#6b7280',
                        background: '#f9fafb', position: 'sticky', left: 0, zIndex: 2,
                        borderRight: '2px solid #e5e7eb', borderBottom: '2px solid #e5e7eb', verticalAlign: 'bottom',
                      }}>
                        Change Request
                      </th>
                      {months.map(m => (
                        <th key={m} colSpan={2} style={{
                          padding: '6px 8px', textAlign: 'center', fontSize: 10, fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.7px', color: '#6b7280',
                          background: '#f9fafb', borderLeft: '2px solid #e5e7eb', whiteSpace: 'nowrap',
                          borderBottom: '1px solid #e5e7eb',
                        }}>
                          {fmtMonthShort(m)}
                        </th>
                      ))}
                      <th rowSpan={2} style={{
                        padding: '10px 10px', textAlign: 'right', fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.7px', color: '#6b7280',
                        background: '#f9fafb', borderLeft: '2px solid #d1d5db', borderBottom: '2px solid #e5e7eb',
                        whiteSpace: 'nowrap', verticalAlign: 'bottom',
                      }}>
                        Total
                      </th>
                    </tr>
                    <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                      {months.map(m => (
                        <React.Fragment key={m}>
                          <th style={{ padding: '4px 6px', textAlign: 'right', fontSize: 9, fontWeight: 600, color: '#9ca3af', background: '#f9fafb', borderLeft: '2px solid #e5e7eb', whiteSpace: 'nowrap', letterSpacing: '0.3px' }}>Plan</th>
                          <th style={{ padding: '4px 6px', textAlign: 'right', fontSize: 9, fontWeight: 600, color: '#9ca3af', background: '#f9fafb', borderLeft: '1px solid #e5e7eb', whiteSpace: 'nowrap', letterSpacing: '0.3px' }}>Actual</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {[...crByMaint.entries()].map(([, { maintName, clientName, crs }]) =>
                      crs.map((cr, crIdx) => {
                        const rowBg = crIdx % 2 === 0 ? '#fff' : '#fafafa'
                        const rowTotal = months.reduce((s, m) => {
                          const r = cr.rowByMonth.get(m)
                          const isIssued = r?.status === 'issued' || r?.status === 'paid'
                          if (isIssued && r?.actual_amount != null) return s + r.actual_amount
                          return s + (r?.planned_amount ?? 0)
                        }, 0)

                        return (
                          <tr key={`${maintName}-${cr.title}`} style={{ background: rowBg, borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{
                              padding: '10px 16px', position: 'sticky', left: 0, zIndex: 1,
                              background: rowBg, borderRight: '2px solid #e5e7eb', verticalAlign: 'middle',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                                <Badge variant="navy" className="text-[9px]">CR</Badge>
                              </div>
                              <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', lineHeight: 1.3, marginBottom: 2 }}>{cr.title}</div>
                              <div style={{ fontSize: 11, color: '#6b7280' }}>{maintName} · {clientName}</div>
                            </td>

                            {months.map(m => {
                              const r = cr.rowByMonth.get(m)
                              const planned = r?.planned_amount ?? null
                              const isIssued = r?.status === 'issued' || r?.status === 'paid'
                              const actual = isIssued ? (r?.actual_amount ?? null) : null
                              const planCellBg = planned != null && !isIssued ? '#fffbeb' : rowBg

                              return (
                                <React.Fragment key={m}>
                                  <td style={{ padding: '6px 6px', borderLeft: '2px solid #e5e7eb', background: planCellBg, verticalAlign: 'middle', textAlign: 'right' }}>
                                    {planned != null ? (
                                      <span style={{ fontWeight: 600, fontSize: 11, color: '#92400e', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                        {fmtAmt(planned)}
                                      </span>
                                    ) : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>}
                                  </td>
                                  <td style={{ padding: '6px 6px', borderLeft: '1px solid #e5e7eb', background: actual != null ? '#f0fdf4' : rowBg, verticalAlign: 'middle', textAlign: 'right' }}>
                                    {actual != null ? (
                                      <span style={{ fontWeight: 700, fontSize: 11, color: '#1d4ed8', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                        {fmtAmt(actual)}
                                      </span>
                                    ) : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>}
                                  </td>
                                </React.Fragment>
                              )
                            })}

                            <td style={{
                              padding: '8px 10px', textAlign: 'right', borderLeft: '2px solid #d1d5db',
                              fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 12,
                              color: rowTotal > 0 ? 'var(--navy)' : '#d1d5db', whiteSpace: 'nowrap', background: rowBg,
                            }}>
                              {rowTotal > 0 ? fmtAmt(rowTotal) : '—'}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>

                  <tfoot>
                    <tr style={{ borderTop: '2px solid #d1d5db', background: '#f0f4ff' }}>
                      <td style={{
                        padding: '10px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.7px', color: 'var(--navy)', position: 'sticky', left: 0,
                        background: '#f0f4ff', borderRight: '2px solid #e5e7eb', zIndex: 1,
                      }}>
                        CR Total
                      </td>
                      {months.map(m => {
                        const planned = crRows.filter(r => r.month === m).reduce((s, r) => s + (r.planned_amount ?? 0), 0)
                        const actual = crRows.filter(r => r.month === m && (r.status === 'issued' || r.status === 'paid')).reduce((s, r) => s + (r.actual_amount ?? 0), 0)
                        return (
                          <React.Fragment key={m}>
                            <td style={{ padding: '10px 6px', textAlign: 'right', borderLeft: '2px solid #e5e7eb', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: planned > 0 ? 'var(--navy)' : '#d1d5db', whiteSpace: 'nowrap' }}>
                              {planned > 0 ? fmtAmt(planned) : '—'}
                            </td>
                            <td style={{ padding: '10px 6px', textAlign: 'right', borderLeft: '1px solid #e5e7eb', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: actual > 0 ? '#1d4ed8' : '#d1d5db', whiteSpace: 'nowrap', background: actual > 0 ? '#f0fdf4' : undefined }}>
                              {actual > 0 ? fmtAmt(actual) : '—'}
                            </td>
                          </React.Fragment>
                        )
                      })}
                      <td style={{ padding: '10px 10px', textAlign: 'right', borderLeft: '2px solid #d1d5db', fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 14, color: 'var(--navy)', whiteSpace: 'nowrap' }}>
                        {fmtAmt(crRows.reduce((s, r) => {
                          if (r.status === 'issued' || r.status === 'paid') return s + (r.actual_amount ?? 0)
                          return s + (r.planned_amount ?? 0)
                        }, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Hosting Revenue */}
        {activeHostingClients.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="flex items-center justify-between mb-3">
              <h2>Hosting Revenue</h2>
            </div>

            <div className="card overflow-hidden">
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  tableLayout: 'fixed',
                  minWidth: 800,
                }}>
                  <colgroup>
                    <col style={{ width: 220 }} />
                    {months.map(m => <col key={m} />)}
                    <col style={{ width: 100 }} />
                  </colgroup>

                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.7px',
                        color: '#6b7280',
                        background: '#f9fafb',
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                        borderRight: '2px solid #e5e7eb',
                      }}>
                        Client
                      </th>
                      {months.map(m => (
                        <th key={m} style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.7px',
                          color: '#6b7280',
                          background: '#f9fafb',
                          borderLeft: '1px solid #e5e7eb',
                          whiteSpace: 'nowrap',
                        }}>
                          {fmtMonthShort(m)}
                        </th>
                      ))}
                      <th style={{
                        padding: '10px 12px',
                        textAlign: 'right',
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.7px',
                        color: '#6b7280',
                        background: '#f9fafb',
                        borderLeft: '2px solid #e5e7eb',
                        whiteSpace: 'nowrap',
                      }}>
                        Total
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {activeHostingClients.map((h, rowIdx) => {
                      const total = hostingRowTotal(h.id)
                      const rowBg = rowIdx % 2 === 0 ? '#fff' : '#fafafa'

                      return (
                        <tr key={h.id} style={{ background: rowBg, borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{
                            padding: '10px 16px',
                            position: 'sticky',
                            left: 0,
                            zIndex: 1,
                            background: rowBg,
                            borderRight: '2px solid #e5e7eb',
                            verticalAlign: 'middle',
                          }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', lineHeight: 1.3, marginBottom: 2 }}>
                              {h.client?.name ?? '—'}
                            </div>
                            {h.description && (
                              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 3 }}>
                                {h.description}
                              </div>
                            )}
                            <span style={{
                              display: 'inline-block',
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: '0.4px',
                              textTransform: 'uppercase',
                              padding: '1px 5px',
                              borderRadius: 3,
                              background: h.cycle === 'monthly' ? '#f0fdf4' : '#fef3c7',
                              color: h.cycle === 'monthly' ? '#15803d' : '#92400e',
                              border: h.cycle === 'monthly' ? '1px solid #86efac' : '1px solid #fde68a',
                            }}>
                              {h.cycle === 'monthly' ? 'Monthly' : 'Yearly'}
                            </span>
                          </td>

                          {months.map(month => {
                            const amount = hostingCellAmount(h.id, month)
                            const isEmpty = amount === null || amount === 0
                            const cellStatus = isEmpty ? null : hostingCellStatus(h.id, month)
                            const isSettled = cellStatus === 'issued' || cellStatus === 'paid'

                            return (
                              <td key={month} style={{
                                padding: '6px 6px',
                                borderLeft: '1px solid #e5e7eb',
                                background: rowBg,
                                verticalAlign: 'middle',
                              }}>
                                {isEmpty ? (
                                  <span style={{ color: '#d1d5db', fontSize: 12, display: 'block', textAlign: 'right', padding: '4px 6px' }}>—</span>
                                ) : (
                                  <span style={{ fontWeight: 600, fontSize: 12, color: isSettled ? 'var(--green)' : '#0369a1', fontVariantNumeric: 'tabular-nums', display: 'block', textAlign: 'right', padding: '4px 6px' }}>
                                    {fmtAmt(amount!)}
                                  </span>
                                )}
                              </td>
                            )
                          })}

                          <td style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            borderLeft: '2px solid #e5e7eb',
                            fontVariantNumeric: 'tabular-nums',
                            fontWeight: 700,
                            fontSize: 13,
                            color: total > 0 ? 'var(--navy)' : '#d1d5db',
                            whiteSpace: 'nowrap',
                            background: rowBg,
                          }}>
                            {total > 0 ? fmtAmt(total) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    <tr style={{ borderTop: '2px solid #d1d5db', background: '#f0f4ff' }}>
                      <td style={{
                        padding: '12px 16px',
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.7px',
                        color: 'var(--navy)',
                        position: 'sticky',
                        left: 0,
                        background: '#f0f4ff',
                        borderRight: '2px solid #e5e7eb',
                        zIndex: 1,
                      }}>
                        Hosting Total
                      </td>
                      {months.map(m => {
                        const total = hostingMonthTotal(m)
                        return (
                          <td key={m} style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                            borderLeft: '1px solid #e5e7eb',
                            fontSize: 12,
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            color: total > 0 ? 'var(--navy)' : '#d1d5db',
                            whiteSpace: 'nowrap',
                          }}>
                            {total > 0 ? fmtAmt(total) : '—'}
                          </td>
                        )
                      })}
                      <td style={{
                        padding: '12px 12px',
                        textAlign: 'right',
                        borderLeft: '2px solid #e5e7eb',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 800,
                        fontSize: 14,
                        color: hostingGrandTotal > 0 ? 'var(--navy)' : '#d1d5db',
                        whiteSpace: 'nowrap',
                      }}>
                        {hostingGrandTotal > 0 ? fmtAmt(hostingGrandTotal) : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Domains Revenue */}
        {domainsInHalf.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="flex items-center justify-between mb-3">
              <h2>Domain Renewals</h2>
            </div>

            <div className="card overflow-hidden">
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  tableLayout: 'fixed',
                  minWidth: 800,
                }}>
                  <colgroup>
                    <col style={{ width: 220 }} />
                    {months.map(m => <col key={m} />)}
                    <col style={{ width: 100 }} />
                  </colgroup>

                  <thead>
                    <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.7px',
                        color: '#6b7280',
                        background: '#f9fafb',
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                        borderRight: '2px solid #e5e7eb',
                      }}>
                        Domain
                      </th>
                      {months.map(m => (
                        <th key={m} style={{
                          padding: '10px 8px',
                          textAlign: 'center',
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.7px',
                          color: '#6b7280',
                          background: '#f9fafb',
                          borderLeft: '1px solid #e5e7eb',
                          whiteSpace: 'nowrap',
                        }}>
                          {fmtMonthShort(m)}
                        </th>
                      ))}
                      <th style={{
                        padding: '10px 12px',
                        textAlign: 'right',
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.7px',
                        color: '#6b7280',
                        background: '#f9fafb',
                        borderLeft: '2px solid #e5e7eb',
                        whiteSpace: 'nowrap',
                      }}>
                        Total
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {domainsInHalf.map((d, rowIdx) => {
                      const expiryMonthKey = domainInvoiceMonth(d)
                      const rowBg = rowIdx % 2 === 0 ? '#fff' : '#fafafa'

                      return (
                        <tr key={d.id} style={{ background: rowBg, borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{
                            padding: '10px 16px',
                            position: 'sticky',
                            left: 0,
                            zIndex: 1,
                            background: rowBg,
                            borderRight: '2px solid #e5e7eb',
                            verticalAlign: 'middle',
                          }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', lineHeight: 1.3, marginBottom: 2 }}>
                              {d.domain_name}
                            </div>
                            {d.client?.name && (
                              <div style={{ fontSize: 11, color: '#6b7280' }}>
                                {d.client.name}
                              </div>
                            )}
                          </td>

                          {months.map(month => {
                            const isExpiry = month === expiryMonthKey
                            const amount = isExpiry ? (d.yearly_amount ?? 0) : null

                            return (
                              <td key={month} style={{
                                padding: '6px 6px',
                                borderLeft: '1px solid #e5e7eb',
                                background: isExpiry && amount ? '#fef3c7' : rowBg,
                                verticalAlign: 'middle',
                              }}>
                                {isExpiry && amount ? (
                                  <span style={{ fontWeight: 600, fontSize: 12, color: '#92400e', fontVariantNumeric: 'tabular-nums', display: 'block', textAlign: 'right', padding: '4px 6px' }}>
                                    {fmtAmt(amount)}
                                  </span>
                                ) : (
                                  <span style={{ color: '#d1d5db', fontSize: 12, display: 'block', textAlign: 'right', padding: '4px 6px' }}>—</span>
                                )}
                              </td>
                            )
                          })}

                          <td style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            borderLeft: '2px solid #e5e7eb',
                            fontVariantNumeric: 'tabular-nums',
                            fontWeight: 700,
                            fontSize: 13,
                            color: d.yearly_amount ? 'var(--navy)' : '#d1d5db',
                            whiteSpace: 'nowrap',
                            background: rowBg,
                          }}>
                            {d.yearly_amount ? fmtAmt(d.yearly_amount) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>

                  <tfoot>
                    <tr style={{ borderTop: '2px solid #d1d5db', background: '#f0f4ff' }}>
                      <td style={{
                        padding: '12px 16px',
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.7px',
                        color: 'var(--navy)',
                        position: 'sticky',
                        left: 0,
                        background: '#f0f4ff',
                        borderRight: '2px solid #e5e7eb',
                        zIndex: 1,
                      }}>
                        Domains Total
                      </td>
                      {months.map(m => {
                        const total = domainMonthTotal(m)
                        return (
                          <td key={m} style={{
                            padding: '10px 8px',
                            textAlign: 'right',
                            borderLeft: '1px solid #e5e7eb',
                            fontSize: 12,
                            fontWeight: 700,
                            fontVariantNumeric: 'tabular-nums',
                            color: total > 0 ? 'var(--navy)' : '#d1d5db',
                            whiteSpace: 'nowrap',
                          }}>
                            {total > 0 ? fmtAmt(total) : '—'}
                          </td>
                        )
                      })}
                      <td style={{
                        padding: '12px 12px',
                        textAlign: 'right',
                        borderLeft: '2px solid #e5e7eb',
                        fontVariantNumeric: 'tabular-nums',
                        fontWeight: 800,
                        fontSize: 14,
                        color: domainsGrandTotal > 0 ? 'var(--navy)' : '#d1d5db',
                        whiteSpace: 'nowrap',
                      }}>
                        {domainsGrandTotal > 0 ? fmtAmt(domainsGrandTotal) : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
