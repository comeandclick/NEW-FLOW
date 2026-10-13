'use client'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Check, ExternalLink, Film, Image as ImageIcon, Link2, Paperclip, Plus, RotateCcw, StickyNote, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge, EmptyState } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useSession } from '@/lib/hooks/use-session'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { getDb } from '@/lib/supabase/client'
import { MAX_FILE_BYTES, signedUrl, uploadToBucket } from '@/lib/storage'
import { captureLabel, cleanCaptureUrl, currentProjectOf, inferCaptureKind, MAX_CAPTURE_NOTE } from '@/lib/captures'
import { useI18n } from '@/i18n/provider'
import type { Capture, FileRow } from '@/lib/types'

const KIND_ICON: Record<Capture['kind'], typeof Link2> = { tiktok: Film, instagram: Film, youtube: Film, lien: Link2, image: ImageIcon, video: Film, texte: StickyNote }

/** Create a capture as the signed-in person: link, note and/or file. Without a project, it goes to their current project. */
export function useCreateCapture() {
  const { ws, log } = useWorkspace()
  const { userId, profile } = useSession()
  return async function create(input: { url?: string | null; note?: string | null; title?: string | null; file?: File | null; projectId?: string | null }): Promise<Capture | null> {
    if (!userId) return null
    const db = getDb()
    let fileId: string | null = null
    if (input.file) {
      const path = await uploadToBucket('files', `${ws.id}/captures`, input.file, input.file.name)
      const { data: row, error } = await db.from('files').insert({ workspace_id: ws.id, folder: '/Captures', name: input.file.name.slice(0, 200), size: input.file.size, mime_type: input.file.type || null, storage_path: path, uploaded_by: userId }).select('id').single()
      if (error || !row) throw error ?? new Error('file')
      fileId = (row as { id: string }).id
    }
    const projectId = input.projectId === undefined ? currentProjectOf(profile?.preferences, ws.id) : input.projectId
    const { data, error } = await db.from('captures').insert({
      workspace_id: ws.id, project_id: projectId || null, kind: inferCaptureKind({ url: input.url, mime: input.file?.type }),
      url: input.url || null, file_id: fileId, title: input.title?.trim().slice(0, 200) || null, note: input.note?.trim().slice(0, MAX_CAPTURE_NOTE) || null, created_by: userId,
      // written out rather than left to the table defaults: the demo client has no defaults
      status: 'nouveau', task_ids: [],
    }).select('*').single()
    if (error || !data) throw error ?? new Error('capture')
    log('capture.create', 'capture', (data as Capture).id, {})
    return data as Capture
  }
}

/** Dialog to add a capture by hand (the share sheet does the same without opening Flow). */
export function AddCapture({ projectId, onAdded }: { projectId?: string; onAdded: () => void }) {
  const { t } = useI18n()
  const { projects } = useWorkspace()
  const create = useCreateCapture()
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const link = url.trim() ? cleanCaptureUrl(url) : null
    if (url.trim() && !link) { setError(t('cap.badLink')); return }
    if (!link && !note.trim() && !file) { setError(t('cap.needOne')); return }
    if (file && file.size > MAX_FILE_BYTES) { setError(t('cap.tooBig')); return }
    setBusy(true); setError(null)
    try {
      const made = await create({ url: link, note, file, projectId })
      const name = projects.find((p) => p.id === made?.project_id)?.name
      toast.success(name ? t('cap.addedTo', { p: name }) : t('cap.added'))
      setOpen(false); setUrl(''); setNote(''); setFile(null); onAdded()
    } catch { setError(t('common.error')) }
    setBusy(false)
  }

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />{t('cap.add')}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('cap.add')} size="sm">
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('cap.link')}><Input autoFocus type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('cap.linkPh')} /></Field>
          <Field label={t('cap.note')}><Textarea rows={3} value={note} maxLength={MAX_CAPTURE_NOTE} onChange={(e) => setNote(e.target.value)} placeholder={t('cap.notePh')} /></Field>
          <Field label={t('cap.file')} hint={t('cap.fileHint')}><Input type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button type="submit" variant="primary" loading={busy}>{t('common.add')}</Button></div>
        </form>
      </Dialog>
    </>
  )
}

function Thumb({ capture, file }: { capture: Capture; file?: FileRow }) {
  const [src, setSrc] = useState('')
  const isImage = !!file?.mime_type?.startsWith('image/')
  useEffect(() => {
    let alive = true
    if (isImage && file) void signedUrl('files', file.storage_path).then((u) => { if (alive) setSrc(u) })
    return () => { alive = false }
  }, [isImage, file])
  const Icon = KIND_ICON[capture.kind] ?? Link2
  return (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-3 text-text-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="size-full object-cover" /> : <Icon className="size-5" />}
    </div>
  )
}

/** Cards of captures, newest first. `showProject` adds the project name and lets the person move a capture. */
export function CaptureList({ captures, showProject = false, empty, onChanged }: { captures: Capture[]; showProject?: boolean; empty: string; onChanged: () => void }) {
  const { t } = useI18n()
  const { ws, projects, canWrite, log } = useWorkspace()
  const fileIds = useMemo(() => [...new Set(captures.map((c) => c.file_id).filter((id): id is string => !!id))], [captures])
  const files = useLive<FileRow>('files', { eq: { workspace_id: ws.id }, in: { id: fileIds }, enabled: fileIds.length > 0, live: false })
  const fileOf = (id: string | null) => files.data.find((f) => f.id === id)

  async function patch(id: string, p: Partial<Capture>) {
    const { error } = await getDb().from('captures').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { toast.error(t('common.error')); return }
    log('capture.update', 'capture', id, {}); onChanged()
  }
  async function remove(id: string) {
    const { error } = await getDb().from('captures').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) { toast.error(t('common.error')); return }
    toast.success(t('cap.deleted')); onChanged()
  }
  async function openFile(file: FileRow) {
    const url = await signedUrl('files', file.storage_path)
    if (url) window.open(url, '_blank', 'noopener')
  }

  if (captures.length === 0) return <EmptyState title={empty} className="py-8" />
  return (
    <ul className="space-y-2.5">
      {captures.map((c) => {
        const file = fileOf(c.file_id)
        const project = projects.find((p) => p.id === c.project_id)
        return (
          <li key={c.id} className="rounded-xl border border-border bg-surface p-3.5">
            <div className="flex gap-3">
              <Thumb capture={c} file={file} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge>{t(`cap.kind.${c.kind}`)}</Badge>
                  <Badge className={c.status === 'nouveau' ? 'bg-accent-soft text-accent-ink' : undefined}>{t(`cap.status.${c.status}`)}</Badge>
                  {showProject && project && <Link href={`/app/${ws.slug}/projects/${project.id}`} className="hover:underline"><Badge color={project.color}>{project.name}</Badge></Link>}
                  {showProject && !project && <Badge>{t('cap.noProject')}</Badge>}
                </div>
                <p className="mt-1.5 truncate text-sm font-medium">{captureLabel(c)}</p>
                {c.note && c.note !== captureLabel(c) && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-text-2">{c.note}</p>}
              </div>
            </div>

            {c.status === 'vu' && (c.summary || c.knowledge) ? (
              <div className="mt-3 space-y-2 rounded-lg bg-surface-2 p-3 text-[13px]">
                {c.summary && <div><p className="text-[11px] font-medium uppercase tracking-wide text-text-3">{t('cap.summary')}</p><p className="mt-0.5 whitespace-pre-wrap text-text-2">{c.summary}</p></div>}
                {c.knowledge && <div><p className="text-[11px] font-medium uppercase tracking-wide text-text-3">{t('cap.knowledge')}</p><p className="mt-0.5 whitespace-pre-wrap text-text-2">{c.knowledge}</p></div>}
                {(c.task_ids?.length > 0 || c.obsidian_note) && (
                  <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-3">
                    {c.task_ids?.length > 0 && <Link href={`/app/${ws.slug}/tasks?open=${c.task_ids[0]}`} className="hover:underline">{t('cap.tasks', { n: c.task_ids.length })}</Link>}
                    {c.obsidian_note && <span>{t('cap.obsidian')} : {c.obsidian_note}</span>}
                  </p>
                )}
              </div>
            ) : c.status === 'nouveau' ? <p className="mt-2.5 text-xs text-text-3">{t('cap.pending')}</p> : null}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-text-2 hover:bg-surface-2 hover:text-text"><ExternalLink className="size-3.5" />{t('cap.openLink')}</a>}
              {file && <Button size="sm" variant="ghost" onClick={() => openFile(file)}><Paperclip className="size-3.5" />{t('cap.openFile')}</Button>}
              {canWrite && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => patch(c.id, { status: c.status === 'nouveau' ? 'vu' : 'nouveau', processed_at: c.status === 'nouveau' ? new Date().toISOString() : null })}>
                    {c.status === 'nouveau' ? <Check className="size-3.5" /> : <RotateCcw className="size-3.5" />}{c.status === 'nouveau' ? t('cap.markSeen') : t('cap.markNew')}
                  </Button>
                  {showProject && (
                    <Select aria-label={t('cap.move')} className="h-8 w-auto max-w-44 text-[13px]" value={c.project_id ?? ''} onChange={(e) => patch(c.id, { project_id: e.target.value || null })}>
                      <option value="">{t('cap.noProject')}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  )}
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => remove(c.id)} aria-label={`${t('common.delete')}: ${captureLabel(c)}`}><Trash2 className="size-3.5" /></Button>
                </>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
