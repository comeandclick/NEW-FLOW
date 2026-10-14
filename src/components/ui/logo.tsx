import { cn } from '@/lib/utils'
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={cn('shrink-0', className)} aria-hidden>
      {/* logo monochrome (DA 21st.dev, 14/10/2026) : carré de la couleur du texte, « F » de la couleur du fond */}
      <rect width="64" height="64" rx="16" className="fill-text" />
      <path d="M20 18h26v7H29v7h13v7H29v10h-9z" className="fill-bg" />
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
