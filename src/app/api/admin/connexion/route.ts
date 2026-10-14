import { NextResponse } from 'next/server'
import { rateLimited, sameOrigin } from '@/lib/security'
import { lireCompte, ouvrirSession, verifier } from '@/lib/admin/auth'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'origin' }, { status: 403 })
  if (rateLimited(`admin-login:${req.headers.get('x-forwarded-for') ?? 'local'}`, 20, 10 * 60_000)) return NextResponse.json({ error: 'trop' }, { status: 429 })
  const b = (await req.json().catch(() => ({}))) as { email?: string; mdp?: string }
  const r = await verifier(String(b.email ?? ''), String(b.mdp ?? ''))
  if (r === 'bloque') return NextResponse.json({ error: 'bloque' }, { status: 429 })
  if (r !== 'ok') return NextResponse.json({ error: 'identifiants' }, { status: 401 })
  await ouvrirSession()
  return NextResponse.json({ ok: true, doitChanger: (await lireCompte())?.doitChanger ?? false })
}
