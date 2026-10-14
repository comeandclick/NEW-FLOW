'use client'
import { useStudioMode } from '@/lib/studio/api'
import { ConnectPanel } from '@/components/studio/connect-panel'

/** Paramètres > Mac : liaison avec le logiciel Atelier du Mac (il remplace Flow Studio depuis le 14/10/2026).
 *  Les comptes Vercel / GitHub / Supabase et le « déplacement de site » passaient par Flow Studio : retirés avec lui. */
export function StudioTab() {
  const { mode } = useStudioMode()
  return (
    <div className="mb-6">
      <h2 className="mb-1 text-sm font-semibold">L&apos;Atelier (Mac)</h2>
      <p className="mb-3 text-[13px] text-text-3">Le logiciel du Mac qui fabrique les vidéos lancées dans Motion design → Lancer, et les sites demandés dans Site.</p>
      <ConnectPanel live={mode === 'live'} />
    </div>
  )
}
