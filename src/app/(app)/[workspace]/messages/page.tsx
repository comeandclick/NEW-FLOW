'use client'

import { use, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { messagesService } from '@/services/messages.service'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Hash, Lock, MessageSquare, Plus, UserPlus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { getSupabaseClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { ConversationWithMembers } from '@/types/database'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface Props {
  params: Promise<{ workspace: string }>
}

interface WorkspaceMember {
  id: string
  user_id: string
  role: string
  profile: { id: string; full_name: string | null; avatar_url: string | null; email: string } | null
}

export default function MessagesPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [conversations, setConversations] = useState<ConversationWithMembers[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [dmOpen, setDmOpen] = useState(false)
  const [channelName, setChannelName] = useState('')
  const [channelDesc, setChannelDesc] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [memberSearch, setMemberSearch] = useState('')
  const [membersLoading, setMembersLoading] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presenceRef = useRef<any>(null)

  useEffect(() => {
    if (!currentWorkspace?.id || !user?.id) return
    const wsId = currentWorkspace.id
    const uid = user.id

    function reload() {
      messagesService
        .getConversations(wsId, uid)
        .then((data) => setConversations(data as unknown as ConversationWithMembers[]))
        .catch(console.error)
        .finally(() => setLoading(false))
    }
    reload()

    const channel = getSupabaseClient()
      .channel(`convlist:${wsId}:${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${uid}` }, reload)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `workspace_id=eq.${wsId}` }, reload)
      .subscribe()

    return () => { channel.unsubscribe() }
  }, [currentWorkspace?.id, user?.id])

  // Presence tracking
  useEffect(() => {
    if (!currentWorkspace?.id || !user?.id) return
    const ch = getSupabaseClient()
      .channel(`presence:messages:${currentWorkspace.id}`)
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState() as Record<string, Array<{ userId: string }>>
        const ids = new Set(Object.values(state).flat().map(p => p.userId))
        setOnlineUsers(ids)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ userId: user.id })
        }
      })
    presenceRef.current = ch
    return () => { ch.unsubscribe() }
  }, [currentWorkspace?.id, user?.id])

  // Load members via admin route (bypasses RLS join issue)
  useEffect(() => {
    if (!dmOpen || !currentWorkspace?.id || members.length > 0) return
    setMembersLoading(true)
    fetch(`/api/workspaces/members?workspaceId=${currentWorkspace.id}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: WorkspaceMember[]) => {
        setMembers(data.filter(m => m.user_id !== user?.id))
      })
      .catch(console.error)
      .finally(() => setMembersLoading(false))
  }, [dmOpen, currentWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function createChannel(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id || !channelName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/messages/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'channel',
          workspaceId: currentWorkspace.id,
          name: channelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
          isPrivate,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409 && data.existing) {
          toast.info('Canal déjà existant, redirection…')
          setCreateOpen(false)
          router.push(`/${slug}/messages/${data.existing.id}`)
          return
        }
        throw new Error(data.error ?? 'Erreur')
      }
      setCreateOpen(false)
      setChannelName('')
      setChannelDesc('')
      toast.success(`Canal #${data.name} créé`)
      router.push(`/${slug}/messages/${data.id}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Impossible de créer le canal')
    } finally {
      setSaving(false)
    }
  }

  async function startDM(memberId: string) {
    if (!currentWorkspace?.id) return
    setSaving(true)
    try {
      const res = await fetch('/api/messages/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'dm',
          workspaceId: currentWorkspace.id,
          memberIds: [memberId],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erreur')
      setDmOpen(false)
      router.push(`/${slug}/messages/${data.id}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Impossible de démarrer la conversation')
    } finally {
      setSaving(false)
    }
  }

  function getUnreadCount(conv: ConversationWithMembers): number {
    const member = (conv.members as Array<{ user_id: string; last_read_at?: string | null }>)
      ?.find((m) => m.user_id === user?.id)
    if (!member?.last_read_at || !conv.updated_at) return 0
    return new Date(conv.updated_at) > new Date(member.last_read_at) ? 1 : 0
  }

  const channels = conversations.filter((c) => c.type === 'channel')
  const dms = conversations.filter((c) => c.type !== 'channel')
  const filteredMembers = memberSearch.trim()
    ? members.filter((m) =>
        (m.profile?.full_name ?? m.profile?.email ?? '').toLowerCase().includes(memberSearch.toLowerCase())
      )
    : members

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Messages</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setDmOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" /> Message direct
          </Button>
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Canal
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-9 bg-muted rounded animate-pulse" />)}
          </div>
        ) : (
          <>
            {channels.length > 0 && (
              <section className="space-y-0.5">
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">Canaux</h2>
                {channels.map((conv) => {
                  const unread = getUnreadCount(conv)
                  return (
                    <Link key={conv.id} href={`/${slug}/messages/${conv.id}`}>
                      <div className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent transition-colors cursor-pointer group">
                        {conv.is_private
                          ? <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          : <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        }
                        <span className={`text-sm flex-1 ${unread ? 'font-semibold' : ''}`}>{conv.name}</span>
                        {unread > 0 && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                        {conv.updated_at && (
                          <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                            {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </section>
            )}

            {dms.length > 0 && (
              <section className="space-y-0.5">
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">Messages directs</h2>
                {dms.map((conv) => {
                  const otherMember = (conv.members as Array<{ user_id: string; profile?: { full_name?: string | null; avatar_url?: string | null; email: string } }>)
                    ?.find((m) => m.user_id !== user?.id)
                  const unread = getUnreadCount(conv)
                  return (
                    <Link key={conv.id} href={`/${slug}/messages/${conv.id}`}>
                      <div className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent transition-colors cursor-pointer">
                        <div className="relative shrink-0">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={otherMember?.profile?.avatar_url ?? undefined} />
                            <AvatarFallback className="text-[9px]">
                              {otherMember?.profile?.full_name?.[0] ?? otherMember?.profile?.email?.[0] ?? '?'}
                            </AvatarFallback>
                          </Avatar>
                          {otherMember && onlineUsers.has(otherMember.user_id) && (
                            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green-500 border border-background" />
                          )}
                        </div>
                        <span className={`text-sm flex-1 truncate ${unread ? 'font-semibold' : ''}`}>
                          {otherMember?.profile?.full_name ?? otherMember?.profile?.email ?? 'Inconnu'}
                        </span>
                        {conv.updated_at && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: false })}
                          </span>
                        )}
                        {unread > 0 && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                      </div>
                    </Link>
                  )
                })}
              </section>
            )}

            {conversations.length === 0 && (
              <div className="text-center py-12 space-y-3">
                <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">Aucune conversation</p>
                <div className="flex gap-2 justify-center">
                  <Button size="sm" variant="outline" onClick={() => setDmOpen(true)}>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Message direct
                  </Button>
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Créer un canal
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create channel dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setChannelName(''); setChannelDesc(''); setIsPrivate(false) } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hash className="h-4 w-4" /> Nouveau canal
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={createChannel} className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du canal *</Label>
              <div className="relative">
                <Hash className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-7"
                  placeholder="general, annonces, dev…"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">Minuscules, tirets uniquement.</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Canal privé</p>
                <p className="text-xs text-muted-foreground">Uniquement sur invitation</p>
              </div>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>
            <Button type="submit" className="w-full" size="sm" disabled={saving || !channelName.trim()}>
              {saving ? 'Création…' : 'Créer le canal'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* New DM dialog */}
      <Dialog open={dmOpen} onOpenChange={(o) => { setDmOpen(o); if (!o) setMemberSearch('') }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau message direct</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Filtrer par nom ou email…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              autoFocus
            />
            <div className="space-y-1 max-h-64 overflow-auto">
              {membersLoading ? (
                <div className="space-y-2 py-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
                </div>
              ) : filteredMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucun membre trouvé</p>
              ) : (
                filteredMembers.map((m) => (
                  <button
                    key={m.user_id}
                    onClick={() => startDM(m.user_id)}
                    disabled={saving}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left disabled:opacity-50"
                  >
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">
                        {(m.profile?.full_name ?? m.profile?.email ?? '?')[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{m.profile?.full_name ?? m.profile?.email}</p>
                      {m.profile?.full_name && (
                        <p className="text-xs text-muted-foreground truncate">{m.profile.email}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
