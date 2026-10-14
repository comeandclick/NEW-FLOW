import { expect, test } from '@playwright/test'

// Phone portrait/landscape, tablet, and "desktop site" requested on a phone (≈980px wide, touch).
const VIEWPORTS = [
  { name: 'phone-320', w: 320, h: 640, mobile: true }, { name: 'phone-360', w: 360, h: 740, mobile: true }, { name: 'phone-390', w: 390, h: 844, mobile: true },
  { name: 'phone-430', w: 430, h: 932, mobile: true }, { name: 'phone-landscape', w: 844, h: 390, mobile: true }, { name: 'tablet-768', w: 768, h: 1024, mobile: true },
  { name: 'tablet-820', w: 820, h: 1180, mobile: true }, { name: 'desktop-site-on-phone', w: 980, h: 1800, mobile: false, touch: true }, { name: 'laptop-1280', w: 1280, h: 720, mobile: false },
]
const PUBLIC = ['/', '/features', '/pricing', '/security', '/changelog', '/about', '/contact', '/login', '/register']
const APP = ['', '/tasks', '/notes', '/calendar', '/messages', '/files', '/projects', '/goals', '/crm', '/finance', '/forms', '/automations', '/whiteboard', '/focus', '/habits', '/ai', '/trash', '/activity', '/settings', '/meetings', '/inbox', '/roadmap', '/team', '/me', '/search']

for (const vp of VIEWPORTS) {
  test.describe(`responsive ${vp.name}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.mobile, hasTouch: vp.mobile || !!vp.touch, deviceScaleFactor: vp.mobile ? 3 : 1 })

    test('public pages: no horizontal overflow', async ({ page }) => {
      const bad: string[] = []
      for (const r of PUBLIC) {
        await page.goto(r); await page.waitForTimeout(700)
        const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        if (o > 1) bad.push(`${r}: +${o}px`)
      }
      expect(bad).toEqual([])
    })

    test('app pages: no overflow, single scroll container, correct navigation', async ({ page }) => {
      await page.goto('/demo'); await page.waitForURL(/\/app\/demo/)
      const bad: string[] = []
      for (const r of APP) {
        await page.goto(`/app/demo${r}`); await page.waitForTimeout(800)
        const m = await page.evaluate(() => {
          const de = document.documentElement
          const sidebar = document.querySelector('aside')
          const bottom = document.querySelector('nav[aria-label="Mobile"]')
          const vis = (e: Element | null) => !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0
          return { overflowX: de.scrollWidth - window.innerWidth, docScroll: de.scrollHeight - window.innerHeight, sidebar: vis(sidebar), bottom: vis(bottom), w: window.innerWidth }
        })
        if (m.overflowX > 1) bad.push(`${r || '/'}: overflow-x +${m.overflowX}px`)
        if (m.docScroll > 1) bad.push(`${r || '/'}: page scrolls (+${m.docScroll}px), expected an inner scroller`)
        if (m.w < 768 && (m.sidebar || !m.bottom)) bad.push(`${r || '/'}: mobile layout expected (sidebar=${m.sidebar}, bottomBar=${m.bottom})`)
        if (m.w >= 768 && (!m.sidebar || m.bottom)) bad.push(`${r || '/'}: desktop layout expected (sidebar=${m.sidebar}, bottomBar=${m.bottom})`)
      }
      expect(bad).toEqual([])
    })
  })
}
