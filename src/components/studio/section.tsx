'use client'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

export function Section({ title, hint, children, className, step }: { title: string; hint?: string; children: ReactNode; className?: string; step?: number }) {
  return (
    <Card className={cn('p-5 max-md:p-4', className)}>
      <div className="mb-4 flex items-start gap-3">
        {step != null && <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-semibold text-text-2">{step}</span>}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">{title}</h2>
          {hint && <p className="mt-0.5 text-[13px] text-text-3">{hint}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}

/** Carte de choix à une seule valeur (format, qualité, type de projet…). */
export function ChoiceGrid<T extends string | number>({ value, onChange, items, cols = 'sm:grid-cols-4', label }: {
  value: T; onChange: (v: T) => void; label: string
  items: { value: T; title: string; hint?: string; visual?: ReactNode; badge?: string }[]; cols?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid grid-cols-2 gap-2', cols)}>
      {items.map((it) => {
        const on = it.value === value
        return (
          <button key={String(it.value)} type="button" role="radio" aria-checked={on} onClick={() => onChange(it.value)}
            className={cn('relative flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition-[border,background,box-shadow]',
              on ? 'border-accent bg-accent-soft ring-4 ring-accent/10' : 'border-border-strong bg-surface hover:bg-surface-2')}>
            {it.visual && <span className="flex h-12 items-center">{it.visual}</span>}
            <span className="block">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-text">{it.title}{it.badge && <span className="rounded bg-accent px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent-text">{it.badge}</span>}</span>
              {it.hint && <span className="block text-xs text-text-3">{it.hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
