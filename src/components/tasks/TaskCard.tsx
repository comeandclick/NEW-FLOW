'use client'

import Link from 'next/link'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { CalendarDays, MessageSquare, Paperclip } from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'
import type { Task } from '@/types/database'

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  urgent: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  low: 'bg-blue-400/10 text-blue-400 border-blue-400/20',
}

interface TaskCardProps {
  task: Task
  workspaceId: string
  isDragging?: boolean
}

export function TaskCard({ task, workspaceId, isDragging }: TaskCardProps) {
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const slug = currentWorkspace?.slug ?? ''

  const dueDate = task.due_date ? new Date(task.due_date) : null
  const duePast = dueDate && isPast(dueDate) && task.status !== 'done'
  const dueToday = dueDate && isToday(dueDate)

  const taskWithAssignee = task as Task & {
    assignee?: { id: string; full_name?: string; avatar_url?: string } | null
  }

  return (
    <Link href={`/${slug}/tasks/${task.id}`}>
      <div
        className={cn(
          'bg-background border border-border rounded-md p-3 hover:border-primary/40 transition-colors cursor-pointer',
          isDragging && 'shadow-lg rotate-1',
          task.status === 'done' && 'opacity-60'
        )}
      >
        <div className="space-y-2">
          <p className={cn('text-sm leading-snug', task.status === 'done' && 'line-through text-muted-foreground')}>
            {task.title}
          </p>

          <div className="flex items-center justify-between gap-2">
            <Badge variant="outline" className={cn('text-[10px] h-4 px-1.5', PRIORITY_COLORS[task.priority])}>
              {task.priority}
            </Badge>

            <div className="flex items-center gap-1.5">
              {dueDate && (
                <span className={cn(
                  'flex items-center gap-0.5 text-[10px]',
                  duePast ? 'text-red-500' : dueToday ? 'text-orange-400' : 'text-muted-foreground'
                )}>
                  <CalendarDays className="h-2.5 w-2.5" />
                  {format(dueDate, 'MMM d')}
                </span>
              )}

              {taskWithAssignee.assignee && (
                <Avatar className="h-4 w-4">
                  <AvatarImage src={taskWithAssignee.assignee.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[8px]">
                    {taskWithAssignee.assignee.full_name?.[0] ?? '?'}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
