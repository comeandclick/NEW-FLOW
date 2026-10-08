import { cn } from '@/lib/utils'
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id="flow-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b94f5" />
          <stop offset="1" stopColor="#5e6ad2" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#flow-logo)" />
      <path d="M20 18h26v7H29v7h13v7H29v10h-9z" fill="#fff" />
    </svg>
  )
}
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <Logo size={24} /> Flow
    </span>
  )
}
