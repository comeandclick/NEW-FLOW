/** User preferences stored in profiles.preferences (jsonb). Pure functions: usable on the client and on the server. */
export const ACCENTS = ['indigo', 'blue', 'violet', 'emerald', 'rose', 'amber'] as const
export type Accent = (typeof ACCENTS)[number]
export const NOTIF_CATEGORIES = ['messages', 'mentions', 'tasks', 'events', 'calls', 'alerts'] as const
export type NotifCategory = (typeof NOTIF_CATEGORIES)[number]

export type Prefs = {
  accent: Accent
  density: 'comfortable' | 'compact'
  reduceMotion: boolean
  weekStart: 0 | 1
  notif: Record<NotifCategory, boolean> & { system: boolean; sound: boolean; quiet: { on: boolean; from: string; to: string } }
}

export const DEFAULT_PREFS: Prefs = {
  accent: 'indigo', density: 'comfortable', reduceMotion: false, weekStart: 1,
  notif: { messages: true, mentions: true, tasks: true, events: true, calls: true, alerts: true, system: true, sound: true, quiet: { on: false, from: '22:00', to: '08:00' } },
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export function mergePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Prefs> & { notif?: Partial<Prefs['notif']> }
  const n: Partial<Omit<Prefs['notif'], 'quiet'>> & { quiet?: Partial<Prefs['notif']['quiet']> } = r.notif ?? {}
  const d = DEFAULT_PREFS.notif
  const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb)
  return {
    accent: (ACCENTS as readonly string[]).includes(r.accent as string) ? (r.accent as Accent) : DEFAULT_PREFS.accent,
    density: r.density === 'compact' ? 'compact' : 'comfortable',
    reduceMotion: bool(r.reduceMotion, false),
    weekStart: r.weekStart === 0 ? 0 : 1,
    notif: {
      messages: bool(n.messages, d.messages), mentions: bool(n.mentions, d.mentions), tasks: bool(n.tasks, d.tasks), events: bool(n.events, d.events), calls: bool(n.calls, d.calls), alerts: bool(n.alerts, d.alerts),
      system: bool(n.system, d.system), sound: bool(n.sound, d.sound),
      quiet: {
        on: bool(n.quiet?.on, false),
        from: HHMM.test(n.quiet?.from ?? '') ? n.quiet!.from! : d.quiet.from,
        to: HHMM.test(n.quiet?.to ?? '') ? n.quiet!.to! : d.quiet.to,
      },
    },
  }
}

/** Notification `type` (as stored in the notifications table) → preference category. */
export function categoryOf(type: string): NotifCategory {
  if (type === 'message' || type === 'dm') return 'messages'
  if (type === 'mention') return 'mentions'
  if (type === 'task' || type === 'task_assigned' || type === 'assigned') return 'tasks'
  if (type === 'event' || type === 'meeting') return 'events'
  if (type === 'call') return 'calls'
  return 'alerts'
}

export function inQuietHours(q: Prefs['notif']['quiet'], minutesNow: number): boolean {
  if (!q.on) return false
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))
  const from = m(q.from), to = m(q.to)
  if (from === to) return false
  return from < to ? minutesNow >= from && minutesNow < to : minutesNow >= from || minutesNow < to
}

/** Minutes since midnight in the given IANA time zone. */
export function minutesIn(timeZone: string, now = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24
    return h * 60 + Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  } catch { return now.getUTCHours() * 60 + now.getUTCMinutes() }
}

/** Should a notification of this type reach the user right now (push / sound / system banner)? */
export function shouldAlert(p: Prefs, type: string, timeZone: string, now = new Date()): boolean {
  if (!p.notif[categoryOf(type)]) return false
  return !inQuietHours(p.notif.quiet, minutesIn(timeZone, now))
}
