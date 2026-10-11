import { asDevice, json } from '@/lib/studio/server/http'
import { bridgeEvent, type BridgeEvent } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = asDevice(async (req, dev) => {
  const b = (await req.json().catch(() => null)) as { jobId?: string; event?: BridgeEvent } | null
  if (!b?.jobId || !b.event?.type) return json({ error: 'invalid' }, 400)
  await bridgeEvent(dev, b.jobId, b.event)
  return json({ ok: true })
})
