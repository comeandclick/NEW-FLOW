'use client'
 
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, isSameDay } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { ArrowLeft, Hash, Info as InfoIcon, Lock, Mic, Paperclip, Copy, Phone, Pin, Reply, Search, Send, SmilePlus, Trash2, Pencil, Video, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, Skeleton } from '@/components/ui/misc'
import { Dialog, Menu } from '@/components/ui/overlay'
import { AttachmentView, CallCard } from '@/components/chat/message-view'
import { VoiceRecorder } from '@/components/chat/voice'
import { ChannelInfo } from '@/components/chat/channel-info'
import { readers, SeenDialog, TypingLine } from '@/components/chat/receipts'
import { useLive } from '@/lib/hooks/use-live'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { MAX_FILE_BYTES, uploadToBucket } from '@/lib/storage'
import { startCall } from '@/lib/calls'
import { useI18n } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { Attachment, Conversation, ConvMember, Message, Reaction } from '@/lib/types'

const QUICK = ['👍', '❤️', '😂', '🎉', '😮', '🙏']

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { t, locale } = useI18n()
  const dfl = locale === 'fr' ? fr : enUS
  const router = useRouter()
  const { ws, members, canWrite, profileOf, nameOf, notifyUser, me, online } = useWorkspace()
  const { userId } = useSession()
  const [conv, setConv] = useState<Conversation | null>(null)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState<string | null>(null)
  const [pinsOpen, setPinsOpen] = useState(false)
  const [typers, setTypers] = useState<Record<string, number>>({})
  const [mention, setMention] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [seenFor, setSeenFor] = useState<Message | null>(null)
  const [actionFor, setActionFor] = useState<Message | null>(null)
  const press = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const fileInput = useRef<HTMLInputElement>(null)
  const typingCh = useRef<any>(null)
  const lastTyping = useRef(0)

  const msgs = useLive<Message>('messages', { eq: { conversation_id: id }, order: ['created_at', true], channelFilter: `conversation_id=eq.${id}` })
  const ids = useMemo(() => msgs.data.map((m) => m.id), [msgs.data])
  const reacts = useLive<Reaction>('reactions', { in: { message_id: ids }, enabled: ids.length > 0 })
  const cmembers = useLive<ConvMember>('conversation_members', { eq: { conversation_id: id } })

  const loadConv = useCallback(() => {
    getDb().from('conversations').select('*').eq('id', id).maybeSingle().then(({ data }) => setConv((data as Conversation) ?? null))
  }, [id])
  useEffect(() => { loadConv() }, [loadConv])

  const other = conv?.type === 'dm' ? cmembers.data.find((m) => m.user_id !== userId)?.user_id : null
  const title = conv?.type === 'channel' ? conv.name : conv?.type === 'dm' ? nameOf(other) : cmembers.data.filter((m) => m.user_id !== userId).map((m) => nameOf(m.user_id).split(' ')[0]).join(', ')
  const isMember = cmembers.data.some((m) => m.user_id === userId)

  const markRead = useCallback(async () => {
    if (!userId) return
    await getDb().from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', id).eq('user_id', userId)
  }, [id, userId])
  useEffect(() => { void markRead() }, [markRead, msgs.data.length])

  // Scroll: stay pinned to the bottom unless the user scrolled up.
  useEffect(() => { if (stick.current) bottom.current?.scrollIntoView({ block: 'end' }) }, [msgs.data.length, reacts.data.length])
  useEffect(() => { stick.current = true; setTimeout(() => bottom.current?.scrollIntoView({ block: 'end' }), 50) }, [id, msgs.loading])

  // Typing indicator via broadcast.
  useEffect(() => {
    if (!userId) return
    const db = getDb()
    const ch = db.channel(`typing:${id}`).on('broadcast', { event: 'typing' }, ({ payload }: any) => {
      if (payload.userId === userId) return
      setTypers((s) => ({ ...s, [payload.userId]: Date.now() }))
    }).subscribe()
    typingCh.current = ch
    const iv = setInterval(() => setTypers((s) => Object.fromEntries(Object.entries(s).filter(([, ts]) => Date.now() - ts < 3500))), 1000)
    return () => { clearInterval(iv); typingCh.current = null; void db.removeChannel(ch) }
  }, [id, userId])
  const emitTyping = () => {
    if (!typingCh.current || Date.now() - lastTyping.current < 1800) return
    lastTyping.current = Date.now()
    void typingCh.current.send({ type: 'broadcast', event: 'typing', payload: { userId } })
  }
  const typingNames = Object.keys(typers).map((u) => nameOf(u).split(' ')[0])

  const others = cmembers.data.filter((m) => m.user_id !== userId).map((m) => m.user_id)

  async function afterSend(preview: string, mentions: string[]) {
    await getDb().from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', id)
    const label = conv?.type === 'channel' ? `#${conv.name}` : ''
    for (const u of others) {
      const muted = cmembers.data.find((m) => m.user_id === u)?.muted
      if (muted) continue
      void notifyUser(u, { type: mentions.includes(u) ? 'mention' : 'message', title: `${me?.full_name ?? ''}${label ? ` · ${label}` : ''}`, body: preview.slice(0, 120), url: `/app/${ws.slug}/messages/${id}` })
    }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    if (!userId || !canWrite) return
    if (editing) {
      if (editing.text.trim()) await getDb().from('messages').update({ content: editing.text.trim(), is_edited: true }).eq('id', editing.id)
      setEditing(null); return
    }
    const content = text.trim()
    if (!content) return
    setText(''); setMention(null)
    const mentions = members.filter((m) => m.profile?.full_name && content.includes(`@${m.profile.full_name}`)).map((m) => m.user_id)
    stick.current = true
    const { error } = await getDb().from('messages').insert({ conversation_id: id, user_id: userId, content, parent_id: replyTo?.id ?? null, mentions })
    setReplyTo(null)
    if (error) { toast.error(t('msg.uploadFail')); setText(content); return }
    void afterSend(content, mentions)
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!userId) return
    setUploading(true)
    try {
      for (const f of Array.from(files)) {
        if (f.size > MAX_FILE_BYTES) { toast.error(`${f.name}: ${t('msg.fileTooBig')}`); continue }
        const path = await uploadToBucket('files', `${ws.id}/chat`, f, f.name)
        await getDb().from('files').insert({ workspace_id: ws.id, folder: '/Chat', name: f.name, size: f.size, mime_type: f.type, storage_path: path, uploaded_by: userId })
        const type: Attachment['type'] = f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : f.type.startsWith('audio/') ? 'audio' : 'file'
        stick.current = true
        await getDb().from('messages').insert({ conversation_id: id, user_id: userId, kind: 'file', content: null, attachments: [{ type, path, name: f.name, size: f.size, mime: f.type }] })
        void afterSend(`📎 ${f.name}`, [])
      }
    } catch { toast.error(t('msg.uploadFail')) } finally { setUploading(false); if (fileInput.current) fileInput.current.value = '' }
  }

  async function sendVoice(blob: Blob, duration: number, waveform: number[]) {
    if (!userId) return
    try {
      const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      const path = await uploadToBucket('voice', ws.id, blob, `voice.${ext}`)
      stick.current = true
      await getDb().from('messages').insert({ conversation_id: id, user_id: userId, kind: 'voice', content: null, attachments: [{ type: 'audio', path, duration, waveform, mime: blob.type }] })
      void afterSend(`🎤 ${t('msg.voiceNote')}`, [])
    } catch { toast.error(t('msg.uploadFail')) } finally { setRecording(false) }
  }

  async function react(m: Message, emoji: string) {
    if (!userId) return
    const mine = reacts.data.find((r) => r.message_id === m.id && r.user_id === userId && r.emoji === emoji)
    if (mine) await getDb().from('reactions').delete().eq('id', mine.id)
    else await getDb().from('reactions').insert({ message_id: m.id, user_id: userId, emoji })
    reacts.refresh()
  }
  const removeMsg = async (m: Message) => { await getDb().from('messages').update({ deleted_at: new Date().toISOString(), content: null, attachments: [] }).eq('id', m.id) }
  const togglePin = async (m: Message) => { await getDb().from('messages').update({ is_pinned: !m.is_pinned }).eq('id', m.id) }

  const call = async (video: boolean) => {
    if (!userId) return
    const m = await startCall({ wsId: ws.id, slug: ws.slug, userId, userName: me?.full_name ?? '', title: title ?? 'Call', video, to: others, conversationId: id })
    if (m) router.push(`/app/${ws.slug}/meetings/${m.id}?audio=${video ? 0 : 1}`)
  }

  const visible = useMemo(() => {
    const q = search?.trim().toLowerCase()
    return msgs.data.filter((m) => !q || (m.content ?? '').toLowerCase().includes(q) || m.attachments.some((a) => a.name?.toLowerCase().includes(q)))
  }, [msgs.data, search])
  const pinned = msgs.data.filter((m) => m.is_pinned && !m.deleted_at)
  const byId = useMemo(() => new Map(msgs.data.map((m) => [m.id, m])), [msgs.data])

  const mentionList = mention !== null ? members.filter((m) => m.user_id !== userId && (m.profile?.full_name ?? '').toLowerCase().includes(mention.toLowerCase())).slice(0, 5) : []

  if (!msgs.loading && !conv) return <div className="flex h-full items-center justify-center text-text-3">404</div>

  return (
    <div className="relative flex h-full flex-col" onDragOver={(e) => { if (canWrite && e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDropping(true) } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false) }}
      onDrop={(e) => { setDropping(false); if (canWrite && e.dataTransfer.files.length) { e.preventDefault(); void uploadFiles(e.dataTransfer.files) } }}>
      {dropping && <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft/60 text-sm font-medium text-accent-ink">{t('msg.dropFiles')}</div>}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-3 sm:px-5">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => router.push(`/app/${ws.slug}/messages`)} aria-label={t('common.back')}><ArrowLeft className="size-4" /></Button>
        {conv?.type === 'channel' ? (conv.is_private ? <Lock className="size-4 text-text-3" /> : <Hash className="size-4 text-text-3" />) : <Avatar name={title} src={profileOf(other)?.avatar_url} size={28} status={other && online.has(other) ? 'online' : 'offline'} />}
        <button onClick={() => conv && setInfoOpen(true)} className="min-w-0 flex-1 text-left" aria-label={t('chi.title')}><h2 className="truncate text-[15px] font-semibold">{title ?? <Skeleton className="h-4 w-24" />}</h2>
          <p className="truncate text-xs text-text-3">{conv?.type === 'dm' ? (other && online.has(other) ? t('chi.isOnline') : t('chi.isOffline')) : `${t('msg.members', { n: cmembers.data.length })} · ${t('chi.online', { n: cmembers.data.filter((m) => online.has(m.user_id)).length })}`}{conv?.description ? ` · ${conv.description}` : ''}</p></button>
        {pinned.length > 0 && <Button variant="ghost" size="icon" onClick={() => setPinsOpen(true)} aria-label={t('msg.pinned')}><Pin className="size-4" /></Button>}
        <Button variant="ghost" size="icon" onClick={() => setInfoOpen(true)} aria-label={t('chi.title')}><InfoIcon className="size-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => setSearch(search === null ? '' : null)} aria-label={t('msg.search')}><Search className="size-4" /></Button>
        {canWrite && others.length > 0 && <><Button variant="ghost" size="icon" onClick={() => call(false)} aria-label={t('msg.audioCall')}><Phone className="size-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => call(true)} aria-label={t('msg.videoCall')}><Video className="size-4" /></Button></>}
      </header>
      {search !== null && <div className="border-b border-border px-4 py-2"><Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('msg.searchPlaceholder')} /></div>}

      <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120 }} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {msgs.loading ? <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-2/3" />)}</div>
          : visible.length === 0 ? <p className="py-16 text-center text-sm text-text-3">{search ? t('msg.noResults') : t('msg.noMessages')}</p>
          : visible.map((m, i) => {
            const prev = visible[i - 1]
            const mine = m.user_id === userId
            const author = profileOf(m.user_id)
            const newDay = !prev || !isSameDay(new Date(prev.created_at), new Date(m.created_at))
            const grouped = prev && !newDay && prev.user_id === m.user_id && prev.kind !== 'call' && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000
            const mr = reacts.data.filter((r) => r.message_id === m.id)
            const groupedReacts = QUICK.concat(mr.map((r) => r.emoji)).filter((e, k, a) => a.indexOf(e) === k && mr.some((r) => r.emoji === e))
            const parent = m.parent_id ? byId.get(m.parent_id) : null
            return (
              <div key={m.id}>
                {newDay && <div className="my-4 flex items-center gap-3 text-[11px] text-text-3"><span className="h-px flex-1 bg-border" />{isSameDay(new Date(m.created_at), new Date()) ? t('msg.today') : format(new Date(m.created_at), 'EEEE d MMMM', { locale: dfl })}<span className="h-px flex-1 bg-border" /></div>}
                {/* bulles d'après 21st.dev « c-message-3 » et « bubble4 » (14/10/2026) : les autres à gauche (gris), moi à droite (sombre) */}
                <div data-selectable className={cn('group relative flex gap-2.5 px-1 py-0.5', mine && 'flex-row-reverse', grouped ? 'mt-0.5' : 'mt-4')}
                  onDoubleClick={(e) => { if (!m.deleted_at && canWrite && !(e.target as HTMLElement).closest('button,a,input,textarea,video,audio')) void react(m, '❤️') }}
                  onTouchStart={() => { if (m.deleted_at || !canWrite) return; press.current = setTimeout(() => { navigator.vibrate?.(10); setActionFor(m) }, 450) }}
                  onTouchEnd={() => press.current && clearTimeout(press.current)} onTouchMove={() => press.current && clearTimeout(press.current)} onTouchCancel={() => press.current && clearTimeout(press.current)}
                  onContextMenu={(e) => { if (m.deleted_at || !canWrite || (e.target as HTMLElement).closest('a,input,textarea')) return; e.preventDefault(); setActionFor(m) }}>
                  {!mine && <div className="w-8 shrink-0 self-end">{!grouped && <Avatar name={author?.full_name} src={author?.avatar_url} size={28} />}</div>}
                  <div className={cn('flex min-w-0 max-w-[78%] flex-col sm:max-w-[68%]', mine ? 'items-end' : 'items-start')}>
                    {!grouped && !mine && <div className="mb-1 flex items-baseline gap-1.5 px-1 text-[11px] text-text-3"><span className="font-medium text-text-2">{author?.full_name ?? '—'}</span><span>·</span><span>{format(new Date(m.created_at), 'HH:mm')}</span></div>}
                    {parent && <div className="mb-1 truncate border-l-2 border-border-strong pl-2 text-xs text-text-3">{nameOf(parent.user_id)}: {parent.content ?? (parent.kind === 'voice' ? `🎤 ${t('msg.voiceNote')}` : '📎')}</div>}
                    {m.deleted_at ? <p className="text-[13px] italic text-text-3">{t('msg.deleted')}</p>
                      : editing?.id === m.id ? (
                        <form onSubmit={send} className="flex gap-2"><Input autoFocus value={editing.text} onChange={(e) => setEditing({ id: m.id, text: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} /><Button type="submit" variant="primary" size="sm">{t('common.save')}</Button></form>
                      ) : (
                        <>
                          {m.content && m.kind !== 'call' && <p className={cn('whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14px] leading-relaxed', mine ? 'bg-text text-bg' : 'bg-surface-2 text-text dark:bg-surface-3')}>{m.content.split(/(@[\p{L}][\p{L} ]+?)(?=\s|$|[.,!?])/u).map((part, k) => part.startsWith('@') && members.some((x) => `@${x.profile?.full_name}` === part) ? <span key={k} className={cn('rounded px-1 font-medium', mine ? 'bg-bg/15' : 'bg-text/10')}>{part}</span> : <span key={k}>{part.split(/(https?:\/\/[^\s<>"')]+)/).map((x, j) => /^https?:\/\//.test(x) ? <a key={j} href={x.replace(/[.,;!?]+$/, '')} target="_blank" rel="noreferrer noopener" className="break-all underline underline-offset-2">{x}</a> : x)}</span>)}</p>}
                          {m.kind === 'call' && <CallCard video={m.content === 'video'} name={author?.full_name ?? ''} onJoin={() => router.push(`/app/${ws.slug}/meetings/${m.attachments[0]?.path}?audio=${m.content === 'video' ? 0 : 1}`)} />}
                          {m.kind !== 'call' && m.attachments.length > 0 && <div className="mt-1 flex flex-col items-start gap-1.5">{m.attachments.map((a, k) => <AttachmentView key={k} att={a} mine={false} />)}</div>}
                        </>
                      )}
                    {groupedReacts.length > 0 && <div className={cn('relative z-[1] -mt-2 flex flex-wrap gap-1', mine ? 'mr-2 justify-end' : 'ml-2')}>{groupedReacts.map((e) => {
                      const list = mr.filter((r) => r.emoji === e); const iMine = list.some((r) => r.user_id === userId)
                      return <button key={e} onClick={() => react(m, e)} className={cn('flex h-6 items-center gap-1 rounded-full border bg-surface px-1.5 text-xs shadow-sm transition-colors', iMine ? 'border-text/30' : 'border-border hover:border-border-strong')}>{e}{list.length > 1 && <span className="font-medium tabular-nums">+{list.length - 1}</span>}</button>
                    })}</div>}
                    {/* sous la bulle : « Lu 09:41 » pour mes messages, « Modifié » quand le texte a changé */}
                    {!m.deleted_at && (mine || m.is_edited) && (() => { const r = mine ? readers(m, cmembers.data, m.user_id) : null; const lu = !!r && r.total > 0 && r.unseen.length === 0
                      return <div className={cn('mt-1 flex items-center gap-1 px-1 text-[11px] text-text-3', mine && 'flex-row-reverse')}>
                        {mine && <button onClick={() => setSeenFor(m)} className="hover:text-text">{lu ? `${t('rcp.read')} ${format(new Date(m.created_at), 'HH:mm')}` : format(new Date(m.created_at), 'HH:mm')}</button>}
                        {m.is_edited && <span>{mine ? '· ' : ''}{t('msg.edited')}</span>}
                      </div> })()}
                  </div>
                  {!m.deleted_at && canWrite && (
                    <div className={cn('absolute -top-3 hidden items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 shadow-md group-hover:flex group-focus-within:flex', mine ? 'left-2' : 'right-2')}>
                      <Menu width={190} trigger={({ toggle }) => <button onClick={toggle} className="rounded-md p-1.5 text-text-3 hover:bg-surface-2 hover:text-text" aria-label="React"><SmilePlus className="size-3.5" /></button>}>
                        {(close) => <div className="flex justify-between p-1">{QUICK.map((e) => <button key={e} onClick={() => { void react(m, e); close() }} className="rounded-lg p-1.5 text-lg hover:bg-surface-2">{e}</button>)}</div>}
                      </Menu>
                      <button onClick={() => setReplyTo(m)} className="rounded-md p-1.5 text-text-3 hover:bg-surface-2 hover:text-text" aria-label={t('msg.reply')}><Reply className="size-3.5" /></button>
                      <button onClick={() => togglePin(m)} className={cn('rounded-md p-1.5 hover:bg-surface-2', m.is_pinned ? 'text-accent-ink' : 'text-text-3 hover:text-text')} aria-label={m.is_pinned ? t('msg.unpin') : t('msg.pin')}><Pin className="size-3.5" /></button>
                      {mine && m.kind === 'text' && <button onClick={() => setEditing({ id: m.id, text: m.content ?? '' })} className="rounded-md p-1.5 text-text-3 hover:bg-surface-2 hover:text-text" aria-label={t('msg.edit')}><Pencil className="size-3.5" /></button>}
                      {mine && <button onClick={() => removeMsg(m)} className="rounded-md p-1.5 text-text-3 hover:bg-surface-2 hover:text-danger" aria-label={t('common.delete')}><Trash2 className="size-3.5" /></button>}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        <div ref={bottom} />
      </div>

      <div className="shrink-0 px-3 pb-3 pt-1 safe-bottom sm:px-5">
        <TypingLine names={typingNames} />
        {!canWrite || !isMember ? <p className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-center text-sm text-text-3">{!canWrite ? '🔒' : ''}</p>
          : recording ? <VoiceRecorder onSend={sendVoice} onCancel={() => setRecording(false)} />
          : (
            <div className="relative">
              {replyTo && <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 text-xs"><Reply className="size-3 text-text-3" /><span className="min-w-0 flex-1 truncate text-text-2">{nameOf(replyTo.user_id)}: {replyTo.content ?? '…'}</span><button onClick={() => setReplyTo(null)} aria-label={t('common.close')}><X className="size-3.5" /></button></div>}
              {mentionList.length > 0 && <ul className="absolute bottom-full mb-1 w-60 overflow-hidden rounded-xl border border-border-strong bg-surface p-1 shadow-lg">{mentionList.map((m) => (
                <li key={m.id}><button onMouseDown={(e) => { e.preventDefault(); setText((v) => v.replace(/@[^@\s]*$/, `@${m.profile?.full_name} `)); setMention(null) }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"><Avatar name={m.profile?.full_name} size={20} />{m.profile?.full_name}</button></li>))}</ul>}
              <form onSubmit={send} className="flex items-end gap-1.5 rounded-2xl border border-border-strong bg-surface-2/60 p-1.5 transition-shadow focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
                <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && uploadFiles(e.target.files)} />
                <Button type="button" variant="ghost" size="icon" loading={uploading} onClick={() => fileInput.current?.click()} aria-label={t('msg.attach')}><Paperclip className="size-4" /></Button>
                <textarea value={text} rows={1} placeholder={conv?.type === 'channel' ? t('msg.placeholderIn', { name: `#${conv.name}` }) : t('msg.placeholder')}
                  onChange={(e) => { setText(e.target.value); emitTyping(); const m = e.target.value.match(/@([^@\s]*)$/); setMention(m ? m[1] : null); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px` }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}
                  onPaste={(e) => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); void uploadFiles(files) } }}
                  className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-text-3" aria-label={t('msg.placeholder')} />
                {text.trim() ? <Button type="submit" variant="primary" size="icon" aria-label={t('msg.send')}><Send className="size-4" /></Button>
                  : <Button type="button" variant="ghost" size="icon" onClick={() => setRecording(true)} aria-label={t('msg.voice')}><Mic className="size-4" /></Button>}
              </form>
            </div>
          )}
      </div>

      {conv && <ChannelInfo open={infoOpen} onClose={() => setInfoOpen(false)} conv={conv} members={cmembers.data} msgs={msgs.data} onChanged={loadConv} />}
      <SeenDialog message={seenFor} members={cmembers.data} profileOf={profileOf} onClose={() => setSeenFor(null)} />
      <Dialog open={!!actionFor} onClose={() => setActionFor(null)} size="sm">
        {actionFor && (
          <div className="space-y-3">
            <div className="flex justify-between">{QUICK.map((e) => <button key={e} onClick={() => { void react(actionFor, e); setActionFor(null) }} className="rounded-xl p-2 text-2xl active:bg-surface-2">{e}</button>)}</div>
            <div className="grid gap-1">
              <button onClick={() => { setReplyTo(actionFor); setActionFor(null) }} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2"><Reply className="size-4 text-text-3" />{t('msg.reply')}</button>
              <button onClick={() => { void togglePin(actionFor); setActionFor(null) }} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2"><Pin className="size-4 text-text-3" />{actionFor.is_pinned ? t('msg.unpin') : t('msg.pin')}</button>
              {actionFor.content && <button onClick={() => { void navigator.clipboard?.writeText(actionFor.content ?? ''); toast.success(t('chi.copied')); setActionFor(null) }} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2"><Copy className="size-4 text-text-3" />{t('chi.copy')}</button>}
              {actionFor.user_id === userId && <button onClick={() => { setSeenFor(actionFor); setActionFor(null) }} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2"><InfoIcon className="size-4 text-text-3" />{t('rcp.info')}</button>}
              {actionFor.user_id === userId && actionFor.kind === 'text' && <button onClick={() => { setEditing({ id: actionFor.id, text: actionFor.content ?? '' }); setActionFor(null) }} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2"><Pencil className="size-4 text-text-3" />{t('msg.edit')}</button>}
              {actionFor.user_id === userId && <button onClick={() => { void removeMsg(actionFor); setActionFor(null) }} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-danger hover:bg-surface-2"><Trash2 className="size-4" />{t('common.delete')}</button>}
            </div>
          </div>
        )}
      </Dialog>
      <Dialog open={pinsOpen} onClose={() => setPinsOpen(false)} title={t('msg.pinned')}>
        <ul className="space-y-3">{pinned.map((m) => <li key={m.id} className="rounded-xl border border-border p-3"><div className="text-xs text-text-3">{nameOf(m.user_id)} · {format(new Date(m.created_at), 'PPp', { locale: dfl })}</div><p className="mt-1 text-sm">{m.content ?? '📎'}</p></li>)}</ul>
      </Dialog>
    </div>
  )
}
