'use client'

import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  entityType: string
  entityId: string
  entityTitle: string
  entityUrl: string
  className?: string
  size?: 'sm' | 'default'
}

export function FavoriteButton({ entityType, entityId, entityTitle, entityUrl, className, size = 'sm' }: Props) {
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [isFav, setIsFav] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user?.id || !currentWorkspace?.id) return
    getSupabaseClient()
      .from('favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('workspace_id', currentWorkspace.id)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .maybeSingle()
      .then(({ data }) => setIsFav(!!data))
  }, [user?.id, currentWorkspace?.id, entityType, entityId])

  async function toggle() {
    if (!user?.id || !currentWorkspace?.id || loading) return
    setLoading(true)
    try {
      if (isFav) {
        await getSupabaseClient()
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('entity_type', entityType)
          .eq('entity_id', entityId)
        setIsFav(false)
        toast.success('Retiré des favoris')
      } else {
        await getSupabaseClient()
          .from('favorites')
          .insert({
            user_id: user.id,
            workspace_id: currentWorkspace.id,
            entity_type: entityType,
            entity_id: entityId,
            entity_title: entityTitle,
            entity_url: entityUrl,
          })
        setIsFav(true)
        toast.success('Ajouté aux favoris')
      }
    } catch {
      toast.error('Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size={size === 'sm' ? 'icon' : 'default'}
      className={cn('shrink-0', size === 'sm' && 'h-7 w-7', className)}
      onClick={toggle}
      disabled={loading}
      title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
    >
      <Star className={cn('h-3.5 w-3.5 transition-colors', isFav && 'fill-yellow-400 text-yellow-400')} />
    </Button>
  )
}
