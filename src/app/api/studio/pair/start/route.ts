import { rateLimited } from '@/lib/security'
import { ipOf, json } from '@/lib/studio/server/http'
import { pairStart } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Appelé par l'outil du Mac : demande un code à usage unique (valable 10 minutes). */
export async function POST(req: Request) {
  if (rateLimited(`pair-start:${ipOf(req)}`, 10, 10 * 60_000)) return json({ error: 'rate_limited' }, 429)
  let b: { deviceName?: string; os?: string; version?: string } = {}
  try { b = await req.json() } catch { /* corps vide */ }
  try { return json(await pairStart(b)) } catch (e) { console.error('[studio]', e); return json({ error: 'server' }, 500) }
}
