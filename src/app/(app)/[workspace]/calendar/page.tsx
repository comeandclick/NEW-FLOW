'use client'

import { use, useEffect, useState } from 'react'
import { calendarService } from '@/services/calendar.service'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isToday, isSameDay, addMonths, subMonths,
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

export default function CalendarPage({ params }: Props) {
  use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [newEvent, setNewEvent] = useState({ title: '', start_at: '', end_at: '', all_day: false })

  useEffect(() => {
    if (!currentWorkspace?.id) return
    const from = format(startOfMonth(currentDate), "yyyy-MM-dd'T'HH:mm:ss")
    const to = format(endOfMonth(currentDate), "yyyy-MM-dd'T'HH:mm:ss")
    calendarService
      .getEvents(currentWorkspace.id, from, to)
      .then(setEvents)
      .catch(console.error)
  }, [currentWorkspace?.id, currentDate])

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart)
  const calEnd = endOfWeek(monthEnd)
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

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
      toast.success('Event created')
    } catch {
      toast.error('Failed to create event')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">
            {format(currentDate, 'MMMM yyyy')}
          </h1>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> New event
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 border-l border-t border-border">
          {days.map((day) => {
            const dayEvents = events.filter((e) => isSameDay(new Date(e.start_at), day))
            const isCurrentMonth = isSameMonth(day, currentDate)

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'min-h-24 border-r border-b border-border p-1.5 space-y-1',
                  !isCurrentMonth && 'bg-muted/20',
                )}
              >
                <span className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  isToday(day) && 'bg-primary text-primary-foreground font-medium',
                  !isCurrentMonth && 'text-muted-foreground',
                )}>
                  {format(day, 'd')}
                </span>
                {dayEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    className="text-[10px] bg-blue-500/10 text-blue-400 rounded px-1 py-0.5 truncate"
                  >
                    {event.all_day ? '' : format(new Date(event.start_at), 'HH:mm') + ' '}
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-[9px] text-muted-foreground">+{dayEvents.length - 3} more</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New event</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateEvent} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                placeholder="Event title"
                value={newEvent.title}
                onChange={(e) => setNewEvent((p) => ({ ...p, title: e.target.value }))}
                required
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input
                  type="datetime-local"
                  className="text-xs"
                  value={newEvent.start_at}
                  onChange={(e) => setNewEvent((p) => ({ ...p, start_at: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input
                  type="datetime-local"
                  className="text-xs"
                  value={newEvent.end_at}
                  onChange={(e) => setNewEvent((p) => ({ ...p, end_at: e.target.value }))}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" size="sm">Create event</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
