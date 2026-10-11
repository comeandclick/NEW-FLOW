/**
 * Cron endpoint: publishes scheduled posts whose scheduled_at <= now.
 * Trigger via Vercel Cron (vercel.json) or external cron every minute.
 * Protected by CRON_SECRET env var.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/supabase/server'
import { decryptToken } from '@/lib/social/crypto'
import { publishTo, type PublishPayload } from '@/lib/social/publisher'
import { notifyWorkspaceMembers } from '@/lib/social/notify'
import type { Platform } from '@/lib/social/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const json = (data: unknown, status = 200) => NextResponse.json(data, { status })

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) return json({ error: 'Unauthorized' }, 401)

  const admin = getAdminDb()
  const now = new Date().toISOString()

  // Fetch posts due for publishing
  const { data: posts } = await admin
    .from('social_posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)
    .is('deleted_at', null)
    .limit(20)

  if (!posts?.length) return json({ published: 0 })

  let published = 0

  for (const post of posts) {
    await admin.from('social_posts').update({ status: 'publishing', updated_at: now }).eq('id', post.id)

    const results: Record<string, { ok: boolean; url?: string; error?: string }> = {}

    for (const accountId of post.account_ids as string[]) {
      const { data: account } = await admin.from('social_accounts').select('*').eq('id', accountId).single()
      if (!account) { results[accountId] = { ok: false, error: 'Account not found' }; continue }

      let accessToken: string
      try { accessToken = await decryptToken(account.access_token_enc as string) } catch {
        results[accountId] = { ok: false, error: 'Decrypt failed' }; continue
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
        results[accountId] = await publishTo(payload)
      } catch (err) {
        results[accountId] = { ok: false, error: String(err) }
      }
    }

    const anyOk = Object.values(results).some((r) => r.ok)
    const allOk = Object.values(results).every((r) => r.ok)

    await admin.from('social_posts').update({
      status: anyOk ? 'published' : 'failed',
      published_at: anyOk ? new Date().toISOString() : null,
      publish_results: results,
      updated_at: new Date().toISOString(),
    }).eq('id', post.id)

    if (anyOk) {
      published++
      void notifyWorkspaceMembers(admin, post.workspace_id as string, {
        title: 'Post publié',
        body: (post.title as string | null) ?? (post.caption as string).slice(0, 60),
        url: `/social/calendar`,
        type: 'social_published',
      })
    }

    // Handle series: schedule next post
    if (post.series_id) {
      const { data: series } = await admin.from('social_series').select('*').eq('id', post.series_id).single()
      if (series?.is_active) {
        const next = new Date()
        switch (series.recurrence) {
          case 'daily': next.setDate(next.getDate() + 1); break
          case 'every2days': next.setDate(next.getDate() + 2); break
          case 'weekly': next.setDate(next.getDate() + 7); break
        }
        const [h, m] = (series.time_of_day as string).split(':').map(Number)
        next.setHours(h, m, 0, 0)
        await admin.from('social_series').update({ next_at: next.toISOString(), updated_at: new Date().toISOString() }).eq('id', series.id)
      }
    }
  }

  return json({ published, total: posts.length })
}

// Also allow POST for webhook-style triggers
export { GET as POST }
