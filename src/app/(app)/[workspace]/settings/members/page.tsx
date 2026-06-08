'use client'

import { use, useEffect, useState } from 'react'
import { workspacesService } from '@/services/workspaces.service'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'

interface Props {
  params: Promise<{ workspace: string }>
}

type MemberWithProfile = {
  id: string
  user_id: string
  role: string
  profile?: {
    id: string
    full_name?: string
    avatar_url?: string
    email: string
  }
}

export default function MembersPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const { currentWorkspace } = useWorkspaceStore()
  const [members, setMembers] = useState<MemberWithProfile[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [inviting, setInviting] = useState(false)
  const [myRole, setMyRole] = useState<string>('member')

  useEffect(() => {
    if (!currentWorkspace?.id) return
    workspacesService.getMembers(currentWorkspace.id).then((data) => {
      setMembers(data as unknown as MemberWithProfile[])
      const me = (data as unknown as MemberWithProfile[]).find((m) => m.user_id === user?.id)
      if (me) setMyRole(me.role)
    })
  }, [currentWorkspace?.id, user?.id])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id || !user?.id) return
    setInviting(true)
    try {
      await workspacesService.inviteMember(currentWorkspace.id, inviteEmail, inviteRole, user.id)
      toast.success(`Invited ${inviteEmail}`)
      setInviteEmail('')
      // Refresh members
      const fresh = await workspacesService.getMembers(currentWorkspace.id)
      setMembers(fresh as unknown as MemberWithProfile[])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to invite')
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(userId: string, role: 'admin' | 'member' | 'viewer') {
    if (!currentWorkspace?.id) return
    try {
      await workspacesService.updateMemberRole(currentWorkspace.id, userId, role)
      setMembers((prev) =>
        prev.map((m) => (m.user_id === userId ? { ...m, role } : m))
      )
      toast.success('Role updated')
    } catch {
      toast.error('Failed to update role')
    }
  }

  async function handleRemove(userId: string) {
    if (!currentWorkspace?.id || !confirm('Remove this member?')) return
    try {
      await workspacesService.removeMember(currentWorkspace.id, userId)
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
      toast.success('Member removed')
    } catch {
      toast.error('Failed to remove')
    }
  }

  const canManage = myRole === 'owner' || myRole === 'admin'

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-lg font-semibold">Members</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
      </div>

      {canManage && (
        <>
          <Separator />
          <form onSubmit={handleInvite} className="space-y-3">
            <h2 className="text-sm font-medium">Invite member</h2>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                className="flex-1 h-8 text-sm"
              />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" size="sm" className="h-8 gap-1" disabled={inviting}>
                <UserPlus className="h-3.5 w-3.5" />
                {inviting ? 'Inviting…' : 'Invite'}
              </Button>
            </div>
          </form>
        </>
      )}

      <Separator />

      <div className="space-y-2">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-3 py-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={member.profile?.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs">
                {member.profile?.full_name?.[0] ?? member.profile?.email?.[0] ?? '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{member.profile?.full_name ?? '—'}</p>
              <p className="text-xs text-muted-foreground">{member.profile?.email}</p>
            </div>
            {canManage && member.user_id !== user?.id && member.role !== 'owner' ? (
              <div className="flex items-center gap-2">
                <Select
                  value={member.role}
                  onValueChange={(v) => handleRoleChange(member.user_id, v as 'admin' | 'member' | 'viewer')}
                >
                  <SelectTrigger className="w-24 h-6 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs text-destructive"
                  onClick={() => handleRemove(member.user_id)}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <Badge variant="outline" className="text-xs capitalize">{member.role}</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
