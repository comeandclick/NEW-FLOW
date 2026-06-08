'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import {
  UserPlus, MessageSquare, MoreHorizontal, Shield, Clock,
  Mail, Copy, CheckCircle2, CheckSquare, Loader2, UserMinus, Crown,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Props {
  params: Promise<{ workspace: string }>
}

interface MemberWithProfile {
  id: string
  user_id: string
  role: string
  joined_at: string
  taskCount?: number
  profile?: {
    id: string
    full_name: string | null
    avatar_url: string | null
    email: string
  }
}

interface PendingInvitation {
  id: string
  email: string
  role: string
  created_at: string
  expires_at: string
  token: string
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Admin',
  member: 'Membre',
  viewer: 'Lecteur',
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-amber-500/10 text-amber-500',
  admin: 'bg-blue-500/10 text-blue-500',
  member: 'bg-green-500/10 text-green-500',
  viewer: 'bg-muted text-muted-foreground',
}

export default function MembersPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)

  const [members, setMembers] = useState<MemberWithProfile[]>([])
  const [pending, setPending] = useState<PendingInvitation[]>([])
  const [myRole, setMyRole] = useState<string>('member')
  const [loading, setLoading] = useState(true)

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [welcomeMsg, setWelcomeMsg] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{ type: string; inviteUrl?: string; name?: string; dmId?: string } | null>(null)

  // Assign tasks dialog
  const [assignTarget, setAssignTarget] = useState<MemberWithProfile | null>(null)
  const [availableTasks, setAvailableTasks] = useState<{ id: string; title: string; status: string }[]>([])
  const [assigningTask, setAssigningTask] = useState<string | null>(null)

  const canManage = myRole === 'owner' || myRole === 'admin'

  useEffect(() => {
    if (!currentWorkspace?.id) return
    loadAll()
  }, [currentWorkspace?.id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    if (!currentWorkspace?.id) return
    setLoading(true)
    try {
      const supabase = getSupabaseClient()

      // Members with task count
      const { data: rawMembers } = await supabase
        .from('workspace_members')
        .select(`
          id, user_id, role, joined_at,
          profile:profiles(id, full_name, avatar_url, email)
        `)
        .eq('workspace_id', currentWorkspace.id)
        .order('joined_at', { ascending: true })

      // Task counts per assignee
      const { data: tasks } = await supabase
        .from('tasks')
        .select('assignee_id, status')
        .eq('workspace_id', currentWorkspace.id)
        .neq('status', 'done')
        .not('assignee_id', 'is', null)

      const taskCountMap: Record<string, number> = {}
      tasks?.forEach((t) => {
        if (t.assignee_id) taskCountMap[t.assignee_id] = (taskCountMap[t.assignee_id] ?? 0) + 1
      })

      const enriched = ((rawMembers ?? []) as unknown as MemberWithProfile[]).map((m) => ({
        ...m,
        taskCount: taskCountMap[m.user_id] ?? 0,
      }))
      setMembers(enriched)

      const me = enriched.find((m) => m.user_id === user?.id)
      if (me) setMyRole(me.role)

      // Pending invitations
      if (me && ['owner', 'admin'].includes(me.role)) {
        const { data: invitations } = await supabase
          .from('workspace_invitations')
          .select('id, email, role, created_at, expires_at, token')
          .eq('workspace_id', currentWorkspace.id)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
        setPending((invitations ?? []) as PendingInvitation[])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id) return
    setInviting(true)
    setInviteResult(null)
    try {
      const res = await fetch('/api/workspaces/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          email: inviteEmail.trim(),
          role: inviteRole,
          welcomeMessage: welcomeMsg.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setInviteResult({
        type: json.type,
        inviteUrl: json.inviteUrl,
        name: json.member?.name,
        dmId: json.dmConversationId,
      })
      setInviteEmail('')
      setWelcomeMsg('')
      loadAll()

      if (json.type === 'added') {
        toast.success(`${json.member?.name} ajouté à l'espace !`)
      } else {
        toast.success(`Invitation envoyée à ${inviteEmail}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de l\'invitation')
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(memberId: string, userId: string, role: 'admin' | 'member' | 'viewer') {
    try {
      const { error } = await getSupabaseClient()
        .from('workspace_members')
        .update({ role })
        .eq('id', memberId)
      if (error) throw error
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)))
      toast.success('Rôle mis à jour')
    } catch {
      toast.error('Échec')
    }
  }

  async function handleRemove(member: MemberWithProfile) {
    if (!currentWorkspace?.id) return
    if (!confirm(`Retirer ${member.profile?.full_name ?? member.profile?.email} de l'espace ?`)) return
    try {
      const { error } = await getSupabaseClient()
        .from('workspace_members')
        .delete()
        .eq('id', member.id)
      if (error) throw error
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      toast.success('Membre retiré')
    } catch {
      toast.error('Échec')
    }
  }

  async function handleCancelInvite(invId: string) {
    try {
      const { error } = await getSupabaseClient()
        .from('workspace_invitations')
        .delete()
        .eq('id', invId)
      if (error) throw error
      setPending((prev) => prev.filter((i) => i.id !== invId))
      toast.success('Invitation annulée')
    } catch {
      toast.error('Échec')
    }
  }

  async function openAssignTasks(member: MemberWithProfile) {
    setAssignTarget(member)
    if (!currentWorkspace?.id) return
    const { data } = await getSupabaseClient()
      .from('tasks')
      .select('id, title, status, assignee_id')
      .eq('workspace_id', currentWorkspace.id)
      .neq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(30)
    setAvailableTasks((data ?? []) as { id: string; title: string; status: string }[])
  }

  async function handleAssignTask(taskId: string) {
    if (!assignTarget) return
    setAssigningTask(taskId)
    try {
      const { error } = await getSupabaseClient()
        .from('tasks')
        .update({ assignee_id: assignTarget.user_id })
        .eq('id', taskId)
      if (error) throw error
      toast.success(`Tâche assignée à ${assignTarget.profile?.full_name ?? 'ce membre'}`)
      setAvailableTasks((prev) =>
        prev.map((t) => t.id === taskId ? { ...t, assignee_id: assignTarget.user_id } : t)
      )
      loadAll()
    } catch {
      toast.error('Échec')
    } finally {
      setAssigningTask(null)
    }
  }

  async function openDM(memberId: string) {
    if (!currentWorkspace?.id || !user?.id) return
    try {
      // Find or create DM
      const supabase = getSupabaseClient()
      const { data: convs } = await supabase
        .from('conversations')
        .select('id, members:conversation_members(user_id)')
        .eq('workspace_id', currentWorkspace.id)
        .eq('type', 'dm')
      type C = { id: string; members: { user_id: string }[] }
      const existing = (convs as unknown as C[] ?? []).find(
        (c) =>
          c.members.some((m) => m.user_id === user.id) &&
          c.members.some((m) => m.user_id === memberId)
      )
      if (existing) {
        router.push(`/${slug}/messages/${existing.id}`)
      } else {
        const { data: dm } = await supabase
          .from('conversations')
          .insert({ workspace_id: currentWorkspace.id, type: 'dm', created_by: user.id })
          .select()
          .single()
        if (dm) {
          await supabase.from('conversation_members').insert([
            { conversation_id: dm.id, user_id: user.id },
            { conversation_id: dm.id, user_id: memberId },
          ])
          router.push(`/${slug}/messages/${dm.id}`)
        }
      }
    } catch {
      toast.error('Impossible d\'ouvrir la conversation')
    }
  }

  const initials = (m: MemberWithProfile) => {
    const n = m.profile?.full_name ?? m.profile?.email ?? '?'
    return n.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Membres</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {members.length} membre{members.length !== 1 ? 's' : ''}
            {pending.length > 0 && ` · ${pending.length} invitation${pending.length > 1 ? 's' : ''} en attente`}
          </p>
        </div>
        {canManage && (
          <Button size="sm" className="gap-1.5" onClick={() => { setInviteOpen(true); setInviteResult(null) }}>
            <UserPlus className="h-4 w-4" />
            Inviter
          </Button>
        )}
      </div>

      <Separator />

      {/* Member cards */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-accent/30 transition-colors group"
            >
              {/* Avatar */}
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={member.profile?.avatar_url ?? undefined} />
                <AvatarFallback className="text-xs font-semibold">{initials(member)}</AvatarFallback>
              </Avatar>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">
                    {member.profile?.full_name ?? member.profile?.email ?? '—'}
                    {member.user_id === user?.id && (
                      <span className="text-xs text-muted-foreground ml-1">(vous)</span>
                    )}
                  </span>
                  <Badge className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[member.role] ?? ROLE_COLORS.member}`}>
                    {member.role === 'owner' && <Crown className="h-2.5 w-2.5 mr-0.5" />}
                    {ROLE_LABELS[member.role] ?? member.role}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground truncate">{member.profile?.email}</span>
                  {(member.taskCount ?? 0) > 0 && (
                    <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                      <CheckSquare className="h-3 w-3" />
                      {member.taskCount} tâche{(member.taskCount ?? 0) > 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(member.joined_at), { locale: fr, addSuffix: true })}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {member.user_id !== user?.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Envoyer un message"
                    onClick={() => openDM(member.user_id)}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Assigner des tâches"
                  onClick={() => openAssignTasks(member)}
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                </Button>
                {canManage && member.user_id !== user?.id && member.role !== 'owner' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    } />
                    <DropdownMenuContent align="end" className="w-44">
                      <div className="px-2 py-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Changer le rôle</p>
                      </div>
                      {(['admin', 'member', 'viewer'] as const).map((r) => (
                        <DropdownMenuItem
                          key={r}
                          onClick={() => handleRoleChange(member.id, member.user_id, r)}
                          className="flex items-center gap-2"
                        >
                          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                          {ROLE_LABELS[r]}
                          {member.role === r && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-primary" />}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive gap-2"
                        onClick={() => handleRemove(member)}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                        Retirer de l&apos;espace
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending invitations */}
      {canManage && pending.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Invitations en attente</h2>
            {pending.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-border"
              >
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{inv.email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[inv.role] ?? ROLE_COLORS.member}`}>
                      {ROLE_LABELS[inv.role] ?? inv.role}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      expire {formatDistanceToNow(new Date(inv.expires_at), { locale: fr, addSuffix: true })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Copier le lien"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/invite/${inv.token}`
                      )
                      toast.success('Lien copié')
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive"
                    onClick={() => handleCancelInvite(inv.id)}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Invite Dialog ───────────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) setInviteResult(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inviter un collègue</DialogTitle>
          </DialogHeader>

          {inviteResult ? (
            <div className="space-y-4 py-2">
              {inviteResult.type === 'added' ? (
                <>
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                    <div>
                      <p className="font-medium">{inviteResult.name} a rejoint l&apos;espace !</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Une conversation directe a été ouverte automatiquement.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {inviteResult.dmId && (
                      <Button
                        className="flex-1 gap-1.5"
                        onClick={() => {
                          setInviteOpen(false)
                          router.push(`/${slug}/messages/${inviteResult.dmId}`)
                        }}
                      >
                        <MessageSquare className="h-4 w-4" />
                        Ouvrir la conversation
                      </Button>
                    )}
                    <Button variant="outline" className="flex-1" onClick={() => setInviteResult(null)}>
                      Inviter quelqu&apos;un d&apos;autre
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <Mail className="h-10 w-10 text-primary" />
                    <div>
                      <p className="font-medium">Invitation créée</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Partagez ce lien avec {inviteResult.name ?? inviteEmail}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={inviteResult.inviteUrl ?? ''}
                      readOnly
                      className="text-xs flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(inviteResult.inviteUrl ?? '')
                        toast.success('Lien copié !')
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full" onClick={() => setInviteResult(null)}>
                    Inviter quelqu&apos;un d&apos;autre
                  </Button>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleInvite} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Email du collègue</Label>
                <Input
                  type="email"
                  placeholder="collegue@entreprise.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label>Rôle</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">
                      <div>
                        <p className="font-medium">Admin</p>
                        <p className="text-xs text-muted-foreground">Gère membres, projets, paramètres</p>
                      </div>
                    </SelectItem>
                    <SelectItem value="member">
                      <div>
                        <p className="font-medium">Membre</p>
                        <p className="text-xs text-muted-foreground">Crée et modifie le contenu</p>
                      </div>
                    </SelectItem>
                    <SelectItem value="viewer">
                      <div>
                        <p className="font-medium">Lecteur</p>
                        <p className="text-xs text-muted-foreground">Lecture seule</p>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Message de bienvenue <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
                <Textarea
                  placeholder="Bienvenue dans l'équipe ! Heureux de t'avoir avec nous…"
                  value={welcomeMsg}
                  onChange={(e) => setWelcomeMsg(e.target.value)}
                  rows={3}
                  className="resize-none text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Envoyé automatiquement dans la conversation directe.
                </p>
              </div>

              <Button type="submit" className="w-full gap-1.5" disabled={inviting || !inviteEmail.trim()}>
                {inviting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Envoi…</>
                ) : (
                  <><UserPlus className="h-4 w-4" /> Envoyer l&apos;invitation</>
                )}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Assign Tasks Dialog ───────────────────────────────────── */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Assigner des tâches à {assignTarget?.profile?.full_name ?? assignTarget?.profile?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-80 overflow-auto py-2">
            {availableTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Aucune tâche active disponible
              </p>
            ) : (
              availableTasks.map((task) => {
                const isAssigned = (task as unknown as { assignee_id?: string }).assignee_id === assignTarget?.user_id
                return (
                  <button
                    key={task.id}
                    onClick={() => !isAssigned && handleAssignTask(task.id)}
                    disabled={isAssigned || assigningTask === task.id}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      isAssigned
                        ? 'bg-primary/5 border-primary/20 cursor-default'
                        : 'hover:bg-accent border-border cursor-pointer'
                    }`}
                  >
                    {assigningTask === task.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                    ) : isAssigned ? (
                      <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    ) : (
                      <CheckSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-sm flex-1 truncate">{task.title}</span>
                    <Badge variant="outline" className="text-[10px] capitalize shrink-0">{task.status}</Badge>
                  </button>
                )
              })
            )}
          </div>
          <div className="flex justify-between pt-2 border-t border-border">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/${slug}/tasks`)}>
              Voir toutes les tâches
            </Button>
            <Button size="sm" onClick={() => setAssignTarget(null)}>Fermer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
