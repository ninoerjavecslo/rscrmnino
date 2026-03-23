import { useEffect, useState, useMemo } from 'react'
import { useInfraStore } from '../stores/infrastructure'
import { useDomainsStore } from '../stores/domains'
import type { HostingClient, Domain } from '../lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

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
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Outbox</h1>
          <p>Monthly accounting email for hosting &amp; domain invoices</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-2 gap-6 items-start">

          {/* ── Left panel: checklist ── */}
          <div>
            {/* Month + payment controls */}
            <Card className="mb-4">
              <CardContent className="p-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="mb-0">
                    <Label>Month</Label>
                    <input type="month" value={serviceMonth} onChange={e => setServiceMonth(e.target.value)} />
                  </div>
                  <div className="mb-0">
                    <Label>Payment terms (days)</Label>
                    <input type="number" value={paymentDays} onChange={e => setPaymentDays(e.target.value)} min="0" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Hosting items */}
            <div className="flex items-center justify-between mb-2">
              <h2>Hosting</h2>
              <span className="text-xs text-muted-foreground">{selectedHosting.length} of {hostingItems.length} selected</span>
            </div>

            {hostingItems.length === 0 ? (
              <Card className="mb-4">
                <CardContent className="p-5 text-center text-muted-foreground text-[13px]">
                  No hosting clients flagged for accounting.
                  <br /><span className="text-xs">Add "Send to accounting" to a hosting client in the Hosting page.</span>
                </CardContent>
              </Card>
            ) : (
              <Card className="mb-4">
                {hostingItems.map((h, i) => (
                  <label key={h.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${i < hostingItems.length - 1 ? 'border-b border-border' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checkedHosting.has(h.id)}
                      onChange={() => toggleHosting(h.id)}
                      className="w-4 h-4 flex-shrink-0 accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                        {h.client?.name ?? h.client_id}
                        <Badge variant="gray" className="text-[10px]">{h.project_pn}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{h.description ?? 'Hosting'}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-sm text-[#16a34a]">€{h.amount}</div>
                      <div className="text-xs text-muted-foreground">/{h.cycle === 'monthly' ? 'mo' : 'yr'}</div>
                    </div>
                  </label>
                ))}
              </Card>
            )}

            {/* Domain items */}
            <div className="flex items-center justify-between mb-2">
              <h2>Domains</h2>
              <span className="text-xs text-muted-foreground">{selectedDomains.length} of {domainItems.length} selected</span>
            </div>

            {domainItems.length === 0 ? (
              <Card>
                <CardContent className="p-5 text-center text-muted-foreground text-[13px]">
                  No domains flagged for accounting.
                  <br /><span className="text-xs">Edit a domain and check "Send to accounting".</span>
                </CardContent>
              </Card>
            ) : (
              <Card>
                {domainItems.map((d, i) => (
                  <label key={d.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${i < domainItems.length - 1 ? 'border-b border-border' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checkedDomains.has(d.id)}
                      onChange={() => toggleDomain(d.id)}
                      className="w-4 h-4 flex-shrink-0 accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-foreground">{d.domain_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {d.client?.name ?? '—'} · expires {fmtDate(d.expiry_date)}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-sm text-[#d97706]">
                        {d.yearly_amount ? `€${d.yearly_amount}` : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">/yr</div>
                    </div>
                  </label>
                ))}
              </Card>
            )}
          </div>

          {/* ── Right panel: email preview ── */}
          <Card>
            <div className="px-5 py-4 border-b border-border">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.07em]">
                Generated email
              </div>
            </div>
            <CardContent className="p-5">
              <div className="mb-4">
                <Label>To (recipient)</Label>
                <input
                  type="email"
                  placeholder="racunovodstvo@example.com"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                />
              </div>

              <pre className="text-[12.5px] leading-[1.75] text-[#374151] bg-[#f9fafb] border border-border rounded p-4 whitespace-pre-wrap break-words mb-4 min-h-[300px]">
                {emailText}
              </pre>

              <div className="grid grid-cols-2 gap-[10px]">
                <Button
                  variant="outline"
                  onClick={handleCopy}
                  disabled={!hasItems}
                  className="flex items-center justify-center gap-[6px]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
                <Button
                  onClick={handleOpenMail}
                  disabled={!hasItems}
                  className="flex items-center justify-center gap-[6px]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                  Open in Mail
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}
