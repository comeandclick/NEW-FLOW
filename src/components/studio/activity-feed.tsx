'use client'
import { useEffect, useRef } from 'react'
import { AlertTriangle, Bot, Check, CheckCheck, CircleDot, Footprints, MessageCircleQuestion, Paperclip, Terminal, User, XCircle } from 'lucide-react'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import type { LiveEvent } from '@/lib/studio/api'
import { cn } from '@/lib/utils'

/** Fil d'activité en direct : ce que Claude fait, tes messages (avec leur état de remise) et les événements importants. */
export function ActivityFeed({ events, labels }: { events: LiveEvent[]; labels: Record<string, { t: string; d: string }> }) {
  const { locale } = useI18n()
  const c = studioCopy(locale).live
  const end = useRef<HTMLDivElement>(null)
  const last = events[events.length - 1]?.id
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [last])
  if (!events.length) return <p className="text-[13px] text-text-3">{c.activityEmpty}</p>
  const time = (e: LiveEvent) => new Date(e.at).toLocaleTimeString(locale, { timeStyle: 'short' })
  const stateLabel = (s?: string) => (s === 'applied' ? c.msgApplied : s === 'delivered' ? c.msgDelivered : c.msgSent)
  return (
    <div className="max-h-[360px] overflow-y-auto pr-1" aria-live="polite" tabIndex={0}>
    <ol className="space-y-2">
      {events.map((e) => {
        if (e.kind === 'message') {
          const files = e.data?.files ?? []
          return (
            <li key={e.id} className="flex flex-row-reverse gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-text text-bg"><User className="size-3" /></span>
              <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-text px-3 py-2 text-[13px] text-bg">
                {e.body && <p className="whitespace-pre-wrap">{e.body}</p>}
                {files.length > 0 && <p className="mt-1 flex flex-wrap gap-x-2 text-xs opacity-80">{files.map((f, i) => <span key={i} className="inline-flex items-center gap-1"><Paperclip className="size-3" />{f.name}</span>)}</p>}
                <p className="mt-1 flex items-center gap-1 text-[11px] opacity-70">{e.data?.state === 'applied' ? <CheckCheck className="size-3" /> : <Check className="size-3" />}{stateLabel(e.data?.state)} · {time(e)}</p>
              </div>
            </li>
          )
        }
        const Icon = e.kind === 'step' ? Footprints : e.kind === 'question' ? MessageCircleQuestion : e.level === 'error' ? XCircle : e.level === 'warning' ? AlertTriangle : e.level === 'success' ? Check : e.title === 'Commande' ? Terminal : e.title === 'Claude' ? Bot : CircleDot
        const title = e.kind === 'step' ? `${c.stepProgress} : ${labels[e.title]?.t ?? e.title}` : e.title
        return (
          <li key={e.id} className="flex gap-2">
            <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full', e.level === 'error' ? 'bg-danger/10 text-danger' : e.level === 'success' ? 'bg-success/10 text-success' : e.level === 'question' ? 'bg-[#c2410c]/10 text-[#c2410c]' : 'bg-surface-3 text-text-3')}><Icon className="size-3" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-text"><span className="font-medium">{title}</span><span className="ml-2 text-[11px] text-text-3">{time(e)}</span></p>
              {e.body && <p className={cn('line-clamp-3 break-words text-xs text-text-3', e.title === 'Commande' && 'font-mono')}>{e.body}</p>}
            </div>
          </li>
        )
      })}
    </ol>
      <div ref={end} />
    </div>
  )
}
