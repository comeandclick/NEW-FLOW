# Studio : les 3 points « plus tard » (faits le 2026-10-11)

1. **Déplacer vers ses comptes** : Paramètres > Studio. Connexion du Mac, comptes Vercel / GitHub / Supabase (bouton « Connecter » : une fenêtre Terminal s'ouvre sur le Mac avec la commande de connexion), et bouton « Déplacer » par site terminé : envoie à Claude un prompt de migration (dépôt GitHub privé, nouveau projet Supabase, projet Vercel relié, MIGRATION.md, rien n'est supprimé).
2. **Aperçu en direct** : page `/studio/live` (aussi ouverte automatiquement sur le Mac) + zone « En direct » de chaque projet. Le pont capture la page locale du site (Chrome headless) et la fenêtre EffectCraft / After Effects (screencapture) toutes les 3 s si Flow est regardé, 15 s sinon. Claude écrit `preview.json` ({"site":"http://localhost:PORT"}) et `todo.json` (tâches cochées en direct).
3. **Voix off gratuite** : option dans Motion design (VoiceStudio, open source). Prompt généré automatiquement, affiché et modifiable avant l'envoi.

## Sur le Mac
- Fenêtres rangées automatiquement : Flow Studio à gauche (35 %), à droite le logiciel de montage et/ou la page locale (partagés en haut / bas).
- Application « Flow Studio » dans ~/Applications (créée à l'installation) : double-clic = ouvre la fenêtre de suivi.
- Autorisations macOS à accepter une fois : Enregistrement de l'écran (captures) et Accessibilité (ranger EffectCraft / After Effects).
- Le pont se met à jour tout seul depuis Flow (toutes les 3 h, jamais pendant un travail).

## Reste à faire
- Windows (.exe), signature/notarisation du .dmg.
- Test avec un vrai Claude Code (`claude auth login`).
