import { describe, expect, it } from 'vitest'
import { PERSO_LIMITS, persoEventsOn, readPerso } from '@/lib/perso'

describe('readPerso', () => {
  it('returns empty lists for missing or malformed data', () => {
    expect(readPerso(undefined)).toEqual({ notes: [], events: [] })
    expect(readPerso({ perso: 'x' })).toEqual({ notes: [], events: [] })
    expect(readPerso({ perso: { notes: 4, events: {} } })).toEqual({ notes: [], events: [] })
  })
  it('drops invalid rows and trims long text', () => {
    const p = readPerso({ perso: {
      notes: [{ id: 'a', title: 'x'.repeat(999), body: 'b', pinned: true, updated_at: '2026-01-01T00:00:00Z' }, { title: 'no id' }, null],
      events: [{ id: 'e', title: 'T', start: '2026-02-01T10:00:00Z', end: '2026-02-01T09:00:00Z' }, { id: 'bad', start: 'nope', end: 'nope' }],
    } })
    expect(p.notes).toHaveLength(1)
    expect(p.notes[0].title).toHaveLength(PERSO_LIMITS.title)
    expect(p.events).toHaveLength(1)
    expect(p.events[0].end).toBe(p.events[0].start)
  })
})

describe('persoEventsOn', () => {
  it('finds events overlapping a day, sorted', () => {
    const day = new Date(2026, 4, 10, 12)
    const ev = (id: string, s: Date, e: Date) => ({ id, title: id, start: s.toISOString(), end: e.toISOString(), all_day: false, location: '' })
    const list = [ev('late', new Date(2026, 4, 10, 18), new Date(2026, 4, 10, 19)), ev('early', new Date(2026, 4, 10, 8), new Date(2026, 4, 10, 9)), ev('other', new Date(2026, 4, 11, 8), new Date(2026, 4, 11, 9)), ev('span', new Date(2026, 4, 9, 20), new Date(2026, 4, 10, 2))]
    expect(persoEventsOn(list, day).map((e) => e.id)).toEqual(['span', 'early', 'late'])
  })
})
