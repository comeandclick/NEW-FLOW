import { asUser, json } from '@/lib/studio/server/http'
import { controlJob } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = asUser(async (req, user, { params }) => {
  const b = (await req.json().catch(() => null)) as { action?: string } | null
  if (!b || !['pause', 'resume', 'cancel', 'retry'].includes(b.action ?? '')) return json({ error: 'invalid' }, 400)
  return json({ job: await controlJob(user.id, (await params).id, b.action as 'pause' | 'resume' | 'cancel' | 'retry') })
})
