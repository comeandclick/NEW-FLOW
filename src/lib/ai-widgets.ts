// Assistant à widgets (14/10/2026) : l'IA répond par une phrase courte + des widgets (tâches, clients en attente, vidéo,
// agenda, productions). Avec la clé ANTHROPIC_API_KEY, Claude choisit les widgets (outils) ; sans clé (ou en démo),
// la compréhension locale ci-dessous reconnaît les demandes courantes.
export type Widget =
  | { type: 'taches'; periode: 'jour' | 'semaine' | 'retard' | 'toutes' }
  | { type: 'clients' }
  | { type: 'video'; recherche: string }
  | { type: 'agenda'; periode: 'jour' | 'semaine' }
  | { type: 'productions'; statut?: string }

// outils décrits à Claude (format de l'API Messages) — un appel d'outil = un widget à afficher
export const OUTILS = [
  { name: 'afficher_taches', description: 'Affiche les tâches de l\'utilisateur dans un widget (à utiliser pour toute question sur les tâches, le travail du jour ou de la semaine, les retards).',
    input_schema: { type: 'object', properties: { periode: { type: 'string', enum: ['jour', 'semaine', 'retard', 'toutes'] } }, required: ['periode'] } },
  { name: 'afficher_clients', description: 'Affiche les clients qui attendent quelque chose (vidéos à valider, modifications demandées, tâches en retard, messages sans réponse).',
    input_schema: { type: 'object', properties: {} } },
  { name: 'afficher_video', description: 'Affiche une vidéo (TikTok, mini-cours, pub…) avec un bouton Télécharger. recherche = mots-clés du titre (ex. « comment dire je en arabe », « cours 2 pronoms »).',
    input_schema: { type: 'object', properties: { recherche: { type: 'string' } }, required: ['recherche'] } },
  { name: 'afficher_agenda', description: 'Affiche les événements du calendrier.', input_schema: { type: 'object', properties: { periode: { type: 'string', enum: ['jour', 'semaine'] } }, required: ['periode'] } },
  { name: 'afficher_productions', description: 'Affiche les vidéos de l\'Atelier (motion design) et leur avancement. statut facultatif : a_valider, a_corriger, en_cours, valide, publie.',
    input_schema: { type: 'object', properties: { statut: { type: 'string' } } } },
] as const

export function versWidget(nom: string, entree: Record<string, unknown>): Widget | null {
  if (nom === 'afficher_taches') return { type: 'taches', periode: (entree.periode as 'jour') ?? 'jour' }
  if (nom === 'afficher_clients') return { type: 'clients' }
  if (nom === 'afficher_video') return { type: 'video', recherche: String(entree.recherche ?? '') }
  if (nom === 'afficher_agenda') return { type: 'agenda', periode: (entree.periode as 'jour') ?? 'semaine' }
  if (nom === 'afficher_productions') return { type: 'productions', statut: entree.statut ? String(entree.statut) : undefined }
  return null
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Compréhension locale (sans IA externe) des demandes les plus courantes. */
export function comprendre(texte: string): { texte: string; widgets: Widget[] } | null {
  const t = sansAccents(texte)
  if (/(video|tiktok|reel|cours|mini-cours)/.test(t) && /(donne|montre|affiche|trouve|ou est|envoie|telecharge|le |la |du )/.test(t)) {
    const guillemets = texte.match(/[«"“]([^»"”]+)[»"”]/)?.[1]
    const apres = texte.replace(/^.*?(?:vid[ée]o|tiktok|reel|cours)\s*(?:du|de|de la|sur|:)?\s*/i, '')
    return { texte: 'Voici la vidéo :', widgets: [{ type: 'video', recherche: (guillemets ?? apres).trim() }] }
  }
  if (/client/.test(t) && /(attente|attend|valider|retard|repondre|qui)/.test(t)) return { texte: 'Voici les clients qui attendent quelque chose :', widgets: [{ type: 'clients' }] }
  if (/(production|motion|atelier)/.test(t)) return { texte: 'Voici les vidéos de l\'Atelier :', widgets: [{ type: 'productions', statut: /valider/.test(t) ? 'a_valider' : /corriger/.test(t) ? 'a_corriger' : undefined }] }
  if (/(agenda|calendrier|rendez|evenement|reunion|rdv)/.test(t)) return { texte: /semaine/.test(t) ? 'Voici ta semaine :' : 'Voici ta journée :', widgets: [{ type: 'agenda', periode: /semaine/.test(t) ? 'semaine' : 'jour' }] }
  if (/(tache|a faire|todo|travail|programme|faire aujourd|dois-je faire|ma journee|ma semaine|retard)/.test(t)) {
    const periode = /retard/.test(t) ? 'retard' : /semaine/.test(t) ? 'semaine' : /(toutes|tout)/.test(t) ? 'toutes' : 'jour'
    return { texte: { jour: 'Voici tes tâches du jour :', semaine: 'Voici tes tâches de la semaine :', retard: 'Voici tes tâches en retard :', toutes: 'Voici toutes tes tâches ouvertes :' }[periode], widgets: [{ type: 'taches', periode }] }
  }
  return null
}
