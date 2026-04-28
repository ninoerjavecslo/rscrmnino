import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface Stats {
  totalOrgs: number
  activeOrgs: number
  suspendedOrgs: number
  totalUsers: number
  paidOrgs: number
  trialOrgs: number
  freeOrgs: number
}

export function AdminOverview() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    async function load() {
      const [orgsRes, usersRes] = await Promise.all([
        supabase.from('organizations').select('status, plan'),
        supabase.from('app_users').select('id', { count: 'exact', head: true }),
      ])
      const orgs = orgsRes.data ?? []
      setStats({
        totalOrgs: orgs.length,
        activeOrgs: orgs.filter(o => o.status === 'active').length,
        suspendedOrgs: orgs.filter(o => o.status === 'suspended').length,
        totalUsers: usersRes.count ?? 0,
        paidOrgs: orgs.filter(o => o.plan === 'paid').length,
        trialOrgs: orgs.filter(o => o.plan === 'trial').length,
        freeOrgs: orgs.filter(o => o.plan === 'free').length,
      })
    }
    load()
  }, [])

  const cards = stats ? [
    { label: 'Total Organizations', value: stats.totalOrgs, color: '#0f172a' },
    { label: 'Active', value: stats.activeOrgs, color: '#16a34a' },
    { label: 'Suspended', value: stats.suspendedOrgs, color: '#dc2626' },
    { label: 'Total Users', value: stats.totalUsers, color: '#0f172a' },
    { label: 'Paid', value: stats.paidOrgs, color: '#16a34a' },
    { label: 'Trial', value: stats.trialOrgs, color: '#d97706' },
    { label: 'Free', value: stats.freeOrgs, color: '#64748b' },
  ] : []

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', fontFamily: 'Manrope, sans-serif', margin: 0 }}>Overview</h1>
        <p className="text-sm text-[#64748b] mt-1">insighty.io platform at a glance</p>
      </div>

      {stats === null ? (
        <div className="text-sm text-[#64748b]">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-8">
            {cards.map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-[#e8e3ea] p-5">
                <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{c.label}</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: c.color, fontFamily: 'Manrope, sans-serif', lineHeight: 1 }}>{c.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => navigate('/admin/organizations')}
              className="bg-white rounded-xl border border-[#e8e3ea] p-5 text-left hover:border-[#0f172a] transition-colors group"
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Manage Organizations →</div>
              <div className="text-sm text-[#64748b]">Create, suspend, update plans, impersonate</div>
            </button>
            <button
              onClick={() => navigate('/admin/users')}
              className="bg-white rounded-xl border border-[#e8e3ea] p-5 text-left hover:border-[#0f172a] transition-colors"
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Manage Users →</div>
              <div className="text-sm text-[#64748b]">View all users and their workspace access</div>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
