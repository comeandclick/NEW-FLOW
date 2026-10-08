/** Real backend: loading the Kalimat project into a fresh account goes through RLS and must produce everything. */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const U = env.NEXT_PUBLIC_SUPABASE_URL, S = env.SUPABASE_SECRET_KEY
const email = `e2e-k-${Date.now()}@example.com`
test.skip(!process.env.E2E_REAL, 'set E2E_REAL=1 to run against the real backend')

test.afterAll(async () => {
  const headers = { apikey: S, Authorization: `Bearer ${S}` }
  const list = await (await fetch(`${U}/auth/v1/admin/users?per_page=200`, { headers })).json()
  for (const u of list.users ?? []) if (u.email === email) await fetch(`${U}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers })
})

test('a new account can load the Kalimat project (tasks, notes, calendar, goals, files)', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel(/nom complet/i).fill('Aymen E2E')
  await page.getByLabel(/adresse e-mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill('E2e-Passw0rd!')
  await page.getByRole('button', { name: /créer mon compte/i }).click()
  await page.waitForURL(/\/app/)
  await page.getByRole('button', { name: /charger le projet kalimat/i }).click()
  await page.waitForURL(/\/app\/kalimat-/, { timeout: 60_000 })
  const base = new URL(page.url()).pathname

  await page.goto(`${base}/tasks`)
  await expect(page.getByText('Tester réellement la connexion Google et Apple')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/\d+ tâches/).first()).toContainText(/6\d tâches|7\d tâches/)
  await page.goto(`${base}/notes`)
  await expect(page.getByRole('heading', { name: 'Règles dures et décisions' })).toBeVisible()
  await page.goto(`${base}/goals`)
  await expect(page.getByRole('heading', { name: 'Publier Kalimat 2.0 sur l’App Store' })).toBeVisible()
  await page.goto(`${base}/files`)
  await page.getByRole('button', { name: 'Documents' }).click()
  await expect(page.getByText(/\.md/).first()).toBeVisible({ timeout: 20_000 })
  await page.goto(`${base}/calendar`)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
