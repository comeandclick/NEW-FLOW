'use client'
// Tâches et événements créés par la gestion (15/10/2026) : leur description contient le chemin de la fiche
// (devis, facture, intervention) ; ce bouton y ramène d'un clic depuis Tâches ou le Calendrier.
import Link from 'next/link'
import { ArrowUpRight, FileSignature, Receipt, Wrench } from 'lucide-react'

export function LienGestion({ texte, onNavigate }: { texte?: string | null; onNavigate?: () => void }) {
  const m = texte?.match(/\/app\/[\w-]+\/gestion\/(devis|factures|interventions|scan)\?id=[0-9a-f-]{36}/)
  if (!m) return null
  const [lib, I] = m[1] === 'devis' ? ['Ouvrir le devis', FileSignature] as const : m[1] === 'interventions' ? ['Ouvrir l’intervention', Wrench] as const : ['Ouvrir la facture', Receipt] as const
  return <Link href={m[0]} onClick={onNavigate} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/60 px-3 py-1.5 text-[13px] font-medium transition-colors hover:border-border-strong"><I className="size-4 text-text-3" />{lib}<ArrowUpRight className="size-3.5 text-text-3" /></Link>
}
