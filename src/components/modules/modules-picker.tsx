'use client'
// Choix des fonctionnalités (15/10/2026) : utilisé juste après la création d'un espace et dans Paramètres > Fonctionnalités.
// Chaque carte : icône, nom, description, case pour l'activer ; l'exemple utilisable s'affiche à droite (en dessous sur téléphone).
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Eye } from 'lucide-react'
import { MODULES, type ModuleId } from '@/lib/modules'
import { getDb } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { DemoModule } from './demos'

const CATEGORIES = ['Équipe', 'Travail', 'Clients', 'Gestion', 'Studio', 'Personnel'] as const

/** Enregistre le choix dans workspaces.settings sans toucher aux autres réglages (clés API, entreprise…). */
export async function enregistrerModules(wsId: string, modules: ModuleId[]) {
  const db = getDb()
  const { data: cur } = await db.from('workspaces').select('settings').eq('id', wsId).single()
  const settings = { ...((cur as { settings?: object } | null)?.settings ?? {}), modules }
  const { error } = await db.from('workspaces').update({ settings }).eq('id', wsId)
  if (error) throw error
}

export function ModulesPicker({ value, onChange, disabled }: { value: Set<ModuleId>; onChange: (v: Set<ModuleId>) => void; disabled?: boolean }) {
  const [vu, setVu] = useState<ModuleId>('facturation')
  const basculer = (id: ModuleId) => { if (disabled) return; const n = new Set(value); if (n.has(id)) n.delete(id); else n.add(id); onChange(n); setVu(id) }
  const def = MODULES.find((m) => m.id === vu)!

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8">
      <div className="space-y-6">
        {CATEGORIES.map((cat) => (
          <section key={cat}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">{cat}</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {MODULES.filter((m) => m.categorie === cat).map((m) => {
                const on = value.has(m.id)
                return (
                  <li key={m.id}>
                    <div className={cn('group relative rounded-xl border bg-surface transition-colors', on ? 'border-accent/60 bg-accent-soft/40' : 'border-border hover:border-border-strong', vu === m.id && 'ring-2 ring-accent/25')}>
                      <button type="button" onClick={() => basculer(m.id)} disabled={disabled} aria-pressed={on}
                        className="flex w-full items-start gap-3 p-3.5 text-left disabled:cursor-not-allowed">
                        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors', on ? 'bg-accent text-accent-text' : 'bg-surface-2 text-text-2')}><m.icon className="size-[18px]" strokeWidth={1.75} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 text-[14px] font-semibold">{m.nom}{m.nouveau && <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-medium text-accent">Nouveau</span>}</span>
                          <span className="mt-0.5 block text-[12.5px] leading-snug text-text-2">{m.description}</span>
                        </span>
                        <span className={cn('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors', on ? 'border-accent bg-accent text-accent-text' : 'border-border-strong')}>{on && <Check className="size-3.5" strokeWidth={3} />}</span>
                      </button>
                      <button type="button" onClick={() => setVu(m.id)} className={cn('flex w-full items-center gap-1.5 border-t border-border/70 px-3.5 py-2 text-[12px] transition-colors lg:hidden', vu === m.id ? 'text-accent' : 'text-text-3')}>
                        <Eye className="size-3.5" />{vu === m.id ? 'Exemple ci-dessous' : 'Voir l’exemple'}
                      </button>
                      <button type="button" onClick={() => setVu(m.id)} className="absolute bottom-2 right-3 hidden items-center gap-1 text-[11.5px] text-text-3 opacity-0 transition-opacity hover:text-text group-hover:opacity-100 lg:flex"><Eye className="size-3.5" />Exemple</button>
                      <AnimatePresence initial={false}>
                        {vu === m.id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden lg:hidden">
                            <div className="p-3 pt-0"><DemoModule id={m.id} /></div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
      <aside className="hidden lg:block">
        <div className="sticky top-6 space-y-3">
          <div className="flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-lg bg-surface-2 text-text-2"><def.icon className="size-4" /></span>
            <div><div className="text-[14px] font-semibold">{def.nom}</div><div className="text-[12px] text-text-3">Exemple à essayer, rien n’est enregistré</div></div></div>
          <AnimatePresence mode="wait"><motion.div key={vu} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}><DemoModule id={vu} /></motion.div></AnimatePresence>
          <p className="text-[12.5px] leading-relaxed text-text-2">{def.description}</p>
        </div>
      </aside>
    </div>
  )
}
