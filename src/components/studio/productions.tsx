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
  valide: ['Validée', 'text-emerald-400 bg-emerald-400/10'], publie: ['Publiée', 'text-emerald-400 bg-emerald-400/10'], en_pause: ['En pause', 'text-text-3 bg-surface-2'],
}
const COULEUR: Record<string, string> = { Kalimat: '#cfaa7b', Lumora: '#e9e9ee' }

function Carte({ p, contexte }: { p: Production; contexte: 'client' | 'serie' | null }) {
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
          <span className="line-clamp-2 font-semibold leading-snug">{p.numero ? <span className="mr-1.5 text-accent">n° {p.numero}</span> : null}{p.titre}</span>
          <span className="mt-0.5 block truncate text-xs text-text-3">{[contexte === 'client' ? `${p.client}${p.serie ? ' · ' + nomSerie(p) : ''}` : contexte === 'serie' ? nomSerie(p) : null,
            p.avancement < 100 && p.etape ? `Étape : ${p.etape}` : null, p.publication_prevue ? `Prévue le ${new Date(p.publication_prevue).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : null,
            restant > 0 ? `${restant} à faire` : null].filter(Boolean).join(' · ') || p.client}</span>
        </span>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', cls)}>{lib}</span>
        <ChevronDown className={cn('mt-0.5 size-4 shrink-0 text-text-3 transition-transform', ouvert && 'rotate-180')} aria-hidden />
      </button>
      <div className="mt-3 flex items-center gap-3" aria-label={`Avancement ${p.avancement} %`}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${p.avancement}%` }} /></div>
        <span className="w-10 text-right text-xs font-semibold tabular-nums">{p.avancement} %</span>
      </div>
      {ouvert && (
        <div className="mt-3 space-y-3">
          {p.resume && <p className="text-sm text-text-3">{p.resume}</p>}
          {p.publication_prevue && <p className="flex items-center gap-1.5 text-xs text-text-3"><CalendarDays className="size-3.5" aria-hidden />Publication prévue le {new Date(p.publication_prevue).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>}
          {p.todo.length > 0 && (
            <ul className="space-y-1.5">
              <li className="text-[11px] font-semibold uppercase tracking-wider text-text-3">{restant ? `À faire · ${restant} sur ${p.todo.length}` : 'Tâches · tout est fait'}</li>
              {p.todo.map((t, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className={cn('mt-0.5 grid size-4 shrink-0 place-items-center rounded border', t.fait ? 'border-emerald-500 bg-emerald-500 text-black' : 'border-border-strong')}>{t.fait && <Check className="size-3" />}</span>
                  <span className={cn(t.fait && 'text-text-3 line-through')}>{t.texte}</span>
                </li>
              ))}
            </ul>
          )}
          {p.video_chemin && (url
            ? <video src={url} controls playsInline className="w-full rounded-xl bg-black" />
            : <button onClick={lire} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-2 py-3 text-sm font-semibold" disabled={chargement}>
                <Play className="size-4" aria-hidden />{chargement ? 'Chargement…' : 'Regarder la vidéo'}
              </button>)}
          <p className="text-[11px] text-text-3">Mis à jour {new Date(p.maj).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      )}
    </div>
  )
}

// tri (14/10, demande d'Aymen) : d'abord le client, puis dans le client tout ou une série (mini-cours, pubs…),
// et partout le statut ; la liste est rangée par statut (à valider en premier). Choix gardés sur l'appareil.
const STATUTS_FILTRE = [
  { id: 'tout', lib: 'Tous les statuts', ok: () => true },
  { id: 'a_valider', lib: 'À valider', ok: (p: Production) => p.statut === 'a_valider' },
  { id: 'a_corriger', lib: 'À corriger', ok: (p: Production) => p.statut === 'a_corriger' },
  { id: 'en_cours', lib: 'En cours', ok: (p: Production) => p.statut === 'en_cours' || p.statut === 'en_pause' },
  { id: 'valide', lib: 'Validées', ok: (p: Production) => p.statut === 'valide' },
  { id: 'publie', lib: 'Publiées', ok: (p: Production) => p.statut === 'publie' },
] as const
type FiltreStatut = (typeof STATUTS_FILTRE)[number]['id']
const SECTIONS: { id: string; lib: string; statuts: string[] }[] = [
  { id: 'a_valider', lib: 'À valider', statuts: ['a_valider'] }, { id: 'a_corriger', lib: 'À corriger', statuts: ['a_corriger'] },
  { id: 'en_cours', lib: 'En cours', statuts: ['en_cours', 'en_pause'] }, { id: 'valide', lib: 'Validées', statuts: ['valide'] }, { id: 'publie', lib: 'Publiées', statuts: ['publie'] },
]
const rangClient = (c: string) => (c === 'Kalimat' ? 0 : c === 'Lumora' ? 1 : c === 'Interne' ? 9 : 5)
// « Mini-cours Kalimat » → « Mini-cours » quand on est déjà dans Kalimat
const nomSerie = (p: Production) => (p.serie ? p.serie.replace(new RegExp(`\\s*${p.client}\\s*`, 'i'), ' ').trim() || p.serie : 'Autres')
const lireLocal = (k: string, d: string) => { try { return localStorage.getItem(k) || d } catch { return d } }
const ecrireLocal = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} }

function Puces<T extends string>({ items, value, onChange, label, petit }: { items: { id: T; lib: string; n: number }[]; value: T; onChange: (v: T) => void; label: string; petit?: boolean }) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label={label}>
      {items.map((x) => { const actif = x.id === value
        return (
          <button key={x.id} role="tab" aria-selected={actif} onClick={() => onChange(x.id)} disabled={!x.n && !actif && x.id !== 'tout'}
            className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium transition-colors disabled:opacity-40', petit ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
              actif ? 'border-transparent bg-text text-surface' : 'border-border bg-surface text-text-2 hover:text-text')}>
            {x.lib}<span className={cn('tabular-nums text-[11px]', actif ? 'opacity-70' : 'text-text-3')}>{x.n}</span>
          </button>
        ) })}
    </div>
  )
}

export function Productions() {
  const { ws } = useWorkspace()
  const { data, loading, error } = useLive<Production>('motion_projets', { eq: { workspace_id: ws?.id }, order: ['maj', false], enabled: !!ws?.id })
  const [client, setClient] = useState(() => lireLocal('motion-client', 'tout'))
  const [serie, setSerie] = useState(() => lireLocal('motion-serie', 'tout'))
  const [statut, setStatut] = useState<FiltreStatut>(() => lireLocal('motion-statut', 'tout') as FiltreStatut)
  const choisirClient = (c: string) => { setClient(c); ecrireLocal('motion-client', c); setSerie('tout'); ecrireLocal('motion-serie', 'tout') }
  const choisirSerie = (v: string) => { setSerie(v); ecrireLocal('motion-serie', v) }
  const choisirStatut = (v: FiltreStatut) => { setStatut(v); ecrireLocal('motion-statut', v) }
  // table pas encore créée dans la base : message clair plutôt qu'une erreur
  if (error) return <Card><EmptyState icon={<Film className="size-5" />} title="Bientôt disponible" hint="Le suivi des vidéos d'Atelier s'affichera ici dès que la table « motion_projets » sera créée." /></Card>
  if (!loading && !data.length) return <Card><EmptyState icon={<Film className="size-5" />} title="Aucune production" hint="Lance une vidéo dans l'onglet « Lancer » : elle apparaîtra ici avec son avancement." /></Card>

  const clients = [...new Set(data.map((p) => p.client))].sort((a, b) => rangClient(a) - rangClient(b) || a.localeCompare(b, 'fr'))
  const c = client !== 'tout' && clients.includes(client) ? client : 'tout'
  const duClient = data.filter((p) => c === 'tout' || p.client === c)
  const series = c === 'tout' ? [] : [...new Set(duClient.map(nomSerie))].sort((a, b) => a.localeCompare(b, 'fr'))
  const se = serie !== 'tout' && series.includes(serie) ? serie : 'tout'
  const portee = duClient.filter((p) => se === 'tout' || nomSerie(p) === se)
  const f = STATUTS_FILTRE.find((x) => x.id === statut) ?? STATUTS_FILTRE[0]
  const visibles = portee.filter(f.ok).sort((a, b) => rangClient(a.client) - rangClient(b.client) || nomSerie(a).localeCompare(nomSerie(b), 'fr') || (a.numero ?? 999) - (b.numero ?? 999) || (b.maj ?? '').localeCompare(a.maj ?? ''))
  const sections = SECTIONS.map((x) => ({ ...x, ps: visibles.filter((p) => x.statuts.includes(p.statut)) })).filter((x) => x.ps.length)

  return (
    <section className="space-y-5" aria-label="Productions motion">
      <div className="space-y-2.5">
        <Puces label="Client" value={c} onChange={choisirClient} items={[{ id: 'tout', lib: 'Tous les clients', n: data.length }, ...clients.map((x) => ({ id: x, lib: x, n: data.filter((p) => p.client === x).length }))]} />
        {series.length > 1 && <Puces petit label="Série" value={se} onChange={choisirSerie} items={[{ id: 'tout', lib: 'Toutes les séries', n: duClient.length }, ...series.map((x) => ({ id: x, lib: x, n: duClient.filter((p) => nomSerie(p) === x).length }))]} />}
        <Puces petit label="Statut" value={statut} onChange={choisirStatut} items={STATUTS_FILTRE.map((x) => ({ id: x.id, lib: x.lib, n: portee.filter(x.ok).length }))} />
      </div>
      {!sections.length && <Card><EmptyState icon={<Film className="size-5" />} title="Rien ici" hint="Aucune vidéo avec ce filtre pour le moment." /></Card>}
      {sections.map((x) => (
        <div key={x.id} className="space-y-2.5">
          <h3 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-text-3">
            <span className={cn('rounded-full px-2 py-0.5 normal-case tracking-normal', STATUT[x.statuts[0]]?.[1])}>{x.lib}</span><span className="font-medium normal-case tracking-normal">{x.ps.length}</span>
          </h3>
          {x.ps.map((p) => <Carte key={p.projet} p={p} contexte={c === 'tout' ? 'client' : se === 'tout' ? 'serie' : null} />)}
        </div>
      ))}
    </section>
  )
}
