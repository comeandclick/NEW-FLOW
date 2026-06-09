'use client'

import { use, useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Trash2, RotateCcw, AlertTriangle, FileText, CheckSquare, FolderOpen, Briefcase } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { TrashItem } from '@/types/database'

interface Props { params: Promise<{ workspace: string }> }

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  task: { label: 'Tâche', icon: CheckSquare, color: 'text-blue-500' },
  note: { label: 'Note', icon: FileText, color: 'text-green-500' },
  file: { label: 'Fichier', icon: FolderOpen, color: 'text-orange-500' },
  project: { label: 'Projet', icon: Briefcase, color: 'text-purple-500' },
}

export default function TrashPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)

  useEffect(() => {
    if (!currentWorkspace?.id) return
    load()
  }, [currentWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    if (!currentWorkspace?.id) return
    setLoading(true)
    const { data } = await getSupabaseClient()
      .from('trash_items')
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .order('deleted_at', { ascending: false })
    setItems((data ?? []) as TrashItem[])
    setLoading(false)
  }

  async function restore(item: TrashItem) {
    if (!currentWorkspace?.id || !user?.id) return
    setRestoring(item.id)
    try {
      const data = item.entity_data as Record<string, unknown>
      // Remove deleted_at from restored data
      const { deleted_at, ...restoreData } = data as Record<string, unknown> & { deleted_at?: unknown }
      void deleted_at

      if (item.entity_type === 'task') {
        await getSupabaseClient().from('tasks').update({ deleted_at: null }).eq('id', item.entity_id)
      } else if (item.entity_type === 'note') {
        await getSupabaseClient().from('notes').update({ deleted_at: null }).eq('id', item.entity_id)
      }
      // Remove from trash
      await getSupabaseClient().from('trash_items').delete().eq('id', item.id)
      setItems(prev => prev.filter(t => t.id !== item.id))
      toast.success(`"${item.entity_title}" restauré`)
      void restoreData
    } catch {
      toast.error('Impossible de restaurer')
    } finally {
      setRestoring(null)
    }
  }

  async function permanentDelete(item: TrashItem) {
    if (!currentWorkspace?.id) return
    try {
      // Permanently delete entity
      if (item.entity_type === 'task') {
        await getSupabaseClient().from('tasks').delete().eq('id', item.entity_id)
      } else if (item.entity_type === 'note') {
        await getSupabaseClient().from('notes').delete().eq('id', item.entity_id)
      } else if (item.entity_type === 'file') {
        await getSupabaseClient().from('files').delete().eq('id', item.entity_id)
      }
      // Remove from trash
      await getSupabaseClient().from('trash_items').delete().eq('id', item.id)
      setItems(prev => prev.filter(t => t.id !== item.id))
      toast.success('Supprimé définitivement')
    } catch {
      toast.error('Erreur lors de la suppression')
    }
  }

  async function emptyTrash() {
    if (!currentWorkspace?.id) return
    try {
      // Delete all entities permanently
      for (const item of items) {
        if (item.entity_type === 'task') await getSupabaseClient().from('tasks').delete().eq('id', item.entity_id)
        else if (item.entity_type === 'note') await getSupabaseClient().from('notes').delete().eq('id', item.entity_id)
        else if (item.entity_type === 'file') await getSupabaseClient().from('files').delete().eq('id', item.entity_id)
      }
      await getSupabaseClient().from('trash_items').delete().eq('workspace_id', currentWorkspace.id)
      setItems([])
      toast.success('Corbeille vidée')
    } catch {
      toast.error('Erreur')
    }
    setConfirmEmpty(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold">Corbeille</h1>
          <p className="text-xs text-muted-foreground">{items.length} élément{items.length !== 1 ? 's' : ''}</p>
        </div>
        {items.length > 0 && (
          <Button variant="destructive" size="sm" onClick={() => setConfirmEmpty(true)}>
            <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Vider la corbeille
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Trash2 className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">La corbeille est vide</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => {
              const cfg = TYPE_CONFIG[item.entity_type] ?? { label: item.entity_type, icon: FileText, color: 'text-muted-foreground' }
              const Icon = cfg.icon
              return (
                <div key={item.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
                  <Icon className={`h-5 w-5 shrink-0 ${cfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.entity_title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className="text-[10px]">{cfg.label}</Badge>
                      <span className="text-[10px] text-muted-foreground">
                        Supprimé {formatDistanceToNow(new Date(item.deleted_at), { addSuffix: true, locale: fr })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={restoring === item.id}
                      onClick={() => restore(item)}
                    >
                      <RotateCcw className="mr-1.5 h-3 w-3" />
                      {restoring === item.id ? 'Restauration…' : 'Restaurer'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => permanentDelete(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <AlertDialog open={confirmEmpty} onOpenChange={setConfirmEmpty}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Vider la corbeille ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les {items.length} élément{items.length !== 1 ? 's' : ''} seront supprimés définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={emptyTrash}>
              Vider définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
