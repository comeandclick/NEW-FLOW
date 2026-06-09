'use client'

import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getSupabaseClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import Link from 'next/link'
import type { VersionHistory as VH } from '@/types/database'

interface Props {
  workspaceId: string
  workspaceSlug: string
}

const ENTITY_LABELS: Record<string, { label: string; color: string }> = {
  note: { label: 'Note', color: 'bg-emerald-500/10 text-emerald-500' },
  task: { label: 'Tâche', color: 'bg-blue-500/10 text-blue-500' },
}

export function VersionHistory({ workspaceId, workspaceSlug }: Props) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<VH[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !workspaceId) return
    setLoading(true)
    getSupabaseClient()
      .from('version_history')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setHistory((data ?? []) as VH[])
        setLoading(false)
      })
  }, [open, workspaceId])

  function getEntityUrl(item: VH) {
    if (item.entity_type === 'note') return `/${workspaceSlug}/notes/${item.entity_id}`
    if (item.entity_type === 'task') return `/${workspaceSlug}/tasks/${item.entity_id}`
    return `/${workspaceSlug}`
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Historique des modifications">
          <History className="h-4 w-4" />
        </Button>
      } />
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="text-sm font-medium">Historique des modifications</span>
        </div>
        <ScrollArea className="h-80">
          {loading ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
              Aucune modification récente
            </div>
          ) : (
            <div className="divide-y">
              {history.map((item) => {
                const meta = ENTITY_LABELS[item.entity_type] ?? { label: item.entity_type, color: 'bg-muted text-muted-foreground' }
                const fields = item.changed_fields as Record<string, unknown> | null
                const fieldNames = fields ? Object.keys(fields).join(', ') : null
                return (
                  <Link
                    key={item.id}
                    href={getEntityUrl(item)}
                    onClick={() => setOpen(false)}
                    className="flex gap-3 px-4 py-3 hover:bg-accent transition-colors cursor-pointer"
                  >
                    <Badge className={`${meta.color} text-[10px] h-5 shrink-0 mt-0.5`}>{meta.label}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.entity_title ?? 'Sans titre'}</p>
                      {fieldNames && (
                        <p className="text-xs text-muted-foreground truncate">Modifié : {fieldNames}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: fr })}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
