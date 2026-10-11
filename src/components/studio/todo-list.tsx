'use client'
import { Check, Loader2 } from 'lucide-react'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import type { TodoItem } from '@/lib/studio/api'
import { cn } from '@/lib/utils'

/** Liste des tâches de Claude : les cases se cochent en direct. */
export function TodoList({ items, compact }: { items: TodoItem[]; compact?: boolean }) {
  const { locale } = useI18n()
  const c = studioCopy(locale).live
  const done = items.filter((i) => i.state === 'done').length
  if (!items.length) return <p className="text-[13px] text-text-3">{c.todoEmpty}</p>
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-text-3"><span>{done} / {items.length}</span></div>
      <ul className={cn('space-y-1 overflow-y-auto pr-1', compact ? 'max-h-56' : 'max-h-full')} aria-label={c.todo}>
        {items.map((i, n) => (
          <li key={n} className={cn('flex items-start gap-2 rounded-md px-1.5 py-1 text-[13px]', i.state === 'doing' && 'bg-accent-soft')}>
            <span className={cn('mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border', i.state === 'done' ? 'border-success bg-success text-white' : i.state === 'doing' ? 'border-accent text-accent-ink' : 'border-border-strong')} aria-hidden>
              {i.state === 'done' ? <Check className="size-3" /> : i.state === 'doing' ? <Loader2 className="size-3 animate-spin" /> : null}
            </span>
            <span className={cn('min-w-0 break-words', i.state === 'done' ? 'text-text-3 line-through' : 'text-text')}>{i.text}</span>
            <span className="sr-only">{i.state}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
