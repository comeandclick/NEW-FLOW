'use client'

import { use, useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Activity } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { ActivityLog } from '@/types/database'

interface Props { params: Promise<{ workspace: string }> }

type LogWithProfile = ActivityLog & {
  profile?: { id: string; full_name?: string | null; avatar_url?: string | null; email: string } | null
}

const ACTION_CONFIG: Record<string, { label: string; color: string }> = {
  'task.created': { label: 'a créé la tâche', color: 'bg-blue-500/10 text-blue-500' },
  'task.updated': { label: 'a mis à jour la tâche', color: 'bg-yellow-500/10 text-yellow-600' },
  'task.deleted': { label: 'a supprimé la tâche', color: 'bg-red-500/10 text-red-500' },
  'task.completed': { label: 'a terminé la tâche', color: 'bg-green-500/10 text-green-500' },
  'task.assigned': { label: 'a assigné la tâche', color: 'bg-purple-500/10 text-purple-500' },
  'note.created': { label: 'a créé la note', color: 'bg-emerald-500/10 text-emerald-500' },
  'note.updated': { label: 'a modifié la note', color: 'bg-yellow-500/10 text-yellow-600' },
  'note.deleted': { label: 'a supprimé la note', color: 'bg-red-500/10 text-red-500' },
  'message.sent': { label: 'a envoyé un message', color: 'bg-indigo-500/10 text-indigo-500' },
  'member.invited': { label: 'a invité un membre', color: 'bg-pink-500/10 text-pink-500' },
  'member.joined': { label: 'a rejoint l\'espace', color: 'bg-green-500/10 text-green-500' },
  'file.uploaded': { label: 'a uploadé un fichier', color: 'bg-orange-500/10 text-orange-500' },
  'project.created': { label: 'a créé le projet', color: 'bg-cyan-500/10 text-cyan-500' },
  'meeting.started': { label: 'a démarré une réunion', color: 'bg-violet-500/10 text-violet-500' },
}

export default function ActivityPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [logs, setLogs] = useState<LogWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 30

  useEffect(() => {
    if (!currentWorkspace?.id) return
    setPage(0)
    setLogs([])
    loadLogs(0)
  }, [currentWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadLogs(p: number) {
    if (!currentWorkspace?.id) return
    setLoading(true)
    const { data } = await getSupabaseClient()
      .from('activity_logs')
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)

    if (!data?.length) { setHasMore(false); setLoading(false); return }

    // Batch-fetch profiles
    const userIds = [...new Set(data.filter(l => l.user_id).map(l => l.user_id!))]
    const { data: profiles } = await getSupabaseClient()
      .from('profiles')
      .select('id, full_name, avatar_url, email')
      .in('id', userIds)
    const pm = new Map((profiles ?? []).map(p => [p.id, p]))

    const enriched = data.map(l => ({ ...l, profile: l.user_id ? pm.get(l.user_id) ?? null : null })) as LogWithProfile[]
    setLogs(prev => p === 0 ? enriched : [...prev, ...enriched])
    setHasMore(data.length === PAGE_SIZE)
    setLoading(false)
  }

  function loadMore() {
    const next = page + 1
    setPage(next)
    loadLogs(next)
  }

  // Group by date
  const grouped: { date: string; items: LogWithProfile[] }[] = []
  for (const log of logs) {
    const dateKey = format(new Date(log.created_at), 'yyyy-MM-dd')
    const group = grouped.find(g => g.date === dateKey)
    if (group) group.items.push(log)
    else grouped.push({ date: dateKey, items: [log] })
  }

  return (
    <div className="flex flex-col h-full page-enter">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
        <div>
          <h1 className="text-base sm:text-lg font-semibold">Journal d&apos;activité</h1>
          <p className="text-xs text-muted-foreground">Tout ce qui se passe dans votre espace</p>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 max-w-2xl mx-auto space-y-8">
          {loading && logs.length === 0 ? (
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded w-3/4 animate-pulse" />
                    <div className="h-2 bg-muted rounded w-1/2 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Activity className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aucune activité enregistrée</p>
            </div>
          ) : (
            <>
              {grouped.map(group => {
                const dateLabel = (() => {
                  const d = new Date(group.date)
                  const today = new Date()
                  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000)
                  if (diff === 0) return 'Aujourd\'hui'
                  if (diff === 1) return 'Hier'
                  return format(d, 'd MMMM yyyy', { locale: fr })
                })()

                return (
                  <section key={group.date} className="space-y-3">
                    <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider sticky top-0 bg-background py-1">{dateLabel}</h2>
                    <div className="space-y-3">
                      {group.items.map(log => {
                        const actionCfg = ACTION_CONFIG[log.action] ?? { label: log.action, color: 'bg-muted text-muted-foreground' }
                        const meta = log.metadata as Record<string, string> | null
                        return (
                          <div key={log.id} className="flex items-start gap-3">
                            <Avatar className="h-7 w-7 shrink-0">
                              <AvatarImage src={log.profile?.avatar_url ?? undefined} />
                              <AvatarFallback className="text-[9px]">
                                {log.profile?.full_name?.[0] ?? log.profile?.email?.[0] ?? '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium">{log.profile?.full_name ?? log.profile?.email ?? 'Système'}</span>
                                <Badge className={`${actionCfg.color} text-[10px]`}>{actionCfg.label}</Badge>
                                {meta?.entity_title && (
                                  <span className="text-sm font-medium truncate max-w-[200px]">&quot;{meta.entity_title}&quot;</span>
                                )}
                              </div>
                              {meta?.details && <p className="text-xs text-muted-foreground mt-0.5">{meta.details}</p>}
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: fr })}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}

              {hasMore && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
                    {loading ? 'Chargement…' : 'Charger plus'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
