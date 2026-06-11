'use client'

import React, { use, useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Users,
  MessageSquare, X, Send, MonitorOff, Loader2, Link2,
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
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

// ── Discord-style audio tones ──────────────────────────────────────────────────
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
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.type = 'square'
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.setValueAtTime(0, ctx.currentTime + 0.07)
      gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.1)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    }
    setTimeout(() => ctx.close(), 1000)
  } catch { /* AudioContext not supported */ }
}

// ── PeerVideoTile — separate component so useEffect reacts to stream changes ──
function PeerVideoTile({ peer }: { peer: Peer }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (peer.stream && el.srcObject !== peer.stream) {
      el.srcObject = peer.stream
      el.play().catch(() => {})
    } else if (!peer.stream) {
      el.srcObject = null
    }
  }, [peer.stream])

  return (
    <div className="relative bg-zinc-900 rounded-xl sm:rounded-2xl overflow-hidden aspect-video ring-2 ring-transparent hover:ring-zinc-700 transition-all">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={cn('w-full h-full object-cover', (!peer.camOn || !peer.stream) && 'hidden')}
      />
      {(!peer.stream || !peer.camOn) && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
          <div className="h-10 w-10 sm:h-16 sm:w-16 rounded-full bg-violet-600 flex items-center justify-center shadow-lg">
            <span className="text-lg sm:text-2xl font-bold">{peer.name[0]?.toUpperCase()}</span>
          </div>
        </div>
      )}
      {!peer.stream && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2">
          <span className="text-[10px] text-zinc-400 bg-zinc-900/70 px-2 py-0.5 rounded-full">Connexion…</span>
        </div>
      )}
      {peer.sharing && (
        <div className="absolute top-2 right-2">
          <Badge className="bg-blue-500/80 text-white text-[10px]">Partage</Badge>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 px-2 sm:px-3 py-1.5 sm:py-2 bg-gradient-to-t from-black/70 via-transparent">
        <div className="flex items-center justify-between">
          <span className="text-[11px] sm:text-xs font-medium truncate">{peer.name}</span>
          <div className="flex items-center gap-1">
            {!peer.micOn && <MicOff className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-red-400" />}
            {!peer.camOn && <VideoOff className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-red-400" />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function MeetingRoomPage({ params }: Props) {
  const { workspace: slug, meetingId } = use(params)
  const router = useRouter()
  const { user, profile } = useAuth()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [mediaReady, setMediaReady] = useState(false) // true once getUserMedia resolved (success or fail)
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
    // Close existing connection if any
    const existing = peerConnections.current.get(remoteUserId)
    if (existing) {
      existing.close()
      peerConnections.current.delete(remoteUserId)
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    // Add local tracks — use whatever is available right now
    const stream = localStreamRef.current
    if (stream) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream)
      })
    }

    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return
      signalingChannel.current?.send({
        type: 'broadcast', event: 'ice-candidate',
        payload: { to: remoteUserId, from: user?.id, candidate: candidate.toJSON() },
      })
    }

    pc.ontrack = ({ streams }) => {
      const remoteStream = streams[0]
      if (!remoteStream) return
      setPeers((prev) => {
        const exists = prev.find((p) => p.userId === remoteUserId)
        if (exists) {
          return prev.map((p) =>
            p.userId === remoteUserId ? { ...p, stream: remoteStream } : p
          )
        }
        return [...prev, {
          userId: remoteUserId,
          stream: remoteStream,
          name: 'Participant',
          micOn: true,
          camOn: true,
          sharing: false,
        }]
      })
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      if (state === 'failed') {
        // Try ICE restart
        pc.restartIce()
      }
      if (state === 'disconnected') {
        // Give 5s to recover before removing
        setTimeout(() => {
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            setPeers((prev) => prev.filter((p) => p.userId !== remoteUserId))
            peerConnections.current.delete(remoteUserId)
          }
        }, 5000)
      }
      if (state === 'closed') {
        setPeers((prev) => prev.filter((p) => p.userId !== remoteUserId))
        peerConnections.current.delete(remoteUserId)
      }
    }

    pc.onnegotiationneeded = async () => {
      // Only the "caller" should negotiate — handled by signaling flow
    }

    peerConnections.current.set(remoteUserId, pc)
    return pc
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── When stream becomes ready: add tracks to any existing peer connections ──
  useEffect(() => {
    if (!localStream) return
    localStreamRef.current = localStream

    // Assign to local video element
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream
    }

    // Add tracks to any peer connections created before stream was ready
    peerConnections.current.forEach((pc) => {
      const hasTracks = pc.getSenders().some(s => s.track !== null)
      if (!hasTracks) {
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream))
      }
    })
  }, [localStream])

  // ── Media + DB setup ──────────────────────────────────────────────────────
  useEffect(() => {
    // Load meeting info
    supabase.from('meetings').select('*').eq('id', meetingId).single()
      .then(({ data }) => {
        if (data) setMeeting(data)
        else { toast.error('Réunion introuvable'); router.push(`/${slug}/meetings`) }
      })

    // Update meeting status + register participant
    supabase.from('meetings')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', meetingId)
      .then(() => {})

    if (user?.id) {
      supabase.from('meeting_participants').upsert({
        meeting_id: meetingId, user_id: user.id, joined_at: new Date().toISOString(),
      }, { onConflict: 'meeting_id,user_id' }).then(() => {})
    }

    // Acquire media — try video+audio first, fall back to audio-only
    async function acquireMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        localStreamRef.current = stream
        setLocalStream(stream)
        setCamOn(true)
        setMicOn(true)
      } catch {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          localStreamRef.current = stream
          setLocalStream(stream)
          setCamOn(false)
          setMicOn(true)
          toast('Caméra indisponible — audio seulement', { duration: 3000 })
        } catch {
          toast.error('Accès micro/caméra refusé — vous rejoignez sans média')
          setLocalStream(null)
          setCamOn(false)
          setMicOn(false)
        }
      } finally {
        setMediaReady(true)
      }
    }

    acquireMedia()

    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop())
      peerConnections.current.forEach((pc) => pc.close())
      peerConnections.current.clear()
      signalingChannel.current?.unsubscribe()
      signalingChannel.current = null
    }
  }, [meetingId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Signaling channel — only after media is ready ─────────────────────────
  useEffect(() => {
    if (!meeting?.room_id || !user?.id || !mediaReady) return

    const channel = supabase.channel(`meeting-signal-${meeting.room_id}`, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'user-joined' }, async ({ payload }) => {
        const { userId: remoteId, name: remoteName } = payload as { userId: string; name: string }
        if (remoteId === user.id) return
        playTone('join')
        toast.success(`${remoteName} a rejoint`, { duration: 2500 })

        // Add peer to list (without stream yet)
        setPeers((prev) =>
          prev.some(p => p.userId === remoteId)
            ? prev.map(p => p.userId === remoteId ? { ...p, name: remoteName } : p)
            : [...prev, { userId: remoteId, stream: null, name: remoteName, micOn: true, camOn: true, sharing: false }]
        )

        // Send our current state back to the new participant
        channel.send({
          type: 'broadcast', event: 'state-sync',
          payload: { to: remoteId, from: user.id, name: myName, micOn, camOn, sharing },
        })

        // We are the existing user — create offer to new participant
        const pc = createPeerConnection(remoteId)
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          channel.send({
            type: 'broadcast', event: 'offer',
            payload: { to: remoteId, from: user.id, sdp: pc.localDescription },
          })
        } catch (err) {
          console.error('Failed to create offer:', err)
        }
      })

      .on('broadcast', { event: 'offer' }, async ({ payload }) => {
        const { to, from, sdp } = payload as { to: string; from: string; sdp: RTCSessionDescriptionInit }
        if (to !== user.id) return

        // Perfect negotiation: if both sides send offers simultaneously,
        // the "polite" peer (smaller userId) rolls back and accepts the remote offer
        const existingPc = peerConnections.current.get(from)
        const isPolite = (user.id ?? '') < from

        if (existingPc && existingPc.signalingState !== 'stable') {
          if (isPolite) {
            // Roll back our local description and accept theirs
            await existingPc.setLocalDescription({ type: 'rollback' })
          } else {
            // We are "impolite" — ignore their offer, ours takes precedence
            return
          }
        }

        const pc = existingPc ?? createPeerConnection(from)
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          channel.send({
            type: 'broadcast', event: 'answer',
            payload: { to: from, from: user.id, sdp: pc.localDescription },
          })
        } catch (err) {
          console.error('Failed to handle offer:', err)
          // Retry: recreate peer connection and re-request offer
          setTimeout(() => {
            channel.send({ type: 'broadcast', event: 'request-offer', payload: { to: from, from: user.id } })
          }, 1000)
        }
      })

      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        const { to, from, sdp } = payload as { to: string; from: string; sdp: RTCSessionDescriptionInit }
        if (to !== user.id) return
        const pc = peerConnections.current.get(from)
        if (!pc) return
        try {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp))
          }
        } catch (err) {
          console.error('Failed to set answer:', err)
        }
      })

      .on('broadcast', { event: 'request-offer' }, async ({ payload }) => {
        const { to, from } = payload as { to: string; from: string }
        if (to !== user.id) return
        const pc = createPeerConnection(from)
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          channel.send({
            type: 'broadcast', event: 'offer',
            payload: { to: from, from: user.id, sdp: pc.localDescription },
          })
        } catch (err) {
          console.error('Failed to re-create offer:', err)
        }
      })

      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        const { to, from, candidate } = payload as { to: string; from: string; candidate: RTCIceCandidateInit }
        if (to !== user.id) return
        const pc = peerConnections.current.get(from)
        if (!pc) return
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch { /* ignore stale candidates */ }
      })

      .on('broadcast', { event: 'user-left' }, ({ payload }) => {
        const { userId: remoteId, name: remoteName } = payload as { userId: string; name: string }
        playTone('leave')
        toast(`${remoteName ?? 'Un participant'} a quitté`, { duration: 2500 })
        setPeers((prev) => prev.filter((p) => p.userId !== remoteId))
        const pc = peerConnections.current.get(remoteId)
        if (pc) { pc.close(); peerConnections.current.delete(remoteId) }
      })

      .on('broadcast', { event: 'state-update' }, ({ payload }) => {
        const { from, micOn: m, camOn: c, sharing: sh, name } = payload as {
          from: string; micOn: boolean; camOn: boolean; sharing: boolean; name: string
        }
        setPeers(prev => {
          const peer = prev.find(p => p.userId === from)
          if (peer && sh && !peer.sharing) playTone('screenshare')
          return prev.map(p =>
            p.userId === from ? { ...p, micOn: m, camOn: c, sharing: sh, name: name ?? p.name } : p
          )
        })
      })

      .on('broadcast', { event: 'state-sync' }, ({ payload }) => {
        const { to, from, micOn: m, camOn: c, sharing: sh, name } = payload as {
          to: string; from: string; micOn: boolean; camOn: boolean; sharing: boolean; name: string
        }
        if (to !== user.id) return
        setPeers(prev =>
          prev.map(p => p.userId === from ? { ...p, micOn: m, camOn: c, sharing: sh, name: name ?? p.name } : p)
        )
      })

      .on('broadcast', { event: 'chat-message' }, ({ payload }) => {
        const msg = payload as ChatMessage
        setChatMessages(prev => [...prev, msg])
        if (!chatOpen) setUnreadChat(n => n + 1)
        setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      })

      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Announce ourselves to the room
          await channel.send({
            type: 'broadcast', event: 'user-joined',
            payload: { userId: user.id, name: myName },
          })
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          toast.error('Problème de connexion à la réunion')
        }
      })

    signalingChannel.current = channel

    return () => {
      channel.send({
        type: 'broadcast', event: 'user-left',
        payload: { userId: user.id, name: myName },
      }).finally(() => channel.unsubscribe())
    }
  }, [meeting?.room_id, user?.id, mediaReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Broadcast media state changes ─────────────────────────────────────────
  function broadcastState(overrides?: Partial<{ micOn: boolean; camOn: boolean; sharing: boolean }>) {
    signalingChannel.current?.send({
      type: 'broadcast', event: 'state-update',
      payload: { from: user?.id, name: myName, micOn, camOn, sharing, ...overrides },
    })
  }

  function toggleMic() {
    const stream = localStreamRef.current
    if (!stream) return
    const track = stream.getAudioTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setMicOn(track.enabled)
      broadcastState({ micOn: track.enabled })
    }
  }

  function toggleCam() {
    const stream = localStreamRef.current
    if (!stream) return
    const track = stream.getVideoTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setCamOn(track.enabled)
      if (localVideoRef.current) {
        localVideoRef.current.style.display = track.enabled ? 'block' : 'none'
      }
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
    const stream = localStreamRef.current
    if (stream && localVideoRef.current) localVideoRef.current.srcObject = stream
    const origTrack = stream?.getVideoTracks()[0]
    if (origTrack) {
      peerConnections.current.forEach((pc) => {
        pc.getSenders().find((s) => s.track?.kind === 'video')?.replaceTrack(origTrack)
      })
    }
  }

  async function leaveMeeting() {
    try {
      await signalingChannel.current?.send({
        type: 'broadcast', event: 'user-left', payload: { userId: user?.id, name: myName },
      })
    } catch { /* ignore */ }
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    peerConnections.current.forEach((pc) => pc.close())
    if (user?.id) {
      await supabase.from('meeting_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('meeting_id', meetingId)
        .eq('user_id', user.id)
    }
    router.push(`/${slug}/meetings`)
  }

  function sendChatMessage(e: React.FormEvent) {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text) return
    const msg: ChatMessage = {
      id: `${Date.now()}-${user?.id}`,
      userId: user?.id ?? '',
      name: myName,
      text,
      at: Date.now(),
    }
    setChatMessages(prev => [...prev, msg])
    setChatInput('')
    signalingChannel.current?.send({ type: 'broadcast', event: 'chat-message', payload: msg })
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  useEffect(() => { if (chatOpen) setUnreadChat(0) }, [chatOpen])
  useEffect(() => {
    if (chatOpen) chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatOpen])

  // ── Layout ─────────────────────────────────────────────────────────────────
  const allParticipants = peers.length + 1
  const gridCols =
    allParticipants <= 1 ? 'grid-cols-1' :
    allParticipants <= 2 ? 'grid-cols-1 sm:grid-cols-2' :
    allParticipants <= 4 ? 'grid-cols-2' :
    allParticipants <= 6 ? 'grid-cols-2 sm:grid-cols-3' :
    'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-2 sm:py-3 bg-zinc-900/80 backdrop-blur border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="font-semibold text-xs sm:text-sm truncate">{meeting?.title ?? 'Réunion'}</span>
          <Badge className="bg-green-500/20 text-green-400 text-[10px] border-green-500/30 shrink-0">LIVE</Badge>
          {sharing && <Badge className="bg-blue-500/20 text-blue-400 text-[10px] border-blue-500/30 shrink-0">PARTAGE</Badge>}
          {!mediaReady && (
            <div className="flex items-center gap-1 text-zinc-500 text-[10px]">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="hidden sm:inline">Caméra…</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 text-zinc-400 text-xs shrink-0">
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span>{allParticipants}</span>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success('Lien copié') }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-[10px]"
            title="Copier le lien"
          >
            <Link2 className="h-3 w-3" />
            <span className="hidden sm:inline">Inviter</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Video grid */}
        <div className={cn(
          'flex-1 p-2 sm:p-3 grid gap-2 sm:gap-3 content-start overflow-auto transition-all duration-300',
          gridCols
        )}>
          {/* Local tile */}
          <div className="relative bg-zinc-900 rounded-xl sm:rounded-2xl overflow-hidden aspect-video ring-2 ring-indigo-600/30 hover:ring-indigo-600/60 transition-all">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={cn('w-full h-full object-cover', !camOn && 'hidden')}
            />
            {!camOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
                <div className="h-10 w-10 sm:h-16 sm:w-16 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg">
                  <span className="text-lg sm:text-2xl font-bold">{myName[0]?.toUpperCase()}</span>
                </div>
              </div>
            )}
            {!mediaReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
                  <span className="text-[10px] text-zinc-500">Accès caméra…</span>
                </div>
              </div>
            )}
            {sharing && (
              <div className="absolute top-2 right-2">
                <Badge className="bg-blue-500/80 text-white text-[10px]">Écran</Badge>
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 px-2 sm:px-3 py-1.5 sm:py-2 bg-gradient-to-t from-black/70 via-transparent">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs font-medium truncate">{myName} (vous)</span>
                <div className="flex items-center gap-1">
                  {!micOn && <MicOff className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-red-400" />}
                  {!camOn && <VideoOff className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-red-400" />}
                </div>
              </div>
            </div>
          </div>

          {/* Remote peers */}
          {peers.map((peer) => (
            <PeerVideoTile key={peer.userId} peer={peer} />
          ))}

          {/* Waiting placeholder */}
          {peers.length === 0 && (
            <div className="flex items-center justify-center aspect-video bg-zinc-900/40 rounded-xl sm:rounded-2xl border-2 border-dashed border-zinc-800">
              <div className="text-center space-y-1.5 sm:space-y-2 px-4">
                <Users className="h-6 w-6 sm:h-8 sm:w-8 text-zinc-600 mx-auto" />
                <p className="text-[11px] sm:text-xs text-zinc-500">En attente de participants…</p>
                <p className="text-[10px] text-zinc-600 hidden sm:block">Partagez le lien de réunion</p>
              </div>
            </div>
          )}
        </div>

        {/* Chat sidebar — slide in from right */}
        {chatOpen && (
          <div className="w-64 sm:w-72 flex flex-col border-l border-zinc-800 bg-zinc-900 shrink-0">
            <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 border-b border-zinc-800">
              <span className="text-xs sm:text-sm font-medium">Chat</span>
              <button onClick={() => setChatOpen(false)} className="text-zinc-500 hover:text-zinc-300 p-1 -m-1">
                <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </div>
            <ScrollArea className="flex-1 px-2 sm:px-3 py-2">
              <div className="space-y-2 sm:space-y-3">
                {chatMessages.length === 0 && (
                  <p className="text-[11px] text-zinc-500 text-center mt-6 sm:mt-8">Aucun message</p>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={cn('flex flex-col', msg.userId === user?.id ? 'items-end' : 'items-start')}>
                    <span className="text-[9px] sm:text-[10px] text-zinc-500 mb-0.5">{msg.name}</span>
                    <div className={cn(
                      'max-w-[88%] rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs leading-relaxed break-words',
                      msg.userId === user?.id ? 'bg-indigo-600 text-white' : 'bg-zinc-800 text-zinc-100'
                    )}>
                      {msg.text}
                    </div>
                    <span className="text-[8px] sm:text-[9px] text-zinc-600 mt-0.5">
                      {new Date(msg.at).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>
            </ScrollArea>
            <form onSubmit={sendChatMessage} className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2 sm:py-3 border-t border-zinc-800">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Message…"
                className="flex-1 bg-zinc-800 text-[11px] sm:text-xs rounded-lg px-2.5 sm:px-3 py-1.5 sm:py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-500"
              />
              <button type="submit" disabled={!chatInput.trim()}
                className="text-zinc-400 hover:text-white disabled:opacity-30 transition-colors p-1">
                <Send className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Controls bar — responsive */}
      <div className="flex items-center justify-center gap-1 sm:gap-2 py-2 sm:py-4 px-2 bg-zinc-900/80 backdrop-blur border-t border-zinc-800 shrink-0">
        <ControlButton
          active={micOn}
          label={micOn ? 'Micro' : 'Muet'}
          icon={micOn ? <Mic className="h-4 w-4 sm:h-5 sm:w-5" /> : <MicOff className="h-4 w-4 sm:h-5 sm:w-5" />}
          onClick={toggleMic}
          variant={micOn ? 'default' : 'danger'}
        />
        <ControlButton
          active={camOn}
          label={camOn ? 'Caméra' : 'Cam. off'}
          icon={camOn ? <Video className="h-4 w-4 sm:h-5 sm:w-5" /> : <VideoOff className="h-4 w-4 sm:h-5 sm:w-5" />}
          onClick={toggleCam}
          variant={camOn ? 'default' : 'danger'}
        />
        <ControlButton
          active={sharing}
          label={sharing ? 'Arrêter' : 'Partager'}
          icon={sharing ? <MonitorOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <Monitor className="h-4 w-4 sm:h-5 sm:w-5" />}
          onClick={shareScreen}
          variant={sharing ? 'active' : 'default'}
        />
        <div className="relative">
          <ControlButton
            active={chatOpen}
            label="Chat"
            icon={<MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />}
            onClick={() => setChatOpen(o => !o)}
            variant={chatOpen ? 'active' : 'default'}
          />
          {unreadChat > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 sm:h-4 sm:w-4 rounded-full bg-indigo-500 text-[8px] sm:text-[9px] text-white flex items-center justify-center font-bold pointer-events-none">
              {unreadChat > 9 ? '9+' : unreadChat}
            </span>
          )}
        </div>

        <div className="w-px h-6 sm:h-10 bg-zinc-700 mx-0.5 sm:mx-1" />

        <button
          onClick={leaveMeeting}
          className="flex flex-col items-center gap-0.5 sm:gap-1 px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all text-[9px] sm:text-[10px] font-medium"
        >
          <PhoneOff className="h-4 w-4 sm:h-5 sm:w-5" />
          Quitter
        </button>
      </div>
    </div>
  )
}

// ── ControlButton helper ───────────────────────────────────────────────────────
function ControlButton({
  icon, label, onClick, variant = 'default',
}: {
  icon: React.ReactElement
  label: string
  onClick: () => void
  active?: boolean
  variant?: 'default' | 'danger' | 'active'
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-0.5 sm:gap-1 px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl transition-all text-[9px] sm:text-[10px] min-w-[44px] sm:min-w-0',
        variant === 'default' && 'bg-zinc-800 hover:bg-zinc-700 text-white',
        variant === 'danger' && 'bg-red-500/20 hover:bg-red-500/30 text-red-400',
        variant === 'active' && 'bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400',
      )}
    >
      {icon}
      <span className="hidden sm:block">{label}</span>
    </button>
  )
}
