'use client'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { Check, Copy, Download, ExternalLink, Film, FolderTree, Image as ImageIcon, KeyRound, Link2, Paperclip, PenLine, Play, Plus, RotateCcw, Smartphone, Sparkles, StickyNote, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Badge, EmptyState, Switch } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useLive } from '@/lib/hooks/use-live'
import { useSession } from '@/lib/hooks/use-session'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { getDb } from '@/lib/supabase/client'
import { MAX_FILE_BYTES, signedUrl, uploadToBucket } from '@/lib/storage'
import { captureLabel, cleanCaptureUrl, currentProjectOf, embedUrl, inferCaptureKind, MAX_CAPTURE_NOTE, projectsOf, type CapturePreview } from '@/lib/captures'
import { projectPath, projectTree } from '@/lib/projects'
import { cn } from '@/lib/utils'
import { isDemoBrowser } from '@/lib/demo/runtime'
import { useI18n } from '@/i18n/provider'
import type { Capture, FileRow } from '@/lib/types'

const KIND_ICON: Record<Capture['kind'], typeof Link2> = { tiktok: Film, instagram: Film, youtube: Film, lien: Link2, image: ImageIcon, video: Film, texte: StickyNote }

/** Create a capture as the signed-in person: link, note and/or file. Without a project, it goes to their current project. */
export function useCreateCapture() {
  const { ws, log } = useWorkspace()
  const { userId, profile } = useSession()
  return async function create(input: { url?: string | null; note?: string | null; title?: string | null; file?: File | null; projectId?: string | null; projectIds?: string[]; aiAnalysis?: boolean }): Promise<Capture | null> {
    if (!userId) return null
    const db = getDb()
    let fileId: string | null = null
    if (input.file) {
      const path = await uploadToBucket('files', `${ws.id}/captures`, input.file, input.file.name)
      const { data: row, error } = await db.from('files').insert({ workspace_id: ws.id, folder: '/Captures', name: input.file.name.slice(0, 200), size: input.file.size, mime_type: input.file.type || null, storage_path: path, uploaded_by: userId }).select('id').single()
      if (error || !row) throw error ?? new Error('file')
      fileId = (row as { id: string }).id
    }
    const ids = (input.projectIds ?? [input.projectId === undefined ? currentProjectOf(profile?.preferences, ws.id) : input.projectId]).filter((x): x is string => !!x)
    const { data, error } = await db.from('captures').insert({
      workspace_id: ws.id, project_id: ids[0] ?? null, project_ids: ids, kind: inferCaptureKind({ url: input.url, mime: input.file?.type }),
      url: input.url || null, file_id: fileId, title: input.title?.trim().slice(0, 200) || null, note: input.note?.trim().slice(0, MAX_CAPTURE_NOTE) || null, created_by: userId,
      // written out rather than left to the table defaults: the demo client has no defaults
      status: 'nouveau', task_ids: [], ai_analysis: !!input.aiAnalysis,
    }).select('*').single()
    if (error || !data) throw error ?? new Error('capture')
    log('capture.create', 'capture', (data as Capture).id, {})
    return data as Capture
  }
}

/**
 * « Installer sur iPhone » : 1) crée une clé API limitée aux captures (copiée tout de suite), 2) télécharge le raccourci « Flow »
 * signé (public/raccourci/Flow.shortcut, fabriqué par scripts/raccourci-iphone.py), qui demande la clé à l'installation.
 * La clé n'est jamais dans le fichier du raccourci.
 */
export function InstallShortcut() {
  const { t } = useI18n()
  const { ws, isAdmin } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  async function makeKey() {
    setBusy(true); setCopied(false)
    const made = fetch('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId: ws.id, name: t('cap.ios.keyName'), scopes: ['captures:write'], expiresInDays: null }) })
      .then(async (r) => { const j = await r.json(); if (!r.ok || typeof j.key !== 'string') throw new Error(j.error ?? 'key'); return j.key as string })
    // Safari sur iPhone n'accepte de copier que dans le geste du clic : on lui passe la promesse de la clé
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': made.then((k) => new Blob([k], { type: 'text/plain' })) })])
        setCopied(true)
      }
    } catch { /* copie refusée : bouton Copier plus bas */ }
    try { setKey(await made) } catch { toast.error(t('cap.ios.keyErr')) }
    setBusy(false)
  }
  async function copy() {
    if (!key) return
    try { await navigator.clipboard.writeText(key); setCopied(true) } catch { toast.error(t('common.error')) }
  }

  if (!isAdmin) return null
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Smartphone className="size-4" />{t('cap.ios.button')}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('cap.ios.title')} size="sm">
        <ol className="space-y-4 text-sm">
          <li className="space-y-2">
            <p><span className="font-medium">1. </span>{t('cap.ios.step1')}</p>
            {!key ? (
              <Button variant="primary" loading={busy} onClick={makeKey}><KeyRound className="size-4" />{t('cap.ios.makeKey')}</Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-accent-soft text-accent-ink"><Check className="size-3" />{copied ? t('cap.ios.copied') : t('cap.ios.made')}</Badge>
                {!copied && <Button size="sm" onClick={copy}><Copy className="size-3.5" />{t('api.copy')}</Button>}
              </div>
            )}
          </li>
          <li className="space-y-2">
            <p><span className="font-medium">2. </span>{t('cap.ios.step2')}</p>
            <a href="/raccourci/Flow.shortcut" download="Flow.shortcut" className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3.5 text-sm font-medium text-white aria-disabled:opacity-50" aria-disabled={!key}>
              <Download className="size-4" />{t('cap.ios.install')}
            </a>
            <p className="text-[13px] text-text-3">{t('cap.ios.step2Hint')}</p>
          </li>
          <li><p><span className="font-medium">3. </span>{t('cap.ios.step3')}</p></li>
        </ol>
      </Dialog>
    </>
  )
}

/** Dialog to add a capture by hand (the share sheet does the same without opening Flow). */
export function AddCapture({ projectId, onAdded }: { projectId?: string; onAdded: () => void }) {
  const { t } = useI18n()
  const { ws, projects } = useWorkspace()
  const { profile } = useSession()
  const create = useCreateCapture()
  const startIds = () => { const id = projectId ?? currentProjectOf(profile?.preferences, ws.id); return id ? [id] : [] }
  const [ids, setIds] = useState<string[]>(startIds)
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [ai, setAi] = useState(false)
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
      const made = await create({ url: link, note, file, projectIds: ids, aiAnalysis: ai })
      const name = made?.project_id ? projectPath(made.project_id, projects) : ''
      toast.success(name ? t('cap.addedTo', { p: name }) : t('cap.added'))
      setOpen(false); setUrl(''); setNote(''); setFile(null); setAi(false); setIds(startIds()); onAdded()
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
          <Field label={t('cap.projects')}><ProjectPicker value={ids} onChange={setIds} /></Field>
          <label className="flex items-start gap-3 rounded-lg bg-surface-2 p-3 text-sm">
            <Switch checked={ai} onChange={setAi} label={t('cap.ai')} />
            <span><span className="font-medium">{t('cap.ai')}</span><span className="block text-[13px] text-text-3">{t('cap.aiHint')}</span></span>
          </label>
          {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button type="submit" variant="primary" loading={busy}>{t('common.add')}</Button></div>
        </form>
      </Dialog>
    </>
  )
}

/** Choix de plusieurs projets (arbre « Kalimat › Kalimat 2.0 »). */
export function ProjectPicker({ value, onChange, compact = false }: { value: string[]; onChange: (ids: string[]) => void; compact?: boolean }) {
  const { t } = useI18n()
  const { projects } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<string[]>(value)
  const label = value.length === 0 ? t('cap.noProject') : value.length === 1 ? projectPath(value[0], projects) : t('cap.nProjects', { n: value.length })
  return (
    <>
      <Button type="button" size="sm" variant={compact ? 'ghost' : 'secondary'} className={cn('max-w-full justify-start', !compact && 'w-full')} onClick={() => { setPick(value); setOpen(true) }}>
        <FolderTree className="size-3.5 shrink-0" /><span className="truncate">{label}</span>
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('cap.projects')} description={t('cap.projectsHint')} size="sm"
        footer={<div className="flex justify-end gap-2"><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" onClick={() => { onChange(pick); setOpen(false) }}>{t('common.save')}</Button></div>}>
        <ul className="max-h-[55vh] space-y-0.5 overflow-y-auto">
          {projectTree(projects).map(({ project: p, depth }) => {
            const on = pick.includes(p.id)
            return (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm hover:bg-surface-2" style={{ paddingLeft: 8 + depth * 18 }}>
                  <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={on} onChange={() => setPick((cur) => (on ? cur.filter((x) => x !== p.id) : [...cur, p.id]))} />
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color }} /><span className={cn('truncate', depth === 0 && 'font-medium')}>{p.name}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </Dialog>
    </>
  )
}

const BRAND: Record<string, string> = { tiktok: 'bg-[#121212]', instagram: 'bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af]', youtube: 'bg-[#b8261f]' }

/** Aperçu de la capture : miniature TikTok / Insta / YouTube lue sur place, vidéo jouée dans la page (jamais en plein écran forcé), image. */
function Media({ capture, file }: { capture: Capture; file?: FileRow }) {
  const { t } = useI18n()
  const [play, setPlay] = useState(false)
  const social = ['tiktok', 'instagram', 'youtube'].includes(capture.kind) && !!capture.url
  const stored = capture.preview as CapturePreview | null
  const [prev, setPrev] = useState<CapturePreview | null>(stored ? { ...stored, thumbnail: stored.thumbnail ? `/api/captures/thumb?id=${capture.id}` : null } : null)
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    // mode démo : pas de session côté serveur pour chercher l'aperçu
    if (!social || prev || isDemoBrowser()) return
    let alive = true
    fetch(`/api/captures/preview?id=${capture.id}`).then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive && j?.preview) setPrev(j.preview) }).catch(() => {})
    return () => { alive = false }
  }, [capture.id, social, prev])
  const [src, setSrc] = useState('')
  const isImage = !!file?.mime_type?.startsWith('image/'), isVideo = !!file?.mime_type?.startsWith('video/')
  useEffect(() => {
    let alive = true
    if ((isImage || isVideo) && file) void signedUrl('files', file.storage_path).then((u) => { if (alive) setSrc(u) })
    return () => { alive = false }
  }, [isImage, isVideo, file])

  if (social) {
    const embed = prev?.embed ?? embedUrl(capture.kind, capture.url)
    const tall = capture.kind !== 'youtube'
    const box = tall ? 'aspect-[9/16] w-full max-w-[300px]' : 'aspect-video w-full max-w-[520px]'
    if (play && embed) return (
      <div className={cn('overflow-hidden rounded-xl bg-black', box)}>
        <iframe src={embed} title={prev?.title ?? captureLabel(capture)} className="size-full border-0" allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    )
    return (
      <div className="space-y-1.5">
        <button type="button" onClick={() => setPlay(true)} disabled={!embed} aria-label={`${t('cap.play')} : ${prev?.title ?? captureLabel(capture)}`}
          className={cn('group relative block overflow-hidden rounded-xl', tall ? 'aspect-[9/16] w-36 sm:w-40' : 'aspect-video w-full max-w-[300px]', BRAND[capture.kind])}>
          {prev?.thumbnail && !broken
            ? <img src={prev.thumbnail} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" /> // eslint-disable-line @next/next/no-img-element
            : <span className="flex size-full items-center justify-center px-2 text-center text-sm font-semibold text-white">{t(`cap.kind.${capture.kind}`)}</span>}
          {embed && <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/30">
            <span className="flex size-12 items-center justify-center rounded-full bg-white/90 text-black shadow-lg"><Play className="ml-0.5 size-5 fill-current" /></span>
          </span>}
        </button>
        {(prev?.title || prev?.author) && <p className="line-clamp-2 max-w-[300px] text-xs text-text-3">{prev?.author && <span className="font-medium text-text-2">{prev.author}</span>}{prev?.author && prev?.title ? ' · ' : ''}{prev?.title}</p>}
      </div>
    )
  }
  if (isVideo) {
    if (play && src) return <video src={src} controls playsInline autoPlay className="max-h-[480px] w-full max-w-[340px] rounded-xl bg-black" />
    return (
      <button type="button" onClick={() => setPlay(true)} disabled={!src} aria-label={t('cap.play')} className="group relative flex aspect-[9/16] w-36 items-center justify-center overflow-hidden rounded-xl bg-[#121212] sm:w-40">
        {src && <video src={`${src}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />}
        <span className="relative flex size-12 items-center justify-center rounded-full bg-white/90 text-black shadow-lg"><Play className="ml-0.5 size-5 fill-current" /></span>
      </button>
    )
  }
  if (isImage) return src
    ? <a href={src} target="_blank" rel="noopener noreferrer" aria-label={`${t('cap.openFile')} : ${captureLabel(capture)}`} className="block w-fit"><img src={src} alt="" className="max-h-80 w-auto max-w-full rounded-xl bg-surface-3 object-contain" /></a> // eslint-disable-line @next/next/no-img-element
    : <div className="skeleton h-40 w-40" />
  return null
}

function Thumb({ capture }: { capture: Capture }) {
  const Icon = KIND_ICON[capture.kind] ?? Link2
  return <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-3"><Icon className="size-5" /></div>
}

/** Note de la capture, modifiable après l'envoi : l'IA la lit (et relit la capture si elle était déjà analysée). */
function NoteEditor({ capture, canWrite, onSave }: { capture: Capture; canWrite: boolean; onSave: (note: string) => Promise<void> }) {
  const { t } = useI18n()
  const [edit, setEdit] = useState(false)
  const [value, setValue] = useState(capture.note ?? '')
  const [busy, setBusy] = useState(false)
  const shown = capture.note && capture.note !== captureLabel(capture) ? capture.note : ''
  if (!edit) return (
    <div className="mt-1.5">
      {shown && <p className="whitespace-pre-wrap text-[13px] text-text-2">{shown}</p>}
      {canWrite && <button type="button" onClick={() => { setValue(capture.note ?? ''); setEdit(true) }} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-text-3 hover:text-text"><PenLine className="size-3" />{capture.note ? t('cap.editNote') : t('cap.addNote')}</button>}
    </div>
  )
  return (
    <div className="mt-2 space-y-2">
      <Textarea autoFocus rows={3} value={value} maxLength={MAX_CAPTURE_NOTE} onChange={(e) => setValue(e.target.value)} placeholder={t('cap.notePh')} />
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={() => setEdit(false)}>{t('common.cancel')}</Button>
        <Button size="sm" variant="primary" loading={busy} onClick={async () => { setBusy(true); await onSave(value.trim()); setBusy(false); setEdit(false) }}>{t('common.save')}</Button>
      </div>
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
        const ids = projectsOf(c)
        const media = ['tiktok', 'instagram', 'youtube'].includes(c.kind) || !!file?.mime_type?.match(/^(image|video)\//)
        return (
          <li key={c.id} className="rounded-xl border border-border bg-surface p-3.5">
            <div className="flex gap-3">
              {!media && <Thumb capture={c} />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge>{t(`cap.kind.${c.kind}`)}</Badge>
                  <Badge className={c.status === 'nouveau' ? 'bg-accent-soft text-accent-ink' : undefined}>{t(`cap.status.${c.status}`)}</Badge>
                  {c.ai_analysis && c.status === 'nouveau' && <Badge className="bg-accent-soft text-accent-ink"><Sparkles className="size-3" />{t('cap.aiBadge')}</Badge>}
                  {showProject && ids.map((id) => { const p = projects.find((x) => x.id === id); return p ? <Link key={id} href={`/app/${ws.slug}/projects/${id}`} className="hover:underline"><Badge color={p.color}>{projectPath(id, projects)}</Badge></Link> : null })}
                  {showProject && ids.length === 0 && <Badge>{t('cap.noProject')}</Badge>}
                </div>
                <p className="mt-1.5 truncate text-sm font-medium">{captureLabel(c)}</p>
                <NoteEditor capture={c} canWrite={canWrite} onSave={async (note) => {
                  // note ajoutée après l'analyse : l'IA relira la capture avec cette note
                  const relire = c.ai_analysis && c.status === 'vu' && note !== (c.note ?? '')
                  await patch(c.id, { note: note || null, ...(relire ? { status: 'nouveau' as const, processed_at: null } : {}) })
                  if (relire) toast.success(t('cap.noteReread'))
                }} />
              </div>
            </div>
            {media && <div className="mt-3"><Media capture={c} file={file} /></div>}

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
            ) : c.status === 'nouveau' ? <p className="mt-2.5 text-xs text-text-3">{c.ai_analysis ? t('cap.pending') : t('cap.aiOff')}</p> : null}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-text-2 hover:bg-surface-2 hover:text-text"><ExternalLink className="size-3.5" />{t('cap.openLink')}</a>}
              {file && <Button size="sm" variant="ghost" onClick={() => openFile(file)}><Paperclip className="size-3.5" />{t('cap.openFile')}</Button>}
              {canWrite && (
                <>
                  {c.status === 'nouveau' && (
                    <label className="mr-1 inline-flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-text-2">
                      <Switch checked={!!c.ai_analysis} onChange={(v) => patch(c.id, { ai_analysis: v })} label={`${t('cap.ai')} : ${captureLabel(c)}`} />{t('cap.ai')}
                    </label>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => patch(c.id, { status: c.status === 'nouveau' ? 'vu' : 'nouveau', processed_at: c.status === 'nouveau' ? new Date().toISOString() : null })}>
                    {c.status === 'nouveau' ? <Check className="size-3.5" /> : <RotateCcw className="size-3.5" />}{c.status === 'nouveau' ? t('cap.markSeen') : t('cap.markNew')}
                  </Button>
                  <ProjectPicker compact value={ids} onChange={(next) => patch(c.id, { project_ids: next, project_id: next[0] ?? null })} />
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
