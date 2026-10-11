/** New product / planning pages (demo mode). */
import { expect, test } from '@playwright/test'
import path from 'node:path'

test.beforeEach(async ({ page }) => {
  await page.goto('/demo')
  await page.waitForURL(/\/app\/demo/, { timeout: 30_000 })
})

test('inbox: a task without project or owner can be filed from the inbox', async ({ page }) => {
  await page.goto('/app/demo/tasks')
  await page.locator('#quick-add').fill('Tâche à trier E2E')
  await page.locator('#quick-add').press('Enter')
  await expect(page.getByText('Tâche à trier E2E').first()).toBeVisible()
  await page.goto('/app/demo/inbox')
  const row = page.getByRole('listitem').filter({ hasText: 'Tâche à trier E2E' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Me l’assigner' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Tâche à trier E2E' })).toHaveCount(0)
})

test('roadmap shows project bars and the zoom changes the range', async ({ page }) => {
  await page.goto('/app/demo/roadmap')
  await expect(page.getByRole('heading', { name: 'Roadmap' })).toBeVisible()
  const bars = page.locator('a[aria-label*="/"]')
  await expect(bars.first()).toBeVisible()
  const before = await page.locator('text=/→/').first().innerText()
  await page.getByRole('tab', { name: '12 mois' }).click()
  await expect(page.locator('text=/→/').first()).not.toHaveText(before)
})

test('team page lists members with their load', async ({ page }) => {
  await page.goto('/app/demo/team')
  await expect(page.getByRole('progressbar', { name: 'Charge prévue cette semaine' }).first()).toBeVisible()
  await page.getByRole('button', { name: /Léa Martin/ }).click()
  await expect(page.getByRole('button', { name: /Léa Martin/ })).toHaveAttribute('aria-expanded', 'true')
})

test('feedback: log a bug, filter it and close it', async ({ page }) => {
  await page.goto('/app/demo/feedback')
  await page.getByRole('button', { name: 'Nouveau retour' }).first().click()
  await page.getByLabel('Titre').fill('Crash sur la révision')
  await page.getByLabel('Écran').fill('Révision')
  await page.getByRole('dialog').getByLabel('Version').fill('2.0.3 (41)')
  await page.getByLabel('Appareil').fill('iPhone 13')
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  const row = page.getByRole('listitem').filter({ hasText: 'Crash sur la révision' })
  await expect(row).toContainText('v2.0.3 (41)')
  await page.locator('select[aria-label="Version"]').selectOption('2.0.3 (41)')
  await expect(row).toBeVisible()
  await row.getByRole('combobox').selectOption('done')
  await expect(page.getByRole('listitem').filter({ hasText: 'Crash sur la révision' })).toHaveCount(0) // hidden by the "open" scope
  await page.locator('select[aria-label="Statut"]').selectOption('all')
  await expect(page.getByRole('listitem').filter({ hasText: 'Crash sur la révision' })).toBeVisible()
})

test('releases: finished tasks become notes you can edit and save', async ({ page }) => {
  await page.goto('/app/demo/tasks')
  await page.locator('#quick-add').fill('Mode hors-ligne E2E')
  await page.locator('#quick-add').press('Enter')
  await page.getByText('Mode hors-ligne E2E').first().click()
  await page.locator('label:has-text("Statut") select').selectOption('done')
  await page.keyboard.press('Escape')
  await page.goto('/app/demo/releases')
  await page.getByLabel('Numéro de version').fill('2.0.3')
  await expect(page.getByLabel('Aperçu (modifiable)')).toHaveValue(/# Notes de version 2\.0\.3[\s\S]*Mode hors-ligne E2E/)
  await page.getByRole('checkbox', { name: 'Mode hors-ligne E2E' }).uncheck()
  await expect(page.getByLabel('Aperçu (modifiable)')).not.toHaveValue(/Mode hors-ligne E2E/)
  await page.getByRole('checkbox', { name: 'Mode hors-ligne E2E' }).check()
  await page.getByRole('button', { name: 'Enregistrer en note' }).click()
  await expect(page.getByRole('link', { name: /Notes de version 2\.0\.3/ })).toBeVisible()
})

test('localization: create a set, import a CSV, edit and keep checks', async ({ page }) => {
  await page.goto('/app/demo/localization')
  await page.getByRole('button', { name: 'Nouveau jeu de textes' }).first().click()
  await page.getByLabel('Nom').fill('Kalimat')
  await page.getByRole('dialog').getByRole('button', { name: 'Créer' }).click()
  await expect(page.getByText('Aucun texte')).toBeVisible()
  await page.locator('input[type=file]').setInputFiles(path.join(__dirname, 'fixtures-fr.csv'))
  await page.getByRole('textbox', { name: 'Langue', exact: true }).fill('fr')
  await page.getByRole('dialog').getByRole('button', { name: 'Importer' }).click()
  await expect(page.getByLabel('home.title (fr)')).toHaveValue('Bonjour {name}')
  // English text that forgot the {name} variable is flagged; the missing Arabic is counted.
  await page.getByLabel('home.title (en)').fill('Hello')
  await expect(page.getByText('variables différentes')).toBeVisible()
  await expect(page.getByText('2 manquants').first()).toBeVisible()
  await expect(page.getByRole('status')).toContainText(/Enregistré à|Enregistrement|Modifications/, { timeout: 10_000 })
  await expect(page.getByRole('status')).toContainText('Enregistré à', { timeout: 10_000 })
  await page.reload()
  await expect(page.getByLabel('home.title (en)')).toHaveValue('Hello')
})

test('repeating task: completing it creates the next occurrence', async ({ page }) => {
  await page.goto('/app/demo/tasks')
  await page.locator('#quick-add').fill('Point hebdo E2E')
  await page.locator('#quick-add').press('Enter')
  await page.getByText('Point hebdo E2E').first().click()
  const panel = page
  await panel.getByLabel('Échéance').fill('2030-01-07')
  await panel.getByLabel('Répéter').selectOption('weekly')
  await panel.locator('label:has-text("Statut") select').selectOption('done')
  await expect(page.getByText(/Prochaine occurrence/)).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('/app/demo/tasks')
  // The finished one is archived under Done; the new occurrence is open and due a week later.
  const open = page.getByRole('row').or(page.locator('li')).filter({ hasText: 'Point hebdo E2E' })
  await expect(open.first()).toContainText(/14 janv/)
})

test('search finds tasks, notes and messages everywhere and filters by type', async ({ page }) => {
  await page.goto('/app/demo/search')
  await page.getByRole('searchbox', { name: 'Recherche' }).fill('démo')
  const results = page.locator('main a').filter({ has: page.locator('svg[aria-label]') })
  await expect.poll(() => results.count(), { timeout: 10_000 }).toBeGreaterThan(0)
  await page.getByRole('button', { name: /^Tâches \d+/ }).click()
  await expect(page.getByRole('button', { name: /^Tâches \d+/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('searchbox', { name: 'Recherche' }).fill('zzzzzzzz')
  await expect(page.getByText('Aucun résultat pour « zzzzzzzz »')).toBeVisible()
})

test('csv import: tasks from a Trello-style file', async ({ page }) => {
  await page.goto('/app/demo/tasks')
  await page.getByRole('button', { name: 'Import / export CSV' }).click()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: 'Importer un fichier CSV' }).click()])
  await chooser.setFiles({ name: 'trello.csv', mimeType: 'text/csv', buffer: Buffer.from('Card Name,List Name,Due Date,Labels\nCarte importée A,Doing,2030-02-01,"ios, urgent"\nCarte importée B,Done,,\n') })
  await expect(page.getByRole('dialog')).toContainText('2 tâches trouvées')
  await page.getByRole('button', { name: 'Importer 2' }).click()
  await expect(page.getByText('Carte importée A').first()).toBeVisible()
})

test('notes: create from a template', async ({ page }) => {
  await page.goto('/app/demo/notes')
  await page.getByRole('button', { name: 'Modèles' }).click()
  await page.getByRole('menuitem', { name: 'Décision d’architecture' }).click()
  await page.waitForURL(/\/notes\/[0-9a-f-]+/)
  await expect(page.getByText('Options étudiées')).toBeVisible({ timeout: 10_000 })
})

test('home: the daily update is built from your tasks and can be edited', async ({ page }) => {
  await page.goto('/app/demo')
  await page.getByRole('button', { name: 'Point du jour' }).click()
  const box = page.getByLabel('Point du jour').last()
  await expect(box).toHaveValue(/Point du jour — Alex/)
  await box.fill('Mon point')
  await expect(box).toHaveValue('Mon point')
})

test('calendar: export is a valid .ics file', async ({ page }) => {
  await page.goto('/app/demo/calendar')
  await page.getByRole('button', { name: 'Calendrier : import et export' }).click()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: 'Exporter en .ics' }).click()])
  const text = await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8')
  expect(text).toContain('BEGIN:VCALENDAR'); expect(text).toContain('BEGIN:VEVENT'); expect(dl.suggestedFilename()).toMatch(/\.ics$/)
})
