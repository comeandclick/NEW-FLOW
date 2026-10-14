/** Clients : espace partagé avec un client (discussion, fichiers livrés, liste à faire), ouvert par un lien secret /c/<jeton>. */

export type ClientCadence = 'week' | 'two_days' | 'day' | 'on_demand'
export type ClientFileStatus = 'livree' | 'modif' | 'validee' | 'recu'

export type ClientRow = {
  id: string; workspace_id: string; name: string; company: string | null; cadence: ClientCadence; per_period: number | null
  notes: string | null; color: string | null; access_token: string; token_rotated_at: string
  created_by: string | null; created_at: string; updated_at: string; deleted_at: string | null
}
export type ClientMessage = {
  id: string; workspace_id: string; client_id: string; author_kind: 'team' | 'client'; author_id: string | null; author_name: string | null
  body: string; file_id: string | null; created_at: string; deleted_at: string | null
}
export type ClientFile = {
  id: string; workspace_id: string; client_id: string; title: string; name: string; mime_type: string | null; size: number | null
  storage_path: string; version: number; status: ClientFileStatus; uploaded_by_kind: 'team' | 'client'; uploaded_by: string | null
  created_at: string; updated_at: string; deleted_at: string | null
}
export type ClientTodo = {
  id: string; workspace_id: string; client_id: string; title: string; due_date: string | null; done: boolean; done_at: string | null
  position: number; created_at: string; deleted_at: string | null
}

/** Ce que voit le client : jamais le jeton, les notes internes ni les identifiants des membres. */
export type PortalClient = Pick<ClientRow, 'id' | 'name' | 'company' | 'cadence' | 'per_period' | 'color'> & { workspace_name: string | null }
export type PortalData = { client: PortalClient; messages: ClientMessage[]; files: (ClientFile & { url?: string | null })[]; todos: ClientTodo[] }

export const CLIENT_BUCKET = 'clients'
/** Plafond d'un envoi : celui du seau « clients » (supabase/clients.sql). */
export const MAX_CLIENT_FILE_BYTES = 50 * 1024 * 1024
export const MAX_CLIENT_MESSAGE = 4000
export const CADENCES: ClientCadence[] = ['week', 'two_days', 'day', 'on_demand']
/** Jeton de la démo : lu dans le navigateur, sans serveur. */
export const isDemoToken = (token: string) => token === 'demo' || token.startsWith('demo-')

/** Jeton du lien d'invitation : 32 octets aléatoires en base64url (impossible à deviner). */
export function newClientToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const isValidToken = (token: string) => /^[\w-]{20,64}$/.test(token)

export function clientFilePath(workspaceId: string, clientId: string, name: string) {
  // accents retirés (« vidéo » -> « video »), pas de « .. » ni de caractère refusé par le stockage
  const safe = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.\-]+/g, '_').replace(/\.{2,}/g, '.').slice(-120)
  return `${workspaceId}/${clientId}/${Date.now().toString(36)}-${safe}`
}

/** Titre proposé pour un fichier : son nom sans extension ni tirets. */
export const titleFromName = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120) || 'Fichier'

/** Version suivante pour un titre : même titre = même vidéo (V1, V2…). */
export function nextVersion(files: Pick<ClientFile, 'title' | 'version' | 'deleted_at'>[], title: string) {
  const key = title.trim().toLowerCase()
  return Math.max(0, ...files.filter((f) => !f.deleted_at && f.title.trim().toLowerCase() === key).map((f) => f.version)) + 1
}

/** Fichiers groupés par titre, version la plus récente d'abord, groupes du plus récent au plus ancien. */
export function groupFiles<T extends ClientFile>(files: T[]): { title: string; versions: T[] }[] {
  const map = new Map<string, T[]>()
  for (const f of files) {
    if (f.deleted_at) continue
    const k = f.title.trim().toLowerCase()
    map.set(k, [...(map.get(k) ?? []), f])
  }
  return [...map.values()]
    .map((v) => ({ title: v[0].title, versions: v.sort((a, b) => b.version - a.version || b.created_at.localeCompare(a.created_at)) }))
    .sort((a, b) => b.versions[0].created_at.localeCompare(a.versions[0].created_at))
}

export const isVideo = (mime?: string | null) => !!mime && mime.startsWith('video/')
export const isImageMime = (mime?: string | null) => !!mime && mime.startsWith('image/')

/** Vidéos prévues sur un mois selon le rythme convenu (null : à la demande). */
export function plannedPerMonth(c: { cadence: ClientCadence; per_period: number | null }): number | null {
  if (c.cadence === 'on_demand') return null
  if (c.cadence === 'day') return 30
  if (c.cadence === 'two_days') return 15
  return (c.per_period ?? 1) * 4
}

/** Dates des prochaines vidéos sur 4 semaines à partir de `from` (aaaa-mm-jj), selon le rythme. */
export function planDates(c: { cadence: ClientCadence; per_period: number | null }, from: Date): string[] {
  const out: string[] = []
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const add = (days: number) => { const d = new Date(from); d.setDate(d.getDate() + days); return d }
  if (c.cadence === 'on_demand') return out
  if (c.cadence === 'day') for (let i = 1; i <= 28; i++) out.push(iso(add(i)))
  else if (c.cadence === 'two_days') for (let i = 2; i <= 28; i += 2) out.push(iso(add(i)))
  else {
    // n vidéos par semaine, réparties dans la semaine (ex. 3 : jours 2, 4, 6)
    const n = Math.max(1, Math.min(7, c.per_period ?? 1))
    for (let w = 0; w < 4; w++) for (let k = 0; k < n; k++) out.push(iso(add(w * 7 + Math.round(((k + 1) * 7) / (n + 1)))))
  }
  return out
}

/**
 * Retire des dates prévues celles déjà couvertes par une ligne de la liste à faire
 * (une échéance à moins d'un demi-intervalle : « Post 3 » le 22 couvre la vidéo prévue le 21).
 */
export function freeSlots(c: { cadence: ClientCadence; per_period: number | null }, planned: string[], existing: (string | null)[]): string[] {
  const interval = c.cadence === 'day' ? 1 : c.cadence === 'two_days' ? 2 : 7 / Math.max(1, Math.min(7, c.per_period ?? 1))
  const half = Math.max(0, Math.floor(interval / 2))
  const days = (d: string) => Math.round(new Date(`${d}T12:00:00`).getTime() / 86_400_000)
  const taken = existing.filter((d): d is string => !!d).map(days)
  const out: string[] = []
  for (const d of planned) {
    const x = days(d)
    if (taken.some((y) => Math.abs(y - x) <= half)) continue
    out.push(d); taken.push(x)
  }
  return out
}

export type MonthSummary = { delivered: number; planned: number | null; toReview: number; changes: number; next: Pick<ClientTodo, 'title' | 'due_date'> | null; late: number }

/** Résumé affiché en haut de l'espace : vidéos livrées ce mois-ci, à valider, prochaine échéance. */
export function monthSummary(c: { cadence: ClientCadence; per_period: number | null }, files: ClientFile[], todos: ClientTodo[], now = new Date()): MonthSummary {
  // dates locales (Paris), pas UTC : une vidéo envoyée le 1er à 0 h 30 compte pour le nouveau mois
  const local = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = local(now)
  const month = today.slice(0, 7)
  const groups = groupFiles(files.filter((f) => f.uploaded_by_kind === 'team'))
  const open = todos.filter((t) => !t.done && !t.deleted_at)
  const dated = open.filter((t) => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!))
  return {
    // une vidéo compte le mois de sa première version
    delivered: groups.filter((g) => local(new Date(g.versions[g.versions.length - 1].created_at)).slice(0, 7) === month).length,
    planned: plannedPerMonth(c),
    toReview: groups.filter((g) => g.versions[0].status === 'livree').length,
    changes: groups.filter((g) => g.versions[0].status === 'modif').length,
    next: dated.find((t) => t.due_date! >= today) ?? null,
    late: dated.filter((t) => t.due_date! < today).length,
  }
}

/** Dernière visite d'un espace, par appareil (pour marquer les nouveautés). */
const seenKey = (clientId: string, viewer: 'team' | 'client') => `flow-client-seen:${viewer}:${clientId}`
export function getSeen(clientId: string, viewer: 'team' | 'client'): string | null {
  try { return window.localStorage.getItem(seenKey(clientId, viewer)) } catch { return null }
}
export function setSeen(clientId: string, viewer: 'team' | 'client', at = new Date().toISOString()) {
  try { window.localStorage.setItem(seenKey(clientId, viewer), at) } catch {}
}
