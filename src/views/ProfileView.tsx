import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCurrentUser } from '../lib/useCurrentUser'
import { toast } from '../lib/toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

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
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>My Profile</h1>
          <p>Manage your account and preferences.</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6" style={{ maxWidth: 640 }}>

      {/* Avatar + basic info */}
      <Card className="mb-4">
        <CardContent>
          <div className="flex items-center gap-5 mb-6">
            <div
              className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-2xl font-extrabold text-white shrink-0"
              style={{ fontFamily: 'Manrope, sans-serif' }}
            >
              {user.initial}
            </div>
            <div>
              <div className="text-[18px] font-extrabold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>{user.name}</div>
              <div className="text-sm text-muted-foreground mt-0.5">{user.email}</div>
              <Badge variant="navy" className="mt-1.5">{user.role}</Badge>
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <div className="text-sm font-bold text-foreground mb-3.5" style={{ fontFamily: 'Manrope, sans-serif' }}>Display Name</div>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="flex-1"
                onKeyDown={e => e.key === 'Enter' && saveName()}
              />
              <Button size="sm" onClick={saveName} disabled={savingName || name === user.name}>
                {savingName ? 'Saving…' : 'Save'}
              </Button>
            </div>
            <div className="text-xs text-muted-foreground mt-1.5">This name appears in the sidebar and topbar.</div>
          </div>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card className="mb-4">
        <CardContent>
          <div className="text-sm font-bold text-foreground mb-4" style={{ fontFamily: 'Manrope, sans-serif' }}>Change Password</div>
          <div className="flex flex-col gap-3">
            <div className="mb-4">
              <Label>New password</Label>
              <input type="password" value={newPw} onChange={e => { setNewPw(e.target.value); setPwError('') }} placeholder="Min. 6 characters" className="w-full mt-1" />
            </div>
            <div className="mb-4">
              <Label>Confirm new password</Label>
              <input type="password" value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setPwError('') }} placeholder="Repeat password" className="w-full mt-1" />
            </div>
            {pwError && <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c]">{pwError}</div>}
            <Button size="sm" onClick={savePassword} disabled={savingPw} className="self-start">
              {savingPw ? 'Updating…' : 'Update Password'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sign out */}
      <Card>
        <CardContent className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-foreground" style={{ fontFamily: 'Manrope, sans-serif' }}>Sign out</div>
            <div className="text-xs text-muted-foreground mt-0.5">You'll be redirected to the login screen.</div>
          </div>
          <Button variant="destructive" size="sm" onClick={signOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </CardContent>
      </Card>
      </div>
    </>
  )
}
