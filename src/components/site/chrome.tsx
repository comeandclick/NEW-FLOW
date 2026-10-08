'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Menu as MenuIcon, X } from 'lucide-react'
import { Wordmark } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'
import { LanguageToggle, ThemeToggle } from '@/components/ui/toggles'
import { useT } from '@/i18n/provider'
import { cn } from '@/lib/utils'

export function SiteNav() {
  const t = useT()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 4)
    on(); window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  const links = [
    { href: '/features', label: t('s.nav.features') }, { href: '/pricing', label: t('s.nav.pricing') },
    { href: '/security', label: t('s.nav.security') }, { href: '/changelog', label: t('s.nav.changelog') },
  ]
  return (
    <header className={cn('sticky top-0 z-50 border-b bg-bg/90 backdrop-blur-md transition-colors safe-top', scrolled || open ? 'border-border' : 'border-transparent')}>
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-5">
        <Link href="/" aria-label="Flow"><Wordmark /></Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((l) => <Link key={l.href} href={l.href} className="rounded-md px-3 py-1.5 text-[13.5px] text-text-2 transition-colors hover:text-text">{l.label}</Link>)}
        </nav>
        <div className="hidden items-center gap-1 md:flex">
          <LanguageToggle /><ThemeToggle />
          <Link href="/login" className="px-3 py-1.5 text-[13.5px] text-text-2 hover:text-text">{t('nav.login')}</Link>
          <Link href="/register"><Button variant="primary" size="sm">{t('s.hero.cta')}</Button></Link>
        </div>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? <X className="size-5" /> : <MenuIcon className="size-5" />}</Button>
      </div>
      {open && (
        <div className="animate-fade-in border-t border-border px-5 pb-5 pt-3 md:hidden">
          <div className="flex flex-col">{links.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="border-b border-border/60 py-3 text-[15px]">{l.label}</Link>)}</div>
          <div className="mt-4 flex items-center gap-2"><LanguageToggle size="sm" /><ThemeToggle size="sm" />
            <Link href="/login" className="ml-auto"><Button variant="outline">{t('nav.login')}</Button></Link><Link href="/register"><Button variant="primary">{t('s.hero.cta')}</Button></Link></div>
        </div>
      )}
    </header>
  )
}

export function SiteFooter() {
  const t = useT()
  const col = (title: string, items: [string, string][]) => (
    <div><div className="mb-3 text-[13px] font-semibold">{title}</div><ul className="space-y-2">{items.map(([href, label]) => <li key={href}><Link href={href} className="text-[13.5px] text-text-3 transition-colors hover:text-text">{label}</Link></li>)}</ul></div>
  )
  return (
    <footer className="border-t border-border px-5 py-14">
      <div className="mx-auto grid max-w-[1120px] gap-10 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div><Wordmark /><p className="mt-3 max-w-[240px] text-[13.5px] text-text-3">{t('s.foot.tag')}</p></div>
        {col(t('s.foot.product'), [['/features', t('s.nav.features')], ['/pricing', t('s.nav.pricing')], ['/changelog', t('s.nav.changelog')], ['/demo', t('nav.demo')]])}
        {col(t('s.foot.company'), [['/about', t('s.nav.about')], ['/security', t('s.nav.security')], ['/contact', t('s.nav.contact')], ['/login', t('nav.login')]])}
        {col(t('s.foot.legal'), [['/legal/privacy', t('footer.privacy')], ['/legal/terms', t('footer.terms')], ['/legal/notice', t('footer.legalNotice')]])}
      </div>
      <p className="mx-auto mt-12 max-w-[1120px] text-xs text-text-3">© {new Date().getFullYear()} Flow. {t('footer.rights')}</p>
    </footer>
  )
}

export function CookieNotice() {
  const t = useT()
  const [hidden, setHidden] = useState(true)
  useEffect(() => { try { if (!localStorage.getItem('flow_cookie_ok')) setHidden(false) } catch { setHidden(false) } }, [])
  if (hidden) return null
  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-xl animate-slide-up items-center gap-3 rounded-xl border border-border-strong bg-surface p-3 pl-4 shadow-lg safe-bottom">
      <p className="flex-1 text-xs text-text-2">{t('cookies.text')}</p>
      <Button size="sm" variant="primary" onClick={() => { try { localStorage.setItem('flow_cookie_ok', '1') } catch {} setHidden(true) }}>{t('cookies.ok')}</Button>
    </div>
  )
}
