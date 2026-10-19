import webpush from 'web-push'
import { getAdminDb } from '@/lib/supabase/server'
import { safePath } from '@/lib/utils'
import { mergePrefs, shouldAlert } from '@/lib/prefs'
import { sendApns } from '@/lib/api/apns'

/** Inserts in-app notifications and (best effort) Web Push for the given users. */
export async function notifyUsers(workspaceId: string, userIds: string[], n: { type: string; title: string; body?: string | null; url?: string | null }) {
  if (!userIds.length) return 0
  const admin = getAdminDb()
  await admin.from('notifications').insert(userIds.map((user_id) => ({ user_id, workspace_id: workspaceId, type: n.type, title: n.title.slice(0, 160), body: n.body?.slice(0, 300) ?? null, url: n.url ?? null })))
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) return userIds.length
  const { data: profs } = await admin.from('profiles').select('id,preferences,timezone').in('id', userIds)
  const allowed = new Set((profs ?? []).filter((p) => { const pr = mergePrefs((p.preferences as { ui?: unknown } | null)?.ui); return pr.notif.system && shouldAlert(pr, n.type, p.timezone ?? 'Europe/Paris') }).map((p) => p.id as string))
  if (!allowed.size) return userIds.length
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint,keys').in('user_id', [...allowed])
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:contact@flow.app', pub, priv)
  const payload = JSON.stringify({ title: n.title.slice(0, 120), body: (n.body ?? '').slice(0, 200), url: safePath(n.url) })
  await Promise.all((subs ?? []).map(async (s) => {
    // iPhone (app Flow Workspace) : APNs ; navigateurs : Web Push
    if (s.endpoint.startsWith('apns:')) {
      if (await sendApns(s.endpoint, s.keys as { topic?: string }, { title: n.title, body: n.body, url: safePath(n.url) }) === 'gone') await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      return
    }
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } }, payload) }
    catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint) }
  }))
  return userIds.length
}
