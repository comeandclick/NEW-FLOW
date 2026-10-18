import Image from 'next/image'
import { cn } from '@/lib/utils'
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  // logo « F en ruban avec ombre portée » (18/10/2026), même image que l'icône de l'app Flow Workspace
  return <Image src={size > 64 ? '/icons/icon-192.png' : '/icons/icon-64.png'} alt="" width={size} height={size} unoptimized className={cn('shrink-0', className)} aria-hidden />
}
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <Logo size={24} /> Flow
    </span>
  )
}
