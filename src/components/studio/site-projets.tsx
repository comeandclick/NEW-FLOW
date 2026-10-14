'use client'
// Site → « Projets » (14/10/2026) : les sites suivis par le logiciel Atelier du Mac, en résumé pour l'iPhone : type, statut,
// avancement, étape, lien en ligne, todo complète, ce qu'Aymen doit faire (domaine, e-mails…), notes.
// Table : supabase/site_projets.sql (écrite par l'Atelier et la commande `atelier site`, clé serveur). Aucun identifiant ici :
// ils restent sur le Mac, dans l'Atelier (on affiche seulement combien il y en a).
import { useMemo, useState } from 'react'
import { Check, ChevronDown, ExternalLink, Globe, KeyRound, Laptop, ListTodo, StickyNote, UserRound } from 'lucide-react'
import { Card, EmptyState } from '@/components/ui/misc'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { cn } from '@/lib/utils'

type Ligne = { texte: string; fait: boolean }
type SiteProjet = {
  site: string; titre: string; client: string | null; type: string; statut: string; avancement: number; etape: string | null
  url: string | null; admin_url: string | null; local: boolean; agent: string | null; todo: Ligne[]; reste: Ligne[]; notes: string | null; identifiants: number; maj: string
}
export const TYPES_SITE: Record<string, string> = { vitrine: 'Site vitrine', boutique: 'Boutique', admin: 'Vitrine + admin', landing: 'Landing', location: 'Location', application: 'Application web', autre: 'Autre' }
const STATUT: Record<string, [string, string]> = {
  en_cours: ['En cours', 'text-sky-400 bg-sky-400/10'], a_valider: ['À valider', 'text-amber-400 bg-amber-400/10'], a_corriger: ['À corriger', 'text-rose-400 bg-rose-400/10'],
  en_ligne: ['En ligne', 'text-emerald-400 bg-emerald-400/10'], en_pause: ['En pause', 'text-text-3 bg-surface-2'],
}
const ORDRE = ['a_valider', 'en_cours', 'a_corriger', 'en_ligne', 'en_pause']

function Liste({ titre, icone, l }: { titre: string; icone: React.ReactNode; l: Ligne[] }) {
  const reste = l.filter((t) => !t.fait).length
  if (!l.length) return null
  return (
    <ul className="space-y-1.5">
      <li className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-3">{icone}{titre} · {reste ? `${reste} sur ${l.length}` : 'tout est fait'}</li>
      {l.map((t, i) => (
        <li key={i} className={cn('flex items-start gap-2 text-sm', t.fait && 'text-text-3 line-through')}>
          <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded border', t.fait ? 'border-success bg-success text-white' : 'border-border-strong')}>{t.fait && <Check className="size-3" />}</span>{t.texte}
        </li>
      ))}
    </ul>
  )
}

function Carte({ s }: { s: SiteProjet }) {
  const [ouvert, setOuvert] = useState(s.statut === 'a_valider' || s.statut === 'en_cours')
  const [lib, cls] = STATUT[s.statut] ?? [s.statut, '']
  const resteAymen = s.reste.filter((t) => !t.fait).length
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <button className="flex w-full items-start gap-3 text-left" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert}>
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-text-3"><Globe className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-semibold leading-snug">{s.titre}</span>
          <span className="mt-0.5 block truncate text-xs text-text-3">{[TYPES_SITE[s.type] ?? s.type, s.client, s.avancement < 100 && s.etape ? `Étape : ${s.etape}` : null, resteAymen ? `${resteAymen} pour toi` : null].filter(Boolean).join(' · ')}</span>
        </span>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', cls)}>{lib}</span>
        <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-text-3 transition-transform', ouvert && 'rotate-180')} aria-hidden />
      </button>
      <div className="mt-3 flex items-center gap-3" aria-label={`Avancement ${s.avancement} %`}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${s.avancement}%` }} /></div>
        <span className="w-10 text-right text-xs font-semibold tabular-nums">{s.avancement} %</span>
      </div>
      {(s.url || s.admin_url) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-text"><ExternalLink className="size-3.5" />Voir le site</a>}
          {s.admin_url && <a href={s.admin_url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium">Admin</a>}
        </div>
      )}
      {ouvert && (
        <div className="mt-4 space-y-4">
          <Liste titre="À faire par toi" icone={<UserRound className="size-3.5" />} l={s.reste} />
          <Liste titre="Todo du site" icone={<ListTodo className="size-3.5" />} l={s.todo} />
          {s.notes && <div><p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-3"><StickyNote className="size-3.5" />Notes</p><p className="whitespace-pre-wrap text-sm text-text-2">{s.notes}</p></div>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-text-3">
            <span className="flex items-center gap-1.5"><KeyRound className="size-3.5" />{s.identifiants ? `${s.identifiants} identifiant${s.identifiants > 1 ? 's' : ''} dans l'Atelier (sur le Mac)` : 'Aucun identifiant'}</span>
            {s.local && <span className="flex items-center gap-1.5"><Laptop className="size-3.5" />Page locale visible dans l&apos;Atelier</span>}
            {s.agent && <span>Agent : {s.agent}</span>}
            <span>Mis à jour {new Date(s.maj).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function SiteProjets({ onLancer }: { onLancer?: () => void }) {
  const { ws } = useWorkspace()
  const { data, loading } = useLive<SiteProjet>('site_projets', { eq: { workspace_id: ws?.id }, order: ['maj', false], enabled: !!ws?.id })
  const [filtre, setFiltre] = useState<string>('tous')
  const tri = useMemo(() => data.slice().sort((a, b) => ORDRE.indexOf(a.statut) - ORDRE.indexOf(b.statut) || b.maj.localeCompare(a.maj)), [data])
  const liste = filtre === 'tous' ? tri : tri.filter((s) => s.statut === filtre)
  if (loading) return null
  if (!data.length) return <Card><EmptyState icon={<Globe className="size-5" />} title="Aucun site pour l'instant" hint="Les sites suivis par l'Atelier du Mac apparaissent ici : avancement, lien en ligne, todo et ce que tu dois faire." action={onLancer && <button className="text-sm font-medium text-accent-ink underline-offset-2 hover:underline" onClick={onLancer}>Lancer un site</button>} /></Card>
  const compte = (st: string) => data.filter((s) => s.statut === st).length
  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[['tous', `Tous · ${data.length}`], ...ORDRE.filter((st) => compte(st)).map((st) => [st, `${STATUT[st][0]} · ${compte(st)}`])].map(([v, t]) => (
          <button key={v} type="button" onClick={() => setFiltre(v)} aria-pressed={filtre === v}
            className={cn('h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition-colors', filtre === v ? 'border-transparent bg-text text-surface' : 'border-border bg-surface text-text-2 hover:text-text')}>{t}</button>
        ))}
      </div>
      <div className="space-y-3">{liste.map((s) => <Carte key={s.site} s={s} />)}</div>
    </div>
  )
}
