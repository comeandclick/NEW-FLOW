'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useUIStore } from '@/stores/uiStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useTaskStore } from '@/stores/taskStore'
import {
  CheckSquare, FileText, Calendar, MessageSquare, FolderOpen,
  Video, Settings, Plus, LayoutDashboard
} from 'lucide-react'

export function CommandPalette({ workspaceSlug }: { workspaceSlug: string }) {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore()
  const { workspaces } = useWorkspaceStore()
  const { tasks } = useTaskStore()
  const router = useRouter()

  const toggle = useCallback(() => setCommandPaletteOpen(!commandPaletteOpen), [commandPaletteOpen, setCommandPaletteOpen])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        toggle()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toggle])

  function navigate(path: string) {
    router.push(path)
    setCommandPaletteOpen(false)
  }

  const base = `/${workspaceSlug}`

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder="Rechercher ou naviguer…" />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>

        <CommandGroup heading="Naviguer">
          <CommandItem onSelect={() => navigate(base)}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Accueil
          </CommandItem>
          <CommandItem onSelect={() => navigate(`${base}/tasks`)}>
            <CheckSquare className="mr-2 h-4 w-4" />
            Tâches
          </CommandItem>
          <CommandItem onSelect={() => navigate(`${base}/notes`)}>
            <FileText className="mr-2 h-4 w-4" />
            Notes
          </CommandItem>
          <CommandItem onSelect={() => navigate(`${base}/calendar`)}>
            <Calendar className="mr-2 h-4 w-4" />
            Calendrier
          </CommandItem>
          <CommandItem onSelect={() => navigate(`${base}/messages`)}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Messages
          </CommandItem>
          <CommandItem onSelect={() => navigate(`${base}/files`)}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Fichiers
          </CommandItem>
          <CommandItem onSelect={() => navigate(`${base}/meetings`)}>
            <Video className="mr-2 h-4 w-4" />
            Réunions
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Créer">
          <CommandItem onSelect={() => { navigate(`${base}/tasks`); setCommandPaletteOpen(false) }}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle tâche
          </CommandItem>
          <CommandItem onSelect={() => { navigate(`${base}/notes`); setCommandPaletteOpen(false) }}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle note
          </CommandItem>
          <CommandItem onSelect={() => { navigate(`${base}/meetings`); setCommandPaletteOpen(false) }}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle réunion
          </CommandItem>
        </CommandGroup>

        {tasks.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Tâches récentes">
              {tasks.slice(0, 5).map((task) => (
                <CommandItem
                  key={task.id}
                  onSelect={() => navigate(`${base}/tasks/${task.id}`)}
                >
                  <CheckSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                  {task.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {workspaces.length > 1 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Changer d'espace">
              {workspaces.map((ws) => (
                <CommandItem
                  key={ws.id}
                  onSelect={() => navigate(`/${ws.slug}`)}
                >
                  <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
                  {ws.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
