'use client'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Spinner } from './spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'pill' | 'glass'
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-text hover:bg-accent-hover shadow-sm',
  secondary: 'bg-surface-3 text-text hover:bg-border-strong/60',
  outline: 'border border-border-strong bg-transparent text-text hover:bg-surface-2',
  ghost: 'text-text-2 hover:bg-surface-2 hover:text-text',
  danger: 'bg-[#c4262f] text-white hover:bg-[#b01f27]',
  pill: 'rounded-full bg-text text-bg hover:opacity-90 shadow-[0_8px_30px_-8px_var(--mk-glow,transparent)]',
  glass: 'rounded-full border border-border-strong bg-surface-2/70 text-text backdrop-blur hover:bg-surface-3',
}
const sizes: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs gap-1.5 rounded-md',
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-xl',
  icon: 'h-8 w-8 rounded-lg justify-center',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', loading, disabled, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center whitespace-nowrap font-medium transition-[background,color,transform,opacity,box-shadow] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  )
})
