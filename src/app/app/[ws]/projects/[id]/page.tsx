'use client'
import { use, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState } from '@/components/ui/misc'
import { PriorityIcon, StatusIcon } from '@/components/common/task-ui'
import { TaskPanel } from '@/components/tasks/task-panel'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import type { Note, Task } from '@/lib/types'

export default function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useI18n()
  const router = useRouter()
  const { ws, projects, canWrite, refreshProjects, profileOf } = useWorkspace()
  const project = projects.find((p) => p.id === id)
  const tasks = useLive<Task>('tasks', { eq: { workspace_id: ws.id, project_id: id }, is: { deleted_at: null }, order: ['position', true] })
  const notes = useLive<Note>('notes', { eq: { workspace_id: ws.id, project_id: id }, is: { deleted_at: null } })
  const [open, setOpen] = useState<string | null>(null)

  if (!project) return <div className="p-10 text-center text-text-3">…</div>
  const roots = tasks.data.filter((x) => !x.parent_id)
  const done = roots.filter((x) => x.status === 'done').length

  async function remove() {
    await getDb().from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    toast.success(t('proj.deletedToast')); await refreshProjects(); router.push(`/app/${ws.slug}/projects`)
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link href={`/app/${ws.slug}/projects`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-text-3 hover:text-text"><ArrowLeft className="size-3.5" />{t('common.back')}</Link>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><span className="size-4 rounded-full" style={{ background: project.color }} /><div><h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1><p className="text-sm text-text-2">{project.description}</p></div></div>
        {canWrite && <Button variant="ghost" size="icon" onClick={remove} aria-label={t('common.delete')}><Trash2 className="size-4" /></Button>}
      </div>
      <div className="mb-6 flex items-center gap-4"><div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full" style={{ width: `${roots.length ? (done / roots.length) * 100 : 0}%`, background: project.color }} /></div><span className="text-xs tabular-nums text-text-3">{done}/{roots.length}</span></div>

      <h2 className="mb-2 text-sm font-semibold">{t('tasks.title')}</h2>
      {roots.length === 0 ? <EmptyState title={t('tasks.empty')} className="py-8" /> : (
        <ul className="mb-8 overflow-hidden rounded-xl border border-border bg-surface">{roots.map((x) => (
          <li key={x.id}><button onClick={() => setOpen(x.id)} className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left last:border-0 hover:bg-surface-2">
            <StatusIcon status={x.status} /><PriorityIcon priority={x.priority} /><span className="min-w-0 flex-1 truncate text-[13px]">{x.title}</span>
            {x.tags.slice(0, 2).map((tg) => <Badge key={tg}>{tg}</Badge>)}<span className="text-[11px] text-text-3">{profileOf(x.assignee_id)?.full_name?.split(' ')[0]}</span></button></li>))}</ul>)}

      {notes.data.length > 0 && <><h2 className="mb-2 text-sm font-semibold">{t('nav.notes')}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">{notes.data.map((n) => <li key={n.id}><Link href={`/app/${ws.slug}/notes/${n.id}`} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm hover:border-border-strong"><FileText className="size-4 text-text-3" />{n.icon} {n.title}</Link></li>)}</ul></>}
      <TaskPanel taskId={open} open={!!open} onClose={() => setOpen(null)} onChanged={tasks.refresh} />
    </div>
  )
}
