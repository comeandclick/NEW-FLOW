import {
  Bot, CalendarDays, CheckSquare, Clock, FileText, FolderKanban, FolderOpen, Gauge, Home, Lightbulb, MessageSquare, Repeat, Target, Trash2,
  Users, Video, Wallet, Workflow, Activity, ClipboardList, PenTool, type LucideIcon,
} from 'lucide-react'
import type { Key } from '@/i18n/dict'

export type NavItem = { href: string; label: Key; icon: LucideIcon; badge?: 'messages' }
export type NavGroup = { label?: Key; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    items: [
      { href: '', label: 'nav.home', icon: Home },
      { href: '/tasks', label: 'nav.tasks', icon: CheckSquare },
      { href: '/projects', label: 'nav.projects', icon: FolderKanban },
      { href: '/notes', label: 'nav.notes', icon: FileText },
      { href: '/docs', label: 'nav.docs', icon: Lightbulb },
      { href: '/calendar', label: 'nav.calendar', icon: CalendarDays },
      { href: '/messages', label: 'nav.messages', icon: MessageSquare, badge: 'messages' },
      { href: '/meetings', label: 'nav.meetings', icon: Video },
      { href: '/files', label: 'nav.files', icon: FolderOpen },
    ],
  },
  {
    label: 'nav.group.grow',
    items: [
      { href: '/goals', label: 'nav.goals', icon: Target },
      { href: '/crm', label: 'nav.crm', icon: Users },
      { href: '/finance', label: 'nav.finance', icon: Wallet },
      { href: '/automations', label: 'nav.automations', icon: Workflow },
      { href: '/forms', label: 'nav.forms', icon: ClipboardList },
      { href: '/whiteboard', label: 'nav.whiteboard', icon: PenTool },
    ],
  },
  {
    label: 'nav.group.personal',
    items: [
      { href: '/focus', label: 'nav.focus', icon: Clock },
      { href: '/habits', label: 'nav.habits', icon: Repeat },
      { href: '/ai', label: 'nav.ai', icon: Bot },
    ],
  },
  {
    label: 'nav.group.workspace',
    items: [
      { href: '/activity', label: 'nav.activity', icon: Activity },
      { href: '/trash', label: 'nav.trash', icon: Trash2 },
      { href: '/settings', label: 'nav.settings', icon: Gauge },
    ],
  },
]

/** The five items shown in the mobile bottom bar. */
export const MOBILE_TABS = ['', '/tasks', '/messages', '/calendar'] as const
