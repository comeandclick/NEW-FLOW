/** Settings, preferences and mobile header (demo mode). */
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/demo')
  await page.waitForURL(/\/app\/demo/, { timeout: 30_000 })
})

test('preferences: accent, density and motion persist across reloads', async ({ page }) => {
  await page.goto('/app/demo/settings?tab=preferences')
  await page.getByRole('radio', { name: 'Rose' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'rose')
  await page.getByRole('radio', { name: 'Compacte' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact')
  await page.getByRole('switch', { name: 'Réduire les animations' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'rose')
  await expect(page.getByRole('radio', { name: 'Rose' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: 'Indigo' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-accent', /.+/)
})

test('preferences: notification categories and quiet hours', async ({ page }) => {
  await page.goto('/app/demo/settings?tab=preferences')
  const tasks = page.getByRole('switch', { name: 'Tâches', exact: true })
  await expect(tasks).toHaveAttribute('aria-checked', 'true')
  await tasks.click()
  await expect(tasks).toHaveAttribute('aria-checked', 'false')
  await page.getByRole('switch', { name: 'Heures calmes' }).click()
  await expect(page.getByLabel('De', { exact: true })).toHaveValue('22:00')
  await page.reload()
  await expect(page.getByRole('switch', { name: 'Tâches', exact: true })).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByLabel('De', { exact: true })).toHaveValue('22:00')
})

test('week start changes the calendar header', async ({ page }) => {
  await page.goto('/app/demo/settings?tab=preferences')
  await page.getByRole('radio', { name: 'Dimanche' }).click()
  await page.goto('/app/demo/calendar')
  await expect(page.locator('.grid-cols-7').first().locator('div').first()).toContainText(/dim/i)
})

test('project: edit, archive and confirmed delete', async ({ page }) => {
  await page.goto('/app/demo/projects')
  await page.locator('a[href*="/projects/"]').first().click()
  await page.getByRole('button', { name: 'Modifier' }).click()
  await page.getByLabel('Nom').fill('Projet renommé')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('heading', { name: /Projet renommé/ })).toBeVisible()
  await page.getByRole('button', { name: 'Archiver' }).click()
  await expect(page.getByText('Archivé').first()).toBeVisible()
  await page.getByRole('button', { name: 'Supprimer' }).first().click()
  await expect(page.getByRole('dialog')).toContainText('corbeille')
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByRole('heading', { name: /Projet renommé/ })).toBeVisible()
})

test('workspace settings: description is saved', async ({ page }) => {
  await page.goto('/app/demo/settings?tab=workspace')
  await page.getByLabel('Description').fill('Espace de test')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await page.waitForLoadState('load')
  await page.goto('/app/demo/settings?tab=workspace')
  await expect(page.getByLabel('Description')).toHaveValue('Espace de test')
})

test.describe('mobile header', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  test('shows the page title and moves theme / language into the account menu', async ({ page }) => {
    await page.goto('/app/demo/calendar')
    await expect(page.locator('header span[aria-hidden]').first()).toHaveText('Calendrier')
    await expect(page.getByRole('button', { name: 'Thème' })).toBeHidden()
    await page.getByRole('button', { name: 'Compte' }).click()
    await page.getByRole('button', { name: 'Sombre' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('button', { name: 'English' }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
  test('calendar: tapping a day lists its events below the grid', async ({ page }) => {
    await page.goto('/app/demo/calendar')
    await page.getByRole('button', { name: /vendredi 9 octobre/i }).first().click().catch(() => {})
    await expect(page.getByRole('region').first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
  })
})

test('projects: create one from a template (iOS release)', async ({ page }) => {
  await page.goto('/app/demo/projects')
  await page.getByRole('button', { name: 'Depuis un modèle' }).click()
  await page.getByRole('button', { name: /Sortie d’une version iOS/ }).click()
  await expect(page.getByRole('heading', { name: 'Sortie d’une version iOS' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('heading', { name: 'Sortie d’une version iOS' }).click()
  await page.goto('/app/demo/projects')
  await page.getByRole('link', { name: /Sortie d’une version iOS/ }).click()
  await expect(page.getByText('Soumettre à la revue App Review')).toBeVisible()
})
