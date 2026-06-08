'use client'

import { useEffect } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useWorkspace } from '@/hooks/useWorkspace'
import { useNotifications } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useRouter } from 'next/navigation'
import { Search, LayoutGrid } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher'

interface WorkspaceShellProps {
  workspaceSlug: string
  userId: string
  children: React.ReactNode
}

export function WorkspaceShell({ workspaceSlug, userId, children }: WorkspaceShellProps) {
  const router = useRouter()
  const { profile, signOut } = useAuth()
  const workspace = useWorkspace(workspaceSlug)
  const { unreadCount } = useNotifications(userId)
  const setCommandPaletteOpen = useUIStore(s => s.setCommandPaletteOpen)
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)

  useKeyboardShortcuts(workspaceSlug)

  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? (profile?.email?.[0]?.toUpperCase() ?? '?')

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <div className="hidden md:flex h-full shrink-0">
        <Sidebar workspaceSlug={workspaceSlug} />
      </div>

      {/* ── Main column ── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="flex h-11 items-center justify-between border-b border-border px-3 md:px-4 shrink-0 gap-2">
          {/* Mobile: workspace switcher */}
          <div className="md:hidden flex items-center gap-1 min-w-0">
            <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" />
            <WorkspaceSwitcher
              currentSlug={workspaceSlug}
              currentName={currentWorkspace?.name ?? 'Flow'}
            />
          </div>

          {/* Desktop: search */}
          <Button
            variant="ghost"
            size="sm"
            className="hidden md:flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm h-7 px-2"
            onClick={() => setCommandPaletteOpen(true)}
          >
            <Search className="h-3.5 w-3.5" />
            <span>Rechercher</span>
            <kbd className="inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] opacity-60">
              ⌘K
            </kbd>
          </Button>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Mobile search */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-8 w-8"
              onClick={() => setCommandPaletteOpen(true)}
            >
              <Search className="h-4 w-4" />
            </Button>

            <ThemeToggle />
            <NotificationBell userId={userId} />

            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={profile?.avatar_url ?? undefined} />
                    <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              } />
              <DropdownMenuContent align="end" className="w-52">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">{profile?.full_name ?? 'Utilisateur'}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push(`/${workspaceSlug}/settings/profile`)}>
                  Mon profil
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push(`/${workspaceSlug}/settings`)}>
                  Paramètres de l&apos;espace
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/workspaces')}>
                  Changer d&apos;espace
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={async () => { await signOut(); window.location.href = '/login' }}
                >
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>

        {/* ── Mobile bottom nav (hidden on desktop) ── */}
        <div className="md:hidden shrink-0">
          <MobileNav
            workspaceSlug={workspaceSlug}
            workspaceId={currentWorkspace?.id ?? ''}
          />
        </div>
      </div>

      <CommandPalette workspaceSlug={workspaceSlug} />
    </div>
  )
}
