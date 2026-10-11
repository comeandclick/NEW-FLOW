import { asDevice, json } from '@/lib/studio/server/http'
import { bridgeSetup } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = asDevice(async (req, dev) => {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object' || JSON.stringify(b).length > 60_000) return json({ error: 'invalid' }, 400)
  await bridgeSetup(dev, b)
  return json({ ok: true })
})
