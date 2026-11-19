import { NextResponse } from 'next/server'
import { getServerDb } from '@/lib/supabase/server'
import { cleR2, estR2, supprimerR2 } from '@/lib/r2'

export const runtime = 'nodejs'

/** POST /api/fichiers/supprimer { chemin } : supprime définitivement un fichier déménagé sur R2 (corbeille vidée). Même droit que la ligne « files ». */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { chemin?: string }
  if (!estR2(b.chemin)) return NextResponse.json({ error: 'chemin' }, { status: 400 })
  const db = await getServerDb()
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { data: f } = await db.from('files').select('id').eq('storage_path', b.chemin!).limit(1).maybeSingle()
  if (!f) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  await supprimerR2(cleR2(b.chemin!))
  return NextResponse.json({ ok: true })
}
