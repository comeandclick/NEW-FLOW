# Flow 3

Espace de travail d'équipe : tâches, notes, calendrier, messagerie (vocaux, réactions, fichiers), appels audio/vidéo, fichiers, projets, objectifs, CRM, facturation, formulaires publics, tableau blanc, focus, habitudes, assistant, automatisations. Interface FR/EN, thèmes clair/sombre, installable (PWA), notifications système.

Production : https://new-flow-dashboard.vercel.app · Démo sans compte : `/demo`

## Stack
Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 · Supabase (Postgres, Auth, Realtime, Storage) · WebRTC (maillage P2P, STUN/TURN publics) · Web Push (VAPID).

## Démarrer
```bash
cp .env.example .env.local   # renseigner les clés Supabase
npm install
npm run dev                  # http://localhost:3000
```
Base de données : exécuter `supabase/schema.sql` dans le SQL Editor (idempotent).

## Variables d'environnement
| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client navigateur (clé publique) |
| `SUPABASE_SECRET_KEY` | serveur uniquement (envoi Web Push, nettoyage des tests) — **jamais côté client** |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | notifications Web Push |
| `ANTHROPIC_API_KEY` (optionnel) | assistant branché sur un modèle ; sinon moteur local |

## Architecture
- `src/lib/supabase/client.ts` : `getDb()` renvoie le vrai client, ou en **mode démo** un faux client en mémoire (`src/lib/demo/`) avec la même API. Aucune page ne connaît la différence.
- Données : `useLive(table, opts)` charge et se resynchronise par Realtime.
- i18n : `src/i18n/dict/*` (FR + EN, parité vérifiée par test). Thème : `data-theme` posé avant le premier rendu.
- Sécurité : Row Level Security sur toutes les tables, fonctions `security definer` pour éviter la récursion, déclencheurs de garde (rôle `owner`, `owner_id`), stockage privé par espace, CSP + en-têtes dans `next.config.ts`.
- Appels : `src/lib/webrtc/room.ts` (négociation « perfect negotiation »), signalisation par Realtime broadcast/presence.

## Tests
```bash
npm test                                   # unitaires (i18n, mock, utilitaires)
npx playwright test e2e/flow.spec.ts       # parcours démo (desktop + mobile)
npx playwright test e2e/audit.spec.ts      # accessibilité (axe) clair + sombre
E2E_REAL=1 npx playwright test e2e/real.spec.ts e2e/security.spec.ts   # vrai backend : 2 utilisateurs, chat, vocal, appel WebRTC, RLS
```
Les tests « réels » créent puis suppriment leurs propres utilisateurs.
