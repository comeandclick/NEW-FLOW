'use client'

import { useEffect, useMemo } from 'react'
import { useTaskStore } from '@/stores/taskStore'
import { tasksService } from '@/services/tasks.service'

export function useTasks(workspaceId: string, projectId?: string) {
  const tasks = useTaskStore(s => s.tasks)
  const filters = useTaskStore(s => s.filters)
  const isLoading = useTaskStore(s => s.isLoading)
  const setTasks = useTaskStore(s => s.setTasks)
  const setLoading = useTaskStore(s => s.setLoading)

  useEffect(() => {
    if (!workspaceId) return
    setLoading(true)
    tasksService
      .getByWorkspace(workspaceId, projectId)
      .then((data) => setTasks(data as never))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [workspaceId, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let result = tasks
    if (filters.status) result = result.filter((t) => t.status === filters.status)
    if (filters.assignee) result = result.filter((t) => t.assignee_id === filters.assignee)
    if (filters.priority) result = result.filter((t) => t.priority === filters.priority)
    if (filters.projectId) result = result.filter((t) => t.project_id === filters.projectId)
    return result
  }, [tasks, filters])

  const byStatus = useMemo(() => ({
    todo: filtered.filter((t) => t.status === 'todo'),
    in_progress: filtered.filter((t) => t.status === 'in_progress'),
    in_review: filtered.filter((t) => t.status === 'in_review'),
    done: filtered.filter((t) => t.status === 'done'),
    cancelled: filtered.filter((t) => t.status === 'cancelled'),
  }), [filtered])

  return { tasks: filtered, byStatus, isLoading }
}

export function useTaskComments(taskId: string) {
  const taskComments = useTaskStore(s => s.taskComments)
  const setTaskComments = useTaskStore(s => s.setTaskComments)

  useEffect(() => {
    if (!taskId) return
    tasksService
      .getComments(taskId)
      .then((data) => setTaskComments(taskId, data as never))
      .catch(console.error)
  }, [taskId]) // eslint-disable-line react-hooks/exhaustive-deps

  return taskComments[taskId] ?? []
}
