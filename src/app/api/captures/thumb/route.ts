import { captureForMember, previewOf } from '@/lib/capture-preview'
import { isThumbHost } from '@/lib/captures'

export const runtime = 'nodejs'

async function image(url: string | null | undefined) {
  if (!url || !isThumbHost(url)) return null
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Mozilla/5.0 (Flow captures)' } })
    const type = r.headers.get('content-type') ?? ''
    if (!r.ok || !type.startsWith('image/')) return null
    const bytes = await r.arrayBuffer()
    return bytes.byteLength > 5 * 1024 * 1024 ? null : { bytes, type }
  } catch { return null }
}

/** GET /api/captures/thumb?id=… : relais de la miniature (hébergeurs connus seulement) ; lien expiré : aperçu recalculé une fois. */
export async function GET(req: Request) {
  const ctx = await captureForMember(new URL(req.url).searchParams.get('id'))
  if (!ctx) return new Response(null, { status: 404 })
  let img = await image((await previewOf(ctx))?.thumbnail)
  if (!img) img = await image((await previewOf(ctx, true))?.thumbnail)
  if (!img) return new Response(null, { status: 404 })
  return new Response(img.bytes, { headers: { 'content-type': img.type, 'cache-control': 'private, max-age=3600' } })
}
