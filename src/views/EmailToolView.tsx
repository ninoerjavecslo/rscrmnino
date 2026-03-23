import { useState, useMemo } from 'react'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

interface ServiceLine {
  ref: string
  description: string
  amount: string
}

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

function fmtAmt(val: string): string {
  const n = parseFloat(val)
  if (isNaN(n) || !val) return '0,00 EUR'
  return n.toLocaleString('sl-SI', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR'
}

export function EmailToolView() {
  const pStore = useProjectsStore()
  const cStore = useClientsStore()

  const [serviceMonth, setServiceMonth] = useState(currentMonthStr())
  const [paymentDays, setPaymentDays]   = useState('30')
  const [clientName, setClientName]     = useState('')
  const [projectRef, setProjectRef]     = useState('')
  const [lines, setLines]               = useState<ServiceLine[]>([
    { ref: '', description: '', amount: '' }
  ])

  function updateLine(i: number, field: keyof ServiceLine, val: string) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l))
  }
  function addLine() {
    setLines(prev => [...prev, { ref: '', description: '', amount: '' }])
  }
  function removeLine(i: number) {
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const monthLabel = fmtMonthSlo(serviceMonth)

  const emailText = useMemo(() => {
    const filledLines = lines.filter(l => l.description.trim() || l.ref.trim())
    const linesText = filledLines.map((l, i) => {
      const ref = l.ref.trim() ? `[${l.ref.trim()}] ` : ''
      return `  ${i + 1}. ${ref}${l.description.trim()} — ${fmtAmt(l.amount)}`
    }).join('\n')

    return `Pozdravljeni,

prosimo za izstavitev fakture za ${monthLabel}:
Naročnik: ${clientName || '—'}${projectRef ? `\nRef. projekta: ${projectRef}` : ''}

Storitve:
${linesText || '  —'}

SKUPAJ (brez DDV): ${fmtAmt(total.toString())}
Datum storitve: ${monthLabel}
Rok plačila: ${paymentDays} dni

Prosimo, da fakturo izstavite čim prej.

Lep pozdrav,
Nino Kovac
Renderspace d.o.o.
nino@renderspace.si`
  }, [serviceMonth, paymentDays, clientName, projectRef, lines, total, monthLabel])

  function handleCopy() {
    navigator.clipboard.writeText(emailText)
  }

  function handleOpenMail() {
    const subject = encodeURIComponent(`Zahtevek za izstavitev fakture — ${monthLabel}${projectRef ? ` / ${projectRef}` : ''}`)
    const body = encodeURIComponent(emailText)
    window.open(`mailto:?subject=${subject}&body=${body}`, '_self')
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Email Tool</h1>
          <p>Generate a Slovenian invoice request for your accountant</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-2 gap-6 items-start">

          {/* ── Left panel ── */}
          <Card>
            <div className="px-6 py-5 border-b border-border">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.07em]">
                Invoice request for accounting
              </div>
            </div>
            <CardContent className="p-6">

              {/* Row 1: month + payment terms */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <Label className="text-[10px] tracking-[0.06em]">DATE OF SERVICE (MONTH)</Label>
                  <input type="month" value={serviceMonth} onChange={e => setServiceMonth(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[10px] tracking-[0.06em]">PAYMENT TERMS (DAYS)</Label>
                  <input type="number" value={paymentDays} onChange={e => setPaymentDays(e.target.value)} min="0" />
                </div>
              </div>

              {/* Row 2: client + project ref */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                  <Label className="text-[10px] tracking-[0.06em]">CLIENT / COMPANY</Label>
                  <input
                    list="client-list"
                    value={clientName}
                    onChange={e => setClientName(e.target.value)}
                    placeholder="Moderna galerija"
                  />
                  <datalist id="client-list">
                    {cStore.clients.map(c => <option key={c.id} value={c.name} />)}
                  </datalist>
                </div>
                <div>
                  <Label className="text-[10px] tracking-[0.06em]">PROJECT REF (OPTIONAL)</Label>
                  <input
                    list="project-list"
                    value={projectRef}
                    onChange={e => setProjectRef(e.target.value)}
                    placeholder="RS-2026-001"
                  />
                  <datalist id="project-list">
                    {pStore.projects.map(p => <option key={p.id} value={p.pn}>{p.name}</option>)}
                  </datalist>
                </div>
              </div>

              {/* Services table */}
              <div className="mb-4">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.07em] mb-2">
                  SERVICES / LINE ITEMS
                </div>
                <div className="border border-border rounded overflow-hidden">
                  {/* Header */}
                  <div className="grid bg-muted border-b border-border px-[10px] py-[6px]" style={{ gridTemplateColumns: '130px 1fr 140px 32px' }}>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.06em]">REF #</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.06em]">DESCRIPTION</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.06em] text-right">AMOUNT (EUR)</span>
                    <span />
                  </div>
                  {/* Lines */}
                  {lines.map((line, i) => (
                    <div key={i} className={`grid items-center ${i < lines.length - 1 ? 'border-b border-border' : ''}`} style={{ gridTemplateColumns: '130px 1fr 140px 32px' }}>
                      <input
                        className="border-0 border-r border-border rounded-none px-[10px] py-[9px] text-xs outline-none bg-transparent"
                        placeholder="RS-2026-001"
                        value={line.ref}
                        onChange={e => updateLine(i, 'ref', e.target.value)}
                      />
                      <input
                        className="border-0 border-r border-border rounded-none px-[10px] py-[9px] text-xs outline-none bg-transparent"
                        placeholder="Razvoj faza 1 — Marec 2026"
                        value={line.description}
                        onChange={e => updateLine(i, 'description', e.target.value)}
                      />
                      <input
                        type="number"
                        className="border-0 border-r border-border rounded-none px-[10px] py-[9px] text-xs outline-none bg-transparent text-right"
                        placeholder="0"
                        value={line.amount}
                        onChange={e => updateLine(i, 'amount', e.target.value)}
                      />
                      {lines.length > 1 ? (
                        <button onClick={() => removeLine(i)} className="border-0 bg-transparent cursor-pointer text-muted-foreground text-base px-2 h-full hover:text-foreground">×</button>
                      ) : <div />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Add line + total */}
              <div className="flex items-center justify-between mb-5">
                <Button variant="outline" size="xs" onClick={addLine}>+ Add line</Button>
                {total > 0 && (
                  <span className="text-[13px] font-bold text-foreground">
                    Total: {fmtAmt(total.toString())}
                  </span>
                )}
              </div>

              {/* Generate button */}
              <Button
                className="w-full flex items-center justify-center gap-2"
                onClick={() => {}}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                </svg>
                Generate email
              </Button>
            </CardContent>
          </Card>

          {/* ── Right panel ── */}
          <Card>
            <div className="px-6 py-5 border-b border-border">
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.07em]">
                Generated email
              </div>
            </div>
            <CardContent className="p-6">
              <pre className="text-[12.5px] leading-[1.75] text-[#374151] bg-[#f9fafb] border border-border rounded p-4 whitespace-pre-wrap break-words mb-4 min-h-[340px]">
                {emailText}
              </pre>

              <div className="grid grid-cols-2 gap-[10px]">
                <Button
                  variant="outline"
                  onClick={handleCopy}
                  className="flex items-center justify-center gap-[6px]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                  Copy
                </Button>
                <Button
                  onClick={handleOpenMail}
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
