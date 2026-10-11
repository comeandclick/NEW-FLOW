'use client'
import Link from 'next/link'
import { Laptop, WifiOff } from 'lucide-react'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useStudio } from '@/lib/studio/store'
import { cn } from '@/lib/utils'

/** Pastille d'état du Mac relié. Mène à l'écran de connexion. */
export function BridgeChip({ online, offline, className }: { online: string; offline: string; className?: string }) {
  const { ws } = useWorkspace()
  const devices = useStudio((s) => s.devices)
  const on = devices.length > 0
  return (
    <Link href={`/app/${ws.slug}/site?tab=connect`}
      className={cn('inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors',
        on ? 'border-success/40 bg-success/10 text-text' : 'border-border-strong bg-surface text-text-2 hover:bg-surface-2', className)}>
      {on ? <Laptop className="size-3.5 text-success" /> : <WifiOff className="size-3.5" />}
      <span>{on ? `${online} · ${devices[0].name}` : offline}</span>
    </Link>
  )
}
