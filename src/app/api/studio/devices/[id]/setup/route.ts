import { asUser, json } from '@/lib/studio/server/http'
import { requestSetup, type SetupAction } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Commandes vers le Mac : réglages de l'Atelier (action « reglages »), et anciennes actions d'installation de Flow Studio. */
export const POST = asUser(async (req, user, { params }) => {
  const b = (await req.json().catch(() => null)) as Partial<SetupAction> | null
  if (!b?.action) return json({ error: 'invalid' }, 400)
  await requestSetup(user.id, (await params).id, { action: b.action, component: b.component?.slice(0, 40), choice: b.choice?.slice(0, 40), reglages: b.reglages })
  return json({ ok: true }, 202)
})
