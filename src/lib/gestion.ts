// Module Gestion (15/10/2026) : devis, factures, interventions (ordres de mission), factures reçues lues par l'IA.
// Une seule table gestion_documents (kind) pour tout voir par client, par membre et dans le temps.
import type { Workspace } from '@/lib/types'

export type DocKind = 'devis' | 'facture' | 'intervention' | 'achat'
export type Ligne = { article_id?: string | null; ref?: string; label: string; qty: number; unit?: string; price_ht: number; tva: number }
export type GDoc = {
  id: string; workspace_id: string; kind: DocKind; number: string; ref_externe: string | null; contact_id: string | null; parent_id: string | null
  title: string | null; status: string; intervention_type: string | null; priority: string
  issued_at: string; due_at: string | null; start_at: string | null; end_at: string | null; address: string | null
  lines: Ligne[]; discount: number; total_ht: number; total_tva: number; total_ttc: number
  travaux: string | null; notes: string | null; assigned_to: string[]; task_id: string | null; event_id: string | null
  signer_name: string | null; signature: string | null; signed_at: string | null; signed_via: string | null; decided_by: string | null; decided_at: string | null
  public_token: string | null; sent_at: string | null; sent_to: string | null; paid_at: string | null
  closed_at: string | null; closed_by: string | null; file_path: string | null; ai_data: Record<string, unknown> | null
  created_by: string | null; updated_by: string | null; created_at: string; updated_at: string; deleted_at: string | null
}
export type Article = { id: string; workspace_id: string; ref: string | null; label: string; description: string | null; category: string | null; unit: string; price_ht: number; tva: number; ref_externe: string | null; deleted_at: string | null }
export type Fiche = {
  id: string; workspace_id: string; name: string; email: string | null; phone: string | null; company: string | null; position: string | null
  status: string; tags: string[]; notes: string | null; kind?: string; address?: string | null; zip?: string | null; city?: string | null; siret?: string | null; ref_externe?: string | null; deleted_at: string | null
}

export const PREFIXE: Record<DocKind, string> = { devis: 'DE', facture: 'FA', intervention: 'IN', achat: 'AC' }
export const NOM_KIND: Record<DocKind, string> = { devis: 'Devis', facture: 'Facture', intervention: 'Intervention', achat: 'Facture reçue' }

export const STATUTS: Record<DocKind, { v: string; l: string; c: string }[]> = {
  devis: [
    { v: 'brouillon', l: 'Brouillon', c: 'var(--text-3)' }, { v: 'envoye', l: 'Envoyé', c: 'var(--info)' }, { v: 'en_attente', l: 'En attente', c: 'var(--warning)' },
    { v: 'accepte', l: 'Accepté', c: 'var(--success)' }, { v: 'refuse', l: 'Refusé', c: 'var(--danger)' },
  ],
  facture: [
    { v: 'brouillon', l: 'Brouillon', c: 'var(--text-3)' }, { v: 'envoyee', l: 'Envoyée', c: 'var(--info)' }, { v: 'payee', l: 'Payée', c: 'var(--success)' },
    { v: 'en_retard', l: 'En retard', c: 'var(--danger)' }, { v: 'annulee', l: 'Annulée', c: 'var(--text-3)' },
  ],
  intervention: [
    { v: 'a_planifier', l: 'À planifier', c: 'var(--text-3)' }, { v: 'planifiee', l: 'Planifiée', c: 'var(--info)' }, { v: 'en_cours', l: 'En cours', c: 'var(--warning)' },
    { v: 'terminee', l: 'Terminée', c: 'var(--success)' }, { v: 'annulee', l: 'Annulée', c: 'var(--danger)' },
  ],
  achat: [{ v: 'a_verifier', l: 'À vérifier', c: 'var(--warning)' }, { v: 'valide', l: 'Validée', c: 'var(--info)' }, { v: 'payee', l: 'Payée', c: 'var(--success)' }],
}
export const statutDe = (kind: DocKind, v: string) => STATUTS[kind].find((s) => s.v === v) ?? { v, l: v, c: 'var(--text-3)' }
export const STATUT_INITIAL: Record<DocKind, string> = { devis: 'brouillon', facture: 'brouillon', intervention: 'a_planifier', achat: 'a_verifier' }

export const TYPES_INTERVENTION_DEFAUT = ['Dépannage', 'Installation', 'Désinstallation', 'Entretien', 'Mise en service', 'Diagnostic']
export const PRIORITES = [{ v: 'basse', l: 'Basse' }, { v: 'normale', l: 'Normale' }, { v: 'haute', l: 'Haute' }, { v: 'urgente', l: 'Urgente' }]

export type Entreprise = {
  nom?: string; forme?: string; adresse?: string; cp?: string; ville?: string; siret?: string; tva_intra?: string; rcs?: string; capital?: string
  tel?: string; email?: string; site?: string; iban?: string; bic?: string; conditions?: string; mentions?: string; validite_jours?: number; tva_defaut?: number
}
export const entrepriseDe = (ws: Pick<Workspace, 'settings'>): Entreprise => ((ws.settings as { entreprise?: Entreprise })?.entreprise ?? {})
/** Champs indispensables sur un devis / une facture : sans eux, pas de PDF. */
export const CHAMPS_OBLIGATOIRES: [keyof Entreprise, string][] = [['nom', 'Nom de l’entreprise'], ['adresse', 'Adresse'], ['cp', 'Code postal'], ['ville', 'Ville'], ['siret', 'SIRET'], ['email', 'E-mail']]
export const entrepriseManque = (e: Entreprise) => CHAMPS_OBLIGATOIRES.filter(([k]) => !String(e[k] ?? '').trim()).map(([, l]) => l)

export const typesIntervention = (ws: Pick<Workspace, 'settings'>): string[] => {
  const l = (ws.settings as { gestion?: { types_intervention?: string[] } })?.gestion?.types_intervention
  return Array.isArray(l) && l.length ? l : TYPES_INTERVENTION_DEFAUT
}

const r2 = (n: number) => Math.round(n * 100) / 100
export function totaux(lines: Ligne[], discount = 0) {
  const k = 1 - (Number(discount) || 0) / 100
  let ht = 0, tva = 0
  const parTaux: Record<string, { base: number; tva: number }> = {}
  for (const l of lines) {
    const base = (Number(l.qty) || 0) * (Number(l.price_ht) || 0) * k
    const t = base * (Number(l.tva) || 0) / 100
    ht += base; tva += t
    const key = String(Number(l.tva) || 0); parTaux[key] ??= { base: 0, tva: 0 }; parTaux[key].base += base; parTaux[key].tva += t
  }
  return { ht: r2(ht), tva: r2(tva), ttc: r2(ht + tva), parTaux }
}

export const eur = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)

/** Prochain numéro de l'année : DE-2026-0001, d'après les numéros déjà pris (la base refuse un doublon). */
export function prochainNumero(kind: DocKind, existants: string[], annee = new Date().getFullYear()) {
  const pre = `${PREFIXE[kind]}-${annee}-`
  const max = existants.filter((n) => n.startsWith(pre)).map((n) => parseInt(n.slice(pre.length), 10)).filter((n) => !isNaN(n)).reduce((a, b) => Math.max(a, b), 0)
  return `${pre}${String(max + 1).padStart(4, '0')}`
}

/** Erreur « table absente » : la migration supabase/2026-10-15-gestion.sql n'est pas encore passée. */
export const migrationManquante = (err?: string | null) => !!err && /gestion_|schema cache|does not exist|404/i.test(err)
