'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
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
import { tasksService } from '@/services/tasks.service'
import { notesService } from '@/services/notes.service'
import {
  CheckSquare, FileText, Calendar, MessageSquare, FolderOpen,
  Video, Settings, Plus, LayoutDashboard, Loader2
} from 'lucide-react'

type SearchResult = { id: string; title: string; type: 'task' | 'note'; icon?: string | null }

export function CommandPalette({ workspaceSlug }: { workspaceSlug: string }) {
  const commandPaletteOpen = useUIStore(s => s.commandPaletteOpen)
  const setCommandPaletteOpen = useUIStore(s => s.setCommandPaletteOpen)
  const workspaces = useWorkspaceStore(s => s.workspaces)
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const tasks = useTaskStore(s => s.tasks)
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggle = useCallback(() => setCommandPaletteOpen(!commandPaletteOpen), [commandPaletteOpen, setCommandPaletteOpen])

  // ⌘K toggle
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

  // Clear state on close
  useEffect(() => {
    if (!commandPaletteOpen) {
      setQuery('')
      setSearchResults([])
    }
  }, [commandPaletteOpen])

  // Debounced live search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.length < 2 || !currentWorkspace?.id) {
      setSearchResults([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const [taskResults, noteResults] = await Promise.all([
          tasksService.search(currentWorkspace.id, query),
          notesService.search(currentWorkspace.id, query),
        ])
        const combined: SearchResult[] = [
          ...taskResults.map(t => ({ id: t.id, title: t.title, type: 'task' as const })),
          ...noteResults.map(n => ({ id: n.id, title: n.title, type: 'note' as const, icon: n.icon })),
        ]
        setSearchResults(combined)
      } catch {
        // silently ignore search errors
      } finally {
        setSearching(false)
      }
    }, 250)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, currentWorkspace?.id])

  function navigate(path: string) {
    router.push(path)
    setCommandPaletteOpen(false)
  }

  const base = `/${workspaceSlug}`
  const showSearch = query.length >= 2
  const showDefault = query.length < 2

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput
        placeholder="Rechercher ou naviguer…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {showDefault && (
          <>
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
              <CommandItem onSelect={() => navigate(`${base}/tasks`)}>
                <Plus className="mr-2 h-4 w-4" />
                Nouvelle tâche
              </CommandItem>
              <CommandItem onSelect={() => navigate(`${base}/notes`)}>
                <Plus className="mr-2 h-4 w-4" />
                Nouvelle note
              </CommandItem>
              <CommandItem onSelect={() => navigate(`${base}/meetings`)}>
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
          </>
        )}

        {showSearch && (
          <>
            {searching ? (
              <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Recherche…
              </div>
            ) : searchResults.length === 0 ? (
              <CommandEmpty>Aucun résultat pour &ldquo;{query}&rdquo;.</CommandEmpty>
            ) : (
              <>
                {searchResults.filter(r => r.type === 'task').length > 0 && (
                  <CommandGroup heading="Tâches">
                    {searchResults.filter(r => r.type === 'task').map((r) => (
                      <CommandItem key={r.id} onSelect={() => navigate(`${base}/tasks/${r.id}`)}>
                        <CheckSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                        {r.title}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {searchResults.filter(r => r.type === 'note').length > 0 && (
                  <>
                    {searchResults.filter(r => r.type === 'task').length > 0 && <CommandSeparator />}
                    <CommandGroup heading="Notes">
                      {searchResults.filter(r => r.type === 'note').map((r) => (
                        <CommandItem key={r.id} onSelect={() => navigate(`${base}/notes/${r.id}`)}>
                          <FileText className="mr-2 h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {r.title}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
