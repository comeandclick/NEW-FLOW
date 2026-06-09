'use client'

import { useState, useMemo } from 'react'
import { use } from 'react'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useTasks } from '@/hooks/useTasks'
import { useAuth } from '@/hooks/useAuth'
import { KanbanBoard } from '@/components/tasks/KanbanBoard'
import { TaskList } from '@/components/tasks/TaskList'
import { TaskForm } from '@/components/tasks/TaskForm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, LayoutGrid, List, Search, SlidersHorizontal, X, AlertCircle, Clock, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Task } from '@/types/database'
import { isAfter, isBefore, startOfDay, addDays } from 'date-fns'

interface Props {
  params: Promise<{ workspace: string }>
}

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-500/10 text-red-500',
  high: 'bg-orange-500/10 text-orange-500',
  medium: 'bg-yellow-500/10 text-yellow-500',
  low: 'bg-blue-400/10 text-blue-400',
}

export default function TasksPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const { tasks, byStatus, isLoading } = useTasks(currentWorkspace?.id ?? '')
  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [createOpen, setCreateOpen] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')
  const [filterDue, setFilterDue] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'updated' | 'due' | 'priority' | 'created'>('updated')

  const activeFiltersCount = [
    filterPriority !== 'all', filterStatus !== 'all',
    filterAssignee !== 'all', filterDue !== 'all', search.trim() !== '',
  ].filter(Boolean).length

  function clearFilters() {
    setSearch(''); setFilterPriority('all'); setFilterStatus('all')
    setFilterAssignee('all'); setFilterDue('all')
  }

  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

  const filteredTasks = useMemo(() => {
    let out = [...tasks]

    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(t => t.title.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q))
    }
    if (filterPriority !== 'all') out = out.filter(t => t.priority === filterPriority)
    if (filterStatus !== 'all') out = out.filter(t => t.status === filterStatus)
    if (filterAssignee === 'me') out = out.filter(t => t.assignee_id === user?.id)
    if (filterAssignee === 'unassigned') out = out.filter(t => !t.assignee_id)

    const today = startOfDay(new Date())
    if (filterDue === 'overdue') out = out.filter(t => t.due_date && isBefore(new Date(t.due_date), today) && t.status !== 'done')
    if (filterDue === 'today') out = out.filter(t => t.due_date && isBefore(new Date(t.due_date), addDays(today, 1)) && isAfter(new Date(t.due_date), today))
    if (filterDue === 'week') out = out.filter(t => t.due_date && isBefore(new Date(t.due_date), addDays(today, 7)))
    if (filterDue === 'none') out = out.filter(t => !t.due_date)

    out.sort((a, b) => {
      if (sortBy === 'priority') return (priorityOrder[a.priority ?? 'low'] ?? 3) - (priorityOrder[b.priority ?? 'low'] ?? 3)
      if (sortBy === 'due') {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1; if (!b.due_date) return -1
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      }
      if (sortBy === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

    return out
  }, [tasks, search, filterPriority, filterStatus, filterAssignee, filterDue, sortBy, user?.id])

  // Build filtered byStatus for kanban
  const filteredByStatus = useMemo(() => {
    const result: Record<string, Task[]> = { todo: [], in_progress: [], in_review: [], done: [], cancelled: [] }
    filteredTasks.forEach(t => {
      if (result[t.status]) result[t.status].push(t)
    })
    return result as typeof byStatus
  }, [filteredTasks])

  // Stats
  const total = tasks.length
  const done = tasks.filter(t => t.status === 'done').length
  const overdue = tasks.filter(t => t.due_date && isBefore(new Date(t.due_date), startOfDay(new Date())) && t.status !== 'done').length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Tâches</h1>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground">{total} tâche{total !== 1 ? 's' : ''}</span>
            {inProgress > 0 && (
              <span className="flex items-center gap-1 text-xs text-blue-400">
                <Clock className="h-3 w-3" />{inProgress} en cours
              </span>
            )}
            {done > 0 && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="h-3 w-3" />{done} terminées
              </span>
            )}
            {overdue > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" />{overdue} en retard
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm" className="h-7 gap-1 text-xs"
            onClick={() => setShowFilters(!showFilters)}
          >
            <SlidersHorizontal className="h-3 w-3" />
            Filtres
            {activeFiltersCount > 0 && (
              <Badge className="h-4 px-1 text-[9px] ml-0.5">{activeFiltersCount}</Badge>
            )}
          </Button>
          <Tabs value={view} onValueChange={(v) => setView(v as 'kanban' | 'list')}>
            <TabsList className="h-7">
              <TabsTrigger value="kanban" className="h-5 px-2 text-xs gap-1">
                <LayoutGrid className="h-3 w-3" /> Kanban
              </TabsTrigger>
              <TabsTrigger value="list" className="h-5 px-2 text-xs gap-1">
                <List className="h-3 w-3" /> Liste
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nouvelle tâche
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="px-6 py-3 border-b border-border bg-muted/20 flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Rechercher…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-7 w-44 pl-6 text-xs"
            />
          </div>

          <Select value={filterPriority} onValueChange={v => setFilterPriority(v ?? 'all')}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue placeholder="Priorité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes priorités</SelectItem>
              <SelectItem value="urgent">🔴 Urgent</SelectItem>
              <SelectItem value="high">🟠 Haute</SelectItem>
              <SelectItem value="medium">🟡 Moyenne</SelectItem>
              <SelectItem value="low">🔵 Basse</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={v => setFilterStatus(v ?? 'all')}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="todo">À faire</SelectItem>
              <SelectItem value="in_progress">En cours</SelectItem>
              <SelectItem value="in_review">En revue</SelectItem>
              <SelectItem value="done">Terminé</SelectItem>
              <SelectItem value="cancelled">Annulé</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterAssignee} onValueChange={v => setFilterAssignee(v ?? 'all')}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue placeholder="Assigné" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tout le monde</SelectItem>
              <SelectItem value="me">Moi</SelectItem>
              <SelectItem value="unassigned">Non assigné</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterDue} onValueChange={v => setFilterDue(v ?? 'all')}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue placeholder="Échéance" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes dates</SelectItem>
              <SelectItem value="overdue">En retard</SelectItem>
              <SelectItem value="today">Aujourd&apos;hui</SelectItem>
              <SelectItem value="week">Cette semaine</SelectItem>
              <SelectItem value="none">Sans date</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={v => setSortBy((v ?? 'updated') as typeof sortBy)}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue placeholder="Trier par" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Récemment modifié</SelectItem>
              <SelectItem value="created">Date de création</SelectItem>
              <SelectItem value="priority">Priorité</SelectItem>
              <SelectItem value="due">Échéance</SelectItem>
            </SelectContent>
          </Select>

          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3 w-3" /> Effacer
            </Button>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {filteredTasks.length} / {total} tâche{total !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {view === 'kanban' ? (
          <KanbanBoard byStatus={filteredByStatus} workspaceId={currentWorkspace?.id ?? ''} userId={user?.id ?? ''} />
        ) : (
          <TaskList tasks={filteredTasks} workspaceSlug={slug} />
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Nouvelle tâche</DialogTitle></DialogHeader>
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
