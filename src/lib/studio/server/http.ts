import 'server-only'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getServerDb } from '@/lib/supabase/server'
import { DEMO_COOKIE, DEMO_USER_ID } from '@/lib/demo/constants'
import { rateLimited, sameOrigin } from '@/lib/security'
import { deviceFromToken, StudioError } from './service'
import { studioDb } from './db'

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
export const originOf = (req: Request) => {
  const proto = req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')
  return `${proto}://${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`
}
export const ipOf = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'

export type StudioUser = { id: string; demo: boolean }
/** Utilisateur Flow connecté. En développement (STUDIO_STORE=file) le compte de démonstration est accepté pour tester de bout en bout. */
export async function studioUser(): Promise<StudioUser | null> {
  try {
    const { data: { user } } = await (await getServerDb()).auth.getUser()
    if (user) return { id: user.id, demo: false }
  } catch { /* pas de session */ }
  const demo = (await cookies()).get(DEMO_COOKIE)?.value === '1'
  if (demo && process.env.STUDIO_STORE === 'file') return { id: DEMO_USER_ID, demo: true }
  return null
}

type Ctx = { params: Promise<Record<string, string>> }
type UserHandler = (req: Request, user: StudioUser, ctx: Ctx) => Promise<Response>

/** Route réservée à un utilisateur Flow connecté (cookie) : origine contrôlée sur les écritures, limite de débit. */
export const asUser = (h: UserHandler, opts: { write?: boolean; limit?: number } = {}) => async (req: Request, ctx: Ctx) => {
  try {
    if (opts.write !== false && req.method !== 'GET' && !sameOrigin(req)) return json({ error: 'origin' }, 403)
    const user = await studioUser()
    if (!user) return json({ error: 'unauthorized' }, 401)
    if (rateLimited(`studio:${user.id}`, opts.limit ?? 240)) return json({ error: 'rate_limited' }, 429)
    return await h(req, user, ctx)
  } catch (e) {
    if (e instanceof StudioError) return json({ error: e.code }, e.status)
    console.error('[studio]', e)
    return json({ error: 'server' }, 500)
  }
}

type DeviceHandler = (req: Request, dev: Awaited<ReturnType<typeof deviceFromToken>>, ctx: Ctx) => Promise<Response>
/** Route appelée par le pont du Mac : jeton d'appareil en Bearer. */
export const asDevice = (h: DeviceHandler) => async (req: Request, ctx: Ctx) => {
  try {
    const tok = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null
    if (rateLimited(`bridge:${tok?.slice(0, 12) ?? ipOf(req)}`, 600)) return json({ error: 'rate_limited' }, 429)
    const dev = await deviceFromToken(tok)
    return await h(req, dev, ctx)
  } catch (e) {
    if (e instanceof StudioError) return json({ error: e.code }, e.status)
    console.error('[studio-bridge]', e)
    return json({ error: 'server' }, 500)
  }
}

export const storeInfo = async () => { const r = await studioDb().ready(); return { store: studioDb().kind, ready: r.ok, reason: r.reason ?? null } }
