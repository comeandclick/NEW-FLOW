'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { notesService } from '@/services/notes.service'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Pin, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import type { Note } from '@/types/database'
import Link from 'next/link'

interface Props {
  params: Promise<{ workspace: string }>
}

export default function NotesPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const { currentWorkspace } = useWorkspaceStore()
  const [notes, setNotes] = useState<Note[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentWorkspace?.id) return
    notesService
      .getByWorkspace(currentWorkspace.id)
      .then(setNotes)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [currentWorkspace?.id])

  async function createNote() {
    if (!currentWorkspace?.id || !user?.id) return
    try {
      const note = await notesService.create({
        workspace_id: currentWorkspace.id,
        title: 'Untitled',
        created_by: user.id,
        content: {},
      })
      router.push(`/${slug}/notes/${note.id}`)
    } catch {
      toast.error('Failed to create note')
    }
  }

  const filtered = notes.filter((n) =>
    n.title.toLowerCase().includes(search.toLowerCase())
  )

  const pinned = filtered.filter((n) => n.is_pinned)
  const rest = filtered.filter((n) => !n.is_pinned)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold">Notes</h1>
        <Button size="sm" className="h-7 gap-1 text-xs" onClick={createNote}>
          <Plus className="h-3.5 w-3.5" /> New note
        </Button>
      </div>

      <div className="px-6 py-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search notes…"
            className="pl-8 h-8 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {pinned.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Pin className="h-3 w-3" /> Pinned
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pinned.map((note) => <NoteCard key={note.id} note={note} slug={slug} />)}
            </div>
          </section>
        )}

        <section className="space-y-2">
          {pinned.length > 0 && (
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</h2>
          )}
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : rest.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No notes yet</p>
              <Button size="sm" onClick={createNote}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Create your first note
              </Button>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((note) => <NoteCard key={note.id} note={note} slug={slug} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function NoteCard({ note, slug }: { note: Note; slug: string }) {
  return (
    <Link href={`/${slug}/notes/${note.id}`}>
      <Card className="p-4 hover:bg-accent transition-colors cursor-pointer h-full space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-lg shrink-0">{note.icon ?? '📄'}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate">{note.title || 'Untitled'}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {format(new Date(note.updated_at), 'MMM d, yyyy')}
            </p>
          </div>
        </div>
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {note.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1.5">{tag}</Badge>
            ))}
          </div>
        )}
      </Card>
    </Link>
  )
}
