import { NextResponse } from 'next/server'
import { sameOrigin } from '@/lib/security'
import { ecrireCompte, estAdmin, hacher, lireCompte } from '@/lib/admin/auth'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Nouveau mot de passe : 10 caractères minimum, avec au moins une lettre et un chiffre. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: 'origin' }, { status: 403 })
  if (!(await estAdmin())) return NextResponse.json({ error: 'session' }, { status: 401 })
  const { nouveau } = (await req.json().catch(() => ({}))) as { nouveau?: string }
  if (!nouveau || nouveau.length < 10 || !/[a-zA-Z]/.test(nouveau) || !/\d/.test(nouveau)) return NextResponse.json({ error: 'faible' }, { status: 400 })
  const c = await lireCompte(); if (!c) return NextResponse.json({ error: 'compte' }, { status: 500 })
  await ecrireCompte({ ...c, ...hacher(nouveau), doitChanger: false, maj: new Date().toISOString(), essais: undefined })
  return NextResponse.json({ ok: true })
}
