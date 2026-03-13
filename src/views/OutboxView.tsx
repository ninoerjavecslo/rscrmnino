import { useEffect, useState, useMemo } from 'react'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import type { HostingClient, Domain } from '../lib/types'

// ── Helpers (shared with EmailToolView) ──────────────────────────────────────

function currentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmtMonthSlo(ym: string): string {
  const months = ['januar', 'februar', 'marec', 'april', 'maj', 'junij',
    'julij', 'avgust', 'september', 'oktober', 'november', 'december']
  const [, m] = ym.split('-')
  return months[parseInt(m) - 1] + ' ' + ym.split('-')[0]
}

function fmtAmt(n: number): string {
  return n.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function OutboxView() {
  const infraStore  = useInfraStore()
  const domainsStore = useDomainsStore()

  const [serviceMonth, setServiceMonth] = useState(currentMonthStr())
  const [paymentDays, setPaymentDays]   = useState('30')
  const [recipient, setRecipient]       = useState('')
  const [copied, setCopied]             = useState(false)

  useEffect(() => { infraStore.fetchAll(); domainsStore.fetchAll() }, [])

  // Items eligible for accounting outbox
  const hostingItems: HostingClient[] = infraStore.hostingClients.filter(
    h => h.accounting_email && !h.maintenance_id && h.status === 'active'
  )
  const domainItems: Domain[] = domainsStore.domains.filter(
    d => d.accounting_email && !d.archived
  )

  // Check state — all pre-selected
  const [checkedHosting, setCheckedHosting] = useState<Set<string>>(new Set())
  const [checkedDomains, setCheckedDomains] = useState<Set<string>>(new Set())

  // Re-initialize checked sets when items load
  useEffect(() => {
    setCheckedHosting(new Set(hostingItems.map(h => h.id)))
  }, [infraStore.hostingClients.length])

  useEffect(() => {
    setCheckedDomains(new Set(domainItems.map(d => d.id)))
  }, [domainsStore.domains.length])

  function toggleHosting(id: string) {
    setCheckedHosting(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleDomain(id: string) {
    setCheckedDomains(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectedHosting = hostingItems.filter(h => checkedHosting.has(h.id))
  const selectedDomains = domainItems.filter(d => checkedDomains.has(d.id))
  const hasItems = selectedHosting.length > 0 || selectedDomains.length > 0
  const monthLabel = fmtMonthSlo(serviceMonth)

  const emailText = useMemo(() => {
    if (!hasItems) return '— No items selected —'

    const hostingLines = selectedHosting.map(h =>
      `  • ${h.client?.name ?? h.client_id} [${h.project_pn}] — ${h.description ?? 'Hosting'} — ${fmtAmt(h.amount)}/${h.cycle === 'monthly' ? 'mesec' : 'leto'}`
    )
    const domainLines = selectedDomains.map(d =>
      `  • ${d.client?.name ?? '—'} — ${d.domain_name} (poteče ${fmtDate(d.expiry_date)}) — ${d.yearly_amount ? fmtAmt(d.yearly_amount) : '—'}`
    )

    const sections: string[] = []
    if (hostingLines.length > 0) {
      sections.push(`Hosting (${monthLabel}):\n${hostingLines.join('\n')}`)
    }
    if (domainLines.length > 0) {
      sections.push(`Domene (podaljšanje):\n${domainLines.join('\n')}`)
    }

    return `Pozdravljeni,

prosimo za izstavitev računov za ${monthLabel}:

${sections.join('\n\n')}

Rok plačila: ${paymentDays} dni od izstavitve.

Prosimo, da račune izstavite čim prej.

Lep pozdrav,
Nino Kovac
Renderspace d.o.o.
nino@renderspace.si`
  }, [selectedHosting, selectedDomains, serviceMonth, paymentDays, monthLabel, hasItems])

  function handleCopy() {
    navigator.clipboard.writeText(emailText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleOpenMail() {
    const subject = encodeURIComponent(`Zahteva za izstavitev računov — ${monthLabel}`)
    const body = encodeURIComponent(emailText)
    const to = encodeURIComponent(recipient)
    window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_self')
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Outbox</h1>
          <p>Monthly accounting email for hosting &amp; domain invoices</p>
        </div>
      </div>

      <div className="page-content">
        <div className="grid-2" style={{ gap: 24, alignItems: 'start' }}>

          {/* ── Left panel: checklist ── */}
          <div>
            {/* Month + payment controls */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Month</label>
                    <input type="month" value={serviceMonth} onChange={e => setServiceMonth(e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Payment terms (days)</label>
                    <input type="number" value={paymentDays} onChange={e => setPaymentDays(e.target.value)} min="0" />
                  </div>
                </div>
              </div>
            </div>

            {/* Hosting items */}
            <div className="section-bar" style={{ marginBottom: 8 }}>
              <h2>Hosting</h2>
              <span className="text-xs">{selectedHosting.length} of {hostingItems.length} selected</span>
            </div>

            {hostingItems.length === 0 ? (
              <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13, marginBottom: 16 }}>
                No hosting clients flagged for accounting.
                <br /><span className="text-xs">Add "Send to accounting" to a hosting client in the Hosting page.</span>
              </div>
            ) : (
              <div className="card" style={{ marginBottom: 16 }}>
                {hostingItems.map((h, i) => (
                  <label key={h.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    borderBottom: i < hostingItems.length - 1 ? '1px solid var(--c7)' : 'none',
                    cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={checkedHosting.has(h.id)}
                      onChange={() => toggleHosting(h.id)}
                      style={{ width: 16, height: 16, accentColor: 'var(--navy)', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--c0)' }}>
                        {h.client?.name ?? h.client_id}
                        <span className="badge badge-gray" style={{ marginLeft: 8, fontSize: 10 }}>{h.project_pn}</span>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--c3)', marginTop: 2 }}>{h.description ?? 'Hosting'}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--green)' }}>€{h.amount}</div>
                      <div className="text-xs" style={{ color: 'var(--c4)' }}>/{h.cycle === 'monthly' ? 'mo' : 'yr'}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Domain items */}
            <div className="section-bar" style={{ marginBottom: 8 }}>
              <h2>Domains</h2>
              <span className="text-xs">{selectedDomains.length} of {domainItems.length} selected</span>
            </div>

            {domainItems.length === 0 ? (
              <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--c4)', fontSize: 13 }}>
                No domains flagged for accounting.
                <br /><span className="text-xs">Edit a domain and check "Send to accounting".</span>
              </div>
            ) : (
              <div className="card">
                {domainItems.map((d, i) => (
                  <label key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                    borderBottom: i < domainItems.length - 1 ? '1px solid var(--c7)' : 'none',
                    cursor: 'pointer',
                  }}>
                    <input
                      type="checkbox"
                      checked={checkedDomains.has(d.id)}
                      onChange={() => toggleDomain(d.id)}
                      style={{ width: 16, height: 16, accentColor: 'var(--navy)', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--c0)' }}>{d.domain_name}</div>
                      <div className="text-xs" style={{ color: 'var(--c3)', marginTop: 2 }}>
                        {d.client?.name ?? '—'} · expires {fmtDate(d.expiry_date)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--amber)' }}>
                        {d.yearly_amount ? `€${d.yearly_amount}` : '—'}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--c4)' }}>/yr</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* ── Right panel: email preview ── */}
          <div className="card">
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--c6)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Generated email
              </div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">To (recipient)</label>
                <input
                  type="email"
                  placeholder="racunovodstvo@example.com"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                />
              </div>

              <pre style={{
                fontFamily: 'ui-monospace, "Cascadia Code", monospace',
                fontSize: 12.5,
                lineHeight: 1.75,
                color: 'var(--c1)',
                background: '#f9fafb',
                border: '1px solid var(--c6)',
                borderRadius: 6,
                padding: '16px 18px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                marginBottom: 16,
                minHeight: 300,
              }}>
                {emailText}
              </pre>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '10px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={handleCopy}
                  disabled={!hasItems}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  className="btn btn-primary"
                  style={{ padding: '10px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={handleOpenMail}
                  disabled={!hasItems}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                  Open in Mail
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
