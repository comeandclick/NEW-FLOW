// Offres d'abonnement de Flow (14/10/2026, propositions à valider par Aymen) — inspirées de Notion, Linear et ClickUp :
// un abonnement de COMPTE (personnel) et un abonnement d'ESPACE / projet (équipe), au mois ou à l'année (-20 %).
// Pendant le lancement tout est gratuit ; le paiement en ligne sera branché plus tard (aucun prélèvement aujourd'hui).
export type Portee = 'compte' | 'espace'
export type Offre = { id: string; portee: Portee; nom: string; pastille?: string; mois: number; an: number; unite: string; pour: string; inclus: string[]; principale?: boolean }

export const OFFRES: Offre[] = [
  { id: 'gratuit', portee: 'compte', nom: 'Gratuit', mois: 0, an: 0, unite: 'pour toujours', pour: 'Pour s\'organiser seul ou à deux',
    inclus: ['1 espace, jusqu\'à 3 membres', '5 Go de fichiers', 'Assistant IA : 20 questions par jour', 'Tâches, notes, agenda, messages', 'Application iPhone et ordinateur'] },
  { id: 'pro', portee: 'compte', nom: 'Pro', pastille: 'Populaire', mois: 9, an: 7, unite: 'par mois', principale: true, pour: 'Pour les indépendants qui font tout avec Flow',
    inclus: ['Espaces illimités', '100 Go de fichiers', 'Assistant IA sans limite, avec widgets', 'Clients illimités avec leur espace', 'Automatisations et réseaux sociaux', 'Atelier : 1 Mac relié (motion, sites)'] },
  { id: 'equipe', portee: 'espace', nom: 'Équipe', mois: 15, an: 12, unite: 'par membre / mois', pour: 'Pour un projet ou une équipe entière',
    inclus: ['Tout Pro, pour chaque membre', 'Rôles et invités', '1 To de fichiers partagés', 'Atelier pour toute l\'équipe (plusieurs Mac)', 'Historique et corbeille 1 an', 'Support prioritaire'] },
  { id: 'studio', portee: 'espace', nom: 'Studio', pastille: 'Agences', mois: 49, an: 39, unite: 'par espace / mois', pour: 'Pour les agences : vidéos et sites pour les clients',
    inclus: ['Tout Équipe', 'Espaces clients en marque blanche', 'Suivi de production (Productions, État du projet)', 'Agents de l\'Atelier en parallèle', 'Domaine personnalisé pour l\'espace client'] },
]
export const prix = (o: Offre, annuel: boolean) => (o.mois === 0 ? '0 €' : `${annuel ? o.an : o.mois} €`)
