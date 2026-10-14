'use client'
import { useEffect, useState } from 'react'
import { Download, FileText, Phone, Video } from 'lucide-react'
import { VoicePlayer } from './voice'
import { signedUrl } from '@/lib/storage'
import { formatBytes } from '@/lib/utils'
import { useT } from '@/i18n/provider'
import type { Attachment } from '@/lib/types'

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
