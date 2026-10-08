'use client'
import { HubTabs } from '@/components/shell/hub-tabs'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { format, isPast, isToday } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { motion } from 'framer-motion'
import { CheckSquare, ChevronDown, Columns3, List, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton, Tabs } from '@/components/ui/misc'
import { PriorityIcon, STATUSES, StatusIcon } from '@/components/common/task-ui'
import { TaskPanel, createTask } from '@/components/tasks/task-panel'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { fireAutomations } from '@/lib/automations'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { Task, TaskStatus } from '@/lib/types'

function TaskMeta({ task, compact }: { task: Task; compact?: boolean }) {
  const { locale } = useI18n()
  const { profileOf, projects } = useWorkspace()
  const dfl = locale === 'fr' ? fr : enUS
  const project = projects.find((p) => p.id === task.project_id)
  const overdue = task.due_date && task.status !== 'done' && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date))
  return (
    <>
      {!compact && task.tags.slice(0, 2).map((tg) => <Badge key={tg} className="hidden sm:inline-flex">{tg}</Badge>)}
      {project && !compact && <Badge color={project.color} className="hidden md:inline-flex">{project.name}</Badge>}
      {task.due_date && <span className={cn('shrink-0 text-xs tabular-nums', overdue ? 'text-danger' : 'text-text-3')}>{format(new Date(task.due_date), 'd MMM', { locale: dfl })}</span>}
      {task.assignee_id && <Avatar name={profileOf(task.assignee_id)?.full_name} src={profileOf(task.assignee_id)?.avatar_url} size={20} />}
    </>
  )
}

function Card({ task, onOpen, dragging }: { task: Task; onOpen: () => void; dragging?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } })
  const { projects } = useWorkspace()
  const project = projects.find((p) => p.id === task.project_id)
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={cn('cursor-grab touch-manipulation space-y-2.5 rounded-xl border border-border bg-surface p-3 text-left shadow-sm transition-shadow hover:border-border-strong hover:shadow-md active:cursor-grabbing', (isDragging || dragging) && 'opacity-40')}>
      <div className="flex items-start gap-2"><PriorityIcon priority={task.priority} className="mt-0.5" /><span className="text-[13px] leading-snug">{task.title}</span></div>
      <div className="flex flex-wrap items-center gap-1.5">
        {project && <Badge color={project.color}>{project.name}</Badge>}
        {task.tags.slice(0, 2).map((tg) => <Badge key={tg}>{tg}</Badge>)}
        <span className="flex-1" /><TaskMeta task={task} compact />
      </div>
    </div>
  )
}

function Column({ status, tasks, onOpen, onAdd, canWrite }: { status: TaskStatus; tasks: Task[]; onOpen: (id: string) => void; onAdd: (s: TaskStatus) => void; canWrite: boolean }) {
  const t = useI18n().t
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div ref={setNodeRef} className={cn('flex w-[280px] shrink-0 flex-col rounded-2xl border bg-surface-2/50 transition-colors', isOver ? 'border-accent/60 bg-accent-soft/40' : 'border-border')}>
      <div className="flex items-center gap-2 px-3 py-2.5"><StatusIcon status={status} /><span className="text-[13px] font-medium">{t(`status.${status}`)}</span><span className="text-xs text-text-3">{tasks.length}</span>
        <span className="flex-1" />{canWrite && <button onClick={() => onAdd(status)} className="rounded-md p-1 text-text-3 hover:bg-surface-3 hover:text-text" aria-label={t('common.add')}><Plus className="size-3.5" /></button>}</div>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {tasks.map((task) => <Card key={task.id} task={task} onOpen={() => onOpen(task.id)} />)}
      </div>
    </div>
  )
}

function TasksPage() {
  const { t } = useI18n()
  const router = useRouter()
  const params = useSearchParams()
  const { ws, projects, canWrite, log, notifyUser } = useWorkspace()
  const { userId } = useSession()
  const [view, setView] = useState<'list' | 'board'>('list')
  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const [project, setProject] = useState('')
  const [q, setQ] = useState('')
  const [quick, setQuick] = useState('')
  const [quickStatus, setQuickStatus] = useState<TaskStatus>('todo')
  const [openId, setOpenId] = useState<string | null>(params.get('open'))
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ done: true, cancelled: true })
  const [dragging, setDragging] = useState<Task | null>(null)

  const { data, setData, loading, refresh } = useLive<Task>('tasks', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['position', true] })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }))

  useEffect(() => { try { const v = localStorage.getItem('flow_tasks_view'); if (v === 'board' || v === 'list') setView(v) } catch {} }, [])
  useEffect(() => { if (params.get('new') === '1') { document.getElementById('quick-add')?.focus(); router.replace(`/app/${ws.slug}/tasks`) } }, [params, router, ws.slug])
  useEffect(() => { const o = params.get('open'); if (o) setOpenId(o) }, [params])

  const filtered = useMemo(() => data.filter((x) => !x.parent_id
    && (scope === 'all' || x.assignee_id === userId) && (!project || x.project_id === project)
    && (!q.trim() || x.title.toLowerCase().includes(q.trim().toLowerCase()))), [data, scope, project, q, userId])
  const byStatus = useMemo(() => {
    const m = Object.fromEntries(STATUSES.map((s) => [s, [] as Task[]])) as Record<TaskStatus, Task[]>
    for (const x of filtered) m[x.status].push(x)
    return m
  }, [filtered])

  async function add(status: TaskStatus = quickStatus, title = quick) {
    if (!title.trim() || !userId) return
    const { data: row, error } = await createTask(ws.id, userId, { title: title.trim(), status, project_id: project || null, assignee_id: scope === 'mine' ? userId : null },
      (id, ttl) => void notifyUser(id, { type: 'task', title: t('tasks.assignedTitle'), body: ttl, url: `/app/${ws.slug}/tasks` }))
    if (error) { toast.error(t('common.error')); return }
    log('task.created', 'task', row!.id, { title: row!.title })
    void fireAutomations(ws.id, ws.slug, 'task_created', userId, row!.title)
    setQuick(''); refresh()
  }

  async function onDragEnd(e: DragEndEvent) {
    setDragging(null)
    const target = e.over?.id as TaskStatus | undefined
    const task = e.active.data.current?.task as Task | undefined
    if (!target || !task || task.status === target || !canWrite) return
    const patch = { status: target, completed_at: target === 'done' ? new Date().toISOString() : null, position: Date.now() }
    setData((d) => d.map((x) => (x.id === task.id ? { ...x, ...patch } : x)))
    const { error } = await getDb().from('tasks').update(patch).eq('id', task.id)
    if (error) { toast.error(t('common.error')); refresh(); return }
    log(target === 'done' ? 'task.completed' : 'task.updated', 'task', task.id, { title: task.title })
    if (target === 'done' && userId) void fireAutomations(ws.id, ws.slug, 'task_done', userId, task.title)
    toast.success(t('tasks.moved'))
  }

  const open = (id: string) => { setOpenId(id); router.replace(`/app/${ws.slug}/tasks?open=${id}`, { scroll: false }) }
  const close = () => { setOpenId(null); router.replace(`/app/${ws.slug}/tasks`, { scroll: false }) }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-4 sm:px-6">
        <HubTabs hub="tasks" />
        <PageHeader title={t('tasks.title')} subtitle={t('tasks.subtitle', { n: filtered.length })} icon={<CheckSquare className="size-[18px]" />}
          actions={<Tabs value={view} onChange={(v) => { setView(v); try { localStorage.setItem('flow_tasks_view', v) } catch {} }}
            items={[{ value: 'list', label: t('tasks.view.list'), icon: <List className="size-3.5" /> }, { value: 'board', label: t('tasks.view.board'), icon: <Columns3 className="size-3.5" /> }]} />} />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-text-3" /><Input className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('tasks.search')} /></div>
          <Tabs value={scope} onChange={setScope} items={[{ value: 'all', label: t('tasks.filter.all') }, { value: 'mine', label: t('tasks.filter.mine') }]} />
          <Select className="w-auto max-w-44" value={project} onChange={(e) => setProject(e.target.value)} aria-label={t('common.project')}>
            <option value="">{t('tasks.filter.anyProject')}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
        </div>
        {canWrite && (
          <form onSubmit={(e) => { e.preventDefault(); void add() }} className="mb-4 flex gap-2">
            <Input id="quick-add" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder={t('tasks.quickAdd')} />
            <Select className="hidden w-36 sm:block" value={quickStatus} onChange={(e) => setQuickStatus(e.target.value as TaskStatus)} aria-label={t('common.status')}>{STATUSES.slice(0, 4).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select>
            <Button type="submit" variant="primary" disabled={!quick.trim()} aria-label={t('common.add')}><Plus className="size-4" /><span className="hidden sm:inline">{t('common.add')}</span></Button>
          </form>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-8 sm:px-6">
        {loading ? <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11" />)}</div>
          : filtered.length === 0 ? <EmptyState icon={<CheckSquare className="size-5" />} title={t('tasks.empty')} hint={t('tasks.emptyHint')} />
          : view === 'list' ? (
            <div className="space-y-4">
              {STATUSES.filter((s) => byStatus[s].length > 0).map((s) => (
                <section key={s}>
                  <button onClick={() => setCollapsed((c) => ({ ...c, [s]: !c[s] }))} className="mb-1.5 flex w-full items-center gap-2 text-left text-[13px] font-medium">
                    <ChevronDown className={cn('size-3.5 text-text-3 transition-transform', collapsed[s] && '-rotate-90')} /><StatusIcon status={s} />{t(`status.${s}`)}<span className="text-xs font-normal text-text-3">{byStatus[s].length}</span>
                  </button>
                  {!collapsed[s] && (
                    <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="overflow-hidden rounded-xl border border-border bg-surface">
                      {byStatus[s].map((task) => (
                        <li key={task.id}>
                          <button onClick={() => open(task.id)} className="flex w-full items-center gap-3 border-b border-border/60 px-3.5 py-2.5 text-left last:border-0 hover:bg-surface-2">
                            <StatusIcon status={task.status} /><PriorityIcon priority={task.priority} />
                            <span className={cn('min-w-0 flex-1 truncate text-[13px]', task.status === 'done' && 'text-text-3 line-through')}>{task.title}</span>
                            <TaskMeta task={task} />
                          </button>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setDragging((e.active.data.current?.task as Task) ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
              <div className="flex h-full min-h-[420px] gap-3 pb-2">
                {STATUSES.filter((s) => s !== 'cancelled').map((s) => <Column key={s} status={s} tasks={byStatus[s]} onOpen={open} onAdd={(st) => { setQuickStatus(st); document.getElementById('quick-add')?.focus() }} canWrite={canWrite} />)}
              </div>
              <DragOverlay>{dragging && <div className="w-[264px] rotate-2 rounded-xl border border-accent bg-surface p-3 text-[13px] shadow-lg">{dragging.title}</div>}</DragOverlay>
            </DndContext>
          )}
      </div>
      <TaskPanel taskId={openId} open={!!openId} onClose={close} onChanged={refresh} />
    </div>
  )
}

export default function Page() { return <Suspense><TasksPage /></Suspense> }
