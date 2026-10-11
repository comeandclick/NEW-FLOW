import { asUser, json, originOf } from '@/lib/studio/server/http'
import { assetUploaded, registerAsset } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const MAX = 2 * 1024 ** 3

/** Déclare un fichier à envoyer ; renvoie un lien d'envoi direct vers le stockage (pas de limite de taille Vercel). */
export const POST = asUser(async (req, user, { params }) => {
  const b = (await req.json().catch(() => null)) as { name?: string; size?: number; mime?: string; kind?: string } | null
  if (!b?.name || (b.size ?? 0) > MAX) return json({ error: 'invalid' }, 400)
  return json(await registerAsset(user.id, (await params).id, { name: b.name, size: b.size, mime: b.mime, kind: b.kind }, originOf(req)), 201)
})
export const PATCH = asUser(async (req, user) => {
  const b = (await req.json().catch(() => null)) as { assetId?: string } | null
  if (!b?.assetId) return json({ error: 'invalid' }, 400)
  await assetUploaded(user.id, b.assetId)
  return json({ ok: true })
})
