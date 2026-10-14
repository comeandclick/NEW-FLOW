'use client'
// Aucune création (motion, site) sans Mac relié (14/10/2026) : tant qu'aucun Mac avec l'Atelier n'est relié au compte,
// le formulaire « Lancer » est remplacé par cette carte, qui explique quoi faire et mène à la liaison.
import Link from 'next/link'
import { Laptop } from 'lucide-react'
import { useWorkspace } from '@/lib/hooks/use-workspace'
import { studioApi, usePoll, useStudioMode } from '@/lib/studio/api'

export function ExigeAtelier({ children, quoi }: { children: React.ReactNode; quoi: string }) {
  const { ws } = useWorkspace()
  const { mode } = useStudioMode()
  const devs = usePoll(studioApi.devices, 15000, mode === 'live')
  if (mode !== 'live' || !devs.data || devs.data.devices.length > 0) return <>{children}</>
  return (
    <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-sm sm:p-10">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-surface-2"><Laptop className="size-5 text-text-2" strokeWidth={1.75} /></span>
      <h3 className="mt-4 text-lg font-semibold tracking-tight">Relie d&apos;abord un Mac avec l&apos;Atelier</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-2">{quoi} est fabriqué sur ton Mac par le logiciel Atelier, avec Claude Code et Remotion. Sans Mac relié, la demande ne pourrait pas partir.</p>
      <ol className="mx-auto mt-6 max-w-sm space-y-2.5 text-left text-[13.5px] text-text-2">
        {['Ouvre l\'Atelier sur ton Mac (il vérifie et installe Claude Code, Remotion et ffmpeg).', 'Paramètres → Flow → « Relier à Flow » : un code s\'affiche.', 'Tape ce code dans Flow → Paramètres → Atelier (Mac).'].map((x, i) => (
          <li key={i} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-text text-xs font-semibold text-bg">{i + 1}</span><span className="pt-0.5">{x}</span></li>
        ))}
      </ol>
      <Link href={`/app/${ws.slug}/settings?tab=studio`} className="mt-7 inline-flex h-10 items-center rounded-md bg-text px-5 text-sm font-medium text-bg transition-opacity hover:opacity-90">Relier mon Mac</Link>
    </div>
  )
}
