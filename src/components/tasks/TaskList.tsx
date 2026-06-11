'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { tasksService } from '@/services/tasks.service'
import { useTaskStore } from '@/stores/taskStore'
import { format, isPast } from 'date-fns'
import type { Task } from '@/types/database'
import { toast } from 'sonner'
import { Trash2, ExternalLink, CheckSquare } from 'lucide-react'

const PRIORITY_DOT: Record<Task['priority'], string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-400',
}

const STATUS_FR: Record<Task['status'], string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  in_review: 'En revue',
  done: 'Terminé',
  cancelled: 'Annulé',
}

interface TaskListProps {
  tasks: Task[]
  workspaceSlug: string
}

export function TaskList({ tasks, workspaceSlug }: TaskListProps) {
  const router = useRouter()
  const updateTask = useTaskStore(s => s.updateTask)
  const removeTask = useTaskStore(s => s.removeTask)

  async function toggleDone(task: Task, checked: boolean) {
    const newStatus = checked ? 'done' : 'todo'
    updateTask(task.id, { status: newStatus })
    try {
      await tasksService.update(task.id, { status: newStatus })
    } catch {
      updateTask(task.id, { status: task.status })
      toast.error('Impossible de mettre à jour')
    }
  }

  async function deleteTask(task: Task) {
    removeTask(task.id)
    try {
      await tasksService.delete(task.id)
      toast.success('Tâche supprimée')
    } catch {
      toast.error('Impossible de supprimer')
    }
  }

  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Aucune tâche
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {tasks.map((task) => {
        const isDone = task.status === 'done'
        const dueDate = task.due_date ? new Date(task.due_date) : null
        const overdue = dueDate && isPast(dueDate) && !isDone
        const taskWithAssignee = task as Task & {
          assignee?: { id: string; full_name?: string; avatar_url?: string } | null
        }

        return (
          <ContextMenu key={task.id}>
            <ContextMenuTrigger>
              <div
                className={cn(
                  'flex items-center gap-3 px-6 py-3 hover:bg-muted/30 transition-colors group',
                  isDone && 'opacity-50'
                )}
              >
                <Checkbox
                  checked={isDone}
                  onCheckedChange={(checked) => toggleDone(task, checked as boolean)}
                  className="shrink-0"
                />

                <Link
                  href={`/${workspaceSlug}/tasks/${task.id}`}
                  className="flex-1 min-w-0 flex items-center gap-3"
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', PRIORITY_DOT[task.priority])} />
                  <span className={cn('text-sm truncate', isDone && 'line-through text-muted-foreground')}>
                    {task.title}
                  </span>
                </Link>

                <div className="flex items-center gap-2 shrink-0">
                  {dueDate && (
                    <span className={cn('text-xs', overdue ? 'text-red-500' : 'text-muted-foreground')}>
                      {format(dueDate, 'dd/MM')}
                    </span>
                  )}

                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                    {STATUS_FR[task.status] ?? task.status}
                  </Badge>

                  {taskWithAssignee.assignee && (
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={taskWithAssignee.assignee.avatar_url ?? undefined} />
                      <AvatarFallback className="text-[9px]">
                        {taskWithAssignee.assignee.full_name?.[0] ?? '?'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-44">
              <ContextMenuItem onClick={() => toggleDone(task, !isDone)}>
                <CheckSquare className="mr-2 h-3.5 w-3.5" />
                {isDone ? 'Marquer à faire' : 'Marquer terminé'}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => router.push(`/${workspaceSlug}/tasks/${task.id}`)}>
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                Ouvrir
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => deleteTask(task)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Supprimer
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )
      })}
    </div>
  )
}
