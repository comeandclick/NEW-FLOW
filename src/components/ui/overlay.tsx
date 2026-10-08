'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n/provider'

function usePortalTarget() {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useEffect(() => setEl(document.body), [])
  return el
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
}

function useLockScroll(open: boolean) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])
}

export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title?: string; description?: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const target = usePortalTarget()
  const t = useT()
  useEscape(open, onClose)
  useLockScroll(open)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) setTimeout(() => panel.current?.querySelector<HTMLElement>('[autofocus],input,textarea,select,button')?.focus(), 30)
  }, [open])
  if (!target) return null
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[3px]" onClick={onClose} aria-hidden />
          <motion.div
            ref={panel} role="dialog" aria-modal="true" aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className={cn('relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border-strong bg-surface shadow-lg sm:rounded-2xl', widths[size])}>
            {(title || description) && (
              <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                <div className="min-w-0">
                  {title && <h2 className="truncate text-[15px] font-semibold">{title}</h2>}
                  {description && <p className="mt-0.5 text-[13px] text-text-3">{description}</p>}
                </div>
                <button onClick={onClose} aria-label={t('common.close')} className="rounded-md p-1 text-text-3 transition-colors hover:bg-surface-2 hover:text-text"><X className="size-4" /></button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-surface-2/40 px-5 py-3 safe-bottom">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  )
}

export function Sheet({ open, onClose, side = 'left', children, className }: { open: boolean; onClose: () => void; side?: 'left' | 'right'; children: ReactNode; className?: string }) {
  const target = usePortalTarget()
  useEscape(open, onClose)
  useLockScroll(open)
  if (!target) return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[90]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} />
          <motion.aside
            initial={{ x: side === 'left' ? '-100%' : '100%' }} animate={{ x: 0 }} exit={{ x: side === 'left' ? '-100%' : '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            className={cn('absolute top-0 h-full w-[300px] max-w-[85vw] border-border bg-surface shadow-lg', side === 'left' ? 'left-0 border-r' : 'right-0 border-l', className)}>
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    target,
  )
}

/** Popover menu anchored to a trigger. */
export function Menu({ trigger, children, align = 'start', width = 220, className }: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'start' | 'end'; width?: number; className?: string
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const anchor = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const target = usePortalTarget()
  const close = () => setOpen(false)
  useEscape(open, close)

  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const r = anchor.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = align === 'end' ? r.right - width : r.left
    left = Math.max(8, Math.min(left, vw - width - 8))
    const h = panel.current?.offsetHeight ?? 240
    let top = r.bottom + 6
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 6)
    setPos({ top, left })
  }, [open, align, width])

  useEffect(() => {
    if (!open) return
    const on = (e: MouseEvent) => {
      const n = e.target as Node
      if (!panel.current?.contains(n) && !anchor.current?.contains(n)) setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', on)
    window.addEventListener('resize', onScroll)
    return () => { document.removeEventListener('mousedown', on); window.removeEventListener('resize', onScroll) }
  }, [open])

  return (
    <>
      <span ref={anchor} className="inline-flex">{trigger({ open, toggle: () => setOpen((o) => !o) })}</span>
      {target && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div ref={panel} role="menu"
              initial={{ opacity: 0, scale: 0.97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.12 }}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width, zIndex: 120 }}
              className={cn('max-h-[70dvh] overflow-y-auto rounded-xl border border-border-strong bg-surface p-1 shadow-lg', className)}>
              {children(close)}
            </motion.div>
          )}
        </AnimatePresence>, target)}
    </>
  )
}

export function MenuItem({ icon, children, onClick, danger, active, shortcut, className }: {
  icon?: ReactNode; children: ReactNode; onClick?: () => void; danger?: boolean; active?: boolean; shortcut?: string; className?: string
}) {
  return (
    <button role="menuitem" onClick={onClick}
      className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2',
        danger ? 'text-danger' : 'text-text', active && 'bg-accent-soft text-accent-ink', className)}>
      {icon && <span className="flex size-4 shrink-0 items-center justify-center text-text-3">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="font-mono text-[10px] text-text-3">{shortcut}</span>}
    </button>
  )
}
export const MenuSeparator = () => <div className="my-1 h-px bg-border" />
export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-text-3">{children}</div>
