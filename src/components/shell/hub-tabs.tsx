'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { useT } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import { HUBS } from './nav-items'
import { modulesActifs, routeVisible } from '@/lib/modules'

/** Tab strip that links sibling pages of one sidebar entry (keeps the sidebar short). */
export function HubTabs({ hub, className }: { hub: keyof typeof HUBS; className?: string }) {
  const t = useT()
  const pathname = usePathname()
  const { ws } = useWorkspace()
  const base = `/app/${ws.slug}`
  return (
    <nav className={cn('mb-4 flex gap-1 max-md:mb-3 overflow-x-auto border-b border-border [scrollbar-width:none]', className)} aria-label="Sections">
      {HUBS[hub].filter((it) => routeVisible(it.href, modulesActifs(ws))).map((it) => {
        const active = pathname === base + it.href || pathname.startsWith(base + it.href + '/')
        return (
          <Link key={it.href} href={base + it.href} aria-current={active ? 'page' : undefined}
            className={cn('relative shrink-0 px-3 py-2.5 text-[13px] font-medium transition-colors', active ? 'text-text' : 'text-text-3 hover:text-text')}>
            {t(it.label)}
            {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </Link>
        )
      })}
    </nav>
  )
}
