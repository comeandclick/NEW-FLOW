'use client'
/**
 * Espace partagé avec un client : vidéos et fichiers, liste à faire, discussion.
 * Même composant pour l'équipe (/app/<ws>/clients/<id>) et pour le client (/c/<jeton>) :
 * seules les actions passées en props changent (le client ne coche pas la liste, l'équipe ne valide pas une vidéo).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { formatDistanceToNow, format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { AlertTriangle, CalendarPlus, Check, CheckCircle2, Clock, Download, FileText, MessageSquare, Paperclip, Plus, Send, Square, Trash2, Upload, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Badge, Card, EmptyState, Tabs } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlay'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import { getSeen, groupFiles, isImageMime, isVideo, MAX_CLIENT_FILE_BYTES, MAX_CLIENT_MESSAGE, freeSlots, monthSummary, nextVersion, planDates, setSeen, titleFromName, type ClientCadence, type ClientFile, type ClientFileStatus, type ClientMessage, type ClientTodo } from '@/lib/clients'

export type SpaceProps = {
  viewer: 'team' | 'client'
  clientId: string
  cadence: ClientCadence
  perPeriod: number | null
  /** Nom de l'espace de l'équipe (vu par le client) */
  workspaceName: string
  messages: ClientMessage[]
  files: ClientFile[]
  todos: ClientTodo[]
  /** Nom affiché d'un auteur de message */
  authorName: (m: ClientMessage) => string
  send: (body: string, fileId?: string | null) => Promise<void>
  upload: (file: File, title: string, version: number, onProgress?: (ratio: number) => void) => Promise<void>
  /** Équipe seulement : retirer une version envoyée par erreur */
  removeFile?: (f: ClientFile) => Promise<void>
  urlOf: (f: ClientFile) => Promise<string | null>
  /** Client seulement : valider ou demander une modification */
  review?: (f: ClientFile, status: Extract<ClientFileStatus, 'validee' | 'modif'>, note?: string) => Promise<void>
  /** Équipe seulement : tenir la liste à faire */
  todo?: { add: (title: string, due: string | null) => Promise<void>; toggle: (t: ClientTodo) => Promise<void>; remove: (t: ClientTodo) => Promise<void> }
}

type Section = 'files' | 'todo' | 'chat'

const STATUS_COLOR: Record<ClientFileStatus, string> = { livree: '#6366f1', modif: '#f59e0b', validee: '#22c55e', recu: '#94a3b8' }

/** Date de la visite précédente : ce qui est plus récent et vient de l'autre côté est marqué « Nouveau ». */
function usePreviousVisit(clientId: string, viewer: SpaceProps['viewer']) {
  const [prev, setPrev] = useState<string | null>(null)
  useEffect(() => {
    setPrev(getSeen(clientId, viewer) ?? new Date().toISOString())
    const save = () => setSeen(clientId, viewer)
    const id = setTimeout(save, 4000)
    window.addEventListener('pagehide', save)
    return () => { clearTimeout(id); window.removeEventListener('pagehide', save); save() }
  }, [clientId, viewer])
  return prev
}

export function ClientSpace(p: SpaceProps) {
  const { t } = useI18n()
  const [section, setSection] = useState<Section>('files')
  const prev = usePreviousVisit(p.clientId, p.viewer)
  const openTodos = p.todos.filter((x) => !x.done && !x.deleted_at).length
  const fresh = (at: string, by: 'team' | 'client') => !!prev && by !== p.viewer && at > prev
  const newMessages = p.messages.filter((m) => !m.deleted_at && fresh(m.created_at, m.author_kind)).length
  const newFiles = p.files.filter((f) => !f.deleted_at && fresh(f.created_at, f.uploaded_by_kind)).length
  const q = { ...p, fresh }
  return (
    <div className="space-y-4">
      <Summary {...q} />
      <Tabs<Section> className="lg:hidden" value={section} onChange={setSection} items={[
        { value: 'files', label: newFiles ? `${t('cli.tab.filesShort')} (${newFiles})` : t('cli.tab.filesShort'), icon: <Video className="size-3.5" /> },
        { value: 'todo', label: openTodos ? `${t('cli.tab.todo')} (${openTodos})` : t('cli.tab.todo'), icon: <Check className="size-3.5" /> },
        { value: 'chat', label: newMessages ? `${t('cli.tab.chat')} (${newMessages})` : t('cli.tab.chat'), icon: <MessageSquare className="size-3.5" /> },
      ]} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div className={cn(section !== 'files' && 'max-lg:hidden')}><FilesBlock {...q} /></div>
          <div className={cn(section !== 'todo' && 'max-lg:hidden')}><TodoBlock {...q} /></div>
        </div>
        <div className={cn('min-w-0', section !== 'chat' && 'max-lg:hidden')}><ChatBlock {...q} /></div>
      </div>
    </div>
  )
}

const sizeLabel = (b: number) => b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} Ko` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`

type Inner = SpaceProps & { fresh: (at: string, by: 'team' | 'client') => boolean }

const NewDot = () => {
  const { t } = useI18n()
  return <span className="rounded-full bg-accent px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent-text">{t('cli.new.badge')}</span>
}

/** Bandeau du haut : où en est le mois, ce qui attend, la prochaine échéance. */
function Summary(p: Inner) {
  const { t } = useI18n()
  const dfl = useDateLocale()
  const s = useMemo(() => monthSummary({ cadence: p.cadence, per_period: p.perPeriod }, p.files, p.todos), [p.cadence, p.perPeriod, p.files, p.todos])
  // avec un rythme prévu, la barre « Ce mois-ci » (plus bas) remplace cette pastille
  const items: { icon: React.ReactNode; text: string; tone?: 'warn' | 'accent' }[] = s.planned ? [] : [
    { icon: <Video className="size-3.5" />, text: t('cli.sum.monthFree', { n: s.delivered }) },
  ]
  if (s.toReview) items.push({ icon: <Clock className="size-3.5" />, text: t('cli.toReview', { n: s.toReview }), tone: 'accent' })
  if (s.changes) items.push({ icon: <AlertTriangle className="size-3.5" />, text: t('cli.sum.changes', { n: s.changes }), tone: 'warn' })
  if (s.next) items.push({ icon: <Check className="size-3.5" />, text: t('cli.sum.next', { t: s.next.title, d: format(new Date(`${s.next.due_date}T12:00:00`), 'EEEE d MMM', { locale: dfl }) }) })
  if (s.late && p.viewer === 'team') items.push({ icon: <AlertTriangle className="size-3.5" />, text: t('cli.sum.late', { n: s.late }), tone: 'warn' })
  // barre d'avancement du mois (vidéos livrées sur le rythme prévu), visible par l'équipe et par le client
  const pct = s.planned ? Math.min(100, Math.round((s.delivered / s.planned) * 100)) : null
  return (
    <div className="space-y-2.5">
    {pct !== null && (
      <div className="rounded-xl border border-border bg-surface p-3.5 shadow-sm">
        <div className="flex items-baseline justify-between text-[12.5px]"><span className="font-medium">Ce mois-ci</span><span className="tabular-nums text-text-3">{s.delivered} / {s.planned} vidéo(s) · {pct} %</span></div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-text/10"><div className={cn('h-full rounded-full transition-[width] duration-700', pct >= 100 ? 'bg-success' : 'bg-text')} style={{ width: `${pct}%` }} /></div>
      </div>
    )}
    <ul className="flex flex-wrap gap-2" aria-label={t('cli.sum.label')}>
      {items.map((it, i) => (
        <li key={i} className={cn('inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px]',
          it.tone === 'warn' ? 'border-warning/40 bg-warning/10 text-text' : it.tone === 'accent' ? 'border-accent/40 bg-accent-soft text-text' : 'border-border bg-surface text-text-2')}>
          <span className="shrink-0">{it.icon}</span><span className="truncate first-letter:uppercase">{it.text}</span>
        </li>
      ))}
    </ul>
    </div>
  )
}

function useDateLocale() {
  const { locale } = useI18n()
  return locale === 'fr' ? fr : enUS
}

/* ───────────── Vidéos et fichiers ───────────── */

function FilesBlock(p: Inner) {
  const { t } = useI18n()
  const groups = useMemo(() => groupFiles(p.files), [p.files])
  const [sending, setSending] = useState(false)
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('cli.tab.files')}</h2>
        <Button size="sm" variant={p.viewer === 'team' ? 'primary' : 'outline'} onClick={() => setSending(true)}>
          <Upload className="size-3.5" />{p.viewer === 'team' ? t('cli.files.sendVideo') : t('cli.files.sendFile')}
        </Button>
      </div>
      {groups.length === 0
        ? <EmptyState icon={<Video className="size-5" />} title={t('cli.files.empty')} />
        : <ul className="grid gap-3 sm:grid-cols-2">{groups.map((g) => <li key={g.title} className="min-w-0"><FileGroup {...p} versions={g.versions} /></li>)}</ul>}
      <UploadDialog {...p} open={sending} onClose={() => setSending(false)} />
    </Card>
  )
}

function FileGroup(p: Inner & { versions: ClientFile[] }) {
  const { t } = useI18n()
  const dfl = useDateLocale()
  const [selId, setSelId] = useState(p.versions[0].id)
  const f = p.versions.find((v) => v.id === selId) ?? p.versions[0]
  const latest = f.id === p.versions[0].id
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const canReview = p.viewer === 'client' && !!p.review && latest && f.uploaded_by_kind === 'team' && f.status !== 'validee'
  async function approve() {
    if (!p.review) return
    setBusy(true)
    try { await p.review(f, 'validee'); toast.success(t('cli.validated')) } catch { toast.error(t('common.error')) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold">{f.title}</h3>
        {p.versions.some((v) => p.fresh(v.created_at, v.uploaded_by_kind)) && <NewDot />}
        <Badge color={STATUS_COLOR[f.status]}>{t(`cli.st.${f.status}`)}</Badge>
      </div>
      {p.versions.length > 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label={t('cli.files.versions')}>
          {p.versions.map((v) => (
            <button key={v.id} type="button" onClick={() => setSelId(v.id)} aria-pressed={v.id === f.id}
              className={cn('rounded-md px-2 py-0.5 text-[12px] font-medium tabular-nums transition-colors', v.id === f.id ? 'bg-accent text-accent-text' : 'bg-surface-3 text-text-2 hover:text-text')}>
              V{v.version}
            </button>
          ))}
        </div>
      )}
      <div className="mt-3"><Preview {...p} file={f} /></div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-3">
        <span>V{f.version} · {formatDistanceToNow(new Date(f.created_at), { addSuffix: true, locale: dfl })}</span>
        {f.size ? <span>{sizeLabel(f.size)}</span> : null}
        {f.uploaded_by_kind === 'client' && <span>{t('cli.files.fromClient')}</span>}
        <DownloadLink {...p} file={f} />
        {p.removeFile && <RemoveFile {...p} file={f} />}
      </div>
      {canReview && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" loading={busy} onClick={approve}><CheckCircle2 className="size-3.5" />{t('cli.validate')}</Button>
          <Button size="sm" variant="outline" onClick={() => setAsking(true)}>{t('cli.askChange')}</Button>
        </div>
      )}
      <AskChangeDialog {...p} file={f} open={asking} onClose={() => setAsking(false)} />
    </div>
  )
}

function RemoveFile(p: Inner & { file: ClientFile }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  async function go() {
    if (!p.removeFile) return
    setBusy(true)
    try { await p.removeFile(p.file); toast.success(t('cli.files.removed')); setOpen(false) } catch { toast.error(t('common.error')) } finally { setBusy(false) }
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 hover:text-danger"><Trash2 className="size-3" />{t('cli.files.remove')}</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('cli.files.remove')} description={`${p.file.title} · V${p.file.version}`}
        footer={<><Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button variant="danger" loading={busy} onClick={() => void go()}>{t('cli.files.remove')}</Button></>}>
        <p className="text-sm text-text-2">{t('cli.files.removeConfirm')}</p>
      </Dialog>
    </>
  )
}

function useFileUrl(urlOf: SpaceProps['urlOf'], f: ClientFile) {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    setUrl(undefined)
    urlOf(f).then((u) => { if (alive) setUrl(u) }).catch(() => { if (alive) setUrl(null) })
    return () => { alive = false }
  }, [urlOf, f])
  return url
}

function Preview(p: SpaceProps & { file: ClientFile }) {
  const { t } = useI18n()
  const url = useFileUrl(p.urlOf, p.file)
  if (url === undefined) return <div className="skeleton h-48 w-36 rounded-lg" />
  if (url && isVideo(p.file.mime_type)) {
    // eslint-disable-next-line jsx-a11y/media-has-caption -- vidéos courtes livrées au client, sous-titres incrustés
    return <video key={url} src={`${url}#t=1`} controls playsInline preload="metadata" aria-label={p.file.title} className="max-h-[420px] w-full max-w-[260px] rounded-lg bg-black" />
  }
  // eslint-disable-next-line @next/next/no-img-element
  if (url && isImageMime(p.file.mime_type)) return <img src={url} alt={p.file.title} className="max-h-56 w-auto max-w-full rounded-lg bg-surface-3 object-contain" />
  return (
    <div className="flex h-24 w-full max-w-[260px] items-center gap-3 rounded-lg border border-dashed border-border px-3 text-[13px] text-text-3">
      {isVideo(p.file.mime_type) ? <Video className="size-5 shrink-0" /> : <FileText className="size-5 shrink-0" />}
      <span className="min-w-0 truncate">{url === null && isVideo(p.file.mime_type) ? t('cli.files.noPreview') : p.file.name}</span>
    </div>
  )
}

function DownloadLink(p: SpaceProps & { file: ClientFile }) {
  const { t } = useI18n()
  const url = useFileUrl(p.urlOf, p.file)
  if (!url) return null
  return <a href={url} download={p.file.name} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent-ink hover:underline"><Download className="size-3" />{t('cli.files.download')}</a>
}

function AskChangeDialog(p: SpaceProps & { file: ClientFile; open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!p.review || !note.trim()) return
    setBusy(true)
    try { await p.review(p.file, 'modif', note.trim()); toast.success(t('cli.changeAsked')); setNote(''); p.onClose() } catch { toast.error(t('common.error')) } finally { setBusy(false) }
  }
  return (
    <Dialog open={p.open} onClose={p.onClose} title={t('cli.askChangeTitle')} description={`${p.file.title} · V${p.file.version}`}>
      <form onSubmit={submit} className="space-y-3">
        <Textarea autoFocus rows={5} maxLength={MAX_CLIENT_MESSAGE} value={note} onChange={(e) => setNote(e.target.value)} aria-label={t('cli.askChangeTitle')} placeholder={t('cli.askChangeHint')} />
        <div className="flex justify-end gap-2"><Button onClick={p.onClose}>{t('common.cancel')}</Button><Button type="submit" variant="primary" loading={busy} disabled={!note.trim()}><Send className="size-3.5" />{t('cli.chat.send')}</Button></div>
      </form>
    </Dialog>
  )
}

function UploadDialog(p: Inner & { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const titles = useMemo(() => [...new Set(p.files.filter((f) => !f.deleted_at && f.uploaded_by_kind === 'team').map((f) => f.title))], [p.files])
  const version = title.trim() ? nextVersion(p.files, title) : 1
  function pick(f: File | undefined) {
    if (!f) return
    if (f.size > MAX_CLIENT_FILE_BYTES) { toast.error(t('cli.files.tooBig')); return }
    setFile(f)
    if (!title.trim()) setTitle(titleFromName(f.name))
  }
  function close() { if (busy) return; setFile(null); setTitle(''); setProgress(0); p.onClose() }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!file) return
    setBusy(true)
    setProgress(0)
    try { await p.upload(file, title.trim() || titleFromName(file.name), version, setProgress); setBusy(false); toast.success(t('cli.files.sent')); setFile(null); setTitle(''); setProgress(0); p.onClose() }
    catch { setBusy(false); toast.error(t('cli.files.failed')) }
  }
  return (
    <Dialog open={p.open} onClose={close} title={p.viewer === 'team' ? t('cli.files.sendVideo') : t('cli.files.sendFile')}>
      <form onSubmit={submit} className="space-y-3">
        <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden accept={p.viewer === 'team' ? 'video/*,image/*,application/pdf' : undefined} onChange={(e) => pick(e.target.files?.[0])} />
        <button type="button" onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]) }}
          className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-text-2 transition-colors hover:border-accent hover:text-text">
          <Paperclip className="size-5" />{file ? <span className="max-w-full truncate font-medium text-text">{file.name}</span> : t('cli.files.choose')}
        </button>
        {p.viewer === 'team' && (
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium text-text-2">{t('cli.files.title')}{title.trim() && <span className="ml-2 text-text-3">V{version}</span>}</span>
            <Input value={title} maxLength={120} list="client-file-titles" onChange={(e) => setTitle(e.target.value)} />
            <datalist id="client-file-titles">{titles.map((x) => <option key={x} value={x} />)}</datalist>
            <span className="block text-[12px] text-text-3">{t('cli.files.titleHint')}</span>
          </label>
        )}
        {busy && (
          <div className="space-y-1" role="status">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <p className="text-right text-[12px] tabular-nums text-text-3">{t('cli.files.sending')} {Math.round(progress * 100)} %</p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={close} disabled={busy}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!file}><Upload className="size-3.5" />{busy ? t('cli.files.sending') : t('cli.chat.send')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

/* ───────────── À faire ───────────── */

function TodoBlock(p: Inner) {
  const { t } = useI18n()
  const dfl = useDateLocale()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const list = useMemo(() => p.todos.filter((x) => !x.deleted_at).sort((a, b) =>
    Number(a.done) - Number(b.done) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.position - b.position), [p.todos])
  const remaining = list.filter((x) => !x.done).length
  const [planning, setPlanning] = useState(false)
  // « Planifier 4 semaines » : une ligne par vidéo prévue, selon le rythme, sans doublon de date
  async function plan() {
    if (!p.todo) return
    const dates = freeSlots({ cadence: p.cadence, per_period: p.perPeriod }, planDates({ cadence: p.cadence, per_period: p.perPeriod }, new Date()), list.filter((x) => !x.done).map((x) => x.due_date))
    if (!dates.length) { toast.message(t('cli.plan.none')); return }
    setPlanning(true)
    try { for (const d of dates) await p.todo.add(t('cli.plan.item', { d: format(new Date(`${d}T12:00:00`), 'EEEE d MMM', { locale: dfl }) }), d); toast.success(t('cli.plan.done', { n: dates.length })) }
    catch { toast.error(t('common.error')) } finally { setPlanning(false) }
  }
  async function add(e: FormEvent) {
    e.preventDefault()
    if (!p.todo || !title.trim()) return
    try { await p.todo.add(title.trim(), due || null); setTitle(''); setDue('') } catch { toast.error(t('common.error')) }
  }
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('cli.tab.todo')}</h2>
        <div className="flex items-center gap-2">
          {remaining > 0 && <span className="text-[12px] text-text-3">{t('cli.todo.remaining', { n: remaining })}</span>}
          {p.todo && p.cadence !== 'on_demand' && <Button size="xs" variant="ghost" loading={planning} onClick={() => void plan()}><CalendarPlus className="size-3.5" />{t('cli.plan.button')}</Button>}
        </div>
      </div>
      {p.todo && (
        <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
          <Input className="min-w-0 flex-1 basis-48" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t('cli.todo.add')} aria-label={t('cli.todo.add')} />
          <Input type="date" className="w-auto" value={due} onChange={(e) => setDue(e.target.value)} aria-label={t('cli.todo.due')} />
          <Button type="submit" variant="primary" size="icon" disabled={!title.trim()} aria-label={t('cli.todo.add')}><Plus className="size-4" /></Button>
        </form>
      )}
      {list.length === 0
        ? <p className="py-4 text-center text-[13px] text-text-3">{t('cli.todo.empty')}</p>
        : (
          <ul className="divide-y divide-border/60">
            {list.map((x) => (
              <li key={x.id} className="flex items-center gap-2.5 py-2">
                {p.todo
                  ? <button type="button" role="checkbox" aria-checked={x.done} aria-label={x.title} onClick={() => void p.todo?.toggle(x)} className="shrink-0 text-text-3 hover:text-accent">{x.done ? <CheckCircle2 className="size-4 text-success" /> : <Square className="size-4" />}</button>
                  : <span className="shrink-0">{x.done ? <><CheckCircle2 className="size-4 text-success" aria-hidden /><span className="sr-only">{t('cli.todo.done')}</span></> : <Square className="size-4 text-text-3" aria-hidden />}</span>}
                <span className={cn('min-w-0 flex-1 text-[13px]', x.done && 'text-text-3 line-through')}>{x.title}</span>
                {x.due_date && <span className="shrink-0 text-[12px] tabular-nums text-text-3">{format(new Date(`${x.due_date}T12:00:00`), 'd MMM', { locale: dfl })}</span>}
                {p.todo && <button type="button" onClick={() => void p.todo?.remove(x)} aria-label={`${t('common.delete')} : ${x.title}`} className="shrink-0 rounded p-0.5 text-text-3 hover:text-danger"><X className="size-3.5" /></button>}
              </li>
            ))}
          </ul>
        )}
      {!p.todo && <p className="mt-2 text-[12px] text-text-3">{t('cli.todo.readonly', { w: p.workspaceName })}</p>}
    </Card>
  )
}

/* ───────────── Discussion ───────────── */

function ChatBlock(p: Inner) {
  const { t } = useI18n()
  const dfl = useDateLocale()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const list = useMemo(() => p.messages.filter((m) => !m.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at)), [p.messages])
  const fileOf = useMemo(() => new Map(p.files.map((f) => [f.id, f])), [p.files])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [list.length])
  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const text = body.trim()
    if (!text || busy) return
    setBusy(true)
    try { await p.send(text); setBody('') } catch { toast.error(t('common.error')) } finally { setBusy(false) }
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit() }
  }
  return (
    <Card className="flex flex-col p-4 lg:sticky lg:top-4 lg:h-[calc(100dvh-8rem)]">
      <h2 className="mb-3 text-sm font-semibold">{t('cli.tab.chat')}</h2>
      <div className="-mx-1 min-h-48 flex-1 space-y-3 overflow-y-auto px-1 max-lg:max-h-[60dvh]" role="log" aria-live="polite" aria-label={t('cli.tab.chat')} tabIndex={0}>
        {list.length === 0 && <p className="py-8 text-center text-[13px] text-text-3">{t('cli.chat.empty')}</p>}
        {list.map((m) => {
          const mine = m.author_kind === p.viewer
          const about = m.file_id ? fileOf.get(m.file_id) : undefined
          return (
            <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
              <span className="mb-0.5 flex items-center gap-1.5 text-[11px] text-text-3">{p.fresh(m.created_at, m.author_kind) && <NewDot />}{mine ? t('cli.chat.you') : p.authorName(m)} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: dfl })}</span>
              <div className={cn('max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[13px] leading-relaxed', mine ? 'rounded-br-md bg-accent text-accent-text' : 'rounded-bl-md bg-surface-3 text-text')}>
                {about && <span className={cn('mb-1 block text-[11px] font-medium', mine ? 'text-accent-text' : 'text-text-2')}>{t('cli.chat.about', { t: about.title, v: about.version })}</span>}
                {m.body}
              </div>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="mt-3 flex items-end gap-2">
        <Textarea rows={2} className="min-h-0 flex-1 resize-none" maxLength={MAX_CLIENT_MESSAGE} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={onKey} placeholder={t('cli.chat.placeholder')} aria-label={t('cli.chat.placeholder')} />
        <Button type="submit" variant="primary" size="icon" loading={busy} disabled={!body.trim()} aria-label={t('cli.chat.send')}><Send className="size-4" /></Button>
      </form>
    </Card>
  )
}
