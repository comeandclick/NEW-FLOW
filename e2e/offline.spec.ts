/** Real backend + production build: the web app must open and show its last data without any connection. */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const U = env.NEXT_PUBLIC_SUPABASE_URL, S = env.SUPABASE_SECRET_KEY
const email = `e2e-off-${Date.now()}@example.com`
test.skip(!process.env.E2E_REAL, 'set E2E_REAL=1 (and run against a production build / deployment)')
test.use({ serviceWorkers: 'allow' })

test.afterAll(async () => {
  const headers = { apikey: S, Authorization: `Bearer ${S}` }
  const list = await (await fetch(`${U}/auth/v1/admin/users?per_page=200`, { headers })).json()
  for (const u of list.users ?? []) if (u.email === email) await fetch(`${U}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers })
})

test('opens and shows the last data with no connection', async ({ page, context }) => {
  await page.goto('/register')
  await page.getByLabel(/nom complet/i).fill('Aymen Hors-ligne')
  await page.getByLabel(/adresse e-mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill('E2e-Passw0rd!')
  await page.getByRole('button', { name: /créer mon compte/i }).click()
  await page.waitForURL(/\/app/)
  await page.getByLabel(/nom de l.espace/i).fill('Espace hors-ligne')
  await page.getByRole('button', { name: /créer l.espace/i }).click()
  await page.waitForURL(/\/app\/espace-hors-ligne-/, { timeout: 30_000 })
  const slug = new URL(page.url()).pathname.split('/')[2]

  await page.goto(`/app/${slug}/tasks`)
  await page.locator('#quick-add').fill('Tâche vue hors ligne')
  await page.locator('#quick-add').press('Enter')
  await expect(page.getByText('Tâche vue hors ligne')).toBeVisible()
  await page.goto(`/app/${slug}/notes`)

  // The service worker takes control and stores the main pages in the background.
  await expect.poll(() => page.evaluate(async () => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true)
  await expect.poll(() => page.evaluate(async () => { const c = await caches.keys(); let n = 0; for (const k of c) if (k.includes('pages')) n += (await (await caches.open(k)).keys()).length; return n }), { timeout: 30_000 }).toBeGreaterThan(5)

  await context.setOffline(true)
  await page.goto(`/app/${slug}/tasks`)
  await expect(page.getByText('Tâche vue hors ligne')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('status').filter({ hasText: 'Hors ligne' })).toBeVisible()

  // The installed app opens on /app: it must land in the workspace, not on the login page.
  await page.goto('/app')
  await page.waitForURL(new RegExp(`/app/${slug}`), { timeout: 20_000 })

  // A page that was never opened shows the friendly offline screen instead of a browser error.
  await page.goto('/pricing')
  await expect(page.getByRole('heading', { name: 'Vous êtes hors ligne' })).toBeVisible()

  await context.setOffline(false)
  await page.goto(`/app/${slug}/tasks`)
  await expect(page.getByText('Tâche vue hors ligne')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Hors ligne' })).toHaveCount(0)
})
