import { asUser, json, originOf } from '@/lib/studio/server/http'
import { getPreview } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Dernières captures du Mac pour ce projet (liens signés de 5 minutes). */
export const GET = asUser(async (req, user, { params }) => json(await getPreview(user.id, (await params).id, originOf(req))), { limit: 600 })
