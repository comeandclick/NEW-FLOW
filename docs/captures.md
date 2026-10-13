# Captures : « Partager → Flow »

Écrit le 13 octobre 2026. Demande d'origine : `~/Developer/_coordination/demandes/2026-10-13-capture-cerveau.md`.

## À quoi ça sert
Depuis n'importe quelle application (TikTok, Instagram, Safari, Photos), on envoie un lien, une capture d'écran, une vidéo ou un texte vers Flow. La capture arrive dans le **projet en cours** de la personne. Plus tard, une IA regarde les captures nouvelles **où « Analyse par l'IA » est cochée** : elle résume, retient ce qui est utile, crée une tâche si besoin, range les connaissances dans le coffre Obsidian et marque la capture comme vue.

## Dans l'application
- **Menu « Captures »** (`/app/<espace>/captures`) : toutes les captures, filtres par statut (nouveau / vu), type et projet, ajout à la main.
- **Page d'un projet** : section « Captures » du projet.
- **Projet en cours** : un réglage par personne, choisi sur la page Captures ou avec le marque-page en haut d'un projet. Une capture envoyée sans projet y arrive. Sans projet en cours, elle arrive « sans projet ».
- **Statuts** : `nouveau` (pas encore regardée par l'IA), `vu` (analysée). Chacun peut basculer à la main.
- **« Analyse par l'IA »** (colonne `ai_analysis`, non cochée par défaut) : se choisit à l'envoi (raccourci iPhone : question oui / non ; ajout à la main : interrupteur ; partage système : bouton « Analyser par l'IA » dans la notification de confirmation) et se change ensuite sur la carte. **L'IA n'analyse que les captures cochées** ; les autres restent rangées telles quelles (pastille « IA » sur les captures en attente d'analyse).
- Une capture supprimée va à la corbeille (suppression douce, colonne `deleted_at`).

## Envoyer depuis le menu « Partager »
| Appareil | Comment |
|---|---|
| iPhone, iPad | Un raccourci Apple nommé « Flow », visible dans la feuille de partage. Il envoie à l'API (`POST /api/v1/captures`). iOS ne propose pas une application web installée dans « Partager » : c'est pour ça qu'il faut un raccourci |
| Ordinateur, Android | Flow installé comme application : il apparaît dans « Partager » pour les liens et le texte (`share_target` du manifeste, page `/app/share`) |

Limite : le partage système (ordinateur, Android) ne transmet que les liens et le texte, pas les fichiers. Pour une image ou une vidéo : l'ajouter depuis la page Captures, ou passer par l'API.

## Nouveautés du 13/10 au soir (v2)
- **Plusieurs projets** par capture (`project_ids` ; `project_id` garde le premier). La page d'un projet principal montre aussi les captures de ses sous-projets.
- **Aperçu** : miniature et titre TikTok / YouTube (oEmbed public, `/api/captures/preview`), miniatures relayées par `/api/captures/thumb` (hébergeurs connus seulement) ; **lecture sur place** avec les lecteurs officiels (CSP `frame-src` : tiktok.com, instagram.com, youtube-nocookie.com) ; vidéos jointes jouées dans la page (`playsInline`) ; images affichées.
- **Notes modifiables** après l'envoi ; si la capture était déjà analysée et cochée « Analyse par l'IA », elle repasse à « nouveau » pour que l'IA la relise.
- **Raccourci v2** : depuis l'écran d'accueil, zone de texte ; depuis Partager, note facultative ; puis choix de un ou plusieurs projets (`GET /api/v1/captures/projects`), « Analyse par l'IA ? », envoi, et « Envoyé » seulement si Flow a créé la capture (sinon le message d'erreur). Champ `projects` : un libellé par ligne (« Kalimat › Kalimat 2.0 », ou « Projet en cours (…) »).
- Migration : `supabase/2026-10-13-cerveau.sql` (aussi `projects.parent_id` pour les projets dans des projets).

## Raccourci iPhone « Flow »
**Le plus simple** : sur l'iPhone, dans Safari, Flow → **Captures** → **Installer sur iPhone** : « Créer ma clé » (clé limitée aux captures, copiée tout de suite), puis « Installer le raccourci » et coller la clé quand l'app Raccourcis la demande. Le raccourci est fabriqué et signé par `scripts/raccourci-iphone.py` (`public/raccourci/Flow.shortcut`, sans aucune clé dedans) ; le relancer si on change le raccourci ou l'adresse du site.

À la main (si besoin), dans l'app Raccourcis :
1. Dans Flow : **Paramètres → API → Nouvelle clé**, nom « Raccourci iPhone », droit **`captures:write` seulement**. Copier la clé (elle commence par `flw_`) ; ne la coller nulle part ailleurs que dans le raccourci.
2. App **Raccourcis** → **+** → nommer le raccourci **Flow** (icône au choix). Dans ses réglages (i) : activer **Afficher dans la feuille de partage**, types acceptés : **URL, Texte, Images, Médias**.
3. Actions, dans l'ordre :
   1. **Demander une saisie** (Texte) : « Une note ? (facultatif) ». Variable `Note`.
   2. **Choisir dans le menu** : « Analyse par l'IA ? » avec **Oui** et **Non**. Dans Oui : **Texte** `true` ; dans Non : **Texte** `false`. Après le menu : variable `IA` = **Résultat du menu**.
   3. **Si** *Entrée du raccourci* **est** *URL* ou *Texte* :
      **Obtenir le contenu de l'URL** `https://new-flow-dashboard.vercel.app/api/v1/captures`, méthode **POST**, en-têtes `Authorization` = `Bearer <la clé>`, corps **JSON** : `text` = *Entrée du raccourci*, `note` = `Note`, `ai_analysis` = `IA`.
   4. **Sinon** (image ou vidéo) : même action, corps **Formulaire** : `file` (fichier) = *Entrée du raccourci*, `note` = `Note`, `ai_analysis` = `IA`.
   5. **Afficher la notification** « Envoyé vers Flow ».
4. Tester : dans TikTok, **Partager → Flow**, répondre aux deux questions, puis ouvrir Flow → Captures.
Limite : un envoi direct accepte 4 Mo environ (limite de l'hébergement). Pour une vidéo plus lourde, partager plutôt son **lien**, ou l'ajouter depuis la page Captures.

## API
Permission dédiée : `captures:read`, `captures:write` (Paramètres → API). Une clé peut n'avoir que `captures:write` : c'est le cas de celle du raccourci iPhone.

| Appel | Rôle |
|---|---|
| `POST /api/v1/captures` | Crée une capture. JSON `{url?, text?, note?, title?, project_id?, kind?, ai_analysis?}` (`ai_analysis` : `true`, `"true"`, `"1"`, `"on"`, `"oui"` ; sinon non) ou `multipart/form-data` avec les mêmes champs et `file`. Au moins un parmi `url`, `text`, `note`, `file` |
| `POST /api/v1/captures/upload-url` | Fichier de plus de 4 Mo (25 Mo au plus) : renvoie une adresse d'envoi. Ensuite `PUT` du fichier, puis `POST /captures {upload_path, name, mime}` |
| `GET /api/v1/captures?status=nouveau&ai_analysis=true&kind=&project_id=` | Liste |
| `GET /api/v1/captures/:id` | Détail, avec le fichier et un lien de téléchargement valable 10 minutes |
| `PATCH /api/v1/captures/:id` | Met à jour : `status`, `ai_analysis`, `summary`, `knowledge`, `task_ids`, `obsidian_note`, `project_id`, `title`, `note` |
| `DELETE /api/v1/captures/:id` | Corbeille |

Règles :
- Le type (`tiktok`, `instagram`, `youtube`, `lien`, `image`, `video`, `texte`) est deviné d'après le lien, puis d'après le fichier. On peut l'imposer avec `kind`.
- Un lien glissé dans une phrase (« Regarde ça https://… ») est retrouvé tout seul ; le reste de la phrase devient la note.
- Seuls les liens `http` et `https` sont acceptés.
- Sans `project_id`, la capture va dans le projet en cours de **la personne qui a créé la clé**.
- Créer une capture ne prévient personne : c'est une boîte personnelle, pas un message à l'équipe.

Exemple :
```bash
curl -X POST https://new-flow-dashboard.vercel.app/api/v1/captures \
  -H "Authorization: Bearer flw_…" -H "content-type: application/json" \
  -d '{"text":"Transition à reprendre https://vm.tiktok.com/ZNabc/","note":"pour l’intro Kalimat"}'
```

## Base de données
Table `captures`, migration `supabase/captures.sql` (peut être relancée sans risque). Mêmes droits que les autres tables d'un espace : lecture pour les membres, écriture pour ceux qui peuvent écrire. Les fichiers vont dans le stockage privé de l'espace, dossier « /Captures » de la page Fichiers.

Le projet en cours est rangé dans `profiles.preferences.current_project`, sous la forme `{ <id de l'espace>: <id du projet> }`.

## Tri par l'IA
Skill Claude Code `flow-captures` (`~/.claude/skills/flow-captures/`, mode d'emploi dans `SKILL.md`) : liste les captures nouvelles **et cochées « Analyse par l'IA »**, télécharge ce qu'il faut, analyse, écrit le résumé et les connaissances sur la capture, crée une tâche si besoin dans le même projet, range dans le coffre Obsidian, passe la capture à « vu ».
- À la demande : « regarde mes captures ».
- Chaque soir : tâche planifiée du Mac (voir le skill).

## Code
| Fichier | Rôle |
|---|---|
| `supabase/captures.sql` | Table, droits, mise à jour en direct |
| `src/lib/captures.ts` | Type deviné, nettoyage des liens, projet en cours (fonctions pures, testées dans `tests/captures.test.ts`) |
| `src/app/api/v1/[[...path]]/route.ts` | Ressource `captures` de l'API |
| `src/components/captures/captures.tsx` | Liste, cartes, ajout |
| `src/app/app/[ws]/captures/page.tsx` | Page de toutes les captures |
| `src/app/app/[ws]/projects/[id]/page.tsx` | Section Captures et projet en cours |
| `src/app/app/share/page.tsx`, `src/app/manifest.ts` | Partage système |
| `src/i18n/dict/captures.ts` | Textes français et anglais |
