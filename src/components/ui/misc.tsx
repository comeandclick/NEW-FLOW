'use client'
import { type ReactNode, type HTMLAttributes } from 'react'
import { cn, colorFor, initials } from '@/lib/utils'

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-surface shadow-sm', className)} {...p} />
}

export function Badge({ className, color, children }: { className?: string; color?: string; children: ReactNode }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-[11px] font-medium text-text-2', className)}
      style={color ? { background: `color-mix(in srgb, ${color} 16%, transparent)`, color: `color-mix(in srgb, ${color} 55%, var(--text))` } : undefined}
    >
      {children}
    </span>
  )
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-surface-2 px-1 font-mono text-[10px] text-text-2', className)}>
      {children}
    </kbd>
  )
}

export function Avatar({ name, src, size = 28, className, status }: { name?: string | null; src?: string | null; size?: number; className?: string; status?: string | null }) {
  const bg = colorFor(name ?? '?')
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, background: src ? 'transparent' : bg, fontSize: Math.max(10, size * 0.38) }}
      title={name ?? undefined}>
      {src ?   <img src={src} alt="" className="size-full rounded-full object-cover" /> : initials(name)}
      {status && (
        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface"
          style={{ background: status === 'online' ? 'var(--success)' : status === 'dnd' ? 'var(--danger)' : status === 'away' ? 'var(--warning)' : 'var(--text-3)' }} />
      )}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

export function EmptyState({ icon, title, hint, action, className }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-16 text-center animate-fade-in', className)}>
      {icon && <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-surface-2 text-text-3">{icon}</div>}
      <div className="space-y-1">
        <p className="text-sm font-medium text-text">{title}</p>
        {hint && <p className="mx-auto max-w-sm text-[13px] text-text-3">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-border-strong')}>
      <span className={cn('absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
    </button>
  )
}

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">{icon}</span>}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-[13px] text-text-3">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; icon?: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-lg border border-border bg-surface-2 p-0.5', className)} role="tablist">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}
          className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
            value === it.value ? 'bg-surface text-text shadow-sm' : 'text-text-3 hover:text-text')}>
          {it.icon}{it.label}
        </button>
      ))}
    </div>
  )
}
