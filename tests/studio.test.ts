import { describe, expect, it } from 'vitest'
import { QUALITIES, RATIOS, dimensions } from '@/lib/studio/types'
import { buildMotionPrompt, buildSitePrompt, questionsFor, understandingOf } from '@/lib/studio/prompts'
import { studioCopy } from '@/lib/studio/copy'

describe('studio : dimensions', () => {
  it('donne les définitions standard', () => {
    expect(dimensions('16:9', '4k')).toEqual({ w: 3840, h: 2160 })
    expect(dimensions('16:9', 'fhd')).toEqual({ w: 1920, h: 1080 })
    expect(dimensions('9:16', 'fhd')).toEqual({ w: 1080, h: 1920 })
    expect(dimensions('1:1', '4k')).toEqual({ w: 2160, h: 2160 })
    expect(dimensions('4:5', 'fhd')).toEqual({ w: 1080, h: 1350 })
  })
  it('ne produit que des dimensions paires', () => {
    for (const r of RATIOS) for (const q of QUALITIES) { const d = dimensions(r.id, q.id); expect(d.w % 2).toBe(0); expect(d.h % 2).toBe(0) }
  })
})

describe('studio : prompts', () => {
  const base = { title: 'Pub', brief: 'Refaire cette vidéo', ratio: '16:9' as const, quality: '4k' as const, fps: 60 as const, durationSec: 2.6, audio: 'sfx' as const, brand: 'Kalimat', refs: [{ id: '1', kind: 'video' as const, name: 'ref.mp4' }], verify: true }
  it('le prompt motion contient les specs exactes et les règles d\'autonomie', () => {
    const p = buildMotionPrompt(base, 'abc')
    expect(p).toContain('3840 × 2160')
    expect(p).toContain('156 images')
    expect(p).toContain('studio/abc/entrees/ref.mp4')
    expect(p).toMatch(/ne pose JAMAIS de question/i)
    expect(p).toContain('motion-reference-clone')
  })
  it('le prompt site injecte les réponses et reste autonome', () => {
    const p = buildSitePrompt({ title: 'Bougies', siteKind: 'shop', brief: 'Boutique', refs: [], withFigma: true, withSupabase: true, withMotion: false, motionBrief: '', languages: '', domain: '', qa: [{ q: 'But ?', a: 'Acheter' }] })
    expect(p).toContain('→ Acheter')
    expect(p).toMatch(/Ne demande jamais rien/)
    expect(p).toContain('Vercel')
  })
})

describe('studio : session de questions', () => {
  it('atteint 100 % quand tout est répondu et reste monotone', () => {
    for (const kind of ['showcase', 'shop', 'landing', 'other'] as const) {
      const qs = questionsFor(kind)
      expect(qs.length).toBeGreaterThan(6)
      let last = 0
      const got: string[] = []
      for (const q of qs) { got.push(q.id); const u = understandingOf(kind, got); expect(u).toBeGreaterThanOrEqual(last); last = u }
      expect(last).toBe(100)
    }
  })
  it('une boutique pose des questions de paiement, pas une landing', () => {
    expect(questionsFor('shop').some((q) => q.id === 'payment')).toBe(true)
    expect(questionsFor('landing').some((q) => q.id === 'payment')).toBe(false)
  })
})

describe('studio : textes', () => {
  it('fr et en ont les mêmes clés', () => {
    const keys = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]))
    expect(keys(studioCopy('en')).sort()).toEqual(keys(studioCopy('fr')).sort())
  })
})
