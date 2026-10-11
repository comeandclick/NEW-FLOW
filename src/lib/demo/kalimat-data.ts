/**
 * Kalimat workspace content, extracted from the real project docs
 * (~/kalimat2: TODO.md, PLAN.md, DECISIONS.md, ARCHITECTURE.md, LANCEMENT.md, AGENTS.md
 *  ~/Developer/kalimat/docs: BUSINESS_PLAN, TESTFLIGHT_PREPARATION, KALIMAT_ANALYSE_RESTANT,
 *  AUDIT_PROGRESS, WEB_PARITY_TODO, HANDOFF, CHANGELOG).
 *
 * Dependency-free on purpose: it is imported both by the demo seed (browser) and by
 * scripts/seed-kalimat.mjs (Node, to load the same data in a real account).
 */

export type KStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done'
export type KPriority = 'low' | 'medium' | 'high' | 'urgent'

export const KALIMAT_NAME = 'Kalimat'
export const KALIMAT_SLUG = 'kalimat'

export const projects = [
  { key: 'v2', name: 'Kalimat 2.0 (Flutter)', color: '#6366f1', description: 'Réécriture complète de l’app mobile en Flutter/Dart + Riverpod + go_router, sur le même Supabase que la 1.0.' },
  { key: 'v1', name: 'Kalimat 1.0 (web + Expo)', color: '#22c55e', description: 'Site Next.js 14 (kalimat.site) et app mobile Expo en production. Backend Supabase partagé.' },
  { key: 'launch', name: 'Publication & business', color: '#f97316', description: 'Compte Apple Developer, TestFlight, App Store, paiements, modèle freemium Kalimat+.' },
] as const

type T = { title: string; status: KStatus; priority?: KPriority; project: 'v2' | 'v1' | 'launch'; tags?: string[]; description?: string; due?: number }

/** `due` = days from today. Sources are cited in each description. */
export const tasks: T[] = [
  // ── 2.0 : fait (✅ dans TODO.md) ──
  { title: 'Parcours d’arrivée : mode invité, onboarding 13 étapes, étape abonnement', status: 'done', project: 'v2', tags: ['onboarding'], description: 'TODO.md §B.1 et §B.3 — vérifié sur simulateur vierge.' },
  { title: 'Alphabet et Chiffres (pages + accès depuis Cours)', status: 'done', project: 'v2', tags: ['contenu'], description: 'TODO.md §C.' },
  { title: 'Kalimat AI : discussion, exercices guidés, traduction, mode vocal', status: 'done', priority: 'high', project: 'v2', tags: ['ia'], description: 'Mode vocal (speech_to_text ar-SA) ajouté ; dictée réelle non testée faute de micro sur le simulateur. TODO.md §-5.' },
  { title: 'Lecture interactive (liste, texte, analyse de mot par IA, mini-quiz)', status: 'done', project: 'v2', tags: ['contenu', 'ia'], description: 'TODO.md §C.' },
  { title: 'Exercices : phrase à compléter, remettre en ordre, dialogues, mini-jeux (mémoire, chasse, tri, combo, intrus)', status: 'done', project: 'v2', tags: ['exercices'], description: 'TODO.md §D — modules enregistrés sous `phrase` (contrainte DB de la 1.0).' },
  { title: 'Leçons de grammaire et d’alphabet avant les cercles', status: 'done', project: 'v2', tags: ['exercices'], description: 'TODO.md §D.' },
  { title: 'Gamification : séries, gel et réparation de série, quêtes, défis, succès, boutique, pass', status: 'done', project: 'v2', tags: ['gamification'], description: 'TODO.md §B.6 et §E.' },
  { title: 'Notifications : liste temps réel + rappels locaux (phrase du jour, série en danger, récap)', status: 'done', project: 'v2', tags: ['notifications'], description: 'TODO.md §B.7.' },
  { title: 'Amis, classement général/saison, ligues', status: 'done', project: 'v2', tags: ['social'], description: 'TODO.md §B.8 et §B.9. Reste : import des contacts.' },
  { title: 'Mode sombre complet (~590 appels convertis sur 71 fichiers)', status: 'done', project: 'v2', tags: ['design'], description: 'Vérifié en direct. Accent vert → or en sombre. TODO.md §2 et §2bis.' },
  { title: 'Parrainage', status: 'done', project: 'v2', tags: ['gamification'], description: 'Page dédiée, vérifié en direct. Bug `attempts` 42501 corrigé en prod via trigger SECURITY DEFINER.' },
  { title: 'Reprise d’une session d’exercices interrompue', status: 'done', project: 'v2', tags: ['exercices'] },
  { title: 'Polices arabes : Système / Amiri / Lateef (comme la 1.0)', status: 'done', project: 'v2', tags: ['design'], description: 'Choix dans Réglages > Accessibilité > Police arabe.' },
  { title: 'Chargement : les 4 onglets se préchargent en parallèle pendant le splash', status: 'done', project: 'v2', tags: ['perf'], description: 'core/providers/warmup.dart — Accueil et Carnet s’affichent déjà remplis.' },
  { title: 'Quiz en direct (PIN, lobby, compte à rebours serveur, classement)', status: 'done', project: 'v2', tags: ['social', 'temps-réel'], description: 'Réécrit sur l’API publique, vérifié contre une vraie salle. TODO.md §-8.' },
  { title: 'Forum (liste, questions, réponses, signaler/bloquer)', status: 'done', project: 'v2', tags: ['social'], description: 'Écriture (publier) non testée sur la base de prod.' },
  { title: 'Thèmes de vocabulaire (7 thèmes)', status: 'done', project: 'v2', tags: ['contenu'] },
  { title: 'Groupes (clans) : liste, détail, défi hebdo, discussion temps réel', status: 'done', project: 'v2', tags: ['social'], description: 'Détail et chat non testés (nécessite de créer un groupe en prod).' },
  { title: 'Duels en direct (4 modes, invitation globale, revanche)', status: 'done', project: 'v2', tags: ['social', 'temps-réel'], description: 'Duel complet non testé (besoin de 2 comptes).' },
  { title: 'Système de classes : élève et enseignant', status: 'done', project: 'v2', tags: ['classes'], description: 'Élève : ma-classe, rejoindre, devoir. Enseignant : dashboard, classe, bulletin, rapport. Non testé sur simulateur.' },
  { title: 'Films, séries et Stories portés de la 1.0', status: 'done', project: 'v2', tags: ['contenu'], description: 'Aucun contenu affiché : les 15 vidéos sont `is_published=false` et les 7 stories sont expirées.' },
  { title: 'Cartes imprimables (package `printing`)', status: 'done', project: 'v2', tags: ['contenu'] },
  { title: 'Confidentialité : profil public, masquer du classement, verrouillage biométrique, export RGPD', status: 'done', project: 'v2', tags: ['sécurité'] },
  { title: 'Overlays globaux : présence /api/heartbeat, annonces, écran « Encore une étape »', status: 'done', project: 'v2', tags: ['plateforme'] },
  { title: 'Réinitialisation du mot de passe (deep link kalimat://reset-password)', status: 'done', project: 'v2', tags: ['auth'], description: 'Vérifié de bout en bout.' },
  { title: 'Popups d’arrivée : phrase du jour, bon retour, série, cours terminé, essai Premium, rappel express', status: 'done', project: 'v2', tags: ['gamification'] },
  { title: 'Push notifications (Firebase) : infrastructure posée', status: 'done', project: 'v2', tags: ['notifications'], description: 'Inerte sans compte Apple Developer payant / GoogleService-Info.plist.' },
  { title: 'Fichier StoreKit local pour tester un achat de bout en bout', status: 'done', project: 'v2', tags: ['paiements'] },
  { title: 'Nettoyage : tirets longs retirés, doublons Réglages supprimés', status: 'done', project: 'v2', tags: ['qualité'], description: 'TODO.md §-10 (2026-10-08). `flutter analyze` : 0 issue.' },

  // ── 2.0 : à faire / à vérifier ──
  { title: 'Tester réellement la connexion Google et Apple', status: 'todo', priority: 'high', project: 'v2', tags: ['auth', 'qa'], due: 3, description: 'TODO.md §F et §B.2 : je ne crée pas de compte sur la base de prod, test à faire par toi.' },
  { title: 'Vérifier à l’écran : Cours, Chapitre, Détail du cours, Boutique, Premium, Pass, Statistiques', status: 'todo', project: 'v2', tags: ['qa'], due: 2, description: 'TODO.md §F.' },
  { title: 'Mode hors-ligne : téléchargement des cours pour usage 100 % hors-ligne', status: 'in_progress', priority: 'high', project: 'v2', tags: ['hors-ligne'], description: 'File d’attente des tentatives et voix en cache faites ; reste le cache de contenu. TODO.md §E.' },
  { title: 'Tester la bannière hors-ligne en conditions réelles (réseau coupé)', status: 'todo', project: 'v2', tags: ['hors-ligne', 'qa'] },
  { title: 'Lecteur de films : tester avec de vraies données', status: 'backlog', project: 'v2', tags: ['contenu', 'qa'], description: 'Les 15 vidéos sont non publiées en base.' },
  { title: 'Tester la vue enseignant connecté et les classes de bout en bout', status: 'todo', project: 'v2', tags: ['classes', 'qa'], description: 'Pas d’identifiants enseignant disponibles.' },
  { title: 'Tester un duel complet avec deux comptes', status: 'backlog', project: 'v2', tags: ['social', 'qa'] },
  { title: 'Tester le détail d’un groupe et son chat (créer un groupe en prod)', status: 'backlog', project: 'v2', tags: ['social', 'qa'] },
  { title: 'Corriger `KalimatApi.patch` : envoie un GET', status: 'todo', priority: 'medium', project: 'v2', tags: ['bug'], description: 'Bug connu, non utilisé par le quiz. TODO.md §-8.' },
  { title: 'Export RGPD en mobile : endpoint 1.0 en cookie seul (401)', status: 'backlog', project: 'v2', tags: ['sécurité', 'bloqué'], description: 'Fix hors scope sans autorisation explicite (règle d’isolation avec la 1.0).' },
  { title: 'Import des contacts pour trouver des amis', status: 'backlog', project: 'v2', tags: ['social'], description: 'TODO.md §B.8.' },
  { title: 'Nudge « mise à jour disponible » et annonces', status: 'backlog', project: 'v2', tags: ['plateforme'], description: 'Nécessite de vérifier la source de contenu côté Supabase.' },
  { title: 'Certificats, contrat de la semaine, jeu bonus : décider du portage', status: 'backlog', project: 'v2', tags: ['gamification'], description: 'Certificats désactivés en 1.0 ; contrat de la semaine fait côté réglages.' },
  { title: 'Lien externe vers la page don du site (clarifier)', status: 'backlog', priority: 'low', project: 'v2', tags: ['paiements'], description: 'Hors scope mobile : StoreKit ne couvre que Premium.' },
  { title: 'Écrire les tests automatisés (sessions, parcours, calcul XP/série)', status: 'todo', priority: 'high', project: 'v2', tags: ['qualité'], due: 14, description: 'PLAN.md §13 : tests sur chaque fonctionnalité critique (auth, écriture d’attempts, XP/série).' },
  { title: 'Icône, écran de lancement, nom définitif', status: 'todo', project: 'v2', tags: ['design'], due: 10, description: 'flutter_launcher_icons + flutter_native_splash. TODO.md §G.' },
  { title: 'Phase 21 : accessibilité, biométrie, polish final', status: 'backlog', project: 'v2', tags: ['accessibilité'], description: 'PLAN.md — dernière phase avant « app finie ».' },
  { title: 'Déployer les modifications du prompt IA (aiChat.ts) — actuellement locales', status: 'todo', priority: 'medium', project: 'v2', tags: ['ia'], description: 'Guidage par exercice, mode vocal, modèle gpt-oss-120b + repli 20b. Non commité/déployé : demander l’accord.' },
  { title: 'Compte de test à 0 min de quota IA gratuit : réalimenter', status: 'todo', priority: 'low', project: 'v2', tags: ['ia', 'qa'] },

  // ── 1.0 / web ──
  { title: 'Web ↔ mobile : splash + version + changelog (overlay du mobile)', status: 'todo', project: 'v1', tags: ['parité'], description: 'WEB_PARITY_TODO.md phase 1.' },
  { title: 'Web : vérifier zéro emoji dans l’interface', status: 'todo', project: 'v1', tags: ['parité', 'design'] },
  { title: 'Web phase 2 : Accueil/Parcours, Révision, Cours, Profil au design mobile', status: 'in_progress', priority: 'high', project: 'v1', tags: ['parité', 'design'], description: 'Palette sombre alignée, système de relief et boutons faits (phase 1).' },
  { title: 'Web phase 3 : Paramètres, Boutique, Abonnement, Alphabet, Dictionnaire, Films, Forum, Amis, Classement…', status: 'backlog', project: 'v1', tags: ['parité'] },
  { title: 'Boutique : perf d’ouverture — une seule route batchée cache-first', status: 'backlog', project: 'v1', tags: ['perf'], description: 'Aujourd’hui 3 requêtes parallèles (gems, cosmétiques, offre flash).' },
  { title: 'Pass Kalimat : refonte visuelle des paliers', status: 'backlog', project: 'v1', tags: ['design'], description: 'Demande de passe design avec maquettes.' },
  { title: 'Auditer les autres écrans pour l’anti-pattern `.in(\'course_id\', ...)` sur grandes listes', status: 'backlog', project: 'v1', tags: ['perf'] },
  { title: 'Test de placement adaptatif à 15 questions branché sur `placement_niveau`', status: 'backlog', project: 'v1', tags: ['gamification'], description: 'Aujourd’hui : auto-déclaratif à 11 choix, déconnecté du test d’onboarding.' },
  { title: 'Enrichir les phrases et dialogues (7–9 par chapitre)', status: 'backlog', project: 'v1', tags: ['contenu'] },
  { title: 'Coffre de fin de chapitre : porter le système du web sur mobile', status: 'backlog', project: 'v1', tags: ['gamification'] },
  { title: 'iPad : vérifier les 17 usages de `Dimensions.get(\'window\')`', status: 'backlog', project: 'v1', tags: ['qa'], description: 'Risque de layout cassé, nécessite un test sur simulateur iPad.' },
  { title: 'Traduction EN / ES / DE', status: 'backlog', priority: 'low', project: 'v1', tags: ['i18n'], description: 'Décision reportée (« on verra plus tard »).' },
  { title: '60 fonctionnalités restantes de la liste 100 idées', status: 'backlog', priority: 'low', project: 'v1', tags: ['produit'], description: 'Jamais reprises depuis le batch du 2026-06-20.' },

  // ── Publication ──
  { title: 'Activer le compte Apple Developer payant (Team ID)', status: 'todo', priority: 'urgent', project: 'launch', tags: ['apple', 'bloquant'], due: 7, description: 'Bloque TestFlight, App Store, push APNs réel, Sign in with Apple. Attendre l’e-mail « Welcome to the Apple Developer Program ».' },
  { title: 'Sign in with Apple : Services ID, Key ID, clé .p8', status: 'backlog', priority: 'high', project: 'launch', tags: ['apple', 'auth'], description: 'Code prêt, bouton caché ; `usesAppleSignIn: true` dans app.json après le Team ID.' },
  { title: 'Push APNs : remettre `aps-environment` et créer la clé APNs', status: 'backlog', project: 'launch', tags: ['apple', 'notifications'] },
  { title: 'RevenueCat réel : clé `appl_…`, webhook, supprimer `mock-purchase`', status: 'backlog', priority: 'high', project: 'launch', tags: ['paiements'], description: 'Les achats tournent encore en mode simulé. 9 produits à créer (voir APP_STORE_CONNECT.md §7).' },
  { title: 'Créer l’app dans App Store Connect (com.kalimat.new.app)', status: 'backlog', project: 'launch', tags: ['apple'] },
  { title: 'Archive Xcode + upload du premier build TestFlight', status: 'backlog', project: 'launch', tags: ['apple'] },
  { title: 'Inviter le collègue testeur (TestFlight interne)', status: 'backlog', project: 'launch', tags: ['apple', 'qa'] },
  { title: 'Vérifier le compte de démonstration apple.review@kalimat.site', status: 'todo', project: 'launch', tags: ['qa'], description: 'TESTFLIGHT_PREPARATION.md — checklist avant envoi aux testeurs.' },
  { title: 'Tenir la promesse de modération du forum sous 24 h', status: 'todo', project: 'launch', tags: ['légal'] },
  { title: 'Mentions légales : compléter SIRET et siège social', status: 'todo', priority: 'high', project: 'launch', tags: ['légal'] },
  { title: 'Checklist finale App Store Connect + tableau App Privacy', status: 'backlog', project: 'launch', tags: ['apple', 'légal'], description: 'AUDIT_PROGRESS.md : ~83 tables pas encore inspectées pour la confidentialité.' },
  { title: 'Accessibilité VoiceOver : passage exhaustif', status: 'backlog', project: 'launch', tags: ['accessibilité'] },
  { title: 'Soumission App Store (uniquement avec accord explicite)', status: 'backlog', priority: 'high', project: 'launch', tags: ['apple'], description: 'Règle dure : jamais d’envoi sur App Store Connect sans autorisation.' },
  { title: 'Lancement public + premiers contenus TikTok réguliers', status: 'backlog', project: 'launch', tags: ['marketing'], description: 'BUSINESS_PLAN.md §9.' },
  { title: 'Câbler les abonnements web (Stripe)', status: 'backlog', project: 'launch', tags: ['paiements'] },
]

export const channels = [
  { name: 'general', description: 'Annonces et suivi quotidien' },
  { name: 'app-2-0', description: 'Kalimat 2.0 (Flutter)' },
  { name: 'publication', description: 'TestFlight, App Store, paiements' },
]

export const messages: { channel: string; minutesAgo: number; text: string }[] = [
  { channel: 'general', minutesAgo: 2400, text: 'Bienvenue dans l’espace Kalimat. Toutes les tâches viennent de TODO.md et des docs du projet.' },
  { channel: 'app-2-0', minutesAgo: 600, text: 'Quiz de classe unifié déployé sur kalimat.site : même salle que le quiz public, l’enseignant pilote sans clé d’hôte.' },
  { channel: 'app-2-0', minutesAgo: 420, text: '`flutter analyze` : 0 issue après le nettoyage des tirets longs et des doublons de réglages.' },
  { channel: 'publication', minutesAgo: 300, text: 'En attente de la confirmation d’Apple pour le compte Developer : sans elle, pas de TestFlight ni de Sign in with Apple.' },
]

/** Calendar: past milestones use absolute dates (from the docs), upcoming sessions are offsets in days. */
export const events: { title: string; description?: string; at: string | number; start: number; end: number; color: string; allDay?: boolean; location?: string }[] = [
  { title: 'Kalimat 2.0 : squelette Flutter posé', description: 'Splash + barre 3 onglets, JDK, Android SDK, émulateur et dépôt GitHub configurés (LANCEMENT.md).', at: '2026-10-03', start: 9, end: 10, color: '#6366f1' },
  { title: 'Décisions d’architecture et isolation avec la 1.0', description: 'DECISIONS.md : Sign in with Apple, langue, Realtime, design tokens, isolation stricte.', at: '2026-10-04', start: 10, end: 12, color: '#8b5cf6' },
  { title: 'Plan de développement 2.0 (22 phases) rédigé', at: '2026-10-04', start: 14, end: 16, color: '#8b5cf6' },
  { title: 'Portage 1.0 → 2.0 : quiz, forum, clans, duels, thèmes, cartes', description: 'Session autonome, analyze 0 issue (TODO.md §-4).', at: '2026-10-08', start: 9, end: 12, color: '#22c55e' },
  { title: 'Quiz de classe unifié déployé sur kalimat.site', at: '2026-10-08', start: 13, end: 14, color: '#22c55e' },
  { title: 'Nettoyage : tirets longs, doublons, étoile Premium', at: '2026-10-08', start: 16, end: 17, color: '#14b8a6' },
  { title: 'Session de test : connexion Google et Apple', description: 'À faire par toi (je ne crée pas de compte sur la base de prod).', at: 3, start: 10, end: 11, color: '#ef4444' },
  { title: 'Vérification à l’écran : Cours, Boutique, Premium, Pass, Stats', at: 2, start: 14, end: 16, color: '#f97316' },
  { title: 'Écrire les tests automatisés (sessions, parcours)', at: 5, start: 9, end: 12, color: '#0ea5e9' },
  { title: 'Relire l’ordre des opérations TestFlight', description: 'TESTFLIGHT_PREPARATION.md, tableau en 8 étapes.', at: 6, start: 11, end: 12, color: '#f97316' },
  { title: 'Activation du compte Apple Developer (Team ID)', description: 'Dès réception de l’e-mail d’Apple. Débloque TestFlight, push, Sign in with Apple.', at: 7, start: 0, end: 0, color: '#ef4444', allDay: true },
  { title: 'Icône, écran de lancement, nom définitif', at: 10, start: 10, end: 12, color: '#ec4899' },
  { title: 'Premier build TestFlight (si compte actif)', at: 14, start: 10, end: 12, color: '#ef4444' },
  { title: 'Revue du modèle économique Kalimat+ (4,99 €/mois, 45,99 €/an)', at: 12, start: 15, end: 16, color: '#eab308' },
]

export const goals = [
  {
    title: 'Publier Kalimat 2.0 sur l’App Store', color: '#ef4444', due: 120, target: 6, current: 0, unit: 'jalons',
    description: 'Compte Apple Developer, Sign in with Apple, vrais paiements, tests automatisés, TestFlight, soumission (avec accord explicite).',
    krs: [
      { title: 'Compte Apple Developer payant actif', target: 1, current: 0, unit: '' },
      { title: 'Sign in with Apple opérationnel', target: 1, current: 0, unit: '' },
      { title: 'RevenueCat réel branché (sans mock)', target: 1, current: 0, unit: '' },
      { title: 'Tests automatisés sur auth, attempts, XP/série', target: 1, current: 0, unit: '' },
      { title: 'Build TestFlight installé par un testeur', target: 1, current: 0, unit: '' },
      { title: 'Soumission App Store', target: 1, current: 0, unit: '' },
    ],
  },
  {
    title: 'Parité fonctionnelle 2.0 avec la 1.0', color: '#6366f1', due: 45, target: 100, current: 80, unit: '%',
    description: 'Phases 1–21 du plan. Estimation à partir des ✅ de TODO.md ; les blocs sociaux et classes restent non testés en réel.',
    krs: [
      { title: 'Auth, onboarding, exercices, gamification', target: 100, current: 95, unit: '%' },
      { title: 'Social : amis, clans, forum, duels, quiz', target: 100, current: 85, unit: '%' },
      { title: 'Classes élève et enseignant', target: 100, current: 65, unit: '%' },
      { title: 'Films et stories (contenu à publier)', target: 100, current: 50, unit: '%' },
      { title: 'Mode hors-ligne 100 %', target: 100, current: 60, unit: '%' },
    ],
  },
  {
    title: 'Qualité : zéro régression', color: '#22c55e', due: 30, target: 100, current: 55, unit: '%',
    description: '`flutter analyze` à 0 issue (atteint) et vérification en direct de chaque système.',
    krs: [
      { title: '`flutter analyze` : 0 issue', target: 1, current: 1, unit: '' },
      { title: 'Écrans vérifiés en direct sur simulateur / iPhone', target: 100, current: 60, unit: '%' },
      { title: 'Tests automatisés écrits', target: 100, current: 0, unit: '%' },
    ],
  },
  {
    title: 'Lancer le modèle freemium Kalimat+', color: '#eab308', due: 180, target: 4, current: 1, unit: 'étapes',
    description: 'Gratuit (curriculum complet + 6 modes), Kalimat+ 4,99 €/mois, 45,99 €/an, familial 99 €/an, accès à vie 149,99 €.',
    krs: [
      { title: 'Grille tarifaire validée (/tarifs)', target: 1, current: 1, unit: '' },
      { title: 'Abonnements web câblés (Stripe)', target: 1, current: 0, unit: '' },
      { title: 'Abonnements iOS (RevenueCat)', target: 1, current: 0, unit: '' },
      { title: 'Premiers contenus TikTok réguliers', target: 1, current: 0, unit: '' },
    ],
  },
] as const

/** Real files to upload with scripts/seed-kalimat.mjs (paths relative to $HOME). Demo uses placeholders. */
export const files = [
  { name: 'AGENTS.md', folder: '/Kalimat 2.0', src: 'kalimat2/AGENTS.md', mime: 'text/markdown' },
  { name: 'PLAN.md', folder: '/Kalimat 2.0', src: 'kalimat2/PLAN.md', mime: 'text/markdown' },
  { name: 'ARCHITECTURE.md', folder: '/Kalimat 2.0', src: 'kalimat2/ARCHITECTURE.md', mime: 'text/markdown' },
  { name: 'DECISIONS.md', folder: '/Kalimat 2.0', src: 'kalimat2/DECISIONS.md', mime: 'text/markdown' },
  { name: 'TODO.md', folder: '/Kalimat 2.0', src: 'kalimat2/TODO.md', mime: 'text/markdown' },
  { name: 'LANCEMENT.md', folder: '/Kalimat 2.0', src: 'kalimat2/LANCEMENT.md', mime: 'text/markdown' },
  { name: 'BUSINESS_PLAN.md', folder: '/Business', src: 'Developer/kalimat/docs/BUSINESS_PLAN.md', mime: 'text/markdown' },
  { name: 'TESTFLIGHT_PREPARATION.md', folder: '/Publication', src: 'Developer/kalimat/docs/TESTFLIGHT_PREPARATION.md', mime: 'text/markdown' },
  { name: 'KALIMAT_ANALYSE_RESTANT.md', folder: '/Kalimat 1.0', src: 'Developer/kalimat/docs/KALIMAT_ANALYSE_RESTANT.md', mime: 'text/markdown' },
  { name: 'WEB_PARITY_TODO.md', folder: '/Kalimat 1.0', src: 'Developer/kalimat/docs/WEB_PARITY_TODO.md', mime: 'text/markdown' },
  { name: 'AUDIT_PROGRESS.md', folder: '/Publication', src: 'Developer/kalimat/docs/AUDIT_PROGRESS.md', mime: 'text/markdown' },
  { name: 'HANDOFF.md', folder: '/Kalimat 1.0', src: 'Developer/kalimat/docs/HANDOFF.md', mime: 'text/markdown' },
  { name: 'CHANGELOG.md', folder: '/Kalimat 1.0', src: 'Developer/kalimat/CHANGELOG.md', mime: 'text/markdown' },
] as const

type N = { title: string; icon: string; kind: 'note' | 'doc' | 'wiki'; tags: string[]; pinned?: boolean; project?: 'v2' | 'v1' | 'launch'; md: string }

export const notes: N[] = [
  {
    title: 'Kalimat : vue d’ensemble', icon: '🧭', kind: 'wiki', tags: ['référence'], pinned: true, md: `# Kalimat : vue d’ensemble
Application pour apprendre l’arabe, pensée pour les francophones : gamification façon Duolingo, mais avec une vraie progression grammaticale, les voyelles (harakat) affichées et un alphabet complet.

## Les trois produits
- **Site web** (Next.js 14, App Router) : kalimat.site, kalimat-pi.vercel.app et kalimat-admin.vercel.app. Trois profils : élève, enseignant, admin.
- **App mobile 1.0** (Expo / React Native, dossier \`kalimat-mobile\`) : en production, bundle \`com.kalimat.new.app\`.
- **App mobile 2.0** (Flutter / Dart, dossier \`kalimat2\`) : réécriture complète, « ultra pro et propre », animations soignées.

## Backend commun
- Un seul projet **Supabase** (\`lzbcltsxfshfguivgcji\`) partagé par le web, la 1.0 et la 2.0.
- Aucune migration nécessaire pour la 2.0 : seul le client est réécrit.
- Sauvegarde et RLS : voir la note « Règles dures et décisions ».

## Contenu
- 10 chapitres, 275 cours, 1 938 mots vérifiés, 12 modes d’exercices.
- Révision espacée, ligues, quêtes, séries, boutique, pass.` },
  {
    title: 'Règles dures et décisions', icon: '🔒', kind: 'wiki', tags: ['référence', 'règles'], pinned: true, md: `# Règles dures et décisions
## À ne jamais casser sans demander
- **Ne jamais toucher à l’app 1.0** (\`~/kalimat\` et \`kalimat-mobile\`) depuis le projet 2.0 : lecture seule, copier en lisant, jamais en éditant.
- **Jamais d’envoi sur App Store Connect** sans autorisation explicite.
- **Pas de système de vies/hearts** : supprimé volontairement, ne pas le reconstruire (les colonnes \`hearts\` en base sont vestigiales).
- **Pas d’emoji dans l’interface** mobile : des icônes et le vrai logo.
- **Ne pas toucher aux exercices, au timer ni au scoring** sans confirmation (ETAPE_SIZE, REVIEW_EVERY, seuil de maîtrise 0,8).
- Pas de compte Apple Developer payant : signature gratuite 7 jours, build Xcode local uniquement.

## Décisions d’architecture (DECISIONS.md)
- Sign in with Apple : bundle id différent, à traiter en phase 2.
- Langue : ne pas sur-construire (Système / Français, anglais plus tard).
- Realtime Supabase : pas nécessaire pour \`user_stats\`.
- Design tokens : aucun système strict à copier, on définit le sien.
- Achats : abonnement, gemmes et pass en attente de décision (phase 22).

## Stack 2.0
- Flutter stable, Riverpod (\`flutter_riverpod\` + \`riverpod_generator\`), go_router (deep links), supabase_flutter.
- Modèles : freezed + json_serializable + build_runner.
- Animations : flutter_animate, Hero, Rive si besoin. Thème custom via \`ThemeExtension\`, pas le Material par défaut.
- Qualité : very_good_analysis, \`dart format\`.` },
  {
    title: 'Plan de développement 2.0 (22 phases)', icon: '🗺️', kind: 'doc', tags: ['plan'], project: 'v2', md: `# Plan de développement 2.0
## Phases
- Phase 1 : fondations techniques
- Phase 2 : auth (login, register, OAuth, invité, mot de passe oublié)
- Phase 3 : onboarding en 13 étapes
- Phase 4 : accueil + un exercice complet (tranche verticale)
- Phase 5 : les autres types d’exercices + mini-jeux
- Phase 6 : cours et chapitres
- Phase 7 : révision / cercle (SRS)
- Phase 8 : gamification (XP, séries, quêtes, ligues, classement)
- Phase 9 : carnet, profil, statistiques, certificats
- Phase 10 : paramètres (17 écrans)
- Phase 11 : contenu secondaire (alphabet, chiffres, grammaire, thèmes)
- Phase 12 : lecture interactive
- Phase 13 : films et sous-titres
- Phase 14 : chat IA
- Phase 15 : stories et cartes imprimables
- Phase 16 : social (amis, clans, forum)
- Phase 17 : temps réel (quiz PIN, duels)
- Phase 18 : classes élève
- Phase 19 : enseignant
- Phase 20 : hors-ligne, push, sessions d’appareil
- Phase 21 : accessibilité, biométrie, polish final
- Phase 22 : monétisation (en attente de décision)

## Définition de « l’app est finie »
- Phases 1 à 21 complètes, iOS et Android.
- 17 types d’exercices et 5 mini-jeux, 12 systèmes de gamification en temps réel, 17 écrans de paramètres.
- Social complet, classes et enseignant, hors-ligne, push, biométrie.
- 0 warning \`flutter analyze\`, 0 code mort, tests sur chaque fonctionnalité critique.
- La phase 22 (monétisation) est exclue tant que tu ne redonnes pas le feu vert.` },
  {
    title: 'Relancer une session de travail', icon: '▶️', kind: 'wiki', tags: ['procédure'], project: 'v2', md: `# Relancer une session
## Un clic
L’icône « Kalimat2 Dev » au Dock lance \`scripts/start_session.sh\` : \`git pull\`, \`flutter pub get\`, VS Code, simulateur iOS, émulateur Android (\`Kalimat2_Pixel\`), puis \`flutter run\` en hot reload.

## À la main
- \`flutter doctor\` doit afficher « No issues found ».
- \`xcrun simctl boot "iPhone 17 Pro"\` puis \`flutter run -d <device-id>\`.
- Hot reload : touche r. Hot restart : R.

## Avant tout commit
- \`flutter analyze\` doit rester à 0 issue.
- \`dart format .\`
- \`flutter test\`

## Build iPhone réel (1.0)
- \`npx expo run:ios --device <UDID> --configuration Release\` (JS embarqué, marche sans le PC).
- Avec \`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8\` sinon CocoaPods plante.
- Déploiement web : \`vercel deploy --prod --yes\` depuis la racine.` },
  {
    title: 'Journal de reprise : 8 octobre 2026', icon: '📓', kind: 'note', tags: ['journal'], project: 'v2', pinned: true, md: `# Journal de reprise : 8 octobre 2026
## Nettoyage
- Tirets longs retirés des textes, doublons Phonétique/Voyelles et verrouillage biométrique supprimés des Réglages, étoile Premium visible sur l’abonnement.
- Compte de test en abonnement actif jusqu’au 2027-10-08.

## Films et stories
- Films et vidéos (séries, lecteur YouTube/vidéo, sous-titres, quiz) et Stories portés de la 1.0.
- Aucun contenu affiché : 15 vidéos non publiées, 7 stories expirées. Lecteur non testé avec de vraies données.

## Quiz de classe unifié (déployé sur kalimat.site)
- Même salle que le quiz public : l’enseignant propriétaire pilote sans clé d’hôte et peut terminer le quiz.
- App : quiz réécrit sur l’API publique, vérifié sur simulateur contre une vraie salle.

## Retouches
- Grammaire, Historique et « Prochaines fonctionnalités » supprimés ; « Exercices par thème » devient un bouton de l’onglet Cours.
- Polices arabes Amiri/Lateef posées en police principale du thème.
- Site : vitrine à la racine + /quiz, /classe, /ma-classe, /rejoindre, /enseignant, déployée via \`vercel --prod\`.

## Base de données
- Bug \`attempts\` 42501 corrigé en prod (trigger passé en SECURITY DEFINER).
- Paliers premium 3/8/13 valaient « +0 » : corrigés en gels ×2.

## À savoir
- Les modifications IA (\`aiChat.ts\`, \`route.ts\`) restent locales, non déployées.
- Compte de test à 0 minute de quota IA gratuit.` },
  {
    title: 'Préparation TestFlight', icon: '✈️', kind: 'doc', tags: ['publication'], project: 'launch', md: `# Préparation TestFlight
## Ordre des opérations (compte Apple Developer actif)
- [ ] Vérifier l’adhésion sur developer.apple.com et noter le Team ID
- [ ] Inviter le collègue dans App Store Connect (rôle Développeur ou Marketing)
- [ ] Ajouter Team ID, capacités et droits dans le projet
- [ ] Créer l’app : iOS, « Kalimat : Apprends l’arabe », français, bundle \`com.kalimat.new.app\`
- [ ] Xcode : ouvrir \`kalimat-mobile/ios/Kalimat.xcworkspace\`, équipe payante, Archive, Distribute, Upload
- [ ] Attendre le traitement du build (10 à 30 min)
- [ ] TestFlight : groupe interne « Équipe », activer le build
- [ ] Plus tard : groupe externe et revue bêta d’Apple

## Ce qui change dès le Team ID
- Sign in with Apple : \`usesAppleSignIn: true\` dans app.json.
- Push : remettre \`aps-environment\` et créer la clé APNs.
- Achats : 9 produits (4,99 / 44,99 / 9,99 / 99,99 / 149,99 à vie) et RevenueCat avec la vraie clé.

## Avant d’envoyer aux testeurs
- [ ] Compte de démonstration : vérifier la connexion
- [x] Achats simulés : garder le mode « tester »
- [ ] Vraie clé RevenueCat et webhook
- [ ] Modération du forum sous 24 h
- [ ] Mentions légales : SIRET et siège social

## En attendant
Tester via le site (kalimat.site) ou via un build Xcode sur l’iPhone du testeur (expire au bout de 7 jours).` },
  {
    title: 'Business plan : résumé', icon: '💶', kind: 'doc', tags: ['business'], project: 'launch', md: `# Business plan : résumé
## Positionnement
Entre Duolingo (cours d’arabe limité) et les méthodes académiques : rigueur pédagogique (harakat, vraie grammaire, alphabet complet) et expérience motivante et moderne.

## Modèle freemium sans publicité
- Gratuit : curriculum complet + 6 modes
- Kalimat+ mensuel : 4,99 €
- Kalimat+ annuel : 45,99 €
- Familial (5 personnes) : 10,25 €/mois ou 99 €/an
- Accès à vie (lancement) : 149,99 €

## Revenus possibles plus tard
- Licences classe/enseignant pour associations, écoles coraniques, cours du soir
- Packs de gemmes
- Contenu premium : dialectes régionaux, arabe des affaires

## Roadmap
- Actuelle : finalisation web + iOS, vitrine, liste d’attente, tarifs validés
- Court terme : lancement public, abonnements (Stripe), contenus TikTok réguliers
- Moyen terme : forum, contenu enseignant, Android si traction
- Long terme : dialectes, partenariats institutionnels

## Risques
- Rétention après la première semaine (séries et quêtes comme levier)
- Coût d’acquisition (contenu organique)
- Concurrence des plateformes gratuites
- Un seul développeur actif, pas de compte Apple payant` },
  {
    title: 'Audit App Store : ce qui reste', icon: '🔎', kind: 'doc', tags: ['publication', 'qualité'], project: 'launch', md: `# Audit App Store : ce qui reste
## Restant à faire
- Accessibilité : passage exhaustif (pas seulement un échantillon de 25 fichiers)
- iPad : 17 usages de \`Dimensions.get('window')\` à vérifier sur simulateur iPad
- Tableau App Privacy : fait pour \`profiles\` et \`screen_load_times\`, environ 83 autres tables à inspecter
- Checklist finale App Store Connect à rédiger
- Score final par catégorie

## Prochaines étapes prévues
- Audit performance : instrumenter plus d’écrans, chasser les waterfalls d’await
- Moins de skeleton loaders
- Scan sécurité : clés en dur, endpoints non protégés
- Permissions iOS (Info.plist) : utilité de chacune
- Suppression de compte et restauration des achats (obligatoire Apple)
- Rapport final : résumé, problèmes par gravité, checklist, score sur 100

## Déjà vérifié
- Sécurité : 202 routes API passées en revue, routes admin protégées par rôle, cron et push par secret
- Crashs : deux causes racines fermées (skew de version et course entre refresh et hydratation)` },
  {
    title: 'Parité web et mobile', icon: '🎨', kind: 'note', tags: ['design', 'parité'], project: 'v1', md: `# Parité design web ↔ mobile
## Convention
Le web reprend le design de l’app mobile : palette sombre alignée, système de relief (« lip »), boutons à relief par variante.

## Fait
- [x] Palette sombre alignée (globals.css)
- [x] Système de relief + variables lip clair/sombre
- [x] Composant Button avec relief par variante
- [x] CourseCard (ligne et grille)

## À faire
- [ ] Splash + version + changelog web
- [ ] Zéro emoji dans l’interface web
- [ ] Accueil/Parcours, Révision, Cours, Profil
- [ ] Paramètres, Boutique, Abonnement, Alphabet, Chiffres, Dictionnaire, Films, Forum, Amis, Classement
- [ ] Exercices (relier, complète-phrase, écoute, image, ordre)
- [ ] Défis et duels temps réel, quêtes du jour, multi-compte web
- [ ] Passage de bugs et thème clair/sombre page par page` },
  {
    title: 'Idées en vrac', icon: '💡', kind: 'note', tags: ['idées'], md: `# Idées en vrac
- Test de placement adaptatif à 15 questions branché sur \`placement_niveau\`
- Coffre de fin de chapitre sur mobile
- Boutique : route unique batchée et cache-first
- Dialectes régionaux en option
- Offre classe/enseignant B2B (associations, écoles coraniques)
- Traduction EN / ES / DE
- Lien externe vers la page don du site` },
]

// ── helpers ──────────────────────────────────────────────────────────────


export { mdToDoc } from '../md-doc'

/** Resolve an event day: absolute 'YYYY-MM-DD' or an offset in days from `now`. */
export function eventDay(at: string | number, now: Date): Date {
  if (typeof at === 'string') { const [y, m, d] = at.split('-').map(Number); return new Date(y, m - 1, d) }
  const d = new Date(now); d.setDate(d.getDate() + at); d.setHours(0, 0, 0, 0); return d
}

/** CRM: prestataires et partenaires réels du projet (pas de personnes inventées). */
export const crmContacts = [
  { key: 'apple', name: 'Apple Developer', company: 'Apple', position: 'Programme développeur', status: 'customer', tags: ['publication'], notes: 'Compte requis pour TestFlight et l’App Store (99 $/an). Sign in with Apple pour la 2.0 : ajouter le bundle id com.kalimat.v2.kalimat2.' },
  { key: 'revenuecat', name: 'RevenueCat', company: 'RevenueCat', position: 'Abonnements & achats in-app', status: 'customer', tags: ['paiement'], notes: 'Webhook côté serveur pour créditer les packs pack_s/m/l/xl. Produits liés à l’app 1.0, partagés avec la 2.0.' },
  { key: 'supabase', name: 'Supabase', company: 'Supabase', position: 'Backend partagé 1.0 / 2.0', status: 'customer', tags: ['infra'], notes: 'Auth, Postgres, Storage. Même projet pour la 1.0 et la 2.0, utilisateurs conservés.' },
  { key: 'google', name: 'Google Cloud', company: 'Google', position: 'Google Sign-In', status: 'customer', tags: ['auth'], notes: 'Console gratuite. Client OAuth pour l’app Flutter.' },
  { key: 'testers', name: 'Bêta-testeurs TestFlight', company: 'Kalimat', position: 'Groupe de test', status: 'lead', tags: ['bêta'], notes: 'À constituer avant la soumission App Store (voir TESTFLIGHT_PREPARATION).' },
] as const

export const crmDeals = [
  { title: 'Compte Apple Developer', contact: 'apple', value: 99, stage: 'négociation', probability: 70, close: 14 },
  { title: 'Abonnement Kalimat+ (RevenueCat)', contact: 'revenuecat', value: 0, stage: 'qualification', probability: 40, close: 45 },
  { title: 'Groupe de bêta-testeurs TestFlight', contact: 'testers', value: 0, stage: 'prospection', probability: 25, close: 30 },
] as const
