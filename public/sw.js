/* Flow service worker: offline shell, static asset cache, Web Push and click handling. */
const VERSION = 'flow-v2'
const STATIC = `${VERSION}-static`
const PAGES = `${VERSION}-pages`
const OFFLINE_URL = '/offline'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PAGES).then((c) => c.add(new Request(OFFLINE_URL, { cache: 'reload' }))).catch(() => {}).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

const isStatic = (url) => url.pathname.startsWith('/_next/static/') || /\.(?:woff2?|ttf|otf|svg|png|jpg|jpeg|webp|ico)$/.test(url.pathname) || url.pathname.startsWith('/icons/')
const cacheable = (res) => res && res.status === 200 && (res.type === 'basic' || res.type === 'default')

async function cacheFirst(request) {
  const cache = await caches.open(STATIC)
  const hit = await cache.match(request)
  if (hit) return hit
  const res = await fetch(request)
  if (cacheable(res)) cache.put(request, res.clone())
  return res
}

/** Pages: network first (fresh when online), last good copy when the network is gone, then the offline page. */
async function pageStrategy(request) {
  const cache = await caches.open(PAGES)
  try {
    const res = await Promise.race([fetch(request), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 6000))])
    if (cacheable(res) && (res.headers.get('content-type') || '').includes('text/html')) cache.put(request, res.clone())
    return res
  } catch {
    const url = new URL(request.url)
    return (
      (await cache.match(request, { ignoreSearch: true })) ||
      (url.pathname.startsWith('/app') ? await cache.match('/app', { ignoreSearch: true }) : undefined) ||
      (await cache.match(OFFLINE_URL)) ||
      new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } })
    )
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // Supabase & co: handled by the app's own data cache
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname === '/sw.js') return
  if (request.mode === 'navigate') { event.respondWith(pageStrategy(request)); return }
  if (isStatic(url)) event.respondWith(cacheFirst(request).catch(() => Response.error()))
})

self.addEventListener('message', (event) => {
  const d = event.data || {}
  if (d.type === 'clear') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))))
  } else if (d.type === 'warm' && Array.isArray(d.urls)) {
    // Quietly store the main pages so they open without a connection later.
    event.waitUntil(
      caches.open(PAGES).then((cache) =>
        Promise.all(d.urls.slice(0, 20).map(async (u) => {
          try {
            const req = new Request(u, { credentials: 'same-origin' })
            const res = await fetch(req)
            if (cacheable(res) && (res.headers.get('content-type') || '').includes('text/html')) await cache.put(req, res)
          } catch { /* offline or blocked: skip */ }
        })),
      ),
    )
  }
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'Flow', body: event.data && event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Flow', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // même étiquette que la notification locale de l'onglet (titre + texte) : un doublon remplace l'autre au lieu de s'empiler
      tag: data.tag || (data.title || 'Flow') + (data.body || ''),
      data: { url: data.url || '/app' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  let url = (event.notification.data && event.notification.data.url) || '/app'
  // liens externes autorisés : seulement le studio Remotion du Mac sur le réseau privé Tailscale (100.64.0.0/10), ouvert dans une nouvelle fenêtre
  try {
    const u = new URL(url, self.location.origin)
    if (u.origin !== self.location.origin) {
      const m = /^100\.(\d+)\./.exec(u.hostname)
      if (u.protocol === 'http:' && m && +m[1] >= 64 && +m[1] <= 127) { event.waitUntil(self.clients.openWindow(u.href)); return }
      url = '/app'
    }
  } catch { url = '/app' }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus() }
      }
      return self.clients.openWindow(url)
    }),
  )
})
