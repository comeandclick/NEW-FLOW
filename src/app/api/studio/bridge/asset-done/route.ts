import { asDevice, json } from '@/lib/studio/server/http'
import { bridgeAssetDone } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = asDevice(async (req, dev) => {
  const b = (await req.json().catch(() => null)) as { assetId?: string } | null
  if (!b?.assetId) return json({ error: 'invalid' }, 400)
  await bridgeAssetDone(dev, b.assetId)
  return json({ ok: true })
})
