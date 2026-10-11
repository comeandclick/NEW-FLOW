# Studio : le système (construit le 2026-10-11)

> **Construit et testé de bout en bout** (27 vérifications `node bridge/e2e.mjs`, faux Claude). Reste à faire par l'utilisateur : exécuter `supabase/studio.sql`, installer le pont sur le Mac (`/studio/install`), connecter Claude Code (`claude auth login`). Voir aussi `docs/STUDIO-DEPLACER.md`.

Ancien état (visuel seulement) : **visuel + prompts réels + simulation locale**. Pages : `/app/<espace>/motion`, `/app/<espace>/site` (onglets Nouveau projet · Projets en cours · Connexion du Mac), `/app/<espace>/library` (Envois & rendus).
Code : `src/lib/studio/` (types, steps, copy, prompts, store zustand en `localStorage`), `src/components/studio/`. Rien n'est envoyé nulle part : les demandes restent dans le navigateur, le bouton « Simuler l'avancement » montre les écrans (étapes, notifications, question de Claude, résultat).
Tests : `tests/studio.test.ts`.

## Ce que le système doit faire
1. **Motion design** : l'utilisateur décrit, ajoute exemples (vidéo, captures, fichiers, liens), choisit format / durée / qualité. Le Mac lance Claude Code dans un NOUVEAU projet de `~/Developer/mon-atelier/studio/<id>/`, avec le prompt de `buildMotionPrompt`. Claude fait tout sans s'arrêter, rend en 4K, vérifie (image par image), puis le pont renvoie `final.mp4` + `rapport.json` à Flow (page Envois & rendus).
2. **Site** : session de questions (`INTERVIEW_SYSTEM_PROMPT`, banque `QUESTION_BANK`) jusqu'à 100 % de compréhension, puis `buildSitePrompt` : Claude Code construit de A à Z (WebTwin, Figma, Supabase, Vercel), sans jamais attendre ; fin : lien Vercel envoyé dans Flow ; en option, une vidéo motion design.
3. **Connexion du Mac par code** : l'outil lancé sur le Mac affiche `FLOW-XXXX-XXXX` ; on l'entre sur Flow (n'importe quel appareil connecté) ; l'outil travaille sur ce Mac et envoie état / questions / résultats à l'appareil qui a validé le code.
4. **Notifications et questions** : changement d'état, question de Claude (notification push + dans l'app), réponse depuis Flow renvoyée à Claude.
5. **Bibliothèque** : tout ce qui a été envoyé (fichiers, vidéos, captures, liens) et reçu (rendus, liens de sites).

## Architecture proposée
```
Flow (Vercel + Supabase)  <—— HTTPS + Realtime ——>  flow-bridge (démon sur le Mac)  ——>  claude -p (Claude Code, sans interface)
```
### Tables Supabase (RLS : chaque ligne appartient à `user_id` / `workspace_id`)
- `studio_devices` (id, user_id, name, os, token_hash, paired_at, last_seen)
- `studio_pairing_codes` (code_hash, device_id, expires_at = +10 min, used_at) : usage unique
- `studio_jobs` (id, workspace_id, user_id, kind motion|site, title, spec jsonb, prompt text, status, step, progress, device_id, created_at, finished_at)
- `studio_job_events` (id, job_id, at, level info|success|question, title, body, step_id)
- `studio_questions` (id, job_id, text, choices jsonb, asked_at, answer, answered_at)
- `studio_assets` (id, job_id, direction in|out, kind, name, size, storage_path, url, created_at). Bucket Storage privé `studio` (URL signées).
Les types TypeScript de `src/lib/studio/types.ts` suivent déjà ce modèle.

### Appairage
1. `flow connecter` sur le Mac → `POST /api/studio/pair/start` → code à usage unique (stocké haché, 10 min), affiché dans le terminal.
2. L'utilisateur l'entre sur Flow → `POST /api/studio/pair/confirm {code}` (session Flow requise) → lie le device à l'utilisateur, renvoie un **token d'appareil** au Mac (sondage du Mac pendant 10 min).
3. Le Mac garde le token dans le trousseau macOS ; tout appel du pont est signé par ce token. « Dissocier » supprime le token.

### Cycle d'une demande
1. Flow crée `studio_jobs` + envoie les fichiers dans Storage (URL signées d'upload), statut `queued`.
2. Le pont (Realtime ou sondage 5 s) prend le job, télécharge les entrées dans `~/Developer/mon-atelier/studio/<id>/entrees/`, écrit `PROMPT.md`.
3. Lance `claude -p "$(cat PROMPT.md)"` dans ce dossier (mode non interactif, permissions pré-autorisées pour le dossier du projet). Le pont surveille `progress.json` (étape courante) et `QUESTION.json`.
4. Chaque changement d'étape → `studio_job_events` → Realtime → carte de la demande dans Flow (déjà dessinée).
5. Question : le pont lit `QUESTION.json` → `studio_questions` → notification push (le projet `web-push` existe déjà) → réponse sur Flow → le pont écrit `REPONSE.json` → Claude reprend. Claude ne s'arrête pas : il continue tout ce qui n'en dépend pas.
6. Fin : le pont envoie `rendu/final.mp4` + `rapport.json` (motion) ou `LIVRAISON.json` (site : URL Vercel) → `studio_assets` + statut `done` + notification.

### Garde-fous
- Le prompt interdit questions, attentes passives, dépenses non autorisées, clés dans le code (déjà écrit dans `prompts.ts`).
- Limites : durée max par job, espace disque, un job à la fois par Mac, annulation depuis Flow (le pont tue le processus).
- Aucune clé / mot de passe ne quitte le Mac ; le token d'appareil ne donne accès qu'aux jobs de cet utilisateur.
- Journal de tout ce que Claude exécute (conservé sur le Mac, résumé envoyé à Flow).
- Mode « vérification » du motion : comparaison image par image (skill `motion-reference-clone`) avant livraison.

## À décider avant de coder
- Vitesse de rendu et file d'attente quand plusieurs demandes arrivent.
- Où stocker les gros fichiers (4K ≈ 8 Mo pour 3 s ; 100 Mo+ pour une minute) : Supabase Storage (quota) ou lien depuis le Mac.
- Facturation / quotas des utilisateurs (le Mac de l'utilisateur fait le travail, mais l'abonnement Claude est à lui).
- Windows : EffectCraft existe aussi sur Windows ; le pont peut être multi-OS.

## Installation des logiciels du Mac (ajouté le 2026-10-11)
`node flow-bridge.mjs setup` (lancé par l'installateur) vérifie le Mac, montre l'état dans le Terminal et installe ce qui manque ; le même état est envoyé à Flow (Création de site > Connexion du Mac > « Logiciels du Mac ») où chaque installation peut aussi être lancée et suivie (barre de progression, journal).
- **Moteur de motion design** (au moins un) : EffectCraft (gratuit, téléchargé depuis les Releases GitHub puis copié dans Applications), After Effects (abonnement Adobe payant : détecté s'il est installé ; sinon installation guidée via Creative Cloud, l'abonnement ne peut pas être vérifié automatiquement), Remotion (gratuit, projet `remotion-base` créé dans l'atelier).
- **Claude Code** (installation npm ou installateur officiel, puis connexion `claude auth login` suivie jusqu'au bout), ffmpeg, Python (numpy, Pillow), Node, Git, CLI Vercel, méthodes de motion (skills, tarballs servis par `/studio/skills/`).
- Le choix du moteur est mémorisé et injecté dans le prompt du motion (`buildMotionPrompt`, paramètre `engine`).
- Base : exécuter la « Migration 2 » de `supabase/studio.sql` (colonne `studio_devices.setup`, commandes sans projet, type `setup`).
- Test : `node bridge/e2e.mjs` (mode `FLOW_BRIDGE_FAKE=1` : installations simulées).

## Sécurité (revue du 2026-10-11)
- **Accès** : toutes les routes utilisateur exigent une session Flow ; les écritures refusent les requêtes venant d'un autre site (Sec-Fetch-Site + Origin) ; le pont s'authentifie par un jeton d'appareil (stocké haché, révocable en « Dissocier »). Chaque requête vérifie que le projet / fichier / appareil appartient à l'utilisateur (testé : isolation entre utilisateurs, un appareil ne peut pas agir sur le projet d'un autre).
- **Appairage** : code à usage unique, 10 min, 8 essais / 10 min / utilisateur, plafond global de codes en attente, jeton remis une seule fois.
- **Entrées** : identifiants UUID obligatoires, tailles plafonnées (spécification 100 Ko, message 8 000 car., prompt 120 000), noms de fichiers assainis, liens de livraison en https seulement, quota de stockage par utilisateur (10 Go, `STUDIO_QUOTA_BYTES`), 8 projets actifs et 300 projets au plus (`STUDIO_MAX_ACTIVE`, `STUDIO_MAX_JOBS`).
- **Site** : l'adresse injectée dans les scripts est validée (pas de Host piégé) ou fixée par `STUDIO_PUBLIC_URL` ; installateur en HTTPS forcé ; le mode fichier (développement) est impossible en production ; `/api/studio/status` ne révèle rien aux visiteurs.
- **Pont sur le Mac** : HTTPS obligatoire (sauf localhost), dossier `~/.flow-bridge` en 700 et fichiers en 600, identifiants de projet validés avant tout chemin, environnement de Claude nettoyé (aucun secret du pont), règles `deny` par projet (clés SSH, jeton du pont, trousseau, `sudo`, `rm -rf` évidents), téléchargements en https, somme de contrôle SHA-256 d'EffectCraft vérifiée, archives de méthodes refusées si leurs chemins sont suspects.
- **Limite connue** : Claude Code tourne en mode « permissions contournées » pour travailler sans s'arrêter ; les règles `deny` réduisent le risque mais ne l'éliminent pas. Un projet est créé uniquement par l'utilisateur connecté, donc le prompt vient de lui.
