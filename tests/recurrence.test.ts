import { describe, expect, it } from 'vitest'
import { nextDueFor, nextOccurrence, repeatOf, withRepeat } from '../src/lib/recurrence'

describe('recurrence', () => {
  it('reads and writes the tag', () => {
    expect(repeatOf(['a', 'repeat:weekly'])).toBe('weekly'); expect(repeatOf(['repeat:nope'])).toBeNull()
    expect(withRepeat(['a', 'repeat:daily'], 'monthly')).toEqual(['a', 'repeat:monthly']); expect(withRepeat(['a', 'repeat:daily'], null)).toEqual(['a'])
  })
  it('moves by the rule', () => {
    expect(nextOccurrence(new Date(2026, 0, 5, 18), 'daily')).toEqual(new Date(2026, 0, 6, 18))
    expect(nextOccurrence(new Date(2026, 0, 5, 18), 'biweekly')).toEqual(new Date(2026, 0, 19, 18))
    expect(nextOccurrence(new Date(2026, 9, 9, 9), 'weekdays')).toEqual(new Date(2026, 9, 12, 9)) // Friday → Monday
  })
  it('clamps month ends', () => {
    expect(nextOccurrence(new Date(2026, 0, 31, 8), 'monthly')).toEqual(new Date(2026, 1, 28, 8))
    expect(nextOccurrence(new Date(2028, 0, 31, 8), 'monthly')).toEqual(new Date(2028, 1, 29, 8))
    expect(nextOccurrence(new Date(2026, 11, 15, 8), 'monthly')).toEqual(new Date(2027, 0, 15, 8))
  })
  it('never schedules in the past', () => {
    const now = new Date(2026, 5, 10, 12)
    const due = nextDueFor({ due_date: new Date(2026, 0, 1, 18).toISOString(), tags: ['repeat:weekly'] }, now)!
    expect(new Date(due).getTime()).toBeGreaterThan(now.getTime()); expect(new Date(due).getDay()).toBe(new Date(2026, 0, 1).getDay())
    expect(nextDueFor({ due_date: null, tags: [] }, now)).toBeNull()
  })
})
