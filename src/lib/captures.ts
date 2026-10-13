/** Captures: what gets sent to Flow from a share sheet. Pure functions: usable on the client, on the server and in tests. */

export const CAPTURE_KINDS = ['tiktok', 'instagram', 'youtube', 'lien', 'image', 'video', 'texte'] as const
export type CaptureKind = (typeof CAPTURE_KINDS)[number]
export const CAPTURE_STATUSES = ['nouveau', 'vu'] as const
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number]

export const MAX_CAPTURE_URL = 2000

/** « Analyse par l'IA » as sent by a form, a share shortcut or the API: true, "true", "1", "on", "oui", "yes". Anything else: no. */
export function wantsAi(value: unknown): boolean {
  if (value === true) return true
  return typeof value === 'string' && ['true', '1', 'on', 'oui', 'yes'].includes(value.trim().toLowerCase())
}
export const MAX_CAPTURE_NOTE = 4000

/** A shared text often carries the link inside a sentence ("Regarde ça https://… !"): take the first http(s) link. */
export function firstUrl(text: string | null | undefined): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text ?? '')
  return m ? m[0].replace(/[).,!?;:]+$/, '') : null
}

/** A link we accept to store: http(s) only, bounded length. Returns the normalised link, or null. */
export function cleanCaptureUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const value = input.trim()
  if (!value || value.length > MAX_CAPTURE_URL) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch { return null }
}

const host = (url: string): string => { try { return new URL(url).hostname.toLowerCase().replace(/^(www|m|vm|vt)\./, '') } catch { return '' } }

/** Kind of a capture, from its link first, then from its file. Plain text when there is neither. */
export function inferCaptureKind(input: { url?: string | null; mime?: string | null }): CaptureKind {
  const h = input.url ? host(input.url) : ''
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return 'tiktok'
  if (h === 'instagram.com' || h.endsWith('.instagram.com') || h === 'instagr.am') return 'instagram'
  if (h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtu.be') return 'youtube'
  if (input.url) return 'lien'
  const mime = input.mime ?? ''
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  return 'texte'
}

/** Short label for a card when the capture has no title: the site of the link, else the start of the note. */
export function captureLabel(c: { title?: string | null; url?: string | null; note?: string | null; kind: string }): string {
  if (c.title?.trim()) return c.title.trim()
  if (c.url) { const h = host(c.url); if (h) return h }
  const note = c.note?.trim()
  return note ? (note.length > 80 ? `${note.slice(0, 80)}…` : note) : c.kind
}

/**
 * "Current project" of a person in a workspace: where a capture goes when none is given.
 * Stored in profiles.preferences.current_project as { [workspaceId]: projectId }.
 */
export function currentProjectOf(preferences: unknown, workspaceId: string): string | null {
  const map = (preferences as { current_project?: Record<string, unknown> } | null)?.current_project
  const id = map && typeof map === 'object' ? map[workspaceId] : null
  return typeof id === 'string' && id ? id : null
}

export function withCurrentProject(preferences: unknown, workspaceId: string, projectId: string | null): Record<string, unknown> {
  const prefs = (preferences && typeof preferences === 'object' ? preferences : {}) as Record<string, unknown>
  const map = { ...((prefs.current_project as Record<string, string> | undefined) ?? {}) }
  if (projectId) map[workspaceId] = projectId
  else delete map[workspaceId]
  return { ...prefs, current_project: map }
}

// ── Aperçu et lecture sur place (TikTok, Instagram, YouTube) ──

/** Aperçu enregistré sur la capture (colonne preview), rempli au premier affichage par /api/captures/preview. */
export type CapturePreview = { provider: 'tiktok' | 'instagram' | 'youtube'; title?: string | null; author?: string | null; thumbnail?: string | null; embed?: string | null; fetched_at: string }

export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url); const h = u.hostname.replace(/^(www|m)\./, '')
    if (h === 'youtu.be') return /^[\w-]{6,20}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null
    if (!h.endsWith('youtube.com')) return null
    const v = u.searchParams.get('v'); if (v && /^[\w-]{6,20}$/.test(v)) return v
    const m = /^\/(?:shorts|embed|live)\/([\w-]{6,20})/.exec(u.pathname); return m ? m[1] : null
  } catch { return null }
}

/** Reel ou publication Instagram : { type, code } pour le lecteur officiel /<type>/<code>/embed/. */
export function instagramPost(url: string): { type: 'reel' | 'p' | 'tv'; code: string } | null {
  try {
    const u = new URL(url); if (!u.hostname.replace(/^www\./, '').endsWith('instagram.com')) return null
    const m = /^\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]{5,40})/.exec(u.pathname)
    return m ? { type: m[1].startsWith('reel') ? 'reel' : (m[1] as 'p' | 'tv'), code: m[2] } : null
  } catch { return null }
}

/** Numéro de la vidéo TikTok quand il est dans le lien (les liens courts vm.tiktok.com passent par l'oEmbed). */
export function tiktokId(url: string): string | null {
  const m = /\/video\/(\d{8,25})/.exec(url) ?? /\/v\/(\d{8,25})/.exec(url)
  return m ? m[1] : null
}

/** Adresse du lecteur officiel, lu sur place dans la page (jamais en plein écran forcé). */
export function embedUrl(kind: string, url: string | null, tiktokVideoId?: string | null): string | null {
  if (!url) return null
  if (kind === 'youtube') { const id = youtubeId(url); return id ? `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&autoplay=1&rel=0` : null }
  if (kind === 'instagram') { const p = instagramPost(url); return p ? `https://www.instagram.com/${p.type}/${p.code}/embed/` : null }
  if (kind === 'tiktok') { const id = tiktokVideoId ?? tiktokId(url); return id ? `https://www.tiktok.com/embed/v2/${id}` : null }
  return null
}

/** Miniatures acceptées par le relais /api/captures/thumb (rien d'autre n'est relayé). */
export const THUMB_HOSTS = ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'ytimg.com', 'cdninstagram.com', 'fbcdn.net']
export const isThumbHost = (url: string): boolean => { try { const u = new URL(url); return u.protocol === 'https:' && THUMB_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)) } catch { return false } }

/** Projets d'une capture : project_ids (tous), sinon l'ancien project_id. */
export const projectsOf = (c: { project_id: string | null; project_ids?: string[] | null }): string[] =>
  c.project_ids && c.project_ids.length ? c.project_ids : c.project_id ? [c.project_id] : []

// ── Choix des projets depuis le raccourci iPhone (libellés lisibles « Kalimat › Kalimat 2.0 ») ──

export const CURRENT_PROJECT_LABEL = 'Projet par défaut'

/** Libellés proposés par le raccourci : le projet en cours d'abord, puis l'arbre des projets. */
export function projectLabels(tree: { id: string; path: string }[], current: { id: string; path: string } | null): string[] {
  return [...(current ? [`${CURRENT_PROJECT_LABEL} (${current.path})`] : []), ...tree.map((p) => p.path)]
}

/**
 * Projets choisis dans le raccourci (une ligne par projet, ou un tableau) -> identifiants, sans doublon, dans l'ordre.
 * Accepte un libellé « Kalimat › Kalimat 2.0 », un nom seul s'il n'y a pas d'ambiguïté, un identifiant, ou « Projet en cours ».
 */
export function resolveProjects(input: unknown, tree: { id: string; name: string; path: string }[], currentId: string | null): string[] {
  const items = (Array.isArray(input) ? input : typeof input === 'string' ? input.split(/\r?\n/) : []).map((x) => String(x).trim()).filter(Boolean)
  const norm = (v: string) => v.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
  const out: string[] = []
  for (const raw of items) {
    const v = norm(raw)
    let id: string | null = null
    if (v.startsWith(norm(CURRENT_PROJECT_LABEL)) || v.startsWith('projet en cours')) id = currentId
    else id = tree.find((p) => p.id === raw)?.id ?? tree.find((p) => norm(p.path) === v)?.id ?? null
    if (!id) { const same = tree.filter((p) => norm(p.name) === v); if (same.length === 1) id = same[0].id }
    if (id && !out.includes(id)) out.push(id)
  }
  return out
}
