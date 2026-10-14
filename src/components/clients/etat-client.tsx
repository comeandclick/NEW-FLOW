'use client'
// État du client sur 30 jours (fiche client) : vidéos, tâches, messages. Calculé à partir des données de l'espace client.
import { format, isSameDay, startOfDay, subDays } from 'date-fns'
import { fr } from 'date-fns/locale'
import { StatusBlock, type Evenement, type Jour, type LigneEtat } from '@/components/ui/status-block'
import { groupFiles, type ClientCadence, type ClientFile, type ClientMessage, type ClientTodo } from '@/lib/clients'

const JOURS = 30
const PERIODE: Record<ClientCadence, number | null> = { day: 1, two_days: 2, week: 7, on_demand: null }
const jour = (d: string) => format(new Date(d), 'd MMM', { locale: fr })

export function EtatClient({ cadence, files, todos, messages }: { cadence: ClientCadence; files: ClientFile[]; todos: ClientTodo[]; messages: ClientMessage[] }) {
  const auj = startOfDay(new Date())
  const jours = Array.from({ length: JOURS }, (_, i) => subDays(auj, JOURS - 1 - i))
  const leJour = <T,>(liste: T[], date: (x: T) => string | null, d: Date) => liste.filter((x) => { const v = date(x); return !!v && isSameDay(new Date(v), d) })

  // Vidéos : vert = livrée ou validée ce jour-là, orange = modification demandée
  const groupes = groupFiles(files)
  const modifs = groupes.filter((g) => g.versions[0].status === 'modif').length, aValider = groupes.filter((g) => g.versions[0].status === 'livree').length
  const derniereLivraison = files.filter((f) => f.uploaded_by_kind === 'team').map((f) => f.created_at).sort().at(-1) ?? null
  const periode = PERIODE[cadence]
  const enRetard = !!periode && (!derniereLivraison || (Date.now() - new Date(derniereLivraison).getTime()) / 86400000 > periode * 2)
  const vJours: Jour[] = jours.map((d) => { const l = leJour(files, (f) => f.created_at, d); return l.some((f) => f.status === 'modif') ? 'attention' : l.length ? 'ok' : 'vide' })
  const videos: LigneEtat = { nom: 'Vidéos', jours: vJours, dernier: derniereLivraison ? jour(derniereLivraison) : null,
    etat: modifs ? 'attention' : enRetard ? 'bloque' : 'ok',
    libelle: modifs ? `${modifs} modification(s) demandée(s)` : enRetard ? 'Livraison en retard sur le rythme' : aValider ? `${aValider} à valider par le client` : 'À jour' }

  // Tâches : rouge = échéance dépassée, vert = tâche faite ce jour-là
  const retard = todos.filter((x) => !x.done && x.due_date && new Date(x.due_date) < auj), ouvertes = todos.filter((x) => !x.done)
  const tJours: Jour[] = jours.map((d) => leJour(todos, (x) => x.due_date, d).some((x) => !x.done && d < auj) ? 'bloque' : leJour(todos, (x) => x.done_at, d).length ? 'ok' : 'vide')
  const taches: LigneEtat = { nom: 'Tâches', jours: tJours, dernier: todos.map((x) => x.done_at).filter(Boolean).sort().at(-1) ? jour(todos.map((x) => x.done_at!).filter(Boolean).sort().at(-1)!) : null,
    etat: retard.length ? 'bloque' : 'ok', libelle: retard.length ? `${retard.length} en retard` : ouvertes.length ? `${ouvertes.length} à faire` : 'Rien à faire' }

  // Messages : orange = le client attend une réponse
  const tri = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)), dernierMsg = tri.at(-1)
  const attente = dernierMsg?.author_kind === 'client'
  const mJours: Jour[] = jours.map((d) => { const l = leJour(messages, (m) => m.created_at, d); return l.length ? (isSameDay(d, auj) && attente ? 'attention' : 'ok') : 'vide' })
  const msgs: LigneEtat = { nom: 'Messages', jours: mJours, dernier: dernierMsg ? jour(dernierMsg.created_at) : null, etat: attente ? 'attention' : 'ok', libelle: attente ? 'Réponse attendue' : 'À jour' }

  const historique: Evenement[] = [
    ...groupes.filter((g) => g.versions[0].status === 'modif').map((g) => ({ date: jour(g.versions[0].updated_at), texte: `Modification demandée : ${g.versions[0].title}`, etat: 'attention' as const })),
    ...retard.map((x) => ({ date: jour(x.due_date!), texte: `Tâche en retard : ${x.title}`, etat: 'bloque' as const })),
    ...(attente && dernierMsg ? [{ date: jour(dernierMsg.created_at), texte: 'Le client attend une réponse', etat: 'attention' as const }] : []),
  ].slice(0, 8)

  return <StatusBlock titre="État du projet" lignes={[videos, taches, msgs]} historique={historique} />
}
