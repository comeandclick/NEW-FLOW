import { describe, expect, it } from 'vitest'
import { colorFor, formatBytes, formatDuration, initials, slugify } from '@/lib/utils'
import { actionKey } from '@/lib/activity'

describe('utils', () => {
  it('slugify strips accents and symbols', () => { expect(slugify('Équipe Marketing & Co!')).toBe('equipe-marketing-co') })
  it('initials', () => { expect(initials('Léa Martin')).toBe('LM'); expect(initials(null)).toBe('?') })
  it('formatBytes', () => { expect(formatBytes(0)).toBe('0 B'); expect(formatBytes(1536)).toBe('1.5 KB') })
  it('formatDuration', () => { expect(formatDuration(65)).toBe('1:05'); expect(formatDuration(3725)).toBe('1:02:05') })
  it('colorFor is stable', () => { expect(colorFor('abc')).toBe(colorFor('abc')) })
  it('actionKey falls back for unknown actions', () => { expect(actionKey('task.created')).toBe('act.task.created'); expect(actionKey('weird.thing')).toBe('act.other') })
})
