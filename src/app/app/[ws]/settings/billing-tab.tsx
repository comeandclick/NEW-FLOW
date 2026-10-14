'use client'
// Paramètres → Abonnement (14/10/2026) : offre actuelle, jauges d'utilisation, offres de compte et d'espace (mensuel / annuel).
// Le paiement en ligne n'est pas encore branché : « Choisir » explique que tout est gratuit pendant le lancement.
import { useEffect, useState } from 'react'
import { Building2, Sparkles, User, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/overlay'
import { QuotaMeter } from '@/components/ui/quota-meter'
import { PricingCard } from '@/components/site/pricing-card'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { OFFRES, prix, type Offre, type Portee } from '@/lib/offres'
import { cn } from '@/lib/utils'

const ICONES = { gratuit: User, pro: Sparkles, equipe: Users, studio: Building2 } as const

export function BillingTab() {
  const { ws, members } = useWorkspace()
  const fichiers = useLive<{ size: number | null }>('files', { select: 'size', eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const [portee, setPortee] = useState<Portee | 'tout'>('tout')
  const [annuel, setAnnuel] = useState(true)
  const [choix, setChoix] = useState<Offre | null>(null)
  const [ia, setIa] = useState(0)
  useEffect(() => { try { const d = JSON.parse(localStorage.getItem('flow_ia_jour') || '{}'); setIa(d.jour === new Date().toDateString() ? d.n : 0) } catch {} }, [])
  const go = fichiers.data.reduce((n, f) => n + (f.size ?? 0), 0) / 1024 ** 3
  const liste = OFFRES.filter((o) => portee === 'tout' || o.portee === portee)

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
        <span className="grid size-11 place-items-center rounded-lg bg-text text-bg"><User className="size-5" strokeWidth={1.75} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Offre actuelle : Gratuit <span className="ml-1 rounded-full border border-text/20 px-2 py-0.5 text-xs font-medium text-text-2">Lancement</span></p>
          <p className="text-[13px] text-text-3">Pendant le lancement, tout Flow est ouvert sans limite. Aucun moyen de paiement n&apos;est demandé.</p>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold">Utilisation de « {ws.name} »</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <QuotaMeter titre="Membres" utilise={members.length} total={Math.max(3, members.length)} reprise="Offre Gratuit : 3" />
          <QuotaMeter titre="Fichiers" utilise={Math.round(go * 10) / 10} total={5} unite=" Go" reprise="Offre Gratuit : 5 Go" />
          <QuotaMeter titre="Assistant IA aujourd'hui" utilise={ia} total={20} reprise="repart à minuit" />
        </div>
        <p className="mt-2 text-xs text-text-3">Pendant le lancement, ces limites ne bloquent rien : elles montrent ce que couvrirait chaque offre.</p>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5" role="tablist" aria-label="Type d'abonnement">
            {([['tout', 'Toutes'], ['compte', 'Mon compte'], ['espace', 'Espace / projet']] as const).map(([v, l]) => (
              <button key={v} role="tab" aria-selected={portee === v} onClick={() => setPortee(v)} className={cn('h-8 rounded-md px-3 text-[13px] font-medium transition-colors', portee === v ? 'bg-surface text-text shadow-sm' : 'text-text-3 hover:text-text')}>{l}</button>
            ))}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-text-2">
            Mensuel
            <button type="button" role="switch" aria-checked={annuel} onClick={() => setAnnuel((a) => !a)} className={cn('relative h-5 w-9 rounded-full transition-colors', annuel ? 'bg-success' : 'bg-border-strong')}>
              <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform', annuel ? 'translate-x-[18px]' : 'translate-x-0.5')} />
            </button>
            Annuel <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">-20 %</span>
          </label>
        </div>
        <div className="grid justify-items-center gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {liste.map((o) => (
            <PricingCard key={o.id} className="max-w-none" o={{ icon: ICONES[o.id as keyof typeof ICONES] ?? Sparkles, nom: o.nom, pastille: o.pastille, prix: prix(o, annuel), periode: o.mois ? o.unite : undefined,
              barre: annuel && o.mois ? `${o.mois} €` : undefined, cta: `Choisir ${o.nom}`, actuelle: o.id === 'gratuit', principale: o.principale, pour: o.pour, inclus: o.inclus, onChoisir: () => setChoix(o) }} />
          ))}
        </div>
      </section>

      <Dialog open={!!choix} onClose={() => setChoix(null)} title={`Flow ${choix?.nom ?? ''}`} size="sm"
        footer={<><Button variant="outline" onClick={() => setChoix(null)}>Fermer</Button><Button variant="primary" onClick={() => { try { localStorage.setItem('flow_offre_souhaitee', choix?.id ?? '') } catch {} toast.success('Noté : on te prévient dès l\'ouverture des abonnements'); setChoix(null) }}>Me prévenir</Button></>}>
        <p className="text-sm text-text-2">Les abonnements ouvriront après le lancement. D&apos;ici là, tu as déjà accès à tout ce que comprend {choix?.nom}, gratuitement.</p>
      </Dialog>
    </div>
  )
}
