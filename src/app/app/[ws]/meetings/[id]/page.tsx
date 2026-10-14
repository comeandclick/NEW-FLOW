'use client'
 
import { Suspense, use, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Hand, Link2, MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, Send, Users, Video as VideoIcon, VideoOff, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, Skeleton } from '@/components/ui/misc'
import { VideoTile } from '@/components/meetings/video-tile'
import { Room, type ChatMsg, type Participant } from '@/lib/webrtc/room'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { getDb } from '@/lib/supabase/client'
import { useI18n } from '@/i18n/provider'
import { cn, formatDuration } from '@/lib/utils'
import type { Meeting } from '@/lib/types'

function Ctl({ on, onClick, label, children, danger }: { on?: boolean; onClick: () => void; label: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={on} title={label}
      className={cn('flex size-11 items-center justify-center rounded-full transition-all active:scale-90', danger ? 'bg-danger-bg text-accent-text hover:opacity-90' : on ? 'bg-accent text-accent-text' : 'bg-surface-3 text-text hover:bg-border-strong')}>{children}</button>
  )
}

function RoomPage({ id }: { id: string }) {
  const { t } = useI18n()
  const router = useRouter()
  const params = useSearchParams()
  const { ws, me } = useWorkspace()
  const { userId, isDemo } = useSession()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [missing, setMissing] = useState(false)
  const [phase, setPhase] = useState<'lobby' | 'joining' | 'room'>('lobby')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [noMedia, setNoMedia] = useState(false)
  const [audioOn, setAudioOn] = useState(true)
  const [videoOn, setVideoOn] = useState(params.get('audio') !== '1')
  const [parts, setParts] = useState<Participant[]>([])
  const [chat, setChat] = useState<ChatMsg[]>([])
  const [panel, setPanel] = useState<'chat' | 'people' | null>(null)
  const [unreadChat, setUnreadChat] = useState(0)
  const [sharing, setSharing] = useState(false)
  const [hand, setHand] = useState(false)
  const [msg, setMsg] = useState('')
  const [secs, setSecs] = useState(0)
  const room = useRef<Room | null>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const panelRef = useRef<typeof panel>(null)
  useEffect(() => { panelRef.current = panel }, [panel])

  useEffect(() => { getDb().from('meetings').select('*').eq('id', id).maybeSingle().then(({ data }) => (data ? setMeeting(data as Meeting) : setMissing(true))) }, [id])

  // Lobby preview.
  useEffect(() => {
    if (meeting?.status === 'ended' || phase !== 'lobby') return
    let alive = true
    let s: MediaStream | null = null
    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setNoMedia(true); return }
      try { s = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } }) }
      catch { try { s = await navigator.mediaDevices.getUserMedia({ audio: true }) } catch { setNoMedia(true) } }
      if (!alive) { s?.getTracks().forEach((x) => x.stop()); return }
      if (s) { setStream(s); if (!videoOn) s.getVideoTracks().forEach((x) => (x.enabled = false)) }
    })()
    return () => { alive = false }
  }, [meeting?.status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (previewRef.current && stream) previewRef.current.srcObject = stream }, [stream, phase])
  useEffect(() => { stream?.getAudioTracks().forEach((x) => (x.enabled = audioOn)) }, [audioOn, stream])
  useEffect(() => { stream?.getVideoTracks().forEach((x) => (x.enabled = videoOn)) }, [videoOn, stream])

  const join = useCallback(async () => {
    if (!meeting || !userId || !me) return
    setPhase('joining')
    const local = stream ?? new MediaStream()
    const r = new Room(meeting.room, { id: userId, name: me.full_name ?? me.email }, local, {
      onParticipants: setParts,
      onChat: (m) => { setChat((c) => [...c, m]); if (panelRef.current !== 'chat' && m.from !== userId) setUnreadChat((n) => n + 1) },
    }, { audio: audioOn, video: videoOn && local.getVideoTracks().length > 0 })
    try { await r.join() } catch { toast.error(t('common.error')); setPhase('lobby'); return }
    room.current = r
    if (meeting.status === 'scheduled' && meeting.host_id === userId) await getDb().from('meetings').update({ status: 'live', started_at: new Date().toISOString() }).eq('id', id)
    await getDb().from('meeting_participants').insert({ meeting_id: id, user_id: userId, joined_at: new Date().toISOString() })
    setPhase('room')
  }, [meeting, userId, me, stream, audioOn, videoOn, id, t])

  useEffect(() => { if (phase !== 'room') return; const iv = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(iv) }, [phase])
  useEffect(() => () => { void room.current?.leave() }, [])
  useEffect(() => () => { stream?.getTracks().forEach((x) => x.stop()) }, [stream])

  const leave = async (endAll = false) => {
    await room.current?.leave(); room.current = null
    if (userId) await getDb().from('meeting_participants').update({ left_at: new Date().toISOString() }).eq('meeting_id', id).eq('user_id', userId)
    if (endAll) await getDb().from('meetings').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', id)
    router.push(`/app/${ws.slug}/meetings`)
  }

  const toggleMic = () => { const v = !audioOn; setAudioOn(v); room.current?.setAudio(v) }
  const toggleCam = async () => { const v = !videoOn; setVideoOn(v); await room.current?.setVideo(v) }
  const toggleShare = async () => { const on = await room.current?.shareScreen(); setSharing(!!on) }
  const sendChat = () => { if (!msg.trim()) return; room.current?.sendChat(msg.trim()); setMsg('') }
  const link = typeof window !== 'undefined' ? `${window.location.origin}/app/${ws.slug}/meetings/${id}` : ''

  if (missing) return <div className="p-10 text-center text-text-3">404</div>
  if (!meeting) return <div className="p-8"><Skeleton className="mx-auto h-72 max-w-2xl" /></div>
  if (meeting.status === 'ended') return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-text-3"><VideoOff className="size-5" /></span>
      <h1 className="text-lg font-semibold">{t('meet.ended')}</h1><p className="max-w-sm text-sm text-text-2">{meeting.summary ?? t('meet.endedHint')}</p>
      <Button onClick={() => router.push(`/app/${ws.slug}/meetings`)}>{t('common.back')}</Button></div>
  )

  if (phase !== 'room') return (
    <div className="mx-auto flex h-full max-w-4xl flex-col items-center justify-center gap-6 px-4 py-6 md:flex-row md:gap-10">
      <div className="w-full max-w-md">
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-surface-2">
          <video ref={previewRef} autoPlay muted playsInline className={cn('size-full object-cover [transform:scaleX(-1)]', !(stream && videoOn && stream.getVideoTracks().length) && 'hidden')} />
          {!(stream && videoOn && stream.getVideoTracks().length) && <div className="flex size-full items-center justify-center"><Avatar name={me?.full_name} size={80} /></div>}
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            <Button size="icon" variant={audioOn ? 'secondary' : 'danger'} className="rounded-full" onClick={() => setAudioOn(!audioOn)} aria-label={t('meet.mic')}>{audioOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}</Button>
            <Button size="icon" variant={videoOn ? 'secondary' : 'danger'} className="rounded-full" onClick={() => setVideoOn(!videoOn)} aria-label={t('meet.cam')}>{videoOn ? <VideoIcon className="size-4" /> : <VideoOff className="size-4" />}</Button>
          </div>
        </div>
        {noMedia && <p className="mt-3 text-center text-xs text-warning">{window.isSecureContext ? t('meet.noMedia') : t('meet.insecure')}</p>}
      </div>
      <div className="w-full max-w-sm space-y-4 text-center md:text-left">
        <div><h1 className="text-2xl font-semibold tracking-tight">{meeting.title}</h1><p className="mt-1 text-sm text-text-2">{t('meet.lobby.sub')}</p></div>
        <Button variant="primary" size="lg" className="w-full" loading={phase === 'joining'} onClick={join}>{t('meet.joinNow')}</Button>
        <Button variant="ghost" className="w-full" onClick={() => { void navigator.clipboard.writeText(link); toast.success(t('common.copied')) }}><Link2 className="size-4" />{t('meet.copyLink')}</Button>
        {isDemo && <p className="text-xs text-text-3">{t('meet.demoNote')}</p>}
      </div>
    </div>
  )

  const sharer = parts.find((p) => p.sharing)
  const others = sharer ? parts.filter((p) => p.id !== sharer.id) : []
  const cols = parts.length <= 1 ? 'grid-cols-1' : parts.length <= 2 ? 'grid-cols-1 md:grid-cols-2' : parts.length <= 4 ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3'
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex items-center justify-between px-4 py-2.5 text-xs text-text-2"><span className="truncate font-medium text-text">{meeting.title}</span><span className="tabular-nums">{formatDuration(secs)}</span></div>
      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
        <div className="min-w-0 flex-1">
          {sharer ? (
            <div className="flex h-full flex-col gap-3 lg:flex-row">
              <VideoTile p={sharer} big className="min-h-0 flex-1" />
              <div className="flex gap-3 overflow-x-auto lg:w-56 lg:flex-col">{others.map((p) => <VideoTile key={p.id} p={p} className="aspect-video w-44 shrink-0 lg:w-full" />)}</div>
            </div>
          ) : (
            <div className={cn('grid h-full auto-rows-fr gap-3', cols)}>{parts.map((p) => <VideoTile key={p.id} p={p} big={parts.length < 3} />)}</div>
          )}
          {parts.length === 1 && <p className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{isDemo ? t('meet.demoNote') : t('meet.alone')}</p>}
        </div>
        {panel && (
          <aside className="fixed inset-x-0 bottom-0 top-24 z-30 flex flex-col rounded-t-2xl border border-border bg-surface md:static md:w-80 md:rounded-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{panel === 'chat' ? t('meet.chat') : `${t('meet.people')} (${parts.length})`}</h2>
              <button onClick={() => setPanel(null)} aria-label={t('common.close')}><X className="size-4" /></button></div>
            {panel === 'chat' ? <>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{chat.map((m) => <div key={m.id} className={cn('flex flex-col', m.from === userId && 'items-end')}><span className="text-[11px] text-text-3">{m.name}</span>
                <span className={cn('max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-[13px]', m.from === userId ? 'bg-accent text-accent-text' : 'bg-surface-2')}>{m.text}</span></div>)}</div>
              <form onSubmit={(e) => { e.preventDefault(); sendChat() }} className="flex gap-2 border-t border-border p-3"><Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t('meet.chatPlaceholder')} /><Button type="submit" variant="primary" size="icon" aria-label={t('msg.send')}><Send className="size-4" /></Button></form>
            </> : <ul className="space-y-1 overflow-y-auto p-2">{parts.map((p) => <li key={p.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2"><Avatar name={p.name} size={28} /><span className="min-w-0 flex-1 truncate text-sm">{p.name}{p.local && ` (${t('meet.you')})`}</span>{p.hand && <Hand className="size-4 text-warning" />}{!p.audio && <MicOff className="size-4 text-danger" />}</li>)}</ul>}
          </aside>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 border-t border-border bg-surface/80 px-3 py-3 backdrop-blur safe-bottom">
        <Ctl on={!audioOn} danger={!audioOn} onClick={toggleMic} label={t('meet.mic')}>{audioOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}</Ctl>
        <Ctl on={!videoOn} danger={!videoOn} onClick={toggleCam} label={t('meet.cam')}>{videoOn ? <VideoIcon className="size-5" /> : <VideoOff className="size-5" />}</Ctl>
        <span className="hidden sm:block"><Ctl on={sharing} onClick={toggleShare} label={sharing ? t('meet.stopShare') : t('meet.share')}><MonitorUp className="size-5" /></Ctl></span>
        <Ctl on={hand} onClick={() => setHand(room.current?.toggleHand() ?? false)} label={t('meet.hand')}><Hand className="size-5" /></Ctl>
        <span className="relative"><Ctl on={panel === 'chat'} onClick={() => { setPanel(panel === 'chat' ? null : 'chat'); setUnreadChat(0) }} label={t('meet.chat')}><MessageSquare className="size-5" /></Ctl>
          {unreadChat > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-danger-bg px-1.5 text-[10px] font-semibold text-white">{unreadChat}</span>}</span>
        <Ctl on={panel === 'people'} onClick={() => setPanel(panel === 'people' ? null : 'people')} label={t('meet.people')}><Users className="size-5" /></Ctl>
        <Ctl danger onClick={() => leave(false)} label={t('meet.leave')}><PhoneOff className="size-5" /></Ctl>
        {meeting.host_id === userId && <Button variant="ghost" size="sm" className="hidden text-danger sm:inline-flex" onClick={() => leave(true)}>{t('meet.end')}</Button>}
      </div>
    </div>
  )
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <Suspense><RoomPage id={id} /></Suspense>
}
