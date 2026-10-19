'use client'
import { useEffect, useState } from 'react'
import { Check, Download, FileText, Phone, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VoicePlayer } from './voice'
import { signedUrl } from '@/lib/storage'
import { formatBytes } from '@/lib/utils'
import { useT } from '@/i18n/provider'
import type { Attachment, Reaction } from '@/lib/types'

/** Vote d'un sondage : une réaction « poll:<numéro de l'option> » (même règle dans l'app Flow Workspace). */
export const POLL_VOTE = 'poll:'

function useFileUrl(att: Attachment) {
  const [url, setUrl] = useState(att.url ?? '')
  useEffect(() => {
    let alive = true
    if (!att.url && att.path) signedUrl('files', att.path).then((u) => alive && setUrl(u))
    return () => { alive = false }
  }, [att.url, att.path])
  return url
}

export function AttachmentView({ att, mine }: { att: Attachment; mine?: boolean }) {
  const url = useFileUrl(att)
  if (att.type === 'poll') return null
  if (att.type === 'audio') return <VoicePlayer att={att} mine={mine} />
  if (att.type === 'image') {
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={att.name ?? ''} loading="lazy" className="max-h-72 max-w-full rounded-xl border border-border object-cover sm:max-w-sm" /></a>
    ) : <div className="skeleton h-40 w-60" />
  }
  if (att.type === 'video') return url ? <video src={url} controls preload="metadata" className="max-h-72 max-w-full rounded-xl border border-border sm:max-w-sm" /> : <div className="skeleton h-40 w-60" />
  return (
    <a href={url || undefined} download={att.name} target="_blank" rel="noreferrer"
      className="flex w-64 max-w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-text transition-colors hover:border-border-strong">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink"><FileText className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{att.name}</span><span className="block text-[11px] text-text-3">{formatBytes(att.size)}</span></span>
      <Download className="size-4 text-text-3" />
    </a>
  )
}

export function CallCard({ video, onJoin, name }: { video: boolean; onJoin: () => void; name: string }) {
  const t = useT()
  return (
    <div className="flex w-72 max-w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
      <span className="flex size-9 items-center justify-center rounded-full bg-success/15 text-success">{video ? <Video className="size-4" /> : <Phone className="size-4" />}</span>
      <span className="min-w-0 flex-1 text-[13px]"><span className="font-medium">{name}</span> <span className="text-text-2">{t('msg.callStarted')}</span></span>
      <button onClick={onJoin} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-text hover:bg-accent-hover">{t('msg.joinCall')}</button>
    </div>
  )
}

/** Sondage : la question est le texte du message, les options sont dans la pièce jointe, chaque vote est une réaction. */
export function PollCard({ att, votes, userId, onVote, canVote }: { att: Attachment; votes: Reaction[]; userId: string | null; onVote: (index: number) => void; canVote: boolean }) {
  const t = useT()
  const options = att.options ?? []
  const voters = new Set(votes.map((v) => v.user_id)).size
  return (
    <div className="w-72 max-w-full space-y-1.5 rounded-xl border border-border bg-surface p-2.5">
      {options.map((o, i) => {
        const list = votes.filter((v) => v.emoji === `${POLL_VOTE}${i}`)
        const mine = list.some((v) => v.user_id === userId)
        const pct = voters ? Math.round((list.length / voters) * 100) : 0
        return (
          <button key={i} disabled={!canVote} onClick={() => onVote(i)}
            className={cn('relative flex w-full items-center gap-2 overflow-hidden rounded-lg border px-2.5 py-2 text-left text-[13px] transition-colors', mine ? 'border-text/40' : 'border-border hover:border-border-strong')}>
            <span className="absolute inset-y-0 left-0 bg-accent-soft transition-[width]" style={{ width: `${pct}%` }} />
            <span className={cn('relative flex size-4 shrink-0 items-center justify-center border', att.multi ? 'rounded' : 'rounded-full', mine ? 'border-text bg-text text-bg' : 'border-border-strong')}>{mine && <Check className="size-3" />}</span>
            <span className="relative min-w-0 flex-1 truncate">{o}</span>
            <span className="relative text-[11px] tabular-nums text-text-3">{list.length}</span>
          </button>
        )
      })}
      <p className="px-1 text-[11px] text-text-3">{t('msg.pollVoters', { n: voters })}{att.multi ? ` · ${t('msg.pollMulti')}` : ''}</p>
    </div>
  )
}
