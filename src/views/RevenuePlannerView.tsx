import React, { useEffect, useState } from 'react'
import { useProjectsStore } from '../stores/projects'
import { useRevenuePlannerStore } from '../stores/revenuePlanner'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import type { Project, RevenuePlanner } from '../lib/types'

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
  const styles: Record<Project['type'], React.CSSProperties> = {
    fixed: { background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd' },
    maintenance: { background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe' },
    variable: { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' },
  }
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.4px',
      textTransform: 'uppercase',
      padding: '1px 5px',
      borderRadius: 3,
      ...styles[type],
    }}>
      {type}
    </span>
  )
}

// ── Probability helpers ───────────────────────────────────────────────────────

const PROB_OPTIONS = [100, 75, 50, 25] as const

function probLabel(p: number): string {
  if (p === 100) return 'Confirmed'
  if (p === 75)  return 'Likely'
  if (p === 50)  return 'Maybe'
  return 'Unlikely'
}

function probColors(p: number): { bg: string; text: string; border: string } {
  if (p === 100) return { bg: '#f0fdf4', text: '#15803d', border: '#86efac' }
  if (p === 75)  return { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' }
  if (p === 50)  return { bg: '#fffbeb', text: '#92400e', border: '#fde68a' }
  return           { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' }
}


// ── Cell background helpers ───────────────────────────────────────────────────

function getCellBg(row: RevenuePlanner | undefined): string {
  if (!row) return 'transparent'
  if (row.status === 'issued' || row.status === 'paid') return '#eff6ff'
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

  const activeProjects = pStore.projects.filter(p => p.status === 'active')

  // Build lookup: `${projectId}:${month}` → RevenuePlanner row
  const rowMap = new Map<string, RevenuePlanner>()
  for (const r of rpStore.rows) {
    rowMap.set(`${r.project_id}:${r.month}`, r)
  }

  // Maintenance retainer rows for this half
  const retainerRows = rpStore.rows.filter(r => r.maintenance_id != null)
  // Group by maintenance_id
  const retainerByMaint = new Map<string, { name: string; clientName: string; rows: RevenuePlanner[] }>()
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

  // Effective display amount for a cell
  function cellAmount(project: Project, month: string): number | null {
    const key = `${project.id}:${month}`
    const row = rowMap.get(key)
    if (row) {
      return row.planned_amount ?? row.actual_amount ?? null
    }
    // Auto-fill maintenance from contract value
    if (project.type === 'maintenance' && project.contract_value) {
      return project.contract_value
    }
    return null
  }

  // ── Probability popover state ──────────────────────────────────────────────
  const [probPopover, setProbPopover] = useState<string | null>(null) // `${projectId}:${month}`

  // ── Stats ──────────────────────────────────────────────────────────────────

  function halfTotal(): number {
    return months.reduce((sum, m) => {
      return sum + activeProjects.reduce((s, p) => s + (cellAmount(p, m) ?? 0), 0)
    }, 0)
  }

  function halfForecast(): number {
    return months.reduce((sum, m) => {
      return sum + activeProjects.reduce((s, p) => {
        const amount = cellAmount(p, m) ?? 0
        const row = rowMap.get(`${p.id}:${m}`)
        const prob = row?.probability ?? 100
        return s + (amount * prob / 100)
      }, 0)
    }, 0)
  }

  function typeTotal(type: Project['type']): number {
    const ps = activeProjects.filter(p => p.type === type)
    return months.reduce((sum, m) => {
      return sum + ps.reduce((s, p) => s + (cellAmount(p, m) ?? 0), 0)
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

  const totalPlanned = halfTotal()
  const totalForecast = halfForecast()
  const fixedSum = typeTotal('fixed')
  const maintenanceSum = typeTotal('maintenance')
  const actualSum = actualIssuedTotal()
  const totalForPct = totalPlanned || 1

  // ── Monthly column totals ──────────────────────────────────────────────────
  function monthPlannedTotal(month: string): number {
    return activeProjects.reduce((sum, p) => sum + (cellAmount(p, month) ?? 0), 0)
  }

  function monthForecastTotal(month: string): number {
    return activeProjects.reduce((sum, p) => {
      const amount = cellAmount(p, month) ?? 0
      const row = rowMap.get(`${p.id}:${month}`)
      const prob = row?.probability ?? 100
      return sum + (amount * prob / 100)
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
  const activeHostingClients = infraStore.hostingClients.filter(h => h.status === 'active')

  function hostingCellAmount(hostingId: string, month: string): number | null {
    const h = activeHostingClients.find(hc => hc.id === hostingId)
    if (!h) return null
    if (h.cycle === 'monthly') return h.amount
    // Yearly: show amount only in the month matching next_invoice_date
    if (h.cycle === 'yearly' && h.next_invoice_date) {
      const invoiceMonth = h.next_invoice_date.slice(0, 7) + '-01'
      if (invoiceMonth === month) return h.amount
    }
    return null
  }

  function hostingRowTotal(hostingId: string): number {
    return months.reduce((sum, m) => sum + (hostingCellAmount(hostingId, m) ?? 0), 0)
  }

  function hostingMonthTotal(month: string): number {
    return activeHostingClients.reduce((sum, h) => sum + (hostingCellAmount(h.id, month) ?? 0), 0)
  }

  const hostingGrandTotal = months.reduce((sum, m) => sum + hostingMonthTotal(m), 0)

  // ── Domain helpers ──────────────────────────────────────────────────────────
  const domainsInHalf = domainsStore.domains.filter(d => {
    const expiryMonth = d.expiry_date.slice(0, 7) + '-01'
    return months.includes(expiryMonth)
  })

  function domainMonthTotal(month: string): number {
    return domainsInHalf
      .filter(d => d.expiry_date.slice(0, 7) + '-01' === month)
      .reduce((sum, d) => sum + (d.yearly_amount ?? 0), 0)
  }

  const domainsGrandTotal = months.reduce((sum, m) => sum + domainMonthTotal(m), 0)

  const isLoading = pStore.loading && activeProjects.length === 0

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1>Invoice Planning</h1>
          <p>Plan and track invoices across projects</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Period nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigate(-1)}
              style={{ padding: '5px 9px', minWidth: 0 }}
            >
              ‹
            </button>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 0,
              border: '1.5px solid var(--c5)',
              borderRadius: 7,
              overflow: 'hidden',
            }}>
              {(['H1', 'H2'] as Half[]).map(h => (
                <button
                  key={h}
                  onClick={() => setHalf(h)}
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
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
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigate(1)}
              style={{ padding: '5px 9px', minWidth: 0 }}
            >
              ›
            </button>
          </div>
          <button className="btn btn-secondary btn-sm">
            Export
          </button>
        </div>
      </div>

      {/* Error banners */}
      {(pStore.error || rpStore.error) && (
        <div className="alert alert-red" style={{ margin: '0 28px 16px' }}>
          <span>Failed to load data. Please check your connection.</span>
        </div>
      )}

      {/* Stats strip */}
      <div className="stats-strip" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
        <div className="stat-card" style={{ '--left-color': 'var(--navy)' } as React.CSSProperties}>
          <div className="stat-card-label">Planned {half} {year}</div>
          <div className="stat-card-value">{fmtAmt(totalPlanned)}</div>
          <div className="stat-card-sub">all invoices</div>
        </div>
        <div className="stat-card" style={{ '--left-color': '#16a34a' } as React.CSSProperties}>
          <div className="stat-card-label">Forecast {half} {year}</div>
          <div className="stat-card-value">{fmtAmt(totalForecast)}</div>
          <div className="stat-card-sub">probability-weighted</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--green)' } as React.CSSProperties}>
          <div className="stat-card-label">Fixed</div>
          <div className="stat-card-value">{fmtAmt(fixedSum)}</div>
          <div className="stat-card-sub">{Math.round((fixedSum / totalForPct) * 100)}% of total</div>
        </div>
        <div className="stat-card" style={{ '--left-color': 'var(--blue, #3b82f6)' } as React.CSSProperties}>
          <div className="stat-card-label">Maintenance</div>
          <div className="stat-card-value">{fmtAmt(maintenanceSum)}</div>
          <div className="stat-card-sub">{Math.round((maintenanceSum / totalForPct) * 100)}% of total</div>
        </div>
        <div className="stat-card" style={{ '--left-color': '#4338ca' } as React.CSSProperties}>
          <div className="stat-card-label">Actual Issued</div>
          <div className="stat-card-value">{fmtAmt(actualSum)}</div>
          <div className="stat-card-sub">issued + paid</div>
        </div>
      </div>

      {/* Main grid */}
      <div className="page-content">
        {isLoading ? (
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center', padding: '52px 20px', color: 'var(--c4)' }}>
              <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              <div style={{ fontWeight: 600, marginTop: 12 }}>Loading projects…</div>
            </div>
          </div>
        ) : activeProjects.length === 0 ? (
          <div className="card">
            <div className="card-body" style={{ textAlign: 'center', padding: '52px 20px' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c2)', marginBottom: 5 }}>No active projects</div>
              <div className="text-sm">Mark projects as active to see them in Invoice Planning.</div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 1100 }}>
                <colgroup>
                  <col style={{ width: 200 }} />
                  {months.map(m => (
                    <React.Fragment key={m}>
                      <col style={{ width: 80 }} />
                      <col style={{ width: 80 }} />
                    </React.Fragment>
                  ))}
                  <col style={{ width: 90 }} />
                  <col style={{ width: 90 }} />
                </colgroup>

                <thead>
                  {/* Month labels row */}
                  <tr style={{ background: '#f9fafb' }}>
                    <th rowSpan={2} style={{
                      padding: '10px 16px', textAlign: 'left', fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.7px', color: '#6b7280',
                      background: '#f9fafb', position: 'sticky', left: 0, zIndex: 2,
                      borderRight: '2px solid #e5e7eb', borderBottom: '2px solid #e5e7eb',
                    }}>
                      Project / Client
                    </th>
                    {months.map(m => (
                      <th key={m} colSpan={2} style={{
                        padding: '8px 8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.7px', color: '#6b7280',
                        background: '#f9fafb', borderLeft: '2px solid #e5e7eb', whiteSpace: 'nowrap',
                      }}>
                        {fmtMonthShort(m)}
                      </th>
                    ))}
                    <th colSpan={2} rowSpan={1} style={{
                      padding: '8px 8px 4px', textAlign: 'center', fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.7px', color: '#6b7280',
                      background: '#f9fafb', borderLeft: '3px solid #d1d5db', whiteSpace: 'nowrap',
                    }}>
                      Total
                    </th>
                  </tr>
                  {/* Plan / Forecast sub-header row */}
                  <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb' }}>
                    {months.map(m => (
                      <React.Fragment key={m}>
                        <th style={{
                          padding: '4px 6px 8px', textAlign: 'right', fontSize: 9, fontWeight: 600,
                          color: '#9ca3af', background: '#f9fafb', borderLeft: '2px solid #e5e7eb',
                          letterSpacing: '0.4px', textTransform: 'uppercase',
                        }}>Plan</th>
                        <th style={{
                          padding: '4px 6px 8px', textAlign: 'right', fontSize: 9, fontWeight: 600,
                          color: '#16a34a', background: '#f9fafb', borderLeft: '1px solid #e5e7eb',
                          letterSpacing: '0.4px', textTransform: 'uppercase',
                        }}>Fcst</th>
                      </React.Fragment>
                    ))}
                    <th style={{
                      padding: '4px 6px 8px', textAlign: 'right', fontSize: 9, fontWeight: 600,
                      color: '#9ca3af', background: '#f9fafb', borderLeft: '3px solid #d1d5db',
                      letterSpacing: '0.4px', textTransform: 'uppercase',
                    }}>Plan</th>
                    <th style={{
                      padding: '4px 6px 8px', textAlign: 'right', fontSize: 9, fontWeight: 600,
                      color: '#16a34a', background: '#f9fafb', borderLeft: '1px solid #e5e7eb',
                      letterSpacing: '0.4px', textTransform: 'uppercase',
                    }}>Fcst</th>
                  </tr>
                </thead>

                <tbody>
                  {activeProjects.map((project, rowIdx) => {
                    const rowBg = rowIdx % 2 === 0 ? '#fff' : '#fafafa'
                    const rowPlanned = months.reduce((s, m) => s + (cellAmount(project, m) ?? 0), 0)
                    const rowForecast = months.reduce((s, m) => {
                      const amt = cellAmount(project, m) ?? 0
                      const row = rowMap.get(`${project.id}:${m}`)
                      return s + (amt * (row?.probability ?? 100) / 100)
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

                          {/* Plan + Forecast cells per month */}
                          {months.map(month => {
                            const popKey = `${project.id}:${month}`
                            const row = rowMap.get(popKey)
                            const amount = cellAmount(project, month)
                            const isEmpty = amount === null || amount === 0
                            const prob = row?.probability ?? 100
                            const forecast = isEmpty ? 0 : Math.round(amount! * prob / 100)
                            const cellBg = isEmpty ? rowBg : getCellBg(row)
                            const { text: probText } = probColors(prob)
                            const isIssued = row?.status === 'issued' || row?.status === 'paid'
                            const isOpen = probPopover === popKey

                            return (
                              <React.Fragment key={month}>
                                {/* Plan cell */}
                                <td style={{
                                  padding: '6px 4px', borderLeft: '2px solid #e5e7eb',
                                  background: isEmpty ? rowBg : cellBg, verticalAlign: 'middle',
                                }}>
                                  {isEmpty ? (
                                    <span style={{ color: '#d1d5db', fontSize: 11, display: 'block', textAlign: 'right', padding: '2px 4px' }}>—</span>
                                  ) : (
                                    <div>
                                      <span style={{ fontWeight: 600, fontSize: 11, color: isIssued ? '#1d4ed8' : probText, fontVariantNumeric: 'tabular-nums', display: 'block', textAlign: 'right', padding: '2px 4px' }}>
                                        {fmtAmt(amount!)}
                                      </span>
                                      {/* Probability selector — only for planned rows */}
                                      {!isIssued && row && (
                                        <div style={{ position: 'relative', textAlign: 'right', paddingRight: 4 }}>
                                          <span
                                            onClick={() => setProbPopover(isOpen ? null : popKey)}
                                            style={{
                                              display: 'inline-block', fontSize: 9, fontWeight: 700,
                                              padding: '1px 4px', borderRadius: 3, cursor: 'pointer',
                                              background: probColors(prob).bg, color: probColors(prob).text,
                                              border: `1px solid ${probColors(prob).border}`,
                                              userSelect: 'none',
                                            }}
                                          >
                                            {prob}%
                                          </span>
                                          {isOpen && (
                                            <div style={{
                                              position: 'absolute', right: 0, top: '100%', zIndex: 10,
                                              background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8,
                                              boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '6px',
                                              display: 'flex', flexDirection: 'column', gap: 3, minWidth: 120,
                                            }}>
                                              {PROB_OPTIONS.map(p => (
                                                <button
                                                  key={p}
                                                  onClick={() => {
                                                    rpStore.updateProbability(row.id, p)
                                                    setProbPopover(null)
                                                  }}
                                                  style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '5px 8px', borderRadius: 5, border: 'none',
                                                    background: p === prob ? probColors(p).bg : 'transparent',
                                                    cursor: 'pointer', fontFamily: 'inherit', gap: 8,
                                                    fontWeight: p === prob ? 700 : 500,
                                                  }}
                                                >
                                                  <span style={{ fontSize: 11, color: probColors(p).text, fontWeight: 700 }}>{p}%</span>
                                                  <span style={{ fontSize: 11, color: '#6b7280' }}>{probLabel(p)}</span>
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                                {/* Forecast cell */}
                                <td style={{
                                  padding: '6px 4px', borderLeft: '1px solid #e5e7eb',
                                  background: isEmpty ? rowBg : (isIssued ? '#eff6ff' : probColors(prob).bg),
                                  verticalAlign: 'middle',
                                }}>
                                  {isEmpty ? (
                                    <span style={{ color: '#d1d5db', fontSize: 11, display: 'block', textAlign: 'right', padding: '2px 4px' }}>—</span>
                                  ) : (
                                    <span style={{ fontWeight: 600, fontSize: 11, color: isIssued ? '#1d4ed8' : probColors(prob).text, fontVariantNumeric: 'tabular-nums', display: 'block', textAlign: 'right', padding: '2px 4px' }}>
                                      {fmtAmt(forecast)}
                                    </span>
                                  )}
                                </td>
                              </React.Fragment>
                            )
                          })}

                          {/* Row totals */}
                          <td style={{
                            padding: '8px 8px', textAlign: 'right', borderLeft: '3px solid #d1d5db',
                            fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 12,
                            color: rowPlanned > 0 ? 'var(--navy)' : '#d1d5db', whiteSpace: 'nowrap', background: rowBg,
                          }}>
                            {rowPlanned > 0 ? fmtAmt(rowPlanned) : '—'}
                          </td>
                          <td style={{
                            padding: '8px 8px', textAlign: 'right', borderLeft: '1px solid #e5e7eb',
                            fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: 12,
                            color: rowForecast > 0 ? '#16a34a' : '#d1d5db', whiteSpace: 'nowrap', background: rowBg,
                          }}>
                            {rowForecast > 0 ? fmtAmt(rowForecast) : '—'}
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
                              <React.Fragment key={month}>
                                <td style={{ padding: '4px 4px', borderLeft: '2px solid #e5e7eb', background: hasCost ? '#fef2f2' : '#fafafa', textAlign: 'right' }}>
                                  {hasCost ? (
                                    <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>
                                      {fmtAmt(costRow!.actual_amount!)}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 10, color: '#d1d5db' }}>—</span>
                                  )}
                                </td>
                                <td style={{ borderLeft: '1px solid #e5e7eb', background: '#fafafa' }} />
                              </React.Fragment>
                            )
                          })}
                          <td colSpan={2} style={{ borderLeft: '3px solid #d1d5db', background: '#fafafa' }} />
                        </tr>
                      </React.Fragment>
                    )
                  })}
                </tbody>

                {/* Footer totals */}
                <tfoot>
                  <tr style={{ borderTop: '2px solid #d1d5db', background: '#f0f4ff' }}>
                    <td style={{
                      padding: '12px 16px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.7px', color: 'var(--navy)', position: 'sticky', left: 0,
                      background: '#f0f4ff', borderRight: '2px solid #e5e7eb', zIndex: 1,
                    }}>
                      Monthly Total
                    </td>
                    {months.map(m => {
                      const planned = monthPlannedTotal(m)
                      const forecast = monthForecastTotal(m)
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
                            color: forecast > 0 ? '#16a34a' : '#d1d5db', whiteSpace: 'nowrap',
                          }}>
                            {forecast > 0 ? fmtAmt(forecast) : '—'}
                          </td>
                        </React.Fragment>
                      )
                    })}
                    <td style={{
                      padding: '10px 8px', textAlign: 'right', borderLeft: '3px solid #d1d5db',
                      fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 13,
                      color: totalPlanned > 0 ? 'var(--navy)' : '#d1d5db', whiteSpace: 'nowrap',
                    }}>
                      {totalPlanned > 0 ? fmtAmt(totalPlanned) : '—'}
                    </td>
                    <td style={{
                      padding: '10px 8px', textAlign: 'right', borderLeft: '1px solid #e5e7eb',
                      fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 13,
                      color: totalForecast > 0 ? '#16a34a' : '#d1d5db', whiteSpace: 'nowrap',
                    }}>
                      {totalForecast > 0 ? fmtAmt(totalForecast) : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '10px 16px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', flexWrap: 'wrap' }}>
              {[
                { color: '#f0fdf4', border: '#86efac', label: '100% Confirmed' },
                { color: '#eff6ff', border: '#bfdbfe', label: '75% Likely' },
                { color: '#fffbeb', border: '#fde68a', label: '50% Maybe' },
                { color: '#fef2f2', border: '#fecaca', label: '25% Unlikely' },
                { color: '#eff6ff', border: '#93c5fd', label: 'Issued/Paid' },
                { color: '#fef2f2', border: '#fca5a5', label: 'Costs' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color, border: `1px solid ${item.border}`, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hosting Revenue */}
        {activeHostingClients.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="section-bar">
              <h2>Hosting Revenue</h2>
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
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
                                  <span style={{ fontWeight: 600, fontSize: 12, color: '#0369a1', fontVariantNumeric: 'tabular-nums', display: 'block', textAlign: 'right', padding: '4px 6px' }}>
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
            <div className="section-bar">
              <h2>Domain Renewals</h2>
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
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
                      const expiryMonthKey = d.expiry_date.slice(0, 7) + '-01'
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
      {/* ── Maintenance retainers ── */}
      {retainerByMaint.size > 0 && (
        <div style={{ marginTop: 32 }}>
          <div className="section-bar"><h2>Maintenance Retainers</h2></div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Contract</th>
                  <th style={{ fontSize: 11, color: 'var(--c4)' }}>Client</th>
                  {months.map(m => (
                    <th key={m} className="th-right" style={{ minWidth: 90 }}>
                      {new Date(m + 'T00:00:00').toLocaleString('default', { month: 'short', year: '2-digit' })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...retainerByMaint.values()].map(({ name, clientName, rows }) => {
                  const rowByMonth = new Map(rows.map(r => [r.month, r]))
                  return (
                    <tr key={name}>
                      <td style={{ fontWeight: 700, fontSize: 14 }}>{name}</td>
                      <td style={{ fontSize: 12, color: 'var(--c3)' }}>{clientName}</td>
                      {months.map(m => {
                        const r = rowByMonth.get(m)
                        return (
                          <td key={m} className="td-right text-mono" style={{ fontSize: 13 }}>
                            {r ? <span style={{ color: 'var(--amber)', fontWeight: 600 }}>{r.planned_amount} €</span> : <span style={{ color: 'var(--c5)' }}>—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} style={{ fontSize: 11, fontWeight: 700, color: 'var(--c3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total retainers</td>
                  {months.map(m => {
                    const total = [...retainerByMaint.values()].reduce((s, { rows }) => {
                      const r = rows.find(r => r.month === m)
                      return s + (r?.planned_amount ?? 0)
                    }, 0)
                    return (
                      <td key={m} className="td-right text-mono" style={{ fontWeight: 800, fontSize: 14, color: 'var(--navy)' }}>
                        {total > 0 ? `${total} €` : '—'}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      </div>
    </div>
  )
}
