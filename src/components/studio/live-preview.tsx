'use client'
import { useEffect, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { useI18n } from '@/i18n/provider'
import { studioCopy } from '@/lib/studio/copy'
import { studioApi, usePoll } from '@/lib/studio/api'
import { cn } from '@/lib/utils'

/** Ce que fait le Mac, en direct : la page locale du site et le logiciel de montage (captures rafraîchies toutes les 3 s). */
export function LivePreview({ jobId, active, className }: { jobId: string; active: boolean; className?: string }) {
  const { locale } = useI18n()
  const c = studioCopy(locale).live
  const { data } = usePoll(() => studioApi.preview(jobId), active ? 3000 : 15000, true)
  const [, tick] = useState(0)
  const [big, setBig] = useState<string | null>(null)
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id) }, [])
  useEffect(() => { if (!big) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setBig(null) }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [big])
  const slots = (['editor', 'site'] as const).filter((k) => data?.slots[k])
  if (!slots.length) return <p className={cn('rounded-lg bg-surface-2 px-3 py-6 text-center text-[13px] text-text-3', className)}>{active ? c.previewWaiting : c.previewNone}</p>
  return (
    <div className={cn('grid gap-3', slots.length > 1 && 'md:grid-cols-2', className)}>
      {slots.map((k) => {
        const s = data!.slots[k]
        const age = Math.max(0, Math.round((Date.now() - new Date(s.at).getTime()) / 1000))
        return (
          <figure key={k} className="overflow-hidden rounded-lg border border-border bg-surface-2">
            <figcaption className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-text-2">
              <span className="truncate font-medium">{k === 'site' ? c.previewSite : c.previewEditor}</span>
              <span className="flex items-center gap-2 text-text-3"><span aria-live="off">{age} {c.seconds}</span>
                <button type="button" onClick={() => setBig(k)} aria-label={c.fullscreen} className="rounded p-0.5 hover:bg-surface-3"><Maximize2 className="size-3.5" /></button></span>
            </figcaption>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.url} alt={k === 'site' ? c.previewSite : c.previewEditor} className="aspect-[16/10] w-full bg-black object-contain" />
          </figure>
        )
      })}
      {big && data?.slots[big] && (
        <div role="dialog" aria-modal="true" aria-label={c.fullscreen} className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setBig(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.slots[big].url} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  )
}
