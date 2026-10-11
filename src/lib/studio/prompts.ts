import { QUALITIES, RATIOS, dimensions, type MotionJob, type RefItem, type SiteJob, type SiteKind } from './types'

/* ───────── Motion design : prompt réel envoyé à Claude Code ───────── */

const refLine = (r: RefItem, inbox: string) => {
  const where = r.kind === 'link' ? r.url ?? r.name : `${inbox}/${r.name}`
  const extra = r.note ? ` — ${r.note}` : ''
  const label: Record<RefItem['kind'], string> = { video: 'Vidéo de référence', image: 'Image', screen: 'Capture d\'écran', file: 'Fichier', link: 'Lien', note: 'Note' }
  return r.kind === 'note' ? `- Note : ${r.note ?? r.name}` : `- ${label[r.kind]} : ${where}${extra}`
}

export type Engine = 'auto' | 'effectcraft' | 'aftereffects' | 'remotion'

const ENGINES: Record<Exclude<Engine, 'auto'>, { check: string; build: string; rule: string }> = {
  effectcraft: {
    check: "Vérifie qu'EffectCraft répond (`python3 ~/.claude/skills/effectcraft/scripts/ec.py`). S'il n'est pas lancé, lance-le. S'il est introuvable, utilise Remotion (`~/Developer/mon-atelier/remotion-base`).",
    build: '**Construire par script** dans EffectCraft (skill `effectcraft`) à partir du modèle `motion-reference-clone/modeles/` quand il convient. Polices calées sur des largeurs mesurées. Un facteur K pour le 4K (tout est redessiné, jamais agrandi).',
    rule: "N'utilise pas After Effects (EffectCraft est le moteur choisi).",
  },
  aftereffects: {
    check: "Vérifie qu'Adobe After Effects est installé (`/Applications/Adobe After Effects *`) et qu'une licence est active (abonnement ou essai) : ouvre-le et lance un script d'essai. Si la licence est absente, bascule sur EffectCraft ou Remotion et note-le dans le rapport.",
    build: "**Construire par script ExtendScript** (`.jsx`) lancé dans After Effects par AppleScript (`osascript … DoScriptFile`), journal écrit par le script (After Effects répond toujours 0). Pièges connus : interface éventuellement en français (viser les effets par **matchName**, jamais par nom affiché), valeur hors limite = fenêtre d'erreur modale qui bloque tout, activer « Autoriser les scripts à écrire des fichiers » dans les réglages, finir par `comp.openInViewer()` et enregistrer le projet, mixer le son hors d'After Effects (ffmpeg). Rendre par la file d'attente (`renderQueue.render()`).",
    rule: "After Effects est le moteur choisi : une licence active est obligatoire ; ne dépense rien pour l'obtenir.",
  },
  remotion: {
    check: "Vérifie le projet Remotion : `~/Developer/mon-atelier/remotion-base` (`npx remotion --version`). S'il manque, crée-le (`npx create-video@latest --yes --blank remotion-base`).",
    build: "**Construire en code** avec Remotion (React) : une composition par vidéo, cadence et dimensions de la demande, positions et tailles copiées des mesures, rendu `npx remotion render` en H.264 à la définition demandée (4K : `--scale` ou composition 3840×2160 dessinée en 4K, jamais agrandie). `npx remotion ffmpeg` n'a pas les filtres fps/tile : utilise le ffmpeg du système pour les planches.",
    rule: "N'utilise pas After Effects (Remotion est le moteur choisi).",
  },
}

export type VoiceInput = { script: string; language: string; style: string }

/** Prompt de la voix off : généré automatiquement, montré à l'utilisateur, modifiable avant l'envoi. Moteur gratuit et open source : VoiceStudio. */
export function buildVoicePrompt(v: VoiceInput, durationSec: number, id = '{{ID}}'): string {
  return `## Voix off (gratuite, 100 % locale : VoiceStudio)
Texte à dire, mot pour mot :
« ${v.script.trim() || '(à rédiger par toi : court, naturel, dans la langue demandée, qui tient dans ' + durationSec + ' s)'} »

Langue : ${v.language.trim() || 'français'} · Voix / ton : ${v.style.trim() || 'chaleureuse, claire, rythme posé'}

Marche à suivre :
1. VoiceStudio (open source, https://github.com/debpalash/VoiceStudio) : s'il n'est pas installé sur ce Mac, installe l'application Electron (macOS) en suivant https://github.com/debpalash/VoiceStudio/blob/main/docs/install/agent.md. L'utilisateur autorise ici le téléchargement du modèle de voix par défaut : annonce sa taille et sa licence dans le rapport, mais n'attends aucune réponse.
2. Lance VoiceStudio, vérifie \`http://localhost:3900/health\`, découvre l'API par \`/openapi.json\`, génère la voix avec le moteur par défaut (voix intégrée, ou conçue avec « voice design » selon le ton demandé). Ne clone jamais la voix d'une vraie personne.
3. Enregistre \`~/Developer/mon-atelier/studio/${id}/sons/voix.wav\`. Vérifie à l'écoute (durée, absence de coupure, prononciation) et régénère si besoin. Durée maximale : ${durationSec} s ; sinon raccourcis le texte.
4. Cale la voix sur l'image (début de chaque phrase sur l'événement visuel correspondant), mixe-la hors de l'application de motion (ffmpeg) : voix à −16 LUFS, musique et bruitages en dessous (ducking de 8 à 10 dB pendant la voix).
5. Si VoiceStudio ne démarre pas malgré 2 tentatives, bascule sur la synthèse vocale du Mac (\`say -v Thomas -o voix.aiff\`, converti en WAV) et note-le dans le rapport.`
}

export function buildMotionPrompt(j: Pick<MotionJob, 'title' | 'brief' | 'ratio' | 'quality' | 'fps' | 'durationSec' | 'audio' | 'brand' | 'refs' | 'verify'> & { engine?: Engine; voicePrompt?: string; noQuestions?: boolean }, id = '{{ID}}'): string {
  const eng = ENGINES[j.engine && j.engine !== 'auto' ? j.engine : 'effectcraft']
  const d = dimensions(j.ratio, j.quality)
  const r = RATIOS.find((x) => x.id === j.ratio)!
  const q = QUALITIES.find((x) => x.id === j.quality)!
  const frames = Math.round(j.durationSec * j.fps)
  const audio = j.audio === 'none' ? 'Aucun son (vidéo muette).' : j.audio === 'sfx' ? 'Bruitages doux, graves, calés sur l\'image exacte de chaque événement.' : 'Musique libre de droits + bruitages doux calés sur les événements.'
  const inbox = `~/Developer/mon-atelier/studio/${id}/entrees`
  const refs = j.refs.length ? j.refs.map((x) => refLine(x, inbox)).join('\n') : '- Aucun exemple fourni : propose un style cohérent avec la marque et justifie-le dans le rapport.'
  const hasVideo = j.refs.some((x) => x.kind === 'video' || (x.kind === 'link' && /youtu|tiktok|instagram|vimeo|\.mp4/i.test(x.url ?? '')))
  return `# Mission : motion design « ${j.title || 'Sans titre'} »

Tu es Claude Code, lancé automatiquement par Flow sur ce Mac. Tu travailles SEUL, du début à la fin, sans jamais t'arrêter pour demander une réponse ou attendre quelque chose. L'utilisateur n'est pas développeur : tout ce que tu fais, tu le fais toi-même.

## 1. Avant tout
1. Lis \`~/Developer/mon-atelier/CLAUDE.md\`, \`atelier.md\` et le dossier \`connaissances/\`. Charge les skills \`motion-reference-clone\`, \`effectcraft\`, \`analyse-image\` et \`decoupage-reference\`.
2. Crée un NOUVEAU projet : \`~/Developer/mon-atelier/studio/${id}/\` (sous-dossiers \`entrees/\`, \`analyse/\`, \`scripts/\`, \`sons/\`, \`rendu/\`). Copie-y tous les fichiers fournis. Ne touche pas aux autres projets.
3. ${eng.check}

## 2. Demande de l'utilisateur
${j.brief.trim() || '(vide)'}

Marque / charte : ${j.brand.trim() || 'non précisée : déduis-la des fichiers fournis (logo, couleurs, polices) et note tes choix.'}

## 3. Spécifications (non négociables)
| Élément | Valeur |
|---|---|
| Format | ${r.labelFr} ${j.ratio} (${r.useFr}) |
| Définition du rendu final | ${d.w} × ${d.h} px (${q.labelFr}) |
| Cadence | ${j.fps} images par seconde |
| Durée | ${j.durationSec} s = ${frames} images |
| Son | ${audio} |
| Moteur | ${j.engine && j.engine !== 'auto' ? j.engine : 'automatique (EffectCraft, sinon Remotion)'} |
| Fond / style | Respecte les exemples et la charte ; si l'utilisateur demande un fond précis (ex. blanc), c'est prioritaire sur la référence. |

## 4. Fichiers et exemples fournis
${refs}

## 5. Méthode obligatoire (skill \`motion-reference-clone\`)
${hasVideo ? `1. **Lire le format de la vidéo de référence avec \`ffprobe\`** avant de construire, sans présumer du vertical ou de l'horizontal. Si elle diffère de la demande, applique la demande mais garde le rythme et le timing de la référence.
2. **Analyser TOUTES les images** de la référence (\`analyse-image/scripts/feuilleter.sh\`) : jamais un échantillon. Lis toutes les planches.
3. **Mesurer, ne pas deviner** : \`motion-reference-clone/scripts/mesure.py\` (tailles, positions, couleurs, lignes de base, poussée de caméra éventuelle, fond).
4. Écris la table des événements (image de début / fin, objet, courbe) dans \`analyse/\`.` : `1. Il n'y a pas de vidéo de référence : définis un storyboard court (images clés, timing, courbes) cohérent avec la demande et la charte, et écris-le dans \`analyse/storyboard.md\` avant de construire.
2. Si des captures ou images de style sont fournies, mesure leurs couleurs, polices et espacements au lieu de les estimer.`}
5. ${eng.build}
6. ${j.verify ? '**Comparer image par image** à la référence (`analyse-image/scripts/comparer.sh`), lire TOUTES les planches, corriger chaque écart (position, moment, vitesse, taille, couleur), recommencer jusqu\'à ce que les deux se superposent.' : 'Contrôler visuellement des planches d\'images à intervalles réguliers et corriger les défauts.'}
7. ${j.audio === 'none' ? 'Pas de son.' : 'Mixer le son hors de l\'application de motion (ffmpeg, `mixer_sons.py`) : pic de chaque son sur l\'image de l\'événement, loudnorm −18 LUFS puis −2,5 dB. Vérifier les pics et la sonie.'}
8. **Rendu final** en ${d.w} × ${d.h} (${j.quality === '4k' ? 'vrai 4K : facteur K = 2, pas d\'agrandissement du 1080p' : q.labelFr}), débit élevé, H.264, ${j.fps} i/s.

${j.voicePrompt?.trim() ? `\n${j.voicePrompt.trim()}\n` : ''}
## 6. Règles d'autonomie
- Ne pose JAMAIS de question et n'attends JAMAIS une réponse. Si un point est ambigu, choisis l'option la plus probable, applique-la et note l'hypothèse dans \`rapport.md\`.
- Si une commande échoue, diagnostique, corrige et recommence. Si un outil manque, trouve une alternative. Un échec n'est jamais une raison de t'arrêter.
- Pas d'attente passive : lance les tâches longues en arrière-plan et avance sur le reste.
${j.noQuestions ? '- L\'utilisateur a demandé de ne JAMAIS être dérangé : même en cas de blocage, décide seul et note-le.\n' : ''}- Tiens à jour \`todo.json\` (liste des tâches) : l'utilisateur la voit cocher en direct.
- ${eng.rule} Aucune dépense payante (API, génération) sans qu'elle soit explicitement demandée ici.
- Ne publie rien sur Internet. Ne place aucune clé ni aucun mot de passe dans les fichiers du projet.

## 7. Définition de « terminé » (tout doit être vrai)
- [ ] Le fichier \`rendu/final.mp4\` fait exactement ${d.w} × ${d.h}, ${j.fps} i/s, ${frames} images (\`ffprobe -count_frames\`).
- [ ] Les bords du texte sont nets à 100 % (aucun agrandissement), contrôlé sur un recadrage.
- [ ] ${j.verify ? 'La comparaison image par image avec la référence ne montre plus d\'écart visible.' : 'Les planches d\'images ne montrent aucun défaut visible.'}
- [ ] ${j.audio === 'none' ? 'La vidéo est muette comme demandé.' : 'Le son est présent, sans saturation, calé sur les événements.'}
- [ ] Les fichiers intermédiaires sont rangés ; seul \`rendu/final.mp4\` est livré.

## 8. Livraison
1. Écris \`rendu/rapport.json\` : \`{"statut":"ok","fichier":"final.mp4","largeur":${d.w},"hauteur":${d.h},"fps":${j.fps},"images":${frames},"duree_s":${j.durationSec},"hypotheses":[…],"verifications":[…]}\`.
2. Écris \`rendu/rapport.md\` (en français simple) : ce qui a été fait, les hypothèses, les vérifications.
3. Mets à jour les skills et \`connaissances/\` avec ce que tu as appris (valeurs mesurées, pièges), recopie les skills dans \`connaissances/skills-backup/\` et commite.
4. Le pont Flow récupère \`rendu/final.mp4\` et \`rapport.json\` et les envoie à l'utilisateur.
`
}

/* ───────── Création de site ───────── */

export type InterviewQ = { id: string; text: string; choices?: string[]; weight: number; only?: SiteKind[] }

/** Banque de questions de la session de questions. L'ordre est celui d'un vrai briefing ; chaque question vaut un poids dans la « compréhension ». */
export const QUESTION_BANK: InterviewQ[] = [
  { id: 'goal', text: 'Quel est le but principal du site : que doit faire un visiteur pour que ce soit une réussite ?', choices: ['Acheter', 'Me contacter', 'Prendre rendez-vous', 'S\'inscrire', 'Découvrir mon activité'], weight: 10 },
  { id: 'audience', text: 'Qui sont tes visiteurs (âge, métier, besoins) et comment arrivent-ils sur le site ?', weight: 8 },
  { id: 'offer', text: 'Que proposes-tu exactement, et qu\'est-ce qui te différencie des autres ?', weight: 10 },
  { id: 'products', text: 'Combien de produits, quelles catégories, quels prix ? Y a-t-il des variantes (taille, couleur) ?', weight: 9, only: ['shop'] },
  { id: 'payment', text: 'Comment veux-tu être payé et livrer (carte, PayPal, retrait, pays de livraison, frais) ?', choices: ['Carte (Stripe)', 'PayPal', 'Virement', 'Tu décides'], weight: 8, only: ['shop'] },
  { id: 'pages', text: 'Quelles pages veux-tu (accueil, à propos, tarifs, blog, FAQ, contact…) ?', weight: 7, only: ['showcase', 'other'] },
  { id: 'cta', text: 'Quelle est l\'action principale de la page, et quel texte pour le bouton ?', weight: 8, only: ['landing'] },
  { id: 'brand', text: 'As-tu un logo, des couleurs, des polices ? Sinon, quelle ambiance (sobre, chaleureuse, premium, jeune) ?', choices: ['J\'ai une charte', 'Sobre et premium', 'Chaleureuse', 'Moderne et audacieuse', 'Tu décides'], weight: 9 },
  { id: 'inspiration', text: 'Quels sites ou captures aimes-tu, et qu\'est-ce que tu aimes précisément dedans ? (envoie-les ci-dessus)', weight: 8 },
  { id: 'content', text: 'Les textes et images existent-ils déjà ? Sinon, veux-tu que Claude les rédige et choisisse des visuels ?', choices: ['J\'ai tout', 'Rédige les textes', 'Textes et visuels par Claude'], weight: 8 },
  { id: 'features', text: 'Fonctions utiles : formulaire, newsletter, comptes clients, réservation, chat, multilingue, blog ?', weight: 7 },
  { id: 'languages', text: 'Dans quelles langues, et pour quel pays principal ?', weight: 4 },
  { id: 'domain', text: 'As-tu un nom de domaine ? Sinon un lien Vercel suffit pour commencer.', choices: ['J\'ai un domaine', 'Lien Vercel suffit', 'Tu décides'], weight: 3 },
  { id: 'legal', text: 'Mentions légales, cookies, CGV : as-tu les informations de ton entreprise à y mettre ?', weight: 3, only: ['shop', 'showcase'] },
  { id: 'deadline', text: 'Y a-t-il une date limite ou une contrainte particulière à connaître ?', weight: 2 },
]

export const questionsFor = (kind: SiteKind) => QUESTION_BANK.filter((q) => !q.only || q.only.includes(kind))
export const understandingOf = (kind: SiteKind, answered: string[]) => {
  const all = questionsFor(kind)
  const total = all.reduce((a, q) => a + q.weight, 0)
  const done = all.filter((q) => answered.includes(q.id)).reduce((a, q) => a + q.weight, 0)
  return Math.round((done / total) * 100)
}

export const INTERVIEW_SYSTEM_PROMPT = `Tu es l'assistant de briefing de Flow. Ta seule mission : comprendre le projet de l'utilisateur à 100 % avant qu'un site soit construit.

Règles :
1. Pose UNE question à la fois, courte, en français simple, sans jargon. Propose 2 à 5 réponses cliquables quand c'est possible, plus « Tu décides ».
2. Commence par le but du site, la cible et l'offre. Adapte la suite au type de projet (vitrine, boutique, landing page, autre) : une boutique demande produits, paiement, livraison ; une landing page demande l'action principale.
3. Utilise ce que l'utilisateur a déjà donné (message, captures, liens, fichiers). Ne repose jamais une question dont la réponse est déjà connue.
4. Si l'utilisateur répond « tu décides », décide pour lui avec le meilleur choix professionnel et note-le comme hypothèse.
5. Après chaque réponse, mets à jour un pourcentage de compréhension honnête. Arrête-toi quand il atteint 100 %, que rien d'important ne manque et que tu pourrais construire sans jamais redemander.
6. Termine par un résumé en 8 lignes maximum et demande une seule confirmation : « Je lance ? ».
7. Après la confirmation, le projet part en autonomie complète : aucune autre question ne sera posée, sauf blocage réel (accès, paiement, choix légal) via une notification.`

export function buildSitePrompt(j: Pick<SiteJob, 'title' | 'siteKind' | 'brief' | 'refs' | 'withFigma' | 'withSupabase' | 'withMotion' | 'motionBrief' | 'languages' | 'domain' | 'qa'> & { noQuestions?: boolean }, id = '{{ID}}'): string {
  const kindFr: Record<SiteKind, string> = { showcase: 'Site vitrine', shop: 'Boutique en ligne', landing: 'Landing page', other: 'Autre projet web' }
  const inbox = `~/Developer/sites/${id}/entrees`
  const refs = j.refs.length ? j.refs.map((x) => refLine(x, inbox)).join('\n') : '- Aucun exemple fourni.'
  const qa = j.qa.length ? j.qa.map((x, i) => `${i + 1}. ${x.q}\n   → ${x.a}`).join('\n') : '- Aucune réponse (session de questions non faite : choisis les meilleures options et note-les).'
  return `# Mission : ${kindFr[j.siteKind]} « ${j.title || 'Sans titre'} »

Tu es Claude Code, lancé automatiquement par Flow sur ce Mac. Tu construis le projet DE A À Z, en totale autonomie : tu ne t'arrêtes JAMAIS pour attendre une réponse ni pour attendre qu'une tâche se termine. L'utilisateur n'est pas développeur ; tu fais tout toi-même et il ne reçoit qu'un lien Vercel fonctionnel à la fin.

## 1. Brief
${j.brief.trim() || '(vide)'}

### Session de questions (réponses de l'utilisateur)
${qa}

## 2. Fichiers, captures et liens fournis
${refs}

## 3. Options
- Figma : ${j.withFigma ? 'OUI (design system et maquettes dans Figma avant le code)' : 'non (design directement dans le code, mais avec un vrai design system)'}
- Supabase : ${j.withSupabase ? 'OUI (tables, sécurité RLS, formulaires, comptes si nécessaire)' : 'non, sauf si une fonction demandée l\'exige'}
- Vidéo motion design : ${j.withMotion ? `OUI, 4K, par la méthode du skill motion-reference-clone. Brief : ${j.motionBrief.trim() || 'présentation du site/produit, style cohérent avec la charte'}` : 'non'}
- Langues : ${j.languages.trim() || 'français'} · Domaine : ${j.domain.trim() || 'lien Vercel suffit'}

## 4. Étapes (dans l'ordre, sans pause)
1. **Projet** : crée \`~/Developer/sites/${id}/\` (Git initialisé), copie les entrées, écris \`BRIEF.md\` et \`CLAUDE.md\` (règles du projet).
2. **Analyse** : pour chaque lien ou capture, utilise WebTwin pour décortiquer la structure, le design et les composants ; note ce qui est repris et ce qui est amélioré.
3. **Design** : design system (couleurs, typographies, espacements, composants, états) ${j.withFigma ? 'puis maquettes dans Figma (desktop et mobile)' : 'documenté dans \`DESIGN.md\`'}. Qualité de rendu d'un designer senior.
4. **Structure et contenus** : arborescence, parcours, textes (rédigés si absents), images (libres de droits ou générées si autorisé).
5. **Construction** : Next.js + TypeScript + Tailwind, responsive du téléphone à 4K, accessible (clavier, contrastes, labels), rapide (images optimisées), SEO de base.
6. **Données** : ${j.withSupabase ? 'schéma Supabase, politiques de sécurité, formulaires reliés, variables d\'environnement.' : 'aucune base sauf nécessité.'}${j.siteKind === 'shop' ? ' Paiement en mode test jusqu\'à validation par l\'utilisateur.' : ''}
7. **Déploiement** : Vercel (production), variables d'environnement, domaine si fourni. Vérifie que l'URL publique répond en 200.
8. **Vérification** : tests sur mobile/tablette/desktop, accessibilité, vitesse, liens morts, formulaires de bout en bout. Corrige tout avant de livrer.
9. **Motion** : ${j.withMotion ? 'rendre la vidéo 4K et la vérifier image par image.' : 'sans objet.'}
10. **Livraison** : écris \`LIVRAISON.json\` (\`{"statut":"ok","url":"https://…","fichiers":[…]}\`) et \`LIVRAISON.md\` (résumé en français simple). Le pont Flow envoie le lien à l'utilisateur.

## 5. Règles d'autonomie
- Ne demande jamais rien. Ambiguïté : choisis l'option la plus professionnelle et note l'hypothèse dans \`HYPOTHESES.md\`.
${j.noQuestions ? '- **L\'utilisateur a choisi de ne PAS être dérangé** : aucune question, même en cas de blocage (accès, paiement, légal) : décide seul, prends l\'option la plus sûre et note-la dans `HYPOTHESES.md`.' : '- **Seuls blocages réels autorisés** (accès refusé, achat payant, décision juridique) : écris la question dans `QUESTION.json` (`{"question":"…","choices":[…]}`), continue tout le reste du projet en attendant, puis intègre la réponse quand elle arrive dans `REPONSE.json`. Sans réponse après 20 minutes, décide seul.'}
- Tiens à jour \`todo.json\` (liste des tâches) : l'utilisateur la voit cocher en direct. Écris \`preview.json\` dès que le serveur local tourne.
- Échec d'une commande : diagnostique, corrige, recommence. Jamais d'arrêt.
- Ne dépense rien sans autorisation écrite ici. Aucune clé dans le code ni dans Git. Production seulement après vérification complète.
- Contenu : aucune marque, personne réelle ou contenu protégé sans l'accord de l'utilisateur.

## 6. Définition de « terminé »
- [ ] URL Vercel de production en 200, toutes les pages et tous les formulaires testés.
- [ ] Lighthouse mobile ≥ 90 (performance, accessibilité, bonnes pratiques, SEO).
- [ ] Aucun texte factice (« lorem ipsum »), aucune image cassée, aucun lien mort.
- [ ] Livraison écrite (\`LIVRAISON.json\` + \`LIVRAISON.md\`), connaissances notées dans les skills.
`
}

/* ───────── Déplacer un site terminé vers les comptes de l'utilisateur ───────── */
export type MoveTarget = 'vercel' | 'github' | 'supabase'
export function buildMovePrompt(targets: MoveTarget[], siteUrl?: string): string {
  const has = (t: MoveTarget) => targets.includes(t)
  return `# Déplacement du projet vers mes comptes

Le site est terminé${siteUrl ? ` (${siteUrl})` : ''}. Je veux qu'il vive entièrement dans MES comptes (plus de lien ou compte de test). Fais-le toi-même, en autonomie, sans rien me demander, puis mets à jour la livraison (\`LIVRAISON.json\` avec la nouvelle URL, \`LIVRAISON.md\`).

Comptes concernés : ${targets.map((t) => ({ vercel: 'Vercel', github: 'GitHub', supabase: 'Supabase' })[t]).join(', ')}.

Avant tout : vérifie quel compte est connecté sur ce Mac pour chaque service (\`vercel whoami\`, \`gh auth status\`, \`supabase projects list\`). Si un service n'est pas connecté, note-le dans \`MIGRATION.md\` et traite les autres ; ne tente jamais de te connecter avec un autre compte.
${has('github') ? `
## GitHub
1. Crée un dépôt PRIVÉ dans mon compte (\`gh repo create <nom-du-projet> --private --source=. --push\`), avec un \`.gitignore\` correct. Aucune clé ni fichier \`.env\` dans l'historique (vérifie ; sinon réécris l'historique avant de pousser).
2. Mets l'adresse du dépôt dans \`MIGRATION.md\`.` : ''}${has('supabase') ? `
## Supabase
1. Crée un NOUVEAU projet Supabase dans mon compte (\`supabase projects create\`), région proche de mes visiteurs.
2. Rejoue les migrations / le schéma, les politiques de sécurité (RLS), les fonctions et le stockage ; copie les données de contenu utiles (jamais de données personnelles de test).
3. Mets à jour les variables d'environnement du site avec la nouvelle base. Teste les formulaires et la connexion de bout en bout.` : ''}${has('vercel') ? `
## Vercel
1. Crée ou lie le projet dans MON compte Vercel ${has('github') ? '(relié au nouveau dépôt GitHub, déploiement automatique à chaque envoi)' : ''}.
2. Recopie les variables d'environnement (valeurs de mon compte Supabase si migré). Redéploie en production.
3. Vérifie que la nouvelle adresse répond en 200 sur toutes les pages. Ajoute mon domaine si je l'ai fourni.` : ''}

## Terminé quand
- [ ] Le site fonctionne depuis mes comptes uniquement, toutes les pages et tous les formulaires testés.
- [ ] \`MIGRATION.md\` liste : nouvelles adresses, ce qui a été copié, ce que je dois encore faire moi-même (ex. domaine), et ce qui peut être supprimé de l'ancien emplacement (ne supprime RIEN toi-même).
- [ ] \`LIVRAISON.json\` contient la nouvelle URL.`
}
