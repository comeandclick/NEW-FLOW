import { CookieNotice, SiteFooter, SiteNav } from '@/components/site/chrome'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
      <SiteNav />
      <main id="content">{children}</main>
      <SiteFooter />
      <CookieNotice />
    </>
  )
}
