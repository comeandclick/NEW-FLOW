import { NextResponse } from 'next/server'
import { getAdminDb, getServerDb } from '@/lib/supabase/server'
import { notifyUsers } from '@/lib/api/notify'
import { rateLimited, sameOrigin } from '@/lib/security'

export const runtime = 'nodejs'

/** POST /api/push/test : notification de test à soi-même (tous ses appareils abonnés), depuis Paramètres → Préférences. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 })
  const { data: { user } } = await (await getServerDb()).auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  if (rateLimited(`push-test:${user.id}`, 5)) return NextResponse.json({ ok: false }, { status: 429 })
  const { data: m } = await getAdminDb().from('workspace_members').select('workspace_id, workspace:workspaces(slug)').eq('user_id', user.id).limit(1).maybeSingle()
  if (!m) return NextResponse.json({ ok: false }, { status: 404 })
  const slug = (Array.isArray(m.workspace) ? m.workspace[0] : m.workspace)?.slug ?? ''
  await notifyUsers(m.workspace_id, [user.id], { type: 'alert', title: 'Notification de test', body: 'Si tu lis ceci, les notifications Flow marchent sur cet appareil.', url: `/app/${slug}/settings?tab=preferences` })
  return NextResponse.json({ ok: true })
}
