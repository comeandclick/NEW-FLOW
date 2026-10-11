'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Download, ExternalLink, Film, Globe, Laptop, MessageCircleQuestion, Pause, Play, RotateCcw, Square, Trash2, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { MOTION_STEPS, SITE_STEPS } from '@/lib/studio/steps'
import { studioApi, usePoll, type LiveJob, type LiveStatus } from '@/lib/studio/api'
import { showSystemNotification } from '@/lib/push'
import { cn, formatBytes } from '@/lib/utils'
import type { Step } from '@/lib/studio/types'
import { ActivityFeed } from './activity-feed'
import { MessageComposer } from './message-composer'
import { Pipeline } from './pipeline'

const COLORS: Record<LiveStatus, string | undefined> = {
  draft: undefined, queued: '#0369a1', starting: '#4d59c7', running: '#4d59c7', paused: '#a16207', needs_answer: '#c2410c', done: '#15803d', failed: '#c4262f', cancelled: undefined,
}
const ACTIVE: LiveStatus[] = ['starting', 'running', 'paused', 'needs_answer']

const fmt = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : m ? `${m} min ${String(s % 60).padStart(2, '0')}` : `${s} s` }

/** Carte d'un vrai projet : état en direct, pause / reprise / annulation, questions, messages, fichiers, résultat. */
export function LiveJobCard({ job, defaultOpen = false, onChanged }: { job: LiveJob; defaultOpen?: boolean; onChanged: () => void }) {
  const { locale } = useI18n()
  const cp = studioCopy(locale)
  const c = cp.live
  const [open, setOpen] = useState(defaultOpen)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [, tick] = useState(0)
  const active = ACTIVE.includes(job.status) || job.status === 'queued'
  const { data, refresh } = usePoll(() => studioApi.job(job.id), active ? 2000 : 6000, open || active)
  const detail = data?.job
  const cur = detail ?? job
  const labels: Record<string, { t: string; d: string }> = job.kind === 'motion' ? cp.steps : cp.siteSteps
  const ids: readonly string[] = job.kind === 'motion' ? MOTION_STEPS : SITE_STEPS
  const openQ = detail?.questions.find((q) => !q.answer)
  const statusLabel = cur.status === 'starting' ? cp.status.running : cur.status === 'cancelled' ? (locale === 'en' ? 'Cancelled' : 'Annulé') : cur.status === 'draft' ? cp.status.draft : cp.status[cur.status]

  // chrono
  useEffect(() => { if (!active) return; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id) }, [active])
  const start = cur.startedAt ?? cur.createdAt
  const elapsed = fmt((cur.finishedAt && !active ? new Date(cur.finishedAt).getTime() : Date.now()) - new Date(start).getTime())

  // étapes : celles avant l'étape courante sont faites
  const steps: Step[] = useMemo(() => {
    const at = cur.step ? ids.indexOf(cur.step) : -1
    return ids.map((id, i) => ({ id, state: cur.status === 'done' ? 'done' : at === -1 ? 'todo' : i < at ? 'done' : i === at ? (cur.status === 'paused' ? 'blocked' : 'active') : 'todo' }))
  }, [cur.step, cur.status, ids])

  // notifications : toast + notification système pour chaque événement important
  const lastSeen = useRef<number | null>(null)
  useEffect(() => {
    const ev = detail?.events; if (!ev?.length) return
    const top = ev[ev.length - 1].id
    if (lastSeen.current === null) { lastSeen.current = top; return }
    for (const e of ev.filter((x) => x.id > (lastSeen.current ?? 0))) {
      if (e.level === 'question' || e.level === 'success' || e.level === 'error') {
        ;(e.level === 'success' ? toast.success : e.level === 'error' ? toast.error : toast)(e.title, { description: e.body ?? job.title })
        showSystemNotification(e.title, e.body ?? job.title)
      }
    }
    lastSeen.current = top
  }, [detail?.events, job.title])

  const run = async (name: string, f: () => Promise<unknown>) => { setBusy(name); try { await f(); await refresh(); onChanged() } catch { toast.error('Erreur') } finally { setBusy(null) } }
  const answer = (qid: string, a: string) => { if (a.trim()) void run('answer', async () => { await studioApi.answer(job.id, qid, a.trim()); setReply(''); toast.success(cp.site.replied) }) }

  const finalVideo = detail?.assets.find((a) => a.direction === 'out' && a.mime?.startsWith('video/') && a.url) ?? detail?.assets.find((a) => a.direction === 'out' && a.name.endsWith('.mp4') && a.url)
  const report = detail?.assets.find((a) => a.direction === 'out' && a.name === 'rapport.md' && a.url)
  const deviceOffline = cur.device && !cur.device.online && active
  const claudeOff = cur.device?.claudeOk === false

  return (
    <article className="rounded-xl border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">{job.kind === 'motion' ? <Film className="size-4" /> : <Globe className="size-4" />}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-text">{job.title}</h3>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-text-3">
            <span>{new Date(job.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            {cur.status !== 'draft' && cur.status !== 'queued' && <span>{c.elapsed} {elapsed}</span>}
            {cur.device && <span className="inline-flex items-center gap-1">{cur.device.online ? <Laptop className="size-3 text-success" /> : <WifiOff className="size-3" />}{cur.device.name}</span>}
          </p>
        </div>
        <Badge color={COLORS[cur.status]}>{statusLabel}</Badge>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={job.title} className="rounded-md p-1.5 text-text-3 hover:bg-surface-2 hover:text-text"><ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} /></button>
      </header>

      <div className="px-4 pb-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={cur.progress} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn('h-full rounded-full transition-[width] duration-700', cur.status === 'paused' ? 'bg-[#a16207]' : cur.status === 'failed' ? 'bg-danger' : 'bg-accent')} style={{ width: `${cur.progress}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs text-text-3"><span className="truncate">{cur.step ? `${c.stepProgress} : ${labels[cur.step]?.t ?? cur.step}` : ' '}</span><span>{cur.progress}%</span></div>
      </div>

      {cur.status === 'queued' && !cur.device && <p className="mx-4 mb-4 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px] text-text-2"><WifiOff className="size-4 text-text-3" />{c.noDevice}</p>}
      {deviceOffline && <p className="mx-4 mb-4 flex items-center gap-2 rounded-lg bg-[#a16207]/10 px-3 py-2 text-[13px] text-text"><WifiOff className="size-4 text-[#a16207]" />{c.deviceOffline}</p>}
      {claudeOff && <p className="mx-4 mb-4 flex items-center gap-2 rounded-lg bg-[#c2410c]/10 px-3 py-2 text-[13px] text-text"><AlertTriangle className="size-4 text-[#c2410c]" />{c.claudeOff}</p>}
      {cur.status === 'failed' && cur.error && <p className="mx-4 mb-4 flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-text"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" /><span className="break-words">{cur.error}</span></p>}

      {openQ && (
        <div className="mx-4 mb-4 rounded-lg border border-[#c2410c]/30 bg-[#c2410c]/5 p-3 animate-fade-in">
          <div className="flex items-start gap-2.5">
            <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-[#c2410c]" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[13px] font-medium text-text">{cp.site.questionTitle}</p>
              <p className="text-[13px] text-text-2">{openQ.text}</p>
              <p className="text-xs text-text-3">{cp.site.questionHint}</p>
              {openQ.choices && <div className="flex flex-wrap gap-1.5">{openQ.choices.map((x) => <Button key={x} size="xs" variant="outline" onClick={() => answer(openQ.id, x)}>{x}</Button>)}</div>}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); answer(openQ.id, reply) }}>
                <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={cp.site.answerPlaceholder} aria-label={cp.site.reply} />
                <Button type="submit" variant="primary" disabled={!reply.trim()} loading={busy === 'answer'}>{cp.site.reply}</Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {cur.status === 'done' && cur.kind === 'site' && cur.deliver?.url && (
        <div className="mx-4 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
          <CheckCircle2 className="size-4 text-success" />
          <div className="min-w-0 flex-1"><p className="text-xs text-text-3">{cp.site.liveLink}</p><p className="truncate text-[13px] font-medium text-text">{cur.deliver.url}</p></div>
          <a href={cur.deliver.url} target="_blank" rel="noreferrer"><Button size="sm" variant="primary"><ExternalLink className="size-3.5" />{c.openSite}</Button></a>
        </div>
      )}
      {cur.status === 'done' && cur.kind === 'motion' && (
        <div className="mx-4 mb-4 space-y-2 rounded-lg border border-success/30 bg-success/5 p-3">
          {finalVideo?.url && <video src={finalVideo.url} controls playsInline className="max-h-[420px] w-full rounded-lg bg-black" />}
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="size-4 text-success" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">{finalVideo?.name ?? cp.library.kindRender} {finalVideo?.size ? <span className="font-normal text-text-3">· {formatBytes(finalVideo.size)}</span> : null}</span>
            {finalVideo?.url && <a href={finalVideo.url} download={finalVideo.name}><Button size="sm" variant="primary"><Download className="size-3.5" />{c.download}</Button></a>}
            {report?.url && <a href={report.url} target="_blank" rel="noreferrer"><Button size="sm" variant="glass">{c.report}</Button></a>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        {ACTIVE.includes(cur.status) && cur.status !== 'paused' && <Button size="sm" variant="secondary" loading={busy === 'pause'} onClick={() => run('pause', () => studioApi.control(job.id, 'pause'))}><Pause className="size-3.5" />{c.pause}</Button>}
        {cur.status === 'paused' && <Button size="sm" variant="primary" loading={busy === 'resume'} onClick={() => run('resume', () => studioApi.control(job.id, 'resume'))}><Play className="size-3.5" />{c.resume}</Button>}
        {(['failed', 'cancelled'] as LiveStatus[]).includes(cur.status) && <Button size="sm" variant="primary" loading={busy === 'retry'} onClick={() => run('retry', () => studioApi.control(job.id, 'retry'))}><RotateCcw className="size-3.5" />{c.retry}</Button>}
        {(active || cur.status === 'draft') && cur.status !== 'draft' && <Button size="sm" variant="outline" onClick={() => { if (confirm(c.confirmCancel)) void run('cancel', () => studioApi.control(job.id, 'cancel')) }}><Square className="size-3.5" />{c.cancel}</Button>}
        <span className="flex-1" />
        <Button size="icon" variant="ghost" aria-label={c.remove} onClick={() => { if (confirm(c.confirmRemove)) void run('remove', () => studioApi.remove(job.id)) }}><Trash2 className="size-3.5" /></Button>
      </div>

      {open && (
        <div className="space-y-5 border-t border-border p-4">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-4">
              <Pipeline steps={steps} labels={labels} />
              {detail && detail.assets.length > 0 && (
                <div>
                  <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-3">{c.files}</h4>
                  <ul className="space-y-1">
                    {detail.assets.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-xs text-text-2"><Badge>{a.direction === 'in' ? c.sentFiles : c.deliveredFiles}</Badge>
                        {a.url || a.link ? <a href={a.url ?? a.link ?? '#'} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate underline-offset-2 hover:underline">{a.name}</a> : <span className="min-w-0 flex-1 truncate">{a.name}</span>}
                        {a.size ? <span className="text-text-3">{formatBytes(a.size)}</span> : null}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-3">{c.activity}</h4>
              <ActivityFeed events={detail?.events ?? []} labels={labels} />
            </div>
          </div>
          {cur.status !== 'draft' && cur.status !== 'cancelled' && <MessageComposer jobId={job.id} status={cur.status} onSent={() => void refresh()} />}
        </div>
      )}
    </article>
  )
}
