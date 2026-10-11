import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Application Flow Studio (fenêtre locale) de bout en bout, en mode test : code, liaison, installation de ce qui manque, bouton Commencer, ouverture de Flow Studio. STUDIO_STORE=file requis.
test('application Flow Studio : liaison, installation, commencer', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  await page.goto('/demo'); await page.waitForURL(/\/app\/demo/)
  const st = await (await page.request.get('/api/studio/status')).json()
  test.skip(st.mode !== 'live', 'STUDIO_STORE=file requis')
  const home = mkdtempSync(path.join(tmpdir(), 'fb-app-'))
  const urlFile = path.join(home, 'url.txt')
  const child = spawn('node', ['public/studio/flow-bridge.mjs', 'app'], { env: { ...process.env, FLOW_SERVER: baseURL!, FLOW_BRIDGE_HOME: home, FLOW_BRIDGE_FAKE: '1', FLOW_FAKE_MISSING: 'effectcraft,remotion,ffmpeg,skills', FLOW_BRIDGE_APP_URL_FILE: urlFile, FLOW_DEVICE_NAME: 'Mac app' }, stdio: 'ignore' })
  try {
    await expect.poll(() => existsSync(urlFile), { timeout: 20_000 }).toBe(true)
    const appUrl = readFileSync(urlFile, 'utf8')
    // sécurité : mauvais jeton / mauvais hôte refusés
    expect((await fetch(appUrl.replace(/\/t\/[^/]+\//, '/t/faux/') + 'state')).status).toBe(404)
    expect((await fetch(appUrl + 'install', { method: 'POST' })).status).toBe(403) // POST sans en-tête de confiance
    const app = await page.context().newPage()
    await app.goto(appUrl)
    const code = await app.locator('.code').innerText({ timeout: 20_000 })
    expect(code).toMatch(/^FLOW-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    await expect(app.getByRole('button', { name: 'Commencer' })).toBeDisabled()
    await expect(app.getByText('À installer').first()).toBeVisible()
    expect((await page.request.post('/api/studio/pair/confirm', { data: { code } })).status()).toBe(200) // l'utilisateur valide dans Flow
    await expect(app.getByText('Ce Mac est relié à ton compte Flow.')).toBeVisible({ timeout: 20_000 })
    await app.getByRole('button', { name: 'Installer ce qui manque' }).click()
    await expect(app.getByRole('button', { name: 'Tout est installé ✓' })).toBeVisible({ timeout: 60_000 })
    const go = app.getByRole('button', { name: 'Commencer' })
    await expect(go).toBeEnabled({ timeout: 20_000 })
    await go.click()
    await app.waitForURL(/\/studio\/live\?welcome=1/, { timeout: 15_000 }) // fondu puis Flow Studio
    await expect(app.getByText(/Aucun projet|Flow Studio/).first()).toBeVisible()
  } finally { child.kill() }
})
