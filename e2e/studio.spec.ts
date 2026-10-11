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
  // Mac simulé : liste de tâches et une capture d'écran en direct
  const ps = await (await page.request.post('/api/studio/pair/start', { data: { deviceName: 'Mac a11y' } })).json()
  await page.request.post('/api/studio/pair/confirm', { data: { code: ps.code } })
  const tok = (await (await page.request.get(`/api/studio/pair/poll?token=${ps.pollToken}`)).json()).deviceToken
  const bridge = (route: string, data: unknown) => page.request.post(`/api/studio/bridge/${route}`, { data, headers: { authorization: `Bearer ${tok}` } })
  await bridge('event', { jobId: j.job.id, event: { type: 'todo', items: [{ text: 'Analyser la référence', state: 'done' }, { text: 'Construire la scène', state: 'doing' }, { text: 'Rendu 4K', state: 'todo' }] } })
  const up = await (await bridge('preview', { jobId: j.job.id, slot: 'site' })).json()
  const jpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64')
  await page.request.put(up.upload.url, { data: jpg, headers: { 'content-type': 'image/jpeg' } })
  await bridge('preview', { jobId: j.job.id, slot: 'site', path: up.path, label: 'http://localhost:3000' })
  for (const p of ['/motion', '/site?tab=projects', '/site?tab=connect', '/site?tab=new', '/library', '/settings?tab=studio', `STUDIO:/studio/live?job=${j.job.id}`]) {
    if (p.startsWith('STUDIO:')) { await page.goto(p.slice(7)); await page.waitForTimeout(2500)
      await expect(page.getByText('Construire la scène')).toBeVisible()
      const over0 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); expect(over0, 'live déborde').toBeLessThanOrEqual(1)
      const r0 = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(r0.violations.map((v) => `live ${v.id} ${v.nodes[0]?.target?.join(' ')}`), 'live').toEqual([]); continue }
    await page.goto(`/app/demo${p}`); await page.waitForTimeout(1800)
    if (p === '/motion') { await page.locator('article button[aria-expanded]').first().click().catch(() => {}); await page.waitForTimeout(600) }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(over, `${p} déborde de ${over}px`).toBeLessThanOrEqual(1)
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(r.violations.map((v) => `${p} ${v.id} ${v.nodes[0]?.target?.join(' ')}`), p).toEqual([])
  }
  await page.request.delete(`/api/studio/jobs/${j.job.id}`)
})
