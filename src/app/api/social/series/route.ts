import { NextRequest, NextResponse } from 'next/server'
import { getServerDb, getAdminDb } from '@/lib/supabase/server'
import { sameOrigin } from '@/lib/security'
import type { Recurrence } from '@/lib/social/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (data: unknown, status = 200) => NextResponse.json(data, { status })

function nextAt(recurrence: Recurrence, timeOfDay: string, tz: string): Date {
  const now = new Date()
  const [h, m] = timeOfDay.split(':').map(Number)
  const candidate = new Date()
  candidate.setHours(h, m, 0, 0)
  if (candidate <= now) {
    switch (recurrence) {
      case 'daily': candidate.setDate(candidate.getDate() + 1); break
      case 'every2days': candidate.setDate(candidate.getDate() + 2); break
      case 'weekly': candidate.setDate(candidate.getDate() + 7); break
    }
  }
  return candidate
}

/** GET /api/social/series?ws=<slug> */
export async function GET(req: NextRequest) {
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const wsSlug = req.nextUrl.searchParams.get('ws')
  if (!wsSlug) return json({ error: 'ws required' }, 400)

  const admin = getAdminDb()
  const { data: ws } = await admin.from('workspaces').select('id').eq('slug', wsSlug).single()
  if (!ws) return json({ error: 'Workspace not found' }, 404)

  const { data: member } = await admin.from('workspace_members').select('role').eq('workspace_id', ws.id).eq('user_id', user.id).single()
  if (!member) return json({ error: 'Forbidden' }, 403)

  const { data: series } = await admin.from('social_series').select('*').eq('workspace_id', ws.id).order('created_at')
  return json({ series: series ?? [] })
}

/** POST /api/social/series — create automation series */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Forbidden' }, 403)

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json() as {
    ws: string
    name: string
    templateId?: string
    accountIds: string[]
    platforms: string[]
    recurrence: Recurrence
    timeOfDay: string
    timezone?: string
  }

  if (!body.ws || !body.name || !body.accountIds?.length || !body.recurrence || !body.timeOfDay) {
    return json({ error: 'Missing required fields' }, 400)
  }

  const admin = getAdminDb()
  const { data: ws } = await admin.from('workspaces').select('id').eq('slug', body.ws).single()
  if (!ws) return json({ error: 'Workspace not found' }, 404)

  const { data: member } = await admin.from('workspace_members').select('role').eq('workspace_id', ws.id).eq('user_id', user.id).single()
  if (!member) return json({ error: 'Forbidden' }, 403)

  const firstNext = nextAt(body.recurrence, body.timeOfDay, body.timezone ?? 'Europe/Paris')

  const { data: series, error } = await admin.from('social_series').insert({
    workspace_id: ws.id,
    name: body.name,
    template_id: body.templateId ?? null,
    account_ids: body.accountIds,
    platforms: body.platforms,
    recurrence: body.recurrence,
    time_of_day: body.timeOfDay,
    timezone: body.timezone ?? 'Europe/Paris',
    next_at: firstNext.toISOString(),
    is_active: true,
    created_by: user.id,
  }).select().single()

  if (error) return json({ error: error.message }, 500)
  return json({ series }, 201)
}

/** PATCH /api/social/series?id=<series_id> — pause/resume or update */
export async function PATCH(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Forbidden' }, 403)

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const seriesId = req.nextUrl.searchParams.get('id')
  if (!seriesId) return json({ error: 'id required' }, 400)

  const admin = getAdminDb()
  const { data: existing } = await admin.from('social_series').select('workspace_id').eq('id', seriesId).single()
  if (!existing) return json({ error: 'Not found' }, 404)

  const { data: member } = await admin.from('workspace_members').select('role').eq('workspace_id', existing.workspace_id).eq('user_id', user.id).single()
  if (!member) return json({ error: 'Forbidden' }, 403)

  const body = await req.json() as Record<string, unknown>
  const allowed = ['name', 'is_active', 'recurrence', 'time_of_day', 'timezone', 'account_ids', 'platforms', 'template_id']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (k in body) update[k] = body[k]

  const { data: series, error } = await admin.from('social_series').update(update).eq('id', seriesId).select().single()
  if (error) return json({ error: error.message }, 500)
  return json({ series })
}

/** DELETE /api/social/series?id=<series_id> */
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Forbidden' }, 403)

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const seriesId = req.nextUrl.searchParams.get('id')
  if (!seriesId) return json({ error: 'id required' }, 400)

  const admin = getAdminDb()
  const { data: existing } = await admin.from('social_series').select('workspace_id').eq('id', seriesId).single()
  if (!existing) return json({ error: 'Not found' }, 404)

  const { data: member } = await admin.from('workspace_members').select('role').eq('workspace_id', existing.workspace_id).eq('user_id', user.id).single()
  if (!member) return json({ error: 'Forbidden' }, 403)

  await admin.from('social_series').delete().eq('id', seriesId)
  return json({ ok: true })
}
