/** iCalendar (.ics) export and import: works with Apple Calendar, Google Calendar and Outlook. */
export type IcsEvent = { id?: string; title: string; description?: string | null; location?: string | null; start: Date; end: Date; allDay: boolean }

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1')
const pad = (n: number) => String(n).padStart(2, '0')
const utc = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
const day = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`

/** RFC 5545: lines are folded at 75 octets; continuation lines start with a space. */
function fold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = '' }
    cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

export function eventsToIcs(events: IcsEvent[], calName = 'Flow', now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Flow//Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(calName)}`]
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id ?? crypto.randomUUID()}@flow`, `DTSTAMP:${utc(now)}`)
    if (e.allDay) { const end = new Date(e.end); end.setDate(end.getDate() + 1); lines.push(`DTSTART;VALUE=DATE:${day(e.start)}`, `DTEND;VALUE=DATE:${day(end)}`) }
    else lines.push(`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`)
    lines.push(`SUMMARY:${esc(e.title)}`)
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`)
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

function parseWhen(value: string, params: string): { d: Date; allDay: boolean } | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/)
  if (!m) return null
  const [, y, mo, da, h, mi, se, z] = m
  if (!h) return { d: new Date(Number(y), Number(mo) - 1, Number(da)), allDay: true }
  void params
  const d = z ? new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(se ?? 0))) : new Date(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(se ?? 0))
  return { d, allDay: false }
}

/** Reads VEVENTs. Recurring events are imported once (first occurrence) and counted in `recurring`. */
export function parseIcs(text: string): { events: IcsEvent[]; recurring: number } {
  const unfolded = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const events: IcsEvent[] = []
  let cur: Record<string, { v: string; p: string }> | null = null
  let recurring = 0
  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue }
    if (line === 'END:VEVENT') {
      if (cur?.SUMMARY && cur.DTSTART) {
        const s = parseWhen(cur.DTSTART.v, cur.DTSTART.p)
        let e = cur.DTEND ? parseWhen(cur.DTEND.v, cur.DTEND.p) : null
        if (s) {
          let end = e?.d ?? new Date(+s.d + (s.allDay ? 0 : 3600_000))
          if (s.allDay && e?.allDay) { end = new Date(e.d); end.setDate(end.getDate() - 1) } // ICS all-day ends are exclusive
          if (end < s.d) end = s.d
          events.push({ title: unesc(cur.SUMMARY.v).slice(0, 200), description: cur.DESCRIPTION ? unesc(cur.DESCRIPTION.v).slice(0, 4000) : null, location: cur.LOCATION ? unesc(cur.LOCATION.v).slice(0, 300) : null, start: s.d, end, allDay: s.allDay })
          if (cur.RRULE) recurring++
        }
        e = null
      }
      cur = null; continue
    }
    if (!cur) continue
    const i = line.indexOf(':')
    if (i < 1) continue
    const [name, ...params] = line.slice(0, i).split(';')
    cur[name.toUpperCase()] = { v: line.slice(i + 1), p: params.join(';') }
  }
  return { events, recurring }
}
