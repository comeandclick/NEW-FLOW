import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Joue le rôle du pont (via l'API) pour afficher chaque état d'un projet et vérifier l'accessibilité. Nécessite STUDIO_STORE=file.
for (const theme of ['light', 'dark'] as const) test(`studio ${theme} : tous les états d'un projet sont accessibles`, async ({ page, request }) => {
  await page.addInitScript((t) => localStorage.setItem('flow_theme', t), theme)
  await page.goto('/demo'); await page.waitForURL(/\/app\/demo/)
  const st = await (await page.request.get('/api/studio/status')).json()
  test.skip(st.mode !== 'live', 'STUDIO_STORE=file requis')
  const start = await (await request.post('/api/studio/pair/start', { data: { deviceName: 'Mac états' } })).json()
  await page.request.post('/api/studio/pair/confirm', { data: { code: start.code } })
  const { deviceToken } = await (await request.get(`/api/studio/pair/poll?token=${start.pollToken}`)).json()
  const bridge = (route: string, data: unknown) => request.post(`/api/studio/bridge/${route}`, { data, headers: { authorization: `Bearer ${deviceToken}` } })
  const prompt = 'x'.repeat(80) + ' Mission : états'
  const job = async (title: string) => { const j = await (await page.request.post('/api/studio/jobs', { data: { kind: 'site', title, spec: {}, prompt } })).json(); await page.request.post(`/api/studio/jobs/${j.job.id}/submit`); return j.job.id as string }
  const ev = (id: string, event: unknown) => bridge('event', { jobId: id, event })

  const a = await job('Etat question'); await ev(a, { type: 'status', status: 'running', step: 'design', progress: 35 }); await ev(a, { type: 'question', text: 'Bouton principal ?', choices: ['Commencer', 'Voir les offres'] })
  const b = await job('Etat pause'); await ev(b, { type: 'status', status: 'paused', step: 'build', progress: 50 })
  const c = await job('Etat echec'); await ev(c, { type: 'status', status: 'failed', error: 'Claude Code n\'est pas connecté sur ce Mac.' })
  const d = await job('Etat termine'); await ev(d, { type: 'step', step: 'deploy', progress: 90 }); await ev(d, { type: 'delivered', deliver: { url: 'https://exemple.test' }, summary: 'Site en ligne' })
  await page.request.post(`/api/studio/jobs/${b}/message`, { data: { text: 'Plus de contraste', mode: 'next' } })

  await page.goto('/app/demo/site?tab=projects'); await page.waitForTimeout(2500)
  await page.evaluate(() => document.querySelectorAll<HTMLButtonElement>('article button[aria-expanded="false"]').forEach((b) => b.click()))
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `test-results/studio-states-${theme}.png`, fullPage: true })
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(over).toBeLessThanOrEqual(1)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(r.violations.map((v) => `${v.id} ${v.nodes[0]?.target?.join(' ')} :: ${(v.nodes[0]?.any?.[0]?.message ?? '').slice(0, 120)}`)).toEqual([])
  for (const id of [a, b, c, d]) await page.request.delete(`/api/studio/jobs/${id}`)
})
