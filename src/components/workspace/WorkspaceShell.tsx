'use client'

import { useEffect } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
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
import { Search } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'

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

  const initials = profile?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?'

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar workspaceSlug={workspaceSlug} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-11 items-center justify-between border-b border-border px-4 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm h-7 px-2"
            onClick={() => setCommandPaletteOpen(true)}
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rechercher</span>
            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] opacity-60">
              ⌘K
            </kbd>
          </Button>

          <div className="flex items-center gap-2">
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
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{profile?.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push(`/${workspaceSlug}/settings`)}>
                  Paramètres
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
      </div>

      <CommandPalette workspaceSlug={workspaceSlug} />
    </div>
  )
}
