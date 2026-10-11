# Flow — 62 pistes de fonctionnalités

Légende : **Valeur** ★ à ★★★ · **Effort** S (≤ 1 j) · M (2-4 j) · L (1 sem+). 🟢 = déjà dans Flow, à améliorer.
Sources d'inspiration : changelog Linear 2026 (agents, triage, boucles récurrentes, time-in-status), retours d'utilisateurs ClickUp / Notion (mobile limité, lenteur, surcharge de fonctions, notifications mal synchronisées), pratiques indie iOS (TestFlight, checklist de sortie, localisation).

## A. Pour Kalimat (app d'apprentissage de l'arabe)
1. **Boîte de retours bêta-testeurs** — chaque retour TestFlight/utilisateur devient une carte (écran, version, appareil) triable. ★★★ M
2. **Checklist de sortie App Store** (compte Apple 🟢 déjà actif) : captures, textes, confidentialité, IAP testés, build actif, notes « What to Test » (≤ 4 000 car.). Modèle réutilisable à chaque version. ★★★ S
3. **Gestionnaire de localisation** : clés de texte FR/EN/AR, statut par langue (à traduire / relu), contrôle des textes trop longs, export `.arb`/`.strings`. ★★★ L
4. **Couverture audio des mots** : tableau mot → voix homme/femme présente, manquantes en rouge, file d'enregistrement. ★★★ M
5. **Contrôle qualité du contenu** : une carte par cours/chapitre à relire (traduction, translittération, diacritiques). ★★ M
6. **Tableau de bord produit** : utilisateurs actifs, rétention J1/J7/J30, série moyenne, conversions Premium (lecture Supabase/RevenueCat). ★★★ L
7. **Suivi des expériences** (A/B) : hypothèse, métrique, dates, décision. ★★ S
8. **Calendrier éditorial** : phrase du jour, stories, notifications push planifiées. ★★ M
9. **Réponses aux avis App Store** : bibliothèque de modèles par langue et ton. ★ S
10. **Suivi ASO** : mots-clés visés, position, concurrents. ★★ M
11. **Matrice d'appareils** : iPhone/iOS testés par release, résultat par scénario. ★★ S
12. **Journal des migrations Supabase** : fichier SQL ↔ tâche ↔ environnement appliqué. ★★ M
13. **Notes de version générées** depuis les tâches terminées entre deux dates (FR/EN). ★★★ S
14. **Plan de lancement** : jalons (TestFlight interne → externe → soumission → sortie) avec dépendances. ★★ S
15. **Suivi des coûts** : Apple 99 $/an, Supabase, Firebase, voix — alerte avant renouvellement. ★ S
16. **Dictionnaire de termes** partagé (arabe, translittération, sens) lié aux notes et au contenu. ★★ M

## B. Gestion de projet (cœur)
17. **Cycles / sprints** avec rapport de fin (terminé, reporté, vélocité). ★★★ M
18. **Roadmap en frise** (Gantt léger) + jalons. ★★★ L
19. **Dépendances entre tâches** (bloque / bloqué par) avec alerte. ★★ M
20. **Tâches récurrentes** (quotidien, hebdo, jours précis). ★★★ M
21. **Modèles de tâches/projets** (ex. « Sortie de version »). ★★★ S
22. **Champs personnalisés** (liste, nombre, date, lien). ★★★ L
23. **Vues enregistrées** et partageables (filtres + tri + groupes). ★★★ M
24. **Édition en masse** (sélection multiple, glisser, raccourcis). ★★ M
25. **Boîte de triage** : tout ce qui arrive (API, e-mail, formulaire) à valider avant le backlog. ★★★ M
26. **Temps passé par statut** (time-in-status) pour repérer les blocages — repris de Linear. ★★ M
27. **Charge de travail par personne** avec avertissement de surcharge. ★★ M
28. **Burn-down / burn-up** par cycle et par projet. ★★ M
29. **OKR en cascade** (objectif d'équipe → objectifs individuels) 🟢. ★★ M
30. **Estimations** en points avec historique de précision. ★ S

## C. Collaboration
31. **Commentaires et mentions partout** (tâches, notes, événements, deals) avec fil et réactions. ★★★ M
32. **Notes collaboratives en temps réel** (curseurs) 🟢. ★★★ L
33. **Résumé automatique de réunion** : transcription locale → notes + tâches proposées. ★★★ L
34. **Sondage de créneaux** (type Doodle) intégré au calendrier. ★★ M
35. **Accès invité / portail client** en lecture ou commentaire. ★★★ M
36. **Circuits d'approbation** (demande → valider/refuser). ★★ M
37. **Enregistrement d'appel** avec lecture différée. ★★ L
38. **Statut « en concentration »** qui coupe les notifications et prévient les autres. ★★ S

## D. Agents, API et intégrations
39. **Boîte de demandes de l'IA** : questions posées par l'agent avec réponse en un clic. 🟢 (alertes `request`) ★★★ S
40. **Permissions par projet** pour chaque clé API. ★★★ M
41. **Webhooks sortants** signés (tâche créée/terminée, message…). ★★★ M
42. **Webhooks entrants** (GitHub, Sentry, Stripe, RevenueCat) → tâches/alertes. ★★★ M
43. **Serveur MCP Flow** pour brancher n'importe quel agent sans écrire de HTTP. ★★★ M
44. **CLI `flow`** (`flow tasks`, `flow done 12`). ★★ S
45. **Lien PR GitHub ↔ tâche** : la PR fusionnée termine la tâche. ★★★ M
46. **E-mail vers tâche** (adresse par projet). ★★ M
47. **Passerelle Slack/Discord** pour les alertes. ★★ S
48. **Boucles planifiées d'agent** (« chaque lundi, résume la semaine ») — comme les Loops de Linear. ★★★ L
49. **Journal d'activité des clés** (qui a fait quoi, quand) avec export. ★★ S
50. **OpenAPI + page de documentation interactive**. ★★ S

## E. Plateforme, sécurité, qualité
51. **Mode hors-ligne web** (file d'attente, résolution de conflits) — grosse plainte sur Notion/ClickUp mobile. ★★★ L
52. **Authentification à deux facteurs et passkeys**. ★★★ M
53. **Rôles personnalisés** (au-delà de propriétaire/admin/membre/lecteur). ★★ M
54. **Import** Notion, Linear, Trello, CSV. ★★★ M
55. **Sauvegardes automatiques** téléchargeables + restauration. ★★★ M
56. **Journal d'audit exportable** (sécurité). ★★ S
57. **Widgets iOS / raccourcis** (tâche rapide, minuteur). ★★ L
58. **Recherche plein texte** sur tout (tâches, notes, messages, fichiers) avec filtres. ★★★ M
59. **Corbeille avec expiration** et restauration en un clic 🟢. ★ S
60. **Page de statut** publique + vérifications de santé. ★ S
61. **Thèmes personnalisés** et mode contraste élevé 🟢 (accents). ★ S
62. **Performances perçues** : squelettes partout, mise à jour optimiste, préchargement au survol — réponse directe à la critique « lent » de Notion. ★★★ M

## Ordre conseillé
1. Immédiat (S) : 2, 13, 21, 39, 44, 49, 50, 38.
2. Ensuite (M, forte valeur) : 1, 4, 17, 20, 23, 25, 31, 41, 42, 43, 45, 52, 54, 55, 58, 62.
3. Chantiers (L) : 3, 6, 18, 22, 33, 48, 51.

## Studio (2026-10-11)
- [x] Pages visuelles : Motion design, Création de site (questions, projets, connexion du Mac par code), Envois & rendus, avec prompts réels et simulation.
- [ ] Vrai système : pont sur le Mac, appairage, jobs, notifications, stockage. Voir `docs/STUDIO-SYSTEME.md`.
