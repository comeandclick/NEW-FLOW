'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Logo } from '@/components/ui/logo'
import { LanguageToggle } from '@/components/ui/toggles'
import { useT } from '@/i18n/provider'

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  const t = useT()
  // d'après 21st.dev « modern-stunning-sign-in » (14/10/2026) : page toujours sombre (#121212), carte en verre dégradé,
  // logo dans un rond, champs pleins arrondis, boutons en pilule. data-theme="dark" force les couleurs sombres de Flow ici.
  return (
    <div data-theme="dark" className="auth-sombre relative flex min-h-dvh flex-col overflow-hidden bg-[#121212] text-text">
      <div className="pointer-events-none absolute inset-0 -z-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(255_255_255/0.07),transparent_70%)]" />
      <header className="relative z-10 flex items-center justify-between px-4 py-4 safe-top sm:px-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-text-3 transition-colors hover:text-text"><ArrowLeft className="size-3.5" />{t('auth.back')}</Link>
        <div className="flex items-center gap-1"><LanguageToggle /></div>
      </header>
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 pb-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="auth-carte flex w-full max-w-sm flex-col items-center rounded-3xl bg-gradient-to-r from-white/[0.07] to-[#121212] p-8 shadow-2xl backdrop-blur-sm">
          <div className="mb-6 grid size-12 place-items-center rounded-full bg-white/20 shadow-lg"><Logo size={26} /></div>
          <h1 className="text-center text-2xl font-semibold text-white">{title}</h1>
          <p className="mb-6 mt-1.5 text-center text-sm text-[#a1a1a1]">{subtitle}</p>
          <div className="w-full">{children}</div>
          {footer && <div className="mt-4 w-full text-center text-xs text-[#a1a1a1]">{footer}</div>}
        </motion.div>
        <p className="mt-10 max-w-sm text-center text-xs text-[#8b8b8b]">{t('auth.terms')}</p>
      </main>
    </div>
  )
}
