// Fonctionnalités de Flow qu'on choisit à l'inscription et dans Paramètres > Fonctionnalités (15/10/2026).
// Le choix est gardé dans workspaces.settings.modules ; un espace créé avant ce système (pas de liste) voit tout.
// Le socle (accueil, boîte de réception, tâches, calendrier, paramètres) est toujours là.
import { Bookmark, Clapperboard, Clock, FileSignature, FileText, FolderOpen, Globe, Handshake, Lock, MessageSquare, ScanLine, Share2, Target, Users, Wrench, type LucideIcon } from 'lucide-react'
import type { Workspace } from '@/lib/types'

export type ModuleId =
  | 'messages' | 'notes' | 'files' | 'captures' | 'goals' | 'clients' | 'motion' | 'site' | 'social' | 'me' | 'crm' | 'focus'
  | 'facturation' | 'interventions' | 'factures_ia'

export type ModuleDef = {
  id: ModuleId
  nom: string
  description: string
  icon: LucideIcon
  /** pages du menu rattachées à cette fonctionnalité (masquées quand elle est retirée) */
  routes: string[]
  categorie: 'Équipe' | 'Travail' | 'Clients' | 'Studio' | 'Gestion' | 'Personnel'
  nouveau?: boolean
}

export const MODULES: ModuleDef[] = [
  { id: 'messages', nom: 'Messages', description: 'Discussions d’équipe, vocaux, fichiers, appels audio et vidéo.', icon: MessageSquare, routes: ['/messages', '/meetings'], categorie: 'Équipe' },
  { id: 'notes', nom: 'Notes', description: 'Notes et documents partagés, rédaction avec l’IA, tableau blanc.', icon: FileText, routes: ['/notes', '/whiteboard'], categorie: 'Travail' },
  { id: 'files', nom: 'Fichiers', description: 'Tous les fichiers de l’équipe rangés en dossiers, avec aperçus.', icon: FolderOpen, routes: ['/files'], categorie: 'Travail' },
  { id: 'captures', nom: 'Captures', description: 'Envoie un lien, une vidéo ou une capture depuis ton téléphone, l’IA trie.', icon: Bookmark, routes: ['/captures'], categorie: 'Travail' },
  { id: 'goals', nom: 'Objectifs', description: 'Objectifs chiffrés et résultats clés, avec la progression en direct.', icon: Target, routes: ['/goals'], categorie: 'Travail' },
  { id: 'clients', nom: 'Clients', description: 'Un espace par client : livraisons, retours, messages, lien privé.', icon: Handshake, routes: ['/clients'], categorie: 'Clients' },
  { id: 'crm', nom: 'CRM', description: 'Contacts, opportunités en colonnes, formulaires publics.', icon: Users, routes: ['/crm', '/finance', '/forms'], categorie: 'Clients' },
  { id: 'facturation', nom: 'Devis & factures', description: 'Devis signés en ligne, factures HT/TTC, PDF à ton logo, envoi par e-mail.', icon: FileSignature, routes: ['/gestion', '/gestion/devis', '/gestion/factures', '/gestion/articles'], categorie: 'Gestion', nouveau: true },
  { id: 'interventions', nom: 'Interventions', description: 'Dépannages, installations, ordres de mission, suivi par technicien.', icon: Wrench, routes: ['/gestion', '/gestion/interventions'], categorie: 'Gestion', nouveau: true },
  { id: 'factures_ia', nom: 'Factures lues par l’IA', description: 'Photo ou PDF d’une facture : l’IA la lit, la range et propose la suite.', icon: ScanLine, routes: ['/gestion', '/gestion/scan'], categorie: 'Gestion', nouveau: true },
  { id: 'motion', nom: 'Motion design', description: 'Lance et suis tes vidéos avec l’Atelier, étape par étape.', icon: Clapperboard, routes: ['/motion'], categorie: 'Studio' },
  { id: 'site', nom: 'Création de site', description: 'Tes sites en cours, la todo et la page en ligne au même endroit.', icon: Globe, routes: ['/site'], categorie: 'Studio' },
  { id: 'social', nom: 'Réseaux sociaux', description: 'Comptes reliés, publication programmée, calendrier éditorial.', icon: Share2, routes: ['/social/accounts', '/social/publish', '/social/calendar', '/social/prepare'], categorie: 'Studio' },
  { id: 'focus', nom: 'Focus et temps', description: 'Minuteur de concentration, temps passé, habitudes de la semaine.', icon: Clock, routes: ['/focus', '/habits'], categorie: 'Personnel' },
  { id: 'me', nom: 'Mon espace', description: 'Un coin privé à toi : notes, listes et liens que personne ne voit.', icon: Lock, routes: ['/me'], categorie: 'Personnel' },
]

export const TOUS_MODULES = MODULES.map((m) => m.id)
/** pages communes aux trois fonctionnalités de gestion */
export const MODULES_GESTION: ModuleId[] = ['facturation', 'interventions', 'factures_ia']

/** null = espace créé avant le choix des fonctionnalités : tout est actif */
export function modulesActifs(ws: Pick<Workspace, 'settings'>): Set<ModuleId> {
  const liste = (ws.settings as { modules?: unknown })?.modules
  return new Set(Array.isArray(liste) ? (liste.filter((x) => TOUS_MODULES.includes(x as ModuleId)) as ModuleId[]) : TOUS_MODULES)
}

/** Une page du menu est visible si aucune fonctionnalité ne la réclame, ou si l'une de celles qui la réclament est active. */
export function routeVisible(href: string, actifs: Set<ModuleId>) {
  const qui = MODULES.filter((m) => m.routes.includes(href))
  return !qui.length || qui.some((m) => actifs.has(m.id))
}

export const aGestion = (actifs: Set<ModuleId>) => MODULES_GESTION.some((m) => actifs.has(m))
