import { asUser, json } from '@/lib/studio/server/http'
import { pairConfirm } from '@/lib/studio/server/service'
import { rateLimited } from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = asUser(async (req, user) => {
  if (rateLimited(`pair-confirm:${user.id}`, 8, 10 * 60_000)) return json({ error: 'rate_limited' }, 429)
  const b = (await req.json().catch(() => ({}))) as { code?: string }
  return json({ device: await pairConfirm(user.id, b.code ?? '') })
})
