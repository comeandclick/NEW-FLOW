import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getAdminDb } from '@/lib/supabase/server'

export type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Cond = unknown | { gt: number | string } | { in: unknown[] } | { not: null }
export type Where = Record<string, Cond>
export type Opts = { order?: [string, boolean]; limit?: number }

export interface Db {
  kind: 'file' | 'supabase'
  insert(table: string, row: Row): Promise<Row>
  select(table: string, where?: Where, opts?: Opts): Promise<Row[]>
  update(table: string, where: Where, patch: Row): Promise<Row[]>
  remove(table: string, where: Where): Promise<void>
  /** Lien d'envoi direct (navigateur ou Mac -> stockage). */
  signedUpload(storagePath: string, origin: string): Promise<{ url: string; method: 'PUT' | 'POST'; headers?: Record<string, string>; form?: boolean }>
  signedDownload(storagePath: string, origin: string, expiresIn?: number): Promise<string | null>
  ready(): Promise<{ ok: boolean; reason?: string }>
}

const SERIAL = new Set(['studio_events', 'studio_commands'])
const match = (row: Row, where: Where) => Object.entries(where).every(([k, c]) => {
  const v = row[k]
  if (c === null) return v === null || v === undefined
  if (c && typeof c === 'object' && !Array.isArray(c)) {
    const o = c as { gt?: number | string; in?: unknown[]; not?: null }
    if ('gt' in o) return v !== null && v !== undefined && v > (o.gt as number)
    if ('in' in o) return (o.in as unknown[]).includes(v)
    if ('not' in o) return v !== null && v !== undefined
  }
  return v === c
})

/* ───────── Mode fichier (développement local) : tout dans .studio-data/ ───────── */
const ROOT = path.join(process.cwd(), '.studio-data')
let mem: Record<string, Row[]> | null = null
let seq: Record<string, number> = {}
let chain: Promise<unknown> = Promise.resolve()
async function load() {
  if (mem) return mem
  try { const j = JSON.parse(await fs.readFile(path.join(ROOT, 'store.json'), 'utf8')); mem = j.tables; seq = j.seq ?? {} } catch { mem = {}; seq = {} }
  return mem!
}
async function save() { await fs.mkdir(ROOT, { recursive: true }); await fs.writeFile(path.join(ROOT, 'store.json'), JSON.stringify({ tables: mem, seq })) }
const lock = <T>(f: () => Promise<T>): Promise<T> => { const r = chain.then(f, f); chain = r.catch(() => {}); return r }

const secret = () => process.env.STUDIO_FILE_SECRET ?? process.env.SUPABASE_SECRET_KEY ?? 'flow-studio-dev'
export const signPath = (p: string, exp: number) => createHmac('sha256', secret()).update(`${p}|${exp}`).digest('hex')
export const verifyPath = (p: string, exp: number, sig: string) => {
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const a = Buffer.from(signPath(p, exp)), b = Buffer.from(sig)
  return a.length === b.length && timingSafeEqual(a, b)
}
export const filePath = (p: string) => {
  const full = path.join(ROOT, 'files', p)
  if (!full.startsWith(path.join(ROOT, 'files') + path.sep)) throw new Error('bad path')
  return full
}

export const fileDb: Db = {
  kind: 'file',
  insert: (t, row) => lock(async () => {
    const m = await load(); const list = (m[t] ??= [])
    const r = { ...row }
    if (SERIAL.has(t)) { seq[t] = (seq[t] ?? 0) + 1; r.id = seq[t] } else r.id ??= randomUUID()
    list.push(r); await save(); return { ...r }
  }),
  select: async (t, where = {}, opts = {}) => {
    const m = await load()
    let rows = (m[t] ?? []).filter((r) => match(r, where)).map((r) => ({ ...r }))
    if (opts.order) { const [c, asc] = opts.order; rows.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1)) }
    if (opts.limit) rows = rows.slice(0, opts.limit)
    return rows
  },
  update: (t, where, patch) => lock(async () => {
    const m = await load(); const out: Row[] = []
    for (const r of m[t] ?? []) if (match(r, where)) { Object.assign(r, patch); out.push({ ...r }) }
    if (out.length) await save(); return out
  }),
  remove: (t, where) => lock(async () => { const m = await load(); m[t] = (m[t] ?? []).filter((r) => !match(r, where)); await save() }),
  signedUpload: async (p, origin) => { const exp = Date.now() + 3_600_000; return { url: `${origin}/api/studio/files?path=${encodeURIComponent(p)}&exp=${exp}&sig=${signPath(p, exp)}`, method: 'PUT' } },
  signedDownload: async (p, origin, ttl = 3600) => { const exp = Date.now() + ttl * 1000; return `${origin}/api/studio/files?path=${encodeURIComponent(p)}&exp=${exp}&sig=${signPath(p, exp)}` },
  ready: async () => ({ ok: true }),
}

/* ───────── Mode Supabase (production) ───────── */
const BUCKET = 'studio'
export const supabaseDb: Db = {
  kind: 'supabase',
  insert: async (t, row) => { const { data, error } = await getAdminDb().from(t).insert(row).select().single(); if (error) throw new Error(`${t}: ${error.message}`); return data as Row },
  select: async (t, where = {}, opts = {}) => {
    let q = getAdminDb().from(t).select('*')
    for (const [k, c] of Object.entries(where)) {
      if (c === null) q = q.is(k, null)
      else if (c && typeof c === 'object' && !Array.isArray(c)) {
        const o = c as { gt?: number | string; in?: unknown[]; not?: null }
        if ('gt' in o) q = q.gt(k, o.gt as number)
        else if ('in' in o) q = q.in(k, o.in as string[])
        else if ('not' in o) q = q.not(k, 'is', null)
      } else q = q.eq(k, c as string)
    }
    if (opts.order) q = q.order(opts.order[0], { ascending: opts.order[1] })
    if (opts.limit) q = q.limit(opts.limit)
    const { data, error } = await q
    if (error) throw new Error(`${t}: ${error.message}`)
    return (data ?? []) as Row[]
  },
  update: async (t, where, patch) => {
    let q = getAdminDb().from(t).update(patch)
    for (const [k, c] of Object.entries(where)) { if (c === null) q = q.is(k, null); else if (c && typeof c === 'object' && 'in' in (c as object)) q = q.in(k, (c as { in: string[] }).in); else q = q.eq(k, c as string) }
    const { data, error } = await q.select()
    if (error) throw new Error(`${t}: ${error.message}`)
    return (data ?? []) as Row[]
  },
  remove: async (t, where) => {
    let q = getAdminDb().from(t).delete()
    for (const [k, c] of Object.entries(where)) q = q.eq(k, c as string)
    const { error } = await q
    if (error) throw new Error(`${t}: ${error.message}`)
  },
  signedUpload: async (p) => {
    const { data, error } = await getAdminDb().storage.from(BUCKET).createSignedUploadUrl(p, { upsert: true })
    if (error || !data) throw new Error(`storage: ${error?.message}`)
    return { url: data.signedUrl, method: 'PUT', headers: { 'x-upsert': 'true' }, form: true } // Supabase attend un FormData (champ de fichier vide) comme uploadToSignedUrl
  },
  signedDownload: async (p, _o, ttl = 3600) => { const { data } = await getAdminDb().storage.from(BUCKET).createSignedUrl(p, ttl); return data?.signedUrl ?? null },
  ready: async () => {
    if (!process.env.SUPABASE_SECRET_KEY) return { ok: false, reason: 'no_service_key' }
    const { error } = await getAdminDb().from('studio_jobs').select('id').limit(1)
    return error ? { ok: false, reason: /studio_jobs|schema cache|does not exist/i.test(error.message) ? 'tables_missing' : error.message } : { ok: true }
  },
}

/** Le mode fichier (tests, développement) est refusé en production : impossible de l'activer par erreur sur le site en ligne. */
export const fileModeAllowed = () => process.env.STUDIO_STORE === 'file' && process.env.NODE_ENV !== 'production'
export const studioDb = (): Db => (fileModeAllowed() ? fileDb : supabaseDb)
