'use client'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { studioApi } from '@/lib/studio/api'

const KEY = 'flow_pair_code'
const CODE_RE = /^FLOW-[A-Z0-9]{4}-[A-Z0-9]{4}$/

/** Si l'installateur du Mac a ouvert la page de liaison avant la connexion, le code est gardé 10 min : une fois connecté, le Mac est relié tout seul, où qu'on atterrisse. */
export function PairResume() {
  useEffect(() => {
    let saved: { code?: string; at?: number } | null = null
    try { saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { /* stockage indisponible */ }
    if (!saved?.code || !CODE_RE.test(saved.code) || Date.now() - (saved.at ?? 0) > 10 * 60_000) { try { localStorage.removeItem(KEY) } catch {} return }
    const code = saved.code
    void studioApi.confirm(code).then(({ device }) => { try { localStorage.removeItem(KEY) } catch {} toast.success('Mac relié', { description: device.name }) }).catch(() => { /* code expiré ou déjà utilisé */ })
  }, [])
  return null
}
