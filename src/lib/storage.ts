'use client'
import { getDb } from '@/lib/supabase/client'
import { uid } from '@/lib/utils'

const cache = new Map<string, { url: string; exp: number }>()
// 19/10/2026 (quota « Cached Egress » de Supabase dépassé) : un lien signé change à chaque signature, donc le navigateur
// retéléchargeait chaque photo, vocal ou vidéo à chaque visite. Les liens sont maintenant signés pour 7 jours et gardés
// dans le navigateur : la même adresse revient d'une visite à l'autre et le cache HTTP du navigateur sert le fichier.
const LIENS = 'flow-liens-v1'
const DUREE = 7 * 24 * 3600
let persistes: Record<string, { url: string; exp: number }> | null = null
function lienGarde(key: string) {
  try {
    persistes ??= JSON.parse(localStorage.getItem(LIENS) || '{}') as Record<string, { url: string; exp: number }>
    const hit = persistes[key]
    return hit && hit.exp > Date.now() ? hit : null
  } catch { return null }
}
function garderLien(key: string, v: { url: string; exp: number }) {
  try {
    persistes ??= {}
    persistes[key] = v
    const now = Date.now()
    for (const [k, x] of Object.entries(persistes)) if (x.exp <= now) delete persistes[k]
    localStorage.setItem(LIENS, JSON.stringify(persistes))
  } catch { /* stockage plein ou indisponible : lien gardé en mémoire seulement */ }
}
/** À la déconnexion : les liens signés gardés ne doivent pas rester dans le navigateur. */
export function oublierLiens() { persistes = {}; cache.clear(); try { localStorage.removeItem(LIENS) } catch { /* rien */ } }

export async function uploadToBucket(bucket: 'files' | 'voice' | 'avatars', folder: string, file: Blob, name: string) {
  const safe = name.replace(/[^\w.\-]+/g, '_')
  const path = `${folder}/${uid().slice(0, 8)}-${safe}`
  const { error } = await getDb().storage.from(bucket).upload(path, file, { contentType: file.type || undefined, upsert: false, cacheControl: '31536000' })
  if (error) throw error
  return path
}

export async function signedUrl(bucket: 'files' | 'voice', path: string): Promise<string> {
  const key = `${bucket}/${path}`
  const hit = cache.get(key) ?? lienGarde(key)
  if (hit && hit.exp > Date.now()) { cache.set(key, hit); return hit.url }
  // 19/11/2026 : les gros fichiers sont déménagés sur Cloudflare R2 (chemin « r2:… ») : lien signé par le serveur de Flow.
  // Une ancienne référence (pièce jointe d'un message, vidéo d'une fiche Motion) peut encore porter le chemin d'avant le déménagement :
  // si Supabase ne l'a plus, on essaie sa place sur R2.
  const viaR2 = async (chemin: string) => {
    const r = await fetch('/api/fichiers/lien', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chemin }) }).catch(() => null)
    return r?.ok ? ((await r.json()) as { url?: string }).url ?? '' : ''
  }
  let url = ''
  if (path.startsWith('r2:')) url = await viaR2(path)
  else {
    const { data, error } = await getDb().storage.from(bucket).createSignedUrl(path, DUREE)
    url = !error && data ? data.signedUrl : bucket === 'files' ? await viaR2(`r2:${path}`) : ''
  }
  if (!url) return ''
  // Réutilisé jusqu'à un jour avant son expiration.
  const v = { url, exp: Date.now() + (DUREE - 24 * 3600) * 1000 }
  cache.set(key, v)
  garderLien(key, v)
  return url
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const isImage = (mime?: string | null) => !!mime && mime.startsWith('image/')
