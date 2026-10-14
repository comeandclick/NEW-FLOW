# Clients : un espace partagé par client

Ajouté le 14/10/2026 à la demande d'Aymen. L'idée : un WeTransfer avec une discussion et une liste à faire. Pour chaque client, l'équipe envoie ses vidéos, discute avec lui et tient la liste des publications. Le client ouvre son espace par un lien, sans compte, et ne voit rien d'autre de Flow.

## Ce que voit chacun
| | Équipe (`/app/<espace>/clients`) | Client (`/c/<jeton>`) |
|---|---|---|
| Vidéos et fichiers | envoie une vidéo (même titre = version suivante : V1, V2…), voit l'état | regarde, télécharge, **valide** ou **demande une modification** (le message part dans la discussion), envoie un fichier (logo, référence) |
| À faire | ajoute, coche, supprime, avec échéance | lit seulement |
| Discussion | écrit, voit tout en direct | écrit ; la page se relit toutes les 15 secondes |
| Le reste de Flow | tout | rien : pas de menu, pas de navigation, pas de compte |

Le lien se copie depuis la fiche du client (« Copier le lien du client »). « Changer le lien » crée un nouveau jeton : l'ancien lien cesse aussitôt de marcher. Supprimer un client coupe son accès.

L'équipe reçoit une notification (dans Flow et en push) quand le client écrit, envoie un fichier, valide ou demande une modification.

## Comment c'est construit
- Tables (`supabase/clients.sql`) : `clients` (rythme, jeton `access_token`), `client_messages`, `client_files` (version, état `livree` / `modif` / `validee` / `recu`), `client_todos`. Les droits sont ceux de l'espace (`is_member`, `can_write`). **Le rôle anonyme n'a aucun accès.**
- Fichiers : seau privé `clients` (50 Mo par fichier), chemin `<espace>/<client>/<fichier>`.
- Le client passe uniquement par `src/app/api/portail/[token]/route.ts`. Cette route vérifie le jeton, utilise la clé de service côté serveur et ne touche qu'aux lignes de ce client. Elle ne renvoie jamais le jeton, les notes internes ni l'identifiant des membres. Les fichiers du client vont directement dans le stockage par un lien d'envoi signé, sans passer par le serveur de Flow (limite de Vercel : environ 4,5 Mo par requête). L'enregistrement vérifie que le fichier est bien dans le dossier du client.
- Interface commune : `src/components/clients/client-space.tsx`. Pages : `src/app/app/[ws]/clients/`, `src/app/c/[token]/` (non indexée).
- Démo : client n° 1 « Yanis » (Lisan, 1 vidéo par semaine), lien `/c/demo`. Il a 3 vidéos d'exemple (`public/demo/clients/`), dont une V1 corrigée en V2 après discussion, et une liste de publications. Le jeton `demo` est lu dans le navigateur, sans serveur : ce que l'équipe envoie dans la démo apparaît dans `/c/demo` du même navigateur.

## Mise en service (accord d'Aymen requis)
1. Exécuter `supabase/clients.sql` sur la base en ligne : SQL Editor de Supabase, ou `supabase db query --file supabase/clients.sql --linked` depuis un dossier lié au projet Flow.
2. Déployer : `vercel deploy --prod --yes`.
3. Vérifier : créer un client, ouvrir son lien dans une fenêtre privée, envoyer une petite vidéo, valider depuis le lien.

## Tests
- `tests/clients.test.ts` : jeton, chemins, versions, regroupement.
- `e2e/flow.spec.ts` « clients (demo mode) » : un message de l'équipe arrive chez le client ; le client ne voit aucune navigation, demande une modification, l'état change ; un lien inconnu affiche un message clair.
- `e2e/audit.spec.ts` : la liste, la fiche et `/c/demo` respectent WCAG 2 A et AA, en thème sombre et en thème clair.

## En ligne depuis le 14/10/2026
Migration passée par Aymen (SQL Editor), Flow déployé. Contrôle en ligne avec un client temporaire, supprimé ensuite, sans notification envoyée :
- l'espace se lit par le lien ;
- la vidéo est lisible par son lien signé ;
- le jeton n'est jamais renvoyé ;
- l'envoi se fait dans le dossier du client ;
- un fichier de 60 Mo est refusé ;
- le chemin d'un autre client est refusé ;
- un jeton inconnu donne 404 ;
- la page n'est pas indexée ;
- la lecture anonyme des tables ne voit rien.

Démo en ligne : aucune erreur de console sur la liste, la fiche et `/c/demo`.
