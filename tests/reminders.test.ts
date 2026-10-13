import { describe, expect, it } from 'vitest'
import { agentsTime, momentOf, parisClock, reminderTitle } from '@/lib/reminders'

describe('rappels', () => {
  const t0 = Date.parse('2026-10-14T12:00:00Z')
  it('5 min avant (le minuteur passe chaque minute : fenêtre de 4 à 6 min)', () => {
    expect(momentOf(t0 + 5 * 60e3, t0)).toBe('avant')
    expect(momentOf(t0 + 4 * 60e3, t0)).toBe('avant')
    expect(momentOf(t0 + 3 * 60e3, t0)).toBeNull()
    expect(momentOf(t0 + 7 * 60e3, t0)).toBeNull()
  })
  it('à l’heure, avec une minute de tolérance', () => {
    expect(momentOf(t0, t0)).toBe('heure')
    expect(momentOf(t0 + 30e3, t0)).toBe('heure')
    expect(momentOf(t0 - 90e3, t0)).toBe('heure')
    expect(momentOf(t0 - 3 * 60e3, t0)).toBeNull()
  })
  it('titres', () => {
    expect(reminderTitle('avant', 'Tester le duel')).toBe('Dans 5 min : Tester le duel')
    expect(reminderTitle('heure', 'Tester le duel')).toBe("C'est l'heure : Tester le duel")
  })
  it('heure de Paris (heure d’été puis d’hiver)', () => {
    expect(parisClock(new Date('2026-10-14T07:30:00Z'))).toEqual({ hm: '09:30', day: '2026-10-14' })
    expect(parisClock(new Date('2026-10-26T08:30:00Z'))).toEqual({ hm: '09:30', day: '2026-10-26' })
  })
  it('exception du 14/10 : rappel des agents à 12 h 30 seulement', () => {
    expect(agentsTime('09:30', '2026-10-14')).toBe(false); expect(agentsTime('12:30', '2026-10-14')).toBe(true); expect(agentsTime('12:39', '2026-10-14')).toBe(true)
    expect(agentsTime('09:30', '2026-10-15')).toBe(true); expect(agentsTime('12:30', '2026-10-15')).toBe(false)
  })
  it('rappel des agents entre 9 h 30 et 9 h 39', () => {
    expect(agentsTime('09:30')).toBe(true); expect(agentsTime('09:39')).toBe(true)
    expect(agentsTime('09:29')).toBe(false); expect(agentsTime('09:40')).toBe(false)
  })
})
