'use client'
import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, ArrowLeft, Bookmark, FileText, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge, EmptyState } from '@/components/ui/misc'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Dialog } from '@/components/ui/overlay'
import { PROJECT_COLORS } from '../page'
import { cn } from '@/lib/utils'
import { PriorityIcon, StatusIcon } from '@/components/common/task-ui'
import { TaskPanel } from '@/components/tasks/task-panel'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import { AddCapture, CaptureList } from '@/components/captures/captures'
import { useSession } from '@/lib/hooks/use-session'
import { currentProjectOf, projectsOf, withCurrentProject } from '@/lib/captures'
import { withDescendants } from '@/lib/projects'
import type { Capture, Note, Task } from '@/lib/types'

export default function ProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t } = useI18n()
  const router = useRouter()
  const { ws, projects, canWrite, refreshProjects, profileOf } = useWorkspace()
  const project = projects.find((p) => p.id === id)
  const tasks = useLive<Task>('tasks', { eq: { workspace_id: ws.id, project_id: id }, is: { deleted_at: null }, order: ['position', true] })
  const notes = useLive<Note>('notes', { eq: { workspace_id: ws.id, project_id: id }, is: { deleted_at: null } })
  // captures du projet ET de ses sous-projets (une capture peut aller dans plusieurs projets : project_ids)
  const allCaptures = useLive<Capture>('captures', { eq: { workspace_id: ws.id }, is: { deleted_at: null }, order: ['created_at', false] })
  const captures = useMemo(() => { const inside = new Set(withDescendants(id, projects)); return { ...allCaptures, data: allCaptures.data.filter((c) => projectsOf(c).some((x) => inside.has(x))) } }, [allCaptures, id, projects])
  const { profile, updateProfile } = useSession()
  // "Current project": where captures shared without a project land for this person.
  const isCurrent = currentProjectOf(profile?.preferences, ws.id) === id
  async function toggleCurrent() {
    await updateProfile({ preferences: withCurrentProject(profile?.preferences, ws.id, isCurrent ? null : id) })
    toast.success(isCurrent ? t('cap.currentUnset') : t('cap.currentSet', { p: project?.name ?? '' }))
  }
  const [open, setOpen] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ name: string; description: string; color: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (!project) return <div className="p-10 text-center text-text-3">…</div>
  const roots = tasks.data.filter((x) => !x.parent_id)
  const done = roots.filter((x) => x.status === 'done').length

  const archived = project.status === 'archived'
  async function saveEdit() {
    if (!edit?.name.trim()) return
    await getDb().from('projects').update({ name: edit.name.trim(), description: edit.description.trim() || null, color: edit.color, updated_at: new Date().toISOString() }).eq('id', id)
    setEdit(null); await refreshProjects(); toast.success(t('common.saved'))
  }
  async function toggleArchive() {
    await getDb().from('projects').update({ status: archived ? 'active' : 'archived', updated_at: new Date().toISOString() }).eq('id', id)
    await refreshProjects(); toast.success(t('common.saved'))
  }
  async function remove() {
    await getDb().from('projects').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    toast.success(t('proj.deletedToast')); await refreshProjects(); router.push(`/app/${ws.slug}/projects`)
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link href={`/app/${ws.slug}/projects`} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-text-3 hover:text-text"><ArrowLeft className="size-3.5" />{t('common.back')}</Link>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><span className="size-4 rounded-full" style={{ background: project.color }} /><div><h1 className="text-2xl font-semibold tracking-tight">{project.name}{archived && <Badge className="ml-2 align-middle">{t('proj.archived')}</Badge>}</h1><p className="text-sm text-text-2">{project.description}</p></div></div>
        {canWrite && <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="icon" onClick={toggleCurrent} aria-pressed={isCurrent} aria-label={isCurrent ? t('cap.unsetCurrent') : t('cap.setCurrent')} title={isCurrent ? t('cap.unsetCurrent') : t('cap.setCurrent')}><Bookmark className={cn('size-4', isCurrent && 'fill-current text-accent-ink')} /></Button>
          <Button variant="ghost" size="icon" onClick={() => setEdit({ name: project.name, description: project.description ?? '', color: project.color })} aria-label={t('common.edit')}><Pencil className="size-4" /></Button>
          <Button variant="ghost" size="icon" onClick={toggleArchive} aria-label={archived ? t('proj.unarchive') : t('proj.archive')} title={archived ? t('proj.unarchive') : t('proj.archive')}>{archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}</Button>
          <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label={t('common.delete')}><Trash2 className="size-4" /></Button>
        </div>}
      </div>
      <div className="mb-6 flex items-center gap-4"><div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full" style={{ width: `${roots.length ? (done / roots.length) * 100 : 0}%`, background: project.color }} /></div><span className="text-xs tabular-nums text-text-3">{done}/{roots.length}</span></div>

      <h2 className="mb-2 text-sm font-semibold">{t('tasks.title')}</h2>
      {roots.length === 0 ? <EmptyState title={t('tasks.empty')} className="py-8" /> : (
        <ul className="mb-8 overflow-hidden rounded-xl border border-border bg-surface">{roots.map((x) => (
          <li key={x.id}><button onClick={() => setOpen(x.id)} className="flex w-full items-center gap-3 border-b border-border/60 px-4 py-2.5 text-left last:border-0 hover:bg-surface-2">
            <StatusIcon status={x.status} /><PriorityIcon priority={x.priority} /><span className="min-w-0 flex-1 truncate text-[13px]">{x.title}</span>
            {x.tags.slice(0, 2).map((tg) => <Badge key={tg}>{tg}</Badge>)}<span className="text-[11px] text-text-3">{profileOf(x.assignee_id)?.full_name?.split(' ')[0]}</span></button></li>))}</ul>)}

      {notes.data.length > 0 && <><h2 className="mb-2 text-sm font-semibold">{t('nav.notes')}</h2>
        <ul className="mb-8 grid gap-2 sm:grid-cols-2">{notes.data.map((n) => <li key={n.id}><Link href={`/app/${ws.slug}/notes/${n.id}`} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-4 py-3 text-sm hover:border-border-strong"><FileText className="size-4 text-text-3" />{n.icon} {n.title}</Link></li>)}</ul></>}

      {/* Captures: what was shared to Flow for this project (links, images, videos), sorted later by the AI */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">{t('cap.title')}<Badge>{captures.data.length}</Badge>{isCurrent && <Badge className="bg-accent-soft text-accent-ink">{t('cap.current')}</Badge>}</h2>
        {canWrite && <AddCapture projectId={id} onAdded={captures.refresh} />}
      </div>
      {isCurrent && <p className="mb-3 text-[13px] text-text-3">{t('cap.currentHint')}</p>}
      <CaptureList captures={captures.data} empty={t('cap.emptyProject')} onChanged={captures.refresh} />
      <Dialog open={!!edit} onClose={() => setEdit(null)} title={t('proj.edit')} size="sm"
        footer={<><Button onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button variant="primary" onClick={saveEdit} disabled={!edit?.name.trim()}>{t('common.save')}</Button></>}>
        {edit && <div className="space-y-4">
          <Field label={t('proj.name')}><Input autoFocus value={edit.name} maxLength={80} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label={t('common.description')}><Textarea rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
          <div><span className="mb-1.5 block text-[13px] font-medium text-text-2">{t('proj.color')}</span>
            <div className="flex flex-wrap gap-2">{PROJECT_COLORS.map((c) => <button key={c} aria-label={c} aria-pressed={edit.color === c} onClick={() => setEdit({ ...edit, color: c })} className={cn('size-6 rounded-full ring-offset-2 ring-offset-surface transition', edit.color === c && 'ring-2 ring-text')} style={{ background: c }} />)}</div></div>
        </div>}
      </Dialog>
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('proj.deleteTitle')} size="sm"
        footer={<><Button onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</Button><Button variant="danger" onClick={remove}>{t('common.delete')}</Button></>}>
        <p className="text-sm text-text-2">{t('proj.deleteWarn', { n: roots.length })}</p>
      </Dialog>
      <TaskPanel taskId={open} open={!!open} onClose={() => setOpen(null)} onChanged={tasks.refresh} />
    </div>
  )
}
