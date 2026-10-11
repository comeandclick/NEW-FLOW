import { asDevice, json, originOf } from '@/lib/studio/server/http'
import { bridgeJob } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = asDevice(async (req, dev) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return json({ error: 'id' }, 400)
  return json({ job: await bridgeJob(dev, id, originOf(req)) })
})
