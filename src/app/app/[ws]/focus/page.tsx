'use client'
import { HubTabs } from '@/components/shell/hub-tabs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, startOfDay } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import dynamic from 'next/dynamic'
import { Clock, Pause, Play, RotateCcw, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { PageHeader, Tabs } from '@/components/ui/misc'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { showSystemNotification } from '@/lib/push'
import { useI18n } from '@/i18n/provider'
import { cn, formatDuration } from '@/lib/utils'
import type { Task, TimeEntry } from '@/lib/types'

const BarChartView = dynamic(() => import('@/components/common/bar-chart'), { ssr: false, loading: () => <div className="skeleton size-full" /> })

type Mode = 'focus' | 'short' | 'long'
const MINUTES: Record<Mode, number> = { focus: 25, short: 5, long: 15 }
const KEY = 'flow_pomodoro'

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    ;[0, 0.25, 0.5].forEach((d) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = 660; g.gain.setValueAtTime(0.0001, ctx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.2); o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.25) })
    setTimeout(() => void ctx.close(), 1200)
  } catch {}
}

export default function FocusPage() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { ws } = useWorkspace()
  const { userId } = useSession()
  const entries = useLive<TimeEntry>('time_entries', { eq: { workspace_id: ws.id, user_id: userId ?? undefined }, order: ['started_at', false], limit: 100, enabled: !!userId })
  const tasks = useLive<Task>('tasks', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const [mode, setMode] = useState<Mode>('focus')
  const [left, setLeft] = useState(MINUTES.focus * 60)
  const [running, setRunning] = useState(false)
  const [taskId, setTaskId] = useState('')
  const endAt = useRef<number | null>(null)
  const startedAt = useRef<number | null>(null)
  // Manual stopwatch
  const [tracking, setTracking] = useState<{ start: number; note: string } | null>(null)
  const [note, setNote] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s?.endAt > Date.now()) { setMode(s.mode); endAt.current = s.endAt; startedAt.current = s.startedAt; setTaskId(s.taskId ?? ''); setRunning(true) } } catch {} }, [])

  const finish = useCallback(async (m: Mode) => {
    setRunning(false); endAt.current = null
    try { localStorage.removeItem(KEY) } catch {}
    beep(); showSystemNotification('Flow', m === 'focus' ? t('focus.sessionDone') : t('focus.breakDone'))
    toast.success(m === 'focus' ? t('focus.sessionDone') : t('focus.breakDone'))
    if (m === 'focus' && userId && startedAt.current) {
      await getDb().from('time_entries').insert({ workspace_id: ws.id, user_id: userId, task_id: taskId || null, kind: 'focus', started_at: new Date(startedAt.current).toISOString(), ended_at: new Date().toISOString() })
      entries.refresh()
    }
    const next: Mode = m === 'focus' ? 'short' : 'focus'
    setMode(next); setLeft(MINUTES[next] * 60)
  }, [userId, ws.id, taskId, entries, t])

  useEffect(() => {
    if (!running) return
    const iv = setInterval(() => {
      const rest = Math.round(((endAt.current ?? 0) - Date.now()) / 1000)
      if (rest <= 0) { clearInterval(iv); void finish(mode) } else setLeft(rest)
    }, 250)
    return () => clearInterval(iv)
  }, [running, mode, finish])
  useEffect(() => { document.title = running ? `${formatDuration(left)} · Flow` : 'Flow' ; return () => { document.title = 'Flow' } }, [running, left])
  useEffect(() => { if (!tracking) return; const iv = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(iv) }, [tracking])

  const start = () => {
    const now = Date.now(); startedAt.current = now; endAt.current = now + left * 1000; setRunning(true)
    try { localStorage.setItem(KEY, JSON.stringify({ mode, endAt: endAt.current, startedAt: now, taskId })) } catch {}
  }
  const pause = () => { setRunning(false); endAt.current = null; try { localStorage.removeItem(KEY) } catch {} }
  const reset = (m: Mode = mode) => { pause(); setMode(m); setLeft(MINUTES[m] * 60) }
  async function stopTracking() {
    if (!tracking || !userId) return
    await getDb().from('time_entries').insert({ workspace_id: ws.id, user_id: userId, task_id: taskId || null, note: tracking.note || null, kind: 'work', started_at: new Date(tracking.start).toISOString(), ended_at: new Date().toISOString() })
    setTracking(null); setNote(''); entries.refresh()
  }

  const total = MINUTES[mode] * 60
  const R = 96; const C = 2 * Math.PI * R
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = startOfDay(addDays(new Date(), i - 6))
    const mins = entries.data.filter((e) => e.ended_at && startOfDay(new Date(e.started_at)).getTime() === d.getTime()).reduce((a, e) => a + (new Date(e.ended_at!).getTime() - new Date(e.started_at).getTime()) / 60000, 0)
    return { name: format(d, 'EEE', { locale: dfl }), min: Math.round(mins) }
  }), [entries.data, dfl])
  const today = days[6].min
  const sessions = entries.data.filter((e) => e.kind === 'focus' && startOfDay(new Date(e.started_at)).getTime() === startOfDay(new Date()).getTime()).length
  void tick

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <HubTabs hub="focus" />
      <PageHeader title={t('focus.title')} icon={<Clock className="size-[18px]" />} />
      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-6 text-center">
          <Tabs className="mb-6" value={mode} onChange={(m) => reset(m)} items={[{ value: 'focus', label: t('focus.focusMin') }, { value: 'short', label: t('focus.shortBreak') }, { value: 'long', label: t('focus.longBreak') }]} />
          <div className="relative mx-auto size-60">
            <svg viewBox="0 0 220 220" className="size-full -rotate-90"><circle cx="110" cy="110" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
              <circle cx="110" cy="110" r={R} fill="none" stroke={mode === 'focus' ? 'var(--accent)' : 'var(--success)'} strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - left / total)} style={{ transition: 'stroke-dashoffset 0.4s linear' }} /></svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-mono text-5xl font-semibold tabular-nums tracking-tight">{formatDuration(left)}</span><span className="mt-1 text-xs text-text-3">{t('focus.cycles', { n: sessions })}</span></div>
          </div>
          <div className="mt-6 flex justify-center gap-2">
            {running ? <Button size="lg" onClick={pause}><Pause className="size-4" />{t('focus.pause')}</Button> : <Button size="lg" variant="primary" onClick={start}><Play className="size-4" />{t('focus.start')}</Button>}
            <Button size="lg" variant="ghost" onClick={() => reset()} aria-label={t('focus.reset')}><RotateCcw className="size-4" /></Button>
          </div>
          <Select className="mx-auto mt-5 max-w-xs" value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label={t('focus.linkTask')}><option value="">{t('focus.linkTask')}</option>{tasks.data.filter((x) => x.status !== 'done').map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select>
        </section>
        <div className="space-y-5">
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold">{t('focus.manual')}</h2>
            {tracking ? <div className="flex items-center gap-3"><span className="size-2 animate-pulse rounded-full bg-danger-bg" /><span className="flex-1 truncate text-sm">{tracking.note || '—'}</span><span className="font-mono text-lg tabular-nums">{formatDuration((Date.now() - tracking.start) / 1000)}</span>
              <Button variant="danger" size="icon" onClick={stopTracking} aria-label={t('focus.trackStop')}><Square className="size-4" /></Button></div>
              : <div className="flex gap-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('focus.note')} onKeyDown={(e) => e.key === 'Enter' && setTracking({ start: Date.now(), note })} /><Button variant="primary" onClick={() => setTracking({ start: Date.now(), note })} aria-label={t('focus.trackStart')}><Play className="size-4" /><span className="hidden sm:inline">{t('focus.trackStart')}</span></Button></div>}
          </section>
          <section className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-2 flex items-baseline justify-between"><h2 className="text-sm font-semibold">{t('focus.week')}</h2><span className="text-xs text-text-3">{t('focus.today')}: {today} min</span></div>
            <div className="h-36"><BarChartView data={days} series={[{ key: 'min', color: 'var(--accent)' }]} unit="min" /></div>
          </section>
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-semibold">{t('focus.entries')}</h2>
            {entries.data.length === 0 ? <p className="text-sm text-text-3">{t('focus.noEntries')}</p> : <ul className="space-y-2">{entries.data.slice(0, 5).map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-[13px]"><span className={cn('size-2 rounded-full', e.kind === 'focus' ? 'bg-accent' : 'bg-success')} /><span className="min-w-0 flex-1 truncate">{e.note ?? tasks.data.find((x) => x.id === e.task_id)?.title ?? t(e.kind === 'focus' ? 'focus.focusMin' : 'focus.manual')}</span>
                <span className="tabular-nums text-text-3">{e.ended_at ? Math.round((new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 60000) : 0} min</span></li>))}</ul>}
          </section>
        </div>
      </div>
    </div>
  )
}
