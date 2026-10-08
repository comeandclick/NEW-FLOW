'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, Send, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatDuration } from '@/lib/utils'
import { signedUrl } from '@/lib/storage'
import type { Attachment } from '@/lib/types'

const BARS = 40

/** Voice note player: waveform, progress, speed (1x / 1.5x / 2x). */
export function VoicePlayer({ att, mine }: { att: Attachment; mine?: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null)
  const [src, setSrc] = useState<string>(att.url ?? '')
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [rate, setRate] = useState(1)
  const wave = att.waveform?.length ? att.waveform : Array.from({ length: BARS }, (_, i) => 30 + ((i * 37) % 50))

  useEffect(() => {
    let alive = true
    if (!att.url && att.path) signedUrl('voice', att.path).then((u) => alive && setSrc(u))
    return () => { alive = false }
  }, [att.url, att.path])

  useEffect(() => () => { audio.current?.pause() }, [])

  const toggle = async () => {
    const a = audio.current
    if (!a || !src) return
    if (playing) { a.pause(); return }
    try { a.playbackRate = rate; await a.play() } catch { /* autoplay blocked or decode error */ }
  }
  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1
    setRate(next)
    if (audio.current) audio.current.playbackRate = next
  }
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audio.current
    if (!a || !a.duration) return
    const r = e.currentTarget.getBoundingClientRect()
    a.currentTime = ((e.clientX - r.left) / r.width) * a.duration
  }

  return (
    <div className={cn('flex w-[260px] max-w-full items-center gap-2.5 rounded-2xl px-2.5 py-2', mine ? 'bg-accent text-white' : 'bg-surface-2')}>
      <audio ref={audio} src={src || undefined} preload="metadata"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setProgress(0) }}
        onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)} />
      <button onClick={toggle} disabled={!src} aria-label={playing ? 'Pause' : 'Play'}
        className={cn('flex size-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-90', mine ? 'bg-white/20 hover:bg-white/30' : 'bg-accent text-white hover:bg-accent-hover')}>
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 translate-x-px fill-current" />}
      </button>
      <div className="flex h-8 flex-1 cursor-pointer items-center gap-[2px]" onClick={seek} role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Seek">
        {wave.map((v, i) => (
          <span key={i} className={cn('w-[3px] flex-1 rounded-full transition-colors', i / wave.length < progress ? (mine ? 'bg-white' : 'bg-accent') : (mine ? 'bg-white/40' : 'bg-text-3/50'))}
            style={{ height: `${Math.max(14, Math.min(100, v))}%` }} />
        ))}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="text-[10px] tabular-nums opacity-80">{formatDuration(att.duration ?? 0)}</span>
        <button onClick={cycleRate} className={cn('rounded px-1 text-[10px] font-semibold tabular-nums', mine ? 'bg-white/20' : 'bg-surface-3')} aria-label="Speed">{rate}x</button>
      </div>
    </div>
  )
}

/** Record a voice note with live waveform. Calls onSend with the blob, duration and normalised waveform. */
export function VoiceRecorder({ onSend, onCancel }: { onSend: (blob: Blob, duration: number, waveform: number[]) => Promise<void>; onCancel: () => void }) {
  const [state, setState] = useState<'init' | 'recording' | 'sending' | 'error'>('init')
  const [elapsed, setElapsed] = useState(0)
  const [live, setLive] = useState<number[]>([])
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const samples = useRef<number[]>([])
  const raf = useRef<number | null>(null)
  const start = useRef(0)
  const stream = useRef<MediaStream | null>(null)
  const ctx = useRef<AudioContext | null>(null)
  const cancelled = useRef(false)

  const cleanup = () => {
    if (raf.current) cancelAnimationFrame(raf.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    void ctx.current?.close().catch(() => {})
  }

  useEffect(() => {
    let dead = false
    ;(async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        if (dead) { s.getTracks().forEach((t) => t.stop()); return }
        stream.current = s
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ac = new AC(); ctx.current = ac
        const analyser = ac.createAnalyser(); analyser.fftSize = 256
        ac.createMediaStreamSource(s).connect(analyser)
        const buf = new Uint8Array(analyser.fftSize)
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported?.(m))
        const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined)
        rec.current = r
        r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
        r.onstop = async () => {
          cleanup()
          if (cancelled.current) return
          const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' })
          const dur = (Date.now() - start.current) / 1000
          const raw = samples.current
          const step = Math.max(1, Math.floor(raw.length / BARS))
          const wave = Array.from({ length: BARS }, (_, i) => {
            const seg = raw.slice(i * step, (i + 1) * step)
            return seg.length ? Math.round(Math.min(100, (seg.reduce((a, b) => a + b, 0) / seg.length) * 260)) : 12
          })
          setState('sending')
          await onSend(blob, dur, wave)
        }
        r.start(250)
        start.current = Date.now()
        setState('recording')
        let last = 0
        const tick = () => {
          analyser.getByteTimeDomainData(buf)
          let peak = 0
          for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128)
          const now = Date.now()
          if (now - last > 90) { last = now; samples.current.push(peak); setLive((l) => [...l.slice(-BARS + 1), peak]); setElapsed((now - start.current) / 1000) }
          raf.current = requestAnimationFrame(tick)
        }
        tick()
      } catch { if (!dead) setState('error') }
    })()
    return () => { dead = true; cancelled.current = true; if (rec.current?.state === 'recording') rec.current.stop(); cleanup() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'error') return (
    <div className="flex items-center gap-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
      <Mic className="size-4" />Microphone indisponible / unavailable<Button size="xs" variant="ghost" className="ml-auto" onClick={onCancel}>OK</Button>
    </div>
  )
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border-strong bg-surface-2 p-1.5">
      <Button variant="ghost" size="icon" onClick={() => { cancelled.current = true; if (rec.current?.state === 'recording') rec.current.stop(); onCancel() }} aria-label="Cancel"><Trash2 className="size-4" /></Button>
      <span className="size-2 animate-pulse rounded-full bg-danger" />
      <span className="w-10 text-xs tabular-nums">{formatDuration(elapsed)}</span>
      <div className="flex h-8 flex-1 items-center gap-[2px] overflow-hidden">
        {live.map((v, i) => <span key={i} className="w-[3px] shrink-0 rounded-full bg-accent" style={{ height: `${Math.max(12, Math.min(100, v * 260))}%` }} />)}
      </div>
      <Button variant="primary" size="icon" loading={state === 'sending'} disabled={state !== 'recording'} onClick={() => rec.current?.state === 'recording' && rec.current.stop()} aria-label="Send">
        {state === 'sending' ? <Square className="size-3.5" /> : <Send className="size-4" />}
      </Button>
    </div>
  )
}
