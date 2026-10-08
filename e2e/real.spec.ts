/**
 * End-to-end test against the REAL backend (Supabase): two users, realtime chat, voice note,
 * invitations, file upload and a real WebRTC call using Chrome's fake camera/microphone.
 * Run: E2E_REAL=1 npx playwright test e2e/real.spec.ts --project=desktop
 */
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const SUPA = env.NEXT_PUBLIC_SUPABASE_URL
const SECRET = env.SUPABASE_SECRET_KEY
const stamp = Date.now()
const A = { name: 'Alice E2E', email: `e2e-a-${stamp}@example.com`, password: 'E2e-Passw0rd!' }
const B = { name: 'Bob E2E', email: `e2e-b-${stamp}@example.com`, password: 'E2e-Passw0rd!' }

test.skip(!process.env.E2E_REAL, 'set E2E_REAL=1 to run against the real backend')
test.describe.configure({ mode: 'serial' })
test.use({ permissions: ['microphone', 'camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } })

let ctxA: BrowserContext, ctxB: BrowserContext
let pa: Page, pb: Page
let slug = ''
let inviteLink = ''

async function register(page: Page, u: typeof A) {
  await page.goto('/register')
  await page.getByLabel(/nom complet/i).fill(u.name)
  await page.getByLabel(/adresse e-mail/i).fill(u.email)
  await page.getByLabel(/mot de passe/i).fill(u.password)
  await page.getByRole('button', { name: /créer mon compte/i }).click()
  await page.waitForURL(/\/app/, { timeout: 30_000 })
}

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  const opts = { permissions: ['microphone', 'camera'] as ('microphone' | 'camera')[], locale: 'fr-FR' }
  ctxA = await browser.newContext(opts); ctxB = await browser.newContext(opts)
  pa = await ctxA.newPage(); pb = await ctxB.newPage()
})

test.afterAll(async () => {
  // Delete both test users (cascades to workspaces, messages, tasks…).
  const headers = { apikey: SECRET, Authorization: `Bearer ${SECRET}` }
  const list = await (await fetch(`${SUPA}/auth/v1/admin/users?per_page=200`, { headers })).json()
  for (const u of list.users ?? []) if (u.email === A.email || u.email === B.email) await fetch(`${SUPA}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers })
  await ctxA?.close(); await ctxB?.close()
})

test('A signs up and creates a workspace', async () => {
  await register(pa, A)
  await pa.getByLabel(/nom de l.espace/i).fill('Espace E2E')
  await pa.getByRole('button', { name: /créer l.espace/i }).click()
  await pa.waitForURL(/\/app\/espace-e2e-/, { timeout: 30_000 })
  slug = new URL(pa.url()).pathname.split('/')[2]
  await expect(pa.getByRole('heading', { level: 1 })).toContainText('Alice')
})

test('A creates a task that persists after reload', async () => {
  await pa.goto(`/app/${slug}/tasks`)
  await pa.locator('#quick-add').fill('Tâche réelle E2E')
  await pa.locator('#quick-add').press('Enter')
  await expect(pa.getByText('Tâche réelle E2E')).toBeVisible()
  await pa.reload()
  await expect(pa.getByText('Tâche réelle E2E')).toBeVisible()
})

test('A uploads a file and previews it', async () => {
  await pa.goto(`/app/${slug}/files`)
  await pa.locator('input[type=file]').setInputFiles({ name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('bonjour e2e') })
  await expect(pa.getByText('note.txt')).toBeVisible({ timeout: 20_000 })
  await pa.getByText('note.txt').click()
  await expect(pa.getByRole('dialog')).toBeVisible()
})

test('A invites B by link and B joins', async () => {
  await pa.goto(`/app/${slug}/settings`)
  await pa.getByRole('tab', { name: /membres/i }).click()
  await pa.getByLabel(/adresse e-mail/i).fill(B.email)
  await pa.getByRole('button', { name: /^inviter$/i }).click()
  inviteLink = await pa.locator('input[readonly]').first().inputValue()
  expect(inviteLink).toContain('/invite/')
  await register(pb, B)
  await pb.getByLabel(/nom de l.espace/i).fill('Espace de Bob')
  await pb.getByRole('button', { name: /créer l.espace/i }).click()
  await pb.waitForURL(/\/app\/espace-de-bob-/)
  await pb.goto(inviteLink)
  await pb.getByRole('button', { name: /rejoindre l.espace/i }).click()
  await pb.waitForURL(new RegExp(`/app/${slug}`), { timeout: 20_000 })
})

test('chat is realtime between A and B', async () => {
  await pa.goto(`/app/${slug}/messages`); await pb.goto(`/app/${slug}/messages`)
  await pa.getByRole('link', { name: /general/ }).first().click(); await pb.getByRole('link', { name: /general/ }).first().click()
  const boxA = pa.getByRole('textbox', { name: /message/i })
  await expect(boxA).toBeVisible()
  await boxA.fill('Salut Bob, test temps réel'); await boxA.press('Enter')
  await expect(pb.getByText('Salut Bob, test temps réel')).toBeVisible({ timeout: 15_000 })
  const boxB = pb.getByRole('textbox', { name: /message/i })
  await boxB.fill('Reçu Alice !'); await boxB.press('Enter')
  await expect(pa.getByText('Reçu Alice !')).toBeVisible({ timeout: 15_000 })
})

test('B sends a voice note, A can see the player', async () => {
  await pb.getByRole('button', { name: /message vocal/i }).click()
  await pb.waitForTimeout(1800)
  await pb.getByRole('button', { name: /^send$/i }).click()
  await expect(pa.getByRole('slider', { name: /seek/i })).toBeVisible({ timeout: 20_000 })
})

test('notifications reach the other user', async () => {
  await pa.reload()
  await expect(pa.getByRole('button', { name: /notifications/i }).locator('span').first()).toBeVisible({ timeout: 15_000 })
})

test('real WebRTC video call between A and B', async () => {
  await pa.getByRole('button', { name: /appel vidéo/i }).click()
  await pa.waitForURL(/\/meetings\//)
  // B sees the incoming call overlay and accepts.
  await expect(pb.getByRole('alertdialog')).toBeVisible({ timeout: 20_000 })
  await pb.getByRole('button', { name: /rejoindre/i }).click()
  await pb.waitForURL(/\/meetings\//)
  await pa.getByRole('button', { name: /rejoindre maintenant/i }).click()
  await pb.getByRole('button', { name: /rejoindre maintenant/i }).click()
  // Each side must receive a live remote video track.
  for (const page of [pa, pb]) {
    await expect.poll(async () => page.evaluate(() => [...document.querySelectorAll('video')].filter((v) => (v.srcObject as MediaStream | null)?.getVideoTracks().some((t) => t.readyState === 'live')).length), { timeout: 40_000 }).toBeGreaterThanOrEqual(2)
  }
  await pa.getByRole('button', { name: /quitter/i }).click()
  await pb.getByRole('button', { name: /quitter/i }).click()
})
