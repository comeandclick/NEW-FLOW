'use client'
import { getDb } from '@/lib/supabase/client'
import { fireAutomations } from '@/lib/automations'
import { nextDueFor } from '@/lib/recurrence'
import type { Task } from '@/lib/types'

/** Side effects of completing a task: automations, then the next occurrence of a repeating task (returns its due date). */
export async function onTaskDone(ws: { id: string; slug: string }, userId: string, task: Task): Promise<string | null> {
  void fireAutomations(ws.id, ws.slug, 'task_done', userId, task.title)
  const due = nextDueFor(task)
  if (!due) return null
  const db = getDb()
  // Completing, reopening and completing again must not create two copies.
  const { data: dup } = await db.from('tasks').select('id').eq('workspace_id', ws.id).eq('title', task.title).eq('due_date', due).is('deleted_at', null).neq('status', 'done').limit(1)
  if (dup?.length) return due
  const { error } = await db.from('tasks').insert({
    workspace_id: ws.id, created_by: userId, title: task.title, description: task.description, status: 'todo', priority: task.priority, assignee_id: task.assignee_id,
    project_id: task.project_id, tags: task.tags, estimate_minutes: task.estimate_minutes, due_date: due, position: Date.now(),
  })
  return error ? null : due
}
