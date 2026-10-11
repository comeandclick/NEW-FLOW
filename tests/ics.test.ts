import { describe, expect, it } from 'vitest'
import { eventsToIcs, parseIcs } from '../src/lib/ics'

describe('ics', () => {
  const evs = [
    { id: 'a', title: 'Point; hebdo, équipe', description: 'Ligne 1\nLigne 2', location: 'Salle 3', start: new Date(Date.UTC(2026, 9, 12, 8, 0)), end: new Date(Date.UTC(2026, 9, 12, 9, 30)), allDay: false },
    { id: 'b', title: 'Lancement', start: new Date(2026, 9, 15), end: new Date(2026, 9, 16), allDay: true },
  ]
  it('round-trips timed and all-day events', () => {
    const back = parseIcs(eventsToIcs(evs, 'Kalimat')).events
    expect(back).toHaveLength(2)
    expect(back[0]).toMatchObject({ title: 'Point; hebdo, équipe', description: 'Ligne 1\nLigne 2', location: 'Salle 3', allDay: false })
    expect(+back[0].start).toBe(+evs[0].start); expect(+back[0].end).toBe(+evs[0].end)
    expect(back[1].allDay).toBe(true); expect(back[1].start.getDate()).toBe(15); expect(back[1].end.getDate()).toBe(16)
  })
  it('folds long lines at 75 octets', () => {
    const long = eventsToIcs([{ title: 'é'.repeat(120), start: new Date(), end: new Date(), allDay: false }])
    expect(long.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true)
    expect(parseIcs(long).events[0].title).toBe('é'.repeat(120))
  })
  it('imports foreign files and counts recurring events', () => {
    const r = parseIcs('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Cours\r\nDTSTART;TZID=Europe/Paris:20261020T140000\r\nRRULE:FREQ=WEEKLY\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART:20261021\r\nEND:VEVENT\r\nEND:VCALENDAR')
    expect(r.events).toHaveLength(1); expect(r.recurring).toBe(1); expect(r.events[0].start.getHours()).toBe(14)
  })
})
