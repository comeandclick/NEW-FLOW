// Fichiers de Flow sur Cloudflare R2 (19/11/2026) : le stockage Supabase gratuit (1 Go) était plein.
// Les outils continuent de déposer dans le bucket Supabase « files » ; le déménageur (/api/cron/vers-r2) transfère
// ensuite les fichiers vers R2 et préfixe leur chemin par « r2: ». Toute lecture d'un chemin « r2: » passe par un
// lien signé du Worker « flow-fichiers » (voir r2-worker/index.js). SERVEUR SEULEMENT : le secret ne quitte jamais le serveur.
import { createHmac } from 'node:crypto'

export const PREFIXE_R2 = 'r2:'
export const estR2 = (chemin?: string | null) => !!chemin && chemin.startsWith(PREFIXE_R2)
export const cleR2 = (chemin: string) => (estR2(chemin) ? chemin.slice(PREFIXE_R2.length) : chemin)

const base = () => {
  const u = process.env.FLOW_R2_URL, s = process.env.FLOW_R2_SECRET
  if (!u || !s) throw new Error('R2 non configuré (FLOW_R2_URL / FLOW_R2_SECRET)')
  return { u: u.replace(/\/$/, ''), s }
}
const enc = (cle: string) => cle.split('/').map(encodeURIComponent).join('/')

/** Lien signé du Worker pour lire / déposer / supprimer `cle` (sans le préfixe « r2: »). */
export function lienR2(cle: string, op: 'get' | 'put' | 'del' = 'get', duree = 7 * 24 * 3600, nom?: string) {
  const { u, s } = base()
  // expiration arrondie au jour : le même lien revient d'une visite à l'autre (cache du navigateur)
  const e = Math.ceil((Date.now() / 1000 + duree) / 86400) * 86400
  const sig = createHmac('sha256', s).update(`${op}:${cle}:${e}`).digest('hex')
  return `${u}/${enc(cle)}?e=${e}&s=${sig}${nom ? `&n=${encodeURIComponent(nom)}` : ''}`
}

export async function deposerR2(cle: string, corps: Blob | ArrayBuffer | Uint8Array, type?: string | null) {
  const r = await fetch(lienR2(cle, 'put', 3600), { method: 'PUT', body: corps as BodyInit, headers: { 'Content-Type': type || 'application/octet-stream' } })
  if (!r.ok) throw new Error(`R2 : dépôt refusé (${r.status})`)
  return ((await r.json()) as { taille: number }).taille
}

export async function supprimerR2(cle: string) {
  const r = await fetch(lienR2(cle, 'del', 3600), { method: 'DELETE' })
  if (!r.ok && r.status !== 404) throw new Error(`R2 : suppression refusée (${r.status})`)
}

export async function lireR2(cle: string) {
  const r = await fetch(lienR2(cle, 'get', 3600))
  if (!r.ok) throw new Error(`R2 : lecture refusée (${r.status})`)
  return r.blob()
}
