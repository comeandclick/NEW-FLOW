import { NextResponse } from 'next/server'
import { getAdminDb, getServerDb } from '@/lib/supabase/server'
import { generateKey } from '@/lib/api/keys'
import { MAX_KEYS, validScopes, type StoredKey } from '@/lib/api/scopes'
import { rateLimited, sameOrigin } from '@/lib/security'
import { ALERT_TYPES, cleanChannel, emitAlert, routesFrom } from '@/lib/api/alerts'

export const runtime = 'nodejs'

/** Key management. Session auth; only workspace owners/admins. Secrets are shown once and stored hashed. */
async function admin(workspaceId: unknown, req: Request) {
  if (typeof workspaceId !== 'string' || !sameOrigin(req) || !(req.headers.get('content-type') ?? '').startsWith('application/json')) return null
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user || rateLimited(`keys:${user.id}`, 30)) return null
  const a = getAdminDb()
  const { data: m } = await a.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle()
  if (!m || !['owner', 'admin'].includes(m.role)) return null
  return { a, user }
}

async function readKeys(a: ReturnType<typeof getAdminDb>, id: string) {
  const { data } = await a.from('workspaces').select('settings').eq('id', id).single()
  const settings = (data?.settings ?? {}) as Record<string, unknown>
  return { settings, keys: ((settings.api_keys as StoredKey[] | undefined) ?? []) }
}

export async function POST(req: Request) {
  let b: { workspaceId?: string; name?: string; scopes?: unknown; expiresInDays?: number | null }
  try { b = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const ctx = await admin(b.workspaceId, req)
  if (!ctx) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const name = String(b.name ?? '').trim().slice(0, 60)
  const scopes = validScopes(b.scopes)
  if (!name || !scopes) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const { a, user } = ctx
  const wsId = b.workspaceId!
  const { settings, keys } = await readKeys(a, wsId)
  if (keys.length >= MAX_KEYS) return NextResponse.json({ error: 'too_many_keys' }, { status: 409 })

  const id = crypto.randomUUID()
  // Each key acts as its own bot member so that everything it writes is attributed to it.
  const { data: bot, error: be } = await a.auth.admin.createUser({
    email: `bot-${id}@bots.flow.invalid`, email_confirm: true, user_metadata: { full_name: `${name} (API)` },
  })
  if (be || !bot.user) return NextResponse.json({ error: 'bot_failed' }, { status: 500 })
  await a.from('profiles').update({ preferences: { bot: true }, status: 'online' }).eq('id', bot.user.id)
  const writes = scopes.some((s) => s.endsWith(':write'))
  const { error: me } = await a.from('workspace_members').insert({ workspace_id: wsId, user_id: bot.user.id, role: writes ? 'member' : 'viewer', invited_by: user.id })
  if (me) { await a.auth.admin.deleteUser(bot.user.id); return NextResponse.json({ error: 'member_failed' }, { status: 500 }) }

  const { key, prefix, hash } = generateKey()
  const days = typeof b.expiresInDays === 'number' && b.expiresInDays > 0 ? Math.min(b.expiresInDays, 365) : null
  const stored: StoredKey = { id, name, prefix, hash, scopes, bot_id: bot.user.id, created_by: user.id, created_at: new Date().toISOString(), expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null }
  const { error: ue } = await a.from('workspaces').update({ settings: { ...settings, api_keys: [...keys, stored] } }).eq('id', wsId)
  if (ue) { await a.from('workspace_members').delete().eq('user_id', bot.user.id); await a.auth.admin.deleteUser(bot.user.id); return NextResponse.json({ error: 'save_failed' }, { status: 500 }) }
  return NextResponse.json({ key, id, prefix })
}

export async function DELETE(req: Request) {
  let b: { workspaceId?: string; keyId?: string }
  try { b = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const ctx = await admin(b.workspaceId, req)
  if (!ctx || !b.keyId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { a } = ctx
  const wsId = b.workspaceId!
  const { settings, keys } = await readKeys(a, wsId)
  const k = keys.find((x) => x.id === b.keyId)
  if (!k) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  await a.from('workspaces').update({ settings: { ...settings, api_keys: keys.filter((x) => x.id !== k.id) } }).eq('id', wsId)
  // Keep the bot's history readable but strip its write access.
  await a.from('workspace_members').update({ role: 'viewer' }).eq('workspace_id', wsId).eq('user_id', k.bot_id)
  return NextResponse.json({ ok: true })
}

/** Alert routing: which channel each event goes to, and whether it also notifies. */
export async function PUT(req: Request) {
  let b: { workspaceId?: string; routes?: Record<string, { enabled?: boolean; channel?: string; notify?: boolean }> }
  try { b = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const ctx = await admin(b.workspaceId, req)
  if (!ctx || !b.routes || typeof b.routes !== 'object') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const routes: Record<string, { enabled: boolean; channel: string; notify: boolean }> = {}
  for (const t of ALERT_TYPES) {
    const r = b.routes[t]
    if (r) routes[t] = { enabled: r.enabled !== false, channel: cleanChannel(String(r.channel ?? '')), notify: !!r.notify }
  }
  const { settings } = await readKeys(ctx.a, b.workspaceId!)
  await ctx.a.from('workspaces').update({ settings: { ...settings, api_alerts: { routes } } }).eq('id', b.workspaceId!)
  return NextResponse.json({ ok: true })
}

/** Sends a test alert (as the first key's bot) so the routing can be checked from the UI. */
export async function PATCH(req: Request) {
  let b: { workspaceId?: string; type?: string }
  try { b = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const ctx = await admin(b.workspaceId, req)
  if (!ctx) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const type = ALERT_TYPES.find((t) => t === b.type)
  if (!type) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  const { settings, keys } = await readKeys(ctx.a, b.workspaceId!)
  const key = keys[0]
  if (!key) return NextResponse.json({ error: 'no_key' }, { status: 409 })
  const { data: ws } = await ctx.a.from('workspaces').select('slug').eq('id', b.workspaceId!).single()
  const r = await emitAlert(ctx.a, { id: b.workspaceId!, slug: ws?.slug ?? '', settings }, key, { type, title: 'Alerte de test', body: 'Si vous lisez ceci, le routage fonctionne.' })
  return NextResponse.json(r)
}
