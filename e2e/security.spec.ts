/** API-level security checks against the real Supabase project (Row Level Security + guards). */
import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]))
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, S = env.SUPABASE_SECRET_KEY
const stamp = Date.now()
test.skip(!process.env.E2E_REAL, 'set E2E_REAL=1 to run against the real backend')
test.describe.configure({ mode: 'serial' })

type User = { id: string; token: string; email: string }
const users: Record<string, User> = {}
let ws = '', priv = '', general = ''

async function signup(tag: string) {
  const email = `sec-${tag}-${stamp}@example.com`
  const r = await (await fetch(`${U}/auth/v1/signup`, { method: 'POST', headers: { apikey: K, 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'Sec-Passw0rd!', data: { full_name: tag } }) })).json()
  users[tag] = { id: r.user.id, token: r.access_token, email }
}
const rest = (tag: string | null, p: string, init: RequestInit = {}) =>
  fetch(`${U}/rest/v1/${p}`, { ...init, headers: { apikey: K, Authorization: `Bearer ${tag ? users[tag].token : K}`, 'content-type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) } })

test.beforeAll(async () => {
  await signup('owner'); await signup('admin'); await signup('member'); await signup('outsider')
  const w = await (await rest('owner', 'rpc/create_workspace', { method: 'POST', body: JSON.stringify({ p_name: 'Sec', p_slug: `sec-${stamp}` }) })).json()
  ws = w.id
  await rest('owner', 'workspace_members', { method: 'POST', body: JSON.stringify([{ workspace_id: ws, user_id: users.admin.id, role: 'admin' }, { workspace_id: ws, user_id: users.member.id, role: 'member' }]) })
  general = (await (await rest('owner', `conversations?workspace_id=eq.${ws}&select=id`)).json())[0].id
  const c = await (await rest('owner', 'conversations', { method: 'POST', body: JSON.stringify({ workspace_id: ws, type: 'channel', name: 'secret', is_private: true, created_by: users.owner.id }) })).json()
  priv = c[0].id
  await rest('owner', 'conversation_members', { method: 'POST', body: JSON.stringify({ conversation_id: priv, user_id: users.owner.id }) })
  await rest('owner', 'messages', { method: 'POST', body: JSON.stringify({ conversation_id: priv, user_id: users.owner.id, content: 'top secret' }) })
})

test.afterAll(async () => {
  const headers = { apikey: S, Authorization: `Bearer ${S}` }
  const list = await (await fetch(`${U}/auth/v1/admin/users?per_page=200`, { headers })).json()
  for (const u of list.users ?? []) if (u.email.startsWith('sec-') && u.email.endsWith(`-${stamp}@example.com`)) await fetch(`${U}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers })
})

test('anonymous users read nothing', async () => {
  for (const t of ['workspaces', 'tasks', 'messages', 'notes', 'files', 'profiles', 'workspace_members', 'notifications']) {
    const r = await rest(null, `${t}?select=id`)
    expect(await r.json(), t).toEqual([])
  }
})

test('outsider sees nothing of the workspace', async () => {
  for (const t of ['workspaces', 'tasks', 'messages', 'conversations', 'workspace_members']) expect(await (await rest('outsider', `${t}?select=id`)).json(), t).toEqual([])
})

test('a member cannot join a private channel nor read its messages', async () => {
  const join = await rest('member', 'conversation_members', { method: 'POST', body: JSON.stringify({ conversation_id: priv, user_id: users.member.id }) })
  expect(join.status).toBeGreaterThanOrEqual(400)
  expect(await (await rest('member', `messages?conversation_id=eq.${priv}&select=id`)).json()).toEqual([])
})

test('a member can read public channel messages and post in joined ones', async () => {
  const join = await rest('member', 'conversation_members', { method: 'POST', body: JSON.stringify({ conversation_id: general, user_id: users.member.id }) })
  expect(join.status).toBeLessThan(300)
  const post = await rest('member', 'messages', { method: 'POST', body: JSON.stringify({ conversation_id: general, user_id: users.member.id, content: 'hello' }) })
  expect(post.status).toBeLessThan(300)
})

test('a member cannot post as someone else', async () => {
  const r = await rest('member', 'messages', { method: 'POST', body: JSON.stringify({ conversation_id: general, user_id: users.owner.id, content: 'spoof' }) })
  expect(r.status).toBeGreaterThanOrEqual(400)
})

test('an admin cannot promote anyone to owner or demote the owner', async () => {
  const promote = await rest('admin', `workspace_members?workspace_id=eq.${ws}&user_id=eq.${users.admin.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'owner' }) })
  expect(promote.status).toBeGreaterThanOrEqual(400)
  const demote = await rest('admin', `workspace_members?workspace_id=eq.${ws}&user_id=eq.${users.owner.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'member' }) })
  expect(demote.status).toBeGreaterThanOrEqual(400)
  const remove = await rest('admin', `workspace_members?workspace_id=eq.${ws}&user_id=eq.${users.owner.id}`, { method: 'DELETE' })
  expect(remove.status).toBeGreaterThanOrEqual(400)
})

test('an admin cannot take over the workspace owner_id', async () => {
  const r = await rest('admin', `workspaces?id=eq.${ws}`, { method: 'PATCH', body: JSON.stringify({ owner_id: users.admin.id }) })
  expect(r.status).toBeGreaterThanOrEqual(400)
})

test('a viewer cannot write', async () => {
  await rest('owner', `workspace_members?workspace_id=eq.${ws}&user_id=eq.${users.member.id}`, { method: 'PATCH', body: JSON.stringify({ role: 'viewer' }) })
  const r = await rest('member', 'tasks', { method: 'POST', body: JSON.stringify({ workspace_id: ws, title: 'nope' }) })
  expect(r.status).toBeGreaterThanOrEqual(400)
})

test('notifications cannot target users outside the workspace', async () => {
  const r = await rest('owner', 'notifications', { method: 'POST', body: JSON.stringify({ user_id: users.outsider.id, workspace_id: ws, type: 'x', title: 'spam' }) })
  expect(r.status).toBeGreaterThanOrEqual(400)
  const noWs = await rest('owner', 'notifications', { method: 'POST', body: JSON.stringify({ user_id: users.outsider.id, type: 'x', title: 'spam' }) })
  expect(noWs.status).toBeGreaterThanOrEqual(400)
})

test('files bucket is private to workspace members', async () => {
  const up = await fetch(`${U}/storage/v1/object/files/${ws}/o.txt`, { method: 'POST', headers: { apikey: K, Authorization: `Bearer ${users.owner.token}`, 'content-type': 'text/plain' }, body: 'x' })
  expect(up.status).toBeLessThan(300)
  const read = await fetch(`${U}/storage/v1/object/authenticated/files/${ws}/o.txt`, { headers: { apikey: K, Authorization: `Bearer ${users.outsider.token}` } })
  expect(read.status).toBeGreaterThanOrEqual(400)
  const anon = await fetch(`${U}/storage/v1/object/public/files/${ws}/o.txt`)
  expect(anon.status).toBeGreaterThanOrEqual(400)
})
