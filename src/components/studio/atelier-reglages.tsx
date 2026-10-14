'use client'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bot, Check, Loader2, Monitor, SquareTerminal } from 'lucide-react'
import { toast } from 'sonner'
import { Card, Switch, Tabs } from '@/components/ui/misc'
import { cn } from '@/lib/utils'
import { studioApi, type AtelierEtat, type AtelierReglages, type LiveDevice } from '@/lib/studio/api'

/** Paramètres → Atelier (Mac) : réglages du logiciel Atelier et choix de l'agent, modifiables ici.
 *  Chaque changement part au Mac (commande « reglages ») ; l'Atelier l'enregistre et renvoie son état en quelques secondes. */
const ETAT = { libre: { t: 'Libre', c: 'bg-success' }, occupe: { t: 'Occupé', c: 'bg-warning' }, ferme: { t: 'Fermé', c: 'bg-text-3' } } as const
const ACCENTS: Record<string, string> = { or: '#cfaa7b', bleu: '#6f9fff', vert: '#5cc48f', violet: '#ad96ff', rose: '#ff8fb1' }

type Brouillon = Partial<AtelierReglages>

function Ligne({ titre, aide, children, large = false }: { titre: string; aide?: string; children: ReactNode; large?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-text">{titre}</p>{aide && <p className="text-[13px] text-text-3">{aide}</p>}</div>
      <div className={large ? "max-md:w-full" : "shrink-0"}>{children}</div>
    </div>
  )
}
function Choix<T extends string>({ valeur, options, onChange }: { valeur: T; options: { v: T; t: string; icone?: ReactNode; sous?: ReactNode; off?: boolean }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {options.map((o) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} aria-pressed={valeur === o.v}
          className={cn('flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors',
            valeur === o.v ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border bg-surface hover:bg-surface-2', o.off && valeur !== o.v && 'opacity-60')}>
          <span className="flex items-center gap-1.5 text-sm font-medium">{o.icone}{o.t}{valeur === o.v && <Check className="size-3.5" />}</span>
          {o.sous && <span className="text-xs text-text-3">{o.sous}</span>}
        </button>
      ))}
    </div>
  )
}

export function AtelierReglagesPanel({ device, onSent }: { device: LiveDevice; onSent?: () => void }) {
  const etat = device.setup?.atelier as AtelierEtat | undefined
  const [brouillon, setBrouillon] = useState<Brouillon>({})
  const [envoi, setEnvoi] = useState(false)
  // le brouillon s'efface quand le Mac renvoie les mêmes valeurs (enregistrées là-bas)
  useEffect(() => {
    if (!etat) return
    const r = etat.reglages as unknown as Record<string, unknown>
    const reste = Object.fromEntries(Object.entries(brouillon).filter(([k, v]) => JSON.stringify(r[k]) !== JSON.stringify(k === 'notif' ? { ...(r.notif as object), ...(v as object) } : v)))
    if (Object.keys(reste).length !== Object.keys(brouillon).length) setBrouillon(reste as Brouillon)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat?.maj, etat?.reglages?.maj])
  const r = useMemo(() => (etat ? { ...etat.reglages, ...brouillon, notif: { ...etat.reglages.notif, ...(brouillon.notif ?? {}) } } : null), [etat, brouillon])

  if (!etat || !r) {
    return (
      <Card className="p-5 text-[13px] text-text-3 max-md:p-4">
        {device.online ? 'L’Atelier n’a pas encore envoyé ses réglages : mets-le à jour sur le Mac (nouvelle version du 14/10), ils apparaîtront ici.' : 'Le Mac est hors ligne : ouvre l’Atelier pour voir et modifier ses réglages.'}
      </Card>
    )
  }

  const regler = async (d: Brouillon) => {
    setBrouillon((b) => ({ ...b, ...d, ...(d.notif ? { notif: { ...(b.notif ?? {}), ...d.notif } } : {}) }))
    setEnvoi(true)
    try { await studioApi.reglerAtelier(device.id, d); onSent?.() }
    catch { toast.error('Réglage non envoyé au Mac : réessaie.') }
    finally { setEnvoi(false) }
  }
  const enAttente = Object.keys(brouillon).length > 0
  const libres = etat.agents.filter((a) => a.etat === 'libre').length

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-1.5 text-xs text-text-3">
        {envoi || enAttente ? <><Loader2 className="size-3.5 animate-spin" />Envoi au Mac…</> : <><Check className="size-3.5 text-success" />Enregistré sur le Mac · {new Date(etat.reglages.maj ?? etat.maj).toLocaleTimeString('fr-FR', { timeStyle: 'short' })}{etat.reglages.majPar === 'flow' ? ' (depuis Flow)' : ''}</>}
      </p>

      {/* 1. Agents */}
      <Card className="p-5 max-md:p-4">
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Bot className="size-4 text-text-3" />Agent qui fabrique les vidéos</h3>
        <p className="mb-3 text-[13px] text-text-3">{libres ? `${libres} ${libres > 1 ? 'terminaux' : 'terminal'} libre${libres > 1 ? 's' : ''} sur 3.` : 'Aucun terminal libre pour l’instant : une demande attendra qu’un agent se libère.'}{etat.attente ? ` ${etat.attente} demande${etat.attente > 1 ? 's' : ''} en attente.` : ''}</p>
        <Choix valeur={r.compteAgents} onChange={(v) => void regler({ compteAgents: v })}
          options={[{ v: 'auto', t: 'Automatique', sous: 'le premier libre' }, ...etat.agents.map((a) => ({ v: a.compte, t: a.compte, off: a.etat !== 'libre',
            sous: <span className="flex items-center gap-1.5"><span className={cn('size-2 rounded-full', ETAT[a.etat]?.c)} />{ETAT[a.etat]?.t ?? a.etat} · {a.nom}</span> }))]} />
        {r.compteAgents !== 'auto' && etat.agents.find((a) => a.compte === r.compteAgents)?.etat !== 'libre' && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-2">{r.compteAgents} n’est pas libre : la prochaine vidéo attendra qu’il ait fini.</p>}
        {etat.enCours.length > 0 && <ul className="mt-3 space-y-1 border-t border-border pt-3 text-[13px] text-text-2">{etat.enCours.map((x, i) => <li key={i} className="truncate">En cours : {x.titre}{x.compte ? ` · ${x.compte}` : ''}</li>)}</ul>}
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium">Où l’agent travaille</p>
          <div className="grid grid-cols-2 gap-2">
            {([['terminal', 'Terminal MXterm', 'La demande s’écrit dans son terminal : tu la vois en direct.', <SquareTerminal key="t" className="size-4" />], ['cache', 'Sans écran', 'Agent invisible, suivi dans Flow et l’Atelier.', <Monitor key="m" className="size-4" />]] as const).map(([v, t, s, ic]) => (
              <button key={v} type="button" aria-pressed={r.envoiAgents === v} onClick={() => void regler({ envoiAgents: v })}
                className={cn('rounded-xl border px-3 py-2.5 text-left transition-colors', r.envoiAgents === v ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border bg-surface hover:bg-surface-2')}>
                <span className="flex items-center gap-1.5 text-sm font-medium">{ic}{t}</span><span className="mt-0.5 block text-xs text-text-3">{s}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* 2. Logiciel Atelier */}
      <Card className="divide-y divide-border px-5 py-1 max-md:px-4">
        <Ligne titre="Thème" large aide="Clair, sombre, ou comme le Mac"><Tabs value={r.theme} onChange={(v) => void regler({ theme: v })} items={[{ value: 'clair', label: 'Clair' }, { value: 'sombre', label: 'Sombre' }, { value: 'auto', label: 'Auto' }]} /></Ligne>
        <Ligne titre="Couleur d’accent">
          <div className="flex gap-2">{Object.entries(ACCENTS).map(([k, c]) => <button key={k} type="button" aria-label={k} aria-pressed={r.accent === k} onClick={() => void regler({ accent: k })} className={cn('size-8 rounded-full border-2 transition-transform', r.accent === k ? 'scale-110 border-text' : 'border-transparent')} style={{ background: c }} />)}</div>
        </Ligne>
        <Ligne titre="Taille du texte" large><Tabs value={String(r.zoom)} onChange={(v) => void regler({ zoom: Number(v) })} items={[{ value: '0.9', label: 'Petite' }, { value: '1', label: 'Normale' }, { value: '1.1', label: 'Grande' }, { value: '1.2', label: 'Très grande' }]} /></Ligne>
        <Ligne titre="Densité" large><Tabs value={r.densite} onChange={(v) => void regler({ densite: v })} items={[{ value: 'compacte', label: 'Compacte' }, { value: 'normale', label: 'Normale' }, { value: 'aeree', label: 'Aérée' }]} /></Ligne>
        <Ligne titre="Page d’ouverture" large><Tabs value={r.pageDemarrage} onChange={(v) => void regler({ pageDemarrage: v })} items={[{ value: 'derniere', label: 'Dernière' }, { value: 'accueil', label: 'Tableau de bord' }, { value: 'valider', label: 'À valider' }]} /></Ligne>
      </Card>

      <Card className="divide-y divide-border px-5 py-1 max-md:px-4">
        {([['valider', 'Vidéo prête à valider', 'Quand un agent termine une vidéo'], ['voix', 'Voix à reformuler', 'Quand une phrase échoue dans la file des voix'], ['rendu', 'Rendu terminé', 'Quand une vidéo a fini d’être calculée'], ['demande', 'Nouvelle demande', 'Quand une vidéo arrive depuis Flow']] as const).map(([k, t, a]) => (
          <Ligne key={k} titre={t} aide={`Notification du Mac · ${a}`}><Switch checked={r.notif[k]} label={t} onChange={(v) => void regler({ notif: { [k]: v } as AtelierReglages['notif'] })} /></Ligne>
        ))}
        <Ligne titre="Synchroniser automatiquement" aide="Chaque changement fait dans l’Atelier part dans Productions"><Switch checked={r.flowAuto} label="Synchroniser" onChange={(v) => void regler({ flowAuto: v })} /></Ligne>
        <Ligne titre="Ouvrir l’Atelier au démarrage du Mac"><Switch checked={r.demarrageMac} label="Démarrage" onChange={(v) => void regler({ demarrageMac: v })} /></Ligne>
        <Ligne titre="Arrêter les studios en quittant" aide="Libère la mémoire du Mac"><Switch checked={r.arreterStudios} label="Studios" onChange={(v) => void regler({ arreterStudios: v })} /></Ligne>
      </Card>
    </div>
  )
}
