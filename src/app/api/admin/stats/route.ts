import { NextResponse } from 'next/server'
import { estAdmin, lireCompte } from '@/lib/admin/auth'
import { statistiques } from '@/lib/admin/stats'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  if (!(await estAdmin())) return NextResponse.json({ error: 'session' }, { status: 401 })
  if ((await lireCompte())?.doitChanger) return NextResponse.json({ error: 'changer' }, { status: 403 })
  return NextResponse.json(await statistiques(), { headers: { 'Cache-Control': 'no-store' } })
}
