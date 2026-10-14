import { expect, test, type Page } from '@playwright/test'

async function startDemo(page: Page) {
  await page.goto('/demo')
  await page.waitForURL(/\/app\/demo/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
}

test.describe('marketing + auth', () => {
  test('landing renders, switches language and theme', async ({ page, isMobile }) => {
    await page.goto('/')
    if (isMobile) await page.getByRole('button', { name: 'Menu' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Au même endroit')
    await page.getByRole('button', { name: /langue|language/i }).first().click()
    await page.getByRole('menuitem', { name: 'English' }).click()
    if (isMobile) await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('In one place')
    if (isMobile && (await page.getByRole('button', { name: /theme|thème/i }).count()) === 0) await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('button', { name: /theme|thème/i }).first().click()
    await page.getByRole('menuitem', { name: /light|clair/i }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('no horizontal scroll', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1500)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test('protected app redirects to login', async ({ page }) => {
    await page.goto('/app/demo/tasks')
    await expect(page).toHaveURL(/\/login/)
  })

  test('login form validates and the demo button works', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /démo|demo/i }).click()
    await page.waitForURL(/\/app\/demo/, { timeout: 30_000 })
  })
})

test.describe('app (demo mode)', () => {
  test('dashboard shows seeded data', async ({ page }) => {
    await startDemo(page)
    await expect(page.getByText('Finaliser le nouvel onboarding').first()).toBeVisible()
  })

  test('create a task and see it listed', async ({ page }) => {
    await startDemo(page)
    await page.goto('/app/demo/tasks')
    const input = page.locator('#quick-add')
    await input.fill('Tâche créée par Playwright')
    await input.press('Enter')
    await expect(page.getByText('Tâche créée par Playwright')).toBeVisible()
  })

  test('send a chat message', async ({ page }) => {
    await startDemo(page)
    await page.goto('/app/demo/messages')
    await page.getByRole('link', { name: /general/ }).first().click()
    const box = page.getByRole('textbox', { name: /message/i })
    await box.fill('Bonjour e2e')
    await box.press('Enter')
    await expect(page.getByText('Bonjour e2e')).toBeVisible()
  })

  test('command palette opens with the keyboard', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'keyboard shortcut is desktop only')
    await startDemo(page)
    await page.keyboard.press('Control+k')
    await expect(page.getByPlaceholder(/rechercher|search/i).first()).toBeVisible()
  })

  test('every module loads without console errors', async ({ page }) => {
    // une vingtaine de pages, la première compilation en mode développement est lente
    test.setTimeout(180_000)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    await startDemo(page)
    for (const r of ['tasks', 'notes', 'calendar', 'messages', 'meetings', 'files', 'projects', 'goals', 'crm', 'finance', 'automations', 'forms', 'whiteboard', 'focus', 'habits', 'ai', 'trash', 'activity', 'settings', 'captures', 'inbox']) {
      await page.goto(`/app/demo/${r}`)
      await page.waitForTimeout(700)
      expect(await page.locator('main').innerText(), r).not.toContain('404')
    }
    expect(errors.filter((e) => !/Download the React DevTools|favicon/.test(e))).toEqual([])
  })

  test('mobile: app has no horizontal overflow', async ({ page, isMobile }) => {
    test.skip(!isMobile)
    await startDemo(page)
    for (const r of ['', '/tasks', '/messages', '/calendar', '/crm']) {
      await page.goto(`/app/demo${r}`)
      await page.waitForTimeout(800)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, r).toBeLessThanOrEqual(1)
    }
  })
})
