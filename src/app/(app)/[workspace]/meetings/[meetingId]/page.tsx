'use client'

import { use, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Users
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
  stream: MediaStream
  name?: string
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

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
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())
  const signalingChannel = useRef<RealtimeChannel | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const supabase = getSupabaseClient()
  const myName = profile?.full_name ?? user?.email ?? 'Moi'

  // ── WebRTC peer factory ────────────────────────────────────────────────────
  function createPeerConnection(remoteUserId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    // Add local tracks
    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!)
    })

    // ICE candidates → broadcast
    pc.onicecandidate = ({ candidate }) => {
      if (!candidate) return
      signalingChannel.current?.send({
        type: 'broadcast',
        event: 'ice-candidate',
        payload: { to: remoteUserId, from: user?.id, candidate: candidate.toJSON() },
      })
    }

    // Remote track → add to peers state
    pc.ontrack = ({ streams }) => {
      if (!streams[0]) return
      setPeers((prev) => {
        const exists = prev.find((p) => p.userId === remoteUserId)
        if (exists) return prev.map((p) => p.userId === remoteUserId ? { ...p, stream: streams[0] } : p)
        return [...prev, { userId: remoteUserId, stream: streams[0] }]
      })
    }

    // Connection state change
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setPeers((prev) => prev.filter((p) => p.userId !== remoteUserId))
        peerConnections.current.delete(remoteUserId)
      }
    }

    peerConnections.current.set(remoteUserId, pc)
    return pc
  }

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
        // Try audio-only
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

  // ── Signaling channel (runs after meeting loaded) ─────────────────────────
  useEffect(() => {
    if (!meeting?.room_id || !user?.id) return

    const channel = supabase.channel(`meeting-signal-${meeting.room_id}`, {
      config: { broadcast: { self: false } },
    })

    channel
      // New user joined → I create offer to them
      .on('broadcast', { event: 'user-joined' }, async ({ payload }) => {
        const { userId: remoteId, name: remoteName } = payload as { userId: string; name: string }
        if (remoteId === user.id) return
        // Update name if peer already in state
        setPeers((prev) => prev.map((p) => p.userId === remoteId ? { ...p, name: remoteName } : p))
        const pc = createPeerConnection(remoteId)
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        channel.send({
          type: 'broadcast', event: 'offer',
          payload: { to: remoteId, from: user.id, sdp: pc.localDescription },
        })
      })
      // Incoming offer → send answer
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
      // Incoming answer → finalize connection
      .on('broadcast', { event: 'answer' }, async ({ payload }) => {
        const { to, from, sdp } = payload as { to: string; from: string; sdp: RTCSessionDescriptionInit }
        if (to !== user.id) return
        const pc = peerConnections.current.get(from)
        if (pc && pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp))
        }
      })
      // ICE candidate
      .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        const { to, from, candidate } = payload as { to: string; from: string; candidate: RTCIceCandidateInit }
        if (to !== user.id) return
        const pc = peerConnections.current.get(from)
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
      })
      // User left
      .on('broadcast', { event: 'user-left' }, ({ payload }) => {
        const { userId: remoteId } = payload as { userId: string }
        setPeers((prev) => prev.filter((p) => p.userId !== remoteId))
        peerConnections.current.get(remoteId)?.close()
        peerConnections.current.delete(remoteId)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Announce to room
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
        payload: { userId: user.id },
      }).then(() => channel.unsubscribe()).catch(() => channel.unsubscribe())
    }
  }, [meeting?.room_id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controls ──────────────────────────────────────────────────────────────
  function toggleMic() {
    if (!localStream) return
    const track = localStream.getAudioTracks()[0]
    if (track) { track.enabled = !track.enabled; setMicOn(track.enabled) }
  }

  function toggleCam() {
    if (!localStream) return
    const track = localStream.getVideoTracks()[0]
    if (track) { track.enabled = !track.enabled; setCamOn(track.enabled) }
  }

  async function shareScreen() {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true })
      setSharing(true)
      if (localVideoRef.current) localVideoRef.current.srcObject = screen
      // Replace video track in all peer connections
      const screenTrack = screen.getVideoTracks()[0]
      peerConnections.current.forEach((pc) => {
        pc.getSenders().find((s) => s.track?.kind === 'video')?.replaceTrack(screenTrack)
      })
      screenTrack.onended = () => {
        setSharing(false)
        if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream
        const origTrack = localStream?.getVideoTracks()[0]
        if (origTrack) {
          peerConnections.current.forEach((pc) => {
            pc.getSenders().find((s) => s.track?.kind === 'video')?.replaceTrack(origTrack)
          })
        }
      }
    } catch {
      toast.error('Partage d\'écran annulé')
    }
  }

  async function leaveMeeting() {
    signalingChannel.current?.send({
      type: 'broadcast', event: 'user-left', payload: { userId: user?.id },
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

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-zinc-100">{meeting?.title ?? 'Réunion'}</span>
          <Badge className="bg-green-500/20 text-green-400 text-[10px]">LIVE</Badge>
        </div>
        <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
          <Users className="h-3.5 w-3.5" />
          <span>{1 + peers.length} participant{peers.length !== 0 ? 's' : ''}</span>
        </div>
      </div>

      {/* Video grid */}
      <div className="flex-1 p-4 grid gap-3 auto-rows-fr grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 overflow-auto">
        {/* Local */}
        <div className="relative bg-zinc-900 rounded-xl overflow-hidden aspect-video">
          <video ref={localVideoRef} autoPlay muted playsInline
            className={cn('w-full h-full object-cover', !camOn && 'hidden')} />
          {!camOn && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-zinc-700 flex items-center justify-center">
                <span className="text-2xl font-bold text-zinc-300">{myName[0]?.toUpperCase()}</span>
              </div>
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <span className="text-xs text-white bg-black/50 rounded px-1.5 py-0.5">Vous</span>
            {!micOn && <MicOff className="h-3 w-3 text-red-400" />}
          </div>
        </div>

        {/* Remote peers */}
        {peers.map((peer) => (
          <div key={peer.userId} className="relative bg-zinc-900 rounded-xl overflow-hidden aspect-video">
            <video autoPlay playsInline
              ref={(el) => { if (el) el.srcObject = peer.stream }}
              className="w-full h-full object-cover" />
            <div className="absolute bottom-2 left-2">
              <span className="text-xs text-white bg-black/50 rounded px-1.5 py-0.5">
                {peer.name ?? peer.userId.slice(0, 8)}
              </span>
            </div>
          </div>
        ))}

        {/* Waiting state */}
        {peers.length === 0 && (
          <div className="hidden sm:flex items-center justify-center aspect-video bg-zinc-900/50 rounded-xl border-2 border-dashed border-zinc-800">
            <div className="text-center space-y-1">
              <Users className="h-6 w-6 text-zinc-600 mx-auto" />
              <p className="text-xs text-zinc-500">En attente de participants…</p>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 py-4 bg-zinc-900 border-t border-zinc-800">
        <Button variant="ghost" size="icon"
          className={cn('h-10 w-10 rounded-full', !micOn && 'bg-red-500/20 text-red-400 hover:bg-red-500/30')}
          onClick={toggleMic}>
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon"
          className={cn('h-10 w-10 rounded-full', !camOn && 'bg-red-500/20 text-red-400 hover:bg-red-500/30')}
          onClick={toggleCam}>
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
        <Button variant="ghost" size="icon"
          className={cn('h-10 w-10 rounded-full', sharing && 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30')}
          onClick={shareScreen}>
          <Monitor className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon"
          className="h-10 w-10 rounded-full bg-red-500 hover:bg-red-600 text-white"
          onClick={leaveMeeting}>
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
