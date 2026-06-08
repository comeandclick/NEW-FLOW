'use client'

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { tasksService } from '@/services/tasks.service'
import { useTaskStore } from '@/stores/taskStore'
import { TaskCard } from './TaskCard'
import { TaskForm } from './TaskForm'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Task } from '@/types/database'

type ColumnId = Task['status']

const COLUMNS: { id: ColumnId; label: string; color: string }[] = [
  { id: 'todo', label: 'À faire', color: 'text-slate-400' },
  { id: 'in_progress', label: 'En cours', color: 'text-blue-400' },
  { id: 'in_review', label: 'En revue', color: 'text-purple-400' },
  { id: 'done', label: 'Terminé', color: 'text-green-400' },
]

interface ByStatus {
  todo: Task[]
  in_progress: Task[]
  in_review: Task[]
  done: Task[]
  cancelled: Task[]
}

function SortableTaskCard({ task, workspaceId }: { task: Task; workspaceId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} workspaceId={workspaceId} />
    </div>
  )
}

interface KanbanBoardProps {
  byStatus: ByStatus
  workspaceId: string
  userId: string
}

export function KanbanBoard({ byStatus, workspaceId, userId }: KanbanBoardProps) {
  const { updateTask } = useTaskStore()
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [addingToColumn, setAddingToColumn] = useState<ColumnId | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const onDragStart = useCallback((event: DragStartEvent) => {
    const task = Object.values(byStatus)
      .flat()
      .find((t) => t.id === event.active.id)
    setActiveTask(task ?? null)
  }, [byStatus])

  const onDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)
    if (!over) return

    const taskId = active.id as string
    const overId = over.id as string

    // Check if dropped onto a column
    const newStatus = COLUMNS.find((c) => c.id === overId)?.id
    if (newStatus) {
      const task = Object.values(byStatus).flat().find((t) => t.id === taskId)
      if (task && task.status !== newStatus) {
        updateTask(taskId, { status: newStatus })
        await tasksService.update(taskId, { status: newStatus })
      }
    }
  }, [byStatus, updateTask])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 h-full overflow-x-auto p-4">
        {COLUMNS.map((column) => {
          const tasks = byStatus[column.id] ?? []
          return (
            <div
              key={column.id}
              id={column.id}
              className="flex flex-col w-72 shrink-0 rounded-lg bg-muted/30 border border-border"
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                <div className="flex items-center gap-2">
                  <span className={cn('text-xs font-semibold uppercase tracking-wider', column.color)}>
                    {column.label}
                  </span>
                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                    {tasks.length}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => setAddingToColumn(column.id === addingToColumn ? null : column.id)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {addingToColumn === column.id && (
                <div className="p-3 border-b border-border bg-background/50">
                  <TaskForm
                    workspaceId={workspaceId}
                    userId={userId}
                    onSuccess={() => setAddingToColumn(null)}
                    onCancel={() => setAddingToColumn(null)}
                  />
                </div>
              )}

              <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {tasks.map((task) => (
                    <SortableTaskCard key={task.id} task={task} workspaceId={workspaceId} />
                  ))}
                  {tasks.length === 0 && (
                    <div className="text-center py-8 text-xs text-muted-foreground">
                      No tasks
                    </div>
                  )}
                </div>
              </SortableContext>
            </div>
          )
        })}
      </div>

      <DragOverlay>
        {activeTask && <TaskCard task={activeTask} workspaceId={workspaceId} isDragging />}
      </DragOverlay>
    </DndContext>
  )
}
