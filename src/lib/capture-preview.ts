import 'server-only'
import { getAdminDb, getServerDb } from '@/lib/supabase/server'
import { embedUrl, instagramPost, isThumbHost, tiktokId, type CapturePreview } from '@/lib/captures'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SIX_HEURES = 6 * 3600 * 1000

/** La capture, seulement si la personne connectée est membre de son espace. */
export async function captureForMember(id: string | null) {
  if (!id || !UUID.test(id)) return null
  const { data: { user } } = await (await getServerDb()).auth.getUser()
  if (!user) return null
  const a = getAdminDb()
  const { data: c } = await a.from('captures').select('id,workspace_id,kind,url,preview').eq('id', id).is('deleted_at', null).maybeSingle()
  if (!c) return null
  const { data: m } = await a.from('workspace_members').select('user_id').eq('workspace_id', c.workspace_id).eq('user_id', user.id).maybeSingle()
  return m ? { a, c: c as { id: string; workspace_id: string; kind: string; url: string | null; preview: CapturePreview | null } } : null
}

async function oembed(endpoint: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(endpoint, { signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'Mozilla/5.0 (Flow captures)' } })
    return r.ok ? ((await r.json()) as Record<string, unknown>) : null
  } catch { return null }
}
const s = (v: unknown, n = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

/** Aperçu d'un lien TikTok / YouTube / Instagram : oEmbed public quand il existe, lecteur officiel sinon. */
export async function computePreview(kind: string, url: string): Promise<CapturePreview | null> {
  const now = new Date().toISOString()
  if (kind === 'tiktok') {
    const o = await oembed(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
    const id = s(o?.embed_product_id, 40) ?? tiktokId(url)
    return { provider: 'tiktok', title: s(o?.title), author: s(o?.author_name, 120), thumbnail: s(o?.thumbnail_url, 2000), embed: embedUrl('tiktok', url, id), fetched_at: now }
  }
  if (kind === 'youtube') {
    const o = await oembed(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`)
    return { provider: 'youtube', title: s(o?.title), author: s(o?.author_name, 120), thumbnail: s(o?.thumbnail_url, 2000), embed: embedUrl('youtube', url), fetched_at: now }
  }
  if (kind === 'instagram') {
    // Instagram n'a pas d'oEmbed sans compte développeur : lecteur officiel seulement, pas de miniature
    return instagramPost(url) ? { provider: 'instagram', title: null, author: null, thumbnail: null, embed: embedUrl('instagram', url), fetched_at: now } : null
  }
  return null
}

/** Aperçu enregistré, recalculé s'il manque ou si la miniature risque d'avoir expiré (liens TikTok signés). */
export async function previewOf(ctx: NonNullable<Awaited<ReturnType<typeof captureForMember>>>, force = false): Promise<CapturePreview | null> {
  const { a, c } = ctx
  if (!c.url || !['tiktok', 'youtube', 'instagram'].includes(c.kind)) return null
  const old = c.preview
  if (old && !force && Date.now() - new Date(old.fetched_at).getTime() < SIX_HEURES) return old
  const fresh = await computePreview(c.kind, c.url)
  if (fresh) {
    if (fresh.thumbnail && !isThumbHost(fresh.thumbnail)) fresh.thumbnail = null
    await a.from('captures').update({ preview: fresh }).eq('id', c.id)
  }
  return fresh ?? old
}
