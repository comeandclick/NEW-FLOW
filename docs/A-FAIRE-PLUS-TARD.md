# À faire plus tard : tout ce qui touche à Shopify / ventes

Précision d'Aymen (2026-10-10) : seul ce qui concerne la boutique Shopify et les ventes est pour plus tard. Le reste de sa liste (chat, notes, tags, zone perso, notifications, police, texte non sélectionnable…) est fait, voir `NOTES-POUR-AYMEN.md`.

## Connexion boutique

- Connexion via le lien admin Shopify, ou via la page de connexion Shopify (OAuth) pour synchroniser les données. Sinon trouver une autre méthode.
- Bouton « Boutiques » affiché en bas de la nav, juste au-dessus du nom d'utilisateur.
- Dashboard et graphiques reliés aux données de la ou des boutiques sélectionnées.

## Ventes et commandes

- Nouvelle commande reçue :
  - apparaît dans « Dernières ventes » du Dashboard ;
  - son total s'ajoute à « Ventes du jour » ;
  - s'inscrit à l'heure/jour dans le graphique « Revenu de la semaine » selon son prix ;
  - total du mois remis à zéro le 1er du mois, ventes du jour remises à zéro à 00:00.
- Petit bouton « déplier » sur chaque widget « Ventes du jour » : liste toutes les ventes du jour, de la semaine, du mois, de l'année. Idem au clic sur « Total du mois » ou « Revenu de la semaine ».
- Clic sur « Commandes » : ouvre toutes les commandes avec prix et client.

## Graphique (style de l'image « Total sales »)

- Sélecteur de période : aujourd'hui, hier, 7 jours, 1 mois, 1 an, ou plage de dates personnalisée.
- Comparaison avec une autre période : ancienne période en pointillés / moins opaque, période récente dans la couleur actuelle du thème.
- Courbe lissée, aire dégradée légère, axes, légende des deux plages, total + variation en % (flèche verte).

## Pré-requis techniques

- Pas d'accès DDL Supabase dans cette session : les tables boutiques/commandes demandent une migration SQL.
- OAuth Shopify : créer une app Shopify (client id/secret) et le webhook `orders/create`.
