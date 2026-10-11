import { describe, expect, it } from 'vitest'
import { coverage, emptyDoc, exportARB, exportCSV, exportFlat, flatten, importFlat, isRtl, issues, mergeDocs, parseCsv, parseDoc, parseImport, placeholders } from '../src/lib/l10n'

describe('l10n', () => {
  const base = importFlat(importFlat(emptyDoc('fr', ['fr', 'en', 'ar']), 'fr', { 'home.title': 'Bonjour {name}', 'home.cta': 'Commencer', 'exit': '' }).doc, 'en', { 'home.title': 'Hello {name}', 'home.cta': 'Start now please' }).doc

  it('imports flat, nested and ARB files', () => {
    expect(flatten({ a: { b: 'x', c: { d: 'y' } }, e: 1, '@e': {} })).toEqual({ 'a.b': 'x', 'a.c.d': 'y' })
    expect(parseImport('{"@@locale":"ar","home.cta":"ابدأ","@home.cta":{"description":"x"}}', 'app_ar.arb')).toEqual({ locale: 'ar', flat: { 'home.cta': 'ابدأ' } })
    expect(parseImport('{"a":"b"}', 'strings.fr.json')?.locale).toBe('fr')
    expect(parseImport('key,value\nhello,"Salut, toi"\n', 'x.csv')?.flat).toEqual({ hello: 'Salut, toi' })
    expect(parseImport('not a file', 'x.txt')).toBeNull()
  })
  it('counts added / updated keys', () => {
    const r = importFlat(base, 'en', { 'home.cta': 'Start', 'new.key': 'N' }, '2026-01-01')
    expect([r.added, r.updated, r.unchanged]).toEqual([1, 1, 0]); expect(r.doc.keys['home.cta'].v.en).toBe('Start')
  })
  it('exports per locale, as ARB and CSV', () => {
    expect(exportFlat(base, 'en', { translatedOnly: true })).toEqual({ 'home.cta': 'Start now please', 'home.title': 'Hello {name}' })
    expect(exportFlat(base, 'ar', { fallbackToSource: true })['home.cta']).toBe('Commencer')
    expect(JSON.parse(exportARB(base, 'en'))['@@locale']).toBe('en')
    expect(parseCsv(exportCSV(base))[0]).toEqual(['key', 'fr', 'en', 'ar', 'note'])
  })
  it('reports coverage and issues', () => {
    expect(coverage(base).en).toMatchObject({ done: 2, total: 3, missing: 1, pct: 67 })
    const d = { ...base, keys: { ...base.keys, 'home.cta': { ...base.keys['home.cta'], max: 8 } } }
    expect(issues(d, 'home.cta', 'en')).toEqual(['tooLong']); expect(issues(d, 'home.title', 'ar')).toEqual(['missing'])
    const bad = importFlat(d, 'en', { 'home.title': 'Hello' }).doc
    expect(issues(bad, 'home.title', 'en')).toEqual(['placeholders'])
    expect(placeholders('Hi {{name}}, %1$s and ${x} %d')).toEqual(['${x}', '%1$s', '%d', '{{name}}'])
  })
  it('merges by key and round-trips', () => {
    const a = importFlat(base, 'en', { 'home.cta': 'A' }, '2026-02-01').doc
    const b = importFlat(base, 'en', { 'home.cta': 'B', other: 'O' }, '2026-03-01').doc
    const m = mergeDocs(a, b)
    expect(m.keys['home.cta'].v.en).toBe('B'); expect(m.keys.other.v.en).toBe('O')
    expect(parseDoc(JSON.stringify(m))).toEqual(m); expect(parseDoc('{"x":1}')).toBeNull()
    expect(isRtl('ar')).toBe(true); expect(isRtl('fr-CA')).toBe(false)
  })
})
