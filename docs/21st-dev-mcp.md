# 21st.dev Magic MCP — création de sites et d'interfaces (Flow / Flow Studio)

Installé le 2026-10-11 : `.mcp.json` à la racine de ce dépôt (serveur « 21st », `https://21st.dev/api/mcp`, clé via la variable `API_KEY_21ST`). Aucun secret dans le dépôt (ne pas commiter de clé).

## Clé (à faire une fois)
Clé sur https://21st.dev/mcp, rangée hors dépôt : `printf '%s' 'LA_CLE' > ~/.config/21st-api-key && chmod 600 ~/.config/21st-api-key`. Les lanceurs (`~/Developer/claude-lidaf.sh`, `~/Developer/lancement/*.command`) la chargent dans `API_KEY_21ST`. Compte n°1 : `export API_KEY_21ST=$(cat ~/.config/21st-api-key)` avant `claude`. Accepter le serveur « 21st » puis vérifier avec `/mcp`.

## Outils
`search` (gratuit) · `search_logo` (gratuit, SVG de marques) · `get_inspiration` (classé selon le contexte du projet) · `get_component` (PAYANT) · `generate` (PAYANT en gratuit).

## Règles pour créer un site / une interface Flow
- Annoncer avant tout appel payant. Ne jamais afficher la clé.
- Flow = Next.js 16 non standard : lire AGENTS.md / la doc locale avant d'écrire du code ; adapter chaque composant 21st au code et au design existants (pas de collage brut).
- Respecter la DA existante de Flow et le skill `site-creation` (design distinctif, rien d'inventé, polissage avant déploiement, nouveau projet Vercel).
- Un composant récupéré = point de départ ; relire accessibilité, responsive (mobile d'abord), thème clair/sombre.
- Réinstaller : `npx @21st-dev/cli@latest init --client claude --write`.
