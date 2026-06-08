'use client'

import { use, useEffect, useState, useCallback } from 'react'
import { notesService } from '@/services/notes.service'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Pin, Archive, MoreHorizontal } from 'lucide-react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { Note } from '@/types/database'
import type { Json } from '@/types/database'

interface Props {
  params: Promise<{ workspace: string; noteId: string }>
}

export default function NoteDetailPage({ params }: Props) {
  const { workspace: slug, noteId } = use(params)
  const [note, setNote] = useState<Note | null>(null)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  useEffect(() => {
    notesService.getById(noteId).then((n) => {
      setNote(n as Note)
      setTitle(n.title)
    }).catch(() => toast.error('Note not found'))
  }, [noteId])

  const saveNote = useCallback(async (updates: Partial<Note>) => {
    if (!note) return
    setSaving(true)
    try {
      const updated = await notesService.update(note.id, updates)
      setNote(updated)
      setLastSaved(new Date())
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }, [note])

  async function handleTitleBlur() {
    if (!note || title === note.title) return
    await saveNote({ title })
  }

  async function handleContentChange(content: Json) {
    if (!note) return
    await saveNote({ content })
  }

  async function togglePin() {
    if (!note) return
    await saveNote({ is_pinned: !note.is_pinned })
    toast.success(note.is_pinned ? 'Note unpinned' : 'Note pinned')
  }

  async function archiveNote() {
    if (!note) return
    await saveNote({ is_archived: true })
    toast.success('Note archived')
  }

  if (!note) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/${slug}/notes`}>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1" />
        {saving ? (
          <span className="text-xs text-muted-foreground">Saving…</span>
        ) : lastSaved ? (
          <span className="text-xs text-muted-foreground">
            Saved {format(lastSaved, 'h:mm a')}
          </span>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>} />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={togglePin}>
              <Pin className="mr-2 h-4 w-4" />
              {note.is_pinned ? 'Unpin' : 'Pin note'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={archiveNote} className="text-destructive">
              <Archive className="mr-2 h-4 w-4" />
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-3xl">{note.icon ?? '📄'}</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            className="text-2xl font-bold border-none shadow-none focus-visible:ring-0 px-0 bg-transparent"
            placeholder="Untitled"
          />
        </div>
        <p className="text-xs text-muted-foreground ml-10">
          Last edited {format(new Date(note.updated_at), 'MMM d, yyyy · h:mm a')}
        </p>
      </div>

      <NoteEditor
        content={note.content}
        onChange={handleContentChange}
        className="mt-4"
      />
    </div>
  )
}
