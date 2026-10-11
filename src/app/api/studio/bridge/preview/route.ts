import { asDevice, json, originOf } from '@/lib/studio/server/http'
import { bridgePreview, bridgePreviewDone } from '@/lib/studio/server/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Le pont envoie une capture du Mac (page du site, logiciel de montage). Sans « path » : demande le lien d'envoi ; avec « path » : confirme l'envoi. */
export const POST = asDevice(async (req, dev) => {
  const b = (await req.json().catch(() => null)) as { jobId?: string; slot?: string; path?: string; w?: number; h?: number; label?: string } | null
  if (!b?.jobId || !b.slot) return json({ error: 'invalid' }, 400)
  if (b.path) {
    await bridgePreviewDone(dev, b.jobId, b.slot, String(b.path), { w: Number.isFinite(b.w) ? b.w : undefined, h: Number.isFinite(b.h) ? b.h : undefined, label: typeof b.label === 'string' ? b.label : undefined })
    return json({ ok: true })
  }
  return json(await bridgePreview(dev, b.jobId, b.slot, originOf(req)))
})
