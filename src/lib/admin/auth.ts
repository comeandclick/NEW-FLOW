import 'server-only'
// Accès à l'admin de Flow (14/10/2026) : indépendant des comptes Flow. Un seul administrateur (aymenfadil264@gmail.com),
// mot de passe haché (scrypt) rangé dans le stockage privé « admin » (lisible seulement avec la clé serveur),
// changement obligatoire à la première connexion, session = cookie signé (HMAC) de 12 h, httpOnly.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { getAdminDb } from '@/lib/supabase/server'

export const EMAIL_ADMIN = 'aymenfadil264@gmail.com'
const FICHIER = 'compte.json'
const COOKIE = 'flow_admin'
type Compte = { email: string; hash: string; sel: string; doitChanger: boolean; maj: string; essais?: { n: number; depuis: number } }

const secret = () => createHmac('sha256', process.env.SUPABASE_SECRET_KEY ?? 'dev').update('flow-admin-session-v1').digest()
export const hacher = (mdp: string, sel = randomBytes(16).toString('hex')) => ({ sel, hash: scryptSync(mdp, sel, 64).toString('hex') })

async function bucket() {
  const db = getAdminDb()
  const { data } = await db.storage.getBucket('admin')
  if (!data) await db.storage.createBucket('admin', { public: false })
  return db.storage.from('admin')
}
export async function lireCompte(): Promise<Compte | null> {
  const { data } = await (await bucket()).download(FICHIER)
  if (!data) return null
  try { return JSON.parse(await data.text()) as Compte } catch { return null }
}
export async function ecrireCompte(c: Compte) {
  const { error } = await (await bucket()).upload(FICHIER, new Blob([JSON.stringify(c)], { type: 'application/json' }), { upsert: true, contentType: 'application/json' })
  if (error) throw new Error(error.message)
}

/** Vérifie e-mail + mot de passe ; 8 essais ratés → blocage 15 minutes. */
export async function verifier(email: string, mdp: string): Promise<'ok' | 'non' | 'bloque' | 'absent'> {
  const c = await lireCompte()
  if (!c) return 'absent'
  if (c.essais && c.essais.n >= 8 && Date.now() - c.essais.depuis < 15 * 60_000) return 'bloque'
  const bon = email.trim().toLowerCase() === c.email && timingSafeEqual(Buffer.from(hacher(mdp, c.sel).hash, 'hex'), Buffer.from(c.hash, 'hex'))
  if (!bon) { const e = c.essais && Date.now() - c.essais.depuis < 15 * 60_000 ? c.essais : { n: 0, depuis: Date.now() }; await ecrireCompte({ ...c, essais: { n: e.n + 1, depuis: e.depuis } }); return 'non' }
  if (c.essais) await ecrireCompte({ ...c, essais: undefined })
  return 'ok'
}

const signer = (v: string) => `${v}.${createHmac('sha256', secret()).update(v).digest('base64url')}`
export async function ouvrirSession() {
  const v = Buffer.from(JSON.stringify({ e: EMAIL_ADMIN, x: Date.now() + 12 * 3600_000 })).toString('base64url')
  ;(await cookies()).set(COOKIE, signer(v), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 12 * 3600 })
}
export async function fermerSession() { (await cookies()).delete(COOKIE) }
/** Session admin valide ? (cookie signé et non expiré) */
export async function estAdmin(): Promise<boolean> {
  const c = (await cookies()).get(COOKIE)?.value
  if (!c) return false
  const i = c.lastIndexOf('.'); const v = c.slice(0, i)
  const attendu = signer(v)
  if (attendu.length !== c.length || !timingSafeEqual(Buffer.from(attendu), Buffer.from(c))) return false
  try { return JSON.parse(Buffer.from(v, 'base64url').toString()).x > Date.now() } catch { return false }
}
