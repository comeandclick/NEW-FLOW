'use client'

import { use, useEffect, useState } from 'react'
import { calendarService } from '@/services/calendar.service'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, isSameDay, addMonths, subMonths,
  addWeeks, subWeeks, startOfDay, addDays,
} from 'date-fns'
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

function EventDot({ event }: { event: CalendarEvent }) {
  return (
    <div
      title={event.title}
      className="text-[10px] bg-blue-500/10 text-blue-400 rounded px-1 py-0.5 truncate leading-4"
      style={{ backgroundColor: event.color ? `${event.color}22` : undefined, color: event.color ?? undefined }}
    >
      {event.all_day ? '' : format(new Date(event.start_at), 'HH:mm') + ' '}
      {event.title}
    </div>
  )
}

export default function CalendarPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [view, setView] = useState<View>('month')
  const [createOpen, setCreateOpen] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', start_at: '', end_at: '', all_day: false })

  // Load events for visible range
  useEffect(() => {
    if (!currentWorkspace?.id) return
    let from: string
    let to: string
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
    if (view === 'month') return format(currentDate, 'MMMM yyyy')
    if (view === 'week') {
      const ws = startOfWeek(currentDate)
      const we = endOfWeek(currentDate)
      return `${format(ws, 'd MMM')} – ${format(we, 'd MMM yyyy')}`
    }
    return format(currentDate, 'EEEE d MMMM yyyy')
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!currentWorkspace?.id || !user?.id || !newEvent.title || !newEvent.start_at) return
    try {
      const event = await calendarService.create({
        workspace_id: currentWorkspace.id,
        title: newEvent.title,
        start_at: newEvent.start_at,
        end_at: newEvent.end_at || newEvent.start_at,
        all_day: newEvent.all_day,
        created_by: user.id,
      })
      setEvents((prev) => [...prev, event])
      setCreateOpen(false)
      setNewEvent({ title: '', start_at: '', end_at: '', all_day: false })
      toast.success('Événement créé')
    } catch {
      toast.error('Erreur lors de la création')
    }
  }

  // ── Month view ─────────────────────────────────────────────────────────────
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
                onClick={() => { setCurrentDate(day); setView('day') }}
              >
                <span className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  isToday(day) && 'bg-primary text-primary-foreground font-semibold',
                  !isSameMonth(day, currentDate) && 'text-muted-foreground',
                )}>
                  {format(day, 'd')}
                </span>
                {dayEvents.slice(0, 3).map((evt) => <EventDot key={evt.id} event={evt} />)}
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

  // ── Week / Day view ────────────────────────────────────────────────────────
  function TimeGrid({ days }: { days: Date[] }) {
    const now = new Date()
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    return (
      <div className="flex flex-col flex-1 overflow-auto">
        {/* Header */}
        <div className="grid border-b border-border shrink-0" style={{ gridTemplateColumns: `3rem repeat(${days.length}, 1fr)` }}>
          <div className="border-r border-border" />
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className={cn(
                'text-center py-2 text-xs border-r border-border',
                isToday(day) && 'bg-primary/5',
              )}
            >
              <span className={cn('font-medium text-muted-foreground uppercase text-[10px]')}>{format(day, 'EEE')}</span>
              <div className={cn(
                'mx-auto mt-0.5 h-7 w-7 flex items-center justify-center rounded-full text-sm font-semibold',
                isToday(day) && 'bg-primary text-primary-foreground',
              )}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable time grid */}
        <div className="flex-1 overflow-auto">
          <div className="relative" style={{ minHeight: `${24 * 56}px` }}>
            {/* Hour rows */}
            {HOURS.map((h) => (
              <div
                key={h}
                className="grid border-b border-border/40"
                style={{ gridTemplateColumns: `3rem repeat(${days.length}, 1fr)`, height: '56px' }}
              >
                <div className="border-r border-border/40 px-1 pt-0.5">
                  <span className="text-[10px] text-muted-foreground">{h === 0 ? '' : `${h}:00`}</span>
                </div>
                {days.map((day) => (
                  <div key={day.toISOString()} className={cn(
                    'border-r border-border/40 hover:bg-accent/10 cursor-pointer transition-colors',
                    isToday(day) && 'bg-primary/3',
                  )} />
                ))}
              </div>
            ))}

            {/* Events overlay */}
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

              return (
                <div
                  key={evt.id}
                  className="absolute rounded px-1 py-0.5 text-[10px] leading-tight overflow-hidden cursor-pointer hover:opacity-90 transition-opacity z-10"
                  style={{
                    top: `${top}px`,
                    height: `${Math.max(height, 20)}px`,
                    left: `calc(3rem + ${leftPercent}%)`,
                    width: `${widthPercent}%`,
                    backgroundColor: evt.color ? `${evt.color}30` : 'rgb(59 130 246 / 0.15)',
                    borderLeft: `2px solid ${evt.color ?? 'rgb(96 165 250)'}`,
                    color: evt.color ?? 'rgb(96 165 250)',
                  }}
                >
                  <span className="font-medium truncate block">{evt.title}</span>
                  <span className="opacity-70">{format(evtDate, 'HH:mm')}</span>
                </div>
              )
            })}

            {/* Current time indicator */}
            {days.some((d) => isToday(d)) && (
              <div
                className="absolute w-full z-20 pointer-events-none"
                style={{ top: `${(nowMinutes / 60) * 56}px` }}
              >
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

  function WeekView() {
    const days = eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) })
    return <TimeGrid days={days} />
  }

  function DayView() {
    return <TimeGrid days={[startOfDay(currentDate)]} />
  }

  return (
    <div className="flex flex-col h-full">
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
          <h1 className="text-sm font-semibold ml-1">{headerTitle()}</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            {(['month', 'week', 'day'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  'px-2.5 py-1 capitalize transition-colors',
                  view === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                {v === 'month' ? 'Mois' : v === 'week' ? 'Semaine' : 'Jour'}
              </button>
            ))}
          </div>

          <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Événement
          </Button>
        </div>
      </div>

      {/* Calendar content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {view === 'month' && <MonthView />}
        {view === 'week' && <WeekView />}
        {view === 'day' && <DayView />}
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nouvel événement</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateEvent} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Titre</Label>
              <Input placeholder="Titre de l'événement" value={newEvent.title}
                onChange={(e) => setNewEvent((p) => ({ ...p, title: e.target.value }))}
                required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Début</Label>
                <Input type="datetime-local" className="text-xs" value={newEvent.start_at}
                  onChange={(e) => setNewEvent((p) => ({ ...p, start_at: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Fin</Label>
                <Input type="datetime-local" className="text-xs" value={newEvent.end_at}
                  onChange={(e) => setNewEvent((p) => ({ ...p, end_at: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={newEvent.all_day}
                onChange={(e) => setNewEvent((p) => ({ ...p, all_day: e.target.checked }))}
                className="rounded" />
              Toute la journée
            </label>
            <Button type="submit" className="w-full" size="sm">Créer l&apos;événement</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
