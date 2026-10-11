# Studio : le vrai système (à construire plus tard)

État aujourd'hui (2026-10-11) : **visuel + prompts réels + simulation locale**. Pages : `/app/<espace>/motion`, `/app/<espace>/site` (onglets Nouveau projet · Projets en cours · Connexion du Mac), `/app/<espace>/library` (Envois & rendus).
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
