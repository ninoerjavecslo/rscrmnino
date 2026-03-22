import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import type { CompanyHoliday } from '../lib/types'
import { useSettingsStore } from '../stores/settings'
import { useResourceStore } from '../stores/resource'
import { useHolidayStore } from '../stores/holidays'
import { toast } from '../lib/toast'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import type { TeamMember } from '../lib/types'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL?.replace('.supabase.co', '.supabase.co/functions/v1')
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function fnHeaders() {
  return { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' }
}

function TelegramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
    </svg>
  )
}

type SettingsTab = 'general' | 'team' | 'holidays'

interface MemberForm {
  name: string; email: string; team_id: string; role: string; skills: string
}
const EMPTY_FORM: MemberForm = { name: '', email: '', team_id: '', role: '', skills: '' }

function getTeamCategory(m: TeamMember): 'uxui' | 'dev' | 'content' | 'other' {
  const teamName = (m.team?.name ?? '').toLowerCase()
  if (/ux|ui|design|creative|visual/.test(teamName)) return 'uxui'
  if (/dev|engineer|tech|frontend|backend|full.?stack|software/.test(teamName)) return 'dev'
  if (/content|copy|market|writ|seo/.test(teamName)) return 'content'
  return 'other'
}


export function SettingsView() {
  const settingsStore = useSettingsStore()
  const resourceStore = useResourceStore()
  const holidayStore = useHolidayStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const tab = searchParams.get('tab')
    return (tab === 'team' || tab === 'holidays' || tab === 'general') ? tab : 'general'
  })

  // ── General settings ──────────────────────────────────────────────────────
  const [agencyInput, setAgencyInput]     = useState('')
  const [logoInput, setLogoInput]         = useState('')
  const [editingGeneral, setEditingGeneral] = useState(false)
  const [agencySaving, setAgencySaving]   = useState(false)
  const [pmInput, setPmInput] = useState('')
  const [pmSaving, setPmSaving] = useState(false)

  // ── Team ─────────────────────────────────────────────────────────────────
  const [showMemberModal, setShowMemberModal] = useState(false)
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null)
  const [memberForm, setMemberForm] = useState<MemberForm>({ ...EMPTY_FORM })
  const [memberSaving, setMemberSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null)
  const [confirmHolidayDelete, setConfirmHolidayDelete] = useState<{ id: string; name: string } | null>(null)

  // ── Telegram ─────────────────────────────────────────────────────────────
  const [linked, setLinked]     = useState<boolean | null>(null)
  const [linkedAt, setLinkedAt] = useState<string | null>(null)
  const [linkCode, setLinkCode] = useState<string | null>(null)
  const [codeExpiry, setCodeExpiry] = useState(0)
  const [tgLoading, setTgLoading] = useState(false)
  const [revoking, setRevoking]   = useState(false)

  // ── Holidays ─────────────────────────────────────────────────────────────
  const [filterYear, setFilterYear] = useState(new Date().getFullYear())
  const [showHolidayForm, setShowHolidayForm] = useState(false)
  const [holidayForm, setHolidayForm] = useState<{
    name: string; date: string; type: 'public_holiday' | 'company_shutdown'
    applies_to: string[]; recurrence: 'none' | 'yearly'
  }>({ name: '', date: '', type: 'public_holiday', applies_to: [], recurrence: 'none' })
  const [holidaySaving, setHolidaySaving] = useState(false)
  const [editHolidayTarget, setEditHolidayTarget] = useState<CompanyHoliday | null>(null)
  const [editHolidayForm, setEditHolidayForm] = useState<{
    name: string; date: string; type: 'public_holiday' | 'company_shutdown'
    applies_to: string[]; recurrence: 'none' | 'yearly'
  }>({ name: '', date: '', type: 'public_holiday', applies_to: [], recurrence: 'none' })
  const [editHolidaySaving, setEditHolidaySaving] = useState(false)

  // ── Team search ───────────────────────────────────────────────────────────
  const [memberSearch, setMemberSearch] = useState('')

  const checkTgStatus = useCallback(async () => {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/telegram-link`, { method: 'POST', headers: fnHeaders() })
      const data = await res.json()
      setLinked(data.linked); setLinkedAt(data.linked_at)
    } catch { setLinked(false) }
  }, [])

  useEffect(() => {
    settingsStore.fetch().then(() => {
      setAgencyInput(settingsStore.agencyName)
      setLogoInput(settingsStore.agencyLogo ?? '')
      setEditingGeneral(false)
    })
    resourceStore.fetchTeams()
    resourceStore.fetchMembers()
    holidayStore.fetchAll()
    checkTgStatus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!linkCode || codeExpiry <= 0) return
    const t = setInterval(() => setCodeExpiry(s => { if (s <= 1) { setLinkCode(null); clearInterval(t); return 0 } return s - 1 }), 1000)
    return () => clearInterval(t)
  }, [linkCode, codeExpiry])

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function saveGeneral() {
    setAgencySaving(true)
    try {
      await settingsStore.setAgencyName(agencyInput.trim())
      await settingsStore.setAgencyLogo(logoInput.trim())
      toast('success', 'Settings saved')
      setEditingGeneral(false)
    } catch { toast('error', 'Failed to save') }
    finally { setAgencySaving(false) }
  }

  function cancelGeneral() {
    setAgencyInput(settingsStore.agencyName)
    setLogoInput(settingsStore.agencyLogo ?? '')
    setEditingGeneral(false)
  }

  async function addPM() {
    const name = pmInput.trim()
    if (!name || settingsStore.projectManagers.includes(name)) return
    setPmSaving(true)
    try {
      await settingsStore.setProjectManagers([...settingsStore.projectManagers, name])
      setPmInput(''); toast('success', `${name} added`)
    } catch { toast('error', 'Failed') }
    finally { setPmSaving(false) }
  }

  async function removePM(name: string) {
    setPmSaving(true)
    try { await settingsStore.setProjectManagers(settingsStore.projectManagers.filter(m => m !== name)) }
    catch { toast('error', 'Failed') }
    finally { setPmSaving(false) }
  }

  async function generateCode() {
    setTgLoading(true)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/telegram-link`, { method: 'GET', headers: fnHeaders() })
      const data = await res.json()
      setLinkCode(data.code); setCodeExpiry(600)
    } catch { alert('Failed to generate link code.') }
    finally { setTgLoading(false) }
  }

  async function revokeBot() {
    if (!confirm('Disconnect the Telegram bot?')) return
    setRevoking(true)
    try {
      await fetch(`${FUNCTIONS_URL}/telegram-link`, { method: 'DELETE', headers: fnHeaders() })
      setLinked(false); setLinkedAt(null); setLinkCode(null)
    } finally { setRevoking(false) }
  }

  function openInvite() {
    setEditTarget(null); setMemberForm({ ...EMPTY_FORM }); setShowMemberModal(true)
  }

  function openEdit(m: TeamMember) {
    setEditTarget(m)
    setMemberForm({ name: m.name, email: m.email ?? '', team_id: m.team_id ?? '', role: m.role ?? '', skills: m.skills ?? '' })
    setShowMemberModal(true)
  }

  async function saveMember() {
    if (!memberForm.name.trim()) return
    setMemberSaving(true)
    try {
      if (editTarget) {
        await resourceStore.updateMember(editTarget.id, {
          name: memberForm.name.trim(),
          email: memberForm.email || null,
          team_id: memberForm.team_id || null,
          role: memberForm.role || null,
          skills: memberForm.skills || null,
        })
        toast('success', 'Member updated')
      } else {
        await resourceStore.addMember({
          name: memberForm.name.trim(),
          email: memberForm.email || undefined,
          team_id: memberForm.team_id || null,
          role: memberForm.role || undefined,
          skills: memberForm.skills || undefined,
        })
        toast('success', 'Member added')
      }
      setShowMemberModal(false)
    } catch (err) { toast('error', (err as Error).message) }
    finally { setMemberSaving(false) }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      await resourceStore.removeMember(deleteTarget.id)
      toast('success', 'Member removed'); setDeleteTarget(null)
    } catch (err) { toast('error', (err as Error).message) }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const members = resourceStore.members
  const teams   = resourceStore.teams
  const uxuiCount    = members.filter(m => getTeamCategory(m) === 'uxui').length
  const devCount     = members.filter(m => getTeamCategory(m) === 'dev').length
  const contentCount = members.filter(m => getTeamCategory(m) === 'content').length
  const otherCount   = members.filter(m => getTeamCategory(m) === 'other').length

  const minutes = Math.floor(codeExpiry / 60)
  const expiryLabel = `${minutes}:${String(codeExpiry % 60).padStart(2, '0')}`

  // ── Render ────────────────────────────────────────────────────────────────

  function renderGeneral() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Top row: General Info | Team summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

          {/* General Information */}
          <div className="card">
            <div className="card-body" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--c0)' }}>General Information</span>
                </div>
                {!editingGeneral && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingGeneral(true)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </button>
                )}
              </div>

              {editingGeneral ? (
                <>
                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label className="form-label">AGENCY NAME</label>
                    <input autoFocus value={agencyInput} onChange={e => setAgencyInput(e.target.value)} placeholder="e.g. Renderspace d.o.o." onKeyDown={e => e.key === 'Enter' && saveGeneral()} />
                  </div>

                  <div className="form-group" style={{ marginBottom: 24 }}>
                    <label className="form-label">AGENCY LOGO</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ width: 64, height: 64, border: '2px dashed var(--c5)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', background: 'var(--c7)' }}>
                        {logoInput
                          ? <img src={logoInput} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => (e.currentTarget.style.display = 'none')} />
                          : <span style={{ fontSize: 9, color: 'var(--c4)', textAlign: 'center', lineHeight: 1.4, fontWeight: 600 }}>AGENCY<br/>LOGO</span>
                        }
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--c5)', background: '#fff', fontSize: 13, fontWeight: 600, color: 'var(--c1)', width: 'fit-content' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                          Upload image
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = ev => setLogoInput(ev.target?.result as string)
                            reader.readAsDataURL(file)
                          }} />
                        </label>
                        {logoInput && (
                          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)', width: 'fit-content' }} onClick={() => setLogoInput('')}>Remove logo</button>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--c4)' }}>PNG, SVG or JPG · max 512×512px recommended</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={saveGeneral} disabled={agencySaving}>
                      {agencySaving ? 'Saving…' : 'Save Configuration'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={cancelGeneral}>Cancel</button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div className="form-label" style={{ marginBottom: 6 }}>AGENCY NAME</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c0)' }}>
                      {settingsStore.agencyName || <span style={{ color: 'var(--c4)', fontWeight: 400 }}>Not set</span>}
                    </div>
                  </div>
                  <div>
                    <div className="form-label" style={{ marginBottom: 8 }}>AGENCY LOGO</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 56, height: 56, border: '1px solid var(--c5)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--c7)', flexShrink: 0 }}>
                        {settingsStore.agencyLogo
                          ? <img src={settingsStore.agencyLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          : <span style={{ fontSize: 9, color: 'var(--c4)', textAlign: 'center', lineHeight: 1.4, fontWeight: 600 }}>AGENCY<br/>LOGO</span>
                        }
                      </div>
                      <span style={{ fontSize: 13, color: settingsStore.agencyLogo ? 'var(--c2)' : 'var(--c4)' }}>
                        {settingsStore.agencyLogo ? settingsStore.agencyLogo.replace(/^https?:\/\//, '') : 'No logo set'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Team & Workspace dark card */}
          <div style={{ background: 'var(--navy)', borderRadius: 12, padding: '20px 22px', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Team &amp; Workspace</span>
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 18, lineHeight: 1.5 }}>
              Manage your core team across disciplines.
            </p>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16, marginBottom: 16 }}>
              {[
                { label: 'Total Members', value: members.length },
                { label: 'UX/UI', value: uxuiCount },
                { label: 'Development', value: devCount },
                { label: 'Content', value: contentCount },
                { label: 'Others', value: otherCount },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 13 }}>
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>{row.label}</span>
                  <span style={{ fontWeight: 700 }}>{row.value}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setActiveTab('team')}
              style={{ width: '100%', background: '#6366f1', border: 'none', borderRadius: 8, padding: '10px 0', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              Manage Team →
            </button>
          </div>
        </div>

        {/* Project Managers */}
        <div className="card">
          <div className="card-body" style={{ padding: '20px 24px' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c0)', marginBottom: 4 }}>Project Managers</div>
            <div style={{ fontSize: 13, color: 'var(--c3)', marginBottom: 16 }}>People available as PMs in project forms.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {settingsStore.projectManagers.map(name => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--c7)', borderRadius: 6, padding: '5px 10px', fontSize: 13, color: 'var(--c1)' }}>
                  <span>{name}</span>
                  <button onClick={() => removePM(name)} disabled={pmSaving}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c4)', fontSize: 15, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, maxWidth: 360 }}>
              <input value={pmInput} onChange={e => setPmInput(e.target.value)} placeholder="Add name…"
                onKeyDown={e => e.key === 'Enter' && addPM()} style={{ flex: 1 }} />
              <button className="btn btn-primary btn-sm" onClick={addPM} disabled={pmSaving || !pmInput.trim()}>Add</button>
            </div>
          </div>
        </div>

        {/* Telegram */}
        <div className="card">
          <div className="card-body" style={{ padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#e8f2ff', color: '#229ED9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TelegramIcon />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c0)' }}>Telegram Bot</div>
                <div style={{ fontSize: 12, color: 'var(--c3)' }}>@nino_personal_bot — natural language worker</div>
              </div>
              {linked !== null && (
                <span className={`badge ${linked ? 'badge-green' : 'badge-gray'}`} style={{ marginLeft: 'auto' }}>
                  {linked ? 'Connected' : 'Not connected'}
                </span>
              )}
            </div>

            {linked === null && <div style={{ fontSize: 13, color: 'var(--c4)' }}>Checking status…</div>}

            {linked === false && (
              <div>
                <p style={{ fontSize: 13, color: 'var(--c3)', marginBottom: 16, lineHeight: 1.6 }}>
                  Connect your Telegram account to use the bot. Generate a link code below, then send it to the bot.
                </p>
                {!linkCode ? (
                  <button className="btn btn-primary btn-sm" onClick={generateCode} disabled={tgLoading}>
                    {tgLoading ? 'Generating…' : 'Generate link code'}
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ background: 'var(--c7)', borderRadius: 8, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <code style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1, color: 'var(--c1)', fontFamily: 'monospace' }}>/start {linkCode}</code>
                      <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(`/start ${linkCode}`)}>Copy</button>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--c4)' }}>
                      Open <strong>@nino_personal_bot</strong> in Telegram and send this message.
                      Expires in <strong style={{ color: codeExpiry < 60 ? 'var(--red)' : 'var(--c2)' }}>{expiryLabel}</strong>.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" onClick={generateCode} disabled={tgLoading}>Regenerate</button>
                      <button className="btn btn-secondary btn-sm" onClick={checkTgStatus}>Check status</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {linked === true && (
              <div>
                <div style={{ background: 'var(--c7)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c1)' }}>Bot connected</div>
                    {linkedAt && <div style={{ fontSize: 12, color: 'var(--c4)' }}>Since {new Date(linkedAt).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
                  </div>
                  <div style={{ color: '#22c55e', fontSize: 20 }}>✓</div>
                </div>
                <p style={{ fontSize: 13, color: 'var(--c3)', marginBottom: 14, lineHeight: 1.6 }}>
                  Open <strong>@nino_personal_bot</strong> in Telegram and start chatting.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {['list active projects', 'show planned invoices', 'create project for Acme, fixed 5000€', 'issue March invoice for Acme'].map(ex => (
                    <span key={ex} style={{ background: 'var(--c7)', borderRadius: 20, padding: '4px 10px', fontSize: 12, color: 'var(--c2)', fontStyle: 'italic' }}>"{ex}"</span>
                  ))}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={revokeBot} disabled={revoking}
                  style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
                  {revoking ? 'Disconnecting…' : 'Disconnect bot'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  async function saveHoliday() {
    if (!holidayForm.name.trim() || !holidayForm.date) return
    setHolidaySaving(true)
    try {
      await holidayStore.add({
        name: holidayForm.name.trim(),
        date: holidayForm.date,
        type: holidayForm.type,
        applies_to: holidayForm.applies_to,
        recurrence: holidayForm.recurrence,
      })
      toast('success', 'Holiday added')
      setShowHolidayForm(false)
      setHolidayForm({ name: '', date: '', type: 'public_holiday', applies_to: [], recurrence: 'none' })
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed to save') }
    finally { setHolidaySaving(false) }
  }

  function openEditHoliday(h: CompanyHoliday) {
    setEditHolidayTarget(h)
    setEditHolidayForm({ name: h.name, date: h.date, type: h.type, applies_to: h.applies_to, recurrence: h.recurrence })
  }

  async function saveEditHoliday() {
    if (!editHolidayTarget || !editHolidayForm.name.trim() || !editHolidayForm.date) return
    setEditHolidaySaving(true)
    try {
      await holidayStore.update(editHolidayTarget.id, {
        name: editHolidayForm.name.trim(),
        date: editHolidayForm.date,
        type: editHolidayForm.type,
        applies_to: editHolidayForm.applies_to,
        recurrence: editHolidayForm.recurrence,
      })
      toast('success', 'Holiday updated')
      setEditHolidayTarget(null)
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Failed to save') }
    finally { setEditHolidaySaving(false) }
  }

  async function deleteHoliday(id: string, name: string) {
    setConfirmHolidayDelete({ id, name })
  }

  async function confirmHolidayDeleteFn() {
    if (!confirmHolidayDelete) return
    try {
      await holidayStore.remove(confirmHolidayDelete.id)
      toast('success', 'Removed')
      setConfirmHolidayDelete(null)
    }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Failed to remove') }
  }

  function renderHolidays() {
    const visibleHolidays = holidayStore.holidays.filter(h =>
      h.recurrence === 'yearly' || h.date.startsWith(String(filterYear))
    )
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="section-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setFilterYear(y => y - 1)}>‹</button>
            <span style={{ fontWeight: 700, fontSize: 14, minWidth: 40, textAlign: 'center' }}>{filterYear}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setFilterYear(y => y + 1)}>›</button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowHolidayForm(v => !v)}>
            {showHolidayForm ? 'Cancel' : '+ Add Holiday'}
          </button>
        </div>

        {showHolidayForm && (
          <div className="card">
            <div className="card-body">
              <div className="form-row" style={{ marginBottom: 14 }}>
                <div className="form-group">
                  <label className="form-label">Holiday Name</label>
                  <input autoFocus value={holidayForm.name} onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Christmas Day" />
                </div>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" value={holidayForm.date} onChange={e => setHolidayForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              <div className="form-row" style={{ marginBottom: 14 }}>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <Select
                    value={holidayForm.type}
                    onChange={val => setHolidayForm(f => ({ ...f, type: val as 'public_holiday' | 'company_shutdown' }))}
                    options={[
                      { value: 'public_holiday', label: 'Public Holiday' },
                      { value: 'company_shutdown', label: 'Company Shutdown' },
                    ]}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Recurrence</label>
                  <Select
                    value={holidayForm.recurrence}
                    onChange={val => setHolidayForm(f => ({ ...f, recurrence: val as 'none' | 'yearly' }))}
                    options={[
                      { value: 'none', label: 'Once' },
                      { value: 'yearly', label: 'Yearly' },
                    ]}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Applies To</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {/* "All Teams" pill */}
                  <button
                    type="button"
                    onClick={() => setHolidayForm(f => ({ ...f, applies_to: [] }))}
                    style={{
                      padding: '5px 14px', borderRadius: 20, border: '1.5px solid',
                      borderColor: holidayForm.applies_to.length === 0 ? 'var(--navy)' : 'var(--c5)',
                      background: holidayForm.applies_to.length === 0 ? 'var(--navy)' : '#fff',
                      color: holidayForm.applies_to.length === 0 ? '#fff' : 'var(--c2)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >All Teams</button>
                  {resourceStore.teams.map(t => {
                    const selected = holidayForm.applies_to.includes(t.id)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setHolidayForm(f => ({
                          ...f,
                          applies_to: selected
                            ? f.applies_to.filter(id => id !== t.id)
                            : [...f.applies_to, t.id],
                        }))}
                        style={{
                          padding: '5px 14px', borderRadius: 20, border: '1.5px solid',
                          borderColor: selected ? t.color : 'var(--c5)',
                          background: selected ? t.color + '22' : '#fff',
                          color: selected ? t.color : 'var(--c2)',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >{t.name}</button>
                    )
                  })}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowHolidayForm(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={saveHoliday} disabled={holidaySaving || !holidayForm.name.trim() || !holidayForm.date}>
                  {holidaySaving ? 'Saving…' : 'Save Holiday'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          {holidayStore.loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--c4)' }}>Loading…</div>
          ) : visibleHolidays.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c4)', fontSize: 13 }}>
              No holidays for {filterYear}. Click "Add Holiday" to get started.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>NAME</th>
                  <th>TYPE</th>
                  <th>RECURRENCE</th>
                  <th>APPLIES TO</th>
                  <th style={{ width: 130 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {visibleHolidays.map(h => {
                  const rawDate = h.recurrence === 'yearly'
                    ? `${filterYear}-${h.date.slice(5)}`
                    : h.date
                  const [dy, dm, dd] = rawDate.split('-')
                  const displayDate = `${dd}/${dm}/${dy}`
                  const teamLabels = h.applies_to.length === 0
                    ? 'All Teams'
                    : h.applies_to.map(tid => resourceStore.teams.find(t => t.id === tid)?.name ?? tid).join(', ')
                  return (
                    <tr key={h.id}>
                      <td className="text-mono" style={{ fontSize: 13 }}>{displayDate}</td>
                      <td style={{ fontWeight: 600 }}>{h.name}</td>
                      <td>
                        <span className={`badge ${h.type === 'public_holiday' ? 'badge-blue' : 'badge-amber'}`}>
                          {h.type === 'public_holiday' ? 'Public Holiday' : 'Company Shutdown'}
                        </span>
                      </td>
                      <td style={{ fontSize: 13, color: 'var(--c2)' }}>{h.recurrence === 'yearly' ? 'Yearly' : 'Once'}</td>
                      <td style={{ fontSize: 13, color: 'var(--c2)' }}>{teamLabels}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-xs" onClick={() => openEditHoliday(h)}>Edit</button>
                          <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => deleteHoliday(h.id, h.name)}>Remove</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  function renderTeam() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Stats strip */}
        <div className="stats-strip">
          {[
            { label: 'TOTAL MEMBERS', value: members.length, sub: 'All active', iconBg: 'rgba(99,102,241,0.1)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
            { label: 'UX/UI', value: uxuiCount, sub: 'Design & UX', iconBg: 'rgba(245,158,11,0.1)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg> },
            { label: 'DEVELOPMENT', value: devCount, sub: 'Engineers', iconBg: 'rgba(59,130,246,0.1)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> },
            { label: 'CONTENT', value: contentCount, sub: 'Writers & editors', iconBg: 'rgba(16,185,129,0.1)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
            { label: 'OTHERS', value: otherCount, sub: 'Other roles', iconBg: 'rgba(100,116,139,0.1)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg> },
          ].map(card => (
            <div key={card.label} className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div className="stat-card-label">{card.label}</div>
                <div style={{ width: 36, height: 36, borderRadius: 9, background: card.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {card.icon}
                </div>
              </div>
              <div className="stat-card-value">{card.value}</div>
              <div className="stat-card-sub">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Table header */}
        <div className="section-bar" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0 }}>Team Members</h2>
            <input
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="Search members…"
              style={{ height: 34, fontSize: 13, padding: '0 12px', borderRadius: 6, border: '1px solid var(--c5)', width: 220, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>
          <button className="btn btn-primary btn-sm" onClick={openInvite}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add
          </button>
        </div>

        {/* Members table */}
        <div className="card">
          {resourceStore.loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--c4)' }}>Loading…</div>
          ) : members.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--c4)', fontSize: 13 }}>
              No team members yet. Click Add to get started.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>TEAM</th>
                  <th>ROLE</th>
                  <th>SKILLS</th>
                  <th style={{ width: 100 }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {members.filter(m => !memberSearch.trim() || m.name.toLowerCase().includes(memberSearch.toLowerCase()) || (m.role ?? '').toLowerCase().includes(memberSearch.toLowerCase())).map(m => (
                  <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/team/${m.id}`)}>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.team?.color ?? 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <Link to={`/team/${m.id}`} style={{ fontWeight: 600, fontSize: 13, color: 'var(--c0)', textDecoration: 'none' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--navy)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--c0)')}>
                            {m.name}
                          </Link>
                          {m.email && <div style={{ fontSize: 11, color: 'var(--c4)' }}>{m.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {m.team
                        ? <span className="badge badge-blue" style={{ background: `${m.team.color ?? 'var(--navy)'}20`, color: m.team.color ?? 'var(--navy)', border: `1px solid ${m.team.color ?? 'var(--navy)'}40` }}>{m.team.name}</span>
                        : <span style={{ color: 'var(--c4)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--c2)' }}>{m.role || <span style={{ color: 'var(--c4)' }}>—</span>}</td>
                    <td>
                      {m.skills
                        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {m.skills.split(',').slice(0, 3).map(s => (
                              <span key={s} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'var(--c7)', color: 'var(--c2)', fontWeight: 500 }}>{s.trim()}</span>
                            ))}
                            {m.skills.split(',').length > 3 && (
                              <span style={{ fontSize: 11, color: 'var(--c4)' }}>+{m.skills.split(',').length - 3}</span>
                            )}
                          </div>
                        : <span style={{ color: 'var(--c4)', fontSize: 13 }}>—</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Link to={`/team/${m.id}`} className="btn btn-secondary btn-xs" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>View</Link>
                        <button className="btn btn-secondary btn-xs" onClick={() => openEdit(m)}>Edit</button>
                        <button className="btn btn-ghost btn-xs" style={{ color: 'var(--red)' }} onClick={() => setDeleteTarget(m)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* ── Invite / Edit modal ── */}
      {showMemberModal && (
        <Modal title={editTarget ? 'Edit Member' : 'Add Member'} onClose={() => setShowMemberModal(false)}>
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Name</label>
              <input autoFocus value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ana Novak" />
            </div>
            <div className="form-group">
              <label className="form-label">Email <span style={{ fontWeight: 400, color: 'var(--c4)' }}>optional</span></label>
              <input type="email" value={memberForm.email} onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))} placeholder="ana@agency.si" />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Team</label>
              <Select
                value={memberForm.team_id}
                onChange={val => setMemberForm(f => ({ ...f, team_id: val }))}
                options={[{ value: '', label: '— No team —' }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <input value={memberForm.role} onChange={e => setMemberForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Senior Designer" />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Skills <span style={{ fontWeight: 400, color: 'var(--c4)' }}>comma-separated</span></label>
            <input value={memberForm.skills} onChange={e => setMemberForm(f => ({ ...f, skills: e.target.value }))} placeholder="e.g. Figma, UI/UX, Prototyping" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowMemberModal(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveMember} disabled={memberSaving || !memberForm.name.trim()}>
              {memberSaving ? 'Saving…' : editTarget ? 'Save changes' : 'Add member'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Edit Holiday modal ── */}
      {editHolidayTarget && (
        <Modal title="Edit Holiday" onClose={() => setEditHolidayTarget(null)}>
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Holiday Name</label>
              <input autoFocus value={editHolidayForm.name} onChange={e => setEditHolidayForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input type="date" value={editHolidayForm.date} onChange={e => setEditHolidayForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Type</label>
              <Select value={editHolidayForm.type} onChange={val => setEditHolidayForm(f => ({ ...f, type: val as 'public_holiday' | 'company_shutdown' }))} options={[{ value: 'public_holiday', label: 'Public Holiday' }, { value: 'company_shutdown', label: 'Company Shutdown' }]} />
            </div>
            <div className="form-group">
              <label className="form-label">Recurrence</label>
              <Select value={editHolidayForm.recurrence} onChange={val => setEditHolidayForm(f => ({ ...f, recurrence: val as 'none' | 'yearly' }))} options={[{ value: 'none', label: 'Once' }, { value: 'yearly', label: 'Yearly' }]} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditHolidayTarget(null)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={saveEditHoliday} disabled={editHolidaySaving || !editHolidayForm.name.trim() || !editHolidayForm.date}>
              {editHolidaySaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Delete confirm ── */}
      {confirmHolidayDelete && (
        <Modal title="Remove holiday" onClose={() => setConfirmHolidayDelete(null)}>
          <p style={{ margin: '0 0 20px', fontSize: 14 }}>Remove <strong>{confirmHolidayDelete.name}</strong>? This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirmHolidayDelete(null)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }} onClick={confirmHolidayDeleteFn}>Remove</button>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Remove member" onClose={() => setDeleteTarget(null)}>
          <p style={{ margin: '0 0 20px', fontSize: 14 }}>Remove <strong>{deleteTarget.name}</strong> from the team? This cannot be undone.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn btn-sm" style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }} onClick={confirmDelete}>Remove</button>
          </div>
        </Modal>
      )}

      {/* ── Page header with tabs ── */}
      <div className="page-header" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 0, paddingBottom: 0 }}>
        <div style={{ paddingBottom: 16, width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1>Settings Command Center</h1>
            <p>Global configuration and administrative controls for Agency Intelligence.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--c6)', width: '100%', marginLeft: -28, paddingLeft: 28, marginRight: -28 }}>
          {(['general', 'team', 'holidays'] as SettingsTab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid var(--navy)' : '2px solid transparent', cursor: 'pointer', padding: '10px 16px', fontFamily: 'inherit', fontWeight: 600, fontSize: 13, color: activeTab === tab ? 'var(--navy)' : 'var(--c3)', transition: 'color .12s', whiteSpace: 'nowrap', marginBottom: -1, textTransform: 'capitalize' }}>
              {tab === 'general' ? 'General' : tab === 'team' ? 'Team' : 'Holidays'}
            </button>
          ))}
        </div>
      </div>

      <div className="page-content">
        {activeTab === 'general' && renderGeneral()}
        {activeTab === 'team' && renderTeam()}
        {activeTab === 'holidays' && renderHolidays()}
      </div>
    </div>
  )
}
