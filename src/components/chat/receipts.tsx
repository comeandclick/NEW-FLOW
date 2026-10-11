'use client'
import { Check, CheckCheck, Info } from 'lucide-react'
import { format } from 'date-fns'
import { Avatar } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useT } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { ConvMember, Message, Profile } from '@/lib/types'

/** Who has read a message: a member has read it once their last_read_at is at or after the message date. */
export function readers(m: Message, members: ConvMember[], authorId: string) {
  const others = members.filter((c) => c.user_id !== authorId)
  const seen = others.filter((c) => new Date(c.last_read_at).getTime() >= new Date(m.created_at).getTime())
  return { seen, unseen: others.filter((c) => !seen.includes(c)), total: others.length }
}

/** One grey tick pair when sent, theme-coloured when every other member has seen it. */
export function Ticks({ all, className }: { all: boolean; className?: string }) {
  const t = useT()
  return (
    <span className={cn('inline-flex shrink-0 items-center', all ? 'text-accent' : 'text-text-3', className)} title={all ? t('rcp.seenAll') : t('rcp.sent')} role="img" aria-label={all ? t('rcp.seenAll') : t('rcp.sent')}>
      <CheckCheck className="size-3.5" strokeWidth={2.4} />
    </span>
  )
}

export function SentTick() {
  const t = useT()
  return <span className="inline-flex text-text-3" role="img" aria-label={t('rcp.sending')}><Check className="size-3.5" strokeWidth={2.4} /></span>
}

/** Small grey circled "i" that opens the list of people who have seen / not seen the message. */
export function SeenButton({ onClick }: { onClick: () => void }) {
  const t = useT()
  return (
    <button type="button" onClick={onClick} aria-label={t('rcp.info')} title={t('rcp.info')}
      className="grid size-4 shrink-0 place-items-center rounded-full border border-border-strong text-text-3 transition-colors hover:border-text-2 hover:text-text-2">
      <Info className="size-2.5" strokeWidth={2.6} />
    </button>
  )
}

export function SeenDialog({ message, members, profileOf, onClose }: {
  message: Message | null; members: ConvMember[]; profileOf: (id?: string | null) => Profile | null; onClose: () => void
}) {
  const t = useT()
  const r = message ? readers(message, members, message.user_id) : null
  const row = (c: ConvMember, seen: boolean) => {
    const p = profileOf(c.user_id)
    return (
      <li key={c.user_id} className="flex items-center gap-3 py-1.5">
        <Avatar name={p?.full_name ?? p?.email} src={p?.avatar_url} size={28} />
        <span className="min-w-0 flex-1 truncate text-sm">{p?.full_name ?? p?.email ?? '—'}</span>
        {seen ? <span className="text-xs text-text-3">{format(new Date(c.last_read_at), 'd MMM HH:mm')}</span> : <span className="text-xs text-text-3">{t('rcp.notYet')}</span>}
      </li>
    )
  }
  return (
    <Dialog open={!!message} onClose={onClose} title={t('rcp.title')} size="sm">
      {r && (
        <div className="space-y-4">
          <section>
            <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent-ink"><CheckCheck className="size-3.5" />{t('rcp.seenBy', { n: r.seen.length })}</h3>
            {r.seen.length ? <ul>{r.seen.map((c) => row(c, true))}</ul> : <p className="py-1 text-sm text-text-3">—</p>}
          </section>
          <section>
            <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-3"><Check className="size-3.5" />{t('rcp.notSeen', { n: r.unseen.length })}</h3>
            {r.unseen.length ? <ul>{r.unseen.map((c) => row(c, false))}</ul> : <p className="py-1 text-sm text-text-3">—</p>}
          </section>
        </div>
      )}
    </Dialog>
  )
}

/** Three bouncing dots + names, shown while someone is typing. */
export function TypingLine({ names }: { names: string[] }) {
  const t = useT()
  if (!names.length) return <div className="h-5" aria-live="polite" />
  const label = names.length === 1 ? t('msg.typing1', { a: names[0] }) : names.length === 2 ? t('msg.typing2', { a: names[0], b: names[1] }) : t('msg.typingMany')
  return (
    <div className="flex h-5 items-center gap-2 px-1 text-xs text-text-3" aria-live="polite">
      <span className="flex items-center gap-[3px] rounded-full bg-surface-3 px-2 py-1.5" aria-hidden>
        {[0, 1, 2].map((i) => <span key={i} className="typing-dot size-[5px] rounded-full bg-text-2" style={{ animationDelay: `${i * 0.16}s` }} />)}
      </span>
      <span>{label}</span>
    </div>
  )
}
