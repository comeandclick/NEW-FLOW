'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { calendarService } from '@/services/calendar.service'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, X } from 'lucide-react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, isSameDay, addMonths, subMonths,
  addWeeks, subWeeks, startOfDay, addDays, addHours,
} from 'date-fns'
import { fr } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/types/database'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

interface Props {
  params: Promise<{ workspace: string }>
}

type View = 'month' | 'week' | 'day'

const HOURS = Array.from({ length: 24 }, (_, i) => i)

const EVENT_COLORS = [
  '#6366f1', '#3b82f6', '#0ea5e9', '#22c55e', '#f97316',
  '#ec4899', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6',
]

function toDatetimeLocal(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(val: string) {
  return val ? new Date(val).toISOString() : ''
}

interface EventForm {
  title: string
  start_at: string
  end_at: string
  all_day: boolean
  color: string
  description: string
}

function emptyForm(date?: Date): EventForm {
  const base = date ?? new Date()
  const start = new Date(base)
  start.setMinutes(0, 0, 0)
  return {
    title: '',
    start_at: toDatetimeLocal(start.toISOString()),
    end_at: toDatetimeLocal(addHours(start, 1).toISOString()),
    all_day: false,
    color: '#6366f1',
    description: '',
  }
}

export default function CalendarPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [view, setView] = useState<View>('month')

  // Create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [form, setForm] = useState<EventForm>(emptyForm())
  const [saving, setSaving] = useState(false)

  // Load events
  useEffect(() => {
    if (!currentWorkspace?.id) return
    let from: string, to: string
    if (view === 'month') {
      from = format(startOfWeek(startOfMonth(currentDate)), "yyyy-MM-dd'T'00:00:00")
      to = format(endOfWeek(endOfMonth(currentDate)), "yyyy-MM-dd'T'23:59:59")
    } else if (view === 'week') {
      from = format(startOfWeek(currentDate), "yyyy-MM-dd'T'00:00:00")
      to = format(endOfWeek(currentDate), "yyyy-MM-dd'T'23:59:59")
    } else {
      from = format(startOfDay(currentDate), "yyyy-MM-dd'T'00:00:00")
      to = format(startOfDay(currentDate), "yyyy-MM-dd'T'23:59:59")
    }
    calendarService.getEvents(currentWorkspace.id, from, to).then(setEvents).catch(console.error)
  }, [currentWorkspace?.id, currentDate, view])

  function navigate(dir: 1 | -1) {
    if (view === 'month') setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
    else if (view === 'week') setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1))
    else setCurrentDate(dir > 0 ? addDays(currentDate, 1) : addDays(currentDate, -1))
  }

  function headerTitle() {
    if (view === 'month') return format(currentDate, 'MMMM yyyy', { locale: fr })
    if (view === 'week') {
      const ws = startOfWeek(currentDate)
      const we = endOfWeek(currentDate)
      return `${format(ws, 'd MMM', { locale: fr })} – ${format(we, 'd MMM yyyy', { locale: fr })}`
    }
    return format(currentDate, 'EEEE d MMMM yyyy', { locale: fr })
  }

  function openCreate(date?: Date) {
    setEditingEvent(null)
    setForm(emptyForm(date))
    setDialogOpen(true)
  }

  function openEdit(evt: CalendarEvent, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingEvent(evt)
    setForm({
      title: evt.title,
      start_at: toDatetimeLocal(evt.start_at),
      end_at: toDatetimeLocal(evt.end_at),
      all_day: evt.all_day ?? false,
      color: evt.color ?? '#6366f1',
      description: evt.description ?? '',
    })
    setDialogOpen(true)
  }

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentWorkspace?.id || !user?.id || !form.title || !form.start_at) return
    setSaving(true)
    try {
      const payload = {
        workspace_id: currentWorkspace.id,
        title: form.title,
        description: form.description || null,
        start_at: fromDatetimeLocal(form.start_at),
        end_at: fromDatetimeLocal(form.end_at) || fromDatetimeLocal(form.start_at),
        all_day: form.all_day,
        color: form.color,
        created_by: user.id,
      }
      if (editingEvent) {
        // Update
        const updated = await calendarService.update(editingEvent.id, payload)
        setEvents(prev => prev.map(ev => ev.id === editingEvent.id ? updated : ev))
        toast.success('Événement modifié')
      } else {
        const created = await calendarService.create(payload)
        setEvents(prev => [...prev, created])
        toast.success('Événement créé')
      }
      setDialogOpen(false)
    } catch {
      toast.error('Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }, [currentWorkspace?.id, user?.id, form, editingEvent])

  async function handleDelete() {
    if (!editingEvent) return
    try {
      await calendarService.delete(editingEvent.id)
      setEvents(prev => prev.filter(ev => ev.id !== editingEvent.id))
      setDialogOpen(false)
      toast.success('Événement supprimé')
    } catch {
      toast.error('Impossible de supprimer')
    }
  }

  // ── Event chip ──────────────────────────────────────────────────────────────
  function EventChip({ event }: { event: CalendarEvent }) {
    return (
      <div
        title={event.title}
        className="text-[10px] rounded px-1 py-0.5 truncate leading-4 cursor-pointer hover:opacity-80 transition-opacity"
        style={{ backgroundColor: `${event.color ?? '#6366f1'}22`, color: event.color ?? '#6366f1' }}
        onClick={(e) => openEdit(event, e)}
      >
        {event.all_day ? '' : format(new Date(event.start_at), 'HH:mm') + ' '}
        {event.title}
      </div>
    )
  }

  // ── Month view ──────────────────────────────────────────────────────────────
  function MonthView() {
    const days = eachDayOfInterval({
      start: startOfWeek(startOfMonth(currentDate)),
      end: endOfWeek(endOfMonth(currentDate)),
    })
    return (
      <>
        <div className="grid grid-cols-7 border-b border-border">
          {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
          ))}
        </div>
        <div className="flex-1 grid grid-cols-7 border-l border-t border-border overflow-auto">
          {days.map((day) => {
            const dayEvents = events.filter((e) => isSameDay(new Date(e.start_at), day))
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'min-h-24 border-r border-b border-border p-1.5 space-y-1 cursor-pointer hover:bg-accent/20 transition-colors',
                  !isSameMonth(day, currentDate) && 'bg-muted/10',
                )}
                onClick={() => openCreate(day)}
              >
                <span className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  isToday(day) && 'bg-primary text-primary-foreground font-semibold',
                  !isSameMonth(day, currentDate) && 'text-muted-foreground',
                )}>
                  {format(day, 'd')}
                </span>
                {dayEvents.slice(0, 3).map((evt) => <EventChip key={evt.id} event={evt} />)}
                {dayEvents.length > 3 && (
                  <p className="text-[9px] text-muted-foreground">+{dayEvents.length - 3} de plus</p>
                )}
              </div>
            )
          })}
        </div>
      </>
    )
  }

  // ── Time grid (week + day) ──────────────────────────────────────────────────
  function TimeGrid({ days }: { days: Date[] }) {
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    return (
      <div className="flex flex-col flex-1 overflow-auto">
        <div className="grid border-b border-border shrink-0" style={{ gridTemplateColumns: `3rem repeat(${days.length}, 1fr)` }}>
          <div className="border-r border-border" />
          {days.map((day) => (
            <div key={day.toISOString()} className={cn('text-center py-2 text-xs border-r border-border', isToday(day) && 'bg-primary/5')}>
              <span className="font-medium text-muted-foreground uppercase text-[10px]">{format(day, 'EEE', { locale: fr })}</span>
              <div className={cn('mx-auto mt-0.5 h-7 w-7 flex items-center justify-center rounded-full text-sm font-semibold', isToday(day) && 'bg-primary text-primary-foreground')}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          <div className="relative" style={{ minHeight: `${24 * 56}px` }}>
            {HOURS.map((h) => (
              <div key={h} className="grid border-b border-border/40" style={{ gridTemplateColumns: `3rem repeat(${days.length}, 1fr)`, height: '56px' }}>
                <div className="border-r border-border/40 px-1 pt-0.5">
                  <span className="text-[10px] text-muted-foreground">{h === 0 ? '' : `${h}:00`}</span>
                </div>
                {days.map((day) => {
                  const clickDate = new Date(day)
                  clickDate.setHours(h, 0, 0, 0)
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn('border-r border-border/40 hover:bg-accent/10 cursor-pointer transition-colors', isToday(day) && 'bg-primary/[0.03]')}
                      onClick={() => openCreate(clickDate)}
                    />
                  )
                })}
              </div>
            ))}

            {events.filter((e) => !e.all_day).map((evt) => {
              const evtDate = new Date(evt.start_at)
              const dayIdx = days.findIndex((d) => isSameDay(d, evtDate))
              if (dayIdx === -1) return null
              const startMin = evtDate.getHours() * 60 + evtDate.getMinutes()
              const endDate = new Date(evt.end_at)
              const endMin = endDate.getHours() * 60 + endDate.getMinutes()
              const duration = Math.max(endMin - startMin, 30)
              const top = (startMin / 60) * 56
              const height = (duration / 60) * 56
              const leftPercent = (dayIdx / days.length) * 100 + 3 / days.length
              const widthPercent = (1 / days.length) * 100 - 6 / days.length
              const color = evt.color ?? '#6366f1'

              return (
                <div
                  key={evt.id}
                  className="absolute rounded px-1.5 py-1 text-[10px] leading-tight overflow-hidden cursor-pointer hover:opacity-90 transition-opacity z-10 group"
                  style={{
                    top: `${top}px`,
                    height: `${Math.max(height, 20)}px`,
                    left: `calc(3rem + ${leftPercent}%)`,
                    width: `${widthPercent}%`,
                    backgroundColor: `${color}25`,
                    borderLeft: `2px solid ${color}`,
                    color,
                  }}
                  onClick={(e) => openEdit(evt, e)}
                >
                  <span className="font-medium truncate block">{evt.title}</span>
                  <span className="opacity-70">{format(evtDate, 'HH:mm')} – {format(endDate, 'HH:mm')}</span>
                </div>
              )
            })}

            {days.some((d) => isToday(d)) && (
              <div className="absolute w-full z-20 pointer-events-none" style={{ top: `${(nowMinutes / 60) * 56}px` }}>
                <div className="flex items-center" style={{ marginLeft: '3rem' }}>
                  <div className="h-2 w-2 rounded-full bg-red-500 -ml-1 shrink-0" />
                  <div className="flex-1 h-px bg-red-500/60" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full page-enter">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCurrentDate(new Date())}>
            Aujourd&apos;hui
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-semibold ml-1 capitalize">{headerTitle()}</h1>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            {(['month', 'week', 'day'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={cn('px-2.5 py-1 capitalize transition-colors', view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}>
                {v === 'month' ? 'Mois' : v === 'week' ? 'Semaine' : 'Jour'}
              </button>
            ))}
          </div>
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => openCreate()}>
            <Plus className="h-3.5 w-3.5" /> Événement
          </Button>
        </div>
      </div>

      {/* Calendar content — swipe + wheel navigation */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        onWheel={(e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) navigate(e.deltaX > 0 ? 1 : -1) }}
        onTouchStart={(e) => {
          const t = e.touches[0]
          ;(e.currentTarget as HTMLDivElement).dataset.touchX = String(t.clientX)
        }}
        onTouchEnd={(e) => {
          const startX = Number((e.currentTarget as HTMLDivElement).dataset.touchX ?? 0)
          const dx = e.changedTouches[0].clientX - startX
          if (Math.abs(dx) > 50) navigate(dx < 0 ? 1 : -1)
        }}
      >
        {view === 'month' && <MonthView />}
        {view === 'week' && <TimeGrid days={eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) })} />}
        {view === 'day' && <TimeGrid days={[startOfDay(currentDate)]} />}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Modifier l\'événement' : 'Nouvel événement'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Titre</Label>
              <Input placeholder="Titre de l'événement" value={form.title}
                onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input placeholder="Description (optionnel)" value={form.description}
                onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Début</Label>
                <Input type="datetime-local" className="text-xs" value={form.start_at}
                  onChange={(e) => setForm(p => ({ ...p, start_at: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Fin</Label>
                <Input type="datetime-local" className="text-xs" value={form.end_at}
                  onChange={(e) => setForm(p => ({ ...p, end_at: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.all_day}
                onChange={(e) => setForm(p => ({ ...p, all_day: e.target.checked }))} className="rounded" />
              Toute la journée
            </label>
            {/* Color picker */}
            <div className="space-y-1.5">
              <Label>Couleur</Label>
              <div className="flex gap-1.5 flex-wrap">
                {EVENT_COLORS.map(c => (
                  <button key={c} type="button"
                    className={cn('h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
                      form.color === c ? 'border-foreground scale-110' : 'border-transparent')}
                    style={{ backgroundColor: c }}
                    onClick={() => setForm(p => ({ ...p, color: c }))}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              {editingEvent && (
                <Button type="button" variant="destructive" size="sm" className="gap-1" onClick={handleDelete}>
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </Button>
              )}
              <Button type="submit" className="flex-1" size="sm" disabled={saving}>
                {saving ? 'Sauvegarde…' : editingEvent ? 'Modifier' : 'Créer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
