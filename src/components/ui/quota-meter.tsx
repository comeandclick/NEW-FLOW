// Jauge d'utilisation d'après 21st.dev « rate-limit-meter » (14/10/2026) : le chiffre restant, le total, quand ça repart,
// et une barre qui passe à l'orange puis au rouge quand on approche de la limite (le chiffre seul ferait peur sans contexte).
import { cn } from '@/lib/utils'

export function QuotaMeter({ titre, utilise, total, unite = '', reprise, className, afficher = 'restant' }: { titre: string; utilise: number; total: number; unite?: string; reprise?: string; className?: string; afficher?: 'restant' | 'utilise' }) {
  const reste = Math.max(0, total - utilise), part = total ? reste / total : 0
  const couleur = part > 0.4 ? 'text-success' : part > 0.1 ? 'text-warning' : 'text-danger'
  const barre = part > 0.4 ? 'bg-success' : part > 0.1 ? 'bg-warning' : 'bg-danger'
  const f = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
  return (
    <div className={cn('rounded-xl border border-border bg-surface p-4 shadow-sm', className)}>
      <div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium text-text-2">{titre}</span>{reprise && <span className="text-text-3">{reprise}</span>}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5"><span className={cn('text-2xl font-semibold tabular-nums tracking-tight', couleur)}>{f(afficher === 'restant' ? reste : utilise)}{unite}</span><span className="text-xs text-text-3">{afficher === 'restant' ? `/ ${f(total)}${unite} restants` : `utilisés sur ${f(total)}${unite}`}</span></div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-text/10"><div className={cn('h-full rounded-full transition-[width] duration-700', barre)} style={{ width: `${Math.round(part * 100)}%` }} /></div>
    </div>
  )
}
