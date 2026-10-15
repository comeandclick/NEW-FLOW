'use client'
// Juste après la création de l'espace (15/10/2026) : on choisit les fonctionnalités qu'on va utiliser.
// Modifiable ensuite dans Paramètres > Fonctionnalités.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { ModulesPicker, enregistrerModules } from '@/components/modules/modules-picker'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { TOUS_MODULES, type ModuleId } from '@/lib/modules'

const PAR_DEFAUT: ModuleId[] = ['messages', 'notes', 'files', 'goals']

export default function BienvenuePage() {
  const { ws, isAdmin, members } = useWorkspace()
  const charge = members.length > 0 // le rôle n'est connu qu'une fois les membres chargés
  const router = useRouter()
  const [choix, setChoix] = useState<Set<ModuleId>>(() => new Set(PAR_DEFAUT))
  const [busy, setBusy] = useState(false)

  async function valider(liste: ModuleId[]) {
    setBusy(true)
    try { await enregistrerModules(ws.id, liste); window.location.replace(`/app/${ws.slug}`) } catch { toast.error('Enregistrement impossible, réessaie.'); setBusy(false) }
  }
  useEffect(() => { if (charge && !isAdmin) router.replace(`/app/${ws.slug}`) }, [charge, isAdmin, router, ws.slug])
  if (!charge || !isAdmin) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg">
      <div className="mx-auto w-full max-w-6xl px-4 pb-32 pt-8 sm:px-6 sm:pt-12">
        <Logo size={32} className="mb-6" />
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Qu’est-ce que tu vas utiliser ?</h1>
        <p className="mt-2 max-w-xl text-[14px] text-text-2">Choisis les fonctionnalités de <b>{ws.name}</b>. Les tâches, le calendrier et l’accueil sont toujours là. Tu pourras en ajouter ou en retirer quand tu veux dans Paramètres.</p>
        <div className="mt-8"><ModulesPicker value={choix} onChange={setChoix} /></div>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/95 backdrop-blur safe-bottom">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          <span className="mr-auto text-[13px] text-text-2">{choix.size} fonctionnalité{choix.size > 1 ? 's' : ''} choisie{choix.size > 1 ? 's' : ''}</span>
          <Button variant="ghost" disabled={busy} onClick={() => valider(TOUS_MODULES)}>Tout prendre</Button>
          <Button variant="primary" loading={busy} onClick={() => valider([...choix])}>Continuer<ArrowRight className="size-4" /></Button>
        </div>
      </div>
    </div>
  )
}
