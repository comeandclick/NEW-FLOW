'use client'
// Offres sur le site public (accueil + page Tarifs) : bascule mensuel / annuel, 4 cartes, comparatif repliable.
import { useState } from 'react'
import { Building2, Check, Minus, Sparkles, User, Users } from 'lucide-react'
import { PricingCard } from './pricing-card'
import { OFFRES, prix } from '@/lib/offres'
import { cn } from '@/lib/utils'

const ICONES = { gratuit: User, pro: Sparkles, equipe: Users, studio: Building2 } as const
const LIGNES: [string, (string | boolean)[]][] = [
  ['Membres', ['3', 'Illimités', 'Illimités', 'Illimités']], ['Fichiers', ['5 Go', '100 Go', '1 To', '1 To']],
  ['Assistant IA avec widgets', ['20 / jour', true, true, true]], ['Espaces clients', ['1', 'Illimités', 'Illimités', 'Marque blanche']],
  ['Atelier (motion, sites)', ['1 Mac', '1 Mac', 'Toute l\'équipe', 'Agents en parallèle']], ['Rôles et invités', [false, false, true, true]], ['Support prioritaire', [false, false, true, true]],
]

export function OffresPubliques({ comparatif = false }: { comparatif?: boolean }) {
  const [annuel, setAnnuel] = useState(true)
  return (
    <div>
      <div className="mb-8 flex items-center justify-center gap-2.5 text-sm text-text-2">
        <span>Mensuel</span>
        <button type="button" role="switch" aria-checked={annuel} aria-label="Facturation annuelle" onClick={() => setAnnuel((a) => !a)} className={cn('relative h-6 w-11 shrink-0 rounded-full p-0 transition-colors', annuel ? 'bg-success' : 'bg-border-strong')}>
          <span className={cn('absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform', annuel ? 'translate-x-[22px]' : 'translate-x-0.5')} />
        </button>
        Annuel <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">2 mois offerts</span>
      </div>
      <div className="grid justify-items-center gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {OFFRES.map((o) => (
          <PricingCard key={o.id} className="max-w-none" o={{ icon: ICONES[o.id as keyof typeof ICONES], nom: o.nom, pastille: o.pastille, prix: prix(o, annuel), periode: o.mois ? o.unite : undefined,
            barre: annuel && o.mois ? `${o.mois} €` : undefined, cta: o.mois ? `Essayer ${o.nom}` : 'Commencer gratuitement', href: '/register', principale: o.principale, pour: o.pour, inclus: o.inclus }} />
        ))}
      </div>
      <p className="mt-6 text-center text-[13px] text-text-3">Pendant le lancement, tout est gratuit et sans carte bancaire. Les offres payantes ouvriront ensuite, avec un mois d&apos;essai.</p>
      {comparatif && (
        <div className="mt-14 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-2 text-[13px] text-text-3"><tr><th className="px-4 py-3 font-medium">Comparer</th>{OFFRES.map((o) => <th key={o.id} className="px-4 py-3 font-semibold text-text">{o.nom}</th>)}</tr></thead>
            <tbody className="divide-y divide-border">
              {LIGNES.map(([nom, v]) => (
                <tr key={nom}><td className="px-4 py-3 text-text-2">{nom}</td>{v.map((x, i) => <td key={i} className="px-4 py-3">{x === true ? <Check className="size-4 text-success" /> : x === false ? <Minus className="size-4 text-text-3" /> : <span className="text-text">{x}</span>}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
