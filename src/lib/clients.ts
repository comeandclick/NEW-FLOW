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
