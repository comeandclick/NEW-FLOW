/** Project templates: a project plus its starter tasks. Titles are written per language, not machine-translated. */
export type Template = {
  id: string
  color: string
  name: { fr: string; en: string }
  description: { fr: string; en: string }
  tasks: { fr: string; en: string; priority?: 'low' | 'medium' | 'high' | 'urgent'; day?: number }[]
}

export const TEMPLATES: Template[] = [
  {
    id: 'ios-release', color: '#6366f1',
    name: { fr: 'Sortie d’une version iOS', en: 'iOS app release' },
    description: { fr: 'De la build candidate à la mise en ligne sur l’App Store.', en: 'From release candidate to the App Store.' },
    tasks: [
      { fr: 'Geler les fonctionnalités et créer la branche de release', en: 'Freeze features and cut the release branch', priority: 'high', day: 0 },
      { fr: 'Passer la matrice d’appareils (petit/grand iPhone, iOS min. et dernier)', en: 'Run the device matrix (small/large iPhone, min and latest iOS)', day: 2 },
      { fr: 'Tester les achats intégrés et la restauration en TestFlight', en: 'Test in-app purchases and restore in TestFlight', priority: 'high', day: 3 },
      { fr: 'Vérifier hors-ligne, mode avion et reprise de session', en: 'Check offline, airplane mode and session resume', day: 3 },
      { fr: 'Incrémenter la version et le numéro de build', en: 'Bump version and build number', day: 4 },
      { fr: 'Archiver et envoyer la build à TestFlight', en: 'Archive and upload the build to TestFlight', priority: 'high', day: 4 },
      { fr: 'Rédiger les notes « Quoi tester » (≤ 4 000 caractères) dans chaque langue', en: 'Write “What to Test” notes (≤ 4,000 chars) per language', day: 4 },
      { fr: 'Recueillir les retours des testeurs et corriger les blocants', en: 'Collect tester feedback and fix blockers', priority: 'high', day: 7 },
      { fr: 'Mettre à jour captures d’écran, description et mots-clés', en: 'Update screenshots, description and keywords', day: 8 },
      { fr: 'Vérifier les étiquettes de confidentialité et les mentions légales', en: 'Review privacy labels and legal notices', day: 8 },
      { fr: 'Rédiger les notes de version (FR/EN)', en: 'Write release notes (FR/EN)', day: 9 },
      { fr: 'Soumettre à la revue App Review', en: 'Submit to App Review', priority: 'urgent', day: 10 },
      { fr: 'Surveiller les plantages et les avis les 48 premières heures', en: 'Watch crashes and reviews for the first 48 hours', day: 13 },
    ],
  },
  {
    id: 'sprint', color: '#22c55e',
    name: { fr: 'Sprint de deux semaines', en: 'Two-week sprint' },
    description: { fr: 'Planification, suivi et rétrospective.', en: 'Planning, tracking and retrospective.' },
    tasks: [
      { fr: 'Choisir l’objectif du sprint', en: 'Pick the sprint goal', priority: 'high', day: 0 },
      { fr: 'Estimer et ordonner le backlog', en: 'Estimate and order the backlog', day: 0 },
      { fr: 'Point rapide quotidien (15 min)', en: 'Daily stand-up (15 min)', day: 1 },
      { fr: 'Revue de milieu de sprint', en: 'Mid-sprint check-in', day: 7 },
      { fr: 'Démo des livrables', en: 'Demo the deliverables', day: 13 },
      { fr: 'Rétrospective : garder, arrêter, essayer', en: 'Retrospective: keep, stop, try', day: 14 },
    ],
  },
  {
    id: 'launch', color: '#f97316',
    name: { fr: 'Lancement d’un produit', en: 'Product launch' },
    description: { fr: 'Les jalons essentiels d’un lancement public.', en: 'Key milestones of a public launch.' },
    tasks: [
      { fr: 'Définir la promesse et le public visé', en: 'Define the promise and the audience', priority: 'high', day: 0 },
      { fr: 'Préparer la page de présentation', en: 'Prepare the landing page', day: 5 },
      { fr: 'Rédiger l’annonce et les messages pour les réseaux', en: 'Write the announcement and social posts', day: 8 },
      { fr: 'Inviter une première vague de testeurs', en: 'Invite a first wave of testers', day: 10 },
      { fr: 'Corriger les retours de la première vague', en: 'Fix first-wave feedback', priority: 'high', day: 17 },
      { fr: 'Jour J : publier et répondre aux premiers retours', en: 'Launch day: publish and answer first feedback', priority: 'urgent', day: 21 },
      { fr: 'Bilan à une semaine', en: 'One-week review', day: 28 },
    ],
  },
  {
    id: 'client', color: '#0ea5e9',
    name: { fr: 'Accueil d’un nouveau client', en: 'New client onboarding' },
    description: { fr: 'De la signature au premier résultat.', en: 'From signature to first result.' },
    tasks: [
      { fr: 'Envoyer le message de bienvenue', en: 'Send the welcome message', day: 0 },
      { fr: 'Appel de cadrage : objectifs et contraintes', en: 'Kick-off call: goals and constraints', priority: 'high', day: 2 },
      { fr: 'Partager le plan et le calendrier', en: 'Share the plan and timeline', day: 4 },
      { fr: 'Créer l’espace partagé et inviter le client', en: 'Create the shared space and invite the client', day: 4 },
      { fr: 'Livrer le premier résultat', en: 'Deliver the first result', priority: 'high', day: 14 },
      { fr: 'Demander un retour', en: 'Ask for feedback', day: 16 },
    ],
  },
]
