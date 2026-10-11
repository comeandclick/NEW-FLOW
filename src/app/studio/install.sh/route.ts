import { installScript } from '@/lib/studio/server/installer-script'
import { publicOrigin } from '@/lib/studio/server/origin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Script d'installation du pont Flow sur un Mac. L'adresse du site est injectée (voir publicOrigin) : même code sur n'importe quel domaine. */
export async function GET(req: Request) {
  let origin: string
  try { origin = publicOrigin(req) } catch { return new Response('bad host', { status: 400 }) }
  return new Response(installScript(origin), { headers: { 'Content-Type': 'text/x-shellscript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
}
