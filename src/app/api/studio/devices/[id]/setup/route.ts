import { asUser, json } from '@/lib/studio/server/http'
import { requestSetup, type SetupAction } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Demande au pont du Mac d'installer / vérifier un logiciel (EffectCraft, Remotion, Claude Code, After Effects…). */
export const POST = asUser(async (req, user, { params }) => {
  const b = (await req.json().catch(() => null)) as Partial<SetupAction> | null
  if (!b?.action) return json({ error: 'invalid' }, 400)
  await requestSetup(user.id, (await params).id, { action: b.action, component: b.component?.slice(0, 40), choice: b.choice?.slice(0, 40) })
  return json({ ok: true }, 202)
})
