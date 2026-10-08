'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Menu as MenuIcon, X } from 'lucide-react'
import { Wordmark } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'
import { LanguageToggle, ThemeToggle } from '@/components/ui/toggles'
import { useT } from '@/i18n/provider'
import { cn } from '@/lib/utils'

export function LandingNav() {
  const t = useT()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const links = [
    { href: '#features', label: t('nav.features') },
    { href: '#security', label: t('nav.security') },
    { href: '#faq', label: t('nav.faq') },
  ]
  return (
    <header className={cn('fixed inset-x-0 top-0 z-50 transition-all duration-300 safe-top', scrolled || open ? 'border-b border-border bg-bg/80 backdrop-blur-xl' : 'border-b border-transparent')}>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="Flow"><Wordmark /></Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="rounded-md px-3 py-1.5 text-[13px] text-text-2 transition-colors hover:text-text">{l.label}</a>
          ))}
        </nav>
        <div className="hidden items-center gap-1.5 md:flex">
          <LanguageToggle /><ThemeToggle />
          <Link href="/login"><Button variant="ghost" size="sm">{t('nav.login')}</Button></Link>
          <Link href="/register"><Button variant="primary" size="sm">{t('nav.start')}</Button></Link>
        </div>
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Button variant="ghost" size="icon" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="size-5" /> : <MenuIcon className="size-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="animate-fade-in border-t border-border px-4 pb-5 pt-3 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-[15px] text-text-2 hover:bg-surface-2">{l.label}</a>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <LanguageToggle size="sm" />
            <Link href="/login" className="flex-1"><Button variant="outline" className="w-full">{t('nav.login')}</Button></Link>
            <Link href="/register" className="flex-1"><Button variant="primary" className="w-full">{t('nav.start')}</Button></Link>
          </div>
        </div>
      )}
    </header>
  )
}
