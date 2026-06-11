'use client'

import { use, useEffect, useState, useRef } from 'react'
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
import { Send, Trash2, Plus, CheckSquare, Square, Link2, ExternalLink, X } from 'lucide-react'
import Link from 'next/link'
import { BackButton } from '@/components/layout/BackButton'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import type { Task } from '@/types/database'
import { cn } from '@/lib/utils'
import { FavoriteButton } from '@/components/workspace/FavoriteButton'

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
  const tasks = useTaskStore(s => s.tasks)
  const updateTask = useTaskStore(s => s.updateTask)
  const addTask = useTaskStore(s => s.addTask)
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const comments = useTaskComments(taskId)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [newSubtask, setNewSubtask] = useState('')
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [showSubtaskInput, setShowSubtaskInput] = useState(false)
  const subtaskInputRef = useRef<HTMLInputElement>(null)

  // Subtasks: filter from store (realtime-aware)
  const subtasks = tasks.filter((t) => t.parent_task_id === taskId)

  const task = tasks.find((t) => t.id === taskId) as (Task & {
    assignee?: { id: string; full_name?: string; avatar_url?: string; email: string } | null
  }) | undefined

  useEffect(() => {
    if (!task) {
      tasksService.getById(taskId).then((t) => {
        if (t) updateTask(t.id, t)
      })
    }
    // Load subtasks from DB (not in main tasks list since they're filtered out)
    tasksService.getSubtasks(taskId).then((subs) => {
      subs.forEach((sub) => {
        if (!tasks.some((t) => t.id === sub.id)) {
          addTask(sub as Task)
        }
      })
    }).catch(() => {})
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange(value: string | null) {
    if (!task || !value) return
    const status = value as Task['status']
    updateTask(task.id, { status })
    await tasksService.update(task.id, { status })
    toast.success('Statut mis à jour')
  }

  async function handlePriorityChange(value: string | null) {
    if (!task || !value) return
    const priority = value as Task['priority']
    updateTask(task.id, { priority })
    await tasksService.update(task.id, { priority })
  }

  async function handleSubtaskToggle(subtask: Task) {
    const newStatus = subtask.status === 'done' ? 'todo' : 'done'
    updateTask(subtask.id, { status: newStatus })
    await tasksService.update(subtask.id, { status: newStatus }).catch(() => {
      updateTask(subtask.id, { status: subtask.status })
      toast.error('Erreur')
    })
  }

  async function handleAddSubtask(e: React.FormEvent) {
    e.preventDefault()
    if (!newSubtask.trim() || !currentWorkspace?.id || !user) return
    setAddingSubtask(true)
    try {
      const subtask = await tasksService.create({
        workspace_id: currentWorkspace.id,
        project_id: task?.project_id ?? null,
        parent_task_id: taskId,
        title: newSubtask.trim(),
        status: 'todo',
        priority: 'medium',
        created_by: user.id,
      })
      addTask(subtask as Task)
      setNewSubtask('')
      subtaskInputRef.current?.focus()
    } catch {
      toast.error('Impossible de créer la sous-tâche')
    } finally {
      setAddingSubtask(false)
    }
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
      <div className="max-w-3xl mx-auto p-6 space-y-6 page-enter">
        <div className="skeleton h-7 w-64" />
        <div className="flex gap-3">
          <div className="skeleton h-7 w-36" />
          <div className="skeleton h-7 w-28" />
        </div>
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-2/3" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6 page-enter">
      <div className="flex items-center gap-3">
        <BackButton label="Tâches" href={`/${slug}/tasks`} />
        <h1 className={cn('text-xl font-semibold flex-1', task.status === 'done' && 'line-through text-muted-foreground')}>
          {task.title}
        </h1>
        <FavoriteButton
          entityType="task"
          entityId={task.id}
          entityTitle={task.title}
          entityUrl={`/${slug}/tasks/${task.id}`}
        />
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

      {/* Subtasks */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium flex items-center gap-2">
            Sous-tâches
            {subtasks.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal">
                {subtasks.filter(s => s.status === 'done').length}/{subtasks.length}
              </span>
            )}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1 text-muted-foreground"
            onClick={() => {
              setShowSubtaskInput(true)
              setTimeout(() => subtaskInputRef.current?.focus(), 50)
            }}
          >
            <Plus className="h-3 w-3" />
            Ajouter
          </Button>
        </div>

        {/* Progress bar */}
        {subtasks.length > 0 && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${(subtasks.filter(s => s.status === 'done').length / subtasks.length) * 100}%`,
              }}
            />
          </div>
        )}

        {/* Subtask list */}
        {subtasks.map((sub) => (
          <div
            key={sub.id}
            className="flex items-center gap-2.5 group rounded-md px-2 py-1.5 hover:bg-muted/40 transition-colors -mx-2"
          >
            <button
              onClick={() => handleSubtaskToggle(sub)}
              className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
            >
              {sub.status === 'done'
                ? <CheckSquare className="h-4 w-4 text-primary" />
                : <Square className="h-4 w-4" />
              }
            </button>
            <span className={cn('text-sm flex-1', sub.status === 'done' && 'line-through text-muted-foreground')}>
              {sub.title}
            </span>
          </div>
        ))}

        {/* Add subtask form */}
        {showSubtaskInput && (
          <form onSubmit={handleAddSubtask} className="flex gap-2">
            <Input
              ref={subtaskInputRef}
              placeholder="Titre de la sous-tâche…"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowSubtaskInput(false)
                  setNewSubtask('')
                }
              }}
            />
            <Button
              type="submit"
              size="sm"
              className="h-8 text-xs"
              disabled={addingSubtask || !newSubtask.trim()}
            >
              {addingSubtask ? '…' : 'Ajouter'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setShowSubtaskInput(false); setNewSubtask('') }}
            >
              Annuler
            </Button>
          </form>
        )}
      </div>

      <Separator />

      {/* Task Relations */}
      <TaskRelations taskId={taskId} workspaceId={currentWorkspace?.id ?? ''} workspaceSlug={slug} />

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

// ─── Task Relations sub-component ───────────────────────────────────────────

interface TaskRelation {
  id: string
  related_type: string
  related_id: string
  label: string
  title?: string
}

function TaskRelations({ taskId, workspaceId, workspaceSlug }: {
  taskId: string; workspaceId: string; workspaceSlug: string
}) {
  const [relations, setRelations] = useState<TaskRelation[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ type: 'task', id: '', label: 'related' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    import('@/lib/supabase/client').then(({ getSupabaseClient }) => {
      getSupabaseClient()
        .from('task_relations')
        .select('id, related_type, related_id, label')
        .eq('task_id', taskId)
        .then(({ data }) => setRelations((data ?? []) as TaskRelation[]))
    })
  }, [taskId, workspaceId])

  async function addRelation(e: React.FormEvent) {
    e.preventDefault()
    if (!form.id.trim() || saving) return
    setSaving(true)
    try {
      const { getSupabaseClient } = await import('@/lib/supabase/client')
      const { data } = await getSupabaseClient()
        .from('task_relations')
        .insert({ task_id: taskId, workspace_id: workspaceId, related_type: form.type, related_id: form.id.trim(), label: form.label })
        .select().single()
      if (data) setRelations(prev => [...prev, data as TaskRelation])
      setAdding(false)
      setForm({ type: 'task', id: '', label: 'related' })
    } catch { /* ignore */ } finally { setSaving(false) }
  }

  async function removeRelation(id: string) {
    const { getSupabaseClient } = await import('@/lib/supabase/client')
    await getSupabaseClient().from('task_relations').delete().eq('id', id)
    setRelations(prev => prev.filter(r => r.id !== id))
  }

  const RELATION_TYPES = [
    { key: 'task', label: 'Tâche' },
    { key: 'note', label: 'Note' },
    { key: 'file', label: 'Fichier' },
  ]
  const LABELS = ['related', 'blocks', 'blocked_by', 'duplicates']

  function relUrl(r: TaskRelation) {
    if (r.related_type === 'task') return `/${workspaceSlug}/tasks/${r.related_id}`
    if (r.related_type === 'note') return `/${workspaceSlug}/notes/${r.related_id}`
    return `/${workspaceSlug}/files`
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Relations ({relations.length})
        </h2>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground" onClick={() => setAdding(!adding)}>
          <Plus className="h-3 w-3" /> Lier
        </Button>
      </div>

      {relations.map(r => (
        <div key={r.id} className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-muted/40 -mx-2">
          <span className="text-[10px] text-muted-foreground capitalize bg-muted px-1.5 py-0.5 rounded">{r.label}</span>
          <Link href={relUrl(r)} className="text-xs flex-1 text-primary hover:underline truncate flex items-center gap-1">
            <ExternalLink className="h-3 w-3 shrink-0" />
            {r.related_type}/{r.related_id.slice(0, 8)}…
          </Link>
          <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => removeRelation(r.id)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}

      {adding && (
        <form onSubmit={addRelation} className="flex gap-2 flex-wrap">
          <select
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            className="h-8 text-xs border border-input rounded-md px-2 bg-background"
          >
            {RELATION_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <Input
            placeholder="ID de l'élément…"
            value={form.id}
            onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
            className="h-8 text-xs flex-1 min-w-24"
          />
          <select
            value={form.label}
            onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            className="h-8 text-xs border border-input rounded-md px-2 bg-background"
          >
            {LABELS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <Button type="submit" size="sm" className="h-8 text-xs" disabled={saving}>Lier</Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAdding(false)}>Annuler</Button>
        </form>
      )}
    </div>
  )
}
