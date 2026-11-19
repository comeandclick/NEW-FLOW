import { NextResponse } from 'next/server'
import { getServerDb } from '@/lib/supabase/server'
import { cleR2, estR2, lienR2 } from '@/lib/r2'

export const runtime = 'nodejs'

/**
 * POST /api/fichiers/lien { chemin, nom? } → { url } : lien signé (7 jours) d'un fichier déménagé sur R2 (chemin « r2:… »).
 * Droit de lecture = celui de la ligne « files » pour l'utilisateur (RLS) : site (cookies) et app (Authorization: Bearer).
 */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { chemin?: string; nom?: string }
  if (!estR2(b.chemin)) return NextResponse.json({ error: 'chemin' }, { status: 400 })
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: f } = await db.from('files').select('id').eq('storage_path', b.chemin!).limit(1).maybeSingle()
  if (!f) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ url: lienR2(cleR2(b.chemin!), 'get', 7 * 24 * 3600, b.nom?.slice(0, 200)) })
}
