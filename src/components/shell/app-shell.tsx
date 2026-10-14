'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { PairResume } from '@/components/studio/pair-resume'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Activity, Check, ChevronsUpDown, CreditCard, Info, LayoutGrid, MinusCircle, Trash2, User, Zap, PanelLeftClose, PanelLeftOpen, Pencil, Plus, X, Languages, LogOut, Menu as MenuIcon, Monitor, Moon, Search, Settings, Sparkles, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, Kbd } from '@/components/ui/misc'
import { Menu, MenuItem, MenuSeparator, Sheet } from '@/components/ui/overlay'
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
import { Astuces } from './astuces'
import { Aide } from './aide'
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
  const [aide, setAide] = useState(false)
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
  // menu personnalisable (crayon) : entrées masquées gardées sur l'appareil ; widget « abonnement » refermable (revient après 14 jours)
  const [masques, setMasques] = useState<string[]>([])
  const [edition, setEdition] = useState(false)
  const [promo, setPromo] = useState(false)
  useEffect(() => {
    try { setMasques(JSON.parse(localStorage.getItem('flow_nav_masques') || '[]')) } catch {}
    try { const f = Number(localStorage.getItem('flow_promo_ferme') || 0); setPromo(!f || Date.now() - f > 14 * 86400000) } catch { setPromo(true) }
  }, [])
  const masquer = (href: string, oui: boolean) => setMasques((m) => { const n = oui ? [...new Set([...m, href])] : m.filter((x) => x !== href); try { localStorage.setItem('flow_nav_masques', JSON.stringify(n)) } catch {} return n })
  const fermerPromo = () => { setPromo(false); try { localStorage.setItem('flow_promo_ferme', String(Date.now())) } catch {} }
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
        <button onClick={() => { setPalette(true); onNavigate?.() }} title={compact ? t('common.search') : undefined}
          className={cn('group flex h-[34px] w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-text-2 transition-colors hover:bg-text/5 hover:text-text', compact && 'justify-center px-0')}>
          <Search className="size-4 text-text-3 group-hover:text-text-2" />{!compact && <><span className="flex-1 text-left">{t('common.search')}</span><Kbd className="opacity-70">⌘K</Kbd></>}
        </button>
      </div>
      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2.5 pb-3 pt-1" aria-label="Workspace">
        {NAV.map((g, gi) => { const visibles = g.items.filter((it) => !masques.includes(it.href)); if (!visibles.length) return null
          return (
          <div key={gi}>
            {g.label && !compact && <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3/70">{t(g.label)}</div>}
            {g.label && compact && <div className="mx-2 my-1 h-px bg-border" />}
            <ul className="space-y-0.5">
              {visibles.map((it) => {
                const active = isActive(it.href)
                const badge = it.badge === 'messages' ? unread.count : it.badge === 'motion' || it.badge === 'site' ? studio[it.badge].active : 0
                const ask = it.badge === 'motion' || it.badge === 'site' ? studio[it.badge].ask > 0 : false
                if (edition && !compact) return (
                  <li key={it.href}>
                    <div className="flex h-[34px] items-center gap-2.5 rounded-md px-2.5 text-[13px] text-text-2 animate-[pop_0.18s_ease_both]">
                      <it.icon className="size-4 shrink-0 text-text-3" strokeWidth={1.75} /><span className="flex-1 truncate">{t(it.label)}</span>
                      {it.href !== '' && <button onClick={() => masquer(it.href, true)} aria-label={`Masquer ${t(it.label)}`} className="grid size-6 place-items-center rounded-full text-text-3 transition-colors hover:bg-danger/10 hover:text-danger"><MinusCircle className="size-4" /></button>}
                    </div>
                  </li>
                )
                return (
                  <li key={it.href}>
                    <Link href={base + it.href} onClick={onNavigate} title={compact ? t(it.label) : undefined} aria-current={active ? 'page' : undefined}
                      className={cn('group relative flex h-[34px] items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors', compact && 'justify-center px-0',
                        active ? 'font-medium text-text' : 'text-text-2 hover:bg-text/5 hover:text-text')}>
                      {active && <motion.span layoutId={compact ? 'nav-pill-c' : 'nav-pill'} className="absolute inset-0 rounded-md bg-text/[0.06] dark:bg-text/10" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                      <it.icon className={cn('relative size-4 shrink-0', active ? 'text-text' : 'text-text-3 group-hover:text-text-2')} strokeWidth={1.75} />
                      {!compact && <span className="relative flex-1 truncate">{t(it.label)}</span>}
                      {badge > 0 && <span className={cn('relative grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-medium', ask ? 'bg-warning/15 text-warning' : 'bg-text/10 text-text', compact && 'absolute right-0.5 top-0 h-4 min-w-4 px-1')} title={ask ? '1 question' : undefined}>{badge > 99 ? '99+' : badge}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ) })}
        {!compact && (
          <div className="px-1">
            {edition ? (
              <div className="space-y-1.5 rounded-lg border border-dashed border-border-strong p-2">
                {masques.length > 0 && <div className="px-1 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3/70">Ajouter</div>}
                {NAV.flatMap((g) => g.items).filter((it) => masques.includes(it.href)).map((it) => (
                  <button key={it.href} onClick={() => masquer(it.href, false)} className="flex h-8 w-full items-center gap-2.5 rounded-md px-1.5 text-[13px] text-text-2 transition-colors hover:bg-text/5 hover:text-text">
                    <Plus className="size-4 text-success" /><it.icon className="size-4 text-text-3" strokeWidth={1.75} /><span className="truncate">{t(it.label)}</span>
                  </button>
                ))}
                {!masques.length && <p className="px-1 text-xs text-text-3">Tout est affiché. Le bouton « − » masque ce que tu n&apos;utilises pas.</p>}
                <button onClick={() => setEdition(false)} className="mt-1 h-8 w-full rounded-md bg-text text-[13px] font-medium text-bg transition-opacity hover:opacity-90">Terminé</button>
              </div>
            ) : (
              <button onClick={() => setEdition(true)} className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[12px] text-text-3 transition-colors hover:bg-text/5 hover:text-text-2">
                <Pencil className="size-3.5" strokeWidth={1.75} />Modifier le menu{masques.length > 0 && <span className="ml-auto inline-flex items-center gap-1"><Plus className="size-3" />{masques.length}</span>}
              </button>
            )}
          </div>
        )}
      </nav>
      {/* widget abonnement (en bas de la barre), refermable */}
      {promo && !compact && !edition && (
        <div className="relative mx-2.5 mb-2 rounded-lg border border-border bg-surface-2/60 p-3 animate-[pop_0.18s_ease_both]">
          <button onClick={fermerPromo} aria-label="Fermer" className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md text-text-3 transition-colors hover:bg-text/5 hover:text-text"><X className="size-3.5" /></button>
          <div className="flex items-center gap-2 text-[13px] font-semibold"><Sparkles className="size-4" strokeWidth={1.75} />Flow Pro</div>
          <p className="mt-1 pr-4 text-[12px] leading-snug text-text-3">Assistant IA sans limite, plus de stockage, Atelier pour toute l&apos;équipe.</p>
          <Link href={`${base}/settings?tab=billing`} onClick={onNavigate} className="mt-2.5 flex h-8 items-center justify-center rounded-md bg-text text-[12.5px] font-medium text-bg transition-opacity hover:opacity-90">Voir les offres</Link>
        </div>
      )}
      {/* bas du menu (14/10/2026) : « i » = aide & support, puis le profil (menu : profil, paramètres, abonnement, automatisations, activité, corbeille…) */}
      <div className={cn('mx-2.5 flex items-center gap-1 border-t border-border py-2.5', compact && 'flex-col')}>
        <button onClick={() => { setAide(true); onNavigate?.() }} aria-label="Aide et support" title="Aide et support" className="grid size-[34px] shrink-0 place-items-center rounded-md text-text-3 transition-colors hover:bg-text/5 hover:text-text"><Info className="size-4" strokeWidth={1.75} /></button>
        <Menu align="start" width={250} anchorClassName={compact ? undefined : 'min-w-0 flex-1'} trigger={({ toggle }) => (
          <button onClick={toggle} aria-label={t('shell.account')} className={cn('flex min-w-0 flex-1 items-center gap-2.5 rounded-md p-1.5 text-left transition-colors hover:bg-text/5', compact && 'justify-center')}>
            <Avatar name={me?.full_name ?? me?.email} src={me?.avatar_url} size={28} status={me?.status} />
            {!compact && <><span className="min-w-0 flex-1 leading-tight"><span className="block truncate text-[13px] font-medium">{me?.full_name ?? '—'}</span><span className="block truncate text-[11px] text-text-3">{me?.email}</span></span><ChevronsUpDown className="size-3.5 shrink-0 text-text-3" /></>}
          </button>
        )}>
          {(close) => (
            <>
              <div className="px-2.5 py-2"><div className="truncate text-[13px] font-medium">{me?.full_name}</div><div className="truncate text-xs text-text-3">{me?.email}</div></div>
              <MenuSeparator />
              {([['/settings?tab=profile', User, 'Profil'], ['/settings', Settings, t('nav.settings')], ['/settings?tab=billing', CreditCard, 'Abonnement'], ['/automations', Zap, t('nav.automations')], ['/activity', Activity, t('nav.activity')], ['/trash', Trash2, t('nav.trash')]] as const).map(([href, I, lib]) => (
                <Link key={href} href={base + href} onClick={() => { close(); onNavigate?.() }}><MenuItem icon={<I className="size-4" />}>{lib}</MenuItem></Link>
              ))}
              <MenuSeparator />
              <div className="flex gap-1 px-1.5 py-1" role="group" aria-label={t('common.theme')}>
                {themes.map((it) => (
                  <button key={it.v} onClick={() => setPref(it.v)} aria-label={it.label} aria-pressed={pref === it.v} className={cn('grid h-8 flex-1 place-items-center rounded-md border text-text-2 transition-colors', pref === it.v ? 'border-text/30 bg-text/5 text-text' : 'border-border hover:bg-surface-2')}><it.icon className="size-4" /></button>
                ))}
              </div>
              <div className="flex gap-1 px-1.5 pb-1.5 pt-0.5" role="group" aria-label={t('common.language')}>
                {(['fr', 'en'] as const).map((l) => (
                  <button key={l} onClick={() => setLocale(l)} aria-pressed={locale === l} className={cn('flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-[12.5px] font-medium transition-colors', locale === l ? 'border-text/30 bg-text/5 text-text' : 'border-border text-text-2 hover:bg-surface-2')}>
                    {locale === l ? <Check className="size-3.5" /> : <Languages className="size-3.5" />}{l === 'fr' ? 'Français' : 'English'}
                  </button>
                ))}
              </div>
              <MenuSeparator />
              <MenuItem icon={<LayoutGrid className="size-4" />} shortcut="?" onClick={() => { close(); setHelp(true) }}>{t('shell.keyboard')}</MenuItem>
              <MenuItem icon={<LogOut className="size-4" />} danger onClick={() => signOut()}>{t('common.signOut')}</MenuItem>
            </>
          )}
        </Menu>
      </div>
    </div>
  )

  return (
    <div className="app-ui fixed inset-0 flex overflow-hidden bg-bg">
      <PairResume />
      <aside className={cn('hidden shrink-0 border-r border-border bg-surface transition-[width] duration-200 ease-out md:block dark:bg-bg-subtle', collapsed ? 'w-[60px]' : 'w-[260px]')}>{sidebar(collapsed)}</aside>
      <Sheet open={mobileOpen} onClose={() => setMobileOpen(false)}>{sidebar(false, () => setMobileOpen(false))}</Sheet>

      <div className="flex min-w-0 flex-1 flex-col safe-top">
        {isDemo && (
          <div className="flex items-center justify-center gap-3 border-b border-border bg-surface-2 px-3 py-1.5 text-center text-xs text-text-2">
            <span className="truncate"><span className="hidden sm:inline">{t('common.demoBanner')}</span><span className="sm:hidden">{t('common.demoShort')}</span></span>
            <button className="shrink-0 font-semibold underline underline-offset-2" onClick={() => { exitDemo(true); window.location.href = '/register' }}>{t('nav.start')}</button>
          </div>
        )}
        {!online && <div role="status" className="flex items-center justify-center gap-2 border-b border-border bg-surface-3 px-3 py-1.5 text-center text-xs font-medium text-text">{t('off.banner')}</div>}
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-bg px-3 md:px-5">
          <div className="flex min-w-0 items-center gap-1">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Menu"><MenuIcon className="size-5" /></Button>
            <Button variant="ghost" size="icon" className="hidden text-text-3 md:inline-flex" onClick={toggleCollapsed} aria-label={collapsed ? t('shell.expand') : t('shell.collapse')}>
              {collapsed ? <PanelLeftOpen className="size-4" strokeWidth={1.75} /> : <PanelLeftClose className="size-4" strokeWidth={1.75} />}
            </Button>
            {/* fil d'Ariane « Espace / Page », comme la référence 21st.dev */}
            <nav aria-label="Fil d'Ariane" className="ml-1 hidden min-w-0 items-center gap-2 text-[13px] md:flex">
              <Link href={base} className="truncate text-text-3 transition-colors hover:text-text">{ws.name}</Link>
              {pathname !== base && <><span className="text-text-3/60">/</span><span className="truncate font-medium text-text">{pageTitle}</span></>}
            </nav>
            <span className="truncate text-[15px] font-semibold tracking-tight md:hidden" aria-hidden>{pageTitle}</span>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setPalette(true)} aria-label={t('common.search')}><Search className="size-[18px]" /></Button>
            <div className="hidden items-center gap-0.5 md:flex">
              <Link href={`${base}/ai`} aria-label={t('nav.ai')} title={t('nav.ai')} className={cn('flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-surface-2', pathname.startsWith(`${base}/ai`) && 'bg-surface-3')}><Sparkles className="size-4 text-text-2" strokeWidth={1.75} /></Link>
            </div>
            <NotificationsMenu />
          </div>
        </header>

        <main id="main" className="main-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</main>

        <nav className="mobile-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-bg/90 backdrop-blur-xl safe-bottom md:hidden" aria-label="Mobile">
          {MOBILE_TABS.map((href) => {
            const item = NAV.flatMap((g) => g.items).find((i) => i.href === href)!
            const active = isActive(href)
            const badge = item.badge === 'messages' ? unread.count : 0
            return (
              <Link key={href} href={base + href} aria-current={active ? 'page' : undefined} className={cn('relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors active:bg-surface-2', active ? 'text-text' : 'text-text-3')}>
                {active && <motion.span layoutId="tab-line" className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-text" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                <item.icon className="size-5" />{t(item.label)}
                {badge > 0 && <span className="absolute right-[26%] top-1 rounded-full bg-text px-1 text-[9px] font-semibold leading-4 text-bg">{badge}</span>}
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
      <Astuces base={base} />
      <Aide ouvert={aide} fermer={() => setAide(false)} raccourcis={() => setHelp(true)} />
    </div>
  )
}
