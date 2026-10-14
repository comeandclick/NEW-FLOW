// Carte de tarif d'après 21st.dev « pricing-card / multi-cards » (14/10/2026) : cadre fin, en-tête grisé avec icône,
// nom, pastille, prix en gras, bouton, puis la liste des inclusions. Plusieurs offres = plusieurs cartes côte à côte.
import Link from 'next/link'
import { CircleCheck, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Offre = { icon: LucideIcon; nom: string; pastille?: string; prix: string; periode?: string; barre?: string; cta: string; href?: string; onChoisir?: () => void; actuelle?: boolean; principale?: boolean; pour: string; inclus: string[] }

export function PricingCard({ o, className }: { o: Offre; className?: string }) {
  return (
    <div className={cn('relative w-full max-w-sm rounded-xl border bg-surface p-1.5 shadow-xl backdrop-blur-xl dark:border-border-strong/80 dark:bg-transparent md:min-w-[280px]', className)}>
      <div className="relative mb-4 rounded-xl border bg-surface-2/80 p-4 dark:bg-surface-2/50">
        <div className="flex items-center gap-2 text-sm font-medium text-text-3">
          <o.icon className="size-4" strokeWidth={1.75} /><span>{o.nom}</span>
          {o.pastille && <span className="ml-auto rounded-full border border-text/20 px-2 py-0.5 text-xs text-text/80">{o.pastille}</span>}
        </div>
        <div className="mt-4 flex items-end gap-1">
          <span className="text-3xl font-extrabold tracking-tight">{o.prix}</span>
          {o.periode && <span className="pb-1 text-sm text-text/80">{o.periode}</span>}
          {o.barre && <span className="ml-auto mr-1 text-lg text-text-3 line-through">{o.barre}</span>}
        </div>
        {(() => { const cls = cn('mt-4 flex h-9 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-60',
          o.principale && !o.actuelle ? 'border-transparent bg-text text-bg hover:bg-text/90' : 'bg-surface hover:bg-surface-2')
          return o.href && !o.actuelle ? <Link href={o.href} className={cls}>{o.cta}</Link> : <button type="button" disabled={o.actuelle} onClick={o.onChoisir} className={cls}>{o.actuelle ? 'Offre actuelle' : o.cta}</button> })()}
      </div>
      <div className="space-y-3 px-3 pb-3">
        <p className="text-xs text-text-3">{o.pour}</p>
        <ul className="space-y-2.5">
          {o.inclus.map((x) => <li key={x} className="flex items-start gap-3 text-sm text-text-3"><CircleCheck className="mt-0.5 size-4 shrink-0 text-text-2" strokeWidth={1.75} /><span>{x}</span></li>)}
        </ul>
      </div>
    </div>
  )
}
