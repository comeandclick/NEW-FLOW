import { NextRequest, NextResponse } from 'next/server'
import { getServerDb, getAdminDb } from '@/lib/supabase/server'
import { sameOrigin } from '@/lib/security'
import { encryptToken } from '@/lib/social/crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (data: unknown, status = 200) => NextResponse.json(data, { status })

/** GET /api/social/accounts?ws=<slug> */
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

  const { data: accounts } = await admin
    .from('social_accounts')
    .select('id,platform,external_id,username,display_name,avatar_url,followers,expires_at,is_active,created_at')
    .eq('workspace_id', ws.id)
    .order('created_at')

  return json({ accounts: accounts ?? [] })
}

/** DELETE /api/social/accounts?ws=<slug>&id=<account_id> */
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Forbidden' }, 403)

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const wsSlug = req.nextUrl.searchParams.get('ws')
  const accountId = req.nextUrl.searchParams.get('id')
  if (!wsSlug || !accountId) return json({ error: 'ws and id required' }, 400)

  const admin = getAdminDb()
  const { data: ws } = await admin.from('workspaces').select('id').eq('slug', wsSlug).single()
  if (!ws) return json({ error: 'Workspace not found' }, 404)

  const { data: member } = await admin.from('workspace_members').select('role').eq('workspace_id', ws.id).eq('user_id', user.id).single()
  if (!member) return json({ error: 'Forbidden' }, 403)

  await admin.from('social_accounts').delete().eq('id', accountId).eq('workspace_id', ws.id)
  return json({ ok: true })
}
