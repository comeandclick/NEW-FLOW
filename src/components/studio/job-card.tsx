'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCircle2, ChevronDown, ExternalLink, Film, Globe, MessageCircleQuestion, Play, Square, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n/provider'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { studioCopy } from '@/lib/studio/copy'
import { useStudio } from '@/lib/studio/store'
import { formatBytes, cn } from '@/lib/utils'
import type { Job, JobStatus } from '@/lib/studio/types'
import { Pipeline } from './pipeline'

const COLORS: Record<JobStatus, string | undefined> = {
  draft: undefined, waiting_device: '#a16207', queued: '#0369a1', running: '#4d59c7', needs_answer: '#c2410c', done: '#15803d', failed: '#c4262f',
}

const SPEED_MS = 1500

/** Carte d'une demande (motion ou site) : état, étapes, notifications, questions de Claude, résultat. */
export function JobCard({ job, defaultOpen = false }: { job: Job; defaultOpen?: boolean }) {
  const { locale } = useI18n()
  const c = studioCopy(locale)
  const { ws, notifyUser } = useWorkspace()
  const { userId } = useSession()
  const simulating = useStudio((s) => s.simulating)
  const tick = useStudio((s) => s.tick)
  const setSim = useStudio((s) => s.setSimulating)
  const answer = useStudio((s) => s.answer)
  const removeJob = useStudio((s) => s.removeJob)
  const [open, setOpen] = useState(defaultOpen)
  const [reply, setReply] = useState('')
  const labels: Record<string, { t: string; d: string }> = job.kind === 'motion' ? c.steps : c.siteSteps
  const done = job.steps.filter((s) => s.state === 'done').length
  const pct = Math.round((done / job.steps.length) * 100)
  const isSim = simulating === job.id
  const seen = useRef<string | null>(job.notices[0]?.id ?? null)
  const openQ = job.questions.find((q) => !q.answer)

  // La simulation fait avancer une étape à intervalle régulier ; elle se met en pause tant qu'une question attend une réponse.
  useEffect(() => {
    if (!isSim) return
    const id = setInterval(() => {
      const cur = useStudio.getState().jobs.find((j) => j.id === job.id)
      if (!cur) return
      if (cur.questions.some((q) => !q.answer)) return
      if (!useStudio.getState().tick(job.id)) { setSim(null) }
    }, SPEED_MS)
    return () => clearInterval(id)
  }, [isSim, job.id, setSim, tick])

  // Notification (toast + notification Flow) pour chaque nouvel événement important.
  useEffect(() => {
    const n = job.notices[0]
    if (!n || n.id === seen.current) return
    seen.current = n.id
    if (n.level === 'info') return
    ;(n.level === 'success' ? toast.success : toast)(n.title, { description: n.body })
    if (userId) void notifyUser(userId, { type: 'studio', title: n.title, body: n.body, url: `/app/${ws.slug}/${job.kind === 'motion' ? 'motion' : 'site?tab=projects'}` }).catch(() => {})
  }, [job.notices, userId, notifyUser, ws.slug, job.kind])

  const start = () => { setOpen(true); if (job.status === 'waiting_device' || job.status === 'queued') useStudio.getState().tick(job.id); setSim(job.id) }
  const send = (a: string) => { if (!openQ || !a.trim()) return; answer(job.id, openQ.id, a.trim()); setReply(''); toast.success(c.site.replied) }

  return (
    <article className="rounded-xl border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
          {job.kind === 'motion' ? <Film className="size-4" /> : <Globe className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-text">{job.title || (job.kind === 'motion' ? c.motion.title : c.site.title)}</h3>
          <p className="truncate text-xs text-text-3">{new Date(job.createdAt).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })} · {job.refs.length} {c.motion.sumRefs.toLowerCase()}</p>
        </div>
        <Badge color={COLORS[job.status]}>{c.status[job.status]}</Badge>
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? c.motion.hidePrompt : c.motion.showPrompt}
          className="rounded-md p-1.5 text-text-3 hover:bg-surface-2 hover:text-text"><ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} /></button>
      </header>

      <div className="px-4 pb-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={c.common.statusLabel}>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs text-text-3"><span>{done}/{job.steps.length}</span><span>{pct}%</span></div>
      </div>

      {openQ && (
        <div className="mx-4 mb-4 rounded-lg border border-[#c2410c]/30 bg-[#c2410c]/5 p-3 animate-fade-in">
          <div className="flex items-start gap-2.5">
            <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-[#c2410c]" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-[13px] font-medium text-text">{c.site.questionTitle}</p>
              <p className="text-[13px] text-text-2">{openQ.text}</p>
              <p className="text-xs text-text-3">{c.site.questionHint}</p>
              {openQ.choices && (
                <div className="flex flex-wrap gap-1.5">{openQ.choices.map((x) => <Button key={x} size="xs" variant="outline" onClick={() => send(x)}>{x}</Button>)}</div>
              )}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(reply) }}>
                <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={c.site.answerPlaceholder} aria-label={c.site.reply} />
                <Button type="submit" variant="primary" disabled={!reply.trim()}>{c.site.reply}</Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {job.status === 'done' && job.kind === 'site' && job.liveUrl && (
        <div className="mx-4 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
          <CheckCircle2 className="size-4 text-success" />
          <div className="min-w-0 flex-1"><p className="text-xs text-text-3">{c.site.liveLink}</p><p className="truncate text-[13px] font-medium text-text">{job.liveUrl}</p></div>
          <a href={job.liveUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="glass"><ExternalLink className="size-3.5" />{c.common.open}</Button></a>
        </div>
      )}
      {job.status === 'done' && job.kind === 'motion' && job.result && (
        <div className="mx-4 mb-4 flex items-center gap-3 rounded-lg border border-success/30 bg-success/5 p-3">
          <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-surface-3 text-text-3"><Play className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-text">{job.result.name}</p><p className="text-xs text-text-3">{job.result.w} × {job.result.h} · {formatBytes(job.result.size)}</p></div>
          <Badge>{c.common.preview}</Badge>
        </div>
      )}

      {open && (
        <div className="grid gap-5 border-t border-border p-4 md:grid-cols-2">
          <div><Pipeline steps={job.steps} labels={labels} /></div>
          <div className="space-y-2">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-3"><Bell className="size-3.5" />{c.site.notifs}</h4>
            {job.notices.length === 0 ? <p className="text-[13px] text-text-3">{c.site.notifsEmpty}</p> : (
              <ul className="space-y-2">
                {job.notices.slice(0, 6).map((n) => (
                  <li key={n.id} className="rounded-lg bg-surface-2 px-3 py-2">
                    <p className="text-[13px] font-medium text-text">{n.title.startsWith('step:') ? `${labels[n.title.slice(5)]?.t ?? n.title.slice(5)} — ${c.common.done}` : n.title}</p>
                    {n.body && <p className="text-xs text-text-3">{n.body}</p>}
                    <p className="mt-0.5 text-[11px] text-text-3">{new Date(n.at).toLocaleTimeString(locale, { timeStyle: 'short' })}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        {job.status !== 'done' && (isSim
          ? <Button size="sm" variant="outline" onClick={() => setSim(null)}><Square className="size-3.5" />{c.site.stopSim}</Button>
          : <Button size="sm" variant="secondary" onClick={start}><Play className="size-3.5" />{c.site.simulate}</Button>)}
        {isSim && <span className="text-xs text-text-3">{c.site.simulating}…</span>}
        {job.status === 'waiting_device' && !isSim && <span className="text-xs text-text-3">{c.bridge.offlineHint}</span>}
        <span className="flex-1" />
        <Link href={`/app/${ws.slug}/library`} className="text-xs text-text-3 hover:text-text">{c.library.title}</Link>
        <Button size="icon" variant="ghost" aria-label={c.common.remove} onClick={() => removeJob(job.id)}><Trash2 className="size-3.5" /></Button>
      </footer>
    </article>
  )
}
