'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { addMonths, differenceInCalendarDays, eachMonthOfInterval, format, startOfMonth } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, GanttChartSquare, Target } from 'lucide-react'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Button } from '@/components/ui/button'
import { Tabs, EmptyState, PageHeader } from '@/components/ui/misc'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useI18n } from '@/i18n/provider'
import type { Goal, Task } from '@/lib/types'

type Zoom = '3' | '6' | '12'

/** Timeline of projects (first task → last due date) and goal deadlines. Read-only: dates are edited on the tasks and goals themselves. */
export default function RoadmapPage() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { ws, projects } = useWorkspace()
  const tasks = useLive<Task>('tasks', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const goals = useLive<Goal>('goals', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const [zoom, setZoom] = useState<Zoom>('6')
  const [offset, setOffset] = useState(0)

  const from = useMemo(() => startOfMonth(addMonths(new Date(), -1 + offset)), [offset])
  const to = useMemo(() => addMonths(from, Number(zoom)), [from, zoom])
  const span = differenceInCalendarDays(to, from)
  const pct = (d: Date) => ((differenceInCalendarDays(d, from)) / span) * 100
  const months = eachMonthOfInterval({ start: from, end: addMonths(to, -1) })
  const todayPct = pct(new Date())

  const rows = useMemo(() => projects.filter((p) => p.status !== 'archived').map((p) => {
    const list = tasks.data.filter((x) => x.project_id === p.id && !x.parent_id && x.status !== 'cancelled')
    if (!list.length) return null
    const dues = list.filter((x) => x.due_date).map((x) => new Date(x.due_date!))
    const start = new Date(Math.min(...list.map((x) => +new Date(x.created_at))))
    const end = dues.length ? new Date(Math.max(...dues.map(Number))) : new Date(+start + 7 * 864e5)
    const done = list.filter((x) => x.status === 'done').length
    return { p, start, end: end < start ? new Date(+start + 864e5) : end, done, total: list.length }
  }).filter(Boolean) as { p: (typeof projects)[number]; start: Date; end: Date; done: number; total: number }[], [projects, tasks.data])

  const goalRows = goals.data.filter((g) => g.due_date)
  const empty = !rows.length && !goalRows.length

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
      <HubTabs hub="tasks" />
      <PageHeader title={t('road.title')} subtitle={t('road.sub')} icon={<GanttChartSquare className="size-[18px]" />} actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" onClick={() => setOffset((o) => o - 1)} aria-label={t('cal.prev')}><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setOffset(0)}>{t('cal.today')}</Button>
            <Button variant="ghost" size="icon" onClick={() => setOffset((o) => o + 1)} aria-label={t('cal.next')}><ChevronRight className="size-4" /></Button>
          </div>
          <Tabs value={zoom} onChange={setZoom} items={[{ value: '3', label: t('road.m3') }, { value: '6', label: t('road.m6') }, { value: '12', label: t('road.m12') }]} />
        </div>} />

      {empty ? <EmptyState icon={<GanttChartSquare className="size-5" />} title={t('road.empty')} hint={t('road.emptyHint')} /> : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[180px_1fr] border-b border-border bg-surface-2/60 text-[11px] text-text-3">
              <div className="px-3 py-2 font-medium">{format(from, 'MMM yyyy', { locale: dfl })} → {format(addMonths(to, -1), 'MMM yyyy', { locale: dfl })}</div>
              <div className="relative h-8">
                {months.map((m) => <span key={m.toISOString()} className="absolute top-0 flex h-full items-center border-l border-border/70 pl-1.5 capitalize" style={{ left: `${pct(m)}%` }}>{format(m, 'MMM', { locale: dfl })}</span>)}
              </div>
            </div>

            {rows.map(({ p, start, end, done, total }) => {
              const l = Math.max(0, pct(start)), r = Math.min(100, pct(end)), visible = r > 0 && l < 100
              const progress = total ? (done / total) * 100 : 0
              return (
                <div key={p.id} className="grid grid-cols-[180px_1fr] border-b border-border/60 last:border-0">
                  <Link href={`/app/${ws.slug}/projects/${p.id}`} className="flex items-center gap-2 px-3 py-3 text-[13px] hover:bg-surface-2"><span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} /><span className="truncate font-medium">{p.name}</span></Link>
                  <div className="relative h-12">
                    {months.map((m) => <span key={m.toISOString()} aria-hidden className="absolute inset-y-0 border-l border-border/40" style={{ left: `${pct(m)}%` }} />)}
                    {visible && (
                      <Link href={`/app/${ws.slug}/projects/${p.id}`} title={`${p.name} · ${done}/${total}`} aria-label={`${p.name}: ${done}/${total}`}
                        className="absolute top-3 flex h-6 items-center overflow-hidden rounded-md border text-[11px] font-medium text-text transition-opacity hover:opacity-85"
                        style={{ left: `${l}%`, width: `${Math.max(1.5, r - l)}%`, borderColor: p.color, background: `color-mix(in srgb, ${p.color} 16%, var(--surface))` }}>
                        <span aria-hidden className="absolute inset-y-0 left-0" style={{ width: `${progress}%`, background: `color-mix(in srgb, ${p.color} 38%, transparent)` }} />
                        <span className="relative truncate px-2">{done}/{total}</span>
                      </Link>
                    )}
                    {todayPct >= 0 && todayPct <= 100 && <span aria-hidden className="absolute inset-y-0 w-px bg-danger/70" style={{ left: `${todayPct}%` }} />}
                  </div>
                </div>
              )
            })}

            {goalRows.length > 0 && (
              <>
                <div className="border-b border-border bg-surface-2/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-3">{t('nav.goals')}</div>
                {goalRows.map((g) => {
                  const at = pct(new Date(g.due_date!)), pctDone = g.target ? Math.min(100, Math.round((g.current / g.target) * 100)) : 0
                  return (
                    <div key={g.id} className="grid grid-cols-[180px_1fr] border-b border-border/60 last:border-0">
                      <Link href={`/app/${ws.slug}/goals`} className="flex items-center gap-2 px-3 py-3 text-[13px] hover:bg-surface-2"><Target className="size-3.5 shrink-0 text-text-3" /><span className="truncate">{g.title}</span></Link>
                      <div className="relative h-11">
                        {months.map((m) => <span key={m.toISOString()} aria-hidden className="absolute inset-y-0 border-l border-border/40" style={{ left: `${pct(m)}%` }} />)}
                        {at >= 0 && at <= 100 && (
                          <span className="absolute top-2.5 flex -translate-x-1/2 items-center gap-1.5" style={{ left: `${at}%` }}>
                            <span aria-hidden className="size-3 rotate-45 border-2" style={{ borderColor: g.color ?? 'var(--accent)', background: pctDone >= 100 ? (g.color ?? 'var(--accent)') : 'var(--surface)' }} />
                            <span className="whitespace-nowrap rounded bg-surface px-1 text-[11px] text-text-2">{pctDone}% · {format(new Date(g.due_date!), 'd MMM', { locale: dfl })}</span>
                          </span>
                        )}
                        {todayPct >= 0 && todayPct <= 100 && <span aria-hidden className="absolute inset-y-0 w-px bg-danger/70" style={{ left: `${todayPct}%` }} />}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
