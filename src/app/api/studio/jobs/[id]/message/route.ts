import { asUser, json, originOf } from '@/lib/studio/server/http'
import { sendMessage } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Message à Claude Code : maintenant (interrompt), après l'étape en cours, ou à la fin (reprend la session si c'est déjà fini). */
export const POST = asUser(async (req, user, { params }) => {
  const b = (await req.json().catch(() => null)) as { text?: string; mode?: string; assetIds?: string[] } | null
  const mode = (['now', 'next', 'after'] as const).find((m) => m === b?.mode) ?? 'next'
  const ids = Array.isArray(b?.assetIds) ? b!.assetIds.filter((x) => typeof x === 'string') : []
  if (!b?.text?.trim() && !ids.length) return json({ error: 'empty' }, 400)
  return json(await sendMessage(user.id, (await params).id, b?.text ?? '', mode, ids, originOf(req)), 201)
})
