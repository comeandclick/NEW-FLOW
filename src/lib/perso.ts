/** Personal area: notes and events that belong to the user, not to a workspace. Stored in profiles.preferences.perso. */
export type PersoNote = { id: string; title: string; body: string; pinned: boolean; updated_at: string }
export type PersoEvent = { id: string; title: string; start: string; end: string; all_day: boolean; location: string }
export type Perso = { notes: PersoNote[]; events: PersoEvent[] }

export const PERSO_COLOR = '#64748b'
export const PERSO_LIMITS = { notes: 300, events: 1500, body: 30_000, title: 200 }

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')
const iso = (v: unknown) => { const d = typeof v === 'string' ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null }

/** Reads the stored value defensively: anything malformed is dropped rather than crashing the app. */
export function readPerso(prefs: unknown): Perso {
  const raw = (prefs as { perso?: { notes?: unknown; events?: unknown } } | null | undefined)?.perso
  const notes: PersoNote[] = []
  for (const n of Array.isArray(raw?.notes) ? raw.notes : []) {
    const o = n as Record<string, unknown>
    if (typeof o?.id !== 'string') continue
    notes.push({ id: o.id, title: str(o.title, PERSO_LIMITS.title), body: str(o.body, PERSO_LIMITS.body), pinned: o.pinned === true, updated_at: iso(o.updated_at) ?? new Date(0).toISOString() })
  }
  const events: PersoEvent[] = []
  for (const e of Array.isArray(raw?.events) ? raw.events : []) {
    const o = e as Record<string, unknown>
    const start = iso(o?.start), end = iso(o?.end)
    if (typeof o?.id !== 'string' || !start || !end) continue
    events.push({ id: o.id, title: str(o.title, PERSO_LIMITS.title), start, end: end < start ? start : end, all_day: o.all_day === true, location: str(o.location, 200) })
  }
  return { notes: notes.slice(0, PERSO_LIMITS.notes), events: events.slice(0, PERSO_LIMITS.events) }
}

export const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`)

/** Events that touch a given local day. */
export function persoEventsOn(events: PersoEvent[], day: Date): PersoEvent[] {
  const from = new Date(day); from.setHours(0, 0, 0, 0)
  const to = new Date(from); to.setDate(to.getDate() + 1)
  return events.filter((e) => new Date(e.start) < to && new Date(e.end) >= from).sort((a, b) => a.start.localeCompare(b.start))
}
