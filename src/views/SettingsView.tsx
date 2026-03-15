import { useState, useEffect, useCallback } from 'react'
import { useSettingsStore } from '../stores/settings'
import { toast } from '../lib/toast'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL?.replace('.supabase.co', '.supabase.co/functions/v1')
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function fnHeaders() {
  return { 'Authorization': `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' }
}

// ── Telegram icon ─────────────────────────────────────────────────────────────

function TelegramIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/>
    </svg>
  )
}

// ── Settings view ─────────────────────────────────────────────────────────────

export function SettingsView() {
  const settingsStore = useSettingsStore()
  const [agencyInput, setAgencyInput] = useState('')
  const [agencySaving, setAgencySaving] = useState(false)
  const [editingAgency, setEditingAgency] = useState(false)

  // ── project managers ──────────────────────────────────────────────────────
  const [pmInput, setPmInput] = useState('')
  const [pmSaving, setPmSaving] = useState(false)

  useEffect(() => {
    settingsStore.fetch().then(() => {
      setAgencyInput(settingsStore.agencyName)
      setEditingAgency(!settingsStore.agencyName)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveAgency() {
    setAgencySaving(true)
    try {
      await settingsStore.setAgencyName(agencyInput.trim())
      toast('success', 'Agency name saved')
      setEditingAgency(false)
    } catch {
      toast('error', 'Failed to save')
    } finally {
      setAgencySaving(false)
    }
  }

  async function addPM() {
    const name = pmInput.trim()
    if (!name || settingsStore.projectManagers.includes(name)) return
    setPmSaving(true)
    try {
      await settingsStore.setProjectManagers([...settingsStore.projectManagers, name])
      setPmInput('')
      toast('success', `${name} added`)
    } catch {
      toast('error', 'Failed to save')
    } finally {
      setPmSaving(false)
    }
  }

  async function removePM(name: string) {
    setPmSaving(true)
    try {
      await settingsStore.setProjectManagers(settingsStore.projectManagers.filter(m => m !== name))
      toast('success', `${name} removed`)
    } catch {
      toast('error', 'Failed to save')
    } finally {
      setPmSaving(false)
    }
  }

  const [linked, setLinked] = useState<boolean | null>(null)
  const [linkedAt, setLinkedAt] = useState<string | null>(null)
  const [linkCode, setLinkCode] = useState<string | null>(null)
  const [codeExpiry, setCodeExpiry] = useState<number>(0) // seconds remaining
  const [loading, setLoading] = useState(false)
  const [revoking, setRevoking] = useState(false)

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`${FUNCTIONS_URL}/telegram-link`, {
        method: 'POST',
        headers: fnHeaders(),
      })
      const data = await res.json()
      setLinked(data.linked)
      setLinkedAt(data.linked_at)
    } catch {
      setLinked(false)
    }
  }, [])

  useEffect(() => {
    checkStatus()
  }, [checkStatus])

  // Countdown timer for link code
  useEffect(() => {
    if (!linkCode || codeExpiry <= 0) return
    const t = setInterval(() => {
      setCodeExpiry(s => {
        if (s <= 1) {
          setLinkCode(null)
          clearInterval(t)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [linkCode, codeExpiry])

  async function generateCode() {
    setLoading(true)
    try {
      const res = await fetch(`${FUNCTIONS_URL}/telegram-link`, {
        method: 'GET',
        headers: fnHeaders(),
      })
      const data = await res.json()
      setLinkCode(data.code)
      setCodeExpiry(600) // 10 minutes
    } catch {
      alert('Failed to generate link code. Make sure the Edge Functions are deployed.')
    } finally {
      setLoading(false)
    }
  }

  async function revoke() {
    if (!confirm('Disconnect the Telegram bot from your account?')) return
    setRevoking(true)
    try {
      await fetch(`${FUNCTIONS_URL}/telegram-link`, { method: 'DELETE', headers: fnHeaders() })
      setLinked(false)
      setLinkedAt(null)
      setLinkCode(null)
    } finally {
      setRevoking(false)
    }
  }

  const minutes = Math.floor(codeExpiry / 60)
  const seconds = codeExpiry % 60
  const expiryLabel = `${minutes}:${String(seconds).padStart(2, '0')}`

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>App configuration and integrations</p>
        </div>
      </div>

      <div className="page-content">
        {/* Studio Section */}
        <div className="card" style={{ padding: 24, maxWidth: 560, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c1)', marginBottom: 4 }}>Studio</div>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>Your agency name is used for internal/non-billable domains.</div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Agency name</label>
            {editingAgency ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={agencyInput}
                  onChange={e => setAgencyInput(e.target.value)}
                  placeholder="e.g. Renderspace d.o.o."
                  onKeyDown={e => e.key === 'Enter' && saveAgency()}
                  style={{ flex: 1 }}
                  autoFocus
                />
                <button
                  className="btn btn-primary btn-sm"
                  onClick={saveAgency}
                  disabled={agencySaving || !agencyInput.trim()}
                >
                  {agencySaving ? 'Saving…' : 'Save'}
                </button>
                {settingsStore.agencyName && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setAgencyInput(settingsStore.agencyName); setEditingAgency(false) }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14, color: 'var(--c1)', fontWeight: 500 }}>
                  {settingsStore.agencyName || <span className="text-muted">Not set</span>}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setAgencyInput(settingsStore.agencyName); setEditingAgency(true) }}
                >
                  Edit
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Project Managers Section */}
        <div className="card" style={{ padding: 24, maxWidth: 560, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--c1)', marginBottom: 4 }}>Project Managers</div>
          <div className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>People available as project managers in project forms.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {settingsStore.projectManagers.map(name => (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--c7)', borderRadius: 'var(--r)',
                padding: '5px 10px', fontSize: 13, color: 'var(--c1)',
              }}>
                <span>{name}</span>
                <button
                  onClick={() => removePM(name)}
                  disabled={pmSaving}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c4)', fontSize: 15, lineHeight: 1, padding: 0 }}
                >×</button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={pmInput}
              onChange={e => setPmInput(e.target.value)}
              placeholder="Add name…"
              onKeyDown={e => e.key === 'Enter' && addPM()}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={addPM}
              disabled={pmSaving || !pmInput.trim()}
            >
              Add
            </button>
          </div>
        </div>

        {/* Telegram Bot Section */}
        <div className="card" style={{ padding: 24, maxWidth: 560 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 'var(--r)',
              background: '#e8f2ff', color: '#229ED9',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <TelegramIcon />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--c1)' }}>Telegram Bot</div>
              <div className="text-muted" style={{ fontSize: 13 }}>
                @nino_personal_bot — natural language worker
              </div>
            </div>
            {linked !== null && (
              <span className={`badge ${linked ? 'badge-green' : 'badge-gray'}`} style={{ marginLeft: 'auto' }}>
                {linked ? 'Connected' : 'Not connected'}
              </span>
            )}
          </div>

          {linked === null && (
            <div className="text-muted" style={{ fontSize: 13 }}>Checking status...</div>
          )}

          {linked === false && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--c3)', marginBottom: 16, lineHeight: 1.6 }}>
                Connect your Telegram account to use the bot. Generate a link code below, then send it to the bot.
              </p>

              {!linkCode ? (
                <button className="btn btn-primary" onClick={generateCode} disabled={loading}>
                  {loading ? 'Generating...' : 'Generate link code'}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{
                    background: 'var(--c7)', borderRadius: 'var(--r)',
                    padding: '16px 20px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <code style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1, color: 'var(--c1)', fontFamily: 'monospace' }}>
                      /start {linkCode}
                    </code>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigator.clipboard.writeText(`/start ${linkCode}`)}
                    >
                      Copy
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--c4)' }}>
                    Open <strong>@nino_personal_bot</strong> in Telegram and send this message.
                    Expires in <strong style={{ color: codeExpiry < 60 ? 'var(--red)' : 'var(--c2)' }}>{expiryLabel}</strong>.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={generateCode} disabled={loading}>
                      Regenerate
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={checkStatus}>
                      Check status
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {linked === true && (
            <div>
              <div style={{
                background: 'var(--c7)', borderRadius: 'var(--r)', padding: '12px 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 16,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c1)' }}>Bot connected</div>
                  {linkedAt && (
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      Since {new Date(linkedAt).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  )}
                </div>
                <div style={{ color: '#22c55e', fontSize: 20 }}>✓</div>
              </div>

              <p style={{ fontSize: 13, color: 'var(--c3)', marginBottom: 16, lineHeight: 1.6 }}>
                Open <strong>@nino_personal_bot</strong> in Telegram and start chatting. Try:
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                {[
                  'list active projects',
                  'show planned invoices',
                  'create project for Acme, fixed 5000€',
                  'issue March invoice for Acme',
                ].map(ex => (
                  <span key={ex} style={{
                    background: 'var(--c7)', borderRadius: 20,
                    padding: '4px 10px', fontSize: 12, color: 'var(--c2)',
                    fontStyle: 'italic',
                  }}>
                    "{ex}"
                  </span>
                ))}
              </div>

              <button className="btn btn-secondary btn-sm" onClick={revoke} disabled={revoking}
                style={{ color: 'var(--red, #ef4444)', borderColor: 'var(--red, #ef4444)' }}>
                {revoking ? 'Disconnecting...' : 'Disconnect bot'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
