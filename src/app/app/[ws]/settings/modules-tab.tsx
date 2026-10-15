'use client'
// Paramètres > Fonctionnalités (15/10/2026) : ajouter ou retirer des fonctionnalités de l'espace (menu et pages).
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ModulesPicker, enregistrerModules } from '@/components/modules/modules-picker'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { modulesActifs, type ModuleId } from '@/lib/modules'

export function ModulesTab() {
  const { ws, isAdmin } = useWorkspace()
  const depart = modulesActifs(ws)
  const [choix, setChoix] = useState<Set<ModuleId>>(depart)
  const [busy, setBusy] = useState(false)
  const change = [...choix].sort().join() !== [...depart].sort().join()
  async function save() {
    setBusy(true)
    try { await enregistrerModules(ws.id, [...choix]); toast.success('Fonctionnalités enregistrées'); window.location.reload() } catch { toast.error('Enregistrement impossible'); setBusy(false) }
  }
  return (
    <div className="pb-24">
      <p className="mb-5 max-w-2xl text-[13.5px] text-text-2">Coche ce que l’équipe utilise. Ce qui est décoché disparaît du menu pour tout le monde, sans rien effacer : tu peux le remettre quand tu veux.{!isAdmin && ' Seuls les administrateurs peuvent changer ce choix.'}</p>
      <ModulesPicker value={choix} onChange={setChoix} disabled={!isAdmin} />
      {isAdmin && change && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur safe-bottom md:left-[260px]">
          <div className="mx-auto flex max-w-5xl items-center justify-end gap-2 px-4 py-3">
            <span className="mr-auto text-[13px] text-text-2">Modifications non enregistrées</span>
            <Button variant="ghost" onClick={() => setChoix(depart)}>Annuler</Button>
            <Button variant="primary" loading={busy} onClick={save}>Enregistrer</Button>
          </div>
        </div>
      )}
    </div>
  )
}
