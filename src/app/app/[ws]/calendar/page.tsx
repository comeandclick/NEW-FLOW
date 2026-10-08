'use client'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek, subMonths, subWeeks,
} from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Video } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Switch, Tabs } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { CalEvent, Task } from '@/lib/types'

const COLORS = ['#6366f1', '#22c55e', '#f97316', '#ec4899', '#0ea5e9', '#a855f7', '#eab308', '#14b8a6']
type View = 'month' | 'week' | 'day'
const HOURS = Array.from({ length: 24 }, (_, i) => i)

const local = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm")
const localDate = (d: Date) => format(d, 'yyyy-MM-dd')

type Draft = { id?: string; title: string; description: string; all_day: boolean; start: string; end: string; color: string; location: string; attendees: string[]; meeting_id: string | null; visio: boolean }

function CalendarPage() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const router = useRouter()
  const params = useSearchParams()
  const { ws, members, canWrite, log, notifyUser } = useWorkspace()
  const { userId } = useSession()
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(new Date())
  const [draft, setDraft] = useState<Draft | null>(null)
  const events = useLive<CalEvent>('events', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['start_at', true] })
  const tasks = useLive<Task>('tasks', { eq: { workspace_id: ws.id }, is: { deleted_at: null } })

  useEffect(() => { try { const v = localStorage.getItem('flow_cal_view'); if (v === 'month' || v === 'week' || v === 'day') setView(v) } catch {} }, [])
  const openNew = (d = new Date(), allDay = false, hour = 9) => {
    if (!canWrite) return
    const s = new Date(d); if (!allDay) s.setHours(hour, 0, 0, 0)
    const e = new Date(s); e.setHours(s.getHours() + 1)
    setDraft({ title: '', description: '', all_day: allDay, start: allDay ? localDate(s) : local(s), end: allDay ? localDate(s) : local(e), color: COLORS[0], location: '', attendees: userId ? [userId] : [], meeting_id: null, visio: false })
  }
  useEffect(() => { if (params.get('new') === '1') { openNew(); router.replace(`/app/${ws.slug}/calendar`) } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openEdit = (e: CalEvent) => setDraft({
    id: e.id, title: e.title, description: e.description ?? '', all_day: e.all_day, color: e.color ?? COLORS[0], location: e.location ?? '', attendees: e.attendees ?? [], meeting_id: e.meeting_id ?? null, visio: !!e.meeting_id,
    start: e.all_day ? localDate(new Date(e.start_at)) : local(new Date(e.start_at)), end: e.all_day ? localDate(new Date(e.end_at)) : local(new Date(e.end_at)),
  })

  async function save() {
    if (!draft || !userId || !draft.title.trim()) return
    const s = draft.all_day ? new Date(`${draft.start}T00:00:00`) : new Date(draft.start)
    const e = draft.all_day ? new Date(`${draft.end || draft.start}T23:59:00`) : new Date(draft.end)
    if (e < s) { toast.error(t('cal.invalidRange')); return }
    let meetingId = draft.meeting_id
    if (draft.visio && !meetingId) {
      const { data: m } = await getDb().from('meetings').insert({ workspace_id: ws.id, title: draft.title.trim(), host_id: userId, status: 'scheduled', scheduled_at: s.toISOString() }).select().single()
      meetingId = (m as { id: string } | null)?.id ?? null
    } else if (!draft.visio && meetingId) meetingId = null
    const row = { title: draft.title.trim(), description: draft.description || null, all_day: draft.all_day, start_at: s.toISOString(), end_at: e.toISOString(), color: draft.color, location: draft.location || null, attendees: draft.attendees, meeting_id: meetingId }
    if (draft.id) await getDb().from('events').update(row).eq('id', draft.id)
    else {
      const { data } = await getDb().from('events').insert({ ...row, workspace_id: ws.id, created_by: userId }).select().single()
      log('event.created', 'event', (data as CalEvent)?.id ?? null, { title: row.title })
      for (const a of draft.attendees) void notifyUser(a, { type: 'event', title: row.title, body: format(s, 'PPp', { locale: dfl }), url: `/app/${ws.slug}/calendar` })
    }
    setDraft(null); events.refresh(); toast.success(t('common.saved'))
  }
  async function remove() {
    if (!draft?.id) return
    await getDb().from('events').update({ deleted_at: new Date().toISOString() }).eq('id', draft.id)
    setDraft(null); events.refresh(); toast.success(t('cal.deleted'))
  }

  const range = useMemo(() => {
    if (view === 'month') return { from: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) }
    if (view === 'week') return { from: startOfWeek(cursor, { weekStartsOn: 1 }), to: endOfWeek(cursor, { weekStartsOn: 1 }) }
    return { from: startOfDay(cursor), to: startOfDay(cursor) }
  }, [view, cursor])
  const days = eachDayOfInterval({ start: range.from, end: range.to })

  const eventsOn = (d: Date) => events.data.filter((e) => {
    const s = startOfDay(new Date(e.start_at)); const en = startOfDay(new Date(e.end_at))
    return d >= s && d <= en
  })
  const dueOn = (d: Date) => tasks.data.filter((x) => x.due_date && isSameDay(new Date(x.due_date), d) && x.status !== 'done' && x.status !== 'cancelled')

  const step = (dir: 1 | -1) => setCursor((c) => (view === 'month' ? (dir > 0 ? addMonths(c, 1) : subMonths(c, 1)) : view === 'week' ? (dir > 0 ? addWeeks(c, 1) : subWeeks(c, 1)) : addDays(c, dir)))
  const title = view === 'month' ? format(cursor, 'LLLL yyyy', { locale: dfl }) : view === 'week' ? `${format(range.from, 'd MMM', { locale: dfl })} – ${format(range.to, 'd MMM yyyy', { locale: dfl })}` : format(cursor, 'EEEE d MMMM yyyy', { locale: dfl })
  const weekdays = eachDayOfInterval({ start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) })

  const Chip = ({ e }: { e: CalEvent }) => (
    <button onClick={(ev) => { ev.stopPropagation(); openEdit(e) }} className="flex w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left text-[11px] font-medium transition-opacity hover:opacity-80"
      style={{ background: `color-mix(in srgb, ${e.color ?? COLORS[0]} 20%, transparent)`, color: `color-mix(in srgb, ${e.color ?? COLORS[0]} 45%, var(--text))` }}>
      {e.meeting_id && <Video className="size-3 shrink-0" />}{!e.all_day && <span className="hidden tabular-nums opacity-90 sm:inline">{format(new Date(e.start_at), 'HH:mm')}</span>}<span className="truncate">{e.title}</span>
    </button>
  )

  return (
    <div className="flex h-full flex-col px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"><CalendarDays className="size-[18px]" /></span>
          <h1 className="text-xl font-semibold capitalize tracking-tight">{title}</h1></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5"><Button variant="ghost" size="icon" onClick={() => step(-1)} aria-label="←"><ChevronLeft className="size-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>{t('cal.today')}</Button>
            <Button variant="ghost" size="icon" onClick={() => step(1)} aria-label="→"><ChevronRight className="size-4" /></Button></div>
          <Tabs value={view} onChange={(v) => { setView(v); try { localStorage.setItem('flow_cal_view', v) } catch {} }} items={[{ value: 'month', label: t('cal.month') }, { value: 'week', label: t('cal.week') }, { value: 'day', label: t('cal.day') }]} />
          {canWrite && <Button variant="primary" onClick={() => openNew(cursor)}><Plus className="size-4" /><span className="hidden sm:inline">{t('cal.newEvent')}</span></Button>}
        </div>
      </div>

      {view === 'month' ? (
        <motion.div key={format(cursor, 'yyyy-MM')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid grid-cols-7 border-b border-border bg-surface-2/60">{weekdays.map((d) => <div key={d.toISOString()} className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-text-3">{format(d, 'EEE', { locale: dfl })}</div>)}</div>
          <div className="grid min-h-0 flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}>
            {days.map((d) => {
              const evs = eventsOn(d); const due = dueOn(d)
              return (
                <div key={d.toISOString()} onClick={() => openNew(d, true)} className={cn('group flex min-h-[78px] cursor-pointer flex-col gap-0.5 overflow-hidden border-b border-r border-border/70 p-1 transition-colors hover:bg-surface-2/60', !isSameMonth(d, cursor) && 'bg-bg-subtle/60 text-text-3')}>
                  <span className={cn('mb-0.5 flex size-6 items-center justify-center self-start rounded-full text-xs tabular-nums', isToday(d) && 'bg-accent font-semibold text-white')}>{format(d, 'd')}</span>
                  {evs.slice(0, 3).map((e) => <Chip key={e.id} e={e} />)}
                  {evs.length + due.length > 3 && <span className="px-1 text-[10px] text-text-3">{t('cal.more', { n: evs.length + due.length - 3 })}</span>}
                  {evs.length < 3 && due.slice(0, 3 - evs.length).map((x) => <span key={x.id} className="truncate px-1.5 text-[10px] text-text-3">◦ {x.title}</span>)}
                </div>
              )
            })}
          </div>
        </motion.div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-surface">
          <div className="sticky top-0 z-10 grid border-b border-border bg-surface/95 backdrop-blur" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div />
            {days.map((d) => (
              <div key={d.toISOString()} className="border-l border-border/70 px-2 py-2 text-center">
                <div className="text-[11px] uppercase text-text-3">{format(d, 'EEE', { locale: dfl })}</div>
                <div className={cn('mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-sm tabular-nums', isToday(d) && 'bg-accent font-semibold text-white')}>{format(d, 'd')}</div>
                <div className="mt-1 space-y-0.5">{eventsOn(d).filter((e) => e.all_day).map((e) => <Chip key={e.id} e={e} />)}</div>
              </div>
            ))}
          </div>
          <div className="relative grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0, 1fr))` }}>
            <div>{HOURS.map((h) => <div key={h} className="h-14 pr-2 pt-0.5 text-right text-[10px] tabular-nums text-text-3">{h ? `${String(h).padStart(2, '0')}:00` : ''}</div>)}</div>
            {days.map((d) => (
              <div key={d.toISOString()} className="relative border-l border-border/70">
                {HOURS.map((h) => <div key={h} onClick={() => openNew(d, false, h)} className="h-14 cursor-pointer border-b border-border/50 hover:bg-surface-2/50" />)}
                {eventsOn(d).filter((e) => !e.all_day).map((e) => {
                  const s = new Date(e.start_at); const en = new Date(e.end_at)
                  const top = isSameDay(s, d) ? (s.getHours() + s.getMinutes() / 60) * 56 : 0
                  const bottom = isSameDay(en, d) ? (en.getHours() + en.getMinutes() / 60) * 56 : 24 * 56
                  return (
                    <button key={e.id} onClick={() => openEdit(e)} className="absolute inset-x-0.5 overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left text-[11px] font-medium transition-opacity hover:opacity-85"
                      style={{ top, height: Math.max(22, bottom - top - 2), background: `color-mix(in srgb, ${e.color ?? COLORS[0]} 20%, var(--surface))`, borderColor: e.color ?? COLORS[0], color: 'var(--text)' }}>
                      <div className="truncate">{e.title}</div><div className="truncate text-[10px] text-text-2">{format(s, 'HH:mm')} – {format(en, 'HH:mm')}</div>
                    </button>
                  )
                })}
                {isToday(d) && <div className="pointer-events-none absolute inset-x-0 z-[5] h-px bg-danger-bg" style={{ top: (new Date().getHours() + new Date().getMinutes() / 60) * 56 }}><span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-danger-bg" /></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? t('cal.editEvent') : t('cal.newEvent')}
        footer={draft && <>{draft.id && canWrite && <Button variant="ghost" className="mr-auto text-danger" onClick={remove}><Trash2 className="size-4" />{t('common.delete')}</Button>}
          <Button onClick={() => setDraft(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={save} disabled={!draft.title.trim() || !canWrite}>{t('common.save')}</Button></>}>
        {draft && (
          <div className="space-y-4">
            <Field label={t('common.title')}><Input autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><span className="text-sm">{t('cal.allDay')}</span>
              <Switch checked={draft.all_day} onChange={(v) => setDraft({ ...draft, all_day: v, start: draft.start.slice(0, 10) + (v ? '' : 'T09:00'), end: draft.end.slice(0, 10) + (v ? '' : 'T10:00') })} label={t('cal.allDay')} /></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('cal.start')}><Input type={draft.all_day ? 'date' : 'datetime-local'} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value, end: draft.end < e.target.value ? e.target.value : draft.end })} /></Field>
              <Field label={t('cal.end')}><Input type={draft.all_day ? 'date' : 'datetime-local'} value={draft.end} min={draft.start} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><span className="flex items-center gap-2 text-sm"><Video className="size-4 text-text-3" />{t('cal.visio')}</span>
              <div className="flex items-center gap-2">{draft.meeting_id && <Button size="xs" variant="primary" onClick={() => router.push(`/app/${ws.slug}/meetings/${draft.meeting_id}`)}>{t('meet.join')}</Button>}
                <Switch checked={draft.visio} onChange={(v) => setDraft({ ...draft, visio: v })} label={t('cal.visio')} /></div></div>
            <Field label={t('cal.location')}><Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></Field>
            <Field label={t('common.description')}><Textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            <div><span className="mb-1.5 block text-[13px] font-medium text-text-2">{t('cal.color')}</span>
              <div className="flex gap-2">{COLORS.map((c) => <button key={c} aria-label={c} onClick={() => setDraft({ ...draft, color: c })} className={cn('size-6 rounded-full ring-offset-2 ring-offset-surface transition', draft.color === c && 'ring-2 ring-text')} style={{ background: c }} />)}</div></div>
            <div><span className="mb-1.5 block text-[13px] font-medium text-text-2">{t('cal.attendees')}</span>
              <div className="flex flex-wrap gap-1.5">{members.map((m) => {
                const on = draft.attendees.includes(m.user_id)
                return <button key={m.id} onClick={() => setDraft({ ...draft, attendees: on ? draft.attendees.filter((x) => x !== m.user_id) : [...draft.attendees, m.user_id] })}
                  className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors', on ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-text-2 hover:border-border-strong')}>{m.profile?.full_name ?? m.profile?.email}</button>
              })}</div></div>
          </div>
        )}
      </Dialog>
    </div>
  )
}

export default function Page() { return <Suspense><CalendarPage /></Suspense> }
