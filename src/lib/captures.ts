/** Captures: what gets sent to Flow from a share sheet. Pure functions: usable on the client, on the server and in tests. */

export const CAPTURE_KINDS = ['tiktok', 'instagram', 'youtube', 'lien', 'image', 'video', 'texte'] as const
export type CaptureKind = (typeof CAPTURE_KINDS)[number]
export const CAPTURE_STATUSES = ['nouveau', 'vu'] as const
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number]

export const MAX_CAPTURE_URL = 2000
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
