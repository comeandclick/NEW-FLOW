import { NextResponse } from 'next/server'
import { sameOrigin } from '@/lib/security'
import { estAdmin } from '@/lib/admin/auth'
import { getAdminDb } from '@/lib/supabase/server'
export const runtime = 'nodejs'
export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'origin' }, { status: 403 })
  if (!(await estAdmin())) return NextResponse.json({ error: 'session' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { id?: string; statut?: string; note?: string }
  if (!b.id || (b.statut && !['ouverte', 'en_cours', 'resolue'].includes(b.statut))) return NextResponse.json({ error: 'invalide' }, { status: 400 })
  const { error } = await getAdminDb().from('support_demandes').update({ ...(b.statut ? { statut: b.statut } : {}), ...(b.note !== undefined ? { note_admin: b.note.slice(0, 2000) } : {}), maj: new Date().toISOString() }).eq('id', b.id)
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}
