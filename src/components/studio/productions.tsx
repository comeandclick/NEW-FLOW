'use client'
// Onglet « Productions » de la page Motion de Flow (Agent 2 / seikqit, 14/10/2026) :
// les vidéos suivies par le logiciel Atelier sur le Mac, en résumé pour l'iPhone : étape, avancement, résumé court,
// todo, et la vidéo finie lisible directement. Mise à jour en direct (table motion_projets, écrite par Atelier).
// Table : supabase/motion_projets.sql (écrite par le logiciel Atelier et la commande `atelier`, clé serveur).
import { useState } from 'react'
import { CalendarDays, Check, ChevronDown, Film, Play } from 'lucide-react'
import { Card, EmptyState } from '@/components/ui/misc'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { signedUrl } from '@/lib/storage'
import { cn } from '@/lib/utils'

type Production = {
  projet: string; titre: string; client: string; serie: string | null; numero: number | null; statut: string; avancement: number
  etape: string | null; resume: string | null; todo: { texte: string; fait: boolean }[]; video_chemin: string | null; video_nom: string | null
  publication_prevue: string | null; maj: string
}
const STATUT: Record<string, [string, string]> = {
  en_cours: ['En cours', 'text-sky-400 bg-sky-400/10'], a_valider: ['À valider', 'text-amber-400 bg-amber-400/10'], a_corriger: ['À corriger', 'text-rose-400 bg-rose-400/10'],
  valide: ['Validée', 'text-emerald-400 bg-emerald-400/10'], publie: ['Publiée', 'text-emerald-400 bg-emerald-400/10'], en_pause: ['En pause', 'text-muted bg-surface-2'],
}
const COULEUR: Record<string, string> = { Kalimat: '#cfaa7b', Lumora: '#e9e9ee' }
const ORDRE = ['en_cours', 'a_valider', 'a_corriger', 'en_pause', 'valide', 'publie']

function Carte({ p }: { p: Production }) {
  const [ouvert, setOuvert] = useState(p.statut === 'a_valider')
  const [url, setUrl] = useState<string | null>(null)
  const [chargement, setChargement] = useState(false)
  const [lib, cls] = STATUT[p.statut] ?? [p.statut, '']
  const restant = p.todo.filter((t) => !t.fait).length
  async function lire() {
    if (!p.video_chemin || url) return
    setChargement(true)
    try { setUrl(await signedUrl('files', p.video_chemin)) } finally { setChargement(false) }
  }
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <button className="flex w-full items-start gap-3 text-left" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}>
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: COULEUR[p.client] ?? '#8b8f98' }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{p.numero ? <span className="mr-1.5 text-accent">n° {p.numero}</span> : null}{p.titre}</span>
          <span className="block truncate text-xs text-muted">{p.client}{p.serie ? ` · ${p.serie}` : ''}{p.etape ? ` · ${p.etape}` : ''}</span>
        </span>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', cls)}>{lib}</span>
        <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-muted transition-transform', ouvert && 'rotate-180')} aria-hidden />
      </button>
      <div className="mt-3 flex items-center gap-3" aria-label={`Avancement ${p.avancement} %`}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${p.avancement}%` }} /></div>
        <span className="w-10 text-right text-xs font-semibold tabular-nums">{p.avancement} %</span>
      </div>
      {ouvert && (
        <div className="mt-3 space-y-3">
          {p.resume && <p className="text-sm text-muted">{p.resume}</p>}
          {p.publication_prevue && <p className="flex items-center gap-1.5 text-xs text-muted"><CalendarDays className="size-3.5" aria-hidden />Publication prévue le {new Date(p.publication_prevue).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
          {p.todo.length > 0 && (
            <ul className="space-y-1.5">
              <li className="text-[11px] font-semibold uppercase tracking-wider text-muted">À faire · {restant}/{p.todo.length}</li>
              {p.todo.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded border', t.fait ? 'border-emerald-500 bg-emerald-500 text-black' : 'border-border-strong')}>{t.fait && <Check className="size-3" />}</span>
                  <span className={cn(t.fait && 'text-muted line-through')}>{t.texte}</span>
                </li>
              ))}
            </ul>
          )}
          {p.video_chemin && (url
            ? <video src={url} controls playsInline className="w-full rounded-xl bg-black" />
            : <button onClick={lire} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 text-sm font-semibold" disabled={chargement}>
                <Play className="size-4" aria-hidden />{chargement ? 'Chargement…' : 'Regarder la vidéo'}
              </button>)}
          <p className="text-[11px] text-muted">Mis à jour {new Date(p.maj).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      )}
    </div>
  )
}

export function Productions() {
  const { ws } = useWorkspace()
  const { data, loading, error } = useLive<Production>('motion_projets', { eq: { workspace_id: ws?.id }, order: ['maj', false], enabled: !!ws?.id })
  const tri = [...data].sort((a, b) => ORDRE.indexOf(a.statut) - ORDRE.indexOf(b.statut) || (b.maj ?? '').localeCompare(a.maj ?? ''))
  // table pas encore créée dans la base : message clair plutôt qu'une erreur
  if (error) return <Card><EmptyState icon={<Film className="size-5" />} title="Bientôt disponible" hint="Le suivi des vidéos d'Atelier s'affichera ici dès que la table « motion_projets » sera créée." /></Card>
  if (!loading && !tri.length) return <Card><EmptyState icon={<Film className="size-5" />} title="Aucune production" hint="Les vidéos suivies par le logiciel Atelier sur le Mac apparaîtront ici." /></Card>
  return (
    <section className="space-y-3" aria-label="Productions motion">
      {tri.map((p) => <Carte key={p.projet} p={p} />)}
    </section>
  )
}
