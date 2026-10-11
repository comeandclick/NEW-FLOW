import { asDevice, json } from '@/lib/studio/server/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Le Mac vérifie que son jeton est toujours valide (sans consommer de commande). */
export const GET = asDevice(async (_req, dev) => json({ ok: true, name: dev.name }))
