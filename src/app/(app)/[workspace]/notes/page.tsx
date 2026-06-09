'use client'

import { use, useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { notesService } from '@/services/notes.service'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Search, Pin, FileText, Grid, List, Tag, X, Archive, SortAsc } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { toast } from 'sonner'
import type { Note } from '@/types/database'
import Link from 'next/link'
import { FavoriteButton } from '@/components/workspace/FavoriteButton'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  params: Promise<{ workspace: string }>
}

export default function NotesPage({ params }: Props) {
  const { workspace: slug } = use(params)
  const router = useRouter()
  const { user } = useAuth()
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [notes, setNotes] = useState<Note[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'title'>('updated')
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (!currentWorkspace?.id) return
    notesService.getByWorkspace(currentWorkspace.id)
      .then(data => {
        setNotes(data as Note[])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [currentWorkspace?.id])

  async function createNote() {
    if (!currentWorkspace?.id || !user?.id) return
    try {
      const note = await notesService.create({
        workspace_id: currentWorkspace.id,
        title: 'Sans titre',
        created_by: user.id,
        content: {},
      })
      router.push(`/${slug}/notes/${note.id}`)
    } catch {
      toast.error('Impossible de créer la note')
    }
  }

  // Collect all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>()
    notes.forEach(n => n.tags?.forEach(t => set.add(t)))
    return [...set].sort()
  }, [notes])

  const filtered = useMemo(() => {
    let out = notes.filter(n => !n.is_archived || showArchived)

    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(n => n.title.toLowerCase().includes(q))
    }
    if (filterTag) out = out.filter(n => n.tags?.includes(filterTag))

    out.sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title)
      if (sortBy === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
    return out
  }, [notes, search, filterTag, sortBy, showArchived])

  const pinned = filtered.filter(n => n.is_pinned)
  const rest = filtered.filter(n => !n.is_pinned)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Notes</h1>
          <p className="text-xs text-muted-foreground">{notes.filter(n => !n.is_archived).length} note{notes.length !== 1 ? 's' : ''}</p>
        </div>
        <Button size="sm" className="h-7 gap-1 text-xs" onClick={createNote}>
          <Plus className="h-3.5 w-3.5" /> Nouvelle note
        </Button>
      </div>

      {/* Search + filters */}
      <div className="px-6 py-3 border-b border-border space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Rechercher des notes…"
              className="pl-8 h-8 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setSearch('')}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Select value={sortBy} onValueChange={v => setSortBy((v ?? 'updated') as typeof sortBy)}>
            <SelectTrigger className="h-8 w-36 text-xs gap-1">
              <SortAsc className="h-3 w-3 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Récemment modifié</SelectItem>
              <SelectItem value="created">Date de création</SelectItem>
              <SelectItem value="title">Alphabétique</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center border border-border rounded-md p-0.5">
            <button
              className={cn('h-6 w-6 rounded flex items-center justify-center transition-colors', viewMode === 'grid' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setViewMode('grid')}
            ><Grid className="h-3.5 w-3.5" /></button>
            <button
              className={cn('h-6 w-6 rounded flex items-center justify-center transition-colors', viewMode === 'list' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setViewMode('list')}
            ><List className="h-3.5 w-3.5" /></button>
          </div>
        </div>

        {/* Tags filter */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
            <button
              className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors', !filterTag ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-accent')}
              onClick={() => setFilterTag(null)}
            >Tous</button>
            {allTags.map(tag => (
              <button
                key={tag}
                className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors', filterTag === tag ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-accent')}
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
              >{tag}</button>
            ))}
            <button
              className={cn('text-[10px] px-2 py-0.5 rounded-full border transition-colors ml-auto', showArchived ? 'bg-muted border-foreground/30 text-muted-foreground' : 'border-border hover:bg-accent text-muted-foreground')}
              onClick={() => setShowArchived(!showArchived)}
            >
              <Archive className="h-2.5 w-2.5 inline mr-0.5" />Archivées
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {pinned.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Pin className="h-3 w-3" /> Épinglées
            </h2>
            {viewMode === 'grid' ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pinned.map(note => <NoteCard key={note.id} note={note} slug={slug} />)}
              </div>
            ) : (
              <div className="space-y-1">
                {pinned.map(note => <NoteRow key={note.id} note={note} slug={slug} />)}
              </div>
            )}
          </section>
        )}

        <section className="space-y-2">
          {pinned.length > 0 && rest.length > 0 && (
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</h2>
          )}
          {loading ? (
            <div className={cn('gap-2', viewMode === 'grid' ? 'grid sm:grid-cols-2 lg:grid-cols-3' : 'space-y-1')}>
              {[...Array(6)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
            </div>
          ) : rest.length === 0 && pinned.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">{search ? 'Aucun résultat' : 'Aucune note'}</p>
              {!search && (
                <Button size="sm" onClick={createNote}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Créer ma première note
                </Button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rest.map(note => <NoteCard key={note.id} note={note} slug={slug} />)}
            </div>
          ) : (
            <div className="space-y-0.5">
              {rest.map(note => <NoteRow key={note.id} note={note} slug={slug} />)}
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
      <div className={cn(
        'p-4 rounded-xl border border-border hover:bg-accent/50 transition-colors cursor-pointer h-full space-y-2 group',
        note.is_archived && 'opacity-60'
      )}>
        <div className="flex items-start gap-2">
          <span className="text-xl shrink-0">{note.icon ?? '📄'}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-sm truncate leading-snug">{note.title || 'Sans titre'}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatDistanceToNow(new Date(note.updated_at), { addSuffix: true, locale: fr })}
            </p>
          </div>
          <span onClick={(e) => e.preventDefault()} className="opacity-0 group-hover:opacity-100 transition-opacity">
            <FavoriteButton
              entityType="note" entityId={note.id}
              entityTitle={note.title || 'Sans titre'}
              entityUrl={`/${slug}/notes/${note.id}`}
            />
          </span>
        </div>
        {(note.tags?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-1">
            {note.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="secondary" className="text-[9px] h-4 px-1.5">{tag}</Badge>
            ))}
            {note.tags.length > 3 && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1.5">+{note.tags.length - 3}</Badge>
            )}
          </div>
        )}
        {note.is_pinned && (
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <Pin className="h-2.5 w-2.5" /> Épinglée
          </div>
        )}
      </div>
    </Link>
  )
}

function NoteRow({ note, slug }: { note: Note; slug: string }) {
  return (
    <Link href={`/${slug}/notes/${note.id}`}>
      <div className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors cursor-pointer group',
        note.is_archived && 'opacity-60'
      )}>
        <span className="text-base shrink-0">{note.icon ?? '📄'}</span>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <p className="text-sm font-medium truncate">{note.title || 'Sans titre'}</p>
          {note.is_pinned && <Pin className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
          {(note.tags?.length ?? 0) > 0 && (
            <div className="flex gap-1 shrink-0">
              {note.tags.slice(0, 2).map(tag => (
                <Badge key={tag} variant="secondary" className="text-[9px] h-4 px-1.5">{tag}</Badge>
              ))}
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {format(new Date(note.updated_at), 'd MMM yyyy', { locale: fr })}
        </span>
        <span onClick={(e) => e.preventDefault()} className="opacity-0 group-hover:opacity-100 transition-opacity">
          <FavoriteButton
            entityType="note" entityId={note.id}
            entityTitle={note.title || 'Sans titre'}
            entityUrl={`/${slug}/notes/${note.id}`}
          />
        </span>
      </div>
    </Link>
  )
}
