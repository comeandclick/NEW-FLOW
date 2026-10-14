'use client'
// Demandes envoyées à l'Atelier depuis « Lancer » (14/10/2026) : état simple, et Annuler / Relancer / Retirer.
// Le détail (étapes, tâches, vidéo) est dans « Productions » dès que l'Atelier a créé la fiche.
import { useState } from 'react'
import { Loader2, RotateCcw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, EmptyState } from '@/components/ui/misc'
import { studioApi, usePoll, type LiveJob } from '@/lib/studio/api'
import { cn } from '@/lib/utils'

const ETAT: Record<string, [string, string]> = {
  draft: ['Brouillon', 'text-text-3'], queued: ['En attente du Mac', 'text-text-2'], starting: ['L\'agent démarre', 'text-sky-500'], running: ['L\'agent travaille', 'text-sky-500'],
  paused: ['En pause', 'text-text-3'], needs_answer: ['Question pour toi', 'text-amber-500'], done: ['Prête à valider', 'text-emerald-500'], failed: ['Arrêtée avant la fin', 'text-rose-500'], cancelled: ['Annulée', 'text-text-3'],
}
const ETAPES: Record<string, string> = { reflexion: 'Réflexion', deroule: 'Déroulé', images_cles: 'Images clés', montage: 'Montage', voix: 'Voix', bruitages: 'Bruitages', musique: 'Musique', mixage: 'Mixage', verification: 'Vérifications', export: 'Export', envoi: 'Envoi', deliver: 'Envoi',
  comprehension: 'Compréhension', coffre: 'Coffre Obsidian', design: 'Design', construction: 'Construction', contenu: 'Contenus', polissage: 'Polissage', deploiement: 'Mise en ligne', livraison: 'Livraison' }

export function DemandesAtelier({ onVoir, kind = 'motion' }: { onVoir?: () => void; kind?: 'motion' | 'site' }) {
  const { data, refresh } = usePoll(studioApi.jobs, 6000, true)
  const [occupe, setOccupe] = useState<string | null>(null)
  const jobs = (data?.jobs ?? []).filter((j) => j.kind === kind).slice(0, 8)
  const agir = async (j: LiveJob, quoi: 'cancel' | 'retry' | 'remove') => {
    if (quoi === 'cancel' && !confirm(`Annuler « ${j.title} » ? L'agent s'arrête.`)) return
    setOccupe(j.id)
    try { if (quoi === 'remove') await studioApi.remove(j.id); else await studioApi.control(j.id, quoi); await refresh() } catch { toast.error('Action impossible') } finally { setOccupe(null) }
  }
  if (!jobs.length) return <Card><EmptyState title="Aucune demande pour l'instant" hint={kind === 'site' ? "Les sites lancés ici partent vers l'Atelier du Mac, puis apparaissent dans « Projets »." : "Les vidéos lancées ici partent vers l'Atelier du Mac, puis apparaissent dans « Productions »."} /></Card>
  return (
    <Card className="divide-y divide-border">
      {jobs.map((j) => {
        const [lib0, cls] = ETAT[j.status] ?? [j.status, '']
        const lib = kind === 'site' && j.status === 'done' ? 'Prêt à valider' : lib0
        const actif = ['queued', 'starting', 'running', 'needs_answer', 'paused'].includes(j.status)
        return (
          <div key={j.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{j.title}</p>
              <p className={cn('flex items-center gap-1.5 text-xs', cls)}>
                {(j.status === 'running' || j.status === 'starting') && <Loader2 className="size-3 animate-spin" />}
                {lib}{j.status === 'running' && j.step ? ` · ${ETAPES[j.step] ?? j.step} · ${j.progress} %` : ''}
                <span className="text-text-3">· {new Date(j.createdAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </p>
            </div>
            {j.status === 'done' && onVoir && <Button size="sm" variant="outline" onClick={onVoir}>Voir</Button>}
            {actif && <Button size="icon" variant="ghost" aria-label="Annuler" loading={occupe === j.id} onClick={() => void agir(j, 'cancel')}><X className="size-4" /></Button>}
            {(j.status === 'failed' || j.status === 'cancelled') && <Button size="sm" variant="outline" loading={occupe === j.id} onClick={() => void agir(j, 'retry')}><RotateCcw className="size-3.5" />Relancer</Button>}
            {!actif && <Button size="icon" variant="ghost" aria-label="Retirer de la liste" onClick={() => void agir(j, 'remove')}><Trash2 className="size-3.5" /></Button>}
          </div>
        )
      })}
    </Card>
  )
}
