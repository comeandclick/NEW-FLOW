'use client'
import { useEffect, useState } from 'react'

/**
 * Offline support.
 * - readCache / writeCache: last good copy of every query (localStorage, capped, oldest evicted first).
 * - identity: who was signed in, so the app can open without a connection.
 * - service worker: registered in production; it stores pages and static assets.
 * Everything here is wiped on sign-out, so a shared device keeps nothing.
 */
const PREFIX = 'flow_c:'
const IDENT = 'flow_ident'
const MAX_ITEM = 700_000
const MAX_TOTAL = 4_500_000

type Entry<T> = { t: number; v: T }

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as Entry<T>).v : null
  } catch { return null }
}

export function writeCache<T>(key: string, value: T) {
  try {
    const raw = JSON.stringify({ t: Date.now(), v: value } satisfies Entry<T>)
    if (raw.length > MAX_ITEM) return
    makeRoom(raw.length)
    localStorage.setItem(PREFIX + key, raw)
  } catch {
    try { makeRoom(MAX_TOTAL) } catch {}
  }
}

function makeRoom(extra: number) {
  const items: { k: string; t: number; size: number }[] = []
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith(PREFIX)) continue
    const raw = localStorage.getItem(k) ?? ''
    let t = 0
    try { t = (JSON.parse(raw) as Entry<unknown>).t } catch {}
    items.push({ k, t, size: raw.length }); total += raw.length
  }
  items.sort((a, b) => a.t - b.t)
  while (total + extra > MAX_TOTAL && items.length) { const o = items.shift()!; localStorage.removeItem(o.k); total -= o.size }
}

export type Identity = { id: string; profile: unknown }
export const readIdentity = (): Identity | null => { try { return JSON.parse(localStorage.getItem(IDENT) ?? 'null') } catch { return null } }
export function writeIdentity(i: Identity) {
  try {
    const prev = readIdentity()
    if (prev && prev.id !== i.id) clearOfflineData(false)
    localStorage.setItem(IDENT, JSON.stringify(i))
  } catch {}
}

export function clearOfflineData(includeIdentity = true) {
  try {
    const drop: string[] = []
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(PREFIX) || (includeIdentity && (k === IDENT || k === 'flow_last_ws'))) drop.push(k) }
    drop.forEach((k) => localStorage.removeItem(k))
  } catch {}
  try { navigator.serviceWorker?.controller?.postMessage({ type: 'clear' }) } catch {}
}

export function useOnline() {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

export async function registerServiceWorker() {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    return reg
  } catch { return null }
}

/** Ask the service worker to store the main pages of a workspace so they open without a connection. */
export function warmPages(urls: string[]) {
  try { navigator.serviceWorker?.controller?.postMessage({ type: 'warm', urls }) } catch {}
}
