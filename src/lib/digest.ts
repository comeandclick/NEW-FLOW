/** Plain-text "daily update": what was finished yesterday, what is planned today, what is late. No guessing, just the tasks. */
export type DTask = { title: string; status: string; assignee_id: string | null; due_date: string | null; completed_at: string | null }

const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

export function buildDigest(tasks: DTask[], userId: string, name: string, lang: 'fr' | 'en', now = new Date()): string {
  const today = sod(now), yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const mine = tasks.filter((x) => x.assignee_id === userId)
  const doneRecent = mine.filter((x) => x.status === 'done' && x.completed_at && new Date(x.completed_at) >= yesterday)
  const open = mine.filter((x) => !['done', 'cancelled'].includes(x.status))
  const planned = open.filter((x) => x.status === 'in_progress' || (x.due_date && sod(new Date(x.due_date)).getTime() === today.getTime()))
  const late = open.filter((x) => x.due_date && sod(new Date(x.due_date)) < today)
  const L = lang === 'fr'
    ? { head: `Point du jour — ${name}`, done: 'Terminé hier et aujourd’hui', plan: 'Au programme', late: 'En retard', none: 'rien' }
    : { head: `Daily update — ${name}`, done: 'Finished since yesterday', plan: 'Today', late: 'Overdue', none: 'nothing' }
  const list = (xs: DTask[]) => (xs.length ? xs.slice(0, 8).map((x) => `- ${x.title}`).join('\n') : `- ${L.none}`)
  return [L.head, '', `${L.done} :`, list(doneRecent), '', `${L.plan} :`, list(planned), ...(late.length ? ['', `${L.late} :`, list(late)] : [])].join('\n').replace(/ :/g, lang === 'fr' ? ' :' : ':')
}
