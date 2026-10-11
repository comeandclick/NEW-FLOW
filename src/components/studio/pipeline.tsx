'use client'
import { Check, Loader2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Step } from '@/lib/studio/types'

/** Frise verticale des étapes : fait, en cours, à venir. */
export function Pipeline({ steps, labels, compact }: { steps: Step[]; labels: Record<string, { t: string; d: string }>; compact?: boolean }) {
  return (
    <ol className="relative space-y-0">
      {steps.map((s, i) => {
        const l = labels[s.id]
        const last = i === steps.length - 1
        return (
          <li key={s.id} className="relative flex gap-3 pb-3 last:pb-0" aria-current={s.state === 'active' ? 'step' : undefined}>
            {!last && <span className={cn('absolute left-[11px] top-6 h-[calc(100%-18px)] w-px', s.state === 'done' ? 'bg-accent/50' : 'bg-border')} aria-hidden />}
            <span className={cn('relative z-10 mt-0.5 flex size-[23px] shrink-0 items-center justify-center rounded-full border text-[10px]',
              s.state === 'done' ? 'border-accent bg-accent text-accent-text' : s.state === 'active' ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border-strong bg-surface text-text-3')}>
              {s.state === 'done' ? <Check className="size-3" strokeWidth={3} /> : s.state === 'active' ? <Loader2 className="size-3 animate-spin" /> : <Circle className="size-1.5 fill-current" />}
            </span>
            <span className="min-w-0">
              <span className={cn('block text-[13px] font-medium', s.state === 'todo' ? 'text-text-3' : 'text-text')}>{l?.t ?? s.id}</span>
              {!compact && <span className="block text-xs text-text-3">{l?.d}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
