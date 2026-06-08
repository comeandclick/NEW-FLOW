'use client'

import { useState } from 'react'
import { tasksService } from '@/services/tasks.service'
import { useTaskStore } from '@/stores/taskStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { Task } from '@/types/database'

interface TaskFormProps {
  workspaceId: string
  userId: string
  projectId?: string
  parentTaskId?: string
  onSuccess: (task?: Task) => void
  onCancel?: () => void
}

export function TaskForm({ workspaceId, userId, projectId, parentTaskId, onSuccess, onCancel }: TaskFormProps) {
  const { addTask } = useTaskStore()
  const { projects, currentWorkspaceMembers } = useWorkspaceStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Task['priority']>('medium')
  const [status, setStatus] = useState<Task['status']>('todo')
  const [assigneeId, setAssigneeId] = useState<string>('')
  const [dueDate, setDueDate] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    try {
      const task = await tasksService.create({
        workspace_id: workspaceId,
        title: title.trim(),
        description: description || null,
        priority,
        status,
        assignee_id: assigneeId || null,
        created_by: userId,
        due_date: dueDate || null,
        project_id: selectedProjectId || null,
        parent_task_id: parentTaskId ?? null,
      })
      addTask(task)
      toast.success('Task created')
      onSuccess(task)
    } catch (err) {
      toast.error('Failed to create task')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Optional description…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as Task['priority'])}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="urgent">🔴 Urgent</SelectItem>
              <SelectItem value="high">🟠 High</SelectItem>
              <SelectItem value="medium">🟡 Medium</SelectItem>
              <SelectItem value="low">🔵 Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as Task['status'])}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todo">To do</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="in_review">In review</SelectItem>
              <SelectItem value="done">Done</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Assignee</Label>
          <Select value={assigneeId} onValueChange={(v) => setAssigneeId(v ?? '')}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Unassigned</SelectItem>
              {currentWorkspaceMembers.map((m) => {
                const member = m as { user_id: string; profile?: { full_name?: string; email: string } }
                return (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.profile?.full_name ?? member.profile?.email ?? member.user_id}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="due">Due date</Label>
          <Input
            id="due"
            type="date"
            className="h-8 text-sm"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>

      {projects.length > 0 && !projectId && (
        <div className="space-y-2">
          <Label>Project</Label>
          <Select value={selectedProjectId} onValueChange={(v) => setSelectedProjectId(v ?? '')}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="No project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No project</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={loading || !title.trim()}>
          {loading ? 'Creating…' : 'Create task'}
        </Button>
      </div>
    </form>
  )
}
