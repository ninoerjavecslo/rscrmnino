import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCurrentUser } from '../lib/useCurrentUser'
import { toast } from '../lib/toast'

export function ProfileView() {
  const user = useCurrentUser()

  const [name, setName] = useState('')
  const [nameReady, setNameReady] = useState(false)
  const [savingName, setSavingName] = useState(false)

  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwError, setPwError] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  // Init name from user once loaded
  if (user && !nameReady) {
    setName(user.name)
    setNameReady(true)
  }

  async function saveName() {
    if (!name.trim()) return
    setSavingName(true)
    const { error } = await supabase.auth.updateUser({ data: { name: name.trim() } })
    if (error) toast('error', 'Failed to update name')
    else toast('success', 'Name updated')
    setSavingName(false)
  }

  async function savePassword() {
    setPwError('')
    if (!newPw) { setPwError('Enter a new password.'); return }
    if (newPw.length < 6) { setPwError('Password must be at least 6 characters.'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return }
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) { setPwError(error.message); setSavingPw(false); return }
    toast('success', 'Password updated')
    setNewPw(''); setConfirmPw('')
    setSavingPw(false)
  }

  async function signOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
  }

  if (!user) return null

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My Profile</h1>
          <p>Manage your account and preferences.</p>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 640 }}>

      {/* Avatar + basic info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: 'var(--navy)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 800, color: '#fff', fontFamily: 'Manrope, sans-serif', flexShrink: 0,
            }}>
              {user.initial}
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--c0)', fontFamily: 'Manrope, sans-serif' }}>{user.name}</div>
              <div style={{ fontSize: 13, color: 'var(--c3)', marginTop: 2 }}>{user.email}</div>
              <span className="badge badge-navy" style={{ marginTop: 6 }}>{user.role}</span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--c6)', paddingTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)', marginBottom: 14, fontFamily: 'Manrope, sans-serif' }}>Display Name</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                style={{ flex: 1 }}
                onKeyDown={e => e.key === 'Enter' && saveName()}
              />
              <button className="btn btn-primary btn-sm" onClick={saveName} disabled={savingName || name === user.name}>
                {savingName ? 'Saving…' : 'Save'}
              </button>
            </div>
            <div className="form-hint" style={{ marginTop: 6 }}>This name appears in the sidebar and topbar.</div>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)', marginBottom: 16, fontFamily: 'Manrope, sans-serif' }}>Change Password</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">New password</label>
              <input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setPwError('') }} placeholder="Min. 6 characters" />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm new password</label>
              <input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setPwError('') }} placeholder="Repeat password" />
            </div>
            {pwError && <div className="alert alert-red">{pwError}</div>}
            <button className="btn btn-primary btn-sm" onClick={savePassword} disabled={savingPw} style={{ alignSelf: 'flex-start' }}>
              {savingPw ? 'Updating…' : 'Update Password'}
            </button>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <div className="card">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--c0)', fontFamily: 'Manrope, sans-serif' }}>Sign out</div>
            <div style={{ fontSize: 12, color: 'var(--c3)', marginTop: 2 }}>You'll be redirected to the login screen.</div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={signOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
      </div>
    </>
  )
}
