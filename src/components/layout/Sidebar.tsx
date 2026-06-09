'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useUIStore } from '@/stores/uiStore'
import {
  CheckSquare, FileText, Calendar, MessageSquare, FolderOpen,
  Video, Settings, ChevronLeft, ChevronRight, Plus,
  LayoutDashboard, Users, User, PenTool, Target, Briefcase,
  Zap, Network, Trash2, Activity, Star,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher'
import type { Project } from '@/types/database'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

function NavLink({ item, collapsed, workspaceSlug }: { item: NavItem; collapsed: boolean; workspaceSlug: string }) {
  const pathname = usePathname()
  const href = `/${workspaceSlug}${item.href}`
  // Exact match for home, prefix match for rest
  const active = item.href === '' ? pathname === href : pathname.startsWith(href)

  const link = (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
        'text-muted-foreground hover:text-foreground hover:bg-accent',
        active && 'bg-accent text-foreground font-medium'
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={link} />
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    )
  }

  return link
}

const CORE_NAV: NavItem[] = [
  { label: 'Accueil', href: '', icon: LayoutDashboard },
  { label: 'Tâches', href: '/tasks', icon: CheckSquare },
  { label: 'Notes', href: '/notes', icon: FileText },
  { label: 'Calendrier', href: '/calendar', icon: Calendar },
  { label: 'Messages', href: '/messages', icon: MessageSquare },
  { label: 'Fichiers', href: '/files', icon: FolderOpen },
  { label: 'Réunions', href: '/meetings', icon: Video },
]

const MODULE_NAV: NavItem[] = [
  { label: 'Tableau blanc', href: '/whiteboard', icon: PenTool },
  { label: 'Goals / OKR', href: '/goals', icon: Target },
  { label: 'CRM', href: '/crm', icon: Briefcase },
  { label: 'Automations', href: '/automations', icon: Zap },
  { label: 'Graphe', href: '/graph', icon: Network },
]

const BOTTOM_NAV: NavItem[] = [
  { label: 'Favoris', href: '/favorites', icon: Star },
  { label: 'Activité', href: '/activity', icon: Activity },
  { label: 'Corbeille', href: '/trash', icon: Trash2 },
  { label: 'Membres', href: '/settings/members', icon: Users },
  { label: 'Paramètres', href: '/settings', icon: Settings },
  { label: 'Profil', href: '/settings/profile', icon: User },
]

export function Sidebar({ workspaceSlug }: { workspaceSlug: string }) {
  const collapsed = useUIStore(s => s.sidebarCollapsed)
  const toggleSidebar = useUIStore(s => s.toggleSidebar)
  const projects = useWorkspaceStore(s => s.projects)
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const pathname = usePathname()

  return (
    <TooltipProvider delay={300}>
      <aside
        className={cn(
          'flex h-full flex-col border-r border-border bg-background transition-all duration-200',
          collapsed ? 'w-12' : 'w-56'
        )}
      >
        {/* Workspace header */}
        <div className={cn('flex items-center gap-1 px-2 py-2.5 border-b border-border', collapsed && 'justify-center px-1')}>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <WorkspaceSwitcher
                currentSlug={workspaceSlug}
                currentName={currentWorkspace?.name ?? 'Flow'}
              />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={toggleSidebar}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <ScrollArea className="flex-1 px-2 py-2">
          {/* Core nav */}
          <nav className="space-y-0.5">
            {CORE_NAV.map((item) => (
              <NavLink key={item.href} item={item} collapsed={collapsed} workspaceSlug={workspaceSlug} />
            ))}
          </nav>

          {/* Projects */}
          {!collapsed && projects.length > 0 && (
            <>
              <Separator className="my-3" />
              <div className="space-y-0.5">
                <div className="flex items-center justify-between px-2.5 mb-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Projets</span>
                  <Link href={`/${workspaceSlug}/projects`}>
                    <Button variant="ghost" size="icon" className="h-4 w-4">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
                {projects.map((project: Project) => {
                  const href = `/${workspaceSlug}/projects/${project.id}`
                  const active = pathname.startsWith(href)
                  return (
                    <Link
                      key={project.id}
                      href={href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                        'text-muted-foreground hover:text-foreground hover:bg-accent',
                        active && 'bg-accent text-foreground font-medium'
                      )}
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: project.color ?? '#6366f1' }}
                      />
                      <span className="truncate">{project.name}</span>
                    </Link>
                  )
                })}
              </div>
            </>
          )}

          {/* Modules */}
          <Separator className="my-3" />
          {!collapsed && (
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2.5 mb-1">Modules</p>
          )}
          <nav className="space-y-0.5">
            {MODULE_NAV.map((item) => (
              <NavLink key={item.href} item={item} collapsed={collapsed} workspaceSlug={workspaceSlug} />
            ))}
          </nav>
        </ScrollArea>

        {/* Bottom nav */}
        <div className={cn('border-t border-border px-2 py-2 space-y-0.5')}>
          {BOTTOM_NAV.map((item) => (
            <NavLink key={item.href} item={item} collapsed={collapsed} workspaceSlug={workspaceSlug} />
          ))}
        </div>
      </aside>
    </TooltipProvider>
  )
}
