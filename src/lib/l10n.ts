/**
 * Translation sets for apps (e.g. Kalimat FR/EN/AR). One JSON document per set, stored as a normal file in the workspace.
 * Everything here is pure so it can be tested and reused by the API later.
 */
export type Entry = { v: Record<string, string>; note?: string; max?: number; u?: string }
export type L10nDoc = { version: 1; source: string; locales: string[]; keys: Record<string, Entry> }
export type Flat = Record<string, string>

export const RTL = new Set(['ar', 'he', 'fa', 'ur'])
export const isRtl = (locale: string) => RTL.has(locale.toLowerCase().split(/[-_]/)[0])
export const LOCALE_RE = /^[a-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/

export function emptyDoc(source: string, locales: string[]): L10nDoc {
  const list = Array.from(new Set([source, ...locales]))
  return { version: 1, source, locales: list, keys: {} }
}

export function parseDoc(text: string): L10nDoc | null {
  try {
    const d = JSON.parse(text)
    if (d?.version !== 1 || typeof d.source !== 'string' || !Array.isArray(d.locales) || typeof d.keys !== 'object' || !d.keys) return null
    return d as L10nDoc
  } catch { return null }
}

/** Nested JSON → dotted keys. Non-string leaves are ignored. */
export function flatten(obj: unknown, prefix = ''): Flat {
  const out: Flat = {}
  if (!obj || typeof obj !== 'object') return out
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k.startsWith('@')) continue // ARB metadata
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out[key] = v
    else if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key))
  }
  return out
}

/** Accepts flat JSON, nested JSON, ARB (with @@locale) or a CSV `key,value` file. */
export function parseImport(text: string, filename = ''): { locale?: string; flat: Flat } | null {
  const t = text.trim()
  if (!t) return null
  if (t.startsWith('{')) {
    try {
      const obj = JSON.parse(t) as Record<string, unknown>
      const locale = typeof obj['@@locale'] === 'string' ? (obj['@@locale'] as string) : undefined
      const { '@@locale': _l, ...rest } = obj
      void _l
      return { locale: locale ?? guessLocale(filename), flat: flatten(rest) }
    } catch { return null }
  }
  if (/\.csv$/i.test(filename) || t.includes(',')) {
    const flat: Flat = {}
    for (const row of parseCsv(t)) if (row.length >= 2 && row[0] && row[0].toLowerCase() !== 'key') flat[row[0]] = row[1]
    return Object.keys(flat).length ? { locale: guessLocale(filename), flat } : null
  }
  return null
}

function guessLocale(filename: string): string | undefined {
  const m = filename.match(/(?:^|[._-])([a-z]{2,3}(?:[-_][A-Za-z]{2,4})?)\.(?:json|arb|csv)$/i)
  return m && LOCALE_RE.test(m[1]) ? m[1] : undefined
}

export { parseCsv } from './csv'
import { parseCsv, csvCell } from './csv'


export function importFlat(doc: L10nDoc, locale: string, flat: Flat, now = new Date().toISOString()): { doc: L10nDoc; added: number; updated: number; unchanged: number } {
  const keys = { ...doc.keys }
  let added = 0, updated = 0, unchanged = 0
  for (const [k, val] of Object.entries(flat)) {
    const prev = keys[k]
    if (!prev) { keys[k] = { v: { [locale]: val }, u: now }; added++ }
    else if ((prev.v[locale] ?? '') !== val) { keys[k] = { ...prev, v: { ...prev.v, [locale]: val }, u: now }; updated++ }
    else unchanged++
  }
  const locales = doc.locales.includes(locale) ? doc.locales : [...doc.locales, locale]
  return { doc: { ...doc, locales, keys }, added, updated, unchanged }
}

export function exportFlat(doc: L10nDoc, locale: string, opts: { translatedOnly?: boolean; fallbackToSource?: boolean } = {}): Flat {
  const out: Flat = {}
  for (const k of Object.keys(doc.keys).sort()) {
    const v = doc.keys[k].v[locale]
    if (v) out[k] = v
    else if (opts.fallbackToSource && doc.keys[k].v[doc.source]) out[k] = doc.keys[k].v[doc.source]
    else if (!opts.translatedOnly) out[k] = ''
  }
  return out
}

export function exportARB(doc: L10nDoc, locale: string): string {
  const out: Record<string, unknown> = { '@@locale': locale }
  for (const k of Object.keys(doc.keys).sort()) {
    const e = doc.keys[k]
    if (!e.v[locale]) continue
    out[k] = e.v[locale]
    if (e.note) out[`@${k}`] = { description: e.note }
  }
  return JSON.stringify(out, null, 2)
}

export function exportCSV(doc: L10nDoc): string {
  const head = ['key', ...doc.locales, 'note']
  const rows = Object.keys(doc.keys).sort().map((k) => [k, ...doc.locales.map((l) => doc.keys[k].v[l] ?? ''), doc.keys[k].note ?? ''])
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
}

export function coverage(doc: L10nDoc) {
  const total = Object.keys(doc.keys).length
  return Object.fromEntries(doc.locales.map((l) => {
    const done = Object.values(doc.keys).filter((e) => (e.v[l] ?? '').trim() !== '').length
    return [l, { done, total, missing: total - done, pct: total ? Math.round((done / total) * 100) : 0 }]
  })) as Record<string, { done: number; total: number; missing: number; pct: number }>
}

/** `{name}`, `{{name}}`, `%s`, `%d`, `%1$s`, `${name}` — placeholders that must survive translation. */
export function placeholders(text: string): string[] {
  return Array.from(text.matchAll(/\{\{?\s*[\w.]+\s*\}?\}|%(?:\d+\$)?[sdif@]|\$\{[\w.]+\}/g), (m) => m[0].replace(/\s+/g, '')).sort()
}

export type Issue = 'missing' | 'tooLong' | 'placeholders'
export function issues(doc: L10nDoc, key: string, locale: string): Issue[] {
  const e = doc.keys[key]
  if (!e) return []
  const val = (e.v[locale] ?? '').trim()
  if (!val) return ['missing']
  const out: Issue[] = []
  if (e.max && val.length > e.max) out.push('tooLong')
  const src = e.v[doc.source]
  if (src && locale !== doc.source && placeholders(src).join('|') !== placeholders(val).join('|')) out.push('placeholders')
  return out
}

/** Entry-wise merge by last-update time, so two people editing different keys never overwrite each other. */
export function mergeDocs(local: L10nDoc, remote: L10nDoc): L10nDoc {
  const keys: Record<string, Entry> = { ...remote.keys }
  for (const [k, e] of Object.entries(local.keys)) {
    const r = keys[k]
    if (!r || (e.u ?? '') >= (r.u ?? '')) keys[k] = e
  }
  return { ...local, locales: Array.from(new Set([...local.locales, ...remote.locales])), keys }
}
