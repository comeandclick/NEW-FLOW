import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { rateLimited } from '@/lib/security'
import { getAdminDb } from '@/lib/supabase/server'
export const runtime = 'nodejs'
// Visite anonyme : on ne garde ni l'adresse IP ni le navigateur, seulement une empreinte qui change chaque jour (comptage des visiteurs uniques).
export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local', ua = req.headers.get('user-agent') ?? ''
  if (rateLimited(`visite:${ip}`, 120) || /bot|crawl|spider|headless|lighthouse/i.test(ua)) return new NextResponse(null, { status: 204 })
  const b = (await req.json().catch(() => ({}))) as { chemin?: string; provenance?: string }
  const chemin = String(b.chemin ?? '/').slice(0, 120).replace(/\/app\/[^/]+/, '/app').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
  const jour = new Date().toISOString().slice(0, 10)
  let provenance: string | null = null
  try { const h = new URL(String(b.provenance ?? '')).hostname; provenance = h && h !== new URL(req.url).hostname ? h.replace(/^www\./, '') : null } catch {}
  await getAdminDb().from('site_visites').insert({
    jour, chemin, espace: chemin.startsWith('/app') ? 'app' : 'site', provenance, pays: req.headers.get('x-vercel-ip-country'),
    appareil: /ipad|tablet/i.test(ua) ? 'tablette' : /mobi|iphone|android/i.test(ua) ? 'mobile' : 'ordinateur',
    visite: createHash('sha256').update(`${ip}|${ua}|${jour}|${process.env.SUPABASE_SECRET_KEY ?? ''}`).digest('hex').slice(0, 16),
  })
  return new NextResponse(null, { status: 204 })
}
