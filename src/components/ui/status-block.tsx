'use client'
// Bloc « État » d'après 21st.dev « system-status-block » (14/10/2026) : une ligne par sujet, icône + nom + statut,
// date du dernier événement, et une barre de 30 jours (un trait par jour). Réutilisable (fiche client, projets Lumora…).
import { useState } from 'react'
import { AlertTriangle, ChevronDown, CircleCheck, CircleX } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Etat = 'ok' | 'attention' | 'bloque'
export type Jour = Etat | 'vide'
export type LigneEtat = { nom: string; etat: Etat; libelle: string; dernier?: string | null; jours: Jour[]; detailJours?: string[] }
export type Evenement = { date: string; texte: string; etat: Etat }

const ICONE = { ok: CircleCheck, attention: AlertTriangle, bloque: CircleX }
const COULEUR = { ok: 'text-success', attention: 'text-warning', bloque: 'text-danger' }
const TRAIT: Record<Jour, string> = { ok: 'bg-success', attention: 'bg-warning', bloque: 'bg-danger', vide: 'bg-text/10' }

export function StatusBlock({ titre, lignes, historique = [], className }: { titre: string; lignes: LigneEtat[]; historique?: Evenement[]; className?: string }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div className={cn('rounded-xl border border-border bg-surface-2/40 p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold">{titre}</h3>
        {historique.length > 0 && (
          <button onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-text-2 transition-colors hover:text-text">
            <ChevronDown className={cn('size-3.5 transition-transform', ouvert && 'rotate-180')} />Historique
          </button>
        )}
      </div>
      <ul className="space-y-4">
        {lignes.map((l) => { const I = ICONE[l.etat]
          return (
            <li key={l.nom}>
              <div className="flex items-center gap-2">
                <I className={cn('size-4 shrink-0', COULEUR[l.etat])} strokeWidth={2} />
                <span className="text-sm font-medium">{l.nom}</span>
                <span className="text-xs text-text-3">{l.libelle}</span>
                {l.dernier && <span className="ml-auto text-xs text-text-3">Dernier : {l.dernier}</span>}
              </div>
              <div className="mt-2 flex h-6 gap-[2px]" role="img" aria-label={`${l.nom} : activité des 30 derniers jours`}>
                {l.jours.map((j, i) => <span key={i} title={l.detailJours?.[i]} className={cn('w-[5px] rounded-[1px] sm:w-1.5', TRAIT[j])} />)}
              </div>
            </li>
          ) })}
      </ul>
      {ouvert && (
        <ul className="mt-5 space-y-2 border-t border-border pt-4">
          {historique.map((e, i) => { const I = ICONE[e.etat]
            return <li key={i} className="flex items-start gap-2 text-[13px]"><I className={cn('mt-0.5 size-3.5 shrink-0', COULEUR[e.etat])} /><span className="flex-1 text-text-2">{e.texte}</span><span className="shrink-0 text-xs text-text-3">{e.date}</span></li> })}
        </ul>
      )}
    </div>
  )
}
