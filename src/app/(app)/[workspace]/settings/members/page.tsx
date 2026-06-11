'use client'

import { use, useEffect, useRef, useState } from 'react'
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
  Search, User, X,
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

interface SearchedProfile {
  id: string
  full_name: string | null
  avatar_url: string | null
  email: string
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

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchedProfile[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState<SearchedProfile | null>(null)
  const [inviteRole, setInviteRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [welcomeMsg, setWelcomeMsg] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteResult, setInviteResult] = useState<{
    type: string; inviteUrl?: string; name?: string; dmId?: string
  } | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Assign tasks dialog
  const [assignTarget, setAssignTarget] = useState<MemberWithProfile | null>(null)
  const [availableTasks, setAvailableTasks] = useState<{
    id: string; title: string; status: string; assignee_id?: string | null
  }[]>([])
  const [assigningTask, setAssigningTask] = useState<string | null>(null)

  // Owner fallback: if members empty but user owns the workspace → they have rights
  const isOwnerByWorkspace = currentWorkspace?.owner_id === user?.id
  const canManage = myRole === 'owner' || myRole === 'admin' || (isOwnerByWorkspace && members.length === 0)

  useEffect(() => {
    if (!currentWorkspace?.id || !user?.id) return
    loadAll()
  }, [currentWorkspace?.id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll() {
    if (!currentWorkspace?.id || !user?.id) return
    setLoading(true)
    try {
      const supabase = getSupabaseClient()

      // Use admin API route to bypass RLS (RLS on profiles join can silently fail)
      const membersRes = await fetch(`/api/workspaces/members?workspaceId=${currentWorkspace.id}`)
      const rawMembers: MemberWithProfile[] = membersRes.ok ? await membersRes.json() : []

      const { data: tasks } = await supabase
        .from('tasks')
        .select('assignee_id')
        .eq('workspace_id', currentWorkspace.id)
        .neq('status', 'done')
        .not('assignee_id', 'is', null)

      const taskCountMap: Record<string, number> = {}
      tasks?.forEach((t) => {
        if (t.assignee_id) taskCountMap[t.assignee_id] = (taskCountMap[t.assignee_id] ?? 0) + 1
      })

      const enriched = rawMembers.map((m) => ({
        ...m,
        taskCount: taskCountMap[m.user_id] ?? 0,
      }))

      // Auto-repair: owner missing from members → add them silently then reload
      const isMember = enriched.some((m) => m.user_id === user.id)
      if (!isMember && currentWorkspace.owner_id === user.id) {
        const res = await fetch('/api/workspaces/repair-owner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: currentWorkspace.id }),
        })
        const json = await res.json()
        if (json.repaired) {
          // Re-fetch via admin route after repair
          const freshRes = await fetch(`/api/workspaces/members?workspaceId=${currentWorkspace.id}`)
          const freshRaw: MemberWithProfile[] = freshRes.ok ? await freshRes.json() : []
          const freshEnriched = freshRaw.map((m) => ({ ...m, taskCount: taskCountMap[m.user_id] ?? 0 }))
          setMembers(freshEnriched)
          setMyRole('owner')
          setLoading(false)
          const { data: invitations } = await supabase
            .from('workspace_invitations')
            .select('id, email, role, created_at, expires_at, token')
            .eq('workspace_id', currentWorkspace.id)
            .is('accepted_at', null)
            .gt('expires_at', new Date().toISOString())
          setPending((invitations ?? []) as PendingInvitation[])
          return
        }
      }

      setMembers(enriched)
      const me = enriched.find((m) => m.user_id === user.id)
      if (me) setMyRole(me.role)

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
      console.error('loadAll error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Live search — name OR email via server route (admin client bypasses RLS)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults([])
      return
    }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q })
        if (currentWorkspace?.id) params.set('workspaceId', currentWorkspace.id)
        const res = await fetch(`/api/profiles/search?${params}`)
        const data = await res.json()
        setSearchResults(Array.isArray(data) ? data as SearchedProfile[] : [])
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
  }, [searchQuery, currentWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function resetInviteDialog() {
    setSearchQuery('')
    setSearchResults([])
    setSelectedProfile(null)
    setWelcomeMsg('')
    setInviteRole('member')
    setInviteResult(null)
    setInviting(false)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id) return

    // Need either a selected profile OR a raw email
    const email = selectedProfile?.email ?? searchQuery.trim()
    if (!email || !email.includes('@')) {
      toast.error('Saisissez un email valide ou sélectionnez un profil')
      return
    }

    setInviting(true)
    setInviteResult(null)
    try {
      const res = await fetch('/api/workspaces/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: currentWorkspace.id,
          email,
          role: inviteRole,
          welcomeMessage: welcomeMsg.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erreur serveur')

      setInviteResult({
        type: json.type,
        inviteUrl: json.inviteUrl,
        name: json.member?.name ?? selectedProfile?.full_name ?? email,
        dmId: json.dmConversationId,
      })

      if (json.type === 'added') {
        toast.success(`${json.member?.name ?? email} ajouté à l'espace !`)
      } else {
        toast.success(`Lien d'invitation créé pour ${email}`)
      }

      loadAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible d\'inviter')
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(memberId: string, role: 'admin' | 'member' | 'viewer') {
    try {
      const { error } = await getSupabaseClient()
        .from('workspace_members')
        .update({ role })
        .eq('id', memberId)
      if (error) throw error
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)))
      toast.success('Rôle mis à jour')
    } catch {
      toast.error('Échec de la mise à jour')
    }
  }

  async function handleRemove(member: MemberWithProfile) {
    if (!confirm(`Retirer ${member.profile?.full_name ?? member.profile?.email ?? 'ce membre'} ?`)) return
    try {
      const { error } = await getSupabaseClient()
        .from('workspace_members')
        .delete()
        .eq('id', member.id)
      if (error) throw error
      setMembers((prev) => prev.filter((m) => m.id !== member.id))
      toast.success('Membre retiré')
    } catch {
      toast.error('Impossible de retirer le membre')
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
      .limit(40)
    setAvailableTasks((data ?? []) as { id: string; title: string; status: string; assignee_id?: string | null }[])
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
      toast.success(`Assigné à ${assignTarget.profile?.full_name ?? 'ce membre'}`)
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
    if (!currentWorkspace?.id) return
    try {
      const res = await fetch('/api/messages/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dm', workspaceId: currentWorkspace.id, memberIds: [memberId] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur')
      router.push(`/${slug}/messages/${data.id}`)
    } catch {
      toast.error('Impossible d\'ouvrir la conversation')
    }
  }

  const initials = (m: MemberWithProfile) =>
    (m.profile?.full_name ?? m.profile?.email ?? '?')
      .split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Membres</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {members.length} membre{members.length !== 1 ? 's' : ''}
            {pending.length > 0 && ` · ${pending.length} en attente`}
          </p>
        </div>
        {canManage && (
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => { resetInviteDialog(); setInviteOpen(true) }}
          >
            <UserPlus className="h-4 w-4" />
            Inviter un collègue
          </Button>
        )}
      </div>

      <Separator />

      {/* Member list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-accent/30 transition-colors group"
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={member.profile?.avatar_url ?? undefined} />
                <AvatarFallback className="text-xs font-semibold">{initials(member)}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">
                    {member.profile?.full_name ?? member.profile?.email ?? '—'}
                    {member.user_id === user?.id && (
                      <span className="text-xs text-muted-foreground ml-1">(vous)</span>
                    )}
                  </span>
                  <Badge className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[member.role] ?? ROLE_COLORS.member}`}>
                    {member.role === 'owner' && <Crown className="h-2.5 w-2.5 mr-0.5 inline" />}
                    {ROLE_LABELS[member.role] ?? member.role}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-muted-foreground">
                  <span className="truncate">{member.profile?.email}</span>
                  {(member.taskCount ?? 0) > 0 && (
                    <span className="flex items-center gap-0.5">
                      <CheckSquare className="h-3 w-3" />
                      {member.taskCount} tâche{(member.taskCount ?? 0) > 1 ? 's' : ''}
                    </span>
                  )}
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(member.joined_at), { locale: fr, addSuffix: true })}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {member.user_id !== user?.id && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Message"
                    onClick={() => openDM(member.user_id)}>
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Assigner des tâches"
                  onClick={() => openAssignTasks(member)}>
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
                      <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Changer le rôle</p>
                      {(['admin', 'member', 'viewer'] as const).map((r) => (
                        <DropdownMenuItem key={r} onClick={() => handleRoleChange(member.id, r)}
                          className="gap-2">
                          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                          {ROLE_LABELS[r]}
                          {member.role === r && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-primary" />}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive gap-2" onClick={() => handleRemove(member)}>
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
            <h2 className="text-sm font-medium text-muted-foreground">Invitations en attente ({pending.length})</h2>
            {pending.map((inv) => (
              <div key={inv.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-border">
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
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Copier le lien"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`)
                    toast.success('Lien copié !')
                  }}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive"
                  onClick={() => handleCancelInvite(inv.id)}>
                  Annuler
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Invite Dialog ─────────────────────────────────────────────── */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) resetInviteDialog() }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Inviter un collègue</DialogTitle>
          </DialogHeader>

          {inviteResult ? (
            /* Result screen */
            <div className="space-y-4 py-2">
              {inviteResult.type === 'added' ? (
                <>
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                    <div>
                      <p className="font-medium">{inviteResult.name} a rejoint l&apos;espace !</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Une conversation directe a été créée automatiquement.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {inviteResult.dmId && (
                      <Button className="flex-1 gap-1.5" onClick={() => {
                        setInviteOpen(false)
                        router.push(`/${slug}/messages/${inviteResult.dmId}`)
                      }}>
                        <MessageSquare className="h-4 w-4" />
                        Ouvrir la conversation
                      </Button>
                    )}
                    <Button variant="outline" className="flex-1" onClick={resetInviteDialog}>
                      Inviter quelqu&apos;un d&apos;autre
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <Mail className="h-10 w-10 text-primary" />
                    <div>
                      <p className="font-medium">Lien d&apos;invitation créé</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Partagez ce lien avec <strong>{inviteResult.name}</strong>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Input value={inviteResult.inviteUrl ?? ''} readOnly className="text-xs flex-1" />
                    <Button variant="outline" size="icon" onClick={() => {
                      navigator.clipboard.writeText(inviteResult.inviteUrl ?? '')
                      toast.success('Lien copié !')
                    }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full" onClick={resetInviteDialog}>
                    Inviter quelqu&apos;un d&apos;autre
                  </Button>
                </>
              )}
            </div>
          ) : (
            /* Invite form */
            <form onSubmit={handleInvite} className="space-y-4 py-2">

              {/* Search / email field */}
              <div className="space-y-1.5">
                <Label>Nom, prénom ou email</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-8"
                    placeholder="Rechercher ou saisir un email…"
                    value={selectedProfile ? (selectedProfile.full_name ?? selectedProfile.email) : searchQuery}
                    onChange={(e) => {
                      setSelectedProfile(null)
                      setSearchQuery(e.target.value)
                    }}
                    autoFocus
                  />
                  {searching && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>

                {/* Selected profile chip */}
                {selectedProfile && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarImage src={selectedProfile.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">
                        {(selectedProfile.full_name ?? selectedProfile.email)[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{selectedProfile.full_name ?? selectedProfile.email}</p>
                      {selectedProfile.full_name && (
                        <p className="text-[10px] text-muted-foreground">{selectedProfile.email}</p>
                      )}
                    </div>
                    <button type="button" className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => { setSelectedProfile(null); setSearchQuery('') }}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Live search dropdown */}
                {!selectedProfile && searchResults.length > 0 && (
                  <div className="rounded-lg border border-border bg-popover shadow-md overflow-hidden">
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedProfile(p); setSearchQuery(''); setSearchResults([]) }}
                        className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-accent transition-colors text-left"
                      >
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={p.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {(p.full_name ?? p.email)[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.full_name ?? p.email}</p>
                          {p.full_name && <p className="text-xs text-muted-foreground truncate">{p.email}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* No results — suggest invite by link */}
                {!selectedProfile && !searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                    <User className="h-4 w-4 shrink-0" />
                    {searchQuery.includes('@')
                      ? `Aucun compte trouvé — un lien d'invitation sera créé pour ${searchQuery}`
                      : 'Aucun résultat. Essayez avec l\'adresse email complète.'}
                  </div>
                )}
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <Label>Rôle</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin — gère membres, projets, paramètres</SelectItem>
                    <SelectItem value="member">Membre — crée et modifie le contenu</SelectItem>
                    <SelectItem value="viewer">Lecteur — accès en lecture seule</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Welcome message */}
              <div className="space-y-1.5">
                <Label>
                  Message de bienvenue
                  <span className="text-muted-foreground font-normal ml-1">(optionnel)</span>
                </Label>
                <Textarea
                  placeholder="Bienvenue dans l'équipe ! Heureux de t'avoir avec nous…"
                  value={welcomeMsg}
                  onChange={(e) => setWelcomeMsg(e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Envoyé automatiquement dans la conversation directe à l&apos;arrivée.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full gap-1.5"
                disabled={inviting || (!selectedProfile && !searchQuery.trim())}
              >
                {inviting
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Envoi en cours…</>
                  : <><UserPlus className="h-4 w-4" /> Inviter</>
                }
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
              Assigner des tâches — {assignTarget?.profile?.full_name ?? assignTarget?.profile?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 max-h-80 overflow-auto py-2">
            {availableTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aucune tâche active disponible
              </p>
            ) : (
              availableTasks.map((task) => {
                const isAssigned = task.assignee_id === assignTarget?.user_id
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => !isAssigned && handleAssignTask(task.id)}
                    disabled={isAssigned || assigningTask === task.id}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      isAssigned
                        ? 'bg-primary/5 border-primary/20 cursor-default'
                        : 'hover:bg-accent border-border cursor-pointer'
                    }`}
                  >
                    {assigningTask === task.id
                      ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                      : isAssigned
                        ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        : <CheckSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                    }
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
