'use client'

import { useState } from 'react'
import { use } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useTasks } from '@/hooks/useTasks'
import { useAuth } from '@/hooks/useAuth'
import { KanbanBoard } from '@/components/tasks/KanbanBoard'
import { TaskList } from '@/components/tasks/TaskList'
import { TaskForm } from '@/components/tasks/TaskForm'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, LayoutGrid, List } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props {
  params: Promise<{ workspace: string }>
}

export default function TasksPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const { user } = useAuth()
  const { currentWorkspace } = useWorkspaceStore()
  const { tasks, byStatus, isLoading } = useTasks(currentWorkspace?.id ?? '')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold">Tasks</h1>
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => setView(v as 'kanban' | 'list')}>
            <TabsList className="h-7">
              <TabsTrigger value="kanban" className="h-5 px-2 text-xs gap-1">
                <LayoutGrid className="h-3 w-3" /> Kanban
              </TabsTrigger>
              <TabsTrigger value="list" className="h-5 px-2 text-xs gap-1">
                <List className="h-3 w-3" /> List
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New task
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === 'kanban' ? (
          <KanbanBoard byStatus={byStatus} workspaceId={currentWorkspace?.id ?? ''} userId={user?.id ?? ''} />
        ) : (
          <TaskList tasks={tasks} workspaceSlug={slug} />
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
          </DialogHeader>
          <TaskForm
            workspaceId={currentWorkspace?.id ?? ''}
            userId={user?.id ?? ''}
            onSuccess={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
