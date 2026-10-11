'use client'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { endOfWeek, isBefore, startOfDay, subDays } from 'date-fns'
import { ChevronDown, Users } from 'lucide-react'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Avatar, Badge, EmptyState, PageHeader } from '@/components/ui/misc'
import { PriorityIcon, StatusIcon } from '@/components/common/task-ui'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { Priority, Task } from '@/lib/types'

const CAPACITY_MIN = 30 * 60 // 30 productive hours per week

const fmtH = (min: number) => (min >= 60 ? `${Math.round((min / 60) * 10) / 10} h` : `${min} min`)

/** Who has what: open, overdue and planned work per person, plus time actually tracked this week. */
export default function TeamPage() {
  const { t } = useI18n()
  const { ws, members } = useWorkspace()
  const tasks = useLive<Task>('tasks', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })
  const entries = useLive<{ id: string; user_id: string; kind: string; started_at: string; ended_at: string | null }>('time_entries', { eq: { workspace_id: ws.id }, order: ['started_at', false], limit: 500 })
  const [openId, setOpenId] = useState<string | null>(null)

  const stats = useMemo(() => {
    const today = startOfDay(new Date()), weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 }), weekAgo = subDays(new Date(), 7)
    return members.map((m) => {
      const mine = tasks.data.filter((x) => x.assignee_id === m.user_id && !x.parent_id)
      const open = mine.filter((x) => !['done', 'cancelled'].includes(x.status))
      const overdue = open.filter((x) => x.due_date && isBefore(new Date(x.due_date), today))
      const thisWeek = open.filter((x) => x.due_date && new Date(x.due_date) <= weekEnd)
      const planned = thisWeek.reduce((a, x) => a + (x.estimate_minutes ?? 0), 0)
      const done7 = mine.filter((x) => x.status === 'done' && x.completed_at && new Date(x.completed_at) > weekAgo).length
      const tracked = entries.data.filter((e) => e.user_id === m.user_id && e.kind !== 'break' && e.ended_at && new Date(e.started_at) > weekAgo)
        .reduce((a, e) => a + (+new Date(e.ended_at!) - +new Date(e.started_at)) / 60000, 0)
      return { m, open, overdue, thisWeek, planned, done7, tracked: Math.round(tracked) }
    }).sort((a, b) => b.open.length - a.open.length)
  }, [members, tasks.data, entries.data])

  const unassigned = tasks.data.filter((x) => !x.assignee_id && !x.parent_id && !['done', 'cancelled'].includes(x.status)).length

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <HubTabs hub="tasks" />
      <PageHeader title={t('team.title')} subtitle={t('team.sub')} icon={<Users className="size-[18px]" />} actions={unassigned > 0 && <Link href={`/app/${ws.slug}/inbox`}><Badge color="var(--warning)">{t('team.unassigned', { n: unassigned })}</Badge></Link>} />
      {members.length === 0 ? <EmptyState icon={<Users className="size-5" />} title={t('team.empty')} /> : (
        <ul className="space-y-3">
          {stats.map(({ m, open, overdue, thisWeek, planned, done7, tracked }) => {
            const load = Math.min(100, Math.round((planned / CAPACITY_MIN) * 100)), over = planned > CAPACITY_MIN
            const isOpen = openId === m.user_id
            const bot = (m.profile?.preferences as { bot?: boolean } | undefined)?.bot
            return (
              <li key={m.id} className="rounded-xl border border-border bg-surface">
                <button onClick={() => setOpenId(isOpen ? null : m.user_id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                  <Avatar name={m.profile?.full_name} src={m.profile?.avatar_url} size={36} status={m.profile?.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{m.profile?.full_name ?? m.profile?.email}</span><Badge>{bot ? 'API' : t(`role.${m.role}`)}</Badge></div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-text-3">
                      <span>{t('team.open', { n: open.length })}</span>
                      <span className={overdue.length ? 'font-medium text-danger' : ''}>{t('team.overdue', { n: overdue.length })}</span>
                      <span>{t('team.done7', { n: done7 })}</span>
                      {tracked > 0 && <span>{t('team.tracked', { h: fmtH(tracked) })}</span>}
                    </div>
                  </div>
                  <ChevronDown className={cn('size-4 shrink-0 text-text-3 transition-transform', isOpen && 'rotate-180')} />
                </button>
                <div className="px-4 pb-3.5">
                  <div className="flex items-center justify-between text-[11px] text-text-3"><span>{t('team.load')}</span><span className={over ? 'font-medium text-danger' : ''}>{fmtH(planned)} / {fmtH(CAPACITY_MIN)} · {t('proj.tasks', { n: thisWeek.length })}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={t('team.load')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={load}>
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${load}%`, background: over ? 'var(--danger)' : load > 75 ? 'var(--warning)' : 'var(--accent)' }} />
                  </div>
                </div>
                {isOpen && (
                  <ul className="border-t border-border">
                    {open.length === 0 && <li className="px-4 py-3 text-[13px] text-text-3">{t('team.noTasks')}</li>}
                    {open.slice(0, 12).map((x) => (
                      <li key={x.id} className="flex items-center gap-2.5 border-b border-border/50 px-4 py-2 last:border-0"><StatusIcon status={x.status} /><PriorityIcon priority={x.priority as Priority} />
                        <Link href={`/app/${ws.slug}/tasks?open=${x.id}`} className="min-w-0 flex-1 truncate text-[13px] hover:underline">{x.title}</Link>
                        {x.due_date && <span className={cn('shrink-0 text-xs', isBefore(new Date(x.due_date), startOfDay(new Date())) ? 'text-danger' : 'text-text-3')}>{new Date(x.due_date).toLocaleDateString()}</span>}</li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
