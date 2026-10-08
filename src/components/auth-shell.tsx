'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Wordmark } from '@/components/ui/logo'
import { LanguageToggle, ThemeToggle } from '@/components/ui/toggles'
import { useT } from '@/i18n/provider'

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  const t = useT()
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10" style={{ background: 'var(--glow)' }} />
      <header className="flex items-center justify-between px-4 py-4 safe-top sm:px-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-text-3 transition-colors hover:text-text"><ArrowLeft className="size-3.5" />{t('auth.back')}</Link>
        <div className="flex items-center gap-1"><LanguageToggle /><ThemeToggle /></div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-[400px]">
          <div className="mb-8 flex flex-col items-center text-center">
            <Wordmark className="mb-6 text-lg" />
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-sm text-text-2">{subtitle}</p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-md">{children}</div>
          {footer && <div className="mt-5 text-center text-sm text-text-2">{footer}</div>}
          <p className="mt-6 text-center text-xs text-text-3">{t('auth.terms')}</p>
        </motion.div>
      </main>
    </div>
  )
}
