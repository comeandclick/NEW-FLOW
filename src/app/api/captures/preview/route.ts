import { NextResponse } from 'next/server'
import { captureForMember, previewOf } from '@/lib/capture-preview'

export const runtime = 'nodejs'

/** GET /api/captures/preview?id=… : aperçu (titre, auteur, lecteur officiel) d'une capture TikTok / YouTube / Instagram. */
export async function GET(req: Request) {
  const ctx = await captureForMember(new URL(req.url).searchParams.get('id'))
  if (!ctx) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const p = await previewOf(ctx)
  return NextResponse.json({ preview: p ? { ...p, thumbnail: p.thumbnail ? `/api/captures/thumb?id=${ctx.c.id}` : null } : null }, { headers: { 'cache-control': 'private, no-store' } })
}
