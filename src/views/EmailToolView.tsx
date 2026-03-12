import { useState, useMemo } from 'react'
import { useProjectsStore } from '../stores/projects'
import { useClientsStore } from '../stores/clients'

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
      <div className="page-header">
        <div>
          <h1>Email Tool</h1>
          <p>Generate a Slovenian invoice request for your accountant</p>
        </div>
      </div>

      <div className="page-content">
        <div className="grid-2" style={{ gap: 24, alignItems: 'start' }}>

          {/* ── Left panel ── */}
          <div className="card">
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--c6)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Invoice request for accounting
              </div>
            </div>
            <div style={{ padding: '20px 24px' }}>

              {/* Row 1: month + payment terms */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 10, letterSpacing: '0.06em' }}>DATE OF SERVICE (MONTH)</label>
                  <input type="month" value={serviceMonth} onChange={e => setServiceMonth(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 10, letterSpacing: '0.06em' }}>PAYMENT TERMS (DAYS)</label>
                  <input type="number" value={paymentDays} onChange={e => setPaymentDays(e.target.value)} min="0" />
                </div>
              </div>

              {/* Row 2: client + project ref */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 10, letterSpacing: '0.06em' }}>CLIENT / COMPANY</label>
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
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 10, letterSpacing: '0.06em' }}>PROJECT REF (OPTIONAL)</label>
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
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                  SERVICES / LINE ITEMS
                </div>
                <div style={{ border: '1px solid var(--c6)', borderRadius: 6, overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 140px 32px', background: 'var(--c7)', borderBottom: '1px solid var(--c6)', padding: '6px 10px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>REF #</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>DESCRIPTION</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--c4)', letterSpacing: '0.06em', textTransform: 'uppercase', textAlign: 'right' }}>AMOUNT (EUR)</span>
                    <span />
                  </div>
                  {/* Lines */}
                  {lines.map((line, i) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '130px 1fr 140px 32px',
                      borderBottom: i < lines.length - 1 ? '1px solid var(--c6)' : 'none',
                      alignItems: 'center',
                    }}>
                      <input
                        style={{ border: 'none', borderRight: '1px solid var(--c6)', borderRadius: 0, padding: '9px 10px', fontSize: 12, outline: 'none', background: 'transparent' }}
                        placeholder="RS-2026-001"
                        value={line.ref}
                        onChange={e => updateLine(i, 'ref', e.target.value)}
                      />
                      <input
                        style={{ border: 'none', borderRight: '1px solid var(--c6)', borderRadius: 0, padding: '9px 10px', fontSize: 12, outline: 'none', background: 'transparent' }}
                        placeholder="Razvoj faza 1 — Marec 2026"
                        value={line.description}
                        onChange={e => updateLine(i, 'description', e.target.value)}
                      />
                      <input
                        type="number"
                        style={{ border: 'none', borderRight: '1px solid var(--c6)', borderRadius: 0, padding: '9px 10px', fontSize: 12, outline: 'none', background: 'transparent', textAlign: 'right' }}
                        placeholder="0"
                        value={line.amount}
                        onChange={e => updateLine(i, 'amount', e.target.value)}
                      />
                      {lines.length > 1 ? (
                        <button onClick={() => removeLine(i)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--c4)', fontSize: 16, padding: '0 8px', height: '100%' }}>×</button>
                      ) : <div />}
                    </div>
                  ))}
                </div>
              </div>

              {/* Add line + total */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <button className="btn btn-secondary btn-xs" onClick={addLine}>+ Add line</button>
                {total > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--c1)' }}>
                    Total: {fmtAmt(total.toString())}
                  </span>
                )}
              </div>

              {/* Generate button */}
              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onClick={() => {}}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                </svg>
                Generate email
              </button>
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="card">
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--c6)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--c4)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Generated email
              </div>
            </div>
            <div style={{ padding: '20px 24px' }}>
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
                minHeight: 340,
              }}>
                {emailText}
              </pre>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '10px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={handleCopy}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                  Copy
                </button>
                <button
                  className="btn btn-primary"
                  style={{ padding: '10px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  onClick={handleOpenMail}
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
