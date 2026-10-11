import { asDevice, json } from '@/lib/studio/server/http'
import { bridgePoll } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = asDevice(async (req, dev) => {
  const b = (await req.json().catch(() => ({}))) as { busyJob?: string | null; version?: string }
  return json(await bridgePoll(dev, b))
})
