'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu as MenuIcon, X } from 'lucide-react'
import { Wordmark } from '@/components/ui/logo'
import { Button } from '@/components/ui/button'
import { LanguageToggle, ThemeToggle } from '@/components/ui/toggles'
import { useT } from '@/i18n/provider'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { id: 'fonctionnalites', key: 'v.nav.features' },
  { id: 'agents', key: 'v.nav.agents' },
  { id: 'regles', key: 'v.nav.rules' },
  { id: 'tarif', key: 'v.nav.price' },
  { id: 'faq', key: 'v.nav.faq' },
] as const

/** Sticky top bar with scroll-spy. */
export function SiteNav() {
  const t = useT()
  const pathname = usePathname()
  const home = pathname === '/'
  const [active, setActive] = useState<string>('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!home) return
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) setActive(visible.target.id)
    }, { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.2, 0.5] })
    els.forEach((e) => io.observe(e))
    const onTop = () => { if (window.scrollY < 300) setActive('') }
    window.addEventListener('scroll', onTop, { passive: true })
    return () => { io.disconnect(); window.removeEventListener('scroll', onTop) }
  }, [home])

  const href = (id: string) => (home ? `#${id}` : `/#${id}`)
  const night = home // the homepage sits on the night-blue hero: floating glass bar, like the reference page
  return (
    <header className={cn('z-50 safe-top', night ? 'mk-night fixed inset-x-0 top-3 bg-transparent px-3 text-text' : 'sticky top-0 border-b border-border bg-bg/92 backdrop-blur-md')}>
      <div className={cn(night ? 'mx-auto max-w-[1080px] rounded-2xl border border-white/10 bg-[#070c19]/70 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6)] backdrop-blur-2xl' : 'mx-auto max-w-[1120px]')}>
        <div className={cn('flex h-14 items-center justify-between gap-3', night ? 'pl-4 pr-2.5' : 'px-5')}>
          <Link href="/" aria-label="Flow"><Wordmark /></Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {SECTIONS.map((s) => (
              <a key={s.id} href={href(s.id)} aria-current={active === s.id ? 'true' : undefined}
                className={cn('relative text-[14px] transition-colors', night ? 'rounded-full px-3.5 py-1.5' : 'mx-3 py-1', active === s.id ? 'text-text' : 'text-text-2 hover:text-text', night && active === s.id && 'bg-surface-3')}>
                {t(s.key)}{!night && active === s.id && <span className="absolute inset-x-0 -bottom-[17px] h-0.5 bg-accent" />}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <span className="hidden sm:flex"><LanguageToggle /><ThemeToggle /></span>
            <Link href="/login" className="hidden px-3 py-1.5 text-[14px] text-text-2 hover:text-text md:block">{t('nav.login')}</Link>
            <Link href="/register" className="hidden sm:block">{night
              ? <Button variant="pill" size="sm" className="rounded-full bg-white px-4 text-[#05070d]">{t('v.nav.cta')}</Button>
              : <Button variant="primary" size="sm" className="rounded-md px-4">{t('v.nav.cta')}</Button>}</Link>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? <X className="size-5" /> : <MenuIcon className="size-5" />}</Button>
          </div>
        </div>
        {open && (
          <div className={cn('animate-fade-in border-t border-border px-5 pb-4 pt-2 lg:hidden', !night && 'bg-bg')}>
            {SECTIONS.map((s) => <a key={s.id} href={href(s.id)} onClick={() => setOpen(false)} className="block border-b border-border/60 py-3 text-[16px] text-text-2 hover:text-text">{t(s.key)}</a>)}
            <div className="mt-3 flex items-center gap-1"><LanguageToggle size="sm" /><ThemeToggle size="sm" /><Link href="/login" className="ml-auto px-3 text-[14px] text-text-2">{t('nav.login')}</Link></div>
            <Link href="/register" className="mt-3 block"><Button variant="primary" size="lg" className="w-full rounded-md">{t('v.nav.cta')}</Button></Link>
          </div>
        )}
      </div>
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
      <div className="mx-auto grid max-w-[1080px] gap-10 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div><Wordmark /><p className="mt-3 max-w-[240px] text-[13.5px] text-text-3">{t('s.foot.tag')}</p></div>
        {col(t('s.foot.product'), [['/features', t('s.nav.features')], ['/pricing', t('s.nav.pricing')], ['/changelog', t('s.nav.changelog')], ['/demo', t('nav.demo')]])}
        {col(t('s.foot.company'), [['/about', t('s.nav.about')], ['/security', t('s.nav.security')], ['/contact', t('s.nav.contact')], ['/login', t('nav.login')]])}
        {col(t('s.foot.legal'), [['/legal/privacy', t('footer.privacy')], ['/legal/terms', t('footer.terms')], ['/legal/notice', t('footer.legalNotice')]])}
      </div>
      <p className="mx-auto mt-12 max-w-[1080px] text-xs text-text-3">© {new Date().getFullYear()} Flow. {t('footer.rights')}</p>
    </footer>
  )
}

export function CookieNotice() {
  const t = useT()
  const [hidden, setHidden] = useState(true)
  useEffect(() => { try { if (!localStorage.getItem('flow_cookie_ok')) setHidden(false) } catch { setHidden(false) } }, [])
  if (hidden) return null
  return (
    <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-xl animate-slide-up items-center gap-3 rounded-lg border border-border-strong bg-surface p-3 pl-4 shadow-lg safe-bottom">
      <p className="flex-1 text-xs text-text-2">{t('cookies.text')}</p>
      <Button size="sm" variant="primary" onClick={() => { try { localStorage.setItem('flow_cookie_ok', '1') } catch {} setHidden(true) }}>{t('cookies.ok')}</Button>
    </div>
  )
}
