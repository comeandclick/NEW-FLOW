'use client'

import { use, useEffect, useState } from 'react'
import { tasksService } from '@/services/tasks.service'
import { useTaskStore } from '@/stores/taskStore'
import { useAuth } from '@/hooks/useAuth'
import { useTaskComments } from '@/hooks/useTasks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ArrowLeft, Send, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { Task } from '@/types/database'
import { cn } from '@/lib/utils'

interface Props {
  params: Promise<{ workspace: string; taskId: string }>
}

const PRIORITY_COLORS: Record<Task['priority'], string> = {
  urgent: 'bg-red-500/10 text-red-500',
  high: 'bg-orange-500/10 text-orange-500',
  medium: 'bg-yellow-500/10 text-yellow-500',
  low: 'bg-blue-400/10 text-blue-400',
}

export default function TaskDetailPage({ params }: Props) {
  const { workspace: slug, taskId } = use(params)
  const { user } = useAuth()
  const { tasks, updateTask, selectedTask, setSelectedTask } = useTaskStore()
  const { currentWorkspace } = useWorkspaceStore()
  const comments = useTaskComments(taskId)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const task = tasks.find((t) => t.id === taskId) as (Task & {
    assignee?: { id: string; full_name?: string; avatar_url?: string; email: string } | null
  }) | undefined

  useEffect(() => {
    if (!task) {
      tasksService.getById(taskId).then((t) => {
        if (t) updateTask(t.id, t)
      })
    }
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange(value: Task['status'] | null) {
    if (!task || !value) return
    updateTask(task.id, { status: value })
    await tasksService.update(task.id, { status: value })
    toast.success('Statut mis à jour')
  }

  async function handlePriorityChange(value: Task['priority'] | null) {
    if (!task || !value) return
    updateTask(task.id, { priority: value })
    await tasksService.update(task.id, { priority: value })
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim() || !user || !task) return
    setSubmitting(true)
    try {
      await tasksService.addComment(task.id, user.id, commentText.trim())
      setCommentText('')
      // Refetch comments
      const fresh = await tasksService.getComments(task.id)
      useTaskStore.getState().setTaskComments(task.id, fresh as never)
    } catch {
      toast.error('Impossible d\'ajouter le commentaire')
    } finally {
      setSubmitting(false)
    }
  }

  if (!task) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        Chargement…
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/${slug}/tasks`}>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className={cn('text-xl font-semibold flex-1', task.status === 'done' && 'line-through text-muted-foreground')}>
          {task.title}
        </h1>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Select value={task.status} onValueChange={handleStatusChange}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todo">À faire</SelectItem>
            <SelectItem value="in_progress">En cours</SelectItem>
            <SelectItem value="in_review">En revue</SelectItem>
            <SelectItem value="done">Terminé</SelectItem>
            <SelectItem value="cancelled">Annulé</SelectItem>
          </SelectContent>
        </Select>

        <Select value={task.priority} onValueChange={handlePriorityChange}>
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">Élevée</SelectItem>
            <SelectItem value="medium">Moyenne</SelectItem>
            <SelectItem value="low">Faible</SelectItem>
          </SelectContent>
        </Select>

        {task.due_date && (
          <Badge variant="outline" className="text-xs">
            Échéance : {format(new Date(task.due_date), 'dd/MM/yyyy')}
          </Badge>
        )}

        {task.assignee && (
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5">
              <AvatarImage src={task.assignee.avatar_url ?? undefined} />
              <AvatarFallback className="text-[9px]">{task.assignee.full_name?.[0] ?? '?'}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">{task.assignee.full_name ?? task.assignee.email}</span>
          </div>
        )}
      </div>

      {task.description && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>
      )}

      <Separator />

      {/* Comments */}
      <div className="space-y-4">
        <h2 className="text-sm font-medium">Commentaires ({comments.length})</h2>

        {comments.map((comment) => {
          const c = comment as typeof comment & { user?: { full_name?: string; avatar_url?: string; email: string } }
          return (
            <div key={comment.id} className="flex gap-3">
              <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                <AvatarImage src={c.user?.avatar_url ?? undefined} />
                <AvatarFallback className="text-[9px]">{c.user?.full_name?.[0] ?? '?'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{c.user?.full_name ?? c.user?.email}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(comment.created_at), 'MMM d, h:mm a')}
                  </span>
                </div>
                <p className="text-sm">{comment.content}</p>
              </div>
            </div>
          )
        })}

        <form onSubmit={handleAddComment} className="flex gap-2">
          <Input
            placeholder="Ajouter un commentaire…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="h-8 text-sm"
          />
          <Button type="submit" size="icon" className="h-8 w-8" disabled={submitting || !commentText.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  )
}
