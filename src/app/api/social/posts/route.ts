import { NextRequest, NextResponse } from 'next/server'
import { getServerDb, getAdminDb } from '@/lib/supabase/server'
import { sameOrigin } from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (data: unknown, status = 200) => NextResponse.json(data, { status })

async function resolveWs(wsSlug: string) {
  const admin = getAdminDb()
  const { data } = await admin.from('workspaces').select('id').eq('slug', wsSlug).single()
  return data
}

/** GET /api/social/posts?ws=<slug>&status=<status>&limit=<n>&offset=<n> */
export async function GET(req: NextRequest) {
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const wsSlug = req.nextUrl.searchParams.get('ws')
  if (!wsSlug) return json({ error: 'ws required' }, 400)

  const ws = await resolveWs(wsSlug)
  if (!ws) return json({ error: 'Workspace not found' }, 404)

  const admin = getAdminDb()
  const { data: member } = await admin.from('workspace_members').select('role').eq('workspace_id', ws.id).eq('user_id', user.id).single()
  if (!member) return json({ error: 'Forbidden' }, 403)

  const status = req.nextUrl.searchParams.get('status')
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 100)
  const offset = Number(req.nextUrl.searchParams.get('offset') ?? 0)

  let q = admin.from('social_posts')
    .select('*')
    .eq('workspace_id', ws.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) q = q.eq('status', status)

  const { data: posts } = await q
  return json({ posts: posts ?? [] })
}

/** POST /api/social/posts — create draft or schedule */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Forbidden' }, 403)

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json() as {
    ws: string
    title?: string
    caption: string
    mediaUrls?: string[]
    platforms: string[]
    accountIds: string[]
    scheduledAt?: string | null
  }

  if (!body.ws || !body.caption || !body.platforms?.length || !body.accountIds?.length) {
    return json({ error: 'Missing required fields' }, 400)
  }
  if (body.caption.length < 1 || body.caption.length > 63206) return json({ error: 'Caption too long' }, 400)

  const ws = await resolveWs(body.ws)
  if (!ws) return json({ error: 'Workspace not found' }, 404)

  const admin = getAdminDb()
  const { data: member } = await admin.from('workspace_members').select('role').eq('workspace_id', ws.id).eq('user_id', user.id).single()
  if (!member) return json({ error: 'Forbidden' }, 403)

  const status = body.scheduledAt ? 'scheduled' : 'draft'

  const { data: post, error } = await admin.from('social_posts').insert({
    workspace_id: ws.id,
    title: body.title ?? null,
    caption: body.caption,
    media_urls: body.mediaUrls ?? [],
    platforms: body.platforms,
    account_ids: body.accountIds,
    status,
    scheduled_at: body.scheduledAt ?? null,
    created_by: user.id,
  }).select().single()

  if (error) return json({ error: error.message }, 500)
  return json({ post }, 201)
}

/** PATCH /api/social/posts?id=<post_id> */
export async function PATCH(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Forbidden' }, 403)

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const postId = req.nextUrl.searchParams.get('id')
  if (!postId) return json({ error: 'id required' }, 400)

  const admin = getAdminDb()
  const { data: existing } = await admin.from('social_posts').select('workspace_id,status').eq('id', postId).single()
  if (!existing) return json({ error: 'Not found' }, 404)

  const { data: member } = await admin.from('workspace_members').select('role').eq('workspace_id', existing.workspace_id).eq('user_id', user.id).single()
  if (!member) return json({ error: 'Forbidden' }, 403)

  if (existing.status === 'publishing' || existing.status === 'published') {
    return json({ error: 'Cannot edit a post that is publishing or published' }, 409)
  }

  const body = await req.json() as Record<string, unknown>
  const allowed = ['title', 'caption', 'media_urls', 'platforms', 'account_ids', 'scheduled_at', 'status']
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of allowed) if (k in body) update[k] = body[k]

  const { data: post, error } = await admin.from('social_posts').update(update).eq('id', postId).select().single()
  if (error) return json({ error: error.message }, 500)
  return json({ post })
}

/** DELETE /api/social/posts?id=<post_id> */
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Forbidden' }, 403)

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const postId = req.nextUrl.searchParams.get('id')
  if (!postId) return json({ error: 'id required' }, 400)

  const admin = getAdminDb()
  const { data: existing } = await admin.from('social_posts').select('workspace_id').eq('id', postId).single()
  if (!existing) return json({ error: 'Not found' }, 404)

  const { data: member } = await admin.from('workspace_members').select('role').eq('workspace_id', existing.workspace_id).eq('user_id', user.id).single()
  if (!member) return json({ error: 'Forbidden' }, 403)

  await admin.from('social_posts').update({ deleted_at: new Date().toISOString() }).eq('id', postId)
  return json({ ok: true })
}
