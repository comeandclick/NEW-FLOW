'use client'
 
import { useEffect, useRef, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { Plus, Send, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Select, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/misc'
import { Sheet } from '@/components/ui/overlay'
import { PRIORITIES, PriorityIcon, STATUSES, StatusIcon } from '@/components/common/task-ui'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import { onTaskDone } from '@/lib/task-done'
import { REPEAT_RULES, repeatOf, withRepeat, type RepeatRule } from '@/lib/recurrence'
import type { Priority, Task, TaskStatus } from '@/lib/types'

export type TaskDraft = Partial<Task> & { title: string }

export function toDateInput(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function createTask(wsId: string, userId: string, draft: TaskDraft, notify?: (id: string, title: string) => void) {
  const { data, error } = await getDb().from('tasks').insert({
    workspace_id: wsId, created_by: userId, status: 'todo', priority: 'medium', position: Date.now(), tags: [], ...draft,
  }).select().single()
  if (!error && data && draft.assignee_id && draft.assignee_id !== userId) notify?.(draft.assignee_id, draft.title)
  return { data: data as Task | null, error }
}

export function TaskPanel({ taskId, open, onClose, onChanged }: { taskId: string | null; open: boolean; onClose: () => void; onChanged: () => void }) {
  const { t, locale } = useI18n()
  const { ws, members, projects, canWrite, log, notifyUser, nameOf, profileOf } = useWorkspace()
  const { userId } = useSession()
  const [task, setTask] = useState<Task | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [tags, setTags] = useState('')
  const [comment, setComment] = useState('')
  const [sub, setSub] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dfl = locale === 'fr' ? fr : enUS

  const comments = useLive<any>('task_comments', { eq: { task_id: taskId ?? undefined }, order: ['created_at', true], enabled: !!taskId && open })
  const subs = useLive<Task>('tasks', { eq: { parent_id: taskId ?? undefined }, is: { deleted_at: null }, order: ['position', true], enabled: !!taskId && open })

  useEffect(() => {
    if (!taskId || !open) return
    let alive = true
    getDb().from('tasks').select('*').eq('id', taskId).maybeSingle().then(({ data }) => {
      if (!alive || !data) return
      const row = data as Task
      setTask(row); setTitle(row.title); setDesc(row.description ?? ''); setTags(row.tags.join(', '))
    })
    return () => { alive = false }
  }, [taskId, open])

  async function patch(p: Partial<Task>, silent = true) {
    if (!task || !canWrite) return
    const next = { ...task, ...p }
    setTask(next)
    if (p.status === 'done' && !task.completed_at) p = { ...p, completed_at: new Date().toISOString() }
    if (p.status && p.status !== 'done') p = { ...p, completed_at: null }
    const { error } = await getDb().from('tasks').update(p).eq('id', task.id)
    if (error) { toast.error(t('common.error')); return }
    if (p.assignee_id && p.assignee_id !== task.assignee_id) {
      void notifyUser(p.assignee_id, { type: 'task', title: t('tasks.assignedTitle'), body: task.title, url: `/app/${ws.slug}/tasks?open=${task.id}` })
    }
    log(p.status === 'done' ? 'task.completed' : 'task.updated', 'task', task.id, { title: task.title })
    if (p.status === 'done' && task.status !== 'done' && userId) {
      const next = await onTaskDone(ws, userId, { ...task, ...p } as Task)
      if (next) toast.success(t('tasks.nextCreated', { d: new Date(next).toLocaleDateString(locale) }))
    }
    if (!silent) toast.success(t('common.saved'))
    onChanged()
  }
  const debounced = (p: Partial<Task>) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void patch(p), 500)
  }

  async function remove() {
    if (!task) return
    await getDb().from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', task.id)
    log('task.deleted', 'task', task.id, { title: task.title })
    toast.success(t('tasks.deletedToast'))
    onChanged(); onClose()
  }
  async function addComment() {
    if (!comment.trim() || !task || !userId) return
    const text = comment.trim(); setComment('')
    await getDb().from('task_comments').insert({ workspace_id: ws.id, task_id: task.id, user_id: userId, content: text })
    if (task.assignee_id && task.assignee_id !== userId) void notifyUser(task.assignee_id, { type: 'task', title: nameOf(userId), body: text, url: `/app/${ws.slug}/tasks?open=${task.id}` })
  }
  async function addSub() {
    if (!sub.trim() || !task || !userId) return
    const title2 = sub.trim(); setSub('')
    await createTask(ws.id, userId, { title: title2, parent_id: task.id, project_id: task.project_id })
    subs.refresh()
  }
  async function toggleSub(s: Task) {
    const done = s.status === 'done'
    await getDb().from('tasks').update({ status: done ? 'todo' : 'done', completed_at: done ? null : new Date().toISOString() }).eq('id', s.id)
    subs.refresh()
  }

  const ro = !canWrite
  return (
    <Sheet open={open} onClose={onClose} side="right" className="w-[520px] max-w-full">
      {task && (
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-text-3"><StatusIcon status={task.status} />#{task.id.slice(0, 6)}</div>
            <div className="flex items-center gap-1">
              {canWrite && <Button variant="ghost" size="icon" onClick={remove} aria-label={t('common.delete')}><Trash2 className="size-4" /></Button>}
              <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close')}><X className="size-4" /></Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <input value={title} readOnly={ro} onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) debounced({ title: e.target.value.trim() }) }}
              className="w-full bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-text-3" placeholder={t('common.title')} />
            <Textarea value={desc} readOnly={ro} rows={4} placeholder={t('tasks.noDescription')} onChange={(e) => { setDesc(e.target.value); debounced({ description: e.target.value }) }} className="border-transparent bg-transparent px-0 focus:bg-surface-2/60 focus:px-3" />

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5"><span className="text-xs text-text-3">{t('common.status')}</span>
                <Select value={task.status} disabled={ro} onChange={(e) => patch({ status: e.target.value as TaskStatus })}>{STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</Select></label>
              <label className="space-y-1.5"><span className="text-xs text-text-3">{t('common.priority')}</span>
                <Select value={task.priority} disabled={ro} onChange={(e) => patch({ priority: e.target.value as Priority })}>{PRIORITIES.map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}</Select></label>
              <label className="space-y-1.5"><span className="text-xs text-text-3">{t('common.assignee')}</span>
                <Select value={task.assignee_id ?? ''} disabled={ro} onChange={(e) => patch({ assignee_id: e.target.value || null })}>
                  <option value="">{t('common.unassigned')}</option>{members.filter((m) => !(m.profile?.preferences as { bot?: boolean } | undefined)?.bot || m.user_id === task.assignee_id).map((m) => <option key={m.user_id} value={m.user_id}>{m.profile?.full_name ?? m.profile?.email}</option>)}</Select></label>
              <label className="space-y-1.5"><span className="text-xs text-text-3">{t('common.dueDate')}</span>
                <Input type="date" disabled={ro} value={toDateInput(task.due_date)} onChange={(e) => patch({ due_date: e.target.value ? new Date(`${e.target.value}T18:00:00`).toISOString() : null })} /></label>
              <label className="space-y-1.5"><span className="text-xs text-text-3">{t('common.project')}</span>
                <Select value={task.project_id ?? ''} disabled={ro} onChange={(e) => patch({ project_id: e.target.value || null })}>
                  <option value="">{t('common.none')}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
              <label className="space-y-1.5"><span className="text-xs text-text-3">{t('tasks.estimate')}</span>
                <Input type="number" min={0} step={15} disabled={ro} value={task.estimate_minutes ?? ''} onChange={(e) => patch({ estimate_minutes: e.target.value ? Number(e.target.value) : null })} /></label>
            </div>
            <label className="block space-y-1.5"><span className="text-xs text-text-3">{t('tasks.repeat')}</span>
              <Select value={repeatOf(task.tags) ?? ''} disabled={ro} onChange={(e) => { const tg = withRepeat(task.tags, (e.target.value || null) as RepeatRule | null); setTags(tg.join(', ')); void patch({ tags: tg }) }}>
                <option value="">{t('tasks.repeat.none')}</option>{REPEAT_RULES.map((r) => <option key={r} value={r}>{t(`tasks.repeat.${r}`)}</option>)}</Select></label>
            <label className="block space-y-1.5"><span className="text-xs text-text-3">{t('common.tags')} · {t('tasks.labelsHint')}</span>
              <Input value={tags} disabled={ro} onChange={(e) => { setTags(e.target.value); debounced({ tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }) }} /></label>

            {!task.parent_id && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">{t('tasks.subtasks')} <span className="font-normal text-text-3">{subs.data.filter((s) => s.status === 'done').length}/{subs.data.length}</span></h3>
                <ul className="space-y-1">{subs.data.map((s) => (
                  <li key={s.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                    <button disabled={ro} onClick={() => toggleSub(s)} aria-label={s.title}><StatusIcon status={s.status} /></button>
                    <span className={`flex-1 truncate text-[13px] ${s.status === 'done' ? 'text-text-3 line-through' : ''}`}>{s.title}</span>
                  </li>
                ))}</ul>
                {canWrite && <div className="mt-2 flex gap-2"><Input value={sub} placeholder={t('tasks.addSubtask')} onChange={(e) => setSub(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSub()} />
                  <Button size="icon" onClick={addSub} aria-label={t('common.add')}><Plus className="size-4" /></Button></div>}
              </section>
            )}

            <section>
              <h3 className="mb-3 text-sm font-semibold">{t('tasks.comments')}</h3>
              <ul className="space-y-3">{comments.data.map((c: any) => (
                <li key={c.id} className="flex gap-2.5"><Avatar name={profileOf(c.user_id)?.full_name} size={24} />
                  <div className="min-w-0 flex-1 rounded-xl bg-surface-2 px-3 py-2"><div className="flex items-baseline gap-2"><span className="text-xs font-medium">{nameOf(c.user_id)}</span>
                    <span className="text-[11px] text-text-3">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: dfl })}</span></div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-text-2">{c.content}</p></div></li>
              ))}</ul>
              {canWrite && <div className="mt-3 flex gap-2"><Input value={comment} placeholder={t('tasks.addComment')} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addComment()} />
                <Button variant="primary" size="icon" onClick={addComment} aria-label={t('tasks.send')}><Send className="size-4" /></Button></div>}
            </section>
          </div>
        </div>
      )}
    </Sheet>
  )
}
