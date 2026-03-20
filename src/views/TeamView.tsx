import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useResourceStore } from '../stores/resource'
import { toast } from '../lib/toast'
import type { Team, TeamMember } from '../lib/types'

export function TeamView() {
  const { teams, members, loading, fetchTeams, fetchMembers, addTeam, updateTeam, removeTeam, addMember, updateMember, removeMember } = useResourceStore()

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [editMember, setEditMember] = useState<TeamMember | null>(null)
  const [showMemberModal, setShowMemberModal] = useState(false)

  // Team form
  const [teamName, setTeamName] = useState('')
  const [teamColor, setTeamColor] = useState('#3b82f6')
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)

  // Member form
  const [mName, setMName] = useState('')
  const [mRole, setMRole] = useState('')
  const [mTeamId, setMTeamId] = useState<string>('')
  const [mHours, setMHours] = useState(8)

  useEffect(() => { fetchTeams(); fetchMembers() }, [fetchTeams, fetchMembers])

  const filtered = selectedTeamId ? members.filter(m => m.team_id === selectedTeamId) : members

  const memberCount = (teamId: string) => members.filter(m => m.team_id === teamId).length

  // ── Team modal helpers ──────────────────────────────────────────────────────
  const openAddTeam = () => { setEditingTeam(null); setTeamName(''); setTeamColor('#3b82f6'); setShowTeamModal(true) }
  const openEditTeam = (t: Team) => { setEditingTeam(t); setTeamName(t.name); setTeamColor(t.color); setShowTeamModal(true) }

  const saveTeam = async () => {
    if (!teamName.trim()) return
    try {
      if (editingTeam) {
        await updateTeam(editingTeam.id, { name: teamName.trim(), color: teamColor })
        toast('success', 'Team updated')
      } else {
        await addTeam(teamName.trim(), teamColor)
        toast('success', 'Team created')
      }
      setShowTeamModal(false)
    } catch { toast('error', 'Failed to save team') }
  }

  const deleteTeam = async (id: string) => {
    if (!confirm('Delete this team? Members will be unassigned.')) return
    try { await removeTeam(id); toast('success', 'Team removed'); if (selectedTeamId === id) setSelectedTeamId(null) }
    catch { toast('error', 'Failed to remove team') }
  }

  // ── Member modal helpers ────────────────────────────────────────────────────
  const openAddMember = () => { setEditMember(null); setMName(''); setMRole(''); setMTeamId(''); setMHours(8); setShowMemberModal(true) }
  const openEditMember = (m: TeamMember) => { setEditMember(m); setMName(m.name); setMRole(m.role ?? ''); setMTeamId(m.team_id ?? ''); setMHours(m.hours_per_day); setShowMemberModal(true) }

  const saveMember = async () => {
    if (!mName.trim()) return
    try {
      const payload = { name: mName.trim(), role: mRole.trim() || undefined, team_id: mTeamId || null, hours_per_day: mHours }
      if (editMember) {
        await updateMember(editMember.id, payload)
        toast('success', 'Member updated')
      } else {
        await addMember(payload)
        toast('success', 'Member added')
      }
      setShowMemberModal(false)
    } catch { toast('error', 'Failed to save member') }
  }

  const deleteMember = async (id: string) => {
    if (!confirm('Remove this team member?')) return
    try { await removeMember(id); toast('success', 'Member removed') }
    catch { toast('error', 'Failed to remove member') }
  }

  const copyShareLink = (token: string) => {
    const url = `${window.location.origin}/my-week/${token}`
    navigator.clipboard.writeText(url).then(() => toast('success', 'Link copied'))
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Team</h1>
          <p style={{ color: 'var(--c3)', marginTop: 2 }}>Manage teams and members</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={openAddTeam}>+ Add Team</button>
          <button className="btn btn-primary btn-sm" onClick={openAddMember}>+ Add Member</button>
        </div>
      </div>

      <div className="page-content">
        {/* ── Teams chips ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <button
            className={`btn btn-sm ${selectedTeamId === null ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setSelectedTeamId(null)}
          >All ({members.length})</button>

          {teams.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                className={`btn btn-sm ${selectedTeamId === t.id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setSelectedTeamId(prev => prev === t.id ? null : t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                {t.name}
                <span className="badge" style={{ marginLeft: 4 }}>{memberCount(t.id)}</span>
              </button>
              <button className="btn btn-ghost btn-xs" onClick={() => openEditTeam(t)} title="Edit team">&#9998;</button>
              <button className="btn btn-ghost btn-xs" onClick={() => deleteTeam(t.id)} title="Delete team" style={{ color: 'var(--red)' }}>&times;</button>
            </div>
          ))}
        </div>

        {/* ── Members table ────────────────────────────────────────────────── */}
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <p style={{ padding: 20, color: 'var(--c3)' }}>Loading...</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--c6)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--c2)', fontWeight: 600 }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--c2)', fontWeight: 600 }}>Team</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--c2)', fontWeight: 600 }}>Role</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--c2)', fontWeight: 600 }}>Hours/day</th>
                    <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--c2)', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} style={{ padding: 20, color: 'var(--c3)', textAlign: 'center' }}>No members found</td></tr>
                  )}
                  {filtered.map(m => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--c6)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 500 }}><Link to={`/team/${m.id}`} className="table-link">{m.name}</Link></td>
                      <td style={{ padding: '8px 12px' }}>
                        {m.team ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: m.team.color }} />
                            {m.team.name}
                          </span>
                        ) : <span style={{ color: 'var(--c4)' }}>--</span>}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--c2)' }}>{m.role || '--'}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right' }}>{m.hours_per_day}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => copyShareLink(m.share_token)} title="Copy share link">&#128279;</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => openEditMember(m)}>Edit</button>
                        <button className="btn btn-ghost btn-xs" onClick={() => deleteMember(m.id)} style={{ color: 'var(--red)' }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Add/Edit Team Modal ──────────────────────────────────────────── */}
      {showTeamModal && (
        <div className="modal-overlay" onClick={() => setShowTeamModal(false)}>
          <div className="modal-box" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingTeam ? 'Edit Team' : 'New Team'}</h3>
              <button className="modal-close" onClick={() => setShowTeamModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Team name</label>
                <input value={teamName} onChange={e => setTeamName(e.target.value)} style={inputStyle} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Color</label>
                <input type="color" value={teamColor} onChange={e => setTeamColor(e.target.value)} style={{ width: 48, height: 36, border: 'none', cursor: 'pointer' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTeamModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveTeam}>{editingTeam ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Member Modal ────────────────────────────────────────── */}
      {showMemberModal && (
        <div className="modal-overlay" onClick={() => setShowMemberModal(false)}>
          <div className="modal-box" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editMember ? 'Edit Member' : 'Add Member'}</h3>
              <button className="modal-close" onClick={() => setShowMemberModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name</label>
                <input value={mName} onChange={e => setMName(e.target.value)} style={inputStyle} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Team</label>
                <select value={mTeamId} onChange={e => setMTeamId(e.target.value)} style={inputStyle}>
                  <option value="">-- No team --</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <input value={mRole} onChange={e => setMRole(e.target.value)} placeholder="e.g. Designer, Frontend Dev" style={inputStyle} />
              </div>
              <div className="form-group">
                <label className="form-label">Hours per day</label>
                <input type="number" value={mHours} onChange={e => setMHours(Number(e.target.value))} min={0} max={24} step={0.5} style={{ ...inputStyle, width: 100 }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowMemberModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveMember}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--c5)',
  borderRadius: 'var(--r)',
  fontSize: 14,
}
