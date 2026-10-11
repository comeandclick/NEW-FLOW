import { asUser, json } from '@/lib/studio/server/http'
import { submitJob } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = asUser(async (_r, user, { params }) => json({ job: await submitJob(user.id, (await params).id) }))
