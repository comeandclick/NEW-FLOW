/** Rappels : quand prévenir (5 min avant, à l'heure) et le rappel quotidien des agents à 9 h 30. Fonctions pures, testées. */

export type Moment = 'avant' | 'heure'

/** Écart (ms) entre le début et maintenant -> quel rappel envoyer. Tolère une minute de retard du minuteur. */
export function momentOf(startMs: number, nowMs: number): Moment | null {
  const d = startMs - nowMs
  if (d > 3.5 * 60e3 && d <= 6 * 60e3) return 'avant'
  if (d > -2 * 60e3 && d <= 60e3) return 'heure'
  return null
}

export function reminderTitle(m: Moment, title: string): string {
  return (m === 'avant' ? `Dans 5 min : ${title}` : `C'est l'heure : ${title}`).slice(0, 160)
}

/** Heure et date à Paris (« 09:30 », « 2026-10-14 »). */
export function parisClock(now: Date): { hm: string; day: string } {
  const f = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]))
  return { hm: `${p.hour}:${p.minute}`, day: `${p.year}-${p.month}-${p.day}` }
}

/** Le rappel « lancer la session de travail des agents » part entre 9 h 30 et 9 h 39 (heure de Paris), une fois par jour. */
export const agentsTime = (hm: string) => hm >= '09:30' && hm < '09:40'
