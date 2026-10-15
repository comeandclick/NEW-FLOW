import { Bookmark, CalendarDays, CheckSquare, Clapperboard, Clock, FileSignature, Gauge, Globe, Handshake, Inbox, FileText, FolderOpen, Home, Lock, MessageSquare, ScanLine, Settings, Share2, Target, Users, Wrench, type LucideIcon } from 'lucide-react'
import type { Key } from '@/i18n/dict'

export type NavItem = { href: string; label: Key; icon: LucideIcon; badge?: 'messages' | 'motion' | 'site'; /** other routes that keep this item highlighted */ also?: string[] }
export type NavGroup = { label?: Key; items: NavItem[] }

// Organisation (14/10/2026) : le quotidien d'abord, puis le travail, les clients, le studio, la publication et le personnel.
// Chaque entrée peut être masquée avec le crayon (préférence gardée sur l'appareil) ; une rubrique vide disparaît.
export const NAV: NavGroup[] = [
  {
    items: [
      { href: '', label: 'nav.home', icon: Home },
      { href: '/inbox', label: 'nav.inbox', icon: Inbox },
      { href: '/tasks', label: 'nav.tasks', icon: CheckSquare, also: ['/projects', '/roadmap', '/team'] },
      { href: '/calendar', label: 'nav.calendar', icon: CalendarDays },
      { href: '/messages', label: 'nav.messages', icon: MessageSquare, badge: 'messages', also: ['/meetings'] },
    ],
  },
  {
    label: 'nav.group.work',
    items: [
      { href: '/notes', label: 'nav.notes', icon: FileText, also: ['/whiteboard'] },
      { href: '/files', label: 'nav.files', icon: FolderOpen },
      { href: '/captures', label: 'nav.captures', icon: Bookmark },
      { href: '/goals', label: 'nav.goals', icon: Target },
    ],
  },
  {
    label: 'nav.group.grow',
    items: [
      { href: '/clients', label: 'nav.clients', icon: Handshake },
      { href: '/crm', label: 'nav.crm', icon: Users, also: ['/finance', '/forms'] },
    ],
  },
  {
    // Gestion façon Sphinx Manager (15/10/2026) : visible seulement si l'une des fonctionnalités de gestion est choisie
    label: 'nav.group.gestion',
    items: [
      { href: '/gestion', label: 'nav.gestion', icon: Gauge, also: ['/gestion/clients', '/gestion/equipe', '/gestion/articles', '/gestion/import'] },
      { href: '/gestion/devis', label: 'nav.gestion.facturation', icon: FileSignature, also: ['/gestion/factures'] },
      { href: '/gestion/interventions', label: 'nav.gestion.interventions', icon: Wrench },
      { href: '/gestion/scan', label: 'nav.gestion.scan', icon: ScanLine },
    ],
  },
  {
    label: 'nav.group.studio',
    items: [
      { href: '/motion', label: 'nav.motion', icon: Clapperboard, badge: 'motion' },
      { href: '/site', label: 'nav.site', icon: Globe, badge: 'site' },
    ],
  },
  {
    label: 'nav.group.publish',
    items: [
      { href: '/social/accounts', label: 'nav.social', icon: Share2, also: ['/social/publish', '/social/calendar', '/social/prepare'] },
    ],
  },
  {
    label: 'nav.group.personal',
    items: [
      { href: '/focus', label: 'nav.focus', icon: Clock, also: ['/habits'] },
      { href: '/me', label: 'perso.navLabel', icon: Lock },
    ],
  },
]

export const NAV_FOOTER: NavItem[] = [
  { href: '/settings', label: 'nav.settings', icon: Settings, also: ['/automations', '/activity', '/trash'] },
]

/** Sub-pages grouped under a parent entry; rendered as tabs at the top of each page. */
export const HUBS: Record<string, { href: string; label: Key }[]> = {
  tasks: [{ href: '/tasks', label: 'nav.tasks' }, { href: '/projects', label: 'nav.projects' }, { href: '/roadmap', label: 'nav.roadmap' }, { href: '/team', label: 'nav.team' }],
  notes: [{ href: '/notes', label: 'nav.notes' }, { href: '/whiteboard', label: 'nav.whiteboard' }],
  messages: [{ href: '/messages', label: 'nav.messages' }, { href: '/meetings', label: 'nav.meetings' }],
  crm: [{ href: '/crm', label: 'nav.crm' }, { href: '/finance', label: 'nav.finance' }, { href: '/forms', label: 'nav.forms' }],
  gestion: [{ href: '/gestion', label: 'nav.gestion' }, { href: '/gestion/clients', label: 'nav.gestion.clients' }, { href: '/gestion/equipe', label: 'nav.gestion.equipe' }, { href: '/gestion/articles', label: 'nav.gestion.articles' }, { href: '/gestion/import', label: 'nav.gestion.import' }],
  facturation: [{ href: '/gestion/devis', label: 'nav.gestion.devis' }, { href: '/gestion/factures', label: 'nav.gestion.factures' }],
  focus: [{ href: '/focus', label: 'nav.focus' }, { href: '/habits', label: 'nav.habits' }],
  settings: [{ href: '/settings', label: 'nav.settings' }, { href: '/automations', label: 'nav.automations' }, { href: '/activity', label: 'nav.activity' }, { href: '/trash', label: 'nav.trash' }],
  social: [
    { href: '/social/accounts', label: 'nav.social.accounts' },
    { href: '/social/publish', label: 'nav.social.publish' },
    { href: '/social/calendar', label: 'nav.social.calendar' },
    { href: '/social/prepare', label: 'nav.social.prepare' },
  ],
}

/** The items shown in the mobile bottom bar (the rest lives under "More"). */
export const MOBILE_TABS = ['', '/tasks', '/messages', '/calendar'] as const
