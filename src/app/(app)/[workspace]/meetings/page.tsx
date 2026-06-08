'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Video, Clock, Users } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import type { Meeting } from '@/types/database'

interface Props {
  params: Promise<{ workspace: string }>
}

const STATUS_BADGE: Record<Meeting['status'], string> = {
  scheduled: 'bg-yellow-500/10 text-yellow-500',
  active: 'bg-green-500/10 text-green-500',
  ended: 'bg-muted text-muted-foreground',
}

export default function MeetingsPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const { currentWorkspace } = useWorkspaceStore()
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentWorkspace?.id) return
    getSupabaseClient()
      .from('meetings')
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .order('scheduled_at', { ascending: false })
      .then(({ data }) => { setMeetings(data ?? []); setLoading(false) })
      .then(undefined, (e) => { console.error(e); setLoading(false) })
  }, [currentWorkspace?.id])

  async function createMeeting(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id || !user?.id || !title.trim()) return
    const roomId = crypto.randomUUID()
    try {
      const { data, error } = await getSupabaseClient()
        .from('meetings')
        .insert({
          workspace_id: currentWorkspace.id,
          title: title.trim(),
          host_id: user.id,
          room_id: roomId,
          status: 'scheduled',
          scheduled_at: scheduledAt || null,
        })
        .select()
        .single()
      if (error) throw error
      setMeetings((prev) => [data, ...prev])
      setCreateOpen(false)
      setTitle('')
      toast.success('Réunion créée')
      router.push(`/${slug}/meetings/${data.id}`)
    } catch {
      toast.error('Impossible de créer la réunion')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Réunions</h1>
        <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nouvelle réunion
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">Chargement…</div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <Video className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Aucune réunion</p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Créer une réunion
            </Button>
          </div>
        ) : (
          meetings.map((meeting) => (
            <Card
              key={meeting.id}
              className="p-4 hover:bg-accent transition-colors cursor-pointer"
              onClick={() => router.push(`/${slug}/meetings/${meeting.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{meeting.title}</span>
                    <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${STATUS_BADGE[meeting.status]}`}>
                      {meeting.status}
                    </Badge>
                  </div>
                  {meeting.scheduled_at && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {format(new Date(meeting.scheduled_at), 'MMM d, yyyy · h:mm a')}
                    </div>
                  )}
                </div>
                {meeting.status === 'active' && (
                  <Badge className="bg-green-500 text-white text-[10px]">LIVE</Badge>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouvelle réunion</DialogTitle>
          </DialogHeader>
          <form onSubmit={createMeeting} className="space-y-4">
            <div className="space-y-2">
              <Label>Titre</Label>
              <Input
                placeholder="Réunion hebdomadaire"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Planifier (optionnel)</Label>
              <Input
                type="datetime-local"
                className="text-sm"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" size="sm">Créer et rejoindre</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
