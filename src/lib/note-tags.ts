/**
 * Note tags and assignees live in the existing `notes.tags` array:
 *  - plain strings are tags,
 *  - `for:<user id>` entries mean "assigned to this member" (never shown as a tag).
 * Tag colours and the people notified when a tag is used are kept in `workspaces.settings.note_tags`.
 */
export const ASSIGN_PREFIX = 'for:'
export const TAG_COLORS = ['#6366f1', '#22c55e', '#f97316', '#ec4899', '#0ea5e9', '#a855f7', '#eab308', '#14b8a6', '#ef4444', '#64748b']

export type TagMeta = Record<string, { color?: string; users?: string[] }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX = /^#[0-9a-f]{6}$/i

export const isAssign = (tag: string) => tag.startsWith(ASSIGN_PREFIX)
export const assigneesOf = (tags: readonly string[]) => tags.filter(isAssign).map((t) => t.slice(ASSIGN_PREFIX.length))
/** étiquettes techniques (dossier privé d'un client) : gardées dans la note, jamais montrées comme badges */
const technique = (t: string) => t.startsWith('client:') || t === 'client-interne'
export const visibleTags = (tags: readonly string[]) => tags.filter((t) => !isAssign(t) && !technique(t))
/** Replaces the assignee entries of a tag list, keeping the real tags untouched. */
export const withAssignees = (tags: readonly string[], ids: readonly string[]) => [...tags.filter((t) => !isAssign(t)), ...[...new Set(ids)].map((i) => ASSIGN_PREFIX + i)]

export const cleanTagName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40)

/** Reads workspace.settings.note_tags defensively. */
export function readTagMeta(settings: unknown): TagMeta {
  const raw = (settings as { note_tags?: unknown } | null | undefined)?.note_tags
  const out: TagMeta = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = cleanTagName(name)
    if (!key || isAssign(key)) continue
    const o = (v ?? {}) as { color?: unknown; users?: unknown }
    out[key] = {
      ...(typeof o.color === 'string' && HEX.test(o.color) ? { color: o.color } : {}),
      users: Array.isArray(o.users) ? [...new Set(o.users.filter((u): u is string => typeof u === 'string' && UUID.test(u)))].slice(0, 100) : [],
    }
  }
  return out
}

/** The chosen colour, or a stable one derived from the name so untouched tags are still told apart. */
export const tagColor = (meta: TagMeta, tag: string) => {
  const c = meta[tag]?.color
  if (c) return c
  let h = 0
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TAG_COLORS[h % TAG_COLORS.length]
}

/** Rename: moves the metadata and rewrites every tag list. Returns null when the new name is taken or empty. */
export function renameTag(meta: TagMeta, from: string, to: string): TagMeta | null {
  const next = cleanTagName(to)
  if (!next || isAssign(next)) return null
  if (next === from) return meta
  if (next in meta) return null
  const { [from]: old, ...rest } = meta
  return { ...rest, [next]: old ?? { users: [] } }
}
export const renameInTags = (tags: readonly string[], from: string, to: string) => [...new Set(tags.map((t) => (t === from ? to : t)))]
