import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useResourceStore } from '../stores/resource'
import { toast } from '../lib/toast'
import type { Team, TeamMember } from '../lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Label } from '@/components/ui/label'

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
  const [mMeetings, setMMeetings] = useState(0)
  const [mSales, setMSales] = useState(0)
  const [mVacation, setMVacation] = useState(0)

  // Delete confirmations
  const [deleteTeamTarget, setDeleteTeamTarget] = useState<Team | null>(null)
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<TeamMember | null>(null)

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
    try { await removeTeam(id); toast('success', 'Team removed'); if (selectedTeamId === id) setSelectedTeamId(null) }
    catch { toast('error', 'Failed to remove team') }
    setDeleteTeamTarget(null)
  }

  // ── Member modal helpers ────────────────────────────────────────────────────
  const openAddMember = () => { setEditMember(null); setMName(''); setMRole(''); setMTeamId(''); setMHours(8); setMMeetings(0); setMSales(0); setMVacation(0); setShowMemberModal(true) }
  const openEditMember = (m: TeamMember) => { setEditMember(m); setMName(m.name); setMRole(m.role ?? ''); setMTeamId(m.team_id ?? ''); setMHours(m.hours_per_day); setMMeetings(m.overhead_meetings_month ?? 0); setMSales(m.overhead_sales_month ?? 0); setMVacation(m.vacation_days_year ?? 0); setShowMemberModal(true) }

  const saveMember = async () => {
    if (!mName.trim()) return
    try {
      const payload = { name: mName.trim(), role: mRole.trim() || undefined, team_id: mTeamId || null, hours_per_day: mHours, overhead_meetings_month: mMeetings || null, overhead_sales_month: mSales || null, vacation_days_year: mVacation || null }
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
    try { await removeMember(id); toast('success', 'Member removed') }
    catch { toast('error', 'Failed to remove member') }
    setDeleteMemberTarget(null)
  }

  const copyShareLink = (token: string) => {
    const url = `${window.location.origin}/my-week/${token}`
    navigator.clipboard.writeText(url).then(() => toast('success', 'Link copied'))
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 bg-background border-b border-border">
        <div>
          <h1>Team</h1>
          <p className="text-muted-foreground mt-0.5">Manage teams and members</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openAddTeam}>+ Add Team</Button>
          <Button size="sm" onClick={openAddMember}>+ Add Member</Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* ── Teams chips ──────────────────────────────────────────────────── */}
        <div className="flex gap-2 flex-wrap mb-5">
          <Button
            size="sm"
            variant={selectedTeamId === null ? 'default' : 'ghost'}
            onClick={() => setSelectedTeamId(null)}
          >All ({members.length})</Button>

          {teams.map(t => (
            <div key={t.id} className="flex items-center gap-1">
              <Button
                size="sm"
                variant={selectedTeamId === t.id ? 'default' : 'ghost'}
                onClick={() => setSelectedTeamId(prev => prev === t.id ? null : t.id)}
                className="flex items-center gap-1.5"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color }} />
                {t.name}
                <Badge variant="secondary" className="ml-1">{memberCount(t.id)}</Badge>
              </Button>
              <Button size="xs" variant="ghost" onClick={() => openEditTeam(t)} title="Edit team">&#9998;</Button>
              <Button size="xs" variant="ghost" onClick={() => setDeleteTeamTarget(t)} title="Delete team" className="text-[#dc2626]">&times;</Button>
            </div>
          ))}
        </div>

        {/* ── Members table ────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <p className="p-5 text-muted-foreground">Loading...</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--c6)]">
                    <th className="text-left px-3 py-2.5 text-[#374151] font-semibold">Name</th>
                    <th className="text-left px-3 py-2.5 text-[#374151] font-semibold">Team</th>
                    <th className="text-left px-3 py-2.5 text-[#374151] font-semibold">Role</th>
                    <th className="text-right px-3 py-2.5 text-[#374151] font-semibold">Hours/day</th>
                    <th className="text-right px-3 py-2.5 text-[#374151] font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="p-5 text-muted-foreground text-center">No members found</td></tr>
                  )}
                  {filtered.map(m => (
                    <tr key={m.id} className="border-b border-[var(--c6)]">
                      <td className="px-3 py-2 font-medium"><Link to={`/team/${m.id}`} className="font-medium text-primary hover:underline cursor-pointer">{m.name}</Link></td>
                      <td className="px-3 py-2">
                        {m.team ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.team.color }} />
                            {m.team.name}
                          </span>
                        ) : <span className="text-muted-foreground">--</span>}
                      </td>
                      <td className="px-3 py-2 text-[#374151]">{m.role || '--'}</td>
                      <td className="px-3 py-2 text-right">{m.hours_per_day}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <Button size="xs" variant="ghost" onClick={() => copyShareLink(m.share_token)} title="Copy share link">&#128279;</Button>
                        <Button size="xs" variant="ghost" onClick={() => openEditMember(m)}>Edit</Button>
                        <Button size="xs" variant="ghost" onClick={() => setDeleteMemberTarget(m)} className="text-[#dc2626]">Remove</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Add/Edit Team Modal ──────────────────────────────────────────── */}
      <Modal
        open={showTeamModal}
        title={editingTeam ? 'Edit Team' : 'New Team'}
        onClose={() => setShowTeamModal(false)}
        maxWidth={360}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowTeamModal(false)}>Cancel</Button>
            <Button size="sm" onClick={saveTeam}>{editingTeam ? 'Save' : 'Create'}</Button>
          </>
        }
      >
        <div className="mb-4">
          <Label>Team name</Label>
          <input value={teamName} onChange={e => setTeamName(e.target.value)} className="w-full mt-1" autoFocus />
        </div>
        <div className="mb-4">
          <Label>Color</Label>
          <input type="color" value={teamColor} onChange={e => setTeamColor(e.target.value)} className="mt-1" style={{ width: 48, height: 36, border: 'none', cursor: 'pointer' }} />
        </div>
      </Modal>

      {/* ── Add/Edit Member Modal ────────────────────────────────────────── */}
      <Modal
        open={showMemberModal}
        title={editMember ? 'Edit Member' : 'Add Member'}
        onClose={() => setShowMemberModal(false)}
        maxWidth={460}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowMemberModal(false)}>Cancel</Button>
            <Button size="sm" onClick={saveMember}>Save</Button>
          </>
        }
      >
        <div className="mb-4">
          <Label>Name</Label>
          <input value={mName} onChange={e => setMName(e.target.value)} className="w-full mt-1" autoFocus />
        </div>
        <div className="mb-4">
          <Label>Team</Label>
          <select value={mTeamId} onChange={e => setMTeamId(e.target.value)} className="w-full mt-1">
            <option value="">-- No team --</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="mb-4">
          <Label>Role</Label>
          <input value={mRole} onChange={e => setMRole(e.target.value)} placeholder="e.g. Designer, Frontend Dev" className="w-full mt-1" />
        </div>
        <div className="mb-4">
          <Label>Hours per day</Label>
          <input type="number" value={mHours} onChange={e => setMHours(Number(e.target.value))} min={0} max={24} step={0.5} className="mt-1" style={{ width: 100 }} />
        </div>
        <div className="border-t border-border pt-4 mb-1">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Capacity Overhead</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Meetings <span className="normal-case font-normal text-muted-foreground">h/mo</span></Label>
              <input type="number" value={mMeetings} onChange={e => setMMeetings(Number(e.target.value))} min={0} step={1} className="w-full mt-1" />
            </div>
            <div>
              <Label>Sales <span className="normal-case font-normal text-muted-foreground">h/mo</span></Label>
              <input type="number" value={mSales} onChange={e => setMSales(Number(e.target.value))} min={0} step={1} className="w-full mt-1" />
            </div>
            <div>
              <Label>Vacation <span className="normal-case font-normal text-muted-foreground">days/yr</span></Label>
              <input type="number" value={mVacation} onChange={e => setMVacation(Number(e.target.value))} min={0} step={1} className="w-full mt-1" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Subtracted from available capacity in the yearly planner.</p>
        </div>
      </Modal>

      {/* ── Delete Team confirm ──────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTeamTarget}
        title="Delete team"
        message={deleteTeamTarget ? `Delete team "${deleteTeamTarget.name}"? Members will be unassigned.` : ''}
        onConfirm={() => deleteTeamTarget && deleteTeam(deleteTeamTarget.id)}
        onCancel={() => setDeleteTeamTarget(null)}
      />

      {/* ── Delete Member confirm ────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteMemberTarget}
        title="Remove member"
        message={deleteMemberTarget ? `Remove ${deleteMemberTarget.name} from the team?` : ''}
        onConfirm={() => deleteMemberTarget && deleteMember(deleteMemberTarget.id)}
        onCancel={() => setDeleteMemberTarget(null)}
        confirmLabel="Remove"
      />
    </>
  )
}
