import { common } from './common'
import { landing } from './landing'
import { auth } from './auth'
import { app } from './app'
import { tasks } from './tasks'
import { notes } from './notes'
import { calendar } from './calendar'
import { messages } from './messages'
import { meetings } from './meetings'
import { files } from './files'
import { misc } from './misc'
import { settings } from './settings'
import type { Locale } from '../config'

const parts = [common, landing, auth, app, tasks, notes, calendar, messages, meetings, files, misc, settings] as const

type Merge<T extends readonly { fr: object }[]> = T extends readonly [infer H extends { fr: object }, ...infer R extends readonly { fr: object }[]]
  ? H['fr'] & Merge<R>
  : unknown

export type Dict = Record<keyof Merge<typeof parts>, string>
export type Key = keyof Dict

function merge(locale: Locale): Dict {
  const out: Record<string, string> = {}
  for (const p of parts) Object.assign(out, p[locale])
  return out as Dict
}

export const dictionaries: Record<Locale, Dict> = { fr: merge('fr'), en: merge('en') }
export const rawParts = parts
