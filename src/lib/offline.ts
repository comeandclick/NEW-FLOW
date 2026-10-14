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

// Copie en mémoire + index (taille, date) : lire ou écrire ne décode plus tout le cache à chaque requête (14/10/2026 :
// makeRoom relisait et décodait jusqu'à 4,5 Mo à CHAQUE écriture, plusieurs fois par page : lenteur aux clics et à l'ouverture).
const memoire = new Map<string, { raw: string; v: unknown }>()
let index: Map<string, { t: number; size: number }> | null = null
function lireIndex() {
  if (index) return index
  index = new Map()
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (!k?.startsWith(PREFIX)) continue
    const raw = localStorage.getItem(k) ?? ''
    const t = Number(raw.match(/^\{"t":(\d+)/)?.[1] ?? 0) // l'horodatage est en tête : pas besoin de tout décoder
    index.set(k, { t, size: raw.length })
  }
  return index
}

export function readCache<T>(key: string): T | null {
  const m = memoire.get(key)
  if (m) return m.v as T
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return null
    const v = (JSON.parse(raw) as Entry<T>).v
    memoire.set(key, { raw: '', v })
    return v
  } catch { return null }
}

export function writeCache<T>(key: string, value: T) {
  try {
    const corps = JSON.stringify(value)
    if (memoire.get(key)?.raw === corps) return // rien n'a changé : pas d'écriture
    memoire.set(key, { raw: corps, v: value })
    const raw = `{"t":${Date.now()},"v":${corps}}`
    if (raw.length > MAX_ITEM) return
    makeRoom(raw.length, PREFIX + key)
    localStorage.setItem(PREFIX + key, raw)
    lireIndex().set(PREFIX + key, { t: Date.now(), size: raw.length })
  } catch {
    try { makeRoom(MAX_TOTAL) } catch {}
  }
}

function makeRoom(extra: number, remplace?: string) {
  const idx = lireIndex()
  let total = 0
  for (const [k, e] of idx) if (k !== remplace) total += e.size
  if (total + extra <= MAX_TOTAL) return
  const items = [...idx].filter(([k]) => k !== remplace).sort((a, b) => a[1].t - b[1].t)
  while (total + extra > MAX_TOTAL && items.length) { const [k, e] = items.shift()!; localStorage.removeItem(k); idx.delete(k); memoire.delete(k.slice(PREFIX.length)); total -= e.size }
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
    memoire.clear(); index = null
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
