import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Nécessite STUDIO_STORE=file (compte démo accepté par l'API) : sinon le test est ignoré.
for (const theme of ['light', 'dark'] as const) test(`studio ${theme} : pages avec une demande en cours, sans débordement ni erreur d'accessibilité`, async ({ page }) => {
  await page.addInitScript((t) => localStorage.setItem('flow_theme', t), theme)
  await page.goto('/demo'); await page.waitForURL(/\/app\/demo/)
  const st = await (await page.request.get('/api/studio/status')).json()
  test.skip(st.mode !== 'live', 'STUDIO_STORE=file requis')
  const prompt = 'x'.repeat(80) + ' Mission : test visuel'
  const j = await (await page.request.post('/api/studio/jobs', { data: { kind: 'motion', title: 'Test a11y', spec: {}, prompt } })).json()
  await page.request.post(`/api/studio/jobs/${j.job.id}/submit`)
  const reg = await (await page.request.post(`/api/studio/jobs/${j.job.id}/assets`, { data: { name: 'ref.txt', size: 2, mime: 'text/plain' } })).json()
  await page.request.put(reg.upload.url, { data: 'ok' })
  for (const p of ['/motion', '/site?tab=projects', '/site?tab=connect', '/site?tab=new', '/library']) {
    await page.goto(`/app/demo${p}`); await page.waitForTimeout(1800)
    if (p === '/motion') { await page.locator('article button[aria-expanded]').first().click().catch(() => {}); await page.waitForTimeout(600) }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(over, `${p} déborde de ${over}px`).toBeLessThanOrEqual(1)
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(r.violations.map((v) => `${p} ${v.id} ${v.nodes[0]?.target?.join(' ')}`), p).toEqual([])
  }
  await page.request.delete(`/api/studio/jobs/${j.job.id}`)
})
