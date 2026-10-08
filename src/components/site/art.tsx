import { ArrowUp, Music2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Soft "glass" illustrations (pure CSS) used on numbered cards. */
const glass = 'border border-white/25 bg-gradient-to-br from-white/35 via-sky-300/15 to-blue-500/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.5),0_18px_40px_-12px_rgba(40,90,255,0.55)] backdrop-blur-md'
const sphere = 'rounded-full bg-[radial-gradient(circle_at_30%_25%,#fff_0%,#bcd6ff_18%,#4f86ff_50%,#12296b_100%)] shadow-[0_20px_50px_-10px_rgba(60,110,255,0.7)]'

export type ArtKind = 'sphere' | 'tiles' | 'bars' | 'arrow' | 'orbit' | 'cube'

export function GlassArt({ kind, className }: { kind: ArtKind; className?: string }) {
  return (
    <div aria-hidden className={cn('relative isolate aspect-[16/9] overflow-hidden bg-[radial-gradient(70%_90%_at_50%_0%,var(--art-a),transparent_70%),linear-gradient(180deg,var(--art-b),var(--art-c))]', className)}>
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(60,110,255,0.28),transparent)]" />
      {kind === 'sphere' && <>
        <div className={cn('absolute left-[18%] top-[22%] size-[34%] animate-drift', sphere)} />
        <div className={cn('absolute right-[18%] top-[48%] size-[16%] animate-drift [animation-delay:-2s]', sphere)} />
        <div className={cn('absolute left-[52%] top-[12%] size-[9%] animate-drift [animation-delay:-4s]', sphere)} />
      </>}
      {kind === 'tiles' && [0, 1, 2].map((i) => (
        <div key={i} className={cn('absolute size-[34%] rounded-[22%] animate-drift', glass)} style={{ left: `${22 + i * 14}%`, top: `${44 - i * 14}%`, animationDelay: `${-i * 1.6}s` }} />
      ))}
      {kind === 'bars' && <>
        <div className="absolute inset-x-[16%] bottom-[16%] flex h-[58%] items-end justify-between gap-[3%]">
          {[40, 75, 55, 95, 65, 45, 80].map((h, i) => <div key={i} className={cn('flex-1 rounded-full', glass)} style={{ height: `${h}%` }} />)}
        </div>
        <Music2 className="absolute right-[12%] top-[16%] size-[18%] text-sky-200 drop-shadow-[0_0_14px_rgba(120,170,255,0.9)]" strokeWidth={1.4} />
      </>}
      {kind === 'arrow' && (
        <div className={cn('absolute left-1/2 top-1/2 flex size-[40%] -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] items-center justify-center rounded-[26%] animate-drift', glass)}>
          <ArrowUp className="size-1/2 text-sky-100 drop-shadow-[0_0_16px_rgba(140,190,255,1)]" strokeWidth={2.2} />
        </div>
      )}
      {kind === 'orbit' && <>
        <div className="absolute left-1/2 top-1/2 size-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/40" />
        <div className="absolute left-1/2 top-1/2 size-[40%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-300/30" />
        <div className={cn('absolute left-1/2 top-1/2 size-[18%] -translate-x-1/2 -translate-y-1/2 animate-drift', sphere)} />
        <div className={cn('absolute left-[26%] top-[20%] size-[7%]', sphere)} /><div className={cn('absolute right-[24%] bottom-[18%] size-[9%]', sphere)} />
      </>}
      {kind === 'cube' && (
        <div className="absolute left-1/2 top-1/2 size-[34%] -translate-x-1/2 -translate-y-1/2 animate-drift [transform-style:preserve-3d]">
          <div className={cn('absolute inset-0 rounded-[16%] [transform:rotate(45deg)_skew(-12deg,-12deg)]', glass)} />
          <div className={cn('absolute inset-[18%] rounded-[16%] [transform:rotate(45deg)_skew(-12deg,-12deg)]', glass)} />
        </div>
      )}
    </div>
  )
}
