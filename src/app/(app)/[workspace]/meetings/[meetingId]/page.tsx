'use client'

import { use, useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Users,
  MessageSquare, X, Send, MonitorOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Meeting } from '@/types/database'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface Props {
  params: Promise<{ workspace: string; meetingId: string }>
}

interface Peer {
  userId: string
  stream: MediaStream | null
  name: string
  micOn: boolean
  camOn: boolean
  sharing: boolean
}

interface ChatMessage {
  id: string
  userId: string
  name: string
  text: string
  at: number
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

// ── Discord-style Web Audio sounds ──────────────────────────────────────────
function playTone(type: 'join' | 'leave' | 'screenshare') {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)

    if (type === 'join') {
      osc.frequency.setValueAtTime(440, ctx.currentTime)
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.12)
      osc.type = 'sine'
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } else if (type === 'leave') {
      osc.frequency.setValueAtTime(660, ctx.currentTime)
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.12)
      osc.type = 'sine'
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } else {
      // screenshare: two quick blips
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.type = 'square'
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.setValueAtTime(0, ctx.currentTime + 0.07)
      gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.1)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    }
    ctx.close()
  } catch {
    // Audio not supported — silent
  }
}

export default function MeetingRoomPage({ params }: Props) {
  const { workspace: slug, meetingId } = use(params)
  const router = useRouter()
  const { user, profile } = useAuth()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [unreadChat, setUnreadChat] = useState(0)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const signalingChannel = useRef<RealtimeChannel | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const supabase = getSupabaseClient()
  const myName = profile?.full_name ?? user?.email ?? 'Moi'

  // ── WebRTC peer factory ────────────────────────────────────────────────────
  const createPeerConnection = useCallback((remoteUserId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!)
    })

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return
      signalingChannel.current?.send({
        type: 'broadcast', event: 'ice-candidate',
        payload: { to: remoteUserId, from: user?.id, candidate: candidate.toJSON() },
      })
    }

    pc.ontrack = ({ streams }) => {
      if (!streams[0]) return
      setPeers((prev) => {
        const exists = prev.find((p) => p.userId === remoteUserId)
        if (exists) return prev.map((p) => p.userId === remoteUserId ? { ...p, stream: streams[0] } : p)
        return [...prev, { userId: remoteUserId, stream: streams[0], name: remoteUserId.slice(0, 8), micOn: true, camOn: true, sharing: false }]
      })
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setPeers((prev) => prev.filter((p) => p.userId !== remoteUserId))
        peerConnections.current.delete(remoteUserId)
      }
    }

    peerConnections.current.set(remoteUserId, pc)
    return pc
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Media + DB setup ──────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('meetings').select('*').eq('id', meetingId).single()
      .then(({ data }) => {
        if (data) setMeeting(data)
        else { toast.error('Réunion introuvable'); router.push(`/${slug}/meetings`) }
      })

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((stream) => {
        localStreamRef.current = stream
        setLocalStream(stream)
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      })
      .catch(() => {
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          .then((stream) => { localStreamRef.current = stream; setLocalStream(stream) })
          .catch(() => toast.error('Accès micro/caméra refusé'))
      })

    supabase.from('meetings').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', meetingId)
    if (user?.id) {
      supabase.from('meeting_participants').upsert({
        meeting_id: meetingId, user_id: user.id, joined_at: new Date().toISOString(),
      }, { onConflict: 'meeting_id,user_id' }).then(() => {})
    }

    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      peerConnections.current.forEach((pc) => pc.close())
      peerConnections.current.clear()
      signalingChannel.current?.unsubscribe()
    }
  }, [meetingId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Signaling channel ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!meeting?.room_id || !user?.id) return

    const channel = supabase.channel(`meeting-signal-${meeting.room_id}`, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'user-joined' }, async ({ payload }) => {
        const { userId: remoteId, name: remoteName } = payload as { userId: string; name: string }
        if (remoteId === user.id) return
        playTone('join')
        toast.success(`${remoteName} a rejoint`, { duration: 2500 })
        setPeers((prev) => prev.some(p => p.userId === remoteId)
          ? prev.map(p => p.userId === remoteId ? { ...p, name: remoteName } : p)
          : [...prev, { userId: remoteId, stream: null, name: remoteName, micOn: true, camOn: true, sharing: false }]
        )
        // Send our state back
        channel.send({
          type: 'broadcast', event: 'state-sync',
          payload: { to: remoteId, from: user.id, name: myName, micOn, camOn, sharing },
        })
        const pc = createPeerConnection(remoteId)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        channel.send({
          type: 'broadcast', event: 'offer',
          payload: { to: remoteId, from: user.id, sdp: pc.localDescription },
        })
      })
      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        const { to, from, sdp } = payload as { to: string; from: string; sdp: RTCSessionDescriptionInit }
        if (to !== user.id) return
        const pc = createPeerConnection(from)
        await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        channel.send({
          type: 'broadcast', event: 'answer',
          payload: { to: from, from: user.id, sdp: pc.localDescription },
        })
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        const { to, from, sdp } = payload as { to: string; from: string; sdp: RTCSessionDescriptionInit }
        if (to !== user.id) return
        const pc = peerConnections.current.get(from)
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        const { to, from, candidate } = payload as { to: string; from: string; candidate: RTCIceCandidateInit }
        if (to !== user.id) return
        const pc = peerConnections.current.get(from)
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
      })
      .on('broadcast', { event: 'user-left' }, ({ payload }) => {
        const { userId: remoteId, name: remoteName } = payload as { userId: string; name: string }
        playTone('leave')
        toast(`${remoteName ?? 'Quelqu\'un'} a quitté`, { duration: 2500 })
        setPeers((prev) => prev.filter((p) => p.userId !== remoteId))
        peerConnections.current.get(remoteId)?.close()
        peerConnections.current.delete(remoteId)
      })
      .on('broadcast', { event: 'state-update' }, ({ payload }) => {
        const { from, micOn: m, camOn: c, sharing: sh, name } = payload as { from: string; micOn: boolean; camOn: boolean; sharing: boolean; name: string }
        const wasSharing = peers.find(p => p.userId === from)?.sharing
        if (sh && !wasSharing) playTone('screenshare')
        setPeers(prev => prev.map(p => p.userId === from ? { ...p, micOn: m, camOn: c, sharing: sh, name: name ?? p.name } : p))
      })
      .on('broadcast', { event: 'state-sync' }, ({ payload }) => {
        const { to, from, micOn: m, camOn: c, sharing: sh, name } = payload as { to: string; from: string; micOn: boolean; camOn: boolean; sharing: boolean; name: string }
        if (to !== user.id) return
        setPeers(prev => prev.map(p => p.userId === from ? { ...p, micOn: m, camOn: c, sharing: sh, name: name ?? p.name } : p))
      })
      .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        const msg = payload as ChatMessage
        setChatMessages(prev => [...prev, msg])
        if (!chatOpen) setUnreadChat(n => n + 1)
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.send({
            type: 'broadcast', event: 'user-joined',
            payload: { userId: user.id, name: myName },
          })
        }
      })

    signalingChannel.current = channel

    return () => {
      channel.send({
        type: 'broadcast', event: 'user-left',
        payload: { userId: user.id, name: myName },
      }).then(() => channel.unsubscribe()).catch(() => channel.unsubscribe())
    }
  }, [meeting?.room_id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Broadcast state changes
  function broadcastState(overrides?: Partial<{ micOn: boolean; camOn: boolean; sharing: boolean }>) {
    signalingChannel.current?.send({
      type: 'broadcast', event: 'state-update',
      payload: { from: user?.id, name: myName, micOn, camOn, sharing, ...overrides },
    })
  }

  function toggleMic() {
    if (!localStream) return
    const track = localStream.getAudioTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setMicOn(track.enabled)
      broadcastState({ micOn: track.enabled })
    }
  }

  function toggleCam() {
    if (!localStream) return
    const track = localStream.getVideoTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setCamOn(track.enabled)
      broadcastState({ camOn: track.enabled })
    }
  }

  async function shareScreen() {
    if (sharing) return stopScreenShare()
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      setSharing(true)
      playTone('screenshare')
      broadcastState({ sharing: true })
      if (localVideoRef.current) localVideoRef.current.srcObject = screen
      const screenTrack = screen.getVideoTracks()[0]
      peerConnections.current.forEach((pc) => {
        pc.getSenders().find((s) => s.track?.kind === 'video')?.replaceTrack(screenTrack)
      })
      screenTrack.onended = () => stopScreenShare()
    } catch {
      toast.error('Partage d\'écran annulé')
    }
  }

  function stopScreenShare() {
    setSharing(false)
    broadcastState({ sharing: false })
    if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream
    const origTrack = localStream?.getVideoTracks()[0]
    if (origTrack) {
      peerConnections.current.forEach((pc) => {
        pc.getSenders().find((s) => s.track?.kind === 'video')?.replaceTrack(origTrack)
      })
    }
  }

  async function leaveMeeting() {
    signalingChannel.current?.send({
      type: 'broadcast', event: 'user-left', payload: { userId: user?.id, name: myName },
    })
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    peerConnections.current.forEach((pc) => pc.close())
    if (user?.id) {
      await supabase.from('meeting_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('meeting_id', meetingId).eq('user_id', user.id)
    }
    router.push(`/${slug}/meetings`)
  }

  function sendChatMessage(e: React.FormEvent) {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text) return
    const msg: ChatMessage = { id: `${Date.now()}-${user?.id}`, userId: user?.id ?? '', name: myName, text, at: Date.now() }
    setChatMessages(prev => [...prev, msg])
    setChatInput('')
    signalingChannel.current?.send({ type: 'broadcast', event: 'chat-message', payload: msg })
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  // Open chat — clear unread
  useEffect(() => { if (chatOpen) setUnreadChat(0) }, [chatOpen])

  // Auto-scroll chat
  useEffect(() => {
    if (chatOpen) chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatOpen])

  const allParticipants = peers.length + 1
  const gridCols = allParticipants <= 1 ? 'grid-cols-1' :
    allParticipants <= 2 ? 'grid-cols-2' :
    allParticipants <= 4 ? 'grid-cols-2' :
    allParticipants <= 6 ? 'grid-cols-3' : 'grid-cols-4'

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-zinc-900/80 backdrop-blur border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">{meeting?.title ?? 'Réunion'}</span>
          <Badge className="bg-green-500/20 text-green-400 text-[10px] border-green-500/30">LIVE</Badge>
          {sharing && <Badge className="bg-blue-500/20 text-blue-400 text-[10px] border-blue-500/30">PARTAGE</Badge>}
        </div>
        <div className="flex items-center gap-3 text-zinc-400 text-xs">
          <div className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            <span>{allParticipants} participant{allParticipants > 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Video area */}
        <div className={cn('flex-1 p-3 grid gap-3 content-start overflow-auto transition-all duration-300', gridCols)}>
          {/* Local tile */}
          <div className="relative bg-zinc-900 rounded-2xl overflow-hidden aspect-video ring-2 ring-transparent hover:ring-zinc-700 transition-all">
            <video ref={localVideoRef} autoPlay muted playsInline
              className={cn('w-full h-full object-cover', !camOn && 'hidden')} />
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                <div className="h-16 w-16 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-bold">{myName[0]?.toUpperCase()}</span>
                </div>
              </div>
            )}
            {sharing && (
              <div className="absolute top-2 right-2">
                <Badge className="bg-blue-500/80 text-white text-[10px]">Écran</Badge>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/70 via-transparent">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium truncate">{myName} (vous)</span>
                <div className="flex items-center gap-1">
                  {!micOn && <MicOff className="h-3 w-3 text-red-400" />}
                  {!camOn && <VideoOff className="h-3 w-3 text-red-400" />}
                </div>
              </div>
            </div>
          </div>

          {/* Remote peers */}
          {peers.map((peer) => (
            <div key={peer.userId} className="relative bg-zinc-900 rounded-2xl overflow-hidden aspect-video ring-2 ring-transparent hover:ring-zinc-700 transition-all">
              {peer.stream ? (
                <video autoPlay playsInline
                  ref={(el) => { if (el && peer.stream) el.srcObject = peer.stream }}
                  className={cn('w-full h-full object-cover', !peer.camOn && 'hidden')} />
              ) : null}
              {(!peer.stream || !peer.camOn) && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                  <div className="h-16 w-16 rounded-full bg-violet-600 flex items-center justify-center shadow-lg">
                    <span className="text-2xl font-bold">{peer.name[0]?.toUpperCase()}</span>
                  </div>
                </div>
              )}
              {peer.sharing && (
                <div className="absolute top-2 right-2">
                  <Badge className="bg-blue-500/80 text-white text-[10px]">Partage</Badge>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/70 via-transparent">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate">{peer.name}</span>
                  <div className="flex items-center gap-1">
                    {!peer.micOn && <MicOff className="h-3 w-3 text-red-400" />}
                    {!peer.camOn && <VideoOff className="h-3 w-3 text-red-400" />}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Waiting placeholder */}
          {peers.length === 0 && (
            <div className="flex items-center justify-center aspect-video bg-zinc-900/40 rounded-2xl border-2 border-dashed border-zinc-800">
              <div className="text-center space-y-2">
                <Users className="h-8 w-8 text-zinc-600 mx-auto" />
                <p className="text-xs text-zinc-500">En attente de participants…</p>
                <p className="text-[10px] text-zinc-600">Partagez le lien de réunion</p>
              </div>
            </div>
          )}
        </div>

        {/* Chat sidebar */}
        {chatOpen && (
          <div className="w-72 flex flex-col border-l border-zinc-800 bg-zinc-900 shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <span className="text-sm font-medium">Chat</span>
              <button onClick={() => setChatOpen(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ScrollArea className="flex-1 px-3 py-2">
              <div className="space-y-3">
                {chatMessages.length === 0 && (
                  <p className="text-xs text-zinc-500 text-center mt-8">Aucun message pour l&apos;instant</p>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={cn('flex flex-col', msg.userId === user?.id ? 'items-end' : 'items-start')}>
                    <span className="text-[10px] text-zinc-500 mb-0.5">{msg.name}</span>
                    <div className={cn(
                      'max-w-[90%] rounded-xl px-3 py-1.5 text-xs leading-relaxed break-words',
                      msg.userId === user?.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-zinc-800 text-zinc-100'
                    )}>
                      {msg.text}
                    </div>
                    <span className="text-[9px] text-zinc-600 mt-0.5">
                      {new Date(msg.at).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>
            </ScrollArea>
            <form onSubmit={sendChatMessage} className="flex items-center gap-2 px-3 py-3 border-t border-zinc-800">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Message…"
                className="flex-1 bg-zinc-800 text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-500"
              />
              <button type="submit" disabled={!chatInput.trim()}
                className="text-zinc-400 hover:text-white disabled:opacity-30 transition-colors">
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex items-center justify-center gap-2 py-4 bg-zinc-900/80 backdrop-blur border-t border-zinc-800 shrink-0">
        <button
          onClick={toggleMic}
          className={cn(
            'flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all text-[10px]',
            micOn ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
          )}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          {micOn ? 'Micro' : 'Muet'}
        </button>

        <button
          onClick={toggleCam}
          className={cn(
            'flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all text-[10px]',
            camOn ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
          )}
        >
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          {camOn ? 'Caméra' : 'Cam. off'}
        </button>

        <button
          onClick={shareScreen}
          className={cn(
            'flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all text-[10px]',
            sharing ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400' : 'bg-zinc-800 hover:bg-zinc-700 text-white'
          )}
        >
          {sharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
          {sharing ? 'Arrêter' : 'Partager'}
        </button>

        <button
          onClick={() => setChatOpen(o => !o)}
          className={cn(
            'relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all text-[10px]',
            chatOpen ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 hover:bg-zinc-700 text-white'
          )}
        >
          <MessageSquare className="h-5 w-5" />
          Chat
          {unreadChat > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-indigo-500 text-[9px] text-white flex items-center justify-center font-bold">
              {unreadChat > 9 ? '9+' : unreadChat}
            </span>
          )}
        </button>

        <div className="w-px h-10 bg-zinc-700 mx-1" />

        <button
          onClick={leaveMeeting}
          className="flex flex-col items-center gap-1 px-5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all text-[10px] font-medium"
        >
          <PhoneOff className="h-5 w-5" />
          Quitter
        </button>
      </div>
    </div>
  )
}
