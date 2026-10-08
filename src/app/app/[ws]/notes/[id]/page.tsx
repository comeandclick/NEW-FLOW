'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { ArrowLeft, Check, History, Link2, Pin, PinOff, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge, Skeleton } from '@/components/ui/misc'
import { Dialog, Menu } from '@/components/ui/overlay'
import { RichEditor } from '@/components/notes/editor'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import type { Favorite, Note } from '@/lib/types'

const EMOJIS = ['📄', '📌', '💡', '🚀', '✅', '📅', '🧠', '📝', '🎯', '📚', '🔥', '⭐', '🧩', '💬', '🛠️', '📈', '🎨', '🔒', '🌍', '❤️']

export default function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const router = useRouter()
  const { ws, canWrite, log } = useWorkspace()
  const { userId } = useSession()
  const [note, setNote] = useState<Note | null>(null)
  const [missing, setMissing] = useState(false)
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [words, setWords] = useState(0)
  const [history, setHistory] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [resetKey, setResetKey] = useState('0')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<Partial<Note>>({})
  const url = `/app/${ws.slug}/notes/${id}`

  const favs = useLive<Favorite>('favorites', { eq: { user_id: userId ?? undefined, entity_id: id }, enabled: !!userId })
  const versions = useLive<any>('note_versions', { eq: { note_id: id }, order: ['created_at', false], limit: 30, enabled: history, live: false })

  useEffect(() => {
    let alive = true
    getDb().from('notes').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (!alive) return
      if (!data || (data as Note).deleted_at) { setMissing(true); return }
      const n = data as Note
      setNote(n); setTitle(n.title)
      setWords(JSON.stringify(n.content).match(/"text":"([^"]*)"/g)?.join(' ').split(/\s+/).filter(Boolean).length ?? 0)
    })
    return () => { alive = false }
  }, [id])

  const flush = useCallback(async () => {
    if (!Object.keys(pending.current).length) return
    const patch = pending.current
    pending.current = {}
    setStatus('saving')
    const { error } = await getDb().from('notes').update(patch).eq('id', id)
    if (error) { toast.error(t('common.error')); setStatus('idle'); return }
    setStatus('saved')
  }, [id, t])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); void flush() }, [flush])

  const queue = (patch: Partial<Note>, delay = 700) => {
    pending.current = { ...pending.current, ...patch }
    setStatus('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), delay)
  }
  const instant = async (patch: Partial<Note>) => { setNote((n) => (n ? { ...n, ...patch } : n)); pending.current = { ...pending.current, ...patch }; await flush() }

  async function toggleFav() {
    if (!note || !userId) return
    if (favs.data[0]) await getDb().from('favorites').delete().eq('id', favs.data[0].id)
    else await getDb().from('favorites').insert({ user_id: userId, workspace_id: ws.id, entity_type: 'note', entity_id: id, title: note.title || t('notes.untitled'), url })
    favs.refresh()
  }
  async function saveVersion() {
    if (!note) return
    await flush()
    const { data } = await getDb().from('notes').select('content,title').eq('id', id).single()
    await getDb().from('note_versions').insert({ workspace_id: ws.id, note_id: id, title: (data as any)?.title, content: (data as any)?.content, saved_by: userId })
    toast.success(t('notes.versionSaved')); versions.refresh()
  }
  async function restore(v: any) {
    await instant({ content: v.content, title: v.title ?? note?.title ?? '' })
    setTitle(v.title ?? ''); setNote((n) => (n ? { ...n, content: v.content } : n)); setResetKey(String(Date.now())); setHistory(false)
    toast.success(t('common.restored'))
  }
  async function remove() {
    await getDb().from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    log('note.deleted', 'note', id, { title: note?.title })
    toast.success(t('notes.deletedToast'))
    router.push(`/app/${ws.slug}/notes`)
  }
  async function addTag() {
    const v = tagInput.trim().toLowerCase(); setTagInput('')
    if (!v || !note || note.tags.includes(v)) return
    await instant({ tags: [...note.tags, v] })
  }

  if (missing) return <div className="p-10 text-center text-text-3"><p>404</p><Link href={`/app/${ws.slug}/notes`} className="mt-3 inline-block text-accent hover:underline">{t('common.back')}</Link></div>
  if (!note) return <div className="mx-auto max-w-3xl space-y-4 p-8"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64" /></div>

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
      <div className="mb-6 flex items-center justify-between gap-2">
        <Link href={`/app/${ws.slug}/${note.kind === 'note' ? 'notes' : 'docs'}`} className="inline-flex items-center gap-1.5 text-[13px] text-text-3 hover:text-text"><ArrowLeft className="size-3.5" />{t('common.back')}</Link>
        <div className="flex items-center gap-1">
          <span className="mr-2 flex items-center gap-1 text-xs text-text-3" aria-live="polite">{status === 'saving' ? t('notes.saving') : status === 'saved' ? <><Check className="size-3 text-success" />{t('common.saved')}</> : t('notes.words', { n: words })}</span>
          <Button variant="ghost" size="icon" onClick={toggleFav} aria-label={favs.data[0] ? t('notes.unfavorite') : t('notes.favorite')}><Star className={`size-4 ${favs.data[0] ? 'fill-warning text-warning' : ''}`} /></Button>
          {canWrite && <Button variant="ghost" size="icon" onClick={() => instant({ is_pinned: !note.is_pinned })} aria-label={note.is_pinned ? t('notes.unpin') : t('notes.pin')}>{note.is_pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}</Button>}
          <Button variant="ghost" size="icon" onClick={() => { void navigator.clipboard.writeText(window.location.origin + url); toast.success(t('common.copied')) }} aria-label={t('notes.copyLink')}><Link2 className="size-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setHistory(true)} aria-label={t('notes.history')}><History className="size-4" /></Button>
          {canWrite && <Button variant="ghost" size="icon" onClick={remove} aria-label={t('common.delete')}><Trash2 className="size-4" /></Button>}
        </div>
      </div>

      <div className="mb-2 flex items-center gap-3">
        <Menu width={232} trigger={({ toggle }) => <button disabled={!canWrite} onClick={toggle} className="flex size-12 items-center justify-center rounded-xl text-3xl transition-colors hover:bg-surface-2" aria-label="Icon">{note.icon ?? '📄'}</button>}>
          {(close) => <div className="grid grid-cols-5 gap-1 p-1">{EMOJIS.map((e) => <button key={e} onClick={() => { void instant({ icon: e }); close() }} className="flex size-9 items-center justify-center rounded-lg text-xl hover:bg-surface-2">{e}</button>)}</div>}
        </Menu>
        <input value={title} readOnly={!canWrite} onChange={(e) => { setTitle(e.target.value); queue({ title: e.target.value }) }} placeholder={t('notes.untitled')}
          className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-text-3" />
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-1.5 pl-1">
        {note.tags.map((x) => <Badge key={x} className="gap-1">{x}{canWrite && <button className="text-text-3 hover:text-danger" aria-label={`${t('common.delete')} ${x}`} onClick={() => instant({ tags: note.tags.filter((y) => y !== x) })}>×</button>}</Badge>)}
        {canWrite && <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} placeholder={t('notes.tag')} className="h-6 w-32 bg-transparent text-xs outline-none placeholder:text-text-3" />}
        <span className="text-[11px] text-text-3">· {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true, locale: dfl })}</span>
      </div>

      <RichEditor content={note.content} editable={canWrite} resetKey={resetKey}
        onChange={(json, text) => { setWords(text.split(/\s+/).filter(Boolean).length); if (JSON.stringify(json) !== JSON.stringify(note.content)) queue({ content: json }) }} />

      <Dialog open={history} onClose={() => setHistory(false)} title={t('notes.history')} footer={canWrite ? <Button variant="primary" onClick={saveVersion}>{t('notes.saveVersion')}</Button> : undefined}>
        {versions.data.length === 0 ? <p className="py-6 text-center text-sm text-text-3">{t('notes.noVersions')}</p> : (
          <ul className="space-y-2">{versions.data.map((v: any) => (
            <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
              <span className="text-[13px]">{formatDistanceToNow(new Date(v.created_at), { addSuffix: true, locale: dfl })}</span>
              {canWrite && <Button size="xs" variant="outline" onClick={() => restore(v)}>{t('notes.restoreVersion')}</Button>}
            </li>))}</ul>)}
      </Dialog>
    </div>
  )
}
