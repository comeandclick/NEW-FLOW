import { getAdminDb } from '@/lib/supabase/server'
import { asUser, json } from '@/lib/studio/server/http'
import { studioDb } from '@/lib/studio/server/db'
import { createJob, listJobs } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = asUser(async (_r, user) => json({ jobs: await listJobs(user.id) }), { write: false })

export const POST = asUser(async (req, user) => {
  const b = (await req.json().catch(() => null)) as { kind?: 'motion' | 'site'; title?: string; spec?: Record<string, unknown>; prompt?: string; workspaceId?: string } | null
  if (!b || (b.kind !== 'motion' && b.kind !== 'site') || !b.prompt || b.prompt.length < 50) return json({ error: 'invalid' }, 400)
  let workspaceId: string | null = null
  if (b.workspaceId && studioDb().kind === 'supabase') {
    const { data } = await getAdminDb().from('workspace_members').select('user_id').eq('workspace_id', b.workspaceId).eq('user_id', user.id).maybeSingle()
    workspaceId = data ? b.workspaceId : null
  }
  const job = await createJob(user.id, { kind: b.kind, title: b.title ?? '', spec: b.spec ?? {}, prompt: b.prompt, workspaceId })
  return json({ job: { id: job.id } }, 201)
})
