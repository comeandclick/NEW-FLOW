'use client'
// Site → « Lancer » (14/10/2026) : pour qui → quel type de site → description → pages, domaine, références → agent, et c'est parti.
// La demande part vers le logiciel Atelier du Mac : il crée la fiche du site et l'écrit dans le terminal d'un agent Claude Code
// (le premier libre, ou celui choisi), qui construit le site à partir du coffre Obsidian. Le suivi s'affiche dans « Projets ».
import { useState } from 'react'
import Link from 'next/link'
import { Laptop, Plus, Rocket, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Card } from '@/components/ui/misc'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { createAndSubmit } from '@/lib/studio/launch'
import { studioApi, usePoll, useStudioMode } from '@/lib/studio/api'
import type { RefItem } from '@/lib/studio/types'
import { RefDropzone } from '@/components/studio/ref-dropzone'
import { Etape, Puce } from '@/components/studio/lancer-motion'
import { cn } from '@/lib/utils'

type ClientRow = { id: string; name: string }
const MARQUES = ['Lumora', 'Kalimat']
const TYPES: { id: string; titre: string; detail: string }[] = [
  { id: 'vitrine', titre: 'Site vitrine', detail: 'Présenter une activité, contact' },
  { id: 'admin', titre: 'Vitrine + admin', detail: 'Le client modifie ses contenus' },
  { id: 'boutique', titre: 'Boutique', detail: 'Produits, panier, paiement' },
  { id: 'location', titre: 'Location', detail: 'Réservations, disponibilités' },
  { id: 'landing', titre: 'Landing', detail: 'Une page qui convertit' },
  { id: 'application', titre: 'Application web', detail: 'Comptes, tableau de bord' },
]

export function LancerSite({ onLance }: { onLance?: () => void }) {
  const { ws } = useWorkspace()
  const { mode } = useStudioMode()
  const devs = usePoll(studioApi.devices, 15000, mode === 'live')
  const atelier = (devs.data?.devices ?? []).find((d) => d.online) ?? null
  const { data: clients } = useLive<ClientRow>('clients', { eq: { workspace_id: ws?.id }, is: { deleted_at: null }, order: ['name', true], enabled: !!ws?.id })
  const [client, setClient] = useState('Lumora')
  const [nouveau, setNouveau] = useState(false)
  const [nomNouveau, setNomNouveau] = useState('')
  const nomClient = nouveau ? nomNouveau.trim() : client
  const [type, setType] = useState('vitrine')
  const [titre, setTitre] = useState('')
  const [brief, setBrief] = useState('')
  const [pages, setPages] = useState('')
  const [domaine, setDomaine] = useState('')
  const [refs, setRefs] = useState<RefItem[]>([])
  const [agent, setAgent] = useState<string | null>(null)
  const agents = atelier?.setup?.atelier?.agents ?? []
  const agentReglage = atelier?.setup?.atelier?.reglages.compteAgents ?? 'auto'
  const [envoi, setEnvoi] = useState(false)
  const nom = titre.trim() || (nomClient ? `Site ${nomClient}` : '')
  const pret = !!nom && brief.trim().length >= 10 && !envoi
  const autres = clients.map((c) => c.name).filter((n) => !MARQUES.includes(n))

  const lancer = async () => {
    if (!pret || !ws) return
    setEnvoi(true)
    try {
      const t = TYPES.find((x) => x.id === type)?.titre ?? type
      const spec = { atelier: 1, wsSlug: ws.slug, client: nomClient, type, titre: nom, brief: brief.trim(), pages: pages.trim(), domaine: domaine.trim(), ...(agent ? { agent } : {}) }
      const prompt = [`Demande de site pour l'Atelier : ${nom} (${t}${nomClient ? `, ${nomClient}` : ''}).`, `Description : ${brief.trim()}`, pages.trim() && `Pages et fonctionnalités : ${pages.trim()}`, domaine.trim() && `Domaine souhaité : ${domaine.trim()}`].filter(Boolean).join('\n')
      if (mode !== 'live') { toast.success('Mode démo : demande simulée', { description: nom }); return }
      await createAndSubmit({ kind: 'site', title: nom, spec, prompt, refs, workspaceId: ws.id })
      toast.success('Demande envoyée à l\'Atelier', { description: atelier ? `${nom} · elle s'écrit dans le terminal de l'agent` : `${nom} · elle partira dès que l'Atelier sera ouvert sur le Mac` })
      setTitre(''); setBrief(''); setPages(''); setDomaine(''); setRefs([]); onLance?.()
    } catch { toast.error('Envoi impossible, réessaie') } finally { setEnvoi(false) }
  }

  return (
    <div className="space-y-4">
      <Link href={`/app/${ws.slug}/settings?tab=studio`}
        className={cn('flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm transition-colors', atelier ? 'border-success/40 bg-success/10' : 'border-border bg-surface-2 hover:bg-surface-3')}>
        {atelier ? <Laptop className="size-4 shrink-0 text-success" /> : <WifiOff className="size-4 shrink-0 text-text-3" />}
        <span className="min-w-0 flex-1">{atelier ? <>Atelier connecté · <b>{atelier.name}</b></> : <>Atelier non connecté : la demande attendra le Mac. <u>Relier l&apos;Atelier</u></>}</span>
      </Link>

      <Card className="space-y-7 p-4 sm:p-6">
        <Etape n={1} titre="Pour qui ?">
          <div className="-mx-1 flex flex-wrap gap-2 px-1">
            {[...MARQUES, ...autres].map((c) => <Puce key={c} actif={!nouveau && client === c} onClick={() => { setNouveau(false); setClient(c) }}>{c}</Puce>)}
            <Puce actif={nouveau} onClick={() => setNouveau(true)}><Plus className="size-3.5" />Nouveau client</Puce>
          </div>
          {nouveau && <Input value={nomNouveau} onChange={(e) => setNomNouveau(e.target.value)} placeholder="Nom du client (ex. Boulangerie Martin)" autoFocus />}
        </Etape>

        <Etape n={2} titre="Quel type de site ?">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TYPES.map((x) => (
              <button key={x.id} type="button" onClick={() => setType(x.id)} aria-pressed={type === x.id}
                className={cn('rounded-xl border p-3 text-left transition-colors', type === x.id ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border hover:bg-surface-2')}>
                <span className="block text-sm font-semibold">{x.titre}</span><span className="block text-xs text-text-3">{x.detail}</span>
              </button>
            ))}
          </div>
        </Etape>

        <Etape n={3} titre="Le site">
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder={`Nom du site (ex. ${nomClient ? `Site ${nomClient}` : 'Boulangerie Martin'})`} />
          <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Décris l'activité, le public, le style voulu, ce que le site doit faire… (l'agent n'invente aucune info : téléphone, prix, adresse… viendront de toi)" className="min-h-28" />
          <Textarea value={pages} onChange={(e) => setPages(e.target.value)} placeholder="Pages et fonctionnalités (facultatif) : Accueil, Services, Tarifs, Contact, réservation, espace admin…" className="min-h-20" />
          <Input value={domaine} onChange={(e) => setDomaine(e.target.value)} placeholder="Nom de domaine souhaité (facultatif), ex. boulangerie-martin.fr" />
        </Etape>

        <Etape n={4} titre="Références" aide="facultatif : captures, logo, photos, sites que tu aimes">
          <RefDropzone refs={refs} onChange={setRefs} copy={{ drop: 'Glisse des captures, un logo, des photos', addLink: 'Ajouter un lien (site que tu aimes)', linkPlaceholder: 'https://…', addNote: 'Ajouter une note', notePlaceholder: 'Ce qu\'il faut reprendre de cet exemple', remove: 'Retirer' }} />
        </Etape>

        {agents.length > 0 && (
          <Etape n={5} titre="Quel agent ?" aide="la demande s'écrit dans son terminal">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[{ compte: 'auto', etat: 'libre', nom: 'le premier libre', reprise: null }, ...agents].map((a) => {
                const choisi = (agent ?? agentReglage) === a.compte
                const etat = a.compte === 'auto' ? null : a.etat === 'libre' ? 'Libre' : a.etat === 'occupe' ? 'Occupé' : a.etat === 'limite' ? `Limite${a.reprise ? ' · ' + new Date(a.reprise).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}` : 'Fermé'
                return (
                  <button key={a.compte} type="button" onClick={() => setAgent(a.compte)} aria-pressed={choisi}
                    className={cn('rounded-xl border px-3 py-2 text-left transition-colors', choisi ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-border hover:bg-surface-2', a.compte !== 'auto' && a.etat !== 'libre' && !choisi && 'opacity-60')}>
                    <span className="block text-sm font-semibold">{a.compte === 'auto' ? 'Automatique' : a.compte}</span>
                    <span className="flex items-center gap-1.5 text-xs text-text-3">{etat && <span className={cn('size-2 rounded-full', a.etat === 'libre' ? 'bg-success' : a.etat === 'occupe' ? 'bg-warning' : a.etat === 'limite' ? 'bg-danger' : 'bg-text-3')} />}{etat ?? a.nom}</span>
                  </button>
                )
              })}
            </div>
          </Etape>
        )}

        <Button variant="primary" size="lg" className="w-full" onClick={() => void lancer()} disabled={!pret} loading={envoi}><Rocket className="size-4" />Lancer le site</Button>
        <p className="text-xs text-text-3">L&apos;agent lit d&apos;abord le coffre Obsidian (méthode, règles, préférences, notes du client), construit le site avec une page locale que tu vois en direct dans l&apos;Atelier, et te liste ce que tu dois faire (domaine, e-mails…). Il ne met en ligne qu&apos;avec ton accord.</p>
      </Card>
    </div>
  )
}
