import { expect, test } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Installateur complet (mode test, sans rien installer) : le code apparaît, la page de liaison relie le Mac toute seule, l'installateur finit. Nécessite STUDIO_STORE=file.
test('installateur de bout en bout : liaison automatique sans rien saisir', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  await page.goto('/demo'); await page.waitForURL(/\/app\/demo/)
  const st = await (await page.request.get('/api/studio/status')).json()
  test.skip(st.mode !== 'live', 'STUDIO_STORE=file requis')
  const home = mkdtempSync(path.join(tmpdir(), 'fb-inst-'))
  const child = spawn('node', ['public/studio/flow-bridge.mjs', 'setup', '--gui'], { env: { ...process.env, FLOW_SERVER: baseURL!, FLOW_BRIDGE_HOME: home, FLOW_BRIDGE_FAKE: '1', FLOW_BRIDGE_NO_WINDOWS: '1', FLOW_DEVICE_NAME: 'Mac installateur' }, stdio: 'ignore' })
  const gui = () => { try { return Object.fromEntries(readFileSync(path.join(home, 'gui.txt'), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])) } catch { return {} as Record<string, string> } }
  await expect.poll(() => gui().code ?? '', { timeout: 60_000 }).toMatch(/^FLOW-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  const url = gui().url
  expect(url).toContain('/studio/connect#code=')
  await page.goto(url); // la page ouverte par l'installateur
  await expect(page.getByText('Mac relié')).toBeVisible({ timeout: 20_000 })
  await expect.poll(() => gui().phase, { timeout: 60_000 }).toBe('done')
  const devs = await (await page.request.get('/api/studio/devices')).json()
  expect(devs.devices.some((d: { name: string }) => d.name === 'Mac installateur')).toBe(true)
  child.kill()
})
