'use client'
// Import depuis Sphinx Manager (ou tout export Excel / CSV) — 15/10/2026.
// Les colonnes sont reconnues d'après leur titre (synonymes Sphinx et usuels) ; l'utilisateur peut corriger chaque correspondance.
import { parseCsv } from '@/lib/csv'
import { prochainNumero, STATUT_INITIAL, totaux, type DocKind } from '@/lib/gestion'

export type TypeImport = 'clients' | 'articles' | 'devis' | 'facture' | 'intervention'
export type Champ = { k: string; l: string; syn: string[]; requis?: boolean }

const CLIENT_DOC: Champ[] = [
  { k: 'client_code', l: 'Code client', syn: ['code client', 'code tiers', 'n client', 'num client', 'ref client', 'id client'] },
  { k: 'client_nom', l: 'Client (nom)', syn: ['client', 'nom client', 'raison sociale', 'tiers', 'nom'] },
]
export const CHAMPS: Record<TypeImport, Champ[]> = {
  clients: [
    { k: 'ref_externe', l: 'Code client', syn: ['code client', 'code tiers', 'code', 'n client', 'num client', 'id', 'ref'] },
    { k: 'company', l: 'Société / raison sociale', syn: ['raison sociale', 'societe', 'entreprise', 'company', 'denomination'] },
    { k: 'name', l: 'Nom', syn: ['nom', 'nom complet', 'contact', 'nom contact', 'client', 'name'], requis: true },
    { k: 'prenom', l: 'Prénom', syn: ['prenom', 'first name'] },
    { k: 'address', l: 'Adresse', syn: ['adresse', 'adresse 1', 'rue', 'adresse ligne 1', 'address'] },
    { k: 'address2', l: 'Complément d’adresse', syn: ['adresse 2', 'complement', 'complement adresse'] },
    { k: 'zip', l: 'Code postal', syn: ['cp', 'code postal', 'zip'] },
    { k: 'city', l: 'Ville', syn: ['ville', 'commune', 'city', 'localite'] },
    { k: 'phone', l: 'Téléphone', syn: ['telephone', 'tel', 'portable', 'mobile', 'gsm', 'phone', 'tel fixe'] },
    { k: 'email', l: 'E-mail', syn: ['email', 'e mail', 'mail', 'courriel', 'adresse mail'] },
    { k: 'siret', l: 'SIRET', syn: ['siret', 'siren', 'n siret'] },
    { k: 'notes', l: 'Notes', syn: ['notes', 'observation', 'observations', 'commentaire', 'remarque'] },
  ],
  articles: [
    { k: 'ref', l: 'Référence', syn: ['reference', 'ref', 'code article', 'code', 'ref article', 'article'] },
    { k: 'label', l: 'Désignation', syn: ['designation', 'libelle', 'description courte', 'nom', 'intitule', 'label'], requis: true },
    { k: 'description', l: 'Description', syn: ['description', 'detail', 'description longue'] },
    { k: 'category', l: 'Famille / catégorie', syn: ['famille', 'categorie', 'sous famille', 'rayon', 'type'] },
    { k: 'unit', l: 'Unité', syn: ['unite', 'u', 'unite de vente'] },
    { k: 'price_ht', l: 'Prix de vente HT', syn: ['prix de vente ht', 'pv ht', 'prix ht', 'prix unitaire ht', 'pu ht', 'tarif ht', 'prix vente', 'prix'] },
    { k: 'tva', l: 'Taux de TVA', syn: ['tva', 'taux tva', 'taux de tva', 'tva %'] },
  ],
  devis: [
    { k: 'number', l: 'N° devis', syn: ['n devis', 'numero devis', 'numero', 'n', 'num', 'reference', 'devis'] }, ...CLIENT_DOC,
    { k: 'date', l: 'Date', syn: ['date', 'date devis', 'date creation', 'date emission'] },
    { k: 'due', l: 'Validité', syn: ['validite', 'date validite', 'echeance', 'date fin validite'] },
    { k: 'title', l: 'Objet', syn: ['objet', 'libelle', 'designation', 'titre', 'chantier'] },
    { k: 'ht', l: 'Montant HT', syn: ['montant ht', 'total ht', 'ht'] }, { k: 'tva_m', l: 'Montant TVA', syn: ['montant tva', 'total tva'] },
    { k: 'ttc', l: 'Montant TTC', syn: ['montant ttc', 'total ttc', 'ttc', 'montant'] },
    { k: 'status', l: 'État', syn: ['etat', 'statut', 'status', 'situation'] },
    { k: 'signer', l: 'Signataire', syn: ['signataire', 'signe par', 'accepte par'] },
  ],
  facture: [
    { k: 'number', l: 'N° facture', syn: ['n facture', 'numero facture', 'numero', 'n', 'num', 'reference', 'facture'] }, ...CLIENT_DOC,
    { k: 'date', l: 'Date', syn: ['date', 'date facture', 'date emission'] }, { k: 'due', l: 'Échéance', syn: ['echeance', 'date echeance', 'date limite'] },
    { k: 'title', l: 'Objet', syn: ['objet', 'libelle', 'designation', 'titre'] },
    { k: 'ht', l: 'Montant HT', syn: ['montant ht', 'total ht', 'ht'] }, { k: 'tva_m', l: 'Montant TVA', syn: ['montant tva', 'total tva'] },
    { k: 'ttc', l: 'Montant TTC', syn: ['montant ttc', 'total ttc', 'ttc', 'montant'] },
    { k: 'status', l: 'État', syn: ['etat', 'statut', 'status', 'regle', 'reglement'] }, { k: 'paid', l: 'Date de paiement', syn: ['date reglement', 'date paiement', 'paye le'] },
  ],
  intervention: [
    { k: 'number', l: 'N° intervention / OI / BI', syn: ['n oi', 'n bi', 'n intervention', 'numero intervention', 'ordre intervention', 'bon intervention', 'numero', 'n', 'num', 'reference'] }, ...CLIENT_DOC,
    { k: 'date', l: 'Date prévue', syn: ['date', 'date intervention', 'date prevue', 'date debut', 'debut', 'planifie le'] },
    { k: 'end', l: 'Date de fin', syn: ['date fin', 'fin', 'termine le'] },
    { k: 'type', l: 'Type', syn: ['type', 'type intervention', 'nature', 'motif'] },
    { k: 'title', l: 'Objet', syn: ['objet', 'libelle', 'titre', 'panne', 'demande'] },
    { k: 'travaux', l: 'Description / compte rendu', syn: ['description', 'travaux', 'compte rendu', 'rapport', 'observations', 'detail'] },
    { k: 'tech', l: 'Technicien', syn: ['technicien', 'intervenant', 'tech', 'employe', 'salarie'] },
    { k: 'address', l: 'Adresse d’intervention', syn: ['adresse intervention', 'lieu', 'adresse chantier', 'adresse site', 'adresse'] },
    { k: 'status', l: 'État', syn: ['etat', 'statut', 'status'] }, { k: 'priority', l: 'Priorité', syn: ['priorite', 'urgence'] },
    { k: 'ht', l: 'Montant HT', syn: ['montant ht', 'total ht', 'ht'] }, { k: 'ttc', l: 'Montant TTC', syn: ['montant ttc', 'total ttc', 'ttc', 'montant'] },
  ],
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[°º#.:/_'’-]/g, ' ').replace(/\s+/g, ' ').trim()

/** Lit un fichier .xlsx ou .csv et renvoie les lignes (la première = titres). */
export async function lireFichier(f: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(f.name)) {
    const { readSheet } = await import('read-excel-file/browser')
    const rows = await readSheet(f)
    return rows.map((r) => r.map((c) => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c)))).filter((r) => r.some((x) => x.trim()))
  }
  if (/\.xls$/i.test(f.name)) throw new Error('Format .xls ancien : dans Excel, fais « Enregistrer sous » .xlsx ou .csv, puis réessaie.')
  const buf = await f.arrayBuffer()
  let txt = new TextDecoder('utf-8').decode(buf)
  if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf) // exports Windows (accents)
  return parseCsv(txt)
}

/** Devine la colonne de chaque champ : titre identique, sinon titre qui contient le synonyme le plus long. */
export function devinerColonnes(type: TypeImport, titres: string[]): Record<string, number> {
  const t = titres.map(norm), pris = new Set<number>(), out: Record<string, number> = {}
  for (const passe of ['exact', 'contient'] as const)
    for (const c of CHAMPS[type]) {
      if (out[c.k] !== undefined) continue
      for (const s of [...c.syn].sort((a, b) => b.length - a.length)) {
        const i = t.findIndex((x, j) => !pris.has(j) && (passe === 'exact' ? x === s : x.includes(s)))
        if (i >= 0) { out[c.k] = i; pris.add(i); break }
      }
    }
  return out
}

export const nombre = (v?: string) => { if (!v) return 0; const n = parseFloat(v.replace(/\s|€|%/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return isNaN(n) ? 0 : n }
export function dateIso(v?: string): string | null {
  if (!v?.trim()) return null
  const s = v.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000); return d.toISOString().slice(0, 10) } // numéro de série Excel
  return null
}
const heureDe = (v?: string) => v?.match(/(\d{1,2})[:h](\d{2})/)?.slice(1).map((x) => x.padStart(2, '0')).join(':') ?? null

export function statutImport(kind: DocKind, v?: string): string {
  const s = norm(v ?? '')
  if (!s) return STATUT_INITIAL[kind]
  if (kind === 'devis') return /accept|sign|valid|gagn/.test(s) ? 'accepte' : /refus|perdu|annul/.test(s) ? 'refuse' : /attente|relanc/.test(s) ? 'en_attente' : /envoy|transmis/.test(s) ? 'envoye' : 'brouillon'
  if (kind === 'facture') return /pay|regl|sold|encaiss/.test(s) ? 'payee' : /retard|impay|echu/.test(s) ? 'en_retard' : /annul|avoir/.test(s) ? 'annulee' : /envoy|emis|transmis|attente/.test(s) ? 'envoyee' : 'brouillon'
  return /termin|clotur|fini|realis|fait/.test(s) ? 'terminee' : /cours|demarr/.test(s) ? 'en_cours' : /annul/.test(s) ? 'annulee' : /planif|prevu|affect/.test(s) ? 'planifiee' : 'a_planifier'
}

type Ctx = {
  wsId: string; userId: string
  fiches: { id: string; name: string; company: string | null; ref_externe?: string | null }[]
  articles: { ref: string | null; label: string }[]
  numeros: Record<DocKind, string[]>
  membres: { user_id: string; nom: string }[]
}
export type Prepare = { table: 'crm_contacts' | 'gestion_articles' | 'gestion_documents'; rows: Record<string, unknown>[]; ignores: number; clientsACreer: { cle: string; name: string; ref_externe: string | null }[] }

/** Transforme les lignes du fichier en lignes prêtes pour la base ; les doublons (même code / référence / numéro) sont ignorés. */
export function preparer(type: TypeImport, data: string[][], col: Record<string, number>, ctx: Ctx): Prepare {
  const g = (r: string[], k: string) => (col[k] !== undefined && col[k] >= 0 ? (r[col[k]] ?? '').trim() : '')
  const corps = data.slice(1)
  let ignores = 0
  if (type === 'clients') {
    const vus = new Set(ctx.fiches.map((f) => f.ref_externe).filter(Boolean))
    const rows = corps.flatMap((r) => {
      const nom = [g(r, 'prenom'), g(r, 'name')].filter(Boolean).join(' ') || g(r, 'company'), ref = g(r, 'ref_externe') || null
      if (!nom || (ref && vus.has(ref))) { ignores++; return [] }
      if (ref) vus.add(ref)
      const pro = !!g(r, 'company') || !!g(r, 'siret')
      return [{ workspace_id: ctx.wsId, created_by: ctx.userId, status: 'customer', name: nom, company: g(r, 'company') || null, kind: pro ? 'pro' : 'particulier', ref_externe: ref,
        address: [g(r, 'address'), g(r, 'address2')].filter(Boolean).join(', ') || null, zip: g(r, 'zip') || null, city: g(r, 'city') || null, phone: g(r, 'phone') || null, email: g(r, 'email') || null, siret: g(r, 'siret') || null, notes: g(r, 'notes') || null }]
    })
    return { table: 'crm_contacts', rows, ignores, clientsACreer: [] }
  }
  if (type === 'articles') {
    const vus = new Set(ctx.articles.map((a) => (a.ref || a.label).toLowerCase()))
    const rows = corps.flatMap((r) => {
      const label = g(r, 'label'), ref = g(r, 'ref'), cle = (ref || label).toLowerCase()
      if (!label || vus.has(cle)) { ignores++; return [] }
      vus.add(cle)
      const tva = g(r, 'tva') ? nombre(g(r, 'tva')) : 20
      return [{ workspace_id: ctx.wsId, created_by: ctx.userId, ref: ref || null, ref_externe: ref || null, label, description: g(r, 'description') || null, category: g(r, 'category') || null, unit: g(r, 'unit') || 'u', price_ht: nombre(g(r, 'price_ht')), tva: tva > 0 && tva < 1 ? tva * 100 : tva }]
    })
    return { table: 'gestion_articles', rows, ignores, clientsACreer: [] }
  }
  // devis, factures, interventions
  const kind = type as DocKind
  const pris = new Set(ctx.numeros[kind]), numeros = [...ctx.numeros[kind]]
  const clientsACreer = new Map<string, { cle: string; name: string; ref_externe: string | null }>()
  const trouverClient = (code: string, nom: string) => {
    const f = (code && ctx.fiches.find((x) => x.ref_externe === code)) || (nom && ctx.fiches.find((x) => [x.name, x.company].some((v) => v && norm(v) === norm(nom))))
    if (f) return f.id
    if (!nom && !code) return null
    const cle = code || norm(nom)
    clientsACreer.set(cle, { cle, name: nom || code, ref_externe: code || null })
    return `@${cle}` // remplacé par l'id une fois le client créé
  }
  const rows = corps.flatMap((r) => {
    const num = g(r, 'number')
    if (num && pris.has(num)) { ignores++; return [] }
    const number = num || prochainNumero(kind, numeros); numeros.push(number); pris.add(number)
    const ht = nombre(g(r, 'ht')), ttc = nombre(g(r, 'ttc')), tvaM = nombre(g(r, 'tva_m'))
    const totalHt = ht || (ttc ? Math.round((ttc / 1.2) * 100) / 100 : 0), totalTtc = ttc || (ht ? Math.round((ht + (tvaM || ht * 0.2)) * 100) / 100 : 0)
    const taux = totalHt ? Math.round(((totalTtc - totalHt) / totalHt) * 1000) / 10 : 20
    const lines = totalHt ? [{ label: g(r, 'title') || (kind === 'intervention' ? g(r, 'type') || 'Intervention' : 'Prestation'), qty: 1, unit: 'forfait', price_ht: totalHt, tva: taux }] : []
    const t = totaux(lines)
    const date = dateIso(g(r, 'date')) ?? new Date().toISOString().slice(0, 10)
    const status = statutImport(kind, g(r, 'status'))
    const tech = g(r, 'tech') ? ctx.membres.find((m) => norm(m.nom).includes(norm(g(r, 'tech'))) || norm(g(r, 'tech')).includes(norm(m.nom).split(' ')[0] ?? '')) : null
    const h = heureDe(g(r, 'date'))
    const debut = kind === 'intervention' && dateIso(g(r, 'date')) ? new Date(`${date}T${h ?? '09:00'}:00`).toISOString() : null
    const fin = kind === 'intervention' && dateIso(g(r, 'end')) ? new Date(`${dateIso(g(r, 'end'))}T${heureDe(g(r, 'end')) ?? '18:00'}:00`).toISOString() : null
    return [{
      workspace_id: ctx.wsId, created_by: ctx.userId, kind, number, ref_externe: num || null, contact_id: trouverClient(g(r, 'client_code'), g(r, 'client_nom')),
      title: g(r, 'title') || null, status, issued_at: date, due_at: dateIso(g(r, 'due')), lines, total_ht: t.ht, total_tva: t.tva, total_ttc: t.ttc,
      intervention_type: kind === 'intervention' ? g(r, 'type') || null : null, travaux: g(r, 'travaux') || null, address: g(r, 'address') || null,
      priority: /urg/.test(norm(g(r, 'priority'))) ? 'urgente' : /haut|eleve/.test(norm(g(r, 'priority'))) ? 'haute' : 'normale',
      start_at: debut, end_at: fin, assigned_to: tech ? [tech.user_id] : [], signer_name: g(r, 'signer') || null,
      paid_at: kind === 'facture' ? dateIso(g(r, 'paid')) : null, closed_at: kind === 'intervention' && status === 'terminee' ? (fin ?? debut ?? new Date(date).toISOString()) : null,
      notes: tech ? null : g(r, 'tech') ? `Technicien d’origine : ${g(r, 'tech')}` : null,
    }]
  })
  return { table: 'gestion_documents', rows, ignores, clientsACreer: [...clientsACreer.values()] }
}
