import { asUser, json } from '@/lib/studio/server/http'
import { listDevices, removeDevice } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = asUser(async (_r, user) => json({ devices: await listDevices(user.id) }), { write: false })
export const DELETE = asUser(async (req, user) => {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return json({ error: 'id' }, 400)
  await removeDevice(user.id, id)
  return json({ ok: true })
})
