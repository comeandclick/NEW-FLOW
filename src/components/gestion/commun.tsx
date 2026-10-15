'use client'
// Briques communes du module Gestion (15/10/2026) : données en direct, pastilles d'état, filtres de période, avis de migration.
import { useMemo, type ReactNode } from 'react'
import Link from 'next/link'
import { endOfMonth, endOfQuarter, endOfWeek, endOfYear, startOfMonth, startOfQuarter, startOfWeek, startOfYear, subMonths } from 'date-fns'
import { Database } from 'lucide-react'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { migrationManquante, statutDe, type Article, type DocKind, type Fiche, type GDoc } from '@/lib/gestion'
import { cn } from '@/lib/utils'

export function useDocs(kind?: DocKind | DocKind[]) {
  const { ws } = useWorkspace()
  const q = useLive<GDoc>('gestion_documents', {
    eq: { workspace_id: ws.id, ...(typeof kind === 'string' ? { kind } : {}) },
    ...(Array.isArray(kind) ? { in: { kind } } : {}),
    is: { deleted_at: null }, order: ['issued_at', false],
  })
  return { ...q, manque: migrationManquante(q.error) }
}
export function useArticles() {
  const { ws } = useWorkspace()
  const q = useLive<Article>('gestion_articles', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['label', true] })
  return { ...q, manque: migrationManquante(q.error) }
}
export function useFiches() {
  const { ws } = useWorkspace()
  return useLive<Fiche>('crm_contacts', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['name', true] })
}

export function Pastille({ kind, status, className }: { kind: DocKind; status: string; className?: string }) {
  const s = statutDe(kind, status)
  return <span className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium', className)} style={{ background: `color-mix(in srgb, ${s.c} 14%, transparent)`, color: s.c }}><span className="size-1.5 rounded-full" style={{ background: s.c }} />{s.l}</span>
}

export function AvisMigration() {
  return (
    <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-warning/40 bg-warning/10 p-5 text-[13.5px]">
      <div className="mb-2 flex items-center gap-2 font-semibold"><Database className="size-4" />Une étape reste à faire sur la base de données</div>
      <p className="text-text-2">La gestion (devis, factures, interventions) a besoin de ses tables. Dans Supabase, ouvre le SQL Editor du projet Flow, colle le fichier <code className="rounded bg-surface-2 px-1">supabase/2026-10-15-gestion.sql</code> et clique sur Run. Rien d’autre n’est touché.</p>
    </div>
  )
}

export type Periode = 'tout' | 'semaine' | 'mois' | 'mois_dernier' | 'trimestre' | 'annee' | 'perso'
export const PERIODES: { v: Periode; l: string }[] = [
  { v: 'tout', l: 'Tout' }, { v: 'semaine', l: 'Cette semaine' }, { v: 'mois', l: 'Ce mois' }, { v: 'mois_dernier', l: 'Mois dernier' },
  { v: 'trimestre', l: 'Ce trimestre' }, { v: 'annee', l: 'Cette année' }, { v: 'perso', l: 'Dates…' },
]
export function bornes(p: Periode, du?: string, au?: string): [Date, Date] | null {
  const n = new Date()
  switch (p) {
    case 'semaine': return [startOfWeek(n, { weekStartsOn: 1 }), endOfWeek(n, { weekStartsOn: 1 })]
    case 'mois': return [startOfMonth(n), endOfMonth(n)]
    case 'mois_dernier': { const m = subMonths(n, 1); return [startOfMonth(m), endOfMonth(m)] }
    case 'trimestre': return [startOfQuarter(n), endOfQuarter(n)]
    case 'annee': return [startOfYear(n), endOfYear(n)]
    case 'perso': return du && au ? [new Date(du + 'T00:00:00'), new Date(au + 'T23:59:59')] : null
    default: return null
  }
}
/** date qui situe un document dans le temps : début prévu pour une intervention, sinon date d'émission */
export const dateDoc = (d: GDoc) => new Date(d.kind === 'intervention' && d.start_at ? d.start_at : d.issued_at + 'T12:00:00')
export function useFiltrePeriode(docs: GDoc[], p: Periode, du?: string, au?: string) {
  return useMemo(() => { const b = bornes(p, du, au); return b ? docs.filter((d) => { const x = dateDoc(d); return x >= b[0] && x <= b[1] }) : docs }, [docs, p, du, au])
}

export function Chips<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { v: T; l: string; n?: number }[]; className?: string }) {
  return (
    <div className={cn('-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0', className)}>
      {items.map((i) => (
        <button key={i.v} onClick={() => onChange(i.v)} className={cn('shrink-0 rounded-full border px-3 py-1 text-[12.5px] transition-colors', value === i.v ? 'border-text bg-text text-bg' : 'border-border text-text-2 hover:border-border-strong hover:text-text')}>
          {i.l}{i.n !== undefined && <span className="ml-1.5 tabular-nums opacity-70">{i.n}</span>}</button>))}
    </div>
  )
}

export function Stat({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'info'; href?: string }) {
  const c = tone ? { success: 'text-success', warning: 'text-warning', danger: 'text-danger', info: 'text-info' }[tone] : ''
  const inner = <><div className="text-[12px] text-text-3">{label}</div><div className={cn('mt-1 text-lg font-semibold tabular-nums sm:text-xl', c)}>{value}</div>{hint && <div className="mt-0.5 text-[11.5px] text-text-3">{hint}</div>}</>
  return href ? <Link href={href} className="block rounded-xl border border-border bg-surface p-3.5 transition-colors hover:border-border-strong sm:p-4">{inner}</Link> : <div className="rounded-xl border border-border bg-surface p-3.5 sm:p-4">{inner}</div>
}
