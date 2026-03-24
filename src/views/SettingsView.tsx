import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import type { CompanyHoliday, TeamMember } from '../lib/types'
import { useSettingsStore } from '../stores/settings'
import { useResourceStore } from '../stores/resource'
import { useHolidayStore } from '../stores/holidays'
import { useEmailIntakeStore } from '../stores/emailIntake'
import { useMaintenancesStore } from '../stores/maintenances'
import { toast } from '../lib/toast'
import { Select } from '../components/Select'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

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
  overhead_meetings_month: number; overhead_sales_month: number; vacation_days_year: number
}
const EMPTY_FORM: MemberForm = { name: '', email: '', team_id: '', role: '', skills: '', overhead_meetings_month: 0, overhead_sales_month: 0, vacation_days_year: 0 }

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
  const intakeStore = useEmailIntakeStore()
  const maintenancesStore = useMaintenancesStore()
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
  const [internalRate, setInternalRate] = useState(String(settingsStore.internalHourlyRate || ''))
  const [cmsInput, setCmsInput] = useState('')
  const [cmsSaving, setCmsSaving] = useState(false)

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

  // ── Jira Integration ─────────────────────────────────────────────────────
  const [jiraBaseUrlLocal, setJiraBaseUrlLocal] = useState(settingsStore.jiraBaseUrl)
  const [jiraUserEmailLocal, setJiraUserEmailLocal] = useState(settingsStore.jiraUserEmail)
  const [jiraApiTokenLocal, setJiraApiTokenLocal] = useState(settingsStore.jiraApiToken)
  const [testingJira, setTestingJira] = useState(false)
  const [jiraTestResult, setJiraTestResult] = useState<'ok' | 'fail' | null>(null)

  // ── Email Intake ──────────────────────────────────────────────────────────
  const [intakeForm, setIntakeForm] = useState({
    sender_domain: '', keyword: '', maintenance_id: '', default_issue_type: 'Bug'
  })

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
    intakeStore.fetchAll()
    maintenancesStore.fetchAll()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setInternalRate(String(settingsStore.internalHourlyRate || '')) }, [settingsStore.internalHourlyRate])

  useEffect(() => {
    setJiraBaseUrlLocal(settingsStore.jiraBaseUrl)
    setJiraUserEmailLocal(settingsStore.jiraUserEmail)
    setJiraApiTokenLocal(settingsStore.jiraApiToken)
  }, [settingsStore.jiraBaseUrl, settingsStore.jiraUserEmail, settingsStore.jiraApiToken])

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
      await settingsStore.setInternalHourlyRate(parseFloat(internalRate) || 0)
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

  async function addCms() {
    const name = cmsInput.trim()
    if (!name || settingsStore.cmsOptions.includes(name)) return
    setCmsSaving(true)
    try {
      await settingsStore.setCmsOptions([...settingsStore.cmsOptions, name])
      setCmsInput(''); toast('success', `${name} added`)
    } catch { toast('error', 'Failed') }
    finally { setCmsSaving(false) }
  }

  async function removeCms(name: string) {
    setCmsSaving(true)
    try { await settingsStore.setCmsOptions(settingsStore.cmsOptions.filter(c => c !== name)) }
    catch { toast('error', 'Failed') }
    finally { setCmsSaving(false) }
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

  async function handleTestJira() {
    setTestingJira(true)
    setJiraTestResult(null)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/jira-proxy`, {
        method: 'POST',
        headers: fnHeaders(),
        body: JSON.stringify({ action: 'ping' }),
      })
      const data = await res.json()
      setJiraTestResult(data?.error ? 'fail' : 'ok')
    } catch {
      setJiraTestResult('fail')
    } finally {
      setTestingJira(false)
    }
  }

  async function handleAddIntakeRule() {
    try {
      await intakeStore.add({
        maintenance_id: intakeForm.maintenance_id,
        sender_domain: intakeForm.sender_domain.trim() || null,
        keyword: intakeForm.keyword.trim() || null,
        default_issue_type: intakeForm.default_issue_type.trim() || 'Bug',
      })
      setIntakeForm({ sender_domain: '', keyword: '', maintenance_id: '', default_issue_type: 'Bug' })
      toast('success', 'Rule added')
    } catch {
      toast('error', 'Failed to add rule')
    }
  }

  function openInvite() {
    setEditTarget(null); setMemberForm({ ...EMPTY_FORM }); setShowMemberModal(true)
  }

  function openEdit(m: TeamMember) {
    setEditTarget(m)
    setMemberForm({ name: m.name, email: m.email ?? '', team_id: m.team_id ?? '', role: m.role ?? '', skills: m.skills ?? '', overhead_meetings_month: m.overhead_meetings_month ?? 0, overhead_sales_month: m.overhead_sales_month ?? 0, vacation_days_year: m.vacation_days_year ?? 0 })
    setShowMemberModal(true)
  }

  async function saveMember() {
    if (!memberForm.name.trim()) return
    setMemberSaving(true)
    try {
      const overheadPayload = {
        overhead_meetings_month: memberForm.overhead_meetings_month || null,
        overhead_sales_month: memberForm.overhead_sales_month || null,
        vacation_days_year: memberForm.vacation_days_year || null,
      }
      if (editTarget) {
        await resourceStore.updateMember(editTarget.id, {
          name: memberForm.name.trim(),
          email: memberForm.email || null,
          team_id: memberForm.team_id || null,
          role: memberForm.role || null,
          skills: memberForm.skills || null,
          ...overheadPayload,
        })
        toast('success', 'Member updated')
      } else {
        await resourceStore.addMember({
          name: memberForm.name.trim(),
          email: memberForm.email || undefined,
          team_id: memberForm.team_id || null,
          role: memberForm.role || undefined,
          skills: memberForm.skills || undefined,
          ...overheadPayload,
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
      <div className="flex flex-col gap-4">
        {/* Top row: General Info | Team summary */}
        <div className="grid gap-4 items-start [grid-template-columns:1fr_260px]">

          {/* General Information */}
          <Card>
            <CardContent className="px-6 py-5">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[rgba(99,102,241,0.1)] flex items-center justify-center">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                  </div>
                  <span className="font-bold text-[15px] text-foreground">General Information</span>
                </div>
                {!editingGeneral && (
                  <Button variant="outline" size="sm" onClick={() => setEditingGeneral(true)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </Button>
                )}
              </div>

              {editingGeneral ? (
                <>
                  <div className="mb-4">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">AGENCY NAME</label>
                    <input autoFocus value={agencyInput} onChange={e => setAgencyInput(e.target.value)} placeholder="e.g. Renderspace d.o.o." onKeyDown={e => e.key === 'Enter' && saveGeneral()} />
                  </div>

                  <div className="mb-6">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">AGENCY LOGO</label>
                    <div className="flex items-center gap-3.5">
                      <div className="w-16 h-16 border-2 border-dashed border-border rounded-[10px] flex items-center justify-center shrink-0 overflow-hidden bg-[var(--c7)]">
                        {logoInput
                          ? <img src={logoInput} alt="Logo" className="w-full h-full object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
                          : <span className="text-[9px] text-muted-foreground text-center leading-[1.4] font-semibold">AGENCY<br/>LOGO</span>
                        }
                      </div>
                      <div className="flex-1 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer px-3.5 py-2 rounded-lg border border-border bg-white text-[13px] font-semibold text-foreground">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                            Upload image
                            <input type="file" accept="image/*" className="hidden" onChange={e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              const reader = new FileReader()
                              reader.onload = ev => setLogoInput(ev.target?.result as string)
                              reader.readAsDataURL(file)
                            }} />
                          </label>
                          {logoInput && (
                            <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setLogoInput('')}>Remove logo</Button>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">PNG, SVG or JPG · max 512×512px recommended</div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">
                      Internal cost / hour (€)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={internalRate}
                      onChange={e => setInternalRate(e.target.value)}
                      placeholder="0"
                      style={{ maxWidth: 140 }}
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveGeneral} disabled={agencySaving}>
                      {agencySaving ? 'Saving…' : 'Save Configuration'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={cancelGeneral}>Cancel</Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1.5">AGENCY NAME</div>
                    <div className="text-sm font-semibold text-foreground">
                      {settingsStore.agencyName || <span className="text-muted-foreground font-normal">Not set</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-2">AGENCY LOGO</div>
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 border border-border rounded-[10px] flex items-center justify-center overflow-hidden bg-[var(--c7)] shrink-0">
                        {settingsStore.agencyLogo
                          ? <img src={settingsStore.agencyLogo} alt="Logo" className="w-full h-full object-contain" />
                          : <span className="text-[9px] text-muted-foreground text-center leading-[1.4] font-semibold">AGENCY<br/>LOGO</span>
                        }
                      </div>
                      {settingsStore.agencyLogo
                        ? <span className="text-[13px] text-[#16a34a] font-medium flex items-center gap-1.5">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                            Logo uploaded
                          </span>
                        : <span className="text-[13px] text-muted-foreground">No logo set</span>
                      }
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team & Workspace dark card */}
          <div className="bg-primary rounded-xl px-[22px] py-5 text-white">
            <div className="flex items-center gap-2 mb-1">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              <span className="font-bold text-[15px]">Team &amp; Workspace</span>
            </div>
            <p className="text-xs text-white/40 mb-4 leading-relaxed">
              Manage your core team across disciplines.
            </p>
            <div className="border-t border-white/[0.08] pt-4 mb-4">
              {[
                { label: 'Total Members', value: members.length },
                { label: 'UX/UI', value: uxuiCount },
                { label: 'Development', value: devCount },
                { label: 'Content', value: contentCount },
                { label: 'Others', value: otherCount },
              ].map(row => (
                <div key={row.label} className="flex justify-between mb-2.5 text-[13px]">
                  <span className="text-white/50">{row.label}</span>
                  <span className="font-bold">{row.value}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setActiveTab('team')}
              className="w-full bg-[#6366f1] border-none rounded-lg py-2.5 text-white font-bold text-[13px] cursor-pointer"
            >
              Manage Team →
            </button>
          </div>
        </div>

        {/* Project Managers + CMS side by side */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="px-6 py-5">
              <div className="font-bold text-[15px] text-foreground mb-0.5">Project Managers</div>
              <div className="text-[13px] text-muted-foreground mb-4">People available as PMs in project forms.</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {settingsStore.projectManagers.map(name => (
                  <div key={name} className="flex items-center gap-1.5 bg-[var(--c7)] rounded border border-border px-2.5 py-1 text-[13px] text-foreground">
                    <span>{name}</span>
                    <button onClick={() => removePM(name)} disabled={pmSaving}
                      className="bg-transparent border-none cursor-pointer text-muted-foreground text-[15px] leading-none p-0 hover:text-[#dc2626]">×</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={pmInput} onChange={e => setPmInput(e.target.value)} placeholder="Add name…"
                  onKeyDown={e => e.key === 'Enter' && addPM()} className="flex-1" />
                <Button size="sm" onClick={addPM} disabled={pmSaving || !pmInput.trim()}>Add</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="px-6 py-5">
              <div className="font-bold text-[15px] text-foreground mb-0.5">CMS / Technology</div>
              <div className="text-[13px] text-muted-foreground mb-4">Options available when adding projects or maintenances.</div>
              <div className="flex flex-wrap gap-2 mb-4">
                {settingsStore.cmsOptions.map(name => (
                  <div key={name} className="flex items-center gap-1.5 bg-[var(--c7)] rounded border border-border px-2.5 py-1 text-[13px] text-foreground">
                    <span>{name}</span>
                    <button onClick={() => removeCms(name)} disabled={cmsSaving}
                      className="bg-transparent border-none cursor-pointer text-muted-foreground text-[15px] leading-none p-0 hover:text-[#dc2626]">×</button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={cmsInput} onChange={e => setCmsInput(e.target.value)} placeholder="Add CMS…"
                  onKeyDown={e => e.key === 'Enter' && addCms()} className="flex-1" />
                <Button size="sm" onClick={addCms} disabled={cmsSaving || !cmsInput.trim()}>Add</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Telegram */}
        <Card>
          <CardContent className="px-6 py-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-[10px] bg-[#e8f2ff] text-[#229ED9] flex items-center justify-center">
                <TelegramIcon />
              </div>
              <div>
                <div className="font-bold text-[15px] text-foreground">Telegram Bot</div>
                <div className="text-xs text-muted-foreground">@nino_personal_bot — natural language worker</div>
              </div>
              {linked !== null && (
                <Badge variant={linked ? 'green' : 'gray'} className="ml-auto">
                  {linked ? 'Connected' : 'Not connected'}
                </Badge>
              )}
            </div>

            {linked === null && <div className="text-[13px] text-muted-foreground">Checking status…</div>}

            {linked === false && (
              <div>
                <p className="text-[13px] text-muted-foreground mb-4 leading-relaxed">
                  Connect your Telegram account to use the bot. Generate a link code below, then send it to the bot.
                </p>
                {!linkCode ? (
                  <Button size="sm" onClick={generateCode} disabled={tgLoading}>
                    {tgLoading ? 'Generating…' : 'Generate link code'}
                  </Button>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="bg-[var(--c7)] rounded-lg px-[18px] py-3.5 flex items-center justify-between">
                      <code className="text-[15px] font-bold tracking-wide text-foreground">/start {linkCode}</code>
                      <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(`/start ${linkCode}`)}>Copy</Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Open <strong>@nino_personal_bot</strong> in Telegram and send this message.
                      Expires in <strong className={codeExpiry < 60 ? 'text-[#dc2626]' : 'text-[#374151]'}>{expiryLabel}</strong>.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={generateCode} disabled={tgLoading}>Regenerate</Button>
                      <Button variant="outline" size="sm" onClick={checkTgStatus}>Check status</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {linked === true && (
              <div>
                <div className="bg-[var(--c7)] rounded-lg px-4 py-3 flex items-center justify-between mb-4">
                  <div>
                    <div className="text-[13px] font-semibold text-foreground">Bot connected</div>
                    {linkedAt && <div className="text-xs text-muted-foreground">Since {new Date(linkedAt).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}</div>}
                  </div>
                  <div className="text-[#22c55e] text-xl">✓</div>
                </div>
                <p className="text-[13px] text-muted-foreground mb-3.5 leading-relaxed">
                  Open <strong>@nino_personal_bot</strong> in Telegram and start chatting.
                </p>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {['list active projects', 'show planned invoices', 'create project for Acme, fixed 5000€', 'issue March invoice for Acme'].map(ex => (
                    <span key={ex} className="bg-[var(--c7)] rounded-full px-2.5 py-1 text-xs text-[#374151] italic">"{ex}"</span>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="text-[#dc2626] border-[#dc2626] hover:text-[#dc2626]" onClick={revokeBot} disabled={revoking}>
                  {revoking ? 'Disconnecting…' : 'Disconnect bot'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Jira Integration ──────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="font-bold text-[15px] text-foreground">Jira Integration</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Jira Base URL</label>
                <input
                  value={jiraBaseUrlLocal}
                  onChange={e => setJiraBaseUrlLocal(e.target.value)}
                  onBlur={e => settingsStore.setJiraBaseUrl(e.target.value)}
                  placeholder="https://yourcompany.atlassian.net"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Jira User Email</label>
                <input
                  value={jiraUserEmailLocal}
                  onChange={e => setJiraUserEmailLocal(e.target.value)}
                  onBlur={e => settingsStore.setJiraUserEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Jira API Token</label>
              <input
                type="password"
                value={jiraApiTokenLocal}
                onChange={e => setJiraApiTokenLocal(e.target.value)}
                onBlur={e => settingsStore.setJiraApiToken(e.target.value)}
                placeholder="••••••••••••••••"
              />
              <p className="text-xs text-muted-foreground mt-1">Generate at id.atlassian.net → Security → API tokens</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleTestJira} disabled={testingJira}>
                {testingJira ? 'Testing…' : 'Test connection'}
              </Button>
              {jiraTestResult === 'ok' && <span className="text-xs text-green-600 font-medium">Connected ✓</span>}
              {jiraTestResult === 'fail' && <span className="text-xs text-red-600 font-medium">Failed — check credentials</span>}
            </div>
          </CardContent>
        </Card>

        {/* ── Email Intake ──────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h2 className="mb-3">Email Intake</h2>
          <Card>
            <CardContent className="p-5">
              <p className="text-[13px] text-muted-foreground mb-4">
                Forward client emails to your intake webhook URL. Rules below map sender domains or keywords to maintenance contracts.
              </p>

              {intakeStore.rules.length === 0 ? (
                <p className="text-xs text-muted-foreground mb-3">No rules yet.</p>
              ) : (
                <table className="mb-4">
                  <thead>
                    <tr>
                      <th>SENDER DOMAIN</th>
                      <th>KEYWORD</th>
                      <th>MAINTENANCE</th>
                      <th>ISSUE TYPE</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {intakeStore.rules.map(rule => (
                      <tr key={rule.id}>
                        <td className="text-[13px]">{rule.sender_domain ?? '—'}</td>
                        <td className="text-[13px]">{rule.keyword ?? '—'}</td>
                        <td className="text-[13px]">{rule.maintenance?.name ?? '—'}</td>
                        <td className="text-[13px]">{rule.default_issue_type}</td>
                        <td>
                          <Button variant="destructive" size="xs" onClick={() => intakeStore.remove(rule.id)}>
                            Remove
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="border-t border-border pt-4">
                <div className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Add rule</div>
                <div className="grid grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Sender domain</label>
                    <input value={intakeForm.sender_domain} onChange={e => setIntakeForm(f => ({ ...f, sender_domain: e.target.value }))} placeholder="pirnar.si" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Keyword (fallback)</label>
                    <input value={intakeForm.keyword} onChange={e => setIntakeForm(f => ({ ...f, keyword: e.target.value }))} placeholder="pirnar" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Maintenance</label>
                    <Select
                      value={intakeForm.maintenance_id}
                      onChange={v => setIntakeForm(f => ({ ...f, maintenance_id: v }))}
                      placeholder="Select…"
                      options={maintenancesStore.maintenances.map(m => ({ value: m.id, label: m.name }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Default issue type</label>
                    <input value={intakeForm.default_issue_type} onChange={e => setIntakeForm(f => ({ ...f, default_issue_type: e.target.value }))} placeholder="Bug" />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleAddIntakeRule}
                  disabled={!intakeForm.maintenance_id || (!intakeForm.sender_domain && !intakeForm.keyword)}
                >
                  Add rule
                </Button>
              </div>
            </CardContent>
          </Card>
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
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFilterYear(y => y - 1)}>‹</Button>
            <span className="font-bold text-sm min-w-[40px] text-center">{filterYear}</span>
            <Button variant="ghost" size="sm" onClick={() => setFilterYear(y => y + 1)}>›</Button>
          </div>
          <Button size="sm" onClick={() => setShowHolidayForm(v => !v)}>
            {showHolidayForm ? 'Cancel' : '+ Add Holiday'}
          </Button>
        </div>

        {showHolidayForm && (
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-4 mb-3.5">
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Holiday Name</label>
                  <input autoFocus value={holidayForm.name} onChange={e => setHolidayForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Christmas Day" />
                </div>
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Date</label>
                  <input type="date" value={holidayForm.date} onChange={e => setHolidayForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-3.5">
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Type</label>
                  <Select
                    value={holidayForm.type}
                    onChange={val => setHolidayForm(f => ({ ...f, type: val as 'public_holiday' | 'company_shutdown' }))}
                    options={[
                      { value: 'public_holiday', label: 'Public Holiday' },
                      { value: 'company_shutdown', label: 'Company Shutdown' },
                    ]}
                  />
                </div>
                <div className="mb-4">
                  <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Recurrence</label>
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
              <div className="mb-4">
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-2">Applies To</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setHolidayForm(f => ({ ...f, applies_to: [] }))}
                    className={`px-3.5 py-1 rounded-full border-[1.5px] text-[13px] font-semibold cursor-pointer ${holidayForm.applies_to.length === 0 ? 'border-primary bg-primary text-white' : 'border-border bg-white text-[#374151]'}`}
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
                          borderColor: selected ? t.color : undefined,
                          background: selected ? t.color + '22' : undefined,
                          color: selected ? t.color : undefined,
                        }}
                        className={`px-3.5 py-1 rounded-full border-[1.5px] text-[13px] font-semibold cursor-pointer ${!selected ? 'border-border bg-white text-[#374151]' : ''}`}
                      >{t.name}</button>
                    )
                  })}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowHolidayForm(false)}>Cancel</Button>
                <Button size="sm" onClick={saveHoliday} disabled={holidaySaving || !holidayForm.name.trim() || !holidayForm.date}>
                  {holidaySaving ? 'Saving…' : 'Save Holiday'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          {holidayStore.loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : visibleHolidays.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-[13px]">
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
                  <th className="w-[130px]">ACTIONS</th>
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
                      <td className="text-[13px]">{displayDate}</td>
                      <td className="font-semibold">{h.name}</td>
                      <td>
                        <Badge variant={h.type === 'public_holiday' ? 'blue' : 'amber'}>
                          {h.type === 'public_holiday' ? 'Public Holiday' : 'Company Shutdown'}
                        </Badge>
                      </td>
                      <td className="text-[13px] text-[#374151]">{h.recurrence === 'yearly' ? 'Yearly' : 'Once'}</td>
                      <td className="text-[13px] text-[#374151]">{teamLabels}</td>
                      <td>
                        <div className="flex gap-1.5">
                          <Button variant="outline" size="xs" onClick={() => openEditHoliday(h)}>Edit</Button>
                          <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => deleteHoliday(h.id, h.name)}>Remove</Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    )
  }

  function renderTeam() {
    return (
      <div className="flex flex-col gap-4">
        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'TOTAL MEMBERS', value: members.length, sub: 'All active', iconBg: 'rgba(99,102,241,0.1)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
            { label: 'UX/UI', value: uxuiCount, sub: 'Design & UX', iconBg: 'rgba(245,158,11,0.1)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg> },
            { label: 'DEVELOPMENT', value: devCount, sub: 'Engineers', iconBg: 'rgba(59,130,246,0.1)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> },
            { label: 'CONTENT', value: contentCount, sub: 'Writers & editors', iconBg: 'rgba(16,185,129,0.1)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },
            { label: 'OTHERS', value: otherCount, sub: 'Other roles', iconBg: 'rgba(100,116,139,0.1)', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg> },
          ].map(card => (
            <div key={card.label} className="bg-white rounded-[10px] border border-[#e8e3ea] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[18px_20px] flex flex-col">
              <div className="flex justify-between items-start mb-3">
                <div className="text-[10px] text-[#64748b] font-bold uppercase tracking-[.09em] mb-2">{card.label}</div>
                <div className="w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: card.iconBg }}>
                  {card.icon}
                </div>
              </div>
              <div className="text-[28px] font-extrabold tracking-[-0.5px] mb-2 text-foreground">{card.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{card.sub}</div>
            </div>
          ))}
        </div>

        {/* Table header */}
        <div className="flex items-center justify-between mb-0">
          <div className="flex items-center gap-3">
            <h2 className="m-0 whitespace-nowrap">Team Members</h2>
            <input
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="Search members…"
              className="h-[34px] text-[13px] px-3 rounded border border-border w-[220px]"
            />
          </div>
          <Button size="sm" onClick={openInvite}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add
          </Button>
        </div>

        {/* Members table */}
        <Card>
          {resourceStore.loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading…</div>
          ) : members.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-[13px]">
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
                  <th className="w-[100px]">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {members.filter(m => !memberSearch.trim() || m.name.toLowerCase().includes(memberSearch.toLowerCase()) || (m.role ?? '').toLowerCase().includes(memberSearch.toLowerCase())).map(m => (
                  <tr key={m.id} className="cursor-pointer" onClick={() => navigate(`/team/${m.id}`)}>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: m.team?.color ?? 'var(--navy)' }}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <Link to={`/team/${m.id}`} className="font-semibold text-[13px] text-foreground no-underline hover:text-primary">
                            {m.name}
                          </Link>
                          {m.email && <div className="text-[11px] text-muted-foreground">{m.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      {m.team
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border" style={{ background: `${m.team.color ?? 'var(--navy)'}20`, color: m.team.color ?? 'var(--navy)', borderColor: `${m.team.color ?? 'var(--navy)'}40` }}>{m.team.name}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="text-[13px] text-[#374151]">{m.role || <span className="text-muted-foreground">—</span>}</td>
                    <td>
                      {m.skills
                        ? <div className="flex flex-wrap gap-1">
                            {m.skills.split(',').slice(0, 3).map(s => (
                              <span key={s} className="text-[11px] px-[7px] py-px rounded bg-[var(--c7)] text-[#374151] font-medium">{s.trim()}</span>
                            ))}
                            {m.skills.split(',').length > 3 && (
                              <span className="text-[11px] text-muted-foreground">+{m.skills.split(',').length - 3}</span>
                            )}
                          </div>
                        : <span className="text-muted-foreground text-[13px]">—</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1.5">
                        <Link to={`/team/${m.id}`} className="inline-flex items-center no-underline"><Button variant="outline" size="xs" asChild><span>View</span></Button></Link>
                        <Button variant="outline" size="xs" onClick={() => openEdit(m)}>Edit</Button>
                        <Button variant="ghost" size="xs" className="text-[#dc2626]" onClick={() => setDeleteTarget(m)}>Remove</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div>
      {/* ── Invite / Edit modal ── */}
      {showMemberModal && (
        <Modal title={editTarget ? 'Edit Member' : 'Add Member'} onClose={() => setShowMemberModal(false)}>
          <div className="grid grid-cols-2 gap-4 mb-3.5">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Name</label>
              <input autoFocus value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Ana Novak" />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Email <span className="font-normal text-muted-foreground">optional</span></label>
              <input type="email" value={memberForm.email} onChange={e => setMemberForm(f => ({ ...f, email: e.target.value }))} placeholder="ana@agency.si" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-3.5">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Team</label>
              <Select
                value={memberForm.team_id}
                onChange={val => setMemberForm(f => ({ ...f, team_id: val }))}
                options={[{ value: '', label: '— No team —' }, ...teams.map(t => ({ value: t.id, label: t.name }))]}
              />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Role</label>
              <input value={memberForm.role} onChange={e => setMemberForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Senior Designer" />
            </div>
          </div>
          <div className="mb-3.5">
            <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Skills <span className="font-normal text-muted-foreground">comma-separated</span></label>
            <input value={memberForm.skills} onChange={e => setMemberForm(f => ({ ...f, skills: e.target.value }))} placeholder="e.g. Figma, UI/UX, Prototyping" />
          </div>
          <div className="border-t border-border pt-4 mb-5">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Capacity Overhead</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Meetings <span className="font-normal normal-case">h/mo</span></label>
                <input type="number" value={memberForm.overhead_meetings_month} onChange={e => setMemberForm(f => ({ ...f, overhead_meetings_month: Number(e.target.value) }))} min={0} step={1} />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Sales <span className="font-normal normal-case">h/mo</span></label>
                <input type="number" value={memberForm.overhead_sales_month} onChange={e => setMemberForm(f => ({ ...f, overhead_sales_month: Number(e.target.value) }))} min={0} step={1} />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Vacation <span className="font-normal normal-case">days/yr</span></label>
                <input type="number" value={memberForm.vacation_days_year} onChange={e => setMemberForm(f => ({ ...f, vacation_days_year: Number(e.target.value) }))} min={0} step={1} />
              </div>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowMemberModal(false)}>Cancel</Button>
            <Button size="sm" onClick={saveMember} disabled={memberSaving || !memberForm.name.trim()}>
              {memberSaving ? 'Saving…' : editTarget ? 'Save changes' : 'Add member'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Edit Holiday modal ── */}
      {editHolidayTarget && (
        <Modal title="Edit Holiday" onClose={() => setEditHolidayTarget(null)}>
          <div className="grid grid-cols-2 gap-4 mb-3.5">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Holiday Name</label>
              <input autoFocus value={editHolidayForm.name} onChange={e => setEditHolidayForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Date</label>
              <input type="date" value={editHolidayForm.date} onChange={e => setEditHolidayForm(f => ({ ...f, date: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-3.5">
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Type</label>
              <Select value={editHolidayForm.type} onChange={val => setEditHolidayForm(f => ({ ...f, type: val as 'public_holiday' | 'company_shutdown' }))} options={[{ value: 'public_holiday', label: 'Public Holiday' }, { value: 'company_shutdown', label: 'Company Shutdown' }]} />
            </div>
            <div className="mb-4">
              <label className="text-xs uppercase tracking-wide text-muted-foreground font-medium block mb-1">Recurrence</label>
              <Select value={editHolidayForm.recurrence} onChange={val => setEditHolidayForm(f => ({ ...f, recurrence: val as 'none' | 'yearly' }))} options={[{ value: 'none', label: 'Once' }, { value: 'yearly', label: 'Yearly' }]} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setEditHolidayTarget(null)}>Cancel</Button>
            <Button size="sm" onClick={saveEditHoliday} disabled={editHolidaySaving || !editHolidayForm.name.trim() || !editHolidayForm.date}>
              {editHolidaySaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Delete confirm dialogs ── */}
      <ConfirmDialog
        open={!!confirmHolidayDelete}
        title="Remove holiday"
        message={confirmHolidayDelete ? `Remove "${confirmHolidayDelete.name}"? This cannot be undone.` : ''}
        confirmLabel="Remove"
        onConfirm={confirmHolidayDeleteFn}
        onCancel={() => setConfirmHolidayDelete(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove member"
        message={deleteTarget ? `Remove ${deleteTarget.name} from the team? This cannot be undone.` : ''}
        confirmLabel="Remove"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── Page header with tabs ── */}
      <div className="flex items-start flex-col gap-0 px-6 py-4 bg-background border-b border-border pb-0">
        <div className="pb-4 w-full flex items-start justify-between">
          <div>
            <h1>Settings Command Center</h1>
            <p>Global configuration and administrative controls for Agency Intelligence.</p>
          </div>
        </div>
        <div className="flex gap-0 border-t border-border w-full -mx-6 px-6">
          {(['general', 'team', 'holidays'] as SettingsTab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`bg-transparent border-0 cursor-pointer px-4 py-2.5 font-semibold text-[13px] whitespace-nowrap -mb-px capitalize transition-colors ${activeTab === tab ? 'border-b-2 border-primary text-primary' : 'border-b-2 border-transparent text-muted-foreground'}`}>
              {tab === 'general' ? 'General' : tab === 'team' ? 'Team' : 'Holidays'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'general' && renderGeneral()}
        {activeTab === 'team' && renderTeam()}
        {activeTab === 'holidays' && renderHolidays()}
      </div>
    </div>
  )
}
