import { NextRequest, NextResponse } from 'next/server'
import { getServerDb, getAdminDb } from '@/lib/supabase/server'
import { sameOrigin } from '@/lib/security'
import { decryptToken } from '@/lib/social/crypto'
import { publishTo, type PublishPayload } from '@/lib/social/publisher'
import type { Platform } from '@/lib/social/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const json = (data: unknown, status = 200) => NextResponse.json(data, { status })

/** POST /api/social/publish — publish a post now (ignores scheduled_at) */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Forbidden' }, 403)

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)

  const { postId } = await req.json() as { postId: string }
  if (!postId) return json({ error: 'postId required' }, 400)

  const admin = getAdminDb()
  const { data: post } = await admin.from('social_posts').select('*').eq('id', postId).single()
  if (!post) return json({ error: 'Post not found' }, 404)

  const { data: member } = await admin.from('workspace_members').select('role').eq('workspace_id', post.workspace_id).eq('user_id', user.id).single()
  if (!member) return json({ error: 'Forbidden' }, 403)

  if (post.status === 'published') return json({ error: 'Already published' }, 409)

  await admin.from('social_posts').update({ status: 'publishing', updated_at: new Date().toISOString() }).eq('id', postId)

  const results: Record<string, { ok: boolean; url?: string; error?: string }> = {}

  for (const accountId of post.account_ids as string[]) {
    const { data: account } = await admin.from('social_accounts').select('*').eq('id', accountId).single()
    if (!account) { results[accountId] = { ok: false, error: 'Account not found' }; continue }

    let accessToken: string
    try {
      accessToken = await decryptToken(account.access_token_enc as string)
    } catch {
      results[accountId] = { ok: false, error: 'Failed to decrypt token' }
      continue
    }

    const payload: PublishPayload = {
      accessToken,
      caption: post.caption as string,
      title: post.title as string | null,
      mediaUrls: post.media_urls as string[],
      platform: account.platform as Platform,
      externalAccountId: account.external_id as string,
    }

    try {
      const result = await publishTo(payload)
      results[accountId] = result
    } catch (err) {
      results[accountId] = { ok: false, error: String(err) }
    }
  }

  const allOk = Object.values(results).every((r) => r.ok)
  const anyOk = Object.values(results).some((r) => r.ok)

  await admin.from('social_posts').update({
    status: allOk ? 'published' : anyOk ? 'published' : 'failed',
    published_at: anyOk ? new Date().toISOString() : null,
    publish_results: results,
    updated_at: new Date().toISOString(),
  }).eq('id', postId)

  return json({ results, status: allOk ? 'published' : anyOk ? 'partial' : 'failed' })
}
