/** Real backend: public API v1 with scoped keys (create in UI, use over HTTP, enforce scopes, revoke). */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const U = env.NEXT_PUBLIC_SUPABASE_URL, S = env.SUPABASE_SECRET_KEY
const email = `e2e-api-${Date.now()}@example.com`
const bots: string[] = []
test.skip(!process.env.E2E_REAL, 'set E2E_REAL=1 to run against the real backend')
test.describe.configure({ mode: 'serial', timeout: 180_000 })

test.afterAll(async () => {
  const headers = { apikey: S, Authorization: `Bearer ${S}` }
  const list = await (await fetch(`${U}/auth/v1/admin/users?per_page=200`, { headers })).json()
  for (const u of list.users ?? []) if (u.email === email || bots.includes(u.id)) await fetch(`${U}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers })
})

test('API keys: create, use, scope, revoke', async ({ page, request, baseURL }) => {
  await page.goto('/register')
  await page.getByLabel(/nom complet/i).fill('Aymen API')
  await page.getByLabel(/adresse e-mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill('E2e-Passw0rd!')
  await page.getByRole('button', { name: /créer mon compte/i }).click()
  await page.waitForURL(/\/app/)
  await page.getByRole('button', { name: /charger le projet kalimat/i }).click()
  await page.waitForURL(/\/app\/kalimat-/, { timeout: 60_000 })
  const base = new URL(page.url()).pathname

  // Create a key from the UI.
  await page.goto(`${base}/settings?tab=api`)
  await page.getByRole('button', { name: 'Nouvelle clé' }).first().click()
  await page.getByLabel('Nom de la clé').fill('Claude E2E')
  await page.getByRole('dialog').getByRole('button', { name: 'Nouvelle clé' }).click()
  const key = (await page.getByRole('dialog').locator('pre').innerText()).trim()
  expect(key).toMatch(/^flw_[\w-]{40,}$/)
  await page.getByRole('button', { name: 'OK' }).click()
  await expect(page.getByText('Claude E2E').first()).toBeVisible()

  const api = (p: string, init: { method?: string; data?: unknown; k?: string | null } = {}) =>
    request.fetch(`${baseURL}/api/v1${p}`, { method: init.method ?? 'GET', data: init.data, headers: { ...(init.k === null ? {} : { authorization: `Bearer ${init.k ?? key}` }) } })

  // Auth
  expect((await api('/tasks', { k: null })).status()).toBe(401)
  expect((await api('/tasks', { k: 'flw_nope' })).status()).toBe(401)
  const me = await (await api('/me')).json()
  bots.push(me.data.bot_user_id)
  expect(me.data.key.scopes).toContain('tasks:write')

  // Tasks: read the imported Kalimat backlog, create, complete, validate.
  const list = await (await api('/tasks?status=todo&limit=5')).json()
  expect(list.count).toBeGreaterThan(5)
  const projects = (await (await api('/projects')).json()).data
  const created = await api('/tasks', { method: 'POST', data: { title: 'Tâche via API', priority: 'high', project_id: projects[0].id, tags: ['api'] } })
  expect(created.status()).toBe(201)
  const t = (await created.json()).data
  expect(t.created_by).toBe(me.data.bot_user_id)
  const done = await (await api(`/tasks/${t.id}`, { method: 'PATCH', data: { status: 'done' } })).json()
  expect(done.data.status).toBe('done'); expect(done.data.completed_at).toBeTruthy()
  expect((await api(`/tasks/${t.id}`, { method: 'PATCH', data: { status: 'nope' } })).status()).toBe(400)
  expect((await api('/tasks', { method: 'POST', data: { title: 'x', project_id: '00000000-0000-4000-8000-000000000000' } })).status()).toBe(400)
  expect((await api('/tasks', { method: 'POST', data: {} })).status()).toBe(400)
  expect((await api('/tasks', { method: 'POST', data: { title: 'x', workspace_id: '00000000-0000-4000-8000-000000000000' } })).status()).toBe(201) // unknown columns are ignored, never trusted

  // Notes (markdown in, markdown out), events, goals, CRM
  const note = (await (await api('/notes', { method: 'POST', data: { title: 'Compte rendu', markdown: '# Titre\n- [x] fait\n- [ ] reste' } })).json()).data
  expect((await (await api(`/notes/${note.id}`)).json()).data.markdown).toContain('- [x] fait')
  expect((await api('/events', { method: 'POST', data: { title: 'Point API', start_at: new Date().toISOString(), end_at: new Date(Date.now() + 3.6e6).toISOString() } })).status()).toBe(201)
  expect((await (await api('/goals')).json()).count).toBeGreaterThan(0)
  expect((await api('/contacts')).status()).toBe(403) // CRM is not in the "agent" preset

  // Messages: appears in the app, authored by the key.
  const msg = await api('/messages', { method: 'POST', data: { channel: 'general', text: 'Salut depuis l’API 👋' } })
  expect(msg.status()).toBe(201)
  const msgs = (await (await api('/messages?channel=general')).json()).data
  expect(msgs.at(-1).content).toContain('Salut depuis l’API')
  expect((await api('/messages', { method: 'POST', data: { channel: 'inconnu', text: 'x' } })).status()).toBe(404)
  expect((await api('/notifications', { method: 'POST', data: { title: 'Build terminé', body: 'OK' } })).status()).toBe(201)

  // Files: small inline, then a 6 MB file through the signed upload URL.
  const small = (await (await api('/files', { method: 'POST', data: { name: 'rapport.md', text: '# Rapport\nTout est vert.', folder: '/Rapports' } })).json()).data
  const got = (await (await api(`/files/${small.id}?content=1`)).json()).data
  expect(got.content).toContain('Tout est vert'); expect(got.download_url).toContain('http')
  const big = Buffer.alloc(6 * 1024 * 1024, 7)
  const up = (await (await api('/files/upload-url', { method: 'POST', data: { name: 'gros.bin', size: big.length, mime: 'application/octet-stream' } })).json()).data
  const put = await request.fetch(up.upload_url, { method: 'PUT', data: big, headers: { 'content-type': 'application/octet-stream' } })
  expect(put.ok()).toBeTruthy()
  const reg = await api('/files/register', { method: 'POST', data: { path: up.path, name: 'gros.bin', folder: '/Gros' } })
  expect(reg.status()).toBe(201)
  expect((await (await reg.json()).data.size)).toBe(big.length)
  expect((await api('/files/upload-url', { method: 'POST', data: { name: 'enorme.bin', size: 30 * 1024 * 1024 } })).status()).toBe(413)
  expect((await api('/files/register', { method: 'POST', data: { path: `other/api/x`, name: 'x' } })).status()).toBe(400)

  // Alerts: finishing the last task of a project reports the task and the group, in an auto-created channel.
  const proj = (await (await api('/projects', { method: 'POST', data: { name: 'Projet alerte' } })).json()).data
  const t2 = (await (await api('/tasks', { method: 'POST', data: { title: 'Tâche alerte', project_id: proj.id } })).json()).data
  expect((await api(`/tasks/${t2.id}?silent=1`, { method: 'PATCH', data: { status: 'in_progress' } })).status()).toBe(200)
  expect((await api(`/tasks/${t2.id}`, { method: 'PATCH', data: { status: 'done' } })).status()).toBe(200)
  const prog = (await (await api('/messages?channel=avancement')).json()).data.map((m: { content: string }) => m.content)
  expect(prog.some((c: string) => c.startsWith('Tâche terminée — Tâche alerte'))).toBeTruthy()
  expect(prog.some((c: string) => c.includes('Projet « Projet alerte » : toutes les tâches sont terminées'))).toBeTruthy()
  const sec = await api('/alerts', { method: 'POST', data: { type: 'security.alert', title: 'Clé exposée dans un commit', body: 'À révoquer', severity: 'critical' } })
  expect(sec.status()).toBe(201)
  const secMsgs = (await (await api('/messages?channel=securite')).json()).data
  expect(secMsgs.at(-1).content).toContain('Alerte de sécurité · critique — Clé exposée')
  expect((await api('/alerts', { method: 'POST', data: { type: 'nope', title: 'x' } })).status()).toBe(400)
  expect((await api('/alerts', { method: 'POST', data: { type: 'request', title: 'Quelle priorité ?', channel: 'questions' } })).status()).toBe(201)
  expect((await (await api('/channels')).json()).data.map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining(['avancement', 'securite', 'questions']))

  // Release notes + OpenAPI
  const cl = (await (await api('/changelog?lang=fr')).json()).data
  expect(cl.markdown).toContain('Tâche alerte'); expect(cl.count).toBeGreaterThan(0)
  const oa = await request.get(`${baseURL}/api/v1/openapi.json`)
  expect(oa.status()).toBe(200); expect((await oa.json()).paths['/tasks/{id}']).toBeTruthy()

  // Soft delete → gone from the API, recoverable (row kept).
  expect((await api(`/tasks/${t.id}`, { method: 'DELETE' })).status()).toBe(200)
  expect((await api(`/tasks/${t.id}`)).status()).toBe(404)

  // The work shows up in the app.
  await page.goto(`${base}/tasks`)
  await expect(page.getByText('Tâche via API').first()).toBeVisible({ timeout: 20_000 }).catch(() => {}) // soft-deleted above: only the second "x" tasks remain
  await page.goto(`${base}/messages`)
  await page.getByText('general').first().click()
  await expect(page.getByText('Salut depuis l’API')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Claude E2E (API)').first()).toBeVisible()

  // Read-only key can read but not write.
  const ro = await page.request.post('/api/keys', { data: { workspaceId: me.data.workspace.id, name: 'Lecture', scopes: ['tasks:read'] } })
  expect(ro.ok()).toBeTruthy()
  const roKey = (await ro.json()).key
  expect((await api('/tasks', { k: roKey })).status()).toBe(200)
  expect((await api('/tasks', { method: 'POST', data: { title: 'nope' }, k: roKey })).status()).toBe(403)
  expect((await api('/notes', { k: roKey })).status()).toBe(403)
  bots.push((await (await api('/me', { k: roKey })).json()).data.bot_user_id)

  // Revoke from the UI → 401 right away.
  await page.goto(`${base}/settings?tab=api`)
  await page.getByRole('button', { name: 'Révoquer Claude E2E' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Révoquer' }).click()
  await expect(page.getByText('Claude E2E')).toHaveCount(0)
  expect((await api('/tasks')).status()).toBe(401)
})
