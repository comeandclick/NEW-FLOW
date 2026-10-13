import { Archive, Bookmark, Bug, CalendarDays, CheckSquare, Clapperboard, Clock, Globe, Inbox, FileText, FolderOpen, Home, Lock, MessageSquare, Settings, Share2, Target, Users, type LucideIcon } from 'lucide-react'
import type { Key } from '@/i18n/dict'

export type NavItem = { href: string; label: Key; icon: LucideIcon; badge?: 'messages' | 'motion' | 'site'; /** other routes that keep this item highlighted */ also?: string[] }
export type NavGroup = { label?: Key; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    items: [
      { href: '', label: 'nav.home', icon: Home },
      { href: '/inbox', label: 'nav.inbox', icon: Inbox },
      { href: '/captures', label: 'nav.captures', icon: Bookmark },
      { href: '/tasks', label: 'nav.tasks', icon: CheckSquare, also: ['/projects', '/roadmap', '/team'] },
      { href: '/notes', label: 'nav.notes', icon: FileText, also: ['/whiteboard'] },
      { href: '/calendar', label: 'nav.calendar', icon: CalendarDays },
      { href: '/messages', label: 'nav.messages', icon: MessageSquare, badge: 'messages', also: ['/meetings'] },
      { href: '/files', label: 'nav.files', icon: FolderOpen },
    ],
  },
  {
    label: 'nav.group.grow',
    items: [
      { href: '/goals', label: 'nav.goals', icon: Target },
      { href: '/crm', label: 'nav.crm', icon: Users, also: ['/finance', '/forms'] },
    ],
  },
  {
    label: 'nav.group.product',
    items: [{ href: '/feedback', label: 'nav.feedback', icon: Bug, also: ['/releases', '/localization'] }],
  },
  {
    label: 'nav.group.studio',
    items: [
      { href: '/motion', label: 'nav.motion', icon: Clapperboard, badge: 'motion' },
      { href: '/site', label: 'nav.site', icon: Globe, badge: 'site' },
      { href: '/library', label: 'nav.library', icon: Archive },
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
    items: [{ href: '/focus', label: 'nav.focus', icon: Clock, also: ['/habits'] }],
  },
]

export const NAV_FOOTER: NavItem[] = [
  { href: '/me', label: 'perso.navLabel', icon: Lock },
  { href: '/settings', label: 'nav.settings', icon: Settings, also: ['/automations', '/activity', '/trash'] },
]

/** Sub-pages grouped under a parent entry; rendered as tabs at the top of each page. */
export const HUBS: Record<string, { href: string; label: Key }[]> = {
  tasks: [{ href: '/tasks', label: 'nav.tasks' }, { href: '/projects', label: 'nav.projects' }, { href: '/roadmap', label: 'nav.roadmap' }, { href: '/team', label: 'nav.team' }],
  product: [{ href: '/feedback', label: 'nav.feedback' }, { href: '/releases', label: 'nav.releases' }, { href: '/localization', label: 'nav.localization' }],
  notes: [{ href: '/notes', label: 'nav.notes' }, { href: '/whiteboard', label: 'nav.whiteboard' }],
  messages: [{ href: '/messages', label: 'nav.messages' }, { href: '/meetings', label: 'nav.meetings' }],
  crm: [{ href: '/crm', label: 'nav.crm' }, { href: '/finance', label: 'nav.finance' }, { href: '/forms', label: 'nav.forms' }],
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
