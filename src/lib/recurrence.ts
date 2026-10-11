import type { Task } from '@/lib/types'

/** A repeating task carries a `repeat:<rule>` tag. When it is completed, the next occurrence is created. */
export const REPEAT_RULES = ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly'] as const
export type RepeatRule = (typeof REPEAT_RULES)[number]
const TAG = 'repeat:'

export function repeatOf(tags: readonly string[] | null | undefined): RepeatRule | null {
  const t = (tags ?? []).find((x) => x.startsWith(TAG))?.slice(TAG.length)
  return (REPEAT_RULES as readonly string[]).includes(t ?? '') ? (t as RepeatRule) : null
}

export function withRepeat(tags: readonly string[], rule: RepeatRule | null): string[] {
  const rest = tags.filter((x) => !x.startsWith(TAG))
  return rule ? [...rest, TAG + rule] : rest
}

/** Next occurrence strictly after `from`, keeping the time of day. Month ends are clamped (31 Jan → 28/29 Feb). */
export function nextOccurrence(from: Date, rule: RepeatRule): Date {
  const d = new Date(from)
  if (rule === 'daily') d.setDate(d.getDate() + 1)
  else if (rule === 'weekly') d.setDate(d.getDate() + 7)
  else if (rule === 'biweekly') d.setDate(d.getDate() + 14)
  else if (rule === 'weekdays') { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6) }
  else {
    const day = from.getDate()
    d.setDate(1); d.setMonth(d.getMonth() + 1)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(day, last))
  }
  return d
}

/** Due date of the next occurrence: based on the previous due date, but never in the past. */
export function nextDueFor(task: Pick<Task, 'due_date' | 'tags'>, now = new Date()): string | null {
  const rule = repeatOf(task.tags)
  if (!rule) return null
  let d = nextOccurrence(task.due_date ? new Date(task.due_date) : now, rule)
  for (let i = 0; i < 400 && d.getTime() <= now.getTime(); i++) d = nextOccurrence(d, rule)
  return d.toISOString()
}
