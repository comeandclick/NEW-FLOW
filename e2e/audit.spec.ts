import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const PUBLIC = ['/', '/features', '/pricing', '/security', '/changelog', '/about', '/contact', '/login', '/register', '/legal/privacy']
const APP = ['', '/tasks', '/notes', '/calendar', '/messages', '/files', '/projects', '/goals', '/crm', '/finance', '/forms', '/automations', '/whiteboard', '/focus', '/habits', '/ai', '/trash', '/activity', '/settings', '/meetings', '/inbox', '/roadmap', '/team', '/feedback', '/releases', '/localization', '/me', '/search?q=a', '/motion', '/site', '/site?tab=projects', '/site?tab=connect', '/library']

for (const theme of ['dark', 'light'] as const) {
  test.describe(`a11y ${theme}`, () => {
    test.beforeEach(async ({ page }) => { await page.addInitScript((t) => localStorage.setItem('flow_theme', t), theme) })
    for (const p of PUBLIC) {
      test(`public ${p}`, async ({ page }) => {
        await page.goto(p); await page.waitForTimeout(900)
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
        expect(r.violations.map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target?.join(' ')} :: ${(v.nodes[0]?.html ?? '').slice(0, 140)} :: ${(v.nodes[0]?.any?.[0]?.message ?? '').slice(0, 150)}`), p).toEqual([])
      })
    }
    test('app pages', async ({ page }) => {
      await page.goto('/demo'); await page.waitForURL(/\/app\/demo/)
      const bad: string[] = []
      for (const p of APP) {
        await page.goto(`/app/demo${p}`); await page.waitForTimeout(900)
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
        for (const v of r.violations) bad.push(`${p || '/'} · ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target?.join(' ')}`)
      }
      expect(bad).toEqual([])
    })
  })
}
