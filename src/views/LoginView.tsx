import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (err) {
      setError('Invalid email or password. Please try again.')
      setLoading(false)
    } else {
      onLogin()
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'Inter, sans-serif' }}>

      {/* ── LEFT PANEL ── */}
      <div style={{
        width: '45%', flexShrink: 0, background: '#fdf6ef',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '52px 56px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(#e8d5c0 1px, transparent 1px), linear-gradient(90deg, #e8d5c0 1px, transparent 1px)',
          backgroundSize: '40px 40px', opacity: 0.5,
        }} />

        {/* top: logo */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {branding.logo ? (
            <img src={branding.logo} alt="Logo" style={{ height: 36, objectFit: 'contain', objectPosition: 'left' }} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, background: '#0f172a', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', fontFamily: 'Manrope, sans-serif' }}>{branding.name || 'Agency OS'}</span>
            </div>
          )}
        </div>

        {/* middle: headline + USPs */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>Intelligence Platform</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a', lineHeight: 1.2, fontFamily: 'Manrope, sans-serif', marginBottom: 14 }}>
            {branding.name || 'Agency OS'}'s internal<br />command center.
          </div>
          <div style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.65, marginBottom: 40 }}>
            Projects, clients, team and revenue — one place for the whole team.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {USPS.map(u => (
              <div key={u.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 30, height: 30, borderRadius: 7, background: 'rgba(255,255,255,0.7)', border: '1px solid #e8d5c0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a', flexShrink: 0 }}>
                  {u.icon}
                </div>
                <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{u.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* bottom: footer */}
        <div style={{ position: 'relative', zIndex: 1, fontSize: 11, color: '#0f172a', fontWeight: 500, opacity: 0.4 }}>
          {branding.name || 'Agency OS'} · Internal Platform
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ flex: 1, background: '#f0eef2', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 48px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', fontFamily: 'Manrope, sans-serif', margin: 0, marginBottom: 6 }}>Welcome back</h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>Sign in to continue to your workspace.</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input type="email" value={email} onChange={e => { setEmail(e.target.value); setError('') }} placeholder="you@agency.com" autoFocus />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  placeholder="••••••••"
                  style={{ paddingRight: 44 }}
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, display: 'flex' }}>
                  {showPw
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            {error && <div className="alert alert-red">{error}</div>}

            <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ marginTop: 6, width: '100%', justifyContent: 'center' }}>
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
