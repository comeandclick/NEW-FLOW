import { rateLimited } from '@/lib/security'
import { ipOf, json } from '@/lib/studio/server/http'
import { pairPoll, StudioError } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (rateLimited(`pair-poll:${ipOf(req)}`, 120)) return json({ error: 'rate_limited' }, 429)
  const t = new URL(req.url).searchParams.get('token')
  if (!t) return json({ error: 'token' }, 400)
  try { return json(await pairPoll(t)) } catch (e) { return e instanceof StudioError ? json({ error: e.code }, e.status) : json({ error: 'server' }, 500) }
}
