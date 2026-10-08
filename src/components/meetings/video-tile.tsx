'use client'
import { useEffect, useRef } from 'react'
import { Hand, MicOff, MonitorUp } from 'lucide-react'
import { Avatar } from '@/components/ui/misc'
import { cn } from '@/lib/utils'
import type { Participant } from '@/lib/webrtc/room'
import { useT } from '@/i18n/provider'

export function VideoTile({ p, big, className }: { p: Participant; big?: boolean; className?: string }) {
  const t = useT()
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && el.srcObject !== p.stream) el.srcObject = p.stream
    el?.play().catch(() => {})
  }, [p.stream, p.video])
  const showVideo = p.video && p.stream && p.stream.getVideoTracks().length > 0
  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-border bg-surface-2', className)}>
      <video ref={ref} autoPlay playsInline muted={p.local} className={cn('size-full bg-black', p.sharing ? 'object-contain' : 'object-cover', p.local && !p.sharing && '[transform:scaleX(-1)]', !showVideo && 'hidden')} />
      {!showVideo && <div className="flex size-full items-center justify-center"><Avatar name={p.name} size={big ? 96 : 64} /></div>}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2.5 text-white">
        <span className="min-w-0 truncate text-xs font-medium">{p.local ? `${p.name} (${t('meet.you')})` : p.name}</span>
        {p.sharing && <MonitorUp className="size-3.5 shrink-0" />}
        {!p.audio && <MicOff className="size-3.5 shrink-0 text-danger" />}
      </div>
      {p.hand && <span className="absolute right-2 top-2 flex size-8 animate-bounce items-center justify-center rounded-full bg-warning text-black"><Hand className="size-4" /></span>}
    </div>
  )
}
