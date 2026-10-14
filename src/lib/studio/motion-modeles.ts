// Types de vidéo proposés par client dans « Motion design → Lancer » (14/10/2026, Agent 2 / seikqit).
// La demande part vers le logiciel Atelier du Mac, qui crée la fiche (série, numéro) et confie la vidéo à un agent Claude.
// Ajouter un type : une ligne ici (bientot: true l'affiche grisé « Bientôt »).

export type VoixId = 'kalimat_fr' | 'kalimat_ar' | 'kalimat_ar_fr' | 'presentation_fr' | 'presentation_en'
export type Format = '1080x1920' | '1920x1080' | '1080x1080'

export const VOIX: Record<VoixId, { titre: string; detail: string }> = {
  kalimat_fr: { titre: 'Kalimat · français', detail: 'La voix Kalimat, en français' },
  kalimat_ar: { titre: 'Kalimat · arabe', detail: 'Les mots et phrases en arabe' },
  kalimat_ar_fr: { titre: 'Kalimat · arabe et français', detail: 'Explique en français, prononce en arabe' },
  presentation_fr: { titre: 'Présentation · français', detail: 'Voix off de pub, en français' },
  presentation_en: { titre: 'Présentation · anglais', detail: 'Voix off de pub, en anglais' },
}

export type Modele = {
  id: string
  titre: string
  detail: string
  /** série de la fiche Atelier : la vidéo prend le numéro suivant (ex. « Mini-cours Kalimat » → cours 6) */
  serie?: string
  format: Format
  duree: number
  voix: VoixId[]
  voixDefaut: VoixId | null
  sujet: { label: string; placeholder: string }
  bientot?: boolean
  /** consignes transmises à l'agent (en plus du sujet et des notes d'Aymen) */
  consignes: string
}

const VOIX_PRESENTATION: VoixId[] = ['presentation_fr', 'presentation_en']

export const MODELES: Record<string, Modele[]> = {
  Kalimat: [
    { id: 'mini_cours', titre: 'Mini-cours', detail: 'TikTok vertical · leçon d\'arabe', serie: 'Mini-cours Kalimat', format: '1080x1920', duree: 60,
      voix: ['kalimat_ar_fr', 'kalimat_fr', 'kalimat_ar'], voixDefaut: 'kalimat_ar_fr',
      sujet: { label: 'Sujet du cours', placeholder: 'ex. les couleurs (alwān). Vide : l\'agent choisit la suite logique' },
      consignes: 'Mini-cours Kalimat suivant de la série (mêmes règles que les cours précédents : scènes nouvelles adaptées au sujet, voix française qui explique chaque étape, exercices non devinables, aucun « cours N » à l\'écran, couleurs Kalimat).' },
    { id: 'pub_produit', titre: 'Pub produit', detail: '40 s · présente l\'app', serie: 'Pubs Kalimat', format: '1920x1080', duree: 40,
      voix: ['kalimat_fr', 'kalimat_ar_fr'], voixDefaut: 'kalimat_fr',
      sujet: { label: 'Ce qu\'on met en avant', placeholder: 'ex. les modes de révision, la série de jours' },
      consignes: 'Pub produit d\'au moins 40 s : la voix présente l\'app (elle ne lit pas l\'écran), scènes qui respirent, couleurs Kalimat.' },
    { id: 'teaser', titre: 'Teaser', detail: '15 s · rapide', serie: 'Pubs Kalimat', format: '1920x1080', duree: 15,
      voix: ['kalimat_fr'], voixDefaut: 'kalimat_fr', sujet: { label: 'Idée', placeholder: 'ex. annonce de la mise à jour' },
      consignes: 'Teaser court : 4 à 5 moments forts, pas plus, couleurs Kalimat.' },
    { id: 'dialogue', titre: 'Dialogue', detail: 'Conversation en arabe', bientot: true, serie: 'Dialogues Kalimat', format: '1080x1920', duree: 45,
      voix: ['kalimat_ar_fr'], voixDefaut: 'kalimat_ar_fr', sujet: { label: 'Situation', placeholder: 'ex. au café' }, consignes: '' },
    { id: 'audio', titre: 'Audio', detail: 'Écoute et répète', bientot: true, serie: 'Audios Kalimat', format: '1080x1920', duree: 30,
      voix: ['kalimat_ar'], voixDefaut: 'kalimat_ar', sujet: { label: 'Mots', placeholder: 'ex. les jours de la semaine' }, consignes: '' },
  ],
  Lumora: [
    { id: 'pub_apple', titre: 'Pub « style Apple »', detail: '30 s · noir et blanc', serie: 'Pubs Lumora', format: '1920x1080', duree: 30,
      voix: VOIX_PRESENTATION, voixDefaut: 'presentation_fr', sujet: { label: 'Ce qu\'on met en avant', placeholder: 'ex. les sites vitrines' },
      consignes: 'Identité Lumora : noir, gris, blanc, aucune couleur d\'accent, Geist + Instrument Serif italique.' },
    { id: 'post_reseaux', titre: 'Post réseaux', detail: '15 s · vertical', serie: 'Posts Lumora', format: '1080x1920', duree: 15,
      voix: VOIX_PRESENTATION, voixDefaut: null, sujet: { label: 'Message', placeholder: 'ex. nouvelle réalisation livrée' }, consignes: 'Identité Lumora.' },
  ],
  // tout autre client (clients de Flow ou nouveau client)
  '*': [
    { id: 'pub_produit', titre: 'Pub produit', detail: '40 s · présente le produit', serie: 'Pubs', format: '1920x1080', duree: 40,
      voix: VOIX_PRESENTATION, voixDefaut: 'presentation_fr', sujet: { label: 'Produit et message', placeholder: 'ex. l\'application, ses 3 points forts' },
      consignes: 'Pub produit d\'au moins 40 s, la voix présente le produit, couleurs et polices de la marque du client.' },
    { id: 'presentation', titre: 'Présentation', detail: '30 s · l\'entreprise', serie: 'Présentations', format: '1920x1080', duree: 30,
      voix: VOIX_PRESENTATION, voixDefaut: 'presentation_fr', sujet: { label: 'Ce qu\'on présente', placeholder: 'ex. le studio, ses services' }, consignes: '' },
    { id: 'post_reseaux', titre: 'Post réseaux', detail: '15 s · vertical', serie: 'Posts', format: '1080x1920', duree: 15,
      voix: VOIX_PRESENTATION, voixDefaut: null, sujet: { label: 'Message', placeholder: 'ex. offre du mois' }, consignes: '' },
    { id: 'logo_anime', titre: 'Logo animé', detail: '6 s · intro / fin', format: '1920x1080', duree: 6,
      voix: VOIX_PRESENTATION, voixDefaut: null, sujet: { label: 'Style', placeholder: 'ex. sobre, lumineux' }, consignes: 'Animation du logo, sans voix par défaut.' },
  ],
}

export const modelesDe = (client: string) => MODELES[client] ?? MODELES['*']
/** série réelle d'un modèle pour un client : « Pubs » → « Pubs Nahim » */
export const serieDe = (m: Modele, client: string) => (m.serie ? (m.serie.includes(client) || client === 'Kalimat' || client === 'Lumora' ? m.serie : `${m.serie} ${client}`) : '')
export const FORMATS: { id: Format; titre: string }[] = [
  { id: '1080x1920', titre: 'Vertical 9:16' }, { id: '1920x1080', titre: 'Horizontal 16:9' }, { id: '1080x1080', titre: 'Carré 1:1' },
]
