'use client'
import Link from 'next/link'
import { useMemo } from 'react'
import { format, formatDistanceToNow, isPast, isToday } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { motion } from 'framer-motion'
import { CalendarDays, CheckSquare, FileText, MessageSquare, Users, Video, Activity as ActivityIcon, ArrowRight, Sparkles } from 'lucide-react'
import { Avatar, Card, EmptyState, Skeleton } from '@/components/ui/misc'
import { PriorityIcon, StatusIcon } from '@/components/common/task-ui'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { useUnread } from '@/lib/hooks/use-unread'
import { useI18n } from '@/i18n/provider'
import type { Activity, CalEvent, Note, Task } from '@/lib/types'
import { cn } from '@/lib/utils'

const fade = (i: number) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] as const } })

export default function HomePage() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { ws, me, members, profileOf, nameOf } = useWorkspace()
  const { userId } = useSession()
  const unread = useUnread(ws.id, userId)
  const tasksQ = useLive<Task>('tasks', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['updated_at', false] })
  const eventsQ = useLive<CalEvent>('events', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['start_at', true] })
  const notesQ = useLive<Note>('notes', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['updated_at', false], limit: 5 })
  const actQ = useLive<Activity>('activity_logs', { eq: { workspace_id: ws.id }, order: ['created_at', false], limit: 8 })

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('home.greeting.morning') : hour < 18 ? t('home.greeting.afternoon') : t('home.greeting.evening')

  const stats = useMemo(() => {
    const all = tasksQ.data
    const weekAgo = Date.now() - 7 * 864e5
    return {
      open: all.filter((x) => !['done', 'cancelled'].includes(x.status)).length,
      progress: all.filter((x) => x.status === 'in_progress').length,
      done: all.filter((x) => x.status === 'done' && x.completed_at && new Date(x.completed_at).getTime() > weekAgo).length,
    }
  }, [tasksQ.data])
  const mine = useMemo(() => tasksQ.data.filter((x) => x.assignee_id === userId && !['done', 'cancelled'].includes(x.status))
    .sort((a, b) => (a.due_date ?? '9').localeCompare(b.due_date ?? '9')).slice(0, 6), [tasksQ.data, userId])
  const upcoming = useMemo(() => eventsQ.data.filter((e) => new Date(e.end_at) >= new Date()).slice(0, 4), [eventsQ.data])
  const loading = tasksQ.loading

  const cards = [
    { label: t('home.stats.open'), value: stats.open, icon: CheckSquare, href: '/tasks', tint: 'var(--accent)' },
    { label: t('home.stats.inProgress'), value: stats.progress, icon: ActivityIcon, href: '/tasks', tint: 'var(--warning)' },
    { label: t('home.stats.done'), value: stats.done, icon: CheckSquare, href: '/tasks', tint: 'var(--success)' },
    { label: t('home.stats.members'), value: members.length, icon: Users, href: '/settings?tab=members', tint: 'var(--info)' },
  ]
  const quick = [
    { href: '/messages', icon: MessageSquare, label: t('nav.messages'), extra: unread.count ? `${unread.count} ${t('home.unread')}` : undefined },
    { href: '/notes', icon: FileText, label: t('nav.notes') },
    { href: '/calendar', icon: CalendarDays, label: t('nav.calendar') },
    { href: '/meetings', icon: Video, label: t('nav.meetings') },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <motion.div {...fade(0)} className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{greeting}, {me?.full_name?.split(' ')[0] ?? ''}</h1>
        <p className="mt-1 text-sm capitalize text-text-3">{format(new Date(), 'EEEE d MMMM yyyy', { locale: dfl })}</p>
      </motion.div>

      <motion.div {...fade(0.5)} className="mb-4">
        <Link href={`/app/${ws.slug}/ai`} className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 transition-all hover:border-accent/50 hover:shadow-md">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink"><Sparkles className="size-4" /></span>
          <span className="min-w-0 flex-1 truncate text-sm text-text-2 group-hover:text-text">{t('home.askAi')}</span><ArrowRight className="size-4 text-text-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </motion.div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div key={c.label} {...fade(i + 1)}>
            <Link href={`/app/${ws.slug}${c.href}`}>
              <Card className="group p-4 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md">
                <div className="flex items-center justify-between text-text-3"><span className="text-xs">{c.label}</span><c.icon className="size-4" style={{ color: c.tint }} /></div>
                <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">{loading ? <Skeleton className="h-8 w-10" /> : c.value}</div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <motion.div {...fade(5)} className="min-w-0 lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{t('home.myTasks')}</h2>
              <Link href={`/app/${ws.slug}/tasks`} className="inline-flex items-center gap-1 text-xs text-text-3 hover:text-text">{t('common.all')}<ArrowRight className="size-3" /></Link></div>
            {loading ? <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9" />)}</div>
              : mine.length === 0 ? <EmptyState icon={<CheckSquare className="size-5" />} title={t('home.noTasks')} className="py-10" />
              : <ul>{mine.map((task) => {
                const overdue = task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date))
                return (
                  <li key={task.id}>
                    <Link href={`/app/${ws.slug}/tasks?open=${task.id}`} className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0 hover:bg-surface-2">
                      <StatusIcon status={task.status} /><span className="min-w-0 flex-1 truncate text-[13px]">{task.title}</span>
                      <PriorityIcon priority={task.priority} />
                      {task.due_date && <span className={cn('shrink-0 text-xs tabular-nums', overdue ? 'text-danger' : 'text-text-3')}>{overdue ? `${t('home.overdue')} · ` : ''}{format(new Date(task.due_date), 'd MMM', { locale: dfl })}</span>}
                    </Link>
                  </li>
                )
              })}</ul>}
          </Card>
        </motion.div>

        <motion.div {...fade(6)} className="min-w-0">
          <Card className="overflow-hidden">
            <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{t('home.upcoming')}</h2></div>
            {upcoming.length === 0 ? <EmptyState icon={<CalendarDays className="size-5" />} title={t('home.noEvents')} className="py-10" /> : (
              <ul className="p-2">{upcoming.map((e) => (
                <li key={e.id}><Link href={`/app/${ws.slug}/calendar`} className="flex gap-3 rounded-lg p-2.5 hover:bg-surface-2">
                  <span className="mt-0.5 w-1 shrink-0 rounded-full" style={{ background: e.color ?? 'var(--accent)' }} />
                  <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{e.title}</span>
                    <span className="block text-xs text-text-3">{e.all_day ? format(new Date(e.start_at), 'EEE d MMM', { locale: dfl }) : format(new Date(e.start_at), "EEE d MMM · HH:mm", { locale: dfl })}</span></span>
                </Link></li>
              ))}</ul>
            )}
          </Card>
        </motion.div>

        <motion.div {...fade(7)} className="min-w-0">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{t('home.recentNotes')}</h2></div>
            <ul className="p-2">{notesQ.data.map((n) => (
              <li key={n.id}><Link href={`/app/${ws.slug}/notes/${n.id}`} className="flex items-center gap-2.5 rounded-lg p-2.5 hover:bg-surface-2">
                <span className="text-base">{n.icon ?? '📄'}</span><span className="min-w-0 flex-1 truncate text-[13px]">{n.title || '—'}</span>
                <span className="shrink-0 text-[11px] text-text-3">{formatDistanceToNow(new Date(n.updated_at), { locale: dfl })}</span>
              </Link></li>
            ))}</ul>
          </Card>
        </motion.div>

        <motion.div {...fade(8)} className="min-w-0 lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{t('home.activity')}</h2>
              <Link href={`/app/${ws.slug}/activity`} className="inline-flex items-center gap-1 text-xs text-text-3 hover:text-text">{t('common.all')}<ArrowRight className="size-3" /></Link></div>
            <ul className="p-2">{actQ.data.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-lg p-2.5">
                <Avatar name={profileOf(a.user_id)?.full_name} size={24} />
                <span className="min-w-0 flex-1 truncate text-[13px]"><span className="font-medium">{nameOf(a.user_id)}</span> <span className="text-text-2">{a.action.replace('.', ' · ')}</span> <span className="text-text">{(a.meta as { title?: string })?.title}</span></span>
                <span className="shrink-0 text-[11px] text-text-3">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: dfl })}</span>
              </li>
            ))}</ul>
          </Card>
        </motion.div>
      </div>

      <motion.div {...fade(9)} className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-text-2">{t('home.quick')}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quick.map((q) => (
            <Link key={q.href} href={`/app/${ws.slug}${q.href}`}>
              <Card className="flex items-center gap-3 p-4 transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md">
                <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"><q.icon className="size-4" /></span>
                <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{q.label}</span>{q.extra && <span className="block truncate text-xs text-accent-ink">{q.extra}</span>}</span>
              </Card>
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
