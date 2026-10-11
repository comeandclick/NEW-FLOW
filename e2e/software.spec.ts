import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Fenêtre du logiciel Flow Studio avec un faux Claude en train de travailler : accueil, ouverture d'un projet, conversation, étapes, tâches, question. STUDIO_STORE=file requis.
test('logiciel Flow Studio : accueil des projets puis suivi d\'un projet, sans erreur de script', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  await page.goto('/demo'); await page.waitForURL(/\/app\/demo/)
  const st = await (await page.request.get('/api/studio/status')).json()
  test.skip(st.mode !== 'live', 'STUDIO_STORE=file requis')
  const urlFile = path.join(mkdtempSync(path.join(tmpdir(), 'fb-sw-')), 'url.txt')
  const child = spawn('node', ['bridge/demo-ui.mjs'], { env: { ...process.env, FLOW_SERVER: baseURL!, URL_FILE: urlFile, FAKE_STEP_MS: '1500' }, stdio: 'ignore' })
  const errors: string[] = []
  try {
    await expect.poll(() => existsSync(urlFile), { timeout: 60_000 }).toBe(true)
    const app = await page.context().newPage()
    app.on('pageerror', (e) => errors.push(String(e)))
    await app.goto(readFileSync(urlFile, 'utf8'))
    await expect(app.getByRole('button', { name: 'Commencer' })).toBeEnabled({ timeout: 30_000 })
    await app.getByRole('button', { name: 'Commencer' }).click()
    await expect(app.getByRole('heading', { name: 'Projets' })).toBeVisible()
    const card = app.getByRole('button', { name: /Ouvrir Es Loc/ })
    await expect(card).toBeVisible({ timeout: 30_000 })
    await card.click() // un clic doit toujours aboutir (pas de re-rendu qui l'annule)
    await expect(app.getByText('Discussion avec Claude')).toBeVisible()
    await expect(app.locator('#feed .tl').first()).toBeVisible({ timeout: 30_000 }) // conversation de Claude
    await expect(app.locator('#steps .st').first()).toBeVisible()
    await expect(app.locator('#todo .tdo').first()).toBeVisible({ timeout: 30_000 })
    await expect(app.getByText('Claude te pose une question')).toBeVisible({ timeout: 40_000 })
    await app.getByRole('button', { name: 'Commencer' }).first().click().catch(() => {}) // réponse cliquable (choix)
    await app.getByRole('button', { name: 'Accueil' }).click()
    await expect(app.getByRole('heading', { name: 'Projets' })).toBeVisible()
    expect(errors, errors.join('\n')).toEqual([])
  } finally { child.kill() }
})
