'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AlertTriangle, ExternalLink, Film, Globe, Laptop, Loader2, LogIn, Pause, Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { studioApi, usePoll, useStudioMode, type LiveStatus } from '@/lib/studio/api'
import { ActivityFeed } from '@/components/studio/activity-feed'
import { LivePreview } from '@/components/studio/live-preview'
import { MessageComposer } from '@/components/studio/message-composer'
import { QuestionBox } from '@/components/studio/question-box'
import { TodoList } from '@/components/studio/todo-list'
import { cn } from '@/lib/utils'

const ACTIVE: LiveStatus[] = ['starting', 'running', 'paused', 'needs_answer', 'queued']
const COLORS: Partial<Record<LiveStatus, string>> = { queued: '#0369a1', starting: '#4d59c7', running: '#4d59c7', paused: '#a16207', needs_answer: '#c2410c', done: '#15803d', failed: '#c4262f' }

/** Flow Studio : tout le travail du Mac en une page (discussion avec Claude, tâches cochées en direct, page du site et logiciel de montage). Ouverte automatiquement à côté du travail. */
export function LiveClient() {
  const { locale } = useI18n()
  const cp = studioCopy(locale)
  const c = cp.live
  const q = useSearchParams()
  const { mode } = useStudioMode()
  const jobs = usePoll(studioApi.jobs, 4000, mode === 'live')
  const [picked, setPicked] = useState<string | null>(q.get('job'))
  const list = useMemo(() => jobs.data?.jobs ?? [], [jobs.data])
  const current = list.find((j) => j.id === picked) ?? list.find((j) => ACTIVE.includes(j.status)) ?? list[0]
  const active = !!current && ACTIVE.includes(current.status)
  const { data, refresh } = usePoll(() => studioApi.job(current!.id), active ? 2000 : 6000, !!current)
  const detail = data?.job && data.job.id === current?.id ? data.job : null
  const cur = detail ?? current
  const [, tick] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id) }, [])
  useEffect(() => { document.title = cur ? `${cur.progress}% · ${cur.title} — Flow Studio` : 'Flow Studio' }, [cur])

  if (mode === 'loading') return <main className="flex min-h-dvh items-center justify-center"><Loader2 className="size-6 animate-spin text-accent-ink" /></main>
  if (mode === 'anon') return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-6 text-center">
      <LogIn className="mx-auto size-8 text-accent-ink" />
      <h1 className="text-xl font-semibold">Flow Studio</h1>
      <Link href={`/login?next=${encodeURIComponent('/studio/live')}`} className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-medium text-accent-text">{cp.connect.title}</Link>
    </main>
  )

  const run = async (name: string, f: () => Promise<unknown>) => { setBusy(name); try { await f(); await refresh(); await jobs.refresh() } catch { toast.error('Erreur') } finally { setBusy(null) } }
  const labels: Record<string, { t: string; d: string }> = cur?.kind === 'motion' ? cp.steps : cp.siteSteps
  const openQ = detail?.questions.find((x) => !x.answer)
  const statusLabel = cur ? (cur.status === 'starting' ? cp.status.running : cur.status === 'cancelled' ? (locale === 'en' ? 'Cancelled' : 'Annulé') : cp.status[cur.status]) : ''
  const Icon = cur?.kind === 'site' ? Globe : Film

  return (
    <div className="flex h-dvh flex-col bg-bg text-text">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink"><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          {list.length > 1 ? (
            <select value={cur?.id ?? ''} onChange={(e) => setPicked(e.target.value)} aria-label={c.pickJob} className="max-w-full truncate rounded-md border border-border bg-surface px-2 py-1 text-sm font-semibold">
              {list.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          ) : <h1 className="truncate text-sm font-semibold">{cur?.title ?? 'Flow Studio'}</h1>}
          {cur && <div className="mt-1 flex items-center gap-2"><div className="h-1.5 w-40 max-w-[40vw] overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={cp.common.statusLabel} aria-valuenow={cur.progress} aria-valuemin={0} aria-valuemax={100}><div className={cn('h-full rounded-full bg-accent transition-[width] duration-700', cur.status === 'failed' && 'bg-danger', cur.status === 'paused' && 'bg-[#a16207]')} style={{ width: `${cur.progress}%` }} /></div><span className="text-xs tabular-nums text-text-3">{cur.progress}%</span>{cur.step && <span className="hidden truncate text-xs text-text-3 sm:inline">{labels[cur.step]?.t ?? cur.step}</span>}</div>}
        </div>
        {cur && <Badge color={COLORS[cur.status]}>{statusLabel}</Badge>}
        {cur && ['starting', 'running', 'needs_answer'].includes(cur.status) && <Button size="sm" variant="secondary" loading={busy === 'pause'} onClick={() => run('pause', () => studioApi.control(cur.id, 'pause'))}><Pause className="size-3.5" />{c.pause}</Button>}
        {cur?.status === 'paused' && <Button size="sm" variant="primary" loading={busy === 'resume'} onClick={() => run('resume', () => studioApi.control(cur.id, 'resume'))}><Play className="size-3.5" />{c.resume}</Button>}
        {cur && ACTIVE.includes(cur.status) && cur.status !== 'queued' && <Button size="sm" variant="outline" onClick={() => { if (confirm(c.confirmCancel)) void run('cancel', () => studioApi.control(cur.id, 'cancel')) }}><Square className="size-3.5" />{c.cancel}</Button>}
        {cur?.status === 'done' && cur.deliver?.url && <a href={cur.deliver.url} target="_blank" rel="noreferrer"><Button size="sm" variant="primary"><ExternalLink className="size-3.5" />{c.openSite}</Button></a>}
      </header>

      {!cur ? (
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success"><Laptop className="size-6" /></span>
          <p className="text-base font-semibold">{c.noJob}</p>
          <p className="text-sm text-text-3">{locale === 'en' ? 'Your Mac is connected. Start a project from Flow.' : 'Ton Mac est relié. Lance un projet depuis Flow.'}</p>
          <div className="flex gap-2"><Link href="/app" className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-text">Flow</Link></div>
        </main>
      ) : (
        <main className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(320px,36%)_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col rounded-xl border border-border bg-surface" aria-label={c.chat}>
            <h2 className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-text-3">{c.chat}</h2>
            <div className="min-h-0 flex-1 overflow-hidden px-4 py-3"><ActivityFeed events={detail?.events ?? []} labels={labels} className="h-full max-h-none" /></div>
            {cur.status === 'failed' && cur.error && <p className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-danger/10 px-3 py-2 text-[13px]"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" /><span className="break-words">{cur.error}</span></p>}
            {openQ && <div className="mx-4 mb-3"><QuestionBox jobId={cur.id} q={openQ} onAnswered={() => void refresh()} /></div>}
            {cur.status !== 'draft' && cur.status !== 'cancelled' && <div className="border-t border-border p-3"><MessageComposer jobId={cur.id} status={cur.status} onSent={() => void refresh()} /></div>}
          </section>
          <div className="grid min-h-0 gap-3 lg:grid-rows-[minmax(160px,38%)_minmax(0,1fr)]">
            <section className="min-h-0 overflow-hidden rounded-xl border border-border bg-surface" aria-label={c.todo}>
              <h2 className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-text-3">{c.todo}</h2>
              <div className="h-[calc(100%-2.25rem)] overflow-y-auto p-3"><TodoList items={detail?.todo ?? []} /></div>
            </section>
            <section className="min-h-0 overflow-y-auto rounded-xl border border-border bg-surface p-3" aria-label={c.previewTitle}>
              <LivePreview jobId={cur.id} active={active} />
            </section>
          </div>
        </main>
      )}
    </div>
  )
}
