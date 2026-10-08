'use client'
import { HubTabs } from '@/components/shell/hub-tabs'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { CalendarClock, Plus, Video, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Badge, EmptyState, PageHeader, Skeleton } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import type { Meeting } from '@/lib/types'

export default function MeetingsPage() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const router = useRouter()
  const { ws, canWrite, nameOf, log } = useWorkspace()
  const { userId } = useSession()
  const { data, loading } = useLive<Meeting>('meetings', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false] })
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [desc, setDesc] = useState('')

  async function create(instant: boolean) {
    if (!userId) return
    const { data: row, error } = await getDb().from('meetings').insert({
      workspace_id: ws.id, host_id: userId, title: instant ? t('meet.instant') : title.trim(), description: instant ? null : desc || null,
      status: instant ? 'live' : 'scheduled', scheduled_at: instant ? null : when ? new Date(when).toISOString() : null, started_at: instant ? new Date().toISOString() : null,
    }).select().single()
    if (error || !row) { toast.error(t('common.error')); return }
    log('meeting.created', 'meeting', (row as Meeting).id, { title: (row as Meeting).title })
    setOpen(false); setTitle(''); setWhen(''); setDesc('')
    if (instant) router.push(`/app/${ws.slug}/meetings/${(row as Meeting).id}`)
  }

  const live = data.filter((m) => m.status === 'live')
  const upcoming = data.filter((m) => m.status === 'scheduled').sort((a, b) => (a.scheduled_at ?? '9').localeCompare(b.scheduled_at ?? '9'))
  const past = data.filter((m) => m.status === 'ended')

  const Row = ({ m }: { m: Meeting }) => (
    <li><Link href={`/app/${ws.slug}/meetings/${m.id}`} className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0 hover:bg-surface-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"><Video className="size-4" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{m.title}</span>
        <span className="block truncate text-xs text-text-3">{m.scheduled_at ? format(new Date(m.scheduled_at), 'PPp', { locale: dfl }) : format(new Date(m.created_at), 'PPp', { locale: dfl })} · {nameOf(m.host_id)}</span></span>
      {m.status === 'live' ? <Badge color="var(--success)">{t('meet.live')}</Badge> : m.status === 'scheduled' ? <Button size="xs" variant="outline" tabIndex={-1}>{t('meet.join')}</Button> : null}
    </Link></li>
  )
  const Section = ({ title: ti, items }: { title: string; items: Meeting[] }) => items.length ? (
    <section><h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-3">{ti}</h2><ul className="overflow-hidden rounded-xl border border-border bg-surface">{items.map((m) => <Row key={m.id} m={m} />)}</ul></section>
  ) : null

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <HubTabs hub="messages" />
      <PageHeader title={t('meet.title')} icon={<Video className="size-[18px]" />}
        actions={canWrite && <><Button onClick={() => setOpen(true)}><CalendarClock className="size-4" />{t('meet.new')}</Button><Button variant="primary" onClick={() => create(true)}><Zap className="size-4" />{t('meet.instant')}</Button></>} />
      {loading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        : data.length === 0 ? <EmptyState icon={<Video className="size-5" />} title={t('meet.empty')} hint={t('meet.emptyHint')} />
        : <div className="space-y-6"><Section title={t('meet.live')} items={live} /><Section title={t('meet.upcoming')} items={upcoming} /><Section title={t('meet.past')} items={past} /></div>}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('meet.new')} size="sm"
        footer={<><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" disabled={!title.trim()} onClick={() => create(false)}><Plus className="size-4" />{t('common.create')}</Button></>}>
        <div className="space-y-4"><Field label={t('meet.meetingTitle')}><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label={t('meet.when')}><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          <Field label={t('common.description')}><Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field></div>
      </Dialog>
    </div>
  )
}
