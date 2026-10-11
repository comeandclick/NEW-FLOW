# Studio : déplacer vers un autre domaine, une autre base ou un autre compte

Rien n'est écrit en dur : l'adresse du site est lue dans la requête, la base est lue dans les variables d'environnement, le Mac garde l'adresse dans `~/.flow-bridge/config.json`.

## Autre domaine (même base)
1. Ajoute le domaine dans Vercel (Settings > Domains). Rien à changer dans le code.
2. `NEXT_PUBLIC_APP_URL` = nouvelle adresse (liens des e-mails).
3. Sur le Mac : relance l'installateur depuis la nouvelle adresse : `bash <(curl -fsSL https://NOUVEAU-DOMAINE/studio/install.sh)` (il met à jour l'adresse et garde le jeton si le domaine pointe sur la même base). Sinon : `node ~/.flow-bridge/flow-bridge.mjs connect` après avoir changé `server` dans `config.json`.

## Autre base de données (autre projet Supabase)
1. Crée le projet Supabase. SQL Editor : exécute `supabase/schema.sql` puis `supabase/studio.sql` en entier, « Migration 2 » incluse (idempotents).
2. Vercel > Environment Variables : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` (+ `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` pour les notifications). Redéploie.
3. Les Mac reliés ne sont pas copiés (les jetons sont dans l'ancienne base) : relie chaque Mac à nouveau (code).
4. Les anciens projets et fichiers restent dans l'ancienne base ; pour les migrer : exporte les tables `studio_*` (SQL Editor > export) et le bucket `studio`.

## Autre compte Vercel / GitHub
Le dépôt est autonome : `vercel link` sur le nouveau projet, mêmes variables d'environnement, `vercel --prod`. Aucun secret n'est dans le code.

## Autre compte Claude / autre Mac
- Compte Claude : seulement sur le Mac (`claude auth logout` puis `claude auth login`). Flow ne voit jamais le compte.
- Autre Mac : lance l'installateur sur le nouveau Mac, entre le code, puis « Dissocier » l'ancien Mac dans Flow.

## Développer sans Supabase
`STUDIO_STORE=file npm run dev -- -p 3100` : données dans `.studio-data/`, compte démo accepté. Test complet : `node bridge/e2e.mjs` (faux Claude, aucun coût).

## Ce qu'il faut sur le Mac
Node 20+, Claude Code connecté (`claude auth login`), EffectCraft pour le motion design (déjà installé), Vercel CLI connectée et Figma/WebTwin pour les sites. Le pont : `~/.flow-bridge/` (config, état, journal `bridge.log`).
