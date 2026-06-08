'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/stores/uiStore'
import { notesService } from '@/services/notes.service'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { toast } from 'sonner'

export function useKeyboardShortcuts(workspaceSlug: string) {
  const router = useRouter()
  const { user } = useAuth()
  const setCommandPaletteOpen = useUIStore(s => s.setCommandPaletteOpen)
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const base = `/${workspaceSlug}`

  useEffect(() => {
    async function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable

      // ⌘K / Ctrl+K → command palette (always)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(true)
        return
      }

      // Skip single-key shortcuts while typing
      if (isTyping) return

      // G + key → Go to section (gmail-style)
      if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        switch (e.key) {
          case 'h': router.push(base); break
          case 't': router.push(`${base}/tasks`); break
          case 'n': router.push(`${base}/notes`); break
          case 'm': router.push(`${base}/messages`); break
          case 'c': router.push(`${base}/calendar`); break
          case 'f': router.push(`${base}/files`); break
          case 'r': router.push(`${base}/meetings`); break
        }
      }

      // ⌘N → new note
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        if (!currentWorkspace?.id || !user?.id) return
        try {
          const note = await notesService.create({
            workspace_id: currentWorkspace.id,
            title: 'Sans titre',
            created_by: user.id,
            content: {},
          })
          router.push(`${base}/notes/${note.id}`)
        } catch {
          toast.error('Impossible de créer la note')
        }
      }

      // ⌘T → go to tasks
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        router.push(`${base}/tasks`)
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [workspaceSlug, user?.id, currentWorkspace?.id]) // eslint-disable-line react-hooks/exhaustive-deps
}
