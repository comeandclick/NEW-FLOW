import { NextRequest, NextResponse } from 'next/server'
import { getServerDb, getAdminDb } from '@/lib/supabase/server'
import { sameOrigin } from '@/lib/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (data: unknown, status = 200) => NextResponse.json(data, { status })

/** GET /api/social/templates?ws=<slug> */
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

  const { data: templates } = await admin
    .from('social_templates')
    .select('*')
    .or(`is_global.eq.true,workspace_id.eq.${ws.id}`)
    .order('sort_order')

  return json({ templates: templates ?? [] })
}

/** POST /api/social/templates — create workspace template */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Forbidden' }, 403)

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json() as {
    ws: string
    name: string
    description?: string
    type: string
    voiceOptions?: string[]
    sfx?: boolean
    durationSec?: number
    ratio?: string
  }

  if (!body.ws || !body.name || !body.type) return json({ error: 'ws, name and type required' }, 400)

  const admin = getAdminDb()
  const { data: ws } = await admin.from('workspaces').select('id').eq('slug', body.ws).single()
  if (!ws) return json({ error: 'Workspace not found' }, 404)

  const { data: member } = await admin.from('workspace_members').select('role').eq('workspace_id', ws.id).eq('user_id', user.id).single()
  if (!member) return json({ error: 'Forbidden' }, 403)

  const { data: template, error } = await admin.from('social_templates').insert({
    workspace_id: ws.id,
    name: body.name,
    description: body.description ?? null,
    type: body.type,
    voice_options: body.voiceOptions ?? [],
    sfx: body.sfx ?? true,
    duration_sec: body.durationSec ?? null,
    ratio: body.ratio ?? '9:16',
    is_demo: false,
    is_global: false,
    created_by: user.id,
  }).select().single()

  if (error) return json({ error: error.message }, 500)
  return json({ template }, 201)
}
