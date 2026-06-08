'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { messagesService } from '@/services/messages.service'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Hash, Lock, MessageSquare, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import type { ConversationWithMembers } from '@/types/database'
import Link from 'next/link'

interface Props {
  params: Promise<{ workspace: string }>
}

export default function MessagesPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [conversations, setConversations] = useState<ConversationWithMembers[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [channelName, setChannelName] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentWorkspace?.id || !user?.id) return
    messagesService
      .getConversations(currentWorkspace.id, user.id)
      .then((data) => setConversations(data as unknown as ConversationWithMembers[]))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [currentWorkspace?.id, user?.id])

  async function createChannel(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id || !user?.id || !channelName.trim()) return
    try {
      const conv = await messagesService.createChannel(
        currentWorkspace.id,
        user.id,
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

  const channels = conversations.filter((c) => c.type === 'channel')
  const dms = conversations.filter((c) => c.type !== 'channel')

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Messages</h1>
        <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nouveau canal
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        ) : (
          <>
            {channels.length > 0 && (
              <section className="space-y-1">
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">Canaux</h2>
                {channels.map((conv) => (
                  <Link key={conv.id} href={`/${slug}/messages/${conv.id}`}>
                    <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-accent transition-colors cursor-pointer">
                      {conv.is_private ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : <Hash className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className="text-sm">{conv.name}</span>
                    </div>
                  </Link>
                ))}
              </section>
            )}

            {dms.length > 0 && (
              <section className="space-y-1">
                <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">Messages directs</h2>
                {dms.map((conv) => {
                  const otherMember = conv.members?.find((m: { user_id: string }) => m.user_id !== user?.id)
                  const memberWithProfile = otherMember as { profile?: { full_name?: string; email: string } } | undefined
                  return (
                    <Link key={conv.id} href={`/${slug}/messages/${conv.id}`}>
                      <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-accent transition-colors cursor-pointer">
                        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">
                          {memberWithProfile?.profile?.full_name ?? memberWithProfile?.profile?.email ?? 'Inconnu'}
                        </span>
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
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Créer un canal
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouveau canal</DialogTitle>
          </DialogHeader>
          <form onSubmit={createChannel} className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du canal</Label>
              <Input
                placeholder="general"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Canal privé</Label>
              <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>
            <Button type="submit" className="w-full" size="sm">Créer le canal</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
