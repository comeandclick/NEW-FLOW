/** Feedback items are ordinary tasks tagged `retour`; their structured fields live in the description as `Key: value` lines. */
export const FB_TAG = 'retour'
export const FB_TYPES = ['bug', 'idea', 'question'] as const
export type FbType = (typeof FB_TYPES)[number]
export const FB_SOURCES = ['testflight', 'appstore', 'email', 'internal', 'other'] as const
export type FbSource = (typeof FB_SOURCES)[number]

export type FbFields = { screen: string; version: string; device: string; steps: string }
const KEYS: [keyof Omit<FbFields, 'steps'>, string][] = [['screen', 'Écran'], ['version', 'Version'], ['device', 'Appareil']]

export function typeOf(tags: readonly string[]): FbType {
  const t = tags.find((x) => x.startsWith('type:'))?.slice(5)
  return (FB_TYPES as readonly string[]).includes(t ?? '') ? (t as FbType) : 'bug'
}
export function sourceOf(tags: readonly string[]): FbSource | null {
  const t = tags.find((x) => x.startsWith('source:'))?.slice(7)
  return (FB_SOURCES as readonly string[]).includes(t ?? '') ? (t as FbSource) : null
}
export const isFeedback = (tags: readonly string[] | null | undefined) => !!tags?.includes(FB_TAG)

export function buildTags(type: FbType, source: FbSource | null, extra: readonly string[] = []): string[] {
  return [FB_TAG, `type:${type}`, ...(source ? [`source:${source}`] : []), ...extra.filter((x) => x !== FB_TAG && !x.startsWith('type:') && !x.startsWith('source:'))]
}

export function buildDescription(f: FbFields): string {
  const head = KEYS.filter(([k]) => f[k].trim()).map(([k, label]) => `${label}: ${f[k].trim()}`)
  return [...head, ...(f.steps.trim() ? ['', f.steps.trim()] : [])].join('\n')
}

export function parseDescription(desc: string | null | undefined): FbFields {
  const out: FbFields = { screen: '', version: '', device: '', steps: '' }
  const lines = (desc ?? '').split('\n')
  let i = 0
  for (; i < lines.length; i++) {
    const m = KEYS.find(([, label]) => lines[i].startsWith(`${label}:`))
    if (!m) break
    out[m[0]] = lines[i].slice(m[1].length + 1).trim()
  }
  out.steps = lines.slice(i).join('\n').trim()
  return out
}
