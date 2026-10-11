import { typeOf, isFeedback } from '@/lib/feedback'

export type RnTask = { id: string; title: string; tags: string[]; project_id: string | null; completed_at: string | null; status: string }
export type RnLang = 'fr' | 'en'

const LABEL = {
  fr: { title: 'Notes de version', features: 'Nouveautés', fixes: 'Corrections', improvements: 'Améliorations', none: 'Aucune tâche terminée sur cette période.' },
  en: { title: 'Release notes', features: 'What’s new', fixes: 'Fixes', improvements: 'Improvements', none: 'No task finished in this period.' },
} as const

export type RnSection = { key: 'features' | 'improvements' | 'fixes'; items: RnTask[] }

/** Finished tasks in [since, until], grouped for readers: bugs → fixes, ideas → improvements, everything else → what's new. Internal tasks can be hidden with the `interne` / `internal` tag. */
export function collect(tasks: RnTask[], since: Date, until: Date, opts: { projectId?: string | null } = {}): RnSection[] {
  const inRange = tasks.filter((x) => x.status === 'done' && x.completed_at && new Date(x.completed_at) >= since && new Date(x.completed_at) <= until)
    .filter((x) => !x.tags.some((g) => g === 'interne' || g === 'internal'))
    .filter((x) => !opts.projectId || x.project_id === opts.projectId)
    .sort((a, b) => +new Date(a.completed_at!) - +new Date(b.completed_at!))
  const sec: Record<RnSection['key'], RnTask[]> = { features: [], improvements: [], fixes: [] }
  for (const x of inRange) {
    if (isFeedback(x.tags)) (typeOf(x.tags) === 'bug' ? sec.fixes : sec.improvements).push(x)
    else sec.features.push(x)
  }
  return (['features', 'improvements', 'fixes'] as const).map((key) => ({ key, items: sec[key] })).filter((s) => s.items.length)
}

export function render(sections: RnSection[], lang: RnLang, version: string, excluded: ReadonlySet<string> = new Set()): string {
  const L = LABEL[lang]
  const out = [`# ${L.title}${version.trim() ? ` ${version.trim()}` : ''}`, '']
  let n = 0
  for (const s of sections) {
    const items = s.items.filter((x) => !excluded.has(x.id))
    if (!items.length) continue
    out.push(`## ${L[s.key]}`, ...items.map((x) => `- ${x.title}`), ''); n += items.length
  }
  if (!n) out.push(L.none)
  return out.join('\n').trim()
}
