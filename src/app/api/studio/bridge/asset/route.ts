import { asDevice, json, originOf } from '@/lib/studio/server/http'
import { bridgeAsset } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = asDevice(async (req, dev) => {
  const b = (await req.json().catch(() => null)) as { jobId?: string; name?: string; size?: number; mime?: string; kind?: string; link?: string } | null
  if (!b?.jobId || !b.name) return json({ error: 'invalid' }, 400)
  return json(await bridgeAsset(dev, b.jobId, { name: b.name, size: b.size, mime: b.mime, kind: b.kind, link: b.link }, originOf(req)), 201)
})
