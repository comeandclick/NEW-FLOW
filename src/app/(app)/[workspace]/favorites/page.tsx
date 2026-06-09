'use client'

import { use, useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Star, CheckSquare, FileText, FolderOpen, Video, MessageSquare, Target, Briefcase, X } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Favorite } from '@/types/database'

interface Props { params: Promise<{ workspace: string }> }

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  task: { label: 'Tâche', icon: CheckSquare, color: 'text-blue-500' },
  note: { label: 'Note', icon: FileText, color: 'text-green-500' },
  project: { label: 'Projet', icon: FolderOpen, color: 'text-cyan-500' },
  file: { label: 'Fichier', icon: FolderOpen, color: 'text-orange-500' },
  meeting: { label: 'Réunion', icon: Video, color: 'text-pink-500' },
  conversation: { label: 'Message', icon: MessageSquare, color: 'text-indigo-500' },
  goal: { label: 'Objectif', icon: Target, color: 'text-yellow-500' },
  crm_contact: { label: 'Contact CRM', icon: Briefcase, color: 'text-purple-500' },
}

export default function FavoritesPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentWorkspace?.id || !user?.id) return
    load()
  }, [currentWorkspace?.id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    if (!currentWorkspace?.id || !user?.id) return
    setLoading(true)
    const { data } = await getSupabaseClient()
      .from('favorites')
      .select('*')
      .eq('workspace_id', currentWorkspace.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setFavorites((data ?? []) as Favorite[])
    setLoading(false)
  }

  async function unpin(id: string) {
    await getSupabaseClient().from('favorites').delete().eq('id', id)
    setFavorites(prev => prev.filter(f => f.id !== id))
    toast.success('Retiré des favoris')
  }

  // Group by type
  const grouped: Record<string, Favorite[]> = {}
  for (const fav of favorites) {
    if (!grouped[fav.entity_type]) grouped[fav.entity_type] = []
    grouped[fav.entity_type].push(fav)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold">Favoris</h1>
          <p className="text-xs text-muted-foreground">{favorites.length} élément{favorites.length !== 1 ? 's' : ''} épinglé{favorites.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}
          </div>
        ) : favorites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Star className="h-12 w-12 text-muted-foreground" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Aucun favori</p>
              <p className="text-xs text-muted-foreground">Épinglez des tâches, notes, fichiers depuis n&apos;importe quel module</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([type, items]) => {
              const cfg = TYPE_CONFIG[type] ?? { label: type, icon: Star, color: 'text-muted-foreground' }
              const Icon = cfg.icon
              return (
                <section key={type} className="space-y-2">
                  <h2 className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                    {cfg.label}s
                  </h2>
                  <div className="space-y-1.5">
                    {items.map(fav => (
                      <div key={fav.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors group">
                        <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 shrink-0" />
                        <Link href={fav.entity_url} className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{fav.entity_title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Épinglé {formatDistanceToNow(new Date(fav.created_at), { addSuffix: true, locale: fr })}
                          </p>
                        </Link>
                        <Badge className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">{cfg.label}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => unpin(fav.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
