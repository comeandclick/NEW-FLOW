import { CookieNotice, SiteFooter, SiteNav } from '@/components/site/chrome'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mk relative min-h-dvh overflow-x-clip bg-bg text-text">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[820px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--mk-glow),transparent_72%)]" />
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <SiteNav />
      <main id="content" className="relative z-10 pt-20">{children}</main>
      <SiteFooter />
      <CookieNotice />
    </div>
  )
}
