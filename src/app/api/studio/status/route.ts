import { cookies } from 'next/headers'
import { DEMO_COOKIE } from '@/lib/demo/constants'
import { json, storeInfo, studioUser } from '@/lib/studio/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** mode : live (vrai système) · demo (simulation locale) · setup (tables Supabase à créer) · anon (non connecté). */
export async function GET() {
  const [info, user] = await Promise.all([storeInfo(), studioUser()])
  const demoCookie = (await cookies()).get(DEMO_COOKIE)?.value === '1'
  if (!user) return json({ mode: demoCookie ? 'demo' : 'anon' }) // rien sur la configuration pour les visiteurs non connectés
  if (!info.ready) return json({ mode: 'setup', ...info })
  return json({ mode: 'live', ...info })
}
