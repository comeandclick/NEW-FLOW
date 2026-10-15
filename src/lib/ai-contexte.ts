import 'server-only'
// Ce que l'assistant voit de l'espace (14/10/2026) : lu côté serveur avec la session de l'utilisateur (ses droits, RLS),
// toujours à jour, résumé en JSON compact : tâches, agenda, clients, discussions, fichiers, activité, objectifs, CRM,
// notes, projets, temps de focus, productions de l'Atelier, membres et agents IA (avec leur disponibilité).
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminDb } from '@/lib/supabase/server'
import { texteDeNote } from '@/lib/client-notes'

const court = (t: unknown, n = 140) => (typeof t === 'string' ? (t.length > n ? t.slice(0, n) + '…' : t) : t)
const jourIso = (d: Date) => d.toISOString()

const sansAccents = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
/** La question parle-t-elle de ce titre ? (« la note Organisation : agents… », « où en est MyUstadh ») */
function cite(question: string, titre: string) {
  const q = sansAccents(question), t = sansAccents(titre).replace(/^.*? · /, '')
  if (t.length > 3 && q.includes(t)) return true
  const mots = t.split(/[^a-z0-9]+/).filter((m) => m.length >= 4)
  return mots.length > 0 && mots.filter((m) => q.includes(m)).length / mots.length >= 0.6
}

export async function contexteEspace(db: SupabaseClient, wsId: string, userId: string, question = '') {
  const maintenant = new Date(), dans14 = new Date(Date.now() + 14 * 864e5), il7 = new Date(Date.now() - 7 * 864e5), aube = new Date(); aube.setHours(0, 0, 0, 0)
  const r = await Promise.all([
    db.from('workspaces').select('name').eq('id', wsId).maybeSingle(),
    db.from('workspace_members').select('user_id,role,profile:profiles!workspace_members_user_id_fkey(full_name,email,preferences)').eq('workspace_id', wsId),
    db.from('tasks').select('id,title,status,priority,due_date,assignee_id,project_id,completed_at,tags,created_by').eq('workspace_id', wsId).is('deleted_at', null).order('due_date', { ascending: true, nullsFirst: false }).limit(150),
    db.from('events').select('id,title,start_at,end_at,location,description,attendees').eq('workspace_id', wsId).is('deleted_at', null).gte('end_at', jourIso(new Date(Date.now() - 2 * 864e5))).lte('start_at', jourIso(dans14)).order('start_at').limit(40),
    db.from('clients').select('id,name,company,cadence,notes').eq('workspace_id', wsId).is('deleted_at', null).limit(40),
    db.from('client_todos').select('client_id,title,due_date,done').eq('workspace_id', wsId).is('deleted_at', null).eq('done', false).limit(80),
    db.from('client_files').select('client_id,title,status,version,created_at').eq('workspace_id', wsId).is('deleted_at', null).order('created_at', { ascending: false }).limit(60),
    db.from('client_messages').select('client_id,author_kind,author_name,body,created_at').eq('workspace_id', wsId).is('deleted_at', null).order('created_at', { ascending: false }).limit(40),
    db.from('conversations').select('id,name,type').eq('workspace_id', wsId).limit(40),
    db.from('files').select('name,folder,size,mime_type,created_at').eq('workspace_id', wsId).is('deleted_at', null).order('created_at', { ascending: false }).limit(20),
    db.from('activity_logs').select('action,entity_type,user_id,created_at,meta').eq('workspace_id', wsId).order('created_at', { ascending: false }).limit(25),
    db.from('goals').select('title,current,target,unit,due_date,status').eq('workspace_id', wsId).is('deleted_at', null).limit(20),
    db.from('crm_deals').select('title,value,stage,probability,close_date').eq('workspace_id', wsId).is('deleted_at', null).limit(40),
    db.from('notes').select('id,title,updated_at,created_by,content,tags').eq('workspace_id', wsId).is('deleted_at', null).order('updated_at', { ascending: false }).limit(60),
    db.from('projects').select('id,name,status').eq('workspace_id', wsId).is('deleted_at', null).limit(30),
    db.from('time_entries').select('started_at,ended_at,kind').eq('workspace_id', wsId).eq('user_id', userId).gte('started_at', jourIso(il7)).limit(200),
    db.from('motion_projets').select('titre,client,serie,numero,statut,avancement,etape,video_nom').eq('workspace_id', wsId).limit(40),
    db.from('notes').select('title,content,tags,created_at').eq('workspace_id', wsId).is('deleted_at', null).contains('tags', ['client-interne']).order('created_at', { ascending: false }).limit(30),
    // gestion (devis, factures, interventions, factures reçues), fiches clients et catalogue
    db.from('gestion_documents').select('id,kind,number,contact_id,title,status,intervention_type,priority,issued_at,due_at,start_at,address,total_ht,total_ttc,assigned_to,signer_name,signed_at,closed_at,paid_at,sent_at,created_by,travaux').eq('workspace_id', wsId).is('deleted_at', null).order('issued_at', { ascending: false }).limit(400),
    db.from('crm_contacts').select('id,name,company,city,address,zip,phone,email,kind,siret,ref_externe').eq('workspace_id', wsId).is('deleted_at', null).limit(500),
    db.from('gestion_articles').select('ref,label,unit,price_ht,tva,category').eq('workspace_id', wsId).is('deleted_at', null).limit(1500),
  ])
  const [ws, mem, taches, evts, clients, ctodos, cfiles, cmsgs, convs, fichiers, activite, objectifs, deals, notes, projets, temps, prods, notesClients, gdocs, fiches, articles] = r.map((x) => x.data ?? null) as any[]
  const membres = ((mem ?? []) as any[]).map((m) => ({ id: m.user_id, nom: m.profile?.full_name ?? m.profile?.email ?? '?', role: m.role, agentIA: !!m.profile?.preferences?.bot, moi: m.user_id === userId }))
  const nom = (id: string | null) => (id ? membres.find((m) => m.id === id)?.nom ?? null : null)
  const projet = (id: string | null) => (id ? (projets ?? []).find((p: any) => p.id === id)?.name ?? null : null)
  // derniers messages des discussions (canaux et messages privés), 4 par conversation
  const idsConv = ((convs ?? []) as any[]).map((c) => c.id)
  const msgs = idsConv.length ? ((await db.from('messages').select('conversation_id,user_id,content,kind,created_at').in('conversation_id', idsConv).is('deleted_at', null).order('created_at', { ascending: false }).limit(60)).data ?? []) : []
  // agents de l'Atelier (disponibilité) : rangés dans l'appareil relié de l'utilisateur
  let agentsAtelier: { nom: string; compte: string; etat: string }[] = []
  try { const { data } = await getAdminDb().from('studio_devices').select('setup,last_seen').eq('user_id', userId).order('last_seen', { ascending: false }).limit(1); agentsAtelier = ((data?.[0]?.setup as any)?.atelier?.agents ?? []).map((a: any) => ({ nom: a.nom, compte: a.compte, etat: a.etat })) } catch {}
  const ouvertes = ((taches ?? []) as any[]).filter((t) => !['done', 'cancelled'].includes(t.status))
  const minutes = ((temps ?? []) as any[]).filter((e) => e.ended_at).map((e) => ({ j: new Date(e.started_at) >= aube, m: (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 60000 }))
  // texte compact (la limite gratuite de Groq est d'environ 8 000 jetons par minute, question + réponse comprises) :
  // on garde ce qui compte (retards, 7 prochains jours, attentes des clients), en lignes courtes plutôt qu'en JSON
  const j = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', ...(d.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}) }) : '')
  const dans7 = new Date(Date.now() + 7 * 864e5)
  const retard = ouvertes.filter((t) => t.due_date && new Date(t.due_date) < aube)
  const prochaines = ouvertes.filter((t) => t.due_date && new Date(t.due_date) >= aube && new Date(t.due_date) <= dans7)
  const sansDate = ouvertes.filter((t) => !t.due_date && ['in_progress', 'in_review'].includes(t.status))
  const ligneT = (t: any) => `- ${court(t.title, 70)}${t.due_date ? ` (${j(t.due_date)})` : ''}${t.priority === 'urgent' || t.priority === 'high' ? ` [${t.priority === 'urgent' ? 'urgent' : 'haute'}]` : ''}${nom(t.assignee_id) ? ` → ${t.assignee_id === userId ? 'moi' : nom(t.assignee_id)}` : ''}${t.status === 'in_progress' ? ' (en cours)' : ''}${t.created_by ? ` [créée par ${t.created_by === userId ? 'moi' : nom(t.created_by) ?? '?'}]` : ''}`
  // notes citées dans la question : texte COMPLET, en tête (l'assistant peut les lire, les analyser, retrouver « la demande n° 3 »)
  const citees = question ? ((notes ?? []) as any[]).filter((n) => n.title && cite(question, n.title)).slice(0, 2) : []
  const clientsCites = question ? ((clients ?? []) as any[]).filter((c) => cite(question, c.name) || (c.company && cite(question, c.company))) : []
  const gestion = blocsGestion((gdocs ?? []) as any[], (fiches ?? []) as any[], (articles ?? []) as any[], question, nom, userId, j)
  const blocs: [string, string[]][] = [
    ...citees.map((n): [string, string[]] => [`NOTE CITÉE « ${n.title} » (écrite par ${n.created_by === userId ? 'moi' : nom(n.created_by) ?? '?'}, modifiée ${j(n.updated_at)}), TEXTE COMPLET`, [String(court(texteDeNote(n.content), 2500) || '(vide)')]]),
    ['ESPACE', [`${ws?.name ?? ''} · utilisateur : ${membres.find((m) => m.moi)?.nom ?? ''} · ${ouvertes.length} tâches ouvertes, ${retard.length} en retard, ${((taches ?? []) as any[]).filter((t) => t.completed_at && new Date(t.completed_at) > il7).length} faites en 7 j`]],
    ['MEMBRES', [[...new Set(membres.map((m) => `${m.nom}${m.agentIA ? ' (agent IA)' : ''}${m.moi ? ' (moi)' : ''}`))].join(', ')]],
    ['AGENTS DE L\'ATELIER', agentsAtelier.map((a) => `- ${a.nom} (${a.compte}) : ${a.etat}`)],
    ['TÂCHES EN RETARD', retard.slice(0, 12).map(ligneT)],
    ['TÂCHES DES 7 PROCHAINS JOURS', prochaines.slice(0, 15).map(ligneT)],
    ['EN COURS SANS DATE', sansDate.slice(0, 6).map(ligneT)],
    ['AGENDA (7 jours)', ((evts ?? []) as any[]).filter((e) => new Date(e.start_at) <= dans7 && new Date(e.end_at) >= aube).slice(0, 14).map((e) => `- ${j(e.start_at)} : ${court(e.title, 60)}${e.location ? ` @ ${court(e.location, 30)}` : ''}${(e.attendees ?? []).length ? ` avec ${(e.attendees ?? []).map(nom).filter(Boolean).join(', ')}` : ''}`)],
    ...gestion,
    ['CLIENTS', ((clients ?? []) as any[]).map((c) => {
      const v = ((cfiles ?? []) as any[]).filter((f) => f.client_id === c.id), d = ((cmsgs ?? []) as any[]).find((m) => m.client_id === c.id), t = ((ctodos ?? []) as any[]).filter((x) => x.client_id === c.id)
      return `- ${c.name}${c.company ? ` (${court(c.company, 40)})` : ''} : ${[v.filter((f) => f.status === 'livree').length && `${v.filter((f) => f.status === 'livree').length} vidéo(s) à valider`, v.filter((f) => f.status === 'modif').length && `modifs demandées : ${v.filter((f) => f.status === 'modif').map((f) => f.title).join(', ')}`, t.length && `${t.length} à faire`, d && `dernier message de ${d.author_kind === 'client' ? 'LUI (réponse attendue)' : "l'équipe"} : « ${court(d.body, 60)} »`].filter(Boolean).join(' · ') || 'rien en attente'}`
    })],
    // dossier privé de chaque client : description du projet, notes internes, idées de vidéo, modèles motion maison
    ['DOSSIERS PRIVÉS DES CLIENTS (jamais montrés au client)', ((clients ?? []) as any[]).map((c) => {
      const n = ((notesClients ?? []) as any[]).filter((x) => (x.tags ?? []).includes(`client:${c.id}`))
      const series = [...new Set(((prods ?? []) as any[]).filter((p) => p.client === c.name && p.serie).map((p) => p.serie))]
      if (!c.notes && !n.length && !series.length) return ''
      const fort = clientsCites.includes(c) // client dont parle la question : dossier détaillé
      return `- ${c.name} :${c.notes ? ` ${court(String(c.notes).replace(/\s+/g, ' '), fort ? 1500 : 220)}` : ''}${series.length ? ` | séries vidéo habituelles : ${series.join(', ')}` : ''}${n.map((x: any) => ` | ${(x.tags ?? []).includes('modele-motion') ? 'modèle motion' : (x.tags ?? []).includes('idee-video') ? 'idée de vidéo' : 'note'} « ${court(String(x.title).replace(`${c.name} · `, ''), 60)} » : ${fort ? court(texteDeNote(x.content).replace(/\s+/g, ' '), 600) : ''}`).join('')}`
    })],
    ['DISCUSSIONS RÉCENTES', ((convs ?? []) as any[]).map((c) => ({ c, m: (msgs as any[]).filter((x) => x.conversation_id === c.id).slice(0, 2) })).filter((x) => x.m.length).slice(0, 6).map(({ c, m }) => `- ${c.type === 'dm' ? 'privé' : '#' + c.name} : ${m.map((x: any) => `${nom(x.user_id) ?? '?'} « ${court(x.content ?? x.kind, 60)} »`).join(' / ')}`)],
    ['PRODUCTIONS MOTION', ((prods ?? []) as any[]).slice(0, 12).map((p) => `- ${p.numero ? `n° ${p.numero} ` : ''}${court(p.titre, 50)} (${p.client}${p.serie ? ', ' + p.serie : ''}) : ${p.statut}, ${p.avancement} %`)],
    ['OBJECTIFS', ((objectifs ?? []) as any[]).slice(0, 6).map((g) => `- ${court(g.title, 60)} : ${Math.round((Number(g.current) / Math.max(1, Number(g.target))) * 100)} %`)],
    ['CRM', ((deals ?? []) as any[]).filter((d) => !['gagné', 'perdu'].includes(d.stage)).slice(0, 8).map((d) => `- ${court(d.title, 50)} : ${d.value} € (${d.stage})`)],
    ['FICHIERS RÉCENTS', [((fichiers ?? []) as any[]).slice(0, 8).map((f) => court(f.name, 40)).join(', ')]],
    // notes : titre et auteur ; texte court pour les plus récentes (le texte complet de celles citées est en tête)
    ['NOTES (titre, auteur)', ((notes ?? []) as any[]).filter((n) => !(n.tags ?? []).includes('client-interne') && !citees.includes(n)).slice(0, 14).map((n, i) => `- « ${court(n.title || 'Sans titre', 60)} » (par ${n.created_by === userId ? 'moi' : nom(n.created_by) ?? '?'}, ${j(n.updated_at)})${i < 4 ? ` : ${court(texteDeNote(n.content).replace(/\s*\n\s*/g, ' / '), 160)}` : ''}`)],
    ['PROJETS', [((projets ?? []) as any[]).slice(0, 12).map((p) => p.name).join(', ')]],
    ['ACTIVITÉ RÉCENTE', ((activite ?? []) as any[]).slice(0, 8).map((a) => `- ${j(a.created_at)} ${nom(a.user_id) ?? 'quelqu\'un'} : ${a.action}${a.entity_type ? ' ' + a.entity_type : ''}`)],
    ['FOCUS', [`aujourd'hui ${Math.round(minutes.filter((x) => x.j).reduce((a, x) => a + x.m, 0))} min · 7 jours ${Math.round(minutes.reduce((a, x) => a + x.m, 0))} min`]],
  ]
  let texte = ''
  for (const [titre, lignes] of blocs) { const l = lignes.filter((x) => x && x.trim() && x !== '- '); if (!l.length) continue; const b = `${titre}\n${l.join('\n')}\n`; if (texte.length + b.length > 8000) continue; texte += b }
  return { maintenant: maintenant.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), texte }
}

/** Ce que l'assistant sait de la gestion : chiffres du mois, interventions à venir, devis et factures à suivre, fiche du client
 *  ou articles cités dans la question (en détail). Lignes courtes pour tenir dans la limite de Groq. */
function blocsGestion(docs: any[], fiches: any[], articles: any[], question: string, nom: (id: string | null) => string | null, moi: string, j: (d: string | null | undefined) => string): [string, string[]][] {
  if (!docs.length && !articles.length) return []
  const eur = (n: unknown) => `${Math.round(Number(n) * 100) / 100} €`
  const auj = new Date().toISOString().slice(0, 10), mois = auj.slice(0, 7)
  const fiche = (id: string | null) => fiches.find((f) => f.id === id)
  const qui = (d: any) => { const f = fiche(d.contact_id); return f ? (f.company || f.name) : (d.title ?? '—') }
  const membres = (ids: string[]) => (ids ?? []).map((u) => (u === moi ? 'moi' : nom(u) ?? '?')).join(', ')
  const fac = docs.filter((d) => d.kind === 'facture' && !['annulee', 'brouillon'].includes(d.status))
  const facMois = fac.filter((d) => String(d.issued_at).startsWith(mois))
  const aEnc = fac.filter((d) => d.status !== 'payee')
  const retard = aEnc.filter((d) => d.status === 'en_retard' || (d.due_at && d.due_at < auj))
  const devisAtt = docs.filter((d) => d.kind === 'devis' && ['envoye', 'en_attente'].includes(d.status))
  const inter = docs.filter((d) => d.kind === 'intervention' && !d.closed_at && d.status !== 'annulee').sort((a, b) => String(a.start_at ?? '9').localeCompare(String(b.start_at ?? '9')))
  const achats = docs.filter((d) => d.kind === 'achat')
  const ligneInter = (d: any) => `- ${d.number} ${d.intervention_type ?? ''} · ${qui(d)}${d.start_at ? ` · ${j(d.start_at)}` : ' · à planifier'} · ${d.status}${d.priority !== 'normale' ? ` [${d.priority}]` : ''}${d.assigned_to?.length ? ` → ${membres(d.assigned_to)}` : ''}`
  const sans = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = sans(question)
  const citee = question ? fiches.filter((f) => [f.name, f.company].some((v) => v && v.length > 2 && q.includes(sans(v)))).slice(0, 2) : []
  const motsQ = q.split(/[^a-z0-9]+/).filter((m) => m.length >= 4)
  const artsCites = motsQ.length && /(article|prix|tarif|combien|catalogue|reference|devis)/.test(q) ? articles.filter((a) => motsQ.some((m) => sans(`${a.ref ?? ''} ${a.label}`).includes(m))).slice(0, 12) : []
  const out: [string, string[]][] = [
    ['GESTION (chiffres)', [`ce mois : facturé ${eur(facMois.reduce((x, d) => x + Number(d.total_ht), 0))} HT, encaissé ${eur(facMois.filter((d) => d.status === 'payee').reduce((x, d) => x + Number(d.total_ttc), 0))} TTC · à encaisser en tout ${eur(aEnc.reduce((x, d) => x + Number(d.total_ttc), 0))} (${aEnc.length} factures, ${retard.length} en retard) · devis en attente ${devisAtt.length} (${eur(devisAtt.reduce((x, d) => x + Number(d.total_ttc), 0))}) · interventions non clôturées ${inter.length} · ${fiches.length} fiches clients · ${articles.length} articles`]],
    ['INTERVENTIONS À VENIR / NON CLÔTURÉES', inter.slice(0, 12).map(ligneInter)],
    ['DEVIS EN ATTENTE', devisAtt.slice(0, 8).map((d) => `- ${d.number} · ${qui(d)} · ${eur(d.total_ttc)} TTC${d.sent_at ? ` · envoyé ${j(d.sent_at)}` : ''}${d.due_at ? ` · valable jusqu'au ${j(d.due_at)}` : ''}`)],
    ['FACTURES À ENCAISSER', aEnc.slice(0, 8).map((d) => `- ${d.number} · ${qui(d)} · ${eur(d.total_ttc)}${d.due_at ? ` · échéance ${j(d.due_at)}` : ''}${retard.includes(d) ? ' (EN RETARD)' : ''}`)],
    ['FACTURES REÇUES RÉCENTES', achats.slice(0, 5).map((d) => `- ${d.title ?? d.number} · ${eur(d.total_ttc)} · ${j(d.issued_at)} · ${d.status}`)],
    ...citee.map((f): [string, string[]] => [`FICHE CLIENT « ${f.company || f.name} » (gestion)`, [
      `${f.name}${f.company ? ` (${f.company})` : ''} · ${f.kind ?? ''} · ${[f.address, f.zip, f.city].filter(Boolean).join(' ')} · ${f.phone ?? ''} · ${f.email ?? ''}${f.ref_externe ? ` · code ${f.ref_externe}` : ''}`,
      ...docs.filter((d) => d.contact_id === f.id).slice(0, 15).map((d) => `- ${d.kind} ${d.number} · ${d.title ?? d.intervention_type ?? ''} · ${j(d.start_at ?? d.issued_at)} · ${d.status}${Number(d.total_ttc) ? ` · ${eur(d.total_ttc)}` : ''}${d.signer_name ? ` · signé par ${d.signer_name}` : ''}${d.assigned_to?.length ? ` · par ${membres(d.assigned_to)}` : ''}`),
    ]]),
    ['ARTICLES CITÉS', artsCites.map((a) => `- ${a.ref ? a.ref + ' ' : ''}${a.label} : ${a.price_ht} € HT / ${a.unit} (TVA ${a.tva} %)`)],
  ]
  return out
}
