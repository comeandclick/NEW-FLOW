import { describe, expect, it } from 'vitest'
import { dictionaries, rawParts } from '@/i18n/dict'

describe('i18n dictionaries', () => {
  it('have identical key sets for fr and en', () => {
    const fr = Object.keys(dictionaries.fr).sort()
    const en = Object.keys(dictionaries.en).sort()
    expect(en).toEqual(fr)
  })

  it('never contain empty strings', () => {
    for (const locale of ['fr', 'en'] as const) {
      for (const [k, v] of Object.entries(dictionaries[locale])) expect(v.trim(), `${locale}:${k}`).not.toBe('')
    }
  })

  it('keep the same {placeholders} in both languages', () => {
    const vars = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',')
    for (const k of Object.keys(dictionaries.fr) as (keyof typeof dictionaries.fr)[]) {
      expect(vars(dictionaries.en[k]), k).toBe(vars(dictionaries.fr[k]))
    }
  })

  it('has no key defined twice across parts', () => {
    const seen = new Set<string>()
    for (const p of rawParts) for (const k of Object.keys(p.fr)) { expect(seen.has(k), k).toBe(false); seen.add(k) }
  })
})
