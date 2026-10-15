'use client'
// La gestion alimente l'espace de base (15/10/2026) : chaque document de gestion a sa tâche dans Tâches, son événement
// dans le Calendrier, son PDF dans Fichiers (dossier Gestion) ; chaque fiche client a son espace dans Clients.
// Tout se met à jour à chaque enregistrement (dates, état, intervenants) et part à la corbeille avec le document.
import { getDb } from '@/lib/supabase/client'
import { newClientToken } from '@/lib/clients'
import { NOM_KIND, eur, type Entreprise, type Fiche, type GDoc } from '@/lib/gestion'
import type { ContextePdf } from '@/lib/gestion-pdf'

let slugCourant = ''
/** chemin de la fiche du document, mis dans la description de sa tâche et de son événement */
const fiche = (d: GDoc) => (slugCourant ? `Fiche : /app/${slugCourant}/gestion/${d.kind === 'devis' ? 'devis' : d.kind === 'facture' ? 'factures' : d.kind === 'intervention' ? 'interventions' : 'scan'}?id=${d.id}` : '')
/** slug de l'espace, pour le lien vers la fiche dans la description de l'événement */
export const definirEspace = (slug: string) => { slugCourant = slug }

type Ctx = { wsId: string; userId: string; client?: Fiche | null; entreprise: Entreprise; pdf?: ContextePdf }
const nomClient = (c?: Fiche | null) => c?.company || c?.name || ''
export const DOSSIER: Record<GDoc['kind'], string> = { devis: '/Gestion/Devis', facture: '/Gestion/Factures', intervention: '/Gestion/Ordres de mission', achat: '/Gestion/Factures reçues' }

/** Ce que le document doit avoir comme tâche / événement, ou null. */
function attendus(d: GDoc, c?: Fiche | null) {
  const qui = nomClient(c)
  const ferme = d.deleted_at || ['annulee', 'annule'].includes(d.status)
  if (d.kind === 'intervention') {
    if (ferme || !d.start_at) return { tache: ferme ? null : d.status !== 'annulee' ? tacheInter(d, qui) : null, evt: null }
    const fin = d.end_at ?? new Date(new Date(d.start_at).getTime() + 2 * 3600_000).toISOString()
    return { tache: tacheInter(d, qui), evt: { title: `${d.intervention_type ?? 'Intervention'} · ${qui || d.title || ''} (${d.number})`, start_at: d.start_at, end_at: fin, all_day: false, location: d.address || c?.address || null, attendees: d.assigned_to ?? [], description: [d.travaux, c?.phone && `Tél. ${c.phone}`, fiche(d)].filter(Boolean).join('\n') || null } }
  }
  if (d.kind === 'devis') {
    const ouvert = ['envoye', 'en_attente'].includes(d.status)
    const relance = d.due_at ?? (d.sent_at ? new Date(new Date(d.sent_at).getTime() + 7 * 864e5).toISOString().slice(0, 10) : null)
    return {
      tache: ferme || d.status === 'brouillon' ? null : { title: `Relancer le devis ${d.number}${qui ? ` · ${qui}` : ''} (${eur(d.total_ttc)})`, due_date: relance, status: ouvert ? 'todo' : 'done', priority: 'medium', assignee_id: d.created_by, description: [d.title, fiche(d)].filter(Boolean).join('\n') || null },
      evt: ferme || !ouvert || !d.due_at ? null : { title: `Fin de validité du devis ${d.number}${qui ? ` · ${qui}` : ''}`, start_at: new Date(`${d.due_at}T09:00:00`).toISOString(), end_at: new Date(`${d.due_at}T09:30:00`).toISOString(), all_day: true, location: null, attendees: d.created_by ? [d.created_by] : [], description: [d.title, fiche(d)].filter(Boolean).join('\n') || null },
    }
  }
  if (d.kind === 'facture' || d.kind === 'achat') {
    const reglee = d.status === 'payee' || !!d.paid_at
    const active = !ferme && d.status !== 'brouillon' && !!d.due_at
    const verbe = d.kind === 'achat' ? 'Régler' : 'Encaisser'
    return {
      tache: !active ? null : { title: `${verbe} ${d.kind === 'achat' ? (d.title ?? 'la facture') : `la facture ${d.number}${qui ? ` · ${qui}` : ''}`} (${eur(d.total_ttc)})`, due_date: d.due_at, status: reglee ? 'done' : 'todo', priority: d.status === 'en_retard' ? 'high' : 'medium', assignee_id: d.created_by, description: [d.title, fiche(d)].filter(Boolean).join('\n') || null },
      evt: !active || reglee ? null : { title: `Échéance ${d.kind === 'achat' ? (d.title ?? 'facture reçue') : `facture ${d.number}${qui ? ` · ${qui}` : ''}`} · ${eur(d.total_ttc)}`, start_at: new Date(`${d.due_at}T09:00:00`).toISOString(), end_at: new Date(`${d.due_at}T09:30:00`).toISOString(), all_day: true, location: null, attendees: d.created_by ? [d.created_by] : [], description: fiche(d) || null },
    }
  }
  return { tache: null, evt: null }
}
function tacheInter(d: GDoc, qui: string) {
  return {
    title: `${d.intervention_type ?? 'Intervention'} · ${qui || d.title || ''} (${d.number})`, due_date: d.start_at?.slice(0, 10) ?? null,
    status: d.closed_at || d.status === 'terminee' ? 'done' : d.status === 'en_cours' ? 'in_progress' : 'todo',
    priority: d.priority === 'urgente' ? 'urgent' : d.priority === 'haute' ? 'high' : 'medium', assignee_id: d.assigned_to?.[0] ?? null,
    description: [d.title, d.travaux, d.address, fiche(d)].filter(Boolean).join('\n') || null,
  }
}

/** Met la tâche et l'événement liés au document en accord avec lui. Renvoie les liens à garder sur le document. */
export async function synchroniser(d: GDoc, ctx: Ctx): Promise<{ task_id: string | null; event_id: string | null }> {
  const db = getDb()
  const a = attendus(d, ctx.client)
  const now = new Date().toISOString()
  let task_id = d.task_id, event_id = d.event_id
  try {
    if (a.tache) {
      const row = { ...a.tache, completed_at: a.tache.status === 'done' ? now : null, tags: ['gestion', d.kind] }
      if (task_id) await db.from('tasks').update({ ...row, deleted_at: null }).eq('id', task_id)
      else { const r = await db.from('tasks').insert({ ...row, workspace_id: ctx.wsId, created_by: ctx.userId }).select('id').single(); task_id = (r.data as { id: string } | null)?.id ?? null }
    } else if (task_id && (d.deleted_at || d.status === 'annulee')) { await db.from('tasks').update({ deleted_at: now }).eq('id', task_id); task_id = null }
    if (a.evt) {
      if (event_id) await db.from('events').update({ ...a.evt, task_id, deleted_at: null }).eq('id', event_id)
      else { const r = await db.from('events').insert({ ...a.evt, task_id, workspace_id: ctx.wsId, created_by: ctx.userId }).select('id').single(); event_id = (r.data as { id: string } | null)?.id ?? null }
    } else if (event_id) { await db.from('events').update({ deleted_at: now }).eq('id', event_id); event_id = null }
  } catch { /* la synchronisation ne bloque jamais l'enregistrement du document */ }
  if (d.kind === 'devis') void opportunite(d, ctx)
  if (task_id !== d.task_id || event_id !== d.event_id) await db.from('gestion_documents').update({ task_id, event_id }).eq('id', d.id)
  // le PDF part dans Fichiers > Gestion > <type> même si les infos de l'entreprise sont incomplètes (copie de travail)
  if (!d.deleted_at && d.kind !== 'achat' && ctx.pdf) void rangerPdf(d, ctx)
  if (d.deleted_at) void retirerFichier(d)
  return { task_id, event_id }
}

const cheminPdf = (d: GDoc) => `${d.workspace_id}/gestion/${d.id}.pdf`
/** Le PDF à jour du document dans Fichiers (remplacé à chaque enregistrement, même nom de fichier). */
export async function rangerPdf(d: GDoc, ctx: Ctx) {
  if (!ctx.pdf) return
  try {
    const { creerPdf } = await import('@/lib/gestion-pdf')
    const blob = (await creerPdf(d, ctx.pdf, true)).output('blob')
    const db = getDb(), path = cheminPdf(d)
    await db.storage.from('files').remove([path]) // pas de droit de remplacement : on retire puis on dépose
    const up = await db.storage.from('files').upload(path, blob, { contentType: 'application/pdf' })
    if (up.error) return
    const nom = `${d.kind === 'intervention' ? 'Ordre de mission' : NOM_KIND[d.kind]} ${d.number}${nomClient(ctx.client) ? ` - ${nomClient(ctx.client)}` : ''}.pdf`.replace(/[/\\]/g, '-')
    const { data: deja } = await db.from('files').select('id').eq('workspace_id', d.workspace_id).eq('storage_path', path).maybeSingle()
    const row = { name: nom, folder: DOSSIER[d.kind], size: blob.size, mime_type: 'application/pdf', deleted_at: null }
    if (deja) await db.from('files').update(row).eq('id', (deja as { id: string }).id)
    else await db.from('files').insert({ ...row, workspace_id: d.workspace_id, storage_path: path, uploaded_by: ctx.userId })
  } catch { /* PDF facultatif */ }
}
async function retirerFichier(d: GDoc) {
  await getDb().from('files').update({ deleted_at: new Date().toISOString() }).eq('workspace_id', d.workspace_id).in('storage_path', [cheminPdf(d), d.file_path ?? '-'])
}

/** Une facture reçue (photo, PDF) déposée pour l'IA apparaît aussi dans Fichiers > Gestion > Factures reçues. */
export async function enregistrerFichier(wsId: string, userId: string, path: string, f: File, sens: GDoc['kind']) {
  await getDb().from('files').insert({ workspace_id: wsId, folder: DOSSIER[sens], name: f.name, size: f.size, mime_type: f.type || null, storage_path: path, uploaded_by: userId })
}

/** Chaque fiche client de la gestion a aussi son espace dans Clients (même nom), créé une seule fois. */
export async function espaceClient(wsId: string, userId: string, fiches: { name: string; company?: string | null; notes?: string | null }[]) {
  if (!fiches.length) return
  const db = getDb()
  const { data } = await db.from('clients').select('name').eq('workspace_id', wsId).is('deleted_at', null)
  const pris = new Set(((data ?? []) as { name: string }[]).map((c) => c.name.trim().toLowerCase()))
  const now = new Date().toISOString()
  const nouveaux = fiches.filter((f) => { const k = f.name.trim().toLowerCase(); if (!k || pris.has(k)) return false; pris.add(k); return true })
  for (let i = 0; i < nouveaux.length; i += 300)
    await db.from('clients').insert(nouveaux.slice(i, i + 300).map((f) => ({ workspace_id: wsId, name: f.name.trim(), company: f.company ?? null, notes: f.notes ?? null, cadence: 'on_demand', access_token: newClientToken(), created_by: userId, color: null, token_rotated_at: now, created_at: now, updated_at: now, deleted_at: null })))
}

/** Rattrapage : documents ouverts créés avant la synchronisation (sans tâche ni événement) — une fois par session et par espace. */
const rattrapes = new Set<string>()
export async function rattraper(docs: GDoc[], fiches: Fiche[], ctx: Omit<Ctx, 'client'>) {
  if (rattrapes.has(ctx.wsId) || !docs.length) return
  rattrapes.add(ctx.wsId)
  const a = docs.filter((d) => !d.task_id && !d.event_id && ((d.kind === 'intervention' && !d.closed_at && d.status !== 'annulee') || (d.kind === 'facture' && !['payee', 'annulee', 'brouillon'].includes(d.status) && d.due_at) || (d.kind === 'devis' && ['envoye', 'en_attente'].includes(d.status))))
  for (const d of a.slice(0, 200)) await synchroniser(d, { ...ctx, client: fiches.find((f) => f.id === d.contact_id) ?? null, pdf: undefined })
}

/** Un devis est aussi une opportunité du CRM (pipeline) : proposition, puis gagné ou perdu selon la réponse du client. */
async function opportunite(d: GDoc, ctx: Ctx) {
  try {
    const db = getDb(), titre = `Devis ${d.number}`
    const { data: deja } = await db.from('crm_deals').select('id').eq('workspace_id', d.workspace_id).eq('title', titre).maybeSingle()
    const stage = d.status === 'accepte' ? 'gagné' : d.status === 'refuse' ? 'perdu' : d.status === 'brouillon' ? 'qualification' : 'proposition'
    const row = { contact_id: d.contact_id, value: Number(d.total_ht), stage, probability: stage === 'gagné' ? 100 : stage === 'perdu' ? 0 : stage === 'proposition' ? 50 : 25, close_date: d.due_at, deleted_at: d.deleted_at }
    if (deja) await db.from('crm_deals').update(row).eq('id', (deja as { id: string }).id)
    else if (!d.deleted_at) await db.from('crm_deals').insert({ ...row, workspace_id: d.workspace_id, title: titre, created_by: ctx.userId, position: Date.now() / 1e12 })
  } catch { /* le CRM est un plus, jamais bloquant */ }
}
