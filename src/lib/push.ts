'use client'
import { getDb } from '@/lib/supabase/client'

export function pushPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

function urlBase64ToUint8Array(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

/** Ask permission, register the service worker and (outside demo) subscribe to Web Push. */
export async function enablePush(isDemo: boolean): Promise<NotificationPermission | 'unsupported'> {
  if (pushPermission() === 'unsupported') return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!isDemo && key && 'PushManager' in window) {
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }))
      const json = sub.toJSON()
      const { data } = await getDb().auth.getUser()
      if (data.user && json.endpoint) {
        await getDb().from('push_subscriptions').upsert({ user_id: data.user.id, endpoint: json.endpoint, keys: json.keys }, { onConflict: 'endpoint' })
      }
    }
  } catch { /* push is best-effort */ }
  return perm
}

/** Cet appareil est-il abonné aux notifications (abonnement du navigateur présent) ? */
export async function deviceSubscribed(): Promise<boolean> {
  try {
    if (pushPermission() !== 'granted' || !('serviceWorker' in navigator)) return false
    const reg = await navigator.serviceWorker.getRegistration('/sw.js') ?? await navigator.serviceWorker.getRegistration()
    return !!(await reg?.pushManager?.getSubscription())
  } catch { return false }
}

/** Désabonne CET appareil seulement (les autres appareils gardent leurs notifications). */
export async function disablePushHere(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js') ?? await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager?.getSubscription()
    if (sub) { await getDb().from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
  } catch { /* rien à désactiver */ }
}

/** Local system notification (works in demo too). Skipped when the tab is focused. */
export function showSystemNotification(title: string, body: string, url?: string) {
  if (pushPermission() !== 'granted') return
  if (typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus()) return
  try {
    const n = new Notification(title, { body, icon: '/icons/icon-192.png', tag: title + body })
    n.onclick = () => { window.focus(); if (url) window.location.href = url; n.close() }
  } catch {
    navigator.serviceWorker?.ready.then((r) => r.showNotification(title, { body, icon: '/icons/icon-192.png', data: { url } }))
  }
}
