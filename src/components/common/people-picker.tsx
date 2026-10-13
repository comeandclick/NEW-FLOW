'use client'
import { Check } from 'lucide-react'
import { Avatar } from '@/components/ui/misc'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { cn } from '@/lib/utils'

/** Tick the members to assign. Used for notes, tags and anywhere "who is concerned" is asked. */
export function PeoplePicker({ value, onChange, disabled, label }: { value: string[]; onChange: (ids: string[]) => void; disabled?: boolean; label: string }) {
  const { members } = useWorkspace()
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {members.filter((m) => !(m.profile?.preferences as { bot?: boolean } | undefined)?.bot || value.includes(m.user_id)).map((m) => {
        const on = value.includes(m.user_id)
        const name = m.profile?.full_name ?? m.profile?.email ?? '—'
        return (
          <label key={m.user_id} className={cn('flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors', on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-text-2 hover:border-border-strong', disabled && 'pointer-events-none opacity-60')}>
            <input type="checkbox" className="sr-only" checked={on} disabled={disabled} onChange={() => toggle(m.user_id)} />
            <span className="relative"><Avatar name={name} src={m.profile?.avatar_url} size={20} />{on && <span className="absolute -bottom-0.5 -right-0.5 grid size-3 place-items-center rounded-full bg-accent text-white"><Check className="size-2" strokeWidth={4} /></span>}</span>
            {name}
          </label>
        )
      })}
    </div>
  )
}
