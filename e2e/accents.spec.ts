/** Every accent colour must keep WCAG AA contrast in both themes. */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const PAGES = ['', '/tasks', '/settings?tab=preferences', '/crm', '/calendar']
for (const theme of ['dark', 'light'] as const) {
  for (const accent of ['blue', 'violet', 'emerald', 'rose', 'amber'] as const) {
    test(`contrast ${accent} / ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('flow_theme', t), theme)
      await page.goto('/demo'); await page.waitForURL(/\/app\/demo/)
      await page.goto('/app/demo/settings?tab=preferences')
      await page.getByRole('radio', { name: { blue: 'Bleu', violet: 'Violet', emerald: 'Émeraude', rose: 'Rose', amber: 'Ambre' }[accent] }).click()
      const bad: string[] = []
      for (const p of PAGES) {
        await page.goto(`/app/demo${p}`); await page.waitForTimeout(700)
        await expect(page.locator('html')).toHaveAttribute('data-accent', accent)
        const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
        for (const v of r.violations) bad.push(`${p || '/'} · ${v.nodes.length} ${v.nodes[0]?.target?.join(' ')} :: ${(v.nodes[0]?.any?.[0]?.message ?? '').slice(0, 120)}`)
      }
      expect(bad).toEqual([])
    })
  }
}
