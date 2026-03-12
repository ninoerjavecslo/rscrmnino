import { useId, useState } from 'react'
import { useTimesheetStore } from '../stores/timesheet'

// ── Known projects for autocomplete ──────────────────────────────────────────
// These are the project PNs from your Supabase projects table.
// The datalist is just for convenience — users can type any PN freely.

const KNOWN_PROJECTS = [
  { pn: 'RS-2026-001', name: 'MG+MSUM Prenova',        type: 'fixed' },
  { pn: 'RS-2026-004', name: 'Unichem Digitalizacija',  type: 'maintenance' },
  { pn: 'RS-2026-005', name: 'OKS TV Broadcast',        type: 'retainer' },
  { pn: 'RS-2025-010', name: 'Pristop Spletna stran',   type: 'fixed' },
  { pn: 'RS-2026-GOT', name: 'Hosting — GOT',           type: 'maintenance' },
  { pn: 'Sales',       name: 'Sales & Business Dev',    type: 'internal' },
  { pn: 'Admin',       name: 'Administration',           type: 'internal' },
]

const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  fixed:       'Razvoj in implementacija funkcionalnosti po specifikaciji',
  maintenance: 'Vzdrževanje, posodobitve in tehnična podpora',
  retainer:    'Mesečna podpora, svetovanje in razvoj po naročilu',
  internal:    'Interne aktivnosti in poslovni razvoj',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Row { id: string; pn: string; description: string; pct: number }

let _id = 0
function makeRow(): Row { return { id: String(++_id), pn: '', description: '', pct: 0 } }

// ── Smart Distribute modal ────────────────────────────────────────────────────

function SmartDistributeModal({ open, onClose, onApply }: {
  open: boolean
  onClose: () => void
  onApply: (rows: Row[]) => void
}) {
  const [projects, setProjects] = useState<string[]>([''])
  const [top3, setTop3]         = useState(['', '', ''])
  const listId = useId()

  function addProject()            { setProjects(p => [...p, '']) }
  function updateProject(i: number, v: string) { setProjects(p => p.map((x, j) => j === i ? v : x)) }
  function removeProject(i: number)            { setProjects(p => p.filter((_, j) => j !== i)) }
  function setTop(i: number, v: string)        { setTop3(p => { const n = [...p]; n[i] = v; return n }) }

  function descFor(pn: string) {
    const proj = KNOWN_PROJECTS.find(p => p.pn === pn)
    return DEFAULT_DESCRIPTIONS[proj?.type ?? 'fixed']
  }

  function apply() {
    const valid = projects.filter(p => p.trim())
    if (!valid.length) return
    const top  = top3.filter(p => p.trim())
    const rest = valid.filter(p => !top.includes(p))
    const topPct  = top.length  ? Math.round(65 / top.length)  : 0
    const restPct = rest.length ? Math.round(35 / rest.length) : 0
    onApply([
      ...top.map(pn  => ({ id: String(++_id), pn, description: descFor(pn), pct: topPct })),
      ...rest.map(pn => ({ id: String(++_id), pn, description: descFor(pn), pct: restPct })),
    ])
    onClose()
  }

  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>Smart Distribute</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p className="text-sm" style={{marginBottom:18,lineHeight:1.6}}>
            List all projects you worked on this month, then pick your <strong>top 3</strong> for most hours. AI distributes the rest proportionally.
          </p>

          <div className="form-group" style={{marginBottom:20}}>
            <label className="form-label">All projects this month</label>
            {projects.map((pn, i) => (
              <div key={i} style={{display:'flex',gap:8,marginBottom:8}}>
                <input list={listId} value={pn} onChange={e => updateProject(i, e.target.value)} placeholder="PN or project name…" style={{flex:1}} />
                {projects.length > 1 && (
                  <button onClick={() => removeProject(i)} style={{width:36,height:42,border:'1px solid var(--c6)',borderRadius:8,background:'#fff',cursor:'pointer',color:'var(--c4)',fontSize:20}}>×</button>
                )}
              </div>
            ))}
            <button className="btn btn-ghost btn-xs" onClick={addProject}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add project
            </button>
          </div>

          <div style={{background:'var(--navy-light)',border:'1px solid var(--navy-muted)',borderRadius:'var(--r)',padding:'14px 16px'}}>
            <div className="form-label" style={{color:'var(--navy)',marginBottom:12}}>Top 3 projects (most hours)</div>
            {top3.map((val, i) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,marginBottom:i<2?10:0}}>
                <span style={{width:20,fontWeight:800,color:'var(--navy)',fontSize:14}}>{i+1}.</span>
                <input list={listId} value={val} onChange={e => setTop(i, e.target.value)} placeholder="PN or project name…" style={{flex:1}} />
              </div>
            ))}
            <p className="text-xs" style={{marginTop:10,color:'var(--navy)'}}>Top 3 get ~65% of total hours · rest split equally</p>
          </div>

          <datalist id={listId}>
            {KNOWN_PROJECTS.map(p => <option key={p.pn} value={p.pn}>{p.pn} · {p.name}</option>)}
          </datalist>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={apply}>Apply to timesheet</button>
        </div>
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function TimesheetView() {
  const store = useTimesheetStore()
  const [month, setMonth]           = useState('2026-03')
  const [totalHours, setTotalHours] = useState(168)
  const [workDays, setWorkDays]     = useState(21)
  const [rows, setRows]             = useState<Row[]>([])
  const [showDistribute, setShowDistribute] = useState(false)
  const [saving, setSaving]         = useState(false)
  const listId = useId()

  const totalPct = rows.reduce((s, r) => s + r.pct, 0)
  const pctColor = totalPct > 100 ? 'var(--red)' : totalPct === 100 ? 'var(--green)' : 'var(--navy)'

  function addRow()              { setRows(r => [...r, makeRow()]) }
  function removeRow(id: string) { setRows(r => r.filter(x => x.id !== id)) }

  function updateRow(id: string, field: keyof Row, value: string | number) {
    setRows(r => r.map(x => {
      if (x.id !== id) return x
      const updated = { ...x, [field]: value }
      if (field === 'pn') {
        const proj = KNOWN_PROJECTS.find(p => p.pn === value)
        if (proj) updated.description = DEFAULT_DESCRIPTIONS[proj.type]
      }
      return updated
    }))
  }

  async function handleGenerate() {
    const valid = rows.filter(r => r.pn && r.pct > 0)
    if (!valid.length) return
    setSaving(true)
    try {
      const monthStart = `${month}-01`
      await store.saveEntries(valid.map(r => ({
        month:             monthStart,
        project_pn:        r.pn,
        project_name:      KNOWN_PROJECTS.find(p => p.pn === r.pn)?.name ?? null,
        description:       r.description || null,
        hours:             Math.round((r.pct / 100) * totalHours * 10) / 10,
        allocation_pct:    r.pct,
        total_month_hours: totalHours,
        ai_generated:      true,
        user_id:           null,
      })))
      alert(`✓ ${valid.length} entries saved to Supabase`)
    } catch {
      alert('Error saving — check Supabase credentials')
    } finally {
      setSaving(false)
    }
  }

  const preview = rows.filter(r => r.pn && r.pct > 0).map(r => ({
    pn:          r.pn,
    description: r.description,
    hours:       Math.round((r.pct / 100) * totalHours * 10) / 10,
  }))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>AI Hour Distribution</h1>
          <p>Generate monthly timesheet entries from project allocation</p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={handleGenerate} disabled={rows.length === 0 || saving}>
          {saving ? <span className="spinner" style={{borderTopColor:'#fff'}}/> : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          )}
          Generate &amp; save
        </button>
      </div>

      <div className="page-content">
        {/* Config bar */}
        <div className="card" style={{marginBottom:20}}>
          <div className="card-body" style={{display:'flex',alignItems:'center',gap:24,flexWrap:'wrap'}}>
            <div className="form-group" style={{flex:'0 0 auto'}}>
              <label className="form-label">Month</label>
              <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{width:160}} />
            </div>
            <div className="form-group" style={{flex:'0 0 auto'}}>
              <label className="form-label">Total hours</label>
              <input type="number" value={totalHours} onChange={e => setTotalHours(Number(e.target.value))} style={{width:100}} />
            </div>
            <div className="form-group" style={{flex:'0 0 auto'}}>
              <label className="form-label">Work days</label>
              <input type="number" value={workDays} onChange={e => setWorkDays(Number(e.target.value))} style={{width:80}} />
            </div>
            <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:12}}>
              {totalPct > 100 && <span className="badge badge-red">Over 100%</span>}
              {totalPct === 100 && <span className="badge badge-green">Perfect ✓</span>}
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:28,fontWeight:800,color:pctColor,fontVariantNumeric:'tabular-nums',letterSpacing:'-0.6px'}}>{totalPct}%</div>
                <div className="text-xs">allocated</div>
              </div>
              <div style={{width:8,height:60,background:'var(--c7)',borderRadius:100,overflow:'hidden',position:'relative'}}>
                <div style={{position:'absolute',bottom:0,left:0,right:0,height:`${Math.min(totalPct,100)}%`,background:pctColor,borderRadius:100,transition:'height .2s,background .2s'}}/>
              </div>
            </div>
          </div>
        </div>

        <div className="grid-2" style={{gap:20}}>
          {/* Left — project rows */}
          <div>
            <div className="section-bar">
              <h2>Projects</h2>
              <div style={{display:'flex',gap:8}}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowDistribute(true)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  Smart distribute
                </button>
                <button className="btn btn-secondary btn-sm" onClick={addRow}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add project
                </button>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="card">
                <div className="card-body" style={{textAlign:'center',padding:'40px 20px',color:'var(--c4)'}}>
                  <div style={{fontSize:28,marginBottom:8}}>⏱</div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--c3)',marginBottom:4}}>No projects yet</div>
                  <div className="text-sm">Add projects manually or use Smart Distribute</div>
                </div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {rows.map(row => {
                  const hours = Math.round((row.pct / 100) * totalHours * 10) / 10
                  return (
                    <div key={row.id} className="card">
                      <div className="card-body" style={{padding:'12px 14px'}}>
                        <div style={{display:'flex',gap:8,marginBottom:8}}>
                          <div style={{flex:1}}>
                            <label className="form-label" style={{display:'block',marginBottom:4}}>Project PN</label>
                            <input list={listId} value={row.pn} onChange={e => updateRow(row.id,'pn',e.target.value)} placeholder="Type PN or name…" />
                          </div>
                          <div style={{width:72}}>
                            <label className="form-label" style={{display:'block',marginBottom:4}}>%</label>
                            <input type="number" value={row.pct || ''} min={0} max={100}
                              onChange={e => updateRow(row.id,'pct',Number(e.target.value))} placeholder="0" />
                          </div>
                          <div style={{width:64,alignSelf:'flex-end',paddingBottom:8,textAlign:'center'}}>
                            <div style={{fontSize:18,fontWeight:800,color:'var(--navy)',fontVariantNumeric:'tabular-nums'}}>{hours}h</div>
                          </div>
                        </div>
                        <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                          <div style={{flex:1}}>
                            <label className="form-label" style={{display:'block',marginBottom:4}}>Description (SL)</label>
                            <input value={row.description} onChange={e => updateRow(row.id,'description',e.target.value)} placeholder="Opis dela v slovenščini…" />
                          </div>
                          <button onClick={() => removeRow(row.id)} className="btn btn-secondary btn-xs" style={{marginTop:20,flexShrink:0}}>Remove</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <datalist id={listId}>
              {KNOWN_PROJECTS.map(p => <option key={p.pn} value={p.pn}>{p.pn} · {p.name}</option>)}
            </datalist>
          </div>

          {/* Right — preview */}
          <div>
            <div className="section-bar"><h2>Preview</h2></div>
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Številka PN</th>
                    <th className="th-right">Ur</th>
                    <th>Opis dela</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.length === 0 ? (
                    <tr><td colSpan={3} style={{textAlign:'center',padding:'32px 16px',color:'var(--c4)'}}>Add projects to see preview</td></tr>
                  ) : preview.map((r, i) => (
                    <tr key={i}>
                      <td><span className="badge badge-navy">{r.pn}</span></td>
                      <td className="td-right text-mono" style={{fontWeight:700}}>{r.hours}h</td>
                      <td className="text-sm" style={{maxWidth:200}}>{r.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                {preview.length > 0 && (
                  <tfoot>
                    <tr>
                      <td style={{fontWeight:700,fontSize:11,color:'var(--c3)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Total</td>
                      <td className="td-right text-mono" style={{fontWeight:800,color:'var(--navy)'}}>{preview.reduce((s,r)=>s+r.hours,0)}h</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>

      <SmartDistributeModal open={showDistribute} onClose={() => setShowDistribute(false)} onApply={setRows} />
    </div>
  )
}
