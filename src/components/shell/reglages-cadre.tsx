'use client'
// Paramètres « comme sur les sites en général » (14/10/2026) : une colonne de rubriques à gauche (Compte, Espace, Outils),
// le contenu à droite. Sur téléphone, les rubriques deviennent une rangée défilante en haut.
import Link from 'next/link'
import { Activity, Bell, Building2, CreditCard, Globe, KeyRound, Laptop, LayoutGrid, Settings2, Trash2, User, Users, Zap } from 'lucide-react'
import { motion } from 'framer-motion'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { cn } from '@/lib/utils'

export type CleReglage = 'profile' | 'preferences' | 'billing' | 'workspace' | 'modules' | 'entreprise' | 'members' | 'api' | 'studio' | 'automations' | 'activity' | 'trash'
const GROUPES: { titre: string; items: { cle: CleReglage; nom: string; I: typeof User; href: string }[] }[] = [
  { titre: 'Compte', items: [{ cle: 'profile', nom: 'Profil', I: User, href: '/settings?tab=profile' }, { cle: 'preferences', nom: 'Préférences', I: Bell, href: '/settings?tab=preferences' }, { cle: 'billing', nom: 'Abonnement', I: CreditCard, href: '/settings?tab=billing' }] },
  { titre: 'Espace', items: [{ cle: 'workspace', nom: 'Général', I: Settings2, href: '/settings?tab=workspace' }, { cle: 'modules', nom: 'Fonctionnalités', I: LayoutGrid, href: '/settings?tab=modules' }, { cle: 'entreprise', nom: 'Entreprise', I: Building2, href: '/settings?tab=entreprise' }, { cle: 'members', nom: 'Membres', I: Users, href: '/settings?tab=members' }, { cle: 'api', nom: 'API', I: KeyRound, href: '/settings?tab=api' }, { cle: 'studio', nom: 'Atelier (Mac)', I: Laptop, href: '/settings?tab=studio' }] },
  { titre: 'Outils', items: [{ cle: 'automations', nom: 'Automatisations', I: Zap, href: '/automations' }, { cle: 'activity', nom: 'Activité', I: Activity, href: '/activity' }, { cle: 'trash', nom: 'Corbeille', I: Trash2, href: '/trash' }] },
]
export const NOM_REGLAGE = Object.fromEntries(GROUPES.flatMap((g) => g.items.map((i) => [i.cle, i.nom]))) as Record<CleReglage, string>

export function ReglagesCadre({ actif, children }: { actif: CleReglage; children: React.ReactNode }) {
  const { ws } = useWorkspace()
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:flex lg:gap-10">
      <aside className="mb-5 lg:sticky lg:top-6 lg:mb-0 lg:w-56 lg:shrink-0 lg:self-start">
        <h1 className="mb-4 hidden items-center gap-2 text-lg font-semibold tracking-tight lg:flex"><Globe className="size-4 text-text-3" />Paramètres</h1>
        <nav aria-label="Paramètres" className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:block lg:space-y-5 lg:px-0">
          {GROUPES.map((g) => (
            <div key={g.titre} className="contents lg:block">
              <div className="hidden px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3/70 lg:block">{g.titre}</div>
              {g.items.map((it) => (
                <Link key={it.cle} href={`/app/${ws.slug}${it.href}`} aria-current={actif === it.cle ? 'page' : undefined}
                  className={cn('relative flex h-[34px] shrink-0 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors max-lg:border max-lg:border-border', actif === it.cle ? 'font-medium text-text' : 'text-text-2 hover:bg-text/5 hover:text-text')}>
                  {actif === it.cle && <motion.span layoutId="reglage-actif" className="absolute inset-0 rounded-md bg-text/[0.06] dark:bg-text/10" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <it.I className="relative size-4 text-text-3" strokeWidth={1.75} /><span className="relative whitespace-nowrap">{it.nom}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <section className="min-w-0 flex-1">
        {children}
      </section>
    </div>
  )
}
