import { asUser, json, originOf } from '@/lib/studio/server/http'
import { getJob, removeJob } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = asUser(async (req, user, { params }) => json({ job: await getJob(user.id, (await params).id, originOf(req)) }), { write: false, limit: 600 })
export const DELETE = asUser(async (_r, user, { params }) => { await removeJob(user.id, (await params).id); return json({ ok: true }) })
