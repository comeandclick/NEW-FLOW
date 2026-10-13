'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { PairResume } from '@/components/studio/pair-resume'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Check, ChevronsLeft, ChevronsRight, LayoutGrid, Languages, LogOut, Menu as MenuIcon, Monitor, Moon, Search, Settings, Sparkles, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, Kbd } from '@/components/ui/misc'
import { Menu, MenuItem, MenuSeparator, Sheet } from '@/components/ui/overlay'
import { LanguageToggle, ThemeToggle } from '@/components/ui/toggles'
import { useTheme, type ThemePref } from '@/components/providers/theme'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useSession } from '@/lib/hooks/use-session'
import { useUnread } from '@/lib/hooks/use-unread'
import { exitDemo } from '@/lib/demo/runtime'
import { useStudioActivity } from '@/lib/studio/activity'
import { useI18n, useT } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import { HUBS, MOBILE_TABS, NAV, NAV_FOOTER, type NavItem } from './nav-items'
import { CommandPalette } from './command-palette'
import { NotificationsMenu } from './notifications'
import { WorkspaceSwitcher } from './workspace-switcher'
import { ShortcutsDialog } from './shortcuts-dialog'
import { CallListener } from '@/components/calls/call-listener'
import { PrefsApplier } from '@/lib/hooks/use-prefs'
import { registerServiceWorker, useOnline, warmPages } from '@/lib/offline'

export function AppShell({ children }: { children: ReactNode }) {
  // le Mac en attente de liaison est relié dès la connexion (voir PairResume)
  const t = useT()
  const { locale, setLocale } = useI18n()
  const { pref, setPref } = useTheme()
  const pathname = usePathname()
  const router = useRouter()
  const { ws, me } = useWorkspace()
  const { userId, isDemo, signOut } = useSession()
  const unread = useUnread(ws.id, userId)
  const studio = useStudioActivity()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [palette, setPalette] = useState(false)
  const [help, setHelp] = useState(false)
  const base = `/app/${ws.slug}`
  const online = useOnline()

  // Offline support: register the service worker, then quietly store the main pages for later.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    void registerServiceWorker().then(() => {
      timer = setTimeout(() => {
        try { if (sessionStorage.getItem(`flow_warm:${ws.slug}`)) return; sessionStorage.setItem(`flow_warm:${ws.slug}`, '1') } catch {}
        warmPages(['/app', base, ...['/tasks', '/notes', '/calendar', '/messages', '/files', '/projects', '/goals', '/crm', '/focus', '/me', '/settings'].map((p) => base + p)])
      }, 3000)
    })
    return () => clearTimeout(timer)
  }, [ws.slug, base])

  useEffect(() => { try { setCollapsed(localStorage.getItem('flow_sidebar') === '1') } catch {} }, [])
  // Web app installée sur iPhone : vraie hauteur de l'écran (voir .app-ui dans globals.css)
  useEffect(() => {
    const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (!ios || Math.min(screen.width, screen.height) >= 600) return
    const set = () => {
      const paysage = window.matchMedia('(orientation: landscape)').matches
      const h = paysage ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height)
      document.documentElement.style.setProperty('--app-h', `${Math.max(h, window.innerHeight)}px`)
    }
    set(); window.addEventListener('resize', set); window.addEventListener('orientationchange', set)
    return () => { window.removeEventListener('resize', set); window.removeEventListener('orientationchange', set) }
  }, [])
  const toggleCollapsed = useCallback(() => setCollapsed((c) => { try { localStorage.setItem('flow_sidebar', c ? '0' : '1') } catch {} return !c }), [])
  useEffect(() => setMobileOpen(false), [pathname])

  // Global shortcuts: ⌘K, "?", "[", and "g" + key chords.
  useEffect(() => {
    let chord = false
    let timer: ReturnType<typeof setTimeout>
    const map: Record<string, string> = { h: '', t: '/tasks', n: '/notes', c: '/calendar', m: '/messages', f: '/files', p: '/projects', g: '/goals' }
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); return }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '?') { setHelp(true); return }
      if (e.key === '[') { toggleCollapsed(); return }
      if (e.key === '/') { e.preventDefault(); setPalette(true); return }
      if (chord) { chord = false; if (e.key in map) { e.preventDefault(); router.push(base + map[e.key]) } return }
      if (e.key === 'g') { chord = true; clearTimeout(timer); timer = setTimeout(() => (chord = false), 900); return }
      if (e.key === 'c') { router.push(`${base}/tasks?new=1`) }
    }
    window.addEventListener('keydown', on)
    return () => { window.removeEventListener('keydown', on); clearTimeout(timer) }
  }, [router, base, toggleCollapsed])

  const matches = (href: string) => (href === '' ? pathname === base : pathname === base + href || pathname.startsWith(base + href + '/'))
  const isActive = (href: string) => {
    const item = [...NAV.flatMap((g) => g.items), ...NAV_FOOTER].find((i) => i.href === href) as NavItem | undefined
    return matches(href) || !!item?.also?.some(matches)
  }

  // Current page title for the compact mobile header (longest matching nav / hub entry).
  const pageTitle = (() => {
    const all = [...NAV.flatMap((g) => g.items), ...NAV_FOOTER, ...Object.values(HUBS).flat(), { href: '/ai', label: 'nav.ai' as const }]
    let best: { href: string; label: NavItem['label'] } | undefined
    for (const it of all) if (matches(it.href) && (!best || it.href.length > best.href.length)) best = it
    return best ? t(best.label) : ws.name
  })()
  const themes: { v: ThemePref; icon: typeof Sun; label: string }[] = [
    { v: 'light', icon: Sun, label: t('common.theme.light') }, { v: 'dark', icon: Moon, label: t('common.theme.dark') }, { v: 'system', icon: Monitor, label: t('common.theme.system') },
  ]

  const sidebar = (compact: boolean, onNavigate?: () => void) => (
    <div className="flex h-full flex-col">
      <div className="p-2.5"><WorkspaceSwitcher collapsed={compact} /></div>
      <div className="px-2.5 pb-2">
        <button onClick={() => { setPalette(true); onNavigate?.() }}
          className={cn('flex h-8 w-full items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-2.5 text-[13px] text-text-3 transition-colors hover:border-border-strong hover:text-text-2', compact && 'justify-center px-0')}>
          <Search className="size-3.5" />{!compact && <><span className="flex-1 text-left">{t('common.search')}</span><Kbd>⌘K</Kbd></>}
        </button>
      </div>
      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto px-2.5 pb-3 pt-1" aria-label="Workspace">
        {NAV.map((g, gi) => (
          <div key={gi}>
            {g.label && !compact && <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-text-3">{t(g.label)}</div>}
            {g.label && compact && <div className="mx-2 my-1 h-px bg-border" />}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = isActive(it.href)
                const badge = it.badge === 'messages' ? unread.count : it.badge === 'motion' || it.badge === 'site' ? studio[it.badge].active : 0
                const ask = it.badge === 'motion' || it.badge === 'site' ? studio[it.badge].ask > 0 : false
                return (
                  <li key={it.href}>
                    <Link href={base + it.href} onClick={onNavigate} title={compact ? t(it.label) : undefined} aria-current={active ? 'page' : undefined}
                      className={cn('group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors', compact && 'justify-center px-0',
                        active ? 'bg-surface-3 font-medium text-text' : 'text-text-2 hover:bg-surface-2 hover:text-text')}>
                      {active && <motion.span layoutId={compact ? 'nav-pill-c' : 'nav-pill'} className="absolute left-0 h-4 w-0.5 rounded-full bg-accent" />}
                      <it.icon className={cn('size-4 shrink-0', active ? 'text-accent-ink' : 'text-text-3 group-hover:text-text-2')} />
                      {!compact && <span className="flex-1 truncate">{t(it.label)}</span>}
                      {badge > 0 && <span className={cn('rounded-full px-1.5 text-[10px] font-semibold leading-4 text-white', ask ? 'bg-[#c2410c]' : 'bg-accent', compact && 'absolute right-1 top-0.5 px-1')} title={ask ? '1 question' : undefined}>{badge > 99 ? '99+' : badge}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-border p-2.5">
        {NAV_FOOTER.map((it) => {
          const active = isActive(it.href)
          return (
            <Link key={it.href} href={base + it.href} onClick={onNavigate} title={compact ? t(it.label) : undefined} aria-current={active ? 'page' : undefined}
              className={cn('flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors', compact && 'justify-center px-0', active ? 'bg-surface-3 font-medium text-text' : 'text-text-2 hover:bg-surface-2 hover:text-text')}>
              <it.icon className={cn('size-4 shrink-0', active ? 'text-accent-ink' : 'text-text-3')} />{!compact && <span className="truncate">{t(it.label)}</span>}
            </Link>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="app-ui fixed inset-0 flex overflow-hidden bg-bg">
      <PairResume />
      <aside className={cn('hidden shrink-0 border-r border-border bg-bg-subtle transition-[width] duration-200 ease-out md:block', collapsed ? 'w-[60px]' : 'w-[248px]')}>{sidebar(collapsed)}</aside>
      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)}>{sidebar(false, () => setMobileOpen(false))}</Sheet>

      <div className="flex min-w-0 flex-1 flex-col safe-top">
        {isDemo && (
          <div className="flex items-center justify-center gap-3 border-b border-border bg-accent-soft px-3 py-1.5 text-center text-xs text-accent-ink">
            <span className="truncate"><span className="hidden sm:inline">{t('common.demoBanner')}</span><span className="sm:hidden">{t('common.demoShort')}</span></span>
            <button className="shrink-0 font-semibold underline underline-offset-2" onClick={() => { exitDemo(true); window.location.href = '/register' }}>{t('nav.start')}</button>
          </div>
        )}
        {!online && <div role="status" className="flex items-center justify-center gap-2 border-b border-border bg-surface-3 px-3 py-1.5 text-center text-xs font-medium text-text">{t('off.banner')}</div>}
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border px-3 md:px-4">
          <div className="flex min-w-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Menu"><MenuIcon className="size-5" /></Button>
            <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={toggleCollapsed} aria-label={collapsed ? t('shell.expand') : t('shell.collapse')}>
              {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
            </Button>
            <span className="truncate text-[15px] font-semibold tracking-tight md:hidden" aria-hidden>{pageTitle}</span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setPalette(true)} aria-label={t('common.search')}><Search className="size-[18px]" /></Button>
            <div className="hidden items-center gap-0.5 md:flex">
              <Link href={`${base}/ai`} aria-label={t('nav.ai')} title={t('nav.ai')} className={cn('flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2', pathname.startsWith(`${base}/ai`) && 'bg-surface-3')}><Sparkles className="size-4 text-accent-ink" /></Link>
              <LanguageToggle /><ThemeToggle />
            </div>
            <NotificationsMenu />
            <Menu align="end" width={240} trigger={({ toggle }) => (
              <button onClick={toggle} className="ml-1 grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-bg transition hover:ring-2 hover:ring-border-strong" aria-label={t('shell.account')}><Avatar name={me?.full_name ?? me?.email} src={me?.avatar_url} size={28} status={me?.status} /></button>
            )}>
              {(close) => (
                <>
                  <div className="px-2.5 py-2"><div className="truncate text-[13px] font-medium">{me?.full_name}</div><div className="truncate text-xs text-text-3">{me?.email}</div></div>
                  <MenuSeparator />
                  <Link href={`${base}/settings`} onClick={close}><MenuItem icon={<Settings className="size-4" />}>{t('nav.settings')}</MenuItem></Link>
                  <div className="md:hidden">
                    <Link href={`${base}/ai`} onClick={close}><MenuItem icon={<Sparkles className="size-4" />}>{t('nav.ai')}</MenuItem></Link>
                    <MenuSeparator />
                    <div className="flex gap-1 px-1.5 py-1" role="group" aria-label={t('common.theme')}>
                      {themes.map((it) => (
                        <button key={it.v} onClick={() => setPref(it.v)} aria-label={it.label} aria-pressed={pref === it.v}
                          className={cn('grid h-9 flex-1 place-items-center rounded-lg border text-text-2 transition-colors', pref === it.v ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border hover:bg-surface-2')}><it.icon className="size-4" /></button>
                      ))}
                    </div>
                    <div className="flex gap-1 px-1.5 pb-1.5 pt-0.5" role="group" aria-label={t('common.language')}>
                      {(['fr', 'en'] as const).map((l) => (
                        <button key={l} onClick={() => setLocale(l)} aria-pressed={locale === l}
                          className={cn('flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border text-[13px] font-medium transition-colors', locale === l ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border text-text-2 hover:bg-surface-2')}>
                          {locale === l ? <Check className="size-3.5" /> : <Languages className="size-3.5" />}{l === 'fr' ? 'Français' : 'English'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <MenuSeparator />
                  <MenuItem icon={<LayoutGrid className="size-4" />} shortcut="?" onClick={() => { close(); setHelp(true) }}>{t('shell.keyboard')}</MenuItem>
                  <MenuItem icon={<LogOut className="size-4" />} danger onClick={() => signOut()}>{t('common.signOut')}</MenuItem>
                </>
              )}
            </Menu>
          </div>
        </header>

        <main id="main" className="main-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</main>

        <nav className="mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-bg/90 backdrop-blur-xl safe-bottom md:hidden" aria-label="Mobile">
          {MOBILE_TABS.map((href) => {
            const item = NAV.flatMap((g) => g.items).find((i) => i.href === href)!
            const active = isActive(href)
            const badge = item.badge === 'messages' ? unread.count : 0
            return (
              <Link key={href} href={base + href} aria-current={active ? 'page' : undefined} className={cn('relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors active:bg-surface-2', active ? 'text-accent-ink' : 'text-text-3')}>
                {active && <motion.span layoutId="tab-line" className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-accent" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <item.icon className="size-5" />{t(item.label)}
                {badge > 0 && <span className="absolute right-[26%] top-1 rounded-full bg-accent px-1 text-[9px] font-semibold leading-4 text-white">{badge}</span>}
              </Link>
            )
          })}
          <button onClick={() => setMobileOpen(true)} className="flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium text-text-3 transition-colors active:bg-surface-2"><LayoutGrid className="size-5" />{t('nav.more')}</button>
        </nav>
      </div>

      <CommandPalette open={palette} setOpen={setPalette} />
      <ShortcutsDialog open={help} onClose={() => setHelp(false)} />
      <CallListener />
      <PrefsApplier />
    </div>
  )
}
