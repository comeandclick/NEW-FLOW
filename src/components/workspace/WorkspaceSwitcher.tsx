'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { workspacesService } from '@/services/workspaces.service'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Building2, ChevronDown, Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WorkspaceSwitcherProps {
  currentSlug: string
  currentName: string
}

interface WsEntry {
  id: string
  name: string
  slug: string
  plan: string
  userRole: string
}

export function WorkspaceSwitcher({ currentSlug, currentName }: WorkspaceSwitcherProps) {
  const router = useRouter()
  const { user } = useAuth()
  const [workspaces, setWorkspaces] = useState<WsEntry[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!user?.id || !open) return
    workspacesService.getForUser(user.id).then((list) => {
      setWorkspaces(list as unknown as WsEntry[])
    }).catch(() => {})
  }, [user?.id, open])

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-sm font-semibold max-w-[160px] truncate"
        >
          <span className="truncate">{currentName}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </Button>
      } />

      <DropdownMenuContent align="start" className="w-60">
        <p className="px-2 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          Mes espaces
        </p>

        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onClick={() => {
              setOpen(false)
              router.push(`/${ws.slug}`)
            }}
            className={cn(
              'flex items-center gap-2.5 cursor-pointer',
              ws.slug === currentSlug && 'bg-accent'
            )}
          >
            <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{ws.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{ws.userRole}</p>
            </div>
            {ws.slug === currentSlug && (
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
            )}
          </DropdownMenuItem>
        ))}

        {workspaces.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted-foreground text-center">
            Chargement…
          </div>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => {
            setOpen(false)
            router.push('/workspaces/new')
          }}
          className="gap-2.5 cursor-pointer"
        >
          <div className="h-6 w-6 rounded-md border-2 border-dashed flex items-center justify-center shrink-0">
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <span className="text-sm">Créer un nouvel espace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
