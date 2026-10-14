'use client'
// « Motion design → Lancer » (14/10/2026, Agent 2 / seikqit) : pour qui → quel type → sujet → voix off, et c'est parti.
// La demande part vers le logiciel Atelier du Mac (il remplace Flow Studio) : il crée la fiche (série et numéro suivant)
// et confie la vidéo à un agent Claude ; l'avancement s'affiche ensuite dans « Productions ».
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Laptop, Mic, Plus, Rocket, Sparkles, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Card, Switch } from '@/components/ui/misc'
import { getDb } from '@/lib/supabase/client'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { newClientToken } from '@/lib/clients'
import { createAndSubmit } from '@/lib/studio/launch'
import { studioApi, usePoll, useStudioMode } from '@/lib/studio/api'
import { FORMATS, VOIX, modelesDe, serieDe, type Format, type VoixId } from '@/lib/studio/motion-modeles'
import type { RefItem } from '@/lib/studio/types'
import { RefDropzone } from '@/components/studio/ref-dropzone'
import { cn } from '@/lib/utils'

type ClientRow = { id: string; name: string; color: string | null }
type Prod = { serie: string | null; numero: number | null }
const MARQUES = ['Kalimat', 'Lumora']

function Etape({ n, titre, children, aide }: { n: number; titre: string; aide?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-3 text-xs font-semibold text-text-2">{n}</span>
        <h3 className="text-[15px] font-semibold">{titre}</h3>
        {aide && <span className="text-xs text-text-3">{aide}</span>}
      </div>
      {children}
    </section>
  )
}
const Puce = ({ actif, children, onClick, disabled, title }: { actif: boolean; children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) => (
  <button type="button" onClick={onClick} disabled={disabled} title={title} aria-pressed={actif}
    className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
      actif ? 'border-transparent bg-text text-surface' : 'border-border bg-surface text-text-2 hover:text-text')}>{children}</button>
)

export function LancerMotion({ onLance }: { onLance?: () => void }) {
  const { ws } = useWorkspace()
  const { userId } = useSession()
  const { mode } = useStudioMode()
  const devs = usePoll(studioApi.devices, 15000, mode === 'live')
  const atelier = (devs.data?.devices ?? []).find((d) => d.online) ?? null
  const { data: clients, refresh: rafraichirClients } = useLive<ClientRow>('clients', { eq: { workspace_id: ws?.id }, is: { deleted_at: null }, order: ['name', true], enabled: !!ws?.id })
  const { data: prods } = useLive<Prod>('motion_projets', { eq: { workspace_id: ws?.id }, enabled: !!ws?.id })

  const [client, setClient] = useState('Kalimat')
  const [nouveau, setNouveau] = useState(false)
  const [nomNouveau, setNomNouveau] = useState('')
  const nomClient = nouveau ? nomNouveau.trim() : client
  const modeles = modelesDe(nouveau ? '*' : client)
  const [modeleId, setModeleId] = useState(modeles[0].id)
  const modele = modeles.find((m) => m.id === modeleId && !m.bientot) ?? modeles.find((m) => !m.bientot)!
  const [sujet, setSujet] = useState('')
  const [notes, setNotes] = useState('')
  const [voixOn, setVoixOn] = useState(modele.voixDefaut !== null)
  const [voix, setVoix] = useState<VoixId>(modele.voixDefaut ?? modele.voix[0])
  const [texteOn, setTexteOn] = useState(false)
  const [texte, setTexte] = useState('')
  const [options, setOptions] = useState(false)
  // agent : null = celui des réglages de l'Atelier (Automatique = le premier terminal libre)
  const [agent, setAgent] = useState<string | null>(null)
  const agents = atelier?.setup?.atelier?.agents ?? []
  const agentReglage = atelier?.setup?.atelier?.reglages.compteAgents ?? 'auto'
  const [format, setFormat] = useState<Format>(modele.format)
  const [duree, setDuree] = useState(modele.duree)
  const [musique, setMusique] = useState(true)
  const [publication, setPublication] = useState('')
  const [refs, setRefs] = useState<RefItem[]>([])
  const [envoi, setEnvoi] = useState(false)

  // changer de client ou de type remet les réglages du type (format, durée, voix)
  const choisirModele = (id: string, liste = modeles) => {
    const m = liste.find((x) => x.id === id) ?? liste[0]
    setModeleId(m.id); setFormat(m.format); setDuree(m.duree)
    setVoixOn(m.voixDefaut !== null); setVoix(m.voixDefaut ?? m.voix[0])
  }
  const choisirClient = (c: string | null) => {
    setNouveau(c === null); if (c) setClient(c)
    const liste = modelesDe(c ?? '*'); choisirModele(liste.find((m) => m.id === modeleId && !m.bientot)?.id ?? liste[0].id, liste)
  }

  const serie = serieDe(modele, nomClient || 'client')
  const numero = serie ? Math.max(0, ...prods.filter((p) => p.serie === serie).map((p) => p.numero ?? 0)) + 1 : null
  const titre = modele.id === 'mini_cours' ? `Cours ${numero}${sujet.trim() ? ` · ${sujet.trim()}` : ''}` : `${modele.titre}${sujet.trim() ? ` · ${sujet.trim()}` : ''}`
  const pret = !!nomClient && !envoi

  async function lancer() {
    if (!nomClient) { toast.error('Indique le nom du client'); return }
    setEnvoi(true)
    try {
      let clientId = clients.find((c) => c.name === nomClient)?.id ?? null
      if (nouveau && !clientId && !MARQUES.includes(nomClient)) {
        const now = new Date().toISOString()
        const { data, error } = await getDb().from('clients').insert({ name: nomClient, workspace_id: ws.id, access_token: newClientToken(), created_by: userId ?? null,
          cadence: 'on_demand', color: null, token_rotated_at: now, created_at: now, updated_at: now, deleted_at: null }).select('id').single()
        if (!error && data) { clientId = (data as { id: string }).id; void rafraichirClients() }
      }
      const spec = {
        atelier: 1, wsSlug: ws.slug, client: nomClient, clientId, modele: modele.id, modeleTitre: modele.titre, serie: serie || null, numero,
        sujet: sujet.trim(), notes: notes.trim(), consignes: modele.consignes, format, duree, fps: 60, musique, publication: publication || null,
        voix: voixOn ? { id: voix, titre: VOIX[voix].titre, texte: texteOn ? texte.trim() : '' } : null,
        ...(agent ? { agent } : {}),
      }
      // résumé lisible (le serveur exige au moins 50 caractères) ; l'Atelier construit la consigne de l'agent à partir de `spec`
      const resume = ['Demande de vidéo motion design pour l\'Atelier :', `${nomClient} · ${modele.titre}${numero ? ` n° ${numero}` : ''}`, sujet.trim() && `Sujet : ${sujet.trim()}`, notes.trim() && `Notes : ${notes.trim()}`,
        `Voix : ${voixOn ? VOIX[voix].titre + (texteOn && texte.trim() ? ` (texte fourni)` : ' (texte écrit par Claude)') : 'aucune'}`,
        `Format ${format} · ${duree} s · 60 i/s${musique ? ' · musique' : ''}`].filter(Boolean).join('\n')
      if (mode !== 'live') { toast.success('Mode démo : demande simulée', { description: titre }); return }
      await createAndSubmit({ kind: 'motion', title: titre, spec, prompt: resume, refs, workspaceId: ws.id })
      toast.success('Demande envoyée à l\'Atelier', { description: atelier ? `${titre} · l'agent démarre sur « ${atelier.name} »` : `${titre} · elle partira dès que l'Atelier sera ouvert sur le Mac` })
      setSujet(''); setNotes(''); setTexte(''); setRefs([]); onLance?.()
    } catch { toast.error('Envoi impossible, réessaie') } finally { setEnvoi(false) }
  }

  return (
    <div className="space-y-4">
      <Link href={`/app/${ws.slug}/settings?tab=studio`}
        className={cn('flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors',
          atelier ? 'border-success/40 bg-success/10' : 'border-border bg-surface-2 hover:bg-surface-3')}>
        {atelier ? <Laptop className="size-4 shrink-0 text-success" /> : <WifiOff className="size-4 shrink-0 text-text-3" />}
        <span className="min-w-0 flex-1">{atelier ? <>Atelier connecté · <b>{atelier.name}</b></> : <>Atelier non connecté : la demande attendra le Mac. <u>Relier l&apos;Atelier</u></>}</span>
      </Link>

      <Card className="space-y-7 p-4 sm:p-6">
        <Etape n={1} titre="Pour qui ?">
          <div className="-mx-1 flex flex-wrap gap-2 px-1">
            {[...MARQUES, ...clients.map((c) => c.name).filter((n) => !MARQUES.includes(n))].map((n) => (
              <Puce key={n} actif={!nouveau && client === n} onClick={() => choisirClient(n)}>{n}</Puce>
            ))}
            <Puce actif={nouveau} onClick={() => choisirClient(null)}><Plus className="size-3.5" />Nouveau client</Puce>
          </div>
          {nouveau && <Input autoFocus value={nomNouveau} onChange={(e) => setNomNouveau(e.target.value)} placeholder="Nom du client (il sera ajouté à tes clients)" />}
        </Etape>

        <Etape n={2} titre="Quel type de vidéo ?">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {modeles.map((m) => {
              const actif = m.id === modele.id
              return (
                <button key={m.id} type="button" disabled={m.bientot} onClick={() => choisirModele(m.id)} aria-pressed={actif}
                  className={cn('relative rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    actif ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border bg-surface hover:bg-surface-2')}>
                  <span className="block text-sm font-semibold">{m.titre}</span>
                  <span className="mt-0.5 block text-xs text-text-3">{m.bientot ? 'Bientôt' : m.detail}</span>
                </button>
              )
            })}
          </div>
          {numero && nomClient && <p className="flex items-center gap-1.5 text-sm text-text-2"><Sparkles className="size-3.5 text-accent" />Ce sera <b>{modele.id === 'mini_cours' ? `le cours n° ${numero}` : `${serie} n° ${numero}`}</b></p>}
        </Etape>

        <Etape n={3} titre={modele.sujet.label} aide="facultatif">
          <Input value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder={modele.sujet.placeholder} />
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes pour l'agent (facultatif) : style, référence, ce qu'il faut éviter…" className="min-h-20" />
        </Etape>

        <Etape n={4} titre="Voix off">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-3">
            <span className="flex items-center gap-2 text-sm font-medium"><Mic className="size-4 text-text-3" />Ajouter une voix off</span>
            <Switch checked={voixOn} onChange={setVoixOn} label="Ajouter une voix off" />
          </label>
          {voixOn && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {modele.voix.map((v) => (
                  <button key={v} type="button" onClick={() => setVoix(v)} aria-pressed={voix === v}
                    className={cn('rounded-xl border p-3 text-left transition-colors', voix === v ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border hover:bg-surface-2')}>
                    <span className="block text-sm font-semibold">{VOIX[v].titre}</span><span className="block text-xs text-text-3">{VOIX[v].detail}</span>
                  </button>
                ))}
              </div>
              <label className="flex items-center justify-between gap-3 text-sm text-text-2">
                <span>Écrire le texte moi-même <span className="text-text-3">(sinon Claude l&apos;écrit)</span></span>
                <Switch checked={texteOn} onChange={setTexteOn} label="Écrire le texte de la voix" />
              </label>
              {texteOn && <Textarea value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Une phrase par ligne" className="min-h-24" />}
            </div>
          )}
        </Etape>

        {agents.length > 0 && (
          <Etape n={5} titre="Quel agent ?" aide="la demande s'écrit dans son terminal">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[{ compte: 'auto', etat: 'libre', nom: 'le premier libre' }, ...agents].map((a) => {
                const choisi = (agent ?? agentReglage) === a.compte
                const etat = a.compte === 'auto' ? null : a.etat === 'libre' ? 'Libre' : a.etat === 'occupe' ? 'Occupé' : a.etat === 'limite' ? `Limite · ${'reprise' in a && a.reprise ? new Date(a.reprise).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}` : 'Fermé'
                return (
                  <button key={a.compte} type="button" onClick={() => setAgent(a.compte)} aria-pressed={choisi}
                    className={cn('rounded-xl border px-3 py-2 text-left transition-colors', choisi ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border hover:bg-surface-2', a.compte !== 'auto' && a.etat !== 'libre' && !choisi && 'opacity-60')}>
                    <span className="block text-sm font-semibold">{a.compte === 'auto' ? 'Automatique' : a.compte}</span>
                    <span className="flex items-center gap-1.5 text-xs text-text-3">{etat && <span className={cn('size-2 rounded-full', a.etat === 'libre' ? 'bg-success' : a.etat === 'occupe' ? 'bg-warning' : a.etat === 'limite' ? 'bg-danger' : 'bg-text-3')} />}{etat ?? a.nom}</span>
                  </button>
                )
              })}
            </div>
            {(agent ?? agentReglage) !== 'auto' && agents.find((a) => a.compte === (agent ?? agentReglage))?.etat !== 'libre' && <p className="text-xs text-text-2">{agents.find((a) => a.compte === (agent ?? agentReglage))?.etat === 'limite' ? 'Cet agent est à sa limite : la vidéo partira chez le premier agent libre.' : 'Cet agent n\'est pas libre : la vidéo attendra qu\'il ait fini.'}</p>}
          </Etape>
        )}

        <div className="rounded-xl border border-border">
          <button type="button" onClick={() => setOptions((o) => !o)} aria-expanded={options} className="flex w-full items-center justify-between px-3.5 py-3 text-sm font-medium">
            <span>Options <span className="font-normal text-text-3">· {FORMATS.find((f) => f.id === format)?.titre} · {duree} s{musique ? ' · musique' : ''}{refs.length ? ` · ${refs.length} référence(s)` : ''}</span></span>
            <ChevronDown className={cn('size-4 text-text-3 transition-transform', options && 'rotate-180')} />
          </button>
          {options && (
            <div className="space-y-4 border-t border-border p-3.5">
              <div className="flex flex-wrap gap-2">{FORMATS.map((f) => <Puce key={f.id} actif={format === f.id} onClick={() => setFormat(f.id)}>{f.titre}</Puce>)}</div>
              <div className="flex items-center gap-3">
                <span className="w-14 text-sm text-text-2">Durée</span>
                <input type="range" min={5} max={120} step={5} value={duree} onChange={(e) => setDuree(Number(e.target.value))} className="h-1.5 flex-1 accent-[var(--accent)]" aria-label="Durée" />
                <span className="w-12 text-right text-sm font-semibold tabular-nums">{duree} s</span>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm"><span>Musique originale <span className="text-text-3">(piste séparée)</span></span><Switch checked={musique} onChange={setMusique} label="Musique" /></label>
              <label className="flex items-center justify-between gap-3 text-sm"><span>Publication prévue le</span>
                <input type="date" value={publication} onChange={(e) => setPublication(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm" /></label>
              <RefDropzone refs={refs} onChange={setRefs} copy={{ drop: 'Glisse des exemples (vidéos, images, logos)', addLink: 'Ajouter un lien', linkPlaceholder: 'https://…', addNote: 'Ajouter une note', notePlaceholder: 'Ce qu\'il faut reprendre de cet exemple', remove: 'Retirer' }} />
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-3">L&apos;agent écrit le déroulé, fait la vidéo, les voix et les bruitages, vérifie, puis l&apos;envoie ici pour validation.</p>
          <Button variant="primary" onClick={lancer} disabled={!pret} className="h-11 shrink-0 px-5 text-[15px]"><Rocket className="size-4" />{envoi ? 'Envoi…' : `Lancer ${modele.id === 'mini_cours' && numero ? `le cours ${numero}` : 'la vidéo'}`}</Button>
        </div>
      </Card>
    </div>
  )
}
