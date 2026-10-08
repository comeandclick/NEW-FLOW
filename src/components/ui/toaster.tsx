'use client'
import { Toaster as Sonner } from 'sonner'
import { useTheme } from '@/components/providers/theme'

export function Toaster() {
  const { resolved } = useTheme()
  return (
    <Sonner
      theme={resolved}
      position="bottom-right"
      closeButton
      toastOptions={{
        style: {
          background: 'var(--surface)',
          color: 'var(--text)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-md)',
          borderRadius: '12px',
        },
      }}
    />
  )
}
