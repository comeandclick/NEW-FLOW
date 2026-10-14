'use client'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, FileText, Lock, MapPin, Pin, PinOff, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState, PageHeader, Switch, Tabs } from '@/components/ui/misc'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Dialog } from '@/components/ui/overlay'
import { usePerso } from '@/lib/hooks/use-perso'
import { usePrefs } from '@/lib/hooks/use-prefs'
import { newId, PERSO_COLOR, PERSO_LIMITS, persoEventsOn, type PersoEvent, type PersoNote } from '@/lib/perso'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'

type Tab = 'notes' | 'cal'
const dayStr = (d: Date) => format(d, 'yyyy-MM-dd')
const localStr = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm")

function NotesTab() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { perso, save } = usePerso()
  const [openId, setOpenId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef<{ id: string; title: string; body: string } | null>(null)

  const notes = useMemo(() => [...perso.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at)), [perso.notes])
  const current = notes.find((n) => n.id === openId) ?? null

  async function flush() {
    const d = dirty.current
    if (!d) return
    dirty.current = null
    const ok = await save((p) => ({ ...p, notes: p.notes.map((n) => (n.id === d.id ? { ...n, title: d.title, body: d.body, updated_at: new Date().toISOString() } : n)) }))
    if (!ok) toast.error(t('perso.saveFail'))
  }
  const queue = (nt: string, nb: string) => {
    if (!openId) return
    dirty.current = { id: openId, title: nt, body: nb }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), 700)
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); void flush() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const open = (n: PersoNote) => { void flush(); setOpenId(n.id); setTitle(n.title); setBody(n.body) }
  async function create() {
    if (perso.notes.length >= PERSO_LIMITS.notes) return
    const n: PersoNote = { id: newId(), title: '', body: '', pinned: false, updated_at: new Date().toISOString() }
    const ok = await save((p) => ({ ...p, notes: [n, ...p.notes] }))
    if (ok) { setOpenId(n.id); setTitle(''); setBody('') } else toast.error(t('perso.saveFail'))
  }
  async function remove(id: string) {
    dirty.current = null
    await save((p) => ({ ...p, notes: p.notes.filter((n) => n.id !== id) }))
    setOpenId(null)
  }
  const togglePin = (n: PersoNote) => save((p) => ({ ...p, notes: p.notes.map((x) => (x.id === n.id ? { ...x, pinned: !x.pinned } : x)) }))

  return (
    <div className="grid min-h-0 gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
      <div className={cn('min-w-0', openId && 'max-md:hidden')}>
        <Button variant="primary" size="sm" className="mb-3 w-full" onClick={create}><Plus className="size-4" />{t('perso.newNote')}</Button>
        {notes.length === 0 ? <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-3">{t('perso.noNotes')}</p> : (
          <ul className="space-y-1.5">
            {notes.map((n) => (
              <li key={n.id}>
                <button onClick={() => open(n)} onDoubleClick={() => void togglePin(n)} className={cn('block w-full rounded-xl border px-3 py-2.5 text-left transition-colors', n.id === openId ? 'border-accent bg-accent-soft/50' : 'border-border bg-surface hover:border-border-strong')}>
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium">{n.pinned && <Pin className="size-3 shrink-0 text-accent-ink" />}<span className="truncate">{n.title || t('notes.untitled')}</span></span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-text-3">{n.body || '—'}</span>
                  <span className="mt-1 block text-[11px] text-text-3">{format(new Date(n.updated_at), 'd MMM HH:mm', { locale: dfl })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={cn('min-w-0', !openId && 'max-md:hidden')}>
        {current ? (
          <div className="flex h-full flex-col rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center gap-2">
              <Button variant="ghost" size="icon" className="md:hidden" onClick={() => { void flush(); setOpenId(null) }} aria-label={t('common.back')}><ChevronLeft className="size-4" /></Button>
              <input value={title} maxLength={PERSO_LIMITS.title} onChange={(e) => { setTitle(e.target.value); queue(e.target.value, body) }} placeholder={t('perso.noteTitle')} aria-label={t('perso.noteTitle')}
                className="min-w-0 flex-1 bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-text-3" />
              <Button variant="ghost" size="icon" onClick={() => void togglePin(current)} aria-label={current.pinned ? t('notes.unpin') : t('notes.pin')}>{current.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}</Button>
              <Button variant="ghost" size="icon" onClick={() => void remove(current.id)} aria-label={t('perso.delete')}><Trash2 className="size-4" /></Button>
            </div>
            <textarea value={body} maxLength={PERSO_LIMITS.body} onChange={(e) => { setBody(e.target.value); queue(title, e.target.value) }} placeholder={t('perso.noteBody')} aria-label={t('perso.noteBody')}
              className="min-h-[50vh] w-full flex-1 resize-none rounded-md bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-text-3 focus-visible:outline-none" />
          </div>
        ) : <div className="max-md:hidden"><EmptyState icon={<FileText className="size-5" />} title={t('perso.notes')} hint={t('perso.sub')} /></div>}
      </div>
    </div>
  )
}

type Draft = { id?: string; title: string; all_day: boolean; start: string; end: string; location: string }

function CalendarTab() {
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const { prefs } = usePrefs()
  const weekStartsOn = prefs.weekStart
  const { perso, save } = usePerso()
  const [cursor, setCursor] = useState(new Date())
  const [picked, setPicked] = useState(new Date())
  const [draft, setDraft] = useState<Draft | null>(null)

  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor), { weekStartsOn }), end: endOfWeek(endOfMonth(cursor), { weekStartsOn }) })
  const weekdays = eachDayOfInterval({ start: startOfWeek(new Date(), { weekStartsOn }), end: endOfWeek(new Date(), { weekStartsOn }) })
  const dayEvents = persoEventsOn(perso.events, picked)
  const upcoming = useMemo(() => perso.events.filter((e) => new Date(e.end) >= new Date()).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8), [perso.events])

  const openNew = (d: Date) => {
    const s = new Date(d); s.setHours(9, 0, 0, 0); const e = new Date(s); e.setHours(10)
    setDraft({ title: '', all_day: false, start: localStr(s), end: localStr(e), location: '' })
  }
  const openEdit = (e: PersoEvent) => setDraft({ id: e.id, title: e.title, all_day: e.all_day, location: e.location, start: e.all_day ? dayStr(new Date(e.start)) : localStr(new Date(e.start)), end: e.all_day ? dayStr(new Date(e.end)) : localStr(new Date(e.end)) })

  async function submit() {
    if (!draft || !draft.title.trim()) return
    const s = draft.all_day ? new Date(`${draft.start}T00:00:00`) : new Date(draft.start)
    const e = draft.all_day ? new Date(`${draft.end || draft.start}T23:59:00`) : new Date(draft.end)
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) { toast.error(t('cal.invalidRange')); return }
    const ev: PersoEvent = { id: draft.id ?? newId(), title: draft.title.trim(), start: s.toISOString(), end: e.toISOString(), all_day: draft.all_day, location: draft.location.trim() }
    const ok = await save((p) => ({ ...p, events: draft.id ? p.events.map((x) => (x.id === ev.id ? ev : x)) : [...p.events, ev] }))
    if (!ok) { toast.error(t('perso.saveFail')); return }
    setDraft(null); toast.success(t('common.saved'))
  }
  async function remove() {
    if (!draft?.id) return
    await save((p) => ({ ...p, events: p.events.filter((x) => x.id !== draft.id) }))
    setDraft(null)
  }

  const row = (e: PersoEvent) => (
    <li key={e.id}>
      <button onClick={() => openEdit(e)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-border-strong">
        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: PERSO_COLOR }} />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{e.title}</span>
          <span className="block truncate text-xs text-text-3">{e.all_day ? t('cal.allDay') : `${format(new Date(e.start), 'HH:mm')} – ${format(new Date(e.end), 'HH:mm')}`}{e.location ? ` · ${e.location}` : ''}</span></span>
      </button>
    </li>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 className="text-sm font-semibold capitalize">{format(cursor, 'LLLL yyyy', { locale: dfl })}</h2>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" onClick={() => { setCursor(new Date()); setPicked(new Date()) }}>{t('cal.today')}</Button>
            <Button variant="ghost" size="icon" onClick={() => setCursor((c) => subMonths(c, 1))} aria-label={t('cal.prev')}><ChevronLeft className="size-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label={t('cal.next')}><ChevronRight className="size-4" /></Button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-border bg-surface-2/60">{weekdays.map((d) => <div key={d.toISOString()} className="py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-text-3">{format(d, 'EEE', { locale: dfl })}</div>)}</div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const evs = persoEventsOn(perso.events, d)
            return (
              <div key={d.toISOString()} onClick={() => setPicked(d)} onDoubleClick={() => openNew(d)}
                className={cn('flex min-h-[56px] cursor-pointer flex-col items-center gap-1 border-b border-r border-border/70 p-1 transition-colors hover:bg-surface-2/60 sm:min-h-[72px]', !isSameMonth(d, cursor) && 'bg-bg-subtle/60 text-text-3', isSameDay(d, picked) && 'bg-accent-soft/50')}>
                <span className={cn('flex size-6 items-center justify-center rounded-full text-xs tabular-nums', isToday(d) && 'bg-accent font-semibold text-white')}>{format(d, 'd')}</span>
                {evs.length > 0 && <span className="flex gap-0.5">{evs.slice(0, 3).map((e) => <span key={e.id} className="size-1.5 rounded-full" style={{ background: PERSO_COLOR }} />)}</span>}
              </div>
            )
          })}
        </div>
        <p className="px-3 py-2 text-xs text-text-3">{t('perso.shownInCal')}</p>
      </div>

      <div className="min-w-0 space-y-4">
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold first-letter:uppercase">{format(picked, 'EEEE d MMMM', { locale: dfl })}</h2>
            <Button size="sm" variant="primary" onClick={() => openNew(picked)}><Plus className="size-3.5" />{t('perso.newEvent')}</Button></div>
          {dayEvents.length ? <ul className="space-y-1.5">{dayEvents.map(row)}</ul> : <p className="rounded-xl border border-dashed border-border px-3 py-5 text-center text-sm text-text-3">{t('perso.noEvents')}</p>}
        </section>
        {upcoming.length > 0 && <section><h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-3">{t('perso.upcoming')}</h2>
          <ul className="space-y-1.5">{upcoming.map((e) => (
            <li key={e.id}><button onClick={() => { const d = new Date(e.start); setPicked(d); setCursor(d); openEdit(e) }} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
              <span className="w-14 shrink-0 text-xs tabular-nums text-text-3">{format(new Date(e.start), 'd MMM', { locale: dfl })}</span><span className="truncate">{e.title}</span></button></li>))}</ul></section>}
      </div>

      <Dialog open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? t('cal.editEvent') : t('perso.newEvent')}
        footer={draft && <>{draft.id && <Button variant="ghost" className="mr-auto text-danger" onClick={remove}><Trash2 className="size-4" />{t('common.delete')}</Button>}
          <Button onClick={() => setDraft(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={submit} disabled={!draft.title.trim()}>{t('common.save')}</Button></>}>
        {draft && (
          <div className="space-y-4">
            <Field label={t('perso.eventTitle')}><Input autoFocus value={draft.title} maxLength={PERSO_LIMITS.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void submit()} /></Field>
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><span className="text-sm">{t('perso.allDay')}</span>
              <Switch checked={draft.all_day} onChange={(v) => setDraft({ ...draft, all_day: v, start: draft.start.slice(0, 10) + (v ? '' : 'T09:00'), end: draft.end.slice(0, 10) + (v ? '' : 'T10:00') })} label={t('perso.allDay')} /></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('perso.eventStart')}><Input type={draft.all_day ? 'date' : 'datetime-local'} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value, end: draft.end < e.target.value ? e.target.value : draft.end })} /></Field>
              <Field label={t('perso.eventEnd')}><Input type={draft.all_day ? 'date' : 'datetime-local'} value={draft.end} min={draft.start} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field>
            </div>
            <Field label={t('cal.location')}><Input value={draft.location} maxLength={200} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></Field>
          </div>
        )}
      </Dialog>
    </div>
  )
}

function Me() {
  const { t } = useI18n()
  const router = useRouter()
  const params = useSearchParams()
  const tab: Tab = params.get('tab') === 'cal' ? 'cal' : 'notes'
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
      <PageHeader title={t('perso.title')} subtitle={t('perso.sub')} icon={<Lock className="size-[18px]" />}
        actions={<Tabs value={tab} onChange={(v) => router.replace(v === 'cal' ? '?tab=cal' : '?')} items={[{ value: 'notes', label: t('perso.tabNotes'), icon: <FileText className="size-3.5" /> }, { value: 'cal', label: t('perso.tabCal'), icon: <CalendarDays className="size-3.5" /> }]} />} />
      {tab === 'notes' ? <NotesTab /> : <CalendarTab />}
    </div>
  )
}

export default function Page() { return <Suspense><Me /></Suspense> }
