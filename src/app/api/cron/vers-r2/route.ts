import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/supabase/server'
import { deposerR2, PREFIXE_R2 } from '@/lib/r2'

export const runtime = 'nodejs'
export const maxDuration = 60

const SEUIL = 256 * 1024          // les petits fichiers (notes, vignettes) restent sur Supabase
const LOT = 120 * 1024 * 1024     // au plus 120 Mo déménagés par appel (durée de la fonction)

/**
 * POST /api/cron/vers-r2 (en-tête x-cron-secret = CRON_SECRET ; appelé chaque heure par pg_cron, et à la main) :
 * déménage les fichiers de la table « files » encore sur Supabase (bucket « files ») vers Cloudflare R2.
 * Pour chaque fichier : copie dans R2 → vérifie la taille → chemin « r2:… » (files + motion_projets.video_chemin) → retire de Supabase.
 * Les outils qui déposent dans Flow (Motion Studio, atelier, skills) n'ont rien à changer.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('x-cron-secret') !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const a = getAdminDb()
  const { data: rows, error } = await a.from('files').select('id,storage_path,mime_type,size').not('storage_path', 'like', `${PREFIXE_R2}%`).not('storage_path', 'like', '/%').not('storage_path', 'like', '%/gestion/%').gte('size', SEUIL).order('size', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const faits: string[] = [], echecs: { id: string; raison: string }[] = []
  let octets = 0
  const debut = Date.now()
  for (const f of rows ?? []) {
    if (octets > 0 && (octets + (f.size ?? 0) > LOT || Date.now() - debut > 40e3)) break
    try {
      const { data: blob, error: e1 } = await a.storage.from('files').download(f.storage_path)
      if (e1 || !blob) throw new Error(e1?.message || 'absent de Supabase')
      const taille = await deposerR2(f.storage_path, blob, f.mime_type)
      if (taille !== blob.size) throw new Error(`taille R2 ${taille} ≠ ${blob.size}`)
      const nouveau = PREFIXE_R2 + f.storage_path
      const { error: e2 } = await a.from('files').update({ storage_path: nouveau }).eq('id', f.id)
      if (e2) throw new Error(e2.message)
      await a.from('motion_projets').update({ video_chemin: nouveau }).eq('video_chemin', f.storage_path)
      await a.storage.from('files').remove([f.storage_path])
      faits.push(f.id); octets += blob.size
    } catch (e) { echecs.push({ id: f.id, raison: (e as Error).message }) }
  }
  return NextResponse.json({ deplaces: faits.length, mo: Math.round(octets / 1048576), restants: Math.max(0, (rows?.length ?? 0) - faits.length - echecs.length), echecs })
}
