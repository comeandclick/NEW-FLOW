/** Real backend (Supabase): personal area in the profile, tag colours through /api/tags, note assignment. */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL
const SECRET = env.SUPABASE_SECRET_KEY
const U = { name: 'Social E2E', email: `e2e-s-${Date.now()}@example.com`, password: 'E2e-Passw0rd!' }

test.skip(!process.env.E2E_REAL, 'set E2E_REAL=1 to run against the real backend')
test.describe.configure({ mode: 'serial' })

test.afterAll(async () => {
  const headers = { apikey: SECRET, Authorization: `Bearer ${SECRET}` }
  const list = await (await fetch(`${SUPA}/auth/v1/admin/users?per_page=200`, { headers })).json()
  for (const u of list.users ?? []) if (u.email === U.email) await fetch(`${SUPA}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers })
})

test('perso notes/events persist in the profile, tags save through the API', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel(/nom complet/i).fill(U.name)
  await page.getByLabel(/adresse e-mail/i).fill(U.email)
  await page.getByLabel(/mot de passe/i).fill(U.password)
  await page.getByRole('button', { name: /créer mon compte/i }).click()
  await page.waitForURL(/\/app/, { timeout: 30_000 })
  await page.getByLabel(/nom de l.espace/i).fill('Social E2E')
  await page.getByRole('button', { name: /créer l.espace/i }).click()
  await page.waitForURL(/\/app\/social-e2e-/, { timeout: 30_000 })
  const slug = new URL(page.url()).pathname.split('/')[2]

  await page.goto(`/app/${slug}/me`)
  await page.getByRole('button', { name: 'Nouvelle note' }).click()
  await page.getByLabel('Titre').fill('Note privée réelle')
  await page.getByLabel('Écrivez ici…').fill('contenu')
  await page.waitForTimeout(2000)
  await page.getByRole('tab', { name: 'Calendrier' }).click()
  await page.getByRole('button', { name: 'Nouvel évènement' }).click()
  await page.getByRole('dialog').getByLabel('Titre').fill('Évènement perso réel')
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('button', { name: /Évènement perso réel/ }).first()).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: 'Notes' }).click()
  await expect(page.getByText('Note privée réelle').first()).toBeVisible()
  await page.goto(`/app/${slug}/calendar`)
  await page.getByRole('tab', { name: 'Jour' }).click()
  await expect(page.getByText('Évènement perso réel').first()).toBeVisible()

  // Note: assignee + tag + colour saved via /api/tags, kept after reload.
  await page.goto(`/app/${slug}/notes`)
  await page.getByRole('button', { name: /^Nouvelle note/ }).first().click()
  await page.waitForURL(/\/notes\/[0-9a-f-]+/)
  await page.getByTestId('note-assignees').getByText('Social E2E').click()
  const tag = page.getByPlaceholder('Ajouter une étiquette')
  await tag.fill('urgent'); await tag.press('Enter')
  await expect(page.getByRole('button', { name: /Supprimer urgent/ })).toBeVisible()
  await page.goto(`/app/${slug}/notes`)
  await page.getByRole('button', { name: 'Gérer les étiquettes' }).click()
  const dlg = page.getByRole('dialog')
  page.on('console', (m) => { if (m.type() === 'error') console.log('CERR', m.text().slice(0, 200)) })
  await dlg.getByRole('button', { name: 'Personnes prévenues' }).first().click()
  await dlg.getByRole('button', { name: '#ef4444' }).click()
  await dlg.locator('label', { hasText: 'Social E2E' }).click()
  await page.waitForTimeout(4500)
  await page.reload()
  await page.getByRole('button', { name: 'Gérer les étiquettes' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Personnes prévenues' }).first().click()
  await expect(page.getByRole('dialog').getByLabel('Social E2E')).toBeChecked()
  await expect(page.getByTestId('alerts-widget')).toHaveCount(0)
  await page.goto(`/app/${slug}`)
  await expect(page.getByTestId('alerts-widget')).toBeVisible()
})
