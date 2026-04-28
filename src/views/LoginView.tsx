import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useOrg } from '../lib/useOrg'

interface AgencyBranding {
  name: string
  logo: string
}

const USPS = [
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>, label: 'Resource Planning & Allocation' },
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>, label: 'Client & Project Management' },
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, label: 'Revenue Forecasting' },
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>, label: 'Automated Reporting' },
  { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>, label: 'Domain & Infrastructure Tracking' },
]

export function LoginView({ onLogin }: { onLogin: () => void }) {
  const org = useOrg()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [branding, setBranding] = useState<AgencyBranding>({ name: '', logo: '' })

  useEffect(() => {
    supabase.from('app_settings').select('key, value')
      .in('key', ['agency_name', 'agency_logo'])
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data ?? []).forEach((r: { key: string; value: string }) => { map[r.key] = r.value })
        setBranding({ name: map['agency_name'] ?? '', logo: map['agency_logo'] ?? '' })
      })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) { setError('Please enter your email address.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Please enter a valid email address.'); return }
    if (!password) { setError('Please enter your password.'); return }
    setLoading(true)
    setError('')
    const { data: signInData, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (err) {
      setError('Invalid email or password. Please try again.')
      setLoading(false)
      return
    }
    if (org && signInData.user) {
      const { data: member } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', signInData.user.id)
        .eq('organization_id', org.orgId)
        .maybeSingle()
      if (!member) {
        await supabase.auth.signOut()
        setError("Your account doesn't have access to this workspace.")
        setLoading(false)
        return
      }
    }
    onLogin()
  }

  return (
    <div className="flex h-screen overflow-hidden font-[Inter,sans-serif]">

      {/* ── LEFT PANEL ── */}
      <div className="flex flex-col justify-between relative overflow-hidden flex-shrink-0 w-[45%] bg-[#fdf6ef] px-14 py-[52px]">
        <div className="absolute inset-0 pointer-events-none opacity-50"
          style={{
            backgroundImage: 'linear-gradient(#e8d5c0 1px, transparent 1px), linear-gradient(90deg, #e8d5c0 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        {/* top: logo */}
        <div className="relative z-10">
          {branding.logo ? (
            <img src={branding.logo} alt="Logo" className="object-contain object-left h-9" />
          ) : (
            <div className="flex items-center gap-[10px]">
              <div className="w-8 h-8 rounded-[7px] flex items-center justify-center text-white bg-[#0f172a]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              </div>
              <span className="font-extrabold text-[15px] text-[#0f172a] font-[Manrope,sans-serif]">{branding.name || 'Agency OS'}</span>
            </div>
          )}
        </div>

        {/* middle: headline + USPs */}
        <div className="relative z-10">
          <div className="font-bold uppercase mb-[14px] text-[11px] text-[#0f172a] tracking-[0.1em]">Intelligence Platform</div>
          <div className="font-extrabold mb-[14px] text-[32px] text-[#0f172a] leading-[1.2] font-[Manrope,sans-serif]">
            {branding.name || 'Agency OS'}'s internal<br />command center.
          </div>
          <div className="mb-10 text-sm text-[#0f172a] leading-[1.65]">
            Projects, clients, team and revenue — one place for the whole team.
          </div>

          <div className="flex flex-col gap-3">
            {USPS.map(u => (
              <div key={u.label} className="flex items-center gap-3">
                <div className="flex items-center justify-center flex-shrink-0 rounded-[7px] w-[30px] h-[30px] text-[#0f172a]"
                  style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #e8d5c0' }}>
                  {u.icon}
                </div>
                <span className="font-medium text-[13px] text-[#0f172a]">{u.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* bottom: footer */}
        <div className="relative z-10 font-medium opacity-40 text-[11px] text-[#0f172a]">
          {branding.name || 'Agency OS'} · Internal Platform
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex items-center justify-center bg-[#f0eef2] px-12 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8">
            <h1 className="font-extrabold m-0 mb-[6px] text-2xl text-[#0f172a] font-[Manrope,sans-serif]">Welcome back</h1>
            <p className="m-0 text-sm text-[#64748b]">Sign in to continue to your workspace.</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-[14px]">
            <div className="mb-4">
              <Label>Email address</Label>
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }} placeholder="you@agency.com" autoFocus />
            </div>

            <div className="mb-4">
              <Label>Password</Label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••"
                  className="pr-11"
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center bg-transparent border-0 cursor-pointer p-0 text-slate-400">
                  {showPw
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-[#fecaca] bg-[#fff1f2] px-3 py-2 text-sm text-[#be123c]">{error}</div>
            )}

            <Button type="submit" size="lg" disabled={loading} className="mt-[6px] w-full justify-center">
              {loading ? 'Signing in…' : 'Sign in →'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
