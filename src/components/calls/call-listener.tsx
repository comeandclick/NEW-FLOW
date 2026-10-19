'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Phone, PhoneOff, Video } from 'lucide-react'
import { Avatar } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { getDb } from '@/lib/supabase/client'
import { useSession } from '@/lib/hooks/use-session'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { showSystemNotification } from '@/lib/push'
import { registerRingChannel, type RingPayload, ringEvent } from '@/lib/calls'
import { useI18n } from '@/i18n/provider'

/** Listens for incoming calls on the workspace channel and shows a ringing overlay. */
export function CallListener() {
  const { userId } = useSession()
  const { ws, profileOf } = useWorkspace()
  const { t } = useI18n()
  const router = useRouter()
  const [incoming, setIncoming] = useState<RingPayload | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!userId) return
    const db = getDb()
    const ch = db.channel(`ring:${ws.id}`)
      .on('broadcast', { event: 'ring' }, ({ payload }: { payload: RingPayload }) => {
        if (!payload.to.includes(userId) || payload.from === userId) return
        setIncoming(payload)
        showSystemNotification(payload.fromName, payload.video ? t('msg.videoCall') : t('msg.audioCall'), `/app/${payload.slug}/meetings/${payload.meetingId}`)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setIncoming(null), 30_000)
      })
      // L'appelant a raccroché avant la réponse : la sonnerie s'arrête.
      .on('broadcast', { event: 'end' }, ({ payload }: { payload: { meetingId?: string } }) => {
        setIncoming((cur) => (cur && cur.meetingId === payload.meetingId ? null : cur))
      })
      // L'appelé a refusé : la page de l'appel en cours (côté appelant) l'affiche.
      .on('broadcast', { event: 'decline' }, ({ payload }: { payload: { meetingId?: string; from?: string } }) => {
        window.dispatchEvent(new CustomEvent('flow:call-declined', { detail: payload }))
      })
      .subscribe()
    registerRingChannel(ws.id, ch)
    return () => { registerRingChannel(ws.id, null); if (timer.current) clearTimeout(timer.current); void db.removeChannel(ch) }
  }, [userId, ws.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Simple ringtone using WebAudio (no asset needed).
  useEffect(() => {
    if (!incoming) return
    let stop = false
    let ctx: AudioContext | null = null
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const beep = (at: number) => {
        const o = ctx!.createOscillator(); const g = ctx!.createGain()
        o.frequency.value = 880; g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.12, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35)
        o.connect(g).connect(ctx!.destination); o.start(at); o.stop(at + 0.4)
      }
      const loop = () => { if (stop || !ctx) return; beep(ctx.currentTime); beep(ctx.currentTime + 0.5); setTimeout(loop, 2400) }
      loop()
    } catch { /* audio not allowed before a user gesture */ }
    return () => { stop = true; void ctx?.close().catch(() => {}) }
  }, [incoming])

  const accept = () => {
    if (!incoming) return
    const p = incoming; setIncoming(null)
    router.push(`/app/${p.slug}/meetings/${p.meetingId}?audio=${p.video ? 0 : 1}`)
  }
  const from = incoming ? profileOf(incoming.from) : null

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div initial={{ opacity: 0, y: -24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -24 }}
          className="fixed left-1/2 top-4 z-[130] w-[min(92vw,380px)] -translate-x-1/2 rounded-2xl border border-border-strong bg-surface p-4 shadow-lg" role="alertdialog" aria-label={incoming.fromName}>
          <audio ref={audio} />
          <div className="flex items-center gap-3">
            <span className="animate-pulse-ring rounded-full"><Avatar name={from?.full_name ?? incoming.fromName} src={from?.avatar_url} size={48} /></span>
            <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-semibold">{incoming.fromName}</div>
              <div className="truncate text-xs text-text-2">{incoming.video ? t('msg.videoCall') : t('msg.audioCall')} · {incoming.title}</div></div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1 bg-[#c4262f] text-white hover:bg-[#b01f27]" onClick={() => { ringEvent(ws.id, 'decline', { meetingId: incoming.meetingId, from: userId }); setIncoming(null) }}><PhoneOff className="size-4" /></Button>
            <Button variant="primary" className="flex-[2] bg-[#15803d] hover:bg-[#126c33]" onClick={accept}>{incoming.video ? <Video className="size-4" /> : <Phone className="size-4" />}{t('msg.joinCall')}</Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
