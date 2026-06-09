'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

interface AlertDialogContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const AlertDialogContext = React.createContext<AlertDialogContextValue>({
  open: false,
  onOpenChange: () => {},
})

function AlertDialog({ open, onOpenChange, children }: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = open !== undefined
  const isOpen = isControlled ? open : internalOpen
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen

  return (
    <AlertDialogContext.Provider value={{ open: isOpen, onOpenChange: setOpen }}>
      {children}
    </AlertDialogContext.Provider>
  )
}

function AlertDialogTrigger({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) {
  const { onOpenChange } = React.useContext(AlertDialogContext)
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
      onClick: () => onOpenChange(true),
    })
  }
  return (
    <button onClick={() => onOpenChange(true)}>{children}</button>
  )
}

function AlertDialogContent({ className, children }: { className?: string; children: React.ReactNode }) {
  const { open, onOpenChange } = React.useContext(AlertDialogContext)
  if (!open) return null
  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/80"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
          'w-full max-w-lg bg-background border border-border rounded-xl shadow-xl p-6',
          className
        )}
        role="alertdialog"
      >
        {children}
      </div>
    </>
  )
}

function AlertDialogHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('space-y-2 mb-4', className)}>{children}</div>
}

function AlertDialogFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex justify-end gap-3 mt-6', className)}>{children}</div>
  )
}

function AlertDialogTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h2 className={cn('text-lg font-semibold', className)}>{children}</h2>
}

function AlertDialogDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn('text-sm text-muted-foreground', className)}>{children}</p>
}

function AlertDialogAction({ className, onClick, children }: {
  className?: string
  onClick?: () => void
  children: React.ReactNode
}) {
  const { onOpenChange } = React.useContext(AlertDialogContext)
  return (
    <Button
      className={className}
      onClick={() => { onClick?.(); onOpenChange(false) }}
    >
      {children}
    </Button>
  )
}

function AlertDialogCancel({ className, children }: { className?: string; children: React.ReactNode }) {
  const { onOpenChange } = React.useContext(AlertDialogContext)
  return (
    <Button variant="outline" className={className} onClick={() => onOpenChange(false)}>
      {children}
    </Button>
  )
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
