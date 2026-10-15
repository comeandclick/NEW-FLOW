'use client'
// Bloc « Gestion » de l'accueil (15/10/2026) : interventions du jour, argent à encaisser, devis en attente,
// et les raccourcis (devis, intervention, facture en photo). Affiché seulement si une fonctionnalité de gestion est choisie.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, isSameDay } from 'date-fns'
import { fr } from 'date-fns/locale'
import { ArrowRight, FileSignature, Plus, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/misc'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { aGestion, modulesActifs } from '@/lib/modules'
import { eur } from '@/lib/gestion'
import { Pastille, useDocs, useFiches } from './commun'
import { BoutonPhoto } from './photo-facture'
import { fichiersEnAttente } from './assistant-factures'

export function AccueilGestion() {
  const { ws, canWrite } = useWorkspace()
  const actifs = modulesActifs(ws)
  if (!aGestion(actifs)) return null
  return <Bloc photo={actifs.has('factures_ia') && canWrite} devis={actifs.has('facturation') && canWrite} inter={actifs.has('interventions') && canWrite} />
}

function Bloc({ photo, devis, inter }: { photo: boolean; devis: boolean; inter: boolean }) {
  const { ws, nameOf } = useWorkspace()
  const router = useRouter()
  const docs = useDocs(), fiches = useFiches()
  if (docs.manque) return null
  const base = `/app/${ws.slug}/gestion`
  const auj = new Date().toISOString().slice(0, 10)
  const jour = docs.data.filter((d) => d.kind === 'intervention' && d.start_at && isSameDay(new Date(d.start_at), new Date()) && d.status !== 'annulee').sort((a, b) => a.start_at!.localeCompare(b.start_at!))
  const aEnc = docs.data.filter((d) => d.kind === 'facture' && ['envoyee', 'en_retard'].includes(d.status))
  const retard = aEnc.filter((d) => d.status === 'en_retard' || (d.due_at && d.due_at < auj))
  const attente = docs.data.filter((d) => d.kind === 'devis' && ['envoye', 'en_attente'].includes(d.status))
  const nom = (id: string | null) => { const f = fiches.data.find((x) => x.id === id); return f?.company || f?.name || '—' }
  // photo prise depuis l'accueil : lue par l'assistant (comme le trombone)
  const lirePhotos = (f: File[]) => { const cle = crypto.randomUUID(); fichiersEnAttente.set(cle, f); router.push(`${base}/scan?photo=${cle}`) }
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3"><h2 className="mr-auto text-sm font-semibold">Gestion</h2>
        {devis && <Link href={`${base}/devis?new=1`}><Button size="xs"><Plus className="size-3" />Devis</Button></Link>}
        {inter && <Link href={`${base}/interventions?new=1`}><Button size="xs"><Plus className="size-3" />Intervention</Button></Link>}
        {photo && <BoutonPhoto onPhotos={lirePhotos} label="Facture en photo" className="h-7 px-2 text-xs" />}
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-3">
        <Link href={`${base}/interventions`} className="bg-surface p-4 transition-colors hover:bg-surface-2">
          <div className="flex items-center gap-1.5 text-xs text-text-3"><Wrench className="size-3.5" />Interventions aujourd’hui</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{jour.length}</div>
          <ul className="mt-2 space-y-1">{jour.slice(0, 3).map((d) => <li key={d.id} className="flex items-center gap-2 text-[12px]"><span className="tabular-nums text-text-3">{format(new Date(d.start_at!), 'HH:mm', { locale: fr })}</span><span className="min-w-0 flex-1 truncate">{nom(d.contact_id)}{d.assigned_to?.length ? ` · ${d.assigned_to.map(nameOf).join(', ')}` : ''}</span><Pastille kind="intervention" status={d.status} className="scale-90" /></li>)}</ul>
        </Link>
        <Link href={`${base}/factures`} className="bg-surface p-4 transition-colors hover:bg-surface-2">
          <div className="text-xs text-text-3">À encaisser</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{eur(aEnc.reduce((a, d) => a + Number(d.total_ttc), 0))}</div>
          <div className="mt-1 text-[12px] text-text-3">{aEnc.length} facture{aEnc.length > 1 ? 's' : ''}{retard.length ? <span className="text-danger"> · {retard.length} en retard</span> : ''}</div>
        </Link>
        <Link href={`${base}/devis`} className="bg-surface p-4 transition-colors hover:bg-surface-2">
          <div className="flex items-center gap-1.5 text-xs text-text-3"><FileSignature className="size-3.5" />Devis en attente</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{attente.length}</div>
          <div className="mt-1 flex items-center gap-1 text-[12px] text-text-3">{eur(attente.reduce((a, d) => a + Number(d.total_ttc), 0))} TTC<ArrowRight className="size-3" /></div>
        </Link>
      </div>
    </Card>
  )
}
