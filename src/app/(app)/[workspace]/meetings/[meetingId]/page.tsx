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

interface Props {
  params: Promise<{ workspace: string; meetingId: string }>
}

interface Peer {
  userId: string
  stream: MediaStream
  name?: string
}

export default function MeetingRoomPage({ params }: Props) {
  const { workspace: slug, meetingId } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [sharing, setSharing] = useState(false)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map())

  const supabase = getSupabaseClient()

  useEffect(() => {
    // Load meeting
    supabase
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .single()
      .then(({ data }) => {
        if (data) setMeeting(data)
        else { toast.error('Meeting not found'); router.push(`/${slug}/meetings`) }
      })

    // Get local media
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        setLocalStream(stream)
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
      })
      .catch(() => toast.error('Camera/mic access denied'))

    // Update status to active
    supabase.from('meetings').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', meetingId)

    // Join as participant
    if (user?.id) {
      supabase.from('meeting_participants').insert({ meeting_id: meetingId, user_id: user.id, joined_at: new Date().toISOString() }).then(() => {})
    }

    return () => {
      localStream?.getTracks().forEach((t) => t.stop())
      peerConnections.current.forEach((pc) => pc.close())
    }
  }, [meetingId]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleMic() {
    if (!localStream) return
    const audioTrack = localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      setMicOn(audioTrack.enabled)
    }
  }

  function toggleCam() {
    if (!localStream) return
    const videoTrack = localStream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      setCamOn(videoTrack.enabled)
    }
  }

  async function shareScreen() {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true })
      setSharing(true)
      if (localVideoRef.current) localVideoRef.current.srcObject = screen
      screen.getVideoTracks()[0].onended = () => {
        setSharing(false)
        if (localStream && localVideoRef.current) localVideoRef.current.srcObject = localStream
      }
    } catch {
      toast.error('Screen share cancelled')
    }
  }

  async function leaveMeeting() {
    localStream?.getTracks().forEach((t) => t.stop())
    if (user?.id) {
      await supabase
        .from('meeting_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('meeting_id', meetingId)
        .eq('user_id', user.id)
    }
    router.push(`/${slug}/meetings`)
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-zinc-900 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-zinc-100">{meeting?.title ?? 'Meeting'}</span>
          <Badge className="bg-green-500/20 text-green-400 text-[10px]">LIVE</Badge>
        </div>
        <div className="flex items-center gap-1.5 text-zinc-400 text-xs">
          <Users className="h-3.5 w-3.5" />
          <span>{1 + peers.length} participant{peers.length !== 0 ? 's' : ''}</span>
        </div>
      </div>

      {/* Video grid */}
      <div className="flex-1 p-4 grid gap-3 auto-rows-fr grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 overflow-auto">
        {/* Local video */}
        <div className="relative bg-zinc-900 rounded-xl overflow-hidden aspect-video">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={cn('w-full h-full object-cover', !camOn && 'hidden')}
          />
          {!camOn && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-16 w-16 rounded-full bg-zinc-700 flex items-center justify-center">
                <span className="text-2xl font-bold text-zinc-300">
                  {user?.email?.[0]?.toUpperCase() ?? 'Y'}
                </span>
              </div>
            </div>
          )}
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            <span className="text-xs text-white bg-black/50 rounded px-1.5 py-0.5">You</span>
            {!micOn && <MicOff className="h-3 w-3 text-red-400" />}
          </div>
        </div>

        {/* Remote peers */}
        {peers.map((peer) => (
          <div key={peer.userId} className="relative bg-zinc-900 rounded-xl overflow-hidden aspect-video">
            <video
              autoPlay
              playsInline
              ref={(el) => { if (el) el.srcObject = peer.stream }}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-2 left-2">
              <span className="text-xs text-white bg-black/50 rounded px-1.5 py-0.5">
                {peer.name ?? peer.userId.slice(0, 8)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 py-4 bg-zinc-900 border-t border-zinc-800">
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-10 w-10 rounded-full', !micOn && 'bg-red-500/20 text-red-400 hover:bg-red-500/30')}
          onClick={toggleMic}
        >
          {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-10 w-10 rounded-full', !camOn && 'bg-red-500/20 text-red-400 hover:bg-red-500/30')}
          onClick={toggleCam}
        >
          {camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-10 w-10 rounded-full', sharing && 'bg-blue-500/20 text-blue-400')}
          onClick={shareScreen}
        >
          <Monitor className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full bg-red-500 hover:bg-red-600 text-white"
          onClick={leaveMeeting}
        >
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
