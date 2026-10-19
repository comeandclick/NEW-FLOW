import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { getAdminDb, getServerDb } from '@/lib/supabase/server'
import { rateLimited, sameOrigin } from '@/lib/security'
import { safePath } from '@/lib/utils'
import { mergePrefs, shouldAlert } from '@/lib/prefs'
import { appleTargets, isAppleEndpoint, sendApns } from '@/lib/api/apns'

export const runtime = 'nodejs'

/**
 * Sends a Web Push to another member of the caller's workspace.
 * Authorisation: the caller must be signed in and share the workspace with the target.
 */
export async function POST(req: Request) {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv || !process.env.SUPABASE_SECRET_KEY) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 501 })

  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 })
  let body: { type?: string; userId?: string; workspaceId?: string; title?: string; body?: string; url?: string }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  if (!body.userId || !body.workspaceId || !body.title) return NextResponse.json({ ok: false }, { status: 400 })

  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  if (rateLimited(`push:${user.id}`, 60)) return NextResponse.json({ ok: false }, { status: 429 })

  const admin = getAdminDb()
  const { data: members } = await admin.from('workspace_members').select('user_id').eq('workspace_id', body.workspaceId).in('user_id', [user.id, body.userId])
  if ((members?.length ?? 0) < 2) return NextResponse.json({ ok: false }, { status: 403 })

  const { data: target } = await admin.from('profiles').select('preferences,timezone').eq('id', body.userId).maybeSingle()
  const prefs = mergePrefs((target?.preferences as { ui?: unknown } | null)?.ui)
  if (!prefs.notif.system || !shouldAlert(prefs, (body as { type?: string }).type ?? 'message', target?.timezone ?? 'Europe/Paris')) return NextResponse.json({ ok: true, sent: 0, muted: true })
  const { data: all } = await admin.from('push_subscriptions').select('endpoint,keys,user_id').eq('user_id', body.userId)
  const subs = appleTargets(all ?? [], body.type ?? 'message')
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contact@flow.app', pub, priv)
  const payload = JSON.stringify({ title: String(body.title).slice(0, 120), body: String(body.body ?? '').slice(0, 200), url: safePath(body.url) })
  let sent = 0
  await Promise.all((subs ?? []).map(async (s) => {
    if (isAppleEndpoint(s.endpoint)) {
      const r = await sendApns(s.endpoint, s.keys as { topic?: string }, { title: String(body.title), body: body.body ?? null, url: safePath(body.url) })
      if (r === 'ok') sent++
      else if (r === 'gone') await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      return
    }
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } }, payload); sent++ }
    catch (e) { if ((e as { statusCode?: number }).statusCode === 404 || (e as { statusCode?: number }).statusCode === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint) }
  }))
  return NextResponse.json({ ok: true, sent })
}
