// Assistant à widgets (14/10/2026) : l'IA répond par une phrase courte + des widgets (tâches, clients en attente, vidéo,
// agenda, productions). Avec la clé ANTHROPIC_API_KEY, Claude choisit les widgets (outils) ; sans clé (ou en démo),
// la compréhension locale ci-dessous reconnaît les demandes courantes.
export type Creation = {
  objet: 'tache' | 'evenement' | 'note'
  titre?: string; date?: string; heure?: string; duree?: number; assigne?: string; avec?: string; lieu?: string; priorite?: string; contenu?: string; client?: string
}
export type DemandeVideo = { client: string; modele?: string; sujet?: string; publication?: string; duree?: number; note?: string }
export type Widget =
  | { type: 'taches'; periode: 'jour' | 'semaine' | 'retard' | 'toutes' }
  | { type: 'clients'; filtre: 'tous' | 'attente' }
  | { type: 'client'; nom: string }
  | { type: 'video'; recherche: string }
  | { type: 'agenda'; periode: 'jour' | 'semaine' }
  | { type: 'productions'; statut?: string }
  | { type: 'notes'; recherche?: string }
  | { type: 'fichiers'; genre: 'tous' | 'images' | 'videos' | 'documents' }
  | { type: 'discussions'; filtre: 'non_lues' | 'recentes' }
  | { type: 'activite'; periode: 'jour' | 'semaine' }
  | { type: 'objectifs' }
  | { type: 'crm'; vue: 'en_cours' | 'gagnees' | 'toutes' }
  | { type: 'equipe'; filtre: 'tous' | 'agents' | 'disponibles' }
  | { type: 'bilan'; periode: 'jour' | 'semaine' }
  | { type: 'projets' }
  | { type: 'focus' }
  | { type: 'creation'; c: Creation }
  | { type: 'video_demande'; d: DemandeVideo }
  | { type: 'envoi_agent'; titre: string; consigne: string; agent?: string; note?: string }
  | { type: 'modele_motion'; client: string; titre: string; idee: string; format?: string; duree?: number }

const obj = (props: Record<string, unknown> = {}, required: string[] = []) => ({ type: 'object', properties: props, required })
const choix = (valeurs: string[]) => ({ type: 'string', enum: valeurs })
// outils décrits à l'IA — un appel d'outil = un widget à afficher
export const OUTILS = [
  { name: 'afficher_taches', description: 'Tâches de l\'utilisateur.', input_schema: obj({ periode: choix(['jour', 'semaine', 'retard', 'toutes']) }, ['periode']) },
  { name: 'afficher_clients', description: 'Clients : tous (« mes clients ») ou attente (qui attend quelque chose).', input_schema: obj({ filtre: choix(['tous', 'attente']) }, ['filtre']) },
  { name: 'afficher_client', description: 'Fiche d\'un client.', input_schema: obj({ nom: { type: 'string' } }, ['nom']) },
  { name: 'afficher_video', description: 'Une vidéo (lecteur + Télécharger). recherche = mots du titre.', input_schema: obj({ recherche: { type: 'string' } }, ['recherche']) },
  { name: 'afficher_agenda', description: 'Agenda.', input_schema: obj({ periode: choix(['jour', 'semaine']) }, ['periode']) },
  { name: 'afficher_productions', description: 'Vidéos de l\'Atelier. statut : a_valider, a_corriger, en_cours, valide, publie.', input_schema: obj({ statut: { type: 'string' } }) },
  { name: 'afficher_notes', description: 'LISTE de notes (pas pour lire une note : réponds en texte).', input_schema: obj({ recherche: { type: 'string' } }) },
  { name: 'afficher_fichiers', description: 'Fichiers récents.', input_schema: obj({ genre: choix(['tous', 'images', 'videos', 'documents']) }, ['genre']) },
  { name: 'afficher_discussions', description: 'Discussions : non lues ou récentes.', input_schema: obj({ filtre: choix(['non_lues', 'recentes']) }, ['filtre']) },
  { name: 'afficher_activite', description: 'Fil d\'activité.', input_schema: obj({ periode: choix(['jour', 'semaine']) }, ['periode']) },
  { name: 'afficher_objectifs', description: 'Objectifs et progression.', input_schema: obj() },
  { name: 'afficher_crm', description: 'Affaires du CRM.', input_schema: obj({ vue: choix(['en_cours', 'gagnees', 'toutes']) }, ['vue']) },
  { name: 'afficher_equipe', description: 'Équipe et agents IA avec disponibilité.', input_schema: obj({ filtre: choix(['tous', 'agents', 'disponibles']) }, ['filtre']) },
  { name: 'afficher_bilan', description: 'Bilan chiffré.', input_schema: obj({ periode: choix(['jour', 'semaine']) }, ['periode']) },
  { name: 'afficher_projets', description: 'Projets et avancement.', input_schema: obj() },
  { name: 'afficher_focus', description: 'Temps de focus.', input_schema: obj() },
  { name: 'preparer_video', description: 'Lancer une vidéo motion pour un client. modele vide = habituel. publication AAAA-MM-JJ, duree en s.',
    input_schema: obj({ client: { type: 'string' }, ...Object.fromEntries(['modele', 'sujet', 'publication', 'duree', 'note'].map((k) => [k, { type: ['string', 'number', 'null'] }])) }, ['client']) },
  { name: 'envoyer_agent', description: 'Consigne pour un agent IA (terminal). consigne complète ; note = titre de la note jointe ; agent = seulement s\'il est nommé.',
    input_schema: obj({ titre: { type: 'string' }, consigne: { type: 'string' }, ...Object.fromEntries(['agent', 'note'].map((k) => [k, { type: ['string', 'null'] }])) }, ['titre', 'consigne']) },
  { name: 'proposer_modele_motion', description: 'Nouveau modèle vidéo pour un client. idee = déroulé précis (format, durée, scènes, texte, voix).',
    input_schema: obj({ client: { type: 'string' }, titre: { type: 'string' }, idee: { type: 'string' }, ...Object.fromEntries(['format', 'duree'].map((k) => [k, { type: ['string', 'number', 'null'] }])) }, ['client', 'titre', 'idee']) },
  { name: 'preparer_creation', description: 'Formulaire tâche / evenement / note, sur demande explicite. Champs inconnus omis. date AAAA-MM-JJ, heure HH:MM, assigne = membre ou « agent IA », avec = invités, duree en min, priorite low/medium/high/urgent.',
    input_schema: obj({ objet: choix(['tache', 'evenement', 'note']), ...Object.fromEntries(['titre', 'date', 'heure', 'duree', 'assigne', 'avec', 'lieu', 'priorite', 'contenu', 'client'].map((k) => [k, { type: ['string', 'number', 'null'] }])) }, ['objet']) },
] as const

const str = (v: unknown, n = 200) => (typeof v === 'string' && v.trim() && v.trim() !== 'null' ? v.trim().slice(0, n) : undefined)
const parmi = <T extends string>(v: unknown, liste: readonly T[], defaut: T): T => (liste.includes(v as T) ? (v as T) : defaut)
export function versWidget(nom: string, e: Record<string, unknown>): Widget | null {
  switch (nom) {
    case 'afficher_taches': return { type: 'taches', periode: parmi(e.periode, ['jour', 'semaine', 'retard', 'toutes'], 'jour') }
    case 'afficher_clients': return { type: 'clients', filtre: parmi(e.filtre, ['tous', 'attente'], 'tous') }
    case 'afficher_client': return str(e.nom) ? { type: 'client', nom: str(e.nom)! } : { type: 'clients', filtre: 'tous' }
    case 'afficher_video': return { type: 'video', recherche: str(e.recherche) ?? '' }
    case 'afficher_agenda': return { type: 'agenda', periode: parmi(e.periode, ['jour', 'semaine'], 'semaine') }
    case 'afficher_productions': return { type: 'productions', statut: str(e.statut) }
    case 'afficher_notes': return { type: 'notes', recherche: str(e.recherche) }
    case 'afficher_fichiers': return { type: 'fichiers', genre: parmi(e.genre, ['tous', 'images', 'videos', 'documents'], 'tous') }
    case 'afficher_discussions': return { type: 'discussions', filtre: parmi(e.filtre, ['non_lues', 'recentes'], 'recentes') }
    case 'afficher_activite': return { type: 'activite', periode: parmi(e.periode, ['jour', 'semaine'], 'jour') }
    case 'afficher_objectifs': return { type: 'objectifs' }
    case 'afficher_crm': return { type: 'crm', vue: parmi(e.vue, ['en_cours', 'gagnees', 'toutes'], 'en_cours') }
    case 'afficher_equipe': return { type: 'equipe', filtre: parmi(e.filtre, ['tous', 'agents', 'disponibles'], 'tous') }
    case 'afficher_bilan': return { type: 'bilan', periode: parmi(e.periode, ['jour', 'semaine'], 'jour') }
    case 'afficher_projets': return { type: 'projets' }
    case 'afficher_focus': return { type: 'focus' }
    case 'preparer_video': return str(e.client) ? { type: 'video_demande', d: { client: str(e.client, 80)!, modele: str(e.modele, 80), sujet: str(e.sujet, 300), note: str(e.note, 1000),
      publication: str(e.publication, 10) && /^\d{4}-\d{2}-\d{2}$/.test(str(e.publication, 10)!) ? str(e.publication, 10) : undefined, duree: Number(e.duree) >= 5 && Number(e.duree) <= 600 ? Math.round(Number(e.duree)) : undefined } } : null
    case 'envoyer_agent': return str(e.consigne) ? { type: 'envoi_agent', titre: str(e.titre, 100) ?? 'Consigne', consigne: str(e.consigne, 4000)!, agent: str(e.agent, 60), note: str(e.note, 160) } : null
    case 'proposer_modele_motion': return str(e.client) && str(e.idee) ? { type: 'modele_motion', client: str(e.client, 80)!, titre: str(e.titre, 100) ?? 'Nouveau modèle', idee: str(e.idee, 3000)!, format: str(e.format, 12), duree: Number(e.duree) >= 5 && Number(e.duree) <= 600 ? Math.round(Number(e.duree)) : undefined } : null
    case 'preparer_creation': {
      const date = str(e.date, 10), heure = str(e.heure, 5)
      return { type: 'creation', c: {
        objet: parmi(e.objet, ['tache', 'evenement', 'note'], 'tache'), titre: str(e.titre, 160),
        date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined, heure: heure && /^\d{1,2}:\d{2}$/.test(heure) ? heure.padStart(5, '0') : undefined,
        duree: Number(e.duree) > 0 && Number(e.duree) <= 1440 ? Math.round(Number(e.duree)) : undefined,
        assigne: str(e.assigne, 80), avec: str(e.avec, 160), lieu: str(e.lieu, 120), priorite: str(e.priorite, 10), contenu: str(e.contenu, 2000), client: str(e.client, 80),
      } }
    }
  }
  return null
}

/** Résumé d'un widget pour l'historique de la conversation (l'IA sait ce qui est affiché, et ce qui manque à un formulaire). */
export function resumeWidget(w: Widget): string {
  if (w.type === 'envoi_agent') return `[envoi à un agent préparé : « ${w.titre} » ${w.note ? `(note « ${w.note} »)` : ''} : ${w.consigne.slice(0, 300)}]`
  if (w.type === 'video_demande') return `[widget de lancement de vidéo affiché : ${JSON.stringify(w.d)} ; si l'utilisateur précise quelque chose, rappelle preparer_video avec TOUS les champs]`
  if (w.type === 'modele_motion') return `[modèle motion proposé pour ${w.client} : « ${w.titre} » : ${w.idee.slice(0, 400)}]`
  if (w.type !== 'creation') return `[widget affiché : ${w.type}${'periode' in w ? ' ' + w.periode : ''}${'filtre' in w ? ' ' + w.filtre : ''}${'nom' in w ? ' ' + w.nom : ''}]`
  const { objet, ...champs } = w.c
  return `[formulaire de création (${objet}) affiché avec : ${JSON.stringify(champs)} ; si l'utilisateur donne les infos manquantes, rappelle preparer_creation avec TOUS les champs]`
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** Compréhension locale (sans IA externe) des demandes les plus courantes. */
export function comprendre(texte: string): { texte: string; widgets: Widget[] } | null {
  const t = sansAccents(texte)
  const creer = /(ajoute|cree|creer|nouvelle|nouveau|planifie|programme|note moi|rappelle)/.test(t) && t.match(/(tache|rendez-vous|rdv|reunion|evenement|appel|note)/)
  if (creer) {
    const objet = /(rendez|rdv|reunion|evenement|appel)/.test(creer[1]) ? 'evenement' : creer[1] === 'note' ? 'note' : 'tache'
    const d = new Date(), iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    const jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], jd = jours.findIndex((j) => t.includes(j))
    const date = /apres-demain/.test(t) ? iso(new Date(d.getTime() + 2 * 864e5)) : /demain/.test(t) ? iso(new Date(d.getTime() + 864e5)) : /aujourd/.test(t) ? iso(d)
      : jd >= 0 ? iso(new Date(d.getTime() + (((jd - d.getDay() + 7) % 7) || 7) * 864e5)) : undefined
    const h = t.match(/\b(\d{1,2})\s*h\s*(\d{2})?\b/) ?? t.match(/\b(\d{1,2}):(\d{2})\b/)
    const avec = texte.match(/avec\s+([A-ZÀ-Ý][\wÀ-ÿ-]+(?:\s+[A-ZÀ-Ý][\wÀ-ÿ-]+)?)/)?.[1]
    const titre = texte.replace(/^.*?(t[âa]che|rendez-vous|rdv|r[ée]union|[ée]v[ée]nement|appel|note)\s*(:|pour|de|d'|qui)?\s*/i, '').replace(/\s*(demain|aujourd'hui|apr[èe]s-demain|la semaine prochaine|[àa]\s*\d{1,2}\s*h\s*\d{0,2}|avec un agent ia.*|avec\s+\S+).*$/i, '').trim()
    return { texte: 'Je prépare ça, vérifie et complète si besoin :', widgets: [{ type: 'creation', c: { objet, titre: titre || undefined, date, heure: h ? `${h[1].padStart(2, '0')}:${h[2] ?? '00'}` : undefined, avec: objet === 'evenement' ? avec : undefined, assigne: /agent ia/.test(t) ? 'agent IA' : undefined } }] }
  }
  const lanceVideo = t.match(/(?:cree|creer|lance|prepare|fais)\s+(?:moi\s+)?(?:la|une)\s+(?:nouvelle\s+)?(?:video|tiktok)(?:\s+de\s+(demain|aujourd'hui))?.*?(?:pour|de)\s+(?:le\s+tiktok\s+de\s+|l'?|la\s+|le\s+)?([a-z0-9][\w-]*)/)
  if (lanceVideo) {
    const d = new Date(Date.now() + (lanceVideo[1] === 'demain' ? 864e5 : 0)), iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { texte: 'Je prépare la vidéo :', widgets: [{ type: 'video_demande', d: { client: lanceVideo[2], publication: lanceVideo[1] ? iso : undefined } }] }
  }
  if (/(video|tiktok|reel|cours|mini-cours)/.test(t) && /(donne|montre|affiche|trouve|ou est|envoie|telecharge|le |la |du )/.test(t)) {
    const guillemets = texte.match(/[«"“]([^»"”]+)[»"”]/)?.[1]
    const apres = texte.replace(/^.*?(?:vid[ée]o|tiktok|reel|cours)\s*(?:du|de|de la|sur|:)?\s*/i, '')
    return { texte: 'Voici la vidéo :', widgets: [{ type: 'video', recherche: (guillemets ?? apres).trim() }] }
  }
  if (/client/.test(t) && /(attente|attend|valider|retard|repondre|qui attend)/.test(t)) return { texte: 'Voici les clients qui attendent quelque chose :', widgets: [{ type: 'clients', filtre: 'attente' }] }
  if (/client/.test(t)) return { texte: 'Voici tous tes clients :', widgets: [{ type: 'clients', filtre: 'tous' }] }
  if (/(objectif|okr)/.test(t)) return { texte: 'Voici tes objectifs :', widgets: [{ type: 'objectifs' }] }
  if (/(crm|affaire|pipeline|deal|prospect)/.test(t)) return { texte: 'Voici ton pipeline :', widgets: [{ type: 'crm', vue: 'en_cours' }] }
  if (/(equipe|membre|agent|disponible|dispo)/.test(t)) return { texte: 'Voici ton équipe :', widgets: [{ type: 'equipe', filtre: /agent/.test(t) ? 'agents' : /dispo/.test(t) ? 'disponibles' : 'tous' }] }
  if (/(bilan|resume|resumer|stat)/.test(t)) return { texte: /semaine/.test(t) ? 'Ton bilan de la semaine :' : 'Ton bilan du jour :', widgets: [{ type: 'bilan', periode: /semaine/.test(t) ? 'semaine' : 'jour' }] }
  if (/(message|discussion|non lu|conversation)/.test(t)) return { texte: 'Voici tes discussions :', widgets: [{ type: 'discussions', filtre: /non lu/.test(t) ? 'non_lues' : 'recentes' }] }
  if (/(fichier|document|image|photo)/.test(t)) return { texte: 'Voici tes fichiers :', widgets: [{ type: 'fichiers', genre: /(image|photo)/.test(t) ? 'images' : 'tous' }] }
  if (/\bnotes?\b/.test(t)) return { texte: 'Voici tes notes :', widgets: [{ type: 'notes' }] }
  if (/(activite|qui a fait|historique)/.test(t)) return { texte: 'Voici l\'activité récente :', widgets: [{ type: 'activite', periode: /semaine/.test(t) ? 'semaine' : 'jour' }] }
  if (/projet/.test(t)) return { texte: 'Voici tes projets :', widgets: [{ type: 'projets' }] }
  if (/(focus|concentr)/.test(t)) return { texte: 'Voici ton temps de focus :', widgets: [{ type: 'focus' }] }
  if (/(production|motion|atelier)/.test(t)) return { texte: 'Voici les vidéos de l\'Atelier :', widgets: [{ type: 'productions', statut: /valider/.test(t) ? 'a_valider' : /corriger/.test(t) ? 'a_corriger' : undefined }] }
  if (/(agenda|calendrier|rendez|evenement|reunion|rdv)/.test(t)) return { texte: /semaine/.test(t) ? 'Voici ta semaine :' : 'Voici ta journée :', widgets: [{ type: 'agenda', periode: /semaine/.test(t) ? 'semaine' : 'jour' }] }
  if (/(tache|a faire|todo|travail|programme|faire aujourd|dois-je faire|ma journee|ma semaine|retard)/.test(t)) {
    const periode = /retard/.test(t) ? 'retard' : /semaine/.test(t) ? 'semaine' : /(toutes|tout)/.test(t) ? 'toutes' : 'jour'
    return { texte: { jour: 'Voici tes tâches du jour :', semaine: 'Voici tes tâches de la semaine :', retard: 'Voici tes tâches en retard :', toutes: 'Voici toutes tes tâches ouvertes :' }[periode], widgets: [{ type: 'taches', periode }] }
  }
  return null
}
