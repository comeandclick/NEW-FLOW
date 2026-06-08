'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { messagesService } from '@/services/messages.service'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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

interface Props {
  params: Promise<{ workspace: string }>
}

interface WorkspaceMember {
  user_id: string
  profile: { id: string; full_name?: string | null; avatar_url?: string | null; email: string }
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
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [memberSearch, setMemberSearch] = useState('')

  useEffect(() => {
    if (!currentWorkspace?.id || !user?.id) return
    messagesService
      .getConversations(currentWorkspace.id, user.id)
      .then((data) => setConversations(data as unknown as ConversationWithMembers[]))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [currentWorkspace?.id, user?.id])

  // Load members for DM dialog
  useEffect(() => {
    if (!dmOpen || !currentWorkspace?.id) return
    getSupabaseClient()
      .from('workspace_members')
      .select('user_id, profile:profiles(id, full_name, avatar_url, email)')
      .eq('workspace_id', currentWorkspace.id)
      .then(({ data }) => {
        if (data) setMembers((data as unknown as WorkspaceMember[]).filter((m) => m.user_id !== user?.id))
      })
  }, [dmOpen, currentWorkspace?.id, user?.id])

  async function createChannel(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id || !user?.id || !channelName.trim()) return
    try {
      const conv = await messagesService.createChannel(
        currentWorkspace.id, user.id,
        channelName.trim().toLowerCase().replace(/\s+/g, '-'),
        isPrivate
      )
      setCreateOpen(false)
      setChannelName('')
      router.push(`/${slug}/messages/${conv.id}`)
    } catch {
      toast.error('Impossible de créer le canal')
    }
  }

  async function startDM(memberId: string) {
    if (!currentWorkspace?.id || !user?.id) return
    try {
      const conv = await messagesService.createDM(currentWorkspace.id, [user.id, memberId])
      setDmOpen(false)
      router.push(`/${slug}/messages/${conv.id}`)
    } catch {
      toast.error('Impossible de démarrer la conversation')
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
  const filteredMembers = members.filter((m) =>
    (m.profile?.full_name ?? m.profile?.email ?? '').toLowerCase().includes(memberSearch.toLowerCase())
  )

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
                        {unread > 0 && (
                          <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                        )}
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
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarImage src={otherMember?.profile?.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[9px]">
                            {otherMember?.profile?.full_name?.[0] ?? otherMember?.profile?.email?.[0] ?? '?'}
                          </AvatarFallback>
                        </Avatar>
                        <span className={`text-sm flex-1 truncate ${unread ? 'font-semibold' : ''}`}>
                          {otherMember?.profile?.full_name ?? otherMember?.profile?.email ?? 'Inconnu'}
                        </span>
                        {unread > 0 && <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />}
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
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau canal</DialogTitle>
          </DialogHeader>
          <form onSubmit={createChannel} className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du canal</Label>
              <Input placeholder="general" value={channelName}
                onChange={(e) => setChannelName(e.target.value)} required autoFocus />
              <p className="text-xs text-muted-foreground">Espaces convertis en tirets, minuscules.</p>
            </div>
            <div className="flex items-center justify-between">
              <Label>Canal privé</Label>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>
            <Button type="submit" className="w-full" size="sm">Créer le canal</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* New DM dialog */}
      <Dialog open={dmOpen} onOpenChange={setDmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau message direct</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Rechercher un membre…"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              autoFocus
            />
            <div className="space-y-1 max-h-60 overflow-auto">
              {filteredMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun membre trouvé</p>
              ) : (
                filteredMembers.map((m) => (
                  <button
                    key={m.user_id}
                    onClick={() => startDM(m.user_id)}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
                  >
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[10px]">
                        {m.profile?.full_name?.[0] ?? m.profile?.email?.[0]}
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
