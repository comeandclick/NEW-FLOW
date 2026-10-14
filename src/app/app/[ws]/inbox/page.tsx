'use client'
import Link from 'next/link'
import { useMemo } from 'react'
import { format, isBefore, isSameDay, startOfDay } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { AlarmClock, BellRing, Check, Inbox as InboxIcon, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader } from '@/components/ui/misc'
import { PriorityIcon, StatusIcon } from '@/components/common/task-ui'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import type { Notification, Priority, Task } from '@/lib/types'

const ALERT_TYPES = ['alert', 'api', 'automation']

function Block({ icon, title, count, hint, children }: { icon: React.ReactNode; title: string; count: number; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-center gap-2"><span className="text-text-3">{icon}</span><h2 className="text-sm font-semibold">{title}</h2><Badge>{count}</Badge></div>
      {hint && <p className="mb-3 text-[13px] text-text-3">{hint}</p>}
      {children}
    </section>
  )
}

export default function InboxPage() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { ws, projects, canWrite, log } = useWorkspace()
  const { userId } = useSession()
  const tasks = useLive<Task>('tasks', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false] })
  const notifs = useLive<Notification>('notifications', { eq: { user_id: userId ?? undefined, is_read: false }, order: ['created_at', false], limit: 50, enabled: !!userId, channelFilter: userId ? `user_id=eq.${userId}` : undefined })
  const base = `/app/${ws.slug}`

  const { due, triage } = useMemo(() => {
    const today = startOfDay(new Date())
    const open = tasks.data.filter((x) => !['done', 'cancelled'].includes(x.status) && !x.parent_id)
    return {
      due: open.filter((x) => x.assignee_id === userId && x.due_date && (isBefore(new Date(x.due_date), today) || isSameDay(new Date(x.due_date), today))).sort((a, b) => +new Date(a.due_date!) - +new Date(b.due_date!)),
      triage: open.filter((x) => !x.project_id && !x.assignee_id && ['backlog', 'todo'].includes(x.status)),
    }
  }, [tasks.data, userId])
  const alerts = notifs.data.filter((n) => ALERT_TYPES.includes(n.type))

  async function patch(id: string, p: Partial<Task>) {
    if (!canWrite) return
    const { error } = await getDb().from('tasks').update(p).eq('id', id)
    if (error) { toast.error(t('common.error')); return }
    log('task.updated', 'task', id, {}); tasks.refresh()
  }
  async function markRead(id?: string) {
    let q = getDb().from('notifications').update({ is_read: true })
    q = id ? q.eq('id', id) : q.eq('user_id', userId!).in('type', ALERT_TYPES).eq('is_read', false)
    await q; notifs.refresh()
  }

  const total = due.length + triage.length + alerts.length
  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6">
      <PageHeader title={t('inbox.title')} subtitle={t('inbox.sub')} icon={<InboxIcon className="size-[18px]" />} />
      {total === 0 && !tasks.loading ? <EmptyState icon={<Check className="size-5" />} title={t('inbox.empty')} hint={t('inbox.emptyHint')} /> : (
        <>
          <Block icon={<BellRing className="size-4" />} title={t('inbox.alerts')} count={alerts.length} hint={alerts.length ? t('inbox.alertsHint') : undefined}>
            {alerts.length === 0 ? <p className="text-[13px] text-text-3">{t('inbox.none')}</p> : (
              <>
                <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                  {alerts.map((n) => (
                    <li key={n.id} className="flex items-start gap-3 border-b border-border/60 px-4 py-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{n.title}</div>
                        {n.body && <div className="mt-0.5 line-clamp-2 text-[13px] text-text-2">{n.body}</div>}
                        <div className="mt-1 text-xs text-text-3">{format(new Date(n.created_at), 'PPp', { locale: dfl })}</div>
                      </div>
                      {n.url?.startsWith('/') && <Link href={n.url} onClick={() => void markRead(n.id)} className="shrink-0 text-[13px] font-medium text-accent-ink hover:underline">{t('inbox.open')}</Link>}
                      <Button size="xs" onClick={() => markRead(n.id)} aria-label={`${t('inbox.markRead')}: ${n.title}`}><Check className="size-3.5" /></Button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-end"><Button size="sm" variant="ghost" onClick={() => markRead()}>{t('inbox.markAll')}</Button></div>
              </>
            )}
          </Block>

          <Block icon={<AlarmClock className="size-4" />} title={t('inbox.due')} count={due.length}>
            {due.length === 0 ? <p className="text-[13px] text-text-3">{t('inbox.none')}</p> : (
              <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                {due.map((x) => {
                  const late = isBefore(new Date(x.due_date!), startOfDay(new Date()))
                  return (
                    <li key={x.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-0">
                      <button disabled={!canWrite} onClick={() => patch(x.id, { status: 'done', completed_at: new Date().toISOString() })} aria-label={`${t('inbox.complete')}: ${x.title}`}><StatusIcon status={x.status} /></button>
                      <PriorityIcon priority={x.priority as Priority} />
                      <Link href={`${base}/tasks?open=${x.id}`} className="min-w-0 flex-1 truncate text-[13.5px] hover:underline">{x.title}</Link>
                      <span className={`shrink-0 text-xs ${late ? 'font-medium text-danger' : 'text-text-3'}`}>{late ? t('inbox.late') : t('inbox.today')}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Block>

          <Block icon={<UserRound className="size-4" />} title={t('inbox.triage')} count={triage.length} hint={triage.length ? t('inbox.triageHint') : undefined}>
            {triage.length === 0 ? <p className="text-[13px] text-text-3">{t('inbox.none')}</p> : (
              <ul className="overflow-hidden rounded-xl border border-border bg-surface">
                {triage.map((x) => (
                  <li key={x.id} className="border-b border-border/60 px-4 py-3 last:border-0">
                    <div className="flex items-center gap-2"><StatusIcon status={x.status} /><Link href={`${base}/tasks?open=${x.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:underline">{x.title}</Link></div>
                    {canWrite && (
                      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                        <Select aria-label={t('common.project')} className="h-8 text-[13px] sm:w-44" value="" onChange={(e) => e.target.value && patch(x.id, { project_id: e.target.value })}>
                          <option value="">{t('inbox.chooseProject')}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
                        <Select aria-label={t('common.priority')} className="h-8 text-[13px] sm:w-32" value={x.priority} onChange={(e) => patch(x.id, { priority: e.target.value as Priority })}>
                          {(['urgent', 'high', 'medium', 'low'] as const).map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</Select>
                        <Input aria-label={t('common.dueDate')} type="date" className="h-8 text-[13px] sm:w-40" onChange={(e) => e.target.value && patch(x.id, { due_date: new Date(`${e.target.value}T18:00:00`).toISOString() })} />
                        <Button size="sm" onClick={() => patch(x.id, { assignee_id: userId, status: 'todo' })}>{t('inbox.assignMe')}</Button>
                        <Button size="sm" variant="ghost" onClick={() => patch(x.id, { status: 'cancelled' })}>{t('inbox.dismiss')}</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Block>
        </>
      )}
    </div>
  )
}
