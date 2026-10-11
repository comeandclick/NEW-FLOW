import { asUser, json, originOf } from '@/lib/studio/server/http'
import { library } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = asUser(async (req, user) => json({ items: await library(user.id, originOf(req)) }), { write: false })
