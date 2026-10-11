import { describe, expect, it } from 'vitest'
import { buildDescription, buildTags, isFeedback, parseDescription, sourceOf, typeOf } from '../src/lib/feedback'

describe('feedback encoding', () => {
  it('round-trips the structured fields', () => {
    const f = { screen: 'Révision', version: '2.0.3 (41)', device: 'iPhone 13, iOS 18', steps: '1. Ouvrir\n2. Taper sur Réviser' }
    expect(parseDescription(buildDescription(f))).toEqual(f)
  })
  it('keeps free text when no field is given', () => {
    expect(parseDescription('Juste un texte')).toEqual({ screen: '', version: '', device: '', steps: 'Juste un texte' })
    expect(parseDescription(null).steps).toBe('')
  })
  it('tags carry type and source and are recognised', () => {
    const tags = buildTags('idea', 'testflight', ['repeat:weekly', 'type:bug'])
    expect(tags).toEqual(['retour', 'type:idea', 'source:testflight', 'repeat:weekly'])
    expect(isFeedback(tags)).toBe(true); expect(typeOf(tags)).toBe('idea'); expect(sourceOf(tags)).toBe('testflight')
    expect(typeOf([])).toBe('bug'); expect(sourceOf(['source:zzz'])).toBeNull(); expect(isFeedback(['x'])).toBe(false)
  })
})
