'use client'
// Site (14/10/2026) : « Projets » (sites suivis par le logiciel Atelier du Mac, pensé pour l'iPhone) et « Lancer » (nouveau site :
// client → type → description ; la demande part vers l'Atelier, qui l'écrit dans le terminal d'un agent Claude Code).
// L'ancienne page de Flow Studio (entretien, Figma…) est remplacée : l'agent part du coffre Obsidian et du skill site-creation.
import { ExigeAtelier } from '@/components/studio/exige-atelier'
import { useState } from 'react'
import { Gauge, Globe, Rocket } from 'lucide-react'
import { PageHeader, Tabs } from '@/components/ui/misc'
import { useStudioMode } from '@/lib/studio/api'
import { DemandesAtelier } from '@/components/studio/demandes-atelier'
import { LancerSite } from '@/components/studio/lancer-site'
import { SiteProjets } from '@/components/studio/site-projets'

type Onglet = 'projets' | 'lancer'

export default function SitePage() {
  const { mode } = useStudioMode()
  const [onglet, setOnglet] = useState<Onglet>(() => (typeof window !== 'undefined' && localStorage.getItem('site-onglet') === 'lancer' ? 'lancer' : 'projets'))
  const changer = (v: Onglet) => { setOnglet(v); try { localStorage.setItem('site-onglet', v) } catch {} }

  return (
    <div className="mx-auto w-full max-w-[1800px] p-6 max-md:p-4">
      <PageHeader icon={<Globe className="size-4" />} title="Création de site" subtitle={onglet === 'lancer' ? 'Décris le site : l\'Atelier le confie à un agent et tu suis tout en direct.' : 'Les sites de l\'Atelier, de la demande à la mise en ligne.'} />
      <Tabs className="mb-5" value={onglet} onChange={changer} items={[{ value: 'projets', label: 'Projets', icon: <Globe className="size-3.5" /> }, { value: 'lancer', label: 'Lancer', icon: <Rocket className="size-3.5" /> }]} />
      {onglet === 'projets' ? <SiteProjets onLancer={() => changer('lancer')} /> : (
        <>
          <ExigeAtelier quoi="Un site"><LancerSite onLance={() => changer('projets')} /></ExigeAtelier>
          {mode === 'live' && (
            <section className="mt-8" aria-labelledby="site-demandes">
              <h2 id="site-demandes" className="mb-3 flex items-center gap-2 text-sm font-semibold"><Gauge className="size-4 text-text-3" />Demandes envoyées à l&apos;Atelier</h2>
              <DemandesAtelier kind="site" onVoir={() => changer('projets')} />
            </section>
          )}
        </>
      )}
    </div>
  )
}
