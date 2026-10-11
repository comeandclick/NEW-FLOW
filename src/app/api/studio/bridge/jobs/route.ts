import { asDevice, json } from '@/lib/studio/server/http'
import { bridgeJobs } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Liste des projets du compte, pour la page d'accueil du logiciel Flow Studio sur le Mac. */
export const GET = asDevice(async (_req, dev) => json({ jobs: await bridgeJobs(dev) }))
