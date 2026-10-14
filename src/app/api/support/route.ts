import { NextResponse } from 'next/server'
import { rateLimited, sameOrigin } from '@/lib/security'
import { getAdminDb, getServerDb } from '@/lib/supabase/server'
export const runtime = 'nodejs'
/** Demande d'aide envoyée depuis Flow (bouton « i » en bas du menu) : visible dans l'admin → Support. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'origin' }, { status: 403 })
  if (rateLimited(`support:${req.headers.get('x-forwarded-for') ?? 'local'}`, 10, 10 * 60_000)) return NextResponse.json({ error: 'trop' }, { status: 429 })
  const b = (await req.json().catch(() => ({}))) as { type?: string; sujet?: string; message?: string; email?: string; page?: string }
  if (!b.sujet?.trim() || !b.message?.trim()) return NextResponse.json({ error: 'invalide' }, { status: 400 })
  let user: { id: string; email?: string } | null = null
  try { user = (await (await getServerDb()).auth.getUser()).data.user } catch {}
  const { error } = await getAdminDb().from('support_demandes').insert({
    type: ['aide', 'bug', 'idee', 'abonnement', 'autre'].includes(String(b.type)) ? b.type : 'aide', sujet: b.sujet.trim().slice(0, 160), message: b.message.trim().slice(0, 4000),
    email: (b.email || user?.email || null)?.slice(0, 200) ?? null, user_id: user?.id ?? null, page: b.page?.slice(0, 160) ?? null,
  })
  return error ? NextResponse.json({ error: /support_demandes/.test(error.message) ? 'table' : 'serveur' }, { status: 500 }) : NextResponse.json({ ok: true })
}
