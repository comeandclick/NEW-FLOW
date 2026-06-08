import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Task, TaskComment } from '@/types/database'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type TaskStatus = Task['status']

interface TaskState {
  tasks: Task[]
  selectedTask: Task | null
  taskComments: Record<string, TaskComment[]>
  isLoading: boolean
  filters: {
    status: TaskStatus | null
    assignee: string | null
    priority: Task['priority'] | null
    projectId: string | null
  }

  setTasks: (tasks: Task[]) => void
  setSelectedTask: (task: Task | null) => void
  setTaskComments: (taskId: string, comments: TaskComment[]) => void
  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  removeTask: (id: string) => void
  addComment: (comment: TaskComment) => void
  updateComment: (id: string, updates: Partial<TaskComment>) => void
  removeComment: (id: string, taskId: string) => void
  handleRealtimeEvent: (payload: RealtimePostgresChangesPayload<Task>) => void
  setFilter: (key: keyof TaskState['filters'], value: string | null) => void
  clearFilters: () => void
  setLoading: (loading: boolean) => void
  getTasksByStatus: (status: TaskStatus) => Task[]
  getSubtasks: (parentId: string) => Task[]
}

export const useTaskStore = create<TaskState>()(
  immer((set, get) => ({
    tasks: [],
    selectedTask: null,
    taskComments: {},
    isLoading: false,
    filters: {
      status: null,
      assignee: null,
      priority: null,
      projectId: null,
    },

    setTasks: (tasks) => set((state) => { state.tasks = tasks }),

    setSelectedTask: (task) =>
      set((state) => { state.selectedTask = task }),

    setTaskComments: (taskId, comments) =>
      set((state) => { state.taskComments[taskId] = comments }),

    addTask: (task) =>
      set((state) => { state.tasks.unshift(task) }),

    updateTask: (id, updates) =>
      set((state) => {
        const idx = state.tasks.findIndex((t) => t.id === id)
        if (idx !== -1) Object.assign(state.tasks[idx], updates)
        if (state.selectedTask?.id === id)
          Object.assign(state.selectedTask, updates)
      }),

    removeTask: (id) =>
      set((state) => {
        state.tasks = state.tasks.filter((t) => t.id !== id)
        if (state.selectedTask?.id === id) state.selectedTask = null
      }),

    addComment: (comment) =>
      set((state) => {
        if (!state.taskComments[comment.task_id]) {
          state.taskComments[comment.task_id] = []
        }
        state.taskComments[comment.task_id].push(comment)
      }),

    updateComment: (id, updates) =>
      set((state) => {
        for (const taskId in state.taskComments) {
          const idx = state.taskComments[taskId].findIndex((c) => c.id === id)
          if (idx !== -1) {
            Object.assign(state.taskComments[taskId][idx], updates)
            break
          }
        }
      }),

    removeComment: (id, taskId) =>
      set((state) => {
        if (state.taskComments[taskId]) {
          state.taskComments[taskId] = state.taskComments[taskId].filter(
            (c) => c.id !== id
          )
        }
      }),

    handleRealtimeEvent: (payload) =>
      set((state) => {
        if (payload.eventType === 'INSERT') {
          const exists = state.tasks.some((t) => t.id === payload.new.id)
          if (!exists) state.tasks.unshift(payload.new as Task)
        } else if (payload.eventType === 'UPDATE') {
          const idx = state.tasks.findIndex((t) => t.id === payload.new.id)
          if (idx !== -1) Object.assign(state.tasks[idx], payload.new)
        } else if (payload.eventType === 'DELETE') {
          state.tasks = state.tasks.filter((t) => t.id !== (payload.old as Task).id)
        }
      }),

    setFilter: (key, value) =>
      set((state) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(state.filters as any)[key] = value
      }),

    clearFilters: () =>
      set((state) => {
        state.filters = { status: null, assignee: null, priority: null, projectId: null }
      }),

    setLoading: (loading) =>
      set((state) => { state.isLoading = loading }),

    getTasksByStatus: (status) =>
      get().tasks.filter((t) => t.status === status),

    getSubtasks: (parentId) =>
      get().tasks.filter((t) => t.parent_task_id === parentId),
  }))
)
