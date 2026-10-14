'use client'
// Motion design (14/10/2026) : « Productions » (vidéos suivies par le logiciel Atelier du Mac, pensé pour l'iPhone)
// et « Lancer » (nouvelle vidéo : client → type → voix ; la demande part vers l'Atelier, qui remplace Flow Studio).
import { ExigeAtelier } from '@/components/studio/exige-atelier'
import { useState } from 'react'
import { Clapperboard, Film, Gauge } from 'lucide-react'
import { PageHeader, Tabs } from '@/components/ui/misc'
import { useStudioMode } from '@/lib/studio/api'
import { DemandesAtelier } from '@/components/studio/demandes-atelier'
import { LancerMotion } from '@/components/studio/lancer-motion'
import { Productions } from '@/components/studio/productions'

type Onglet = 'productions' | 'lancer'

export default function MotionPage() {
  const { mode } = useStudioMode()
  const [onglet, setOnglet] = useState<Onglet>(() => (typeof window !== 'undefined' && localStorage.getItem('motion-onglet') === 'lancer' ? 'lancer' : 'productions'))
  const changer = (v: Onglet) => { setOnglet(v); try { localStorage.setItem('motion-onglet', v) } catch {} }

  return (
    <div className="mx-auto w-full max-w-[1800px] p-6 max-md:p-4">
      <PageHeader icon={<Clapperboard className="size-4" />} title="Motion design" subtitle={onglet === 'lancer' ? 'Choisis le client, le type, et l\'Atelier s\'occupe du reste.' : 'Les vidéos de l\'Atelier, du lancement à la publication.'} />
      <Tabs className="mb-5" value={onglet} onChange={changer} items={[{ value: 'productions', label: 'Productions', icon: <Film className="size-3.5" /> }, { value: 'lancer', label: 'Lancer', icon: <Clapperboard className="size-3.5" /> }]} />
      {onglet === 'productions' ? <Productions /> : (
        <>
          <ExigeAtelier quoi="Une vidéo"><LancerMotion onLance={() => changer('productions')} /></ExigeAtelier>
          {mode === 'live' && (
            <section className="mt-8" aria-labelledby="motion-demandes">
              <h2 id="motion-demandes" className="mb-3 flex items-center gap-2 text-sm font-semibold"><Gauge className="size-4 text-text-3" />Demandes envoyées à l&apos;Atelier</h2>
              <DemandesAtelier onVoir={() => changer('productions')} />
            </section>
          )}
        </>
      )}
    </div>
  )
}
